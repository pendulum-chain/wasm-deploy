import { join } from "node:path";
import { readdir } from "node:fs/promises";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { cryptoWaitReady } from "@polkadot/util-crypto";

import {
  ConfigFile,
  DeployScript,
  Deployment,
  DeploymentArguments,
  DeploymentsExtension,
  NamedAccounts,
  Network,
  TxOptions,
  WasmDeployEnvironment,
} from "./types";
import { PromiseMutex } from "./helpers/promiseMutex";
import { ChainApi, connectToChain } from "./api";
import { compileContract } from "./actions/compileContract";
import { createAnimatedTextContext, StyledText } from "./helpers/terminal";
import { WeightV2 } from "@polkadot/types/interfaces";
export { WasmDeployEnvironment } from "./types";

async function scanProjectDir(
  projectDir: string
): Promise<{ scripts: [string, DeployScript][]; configFile: ConfigFile }> {
  console.log(`Scan project in folder "${projectDir}"`);

  const entries = await readdir(projectDir, { recursive: true, withFileTypes: true });
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  const files: [string, any][] = await Promise.all(
    fileNames.map(async (file) => {
      const path = join(projectDir, file);
      const imports = await import(path);
      return [file, imports];
    })
  );

  const scripts: [string, DeployScript][] = [];
  let configFile: ConfigFile | undefined = undefined;

  for (const pair of files) {
    const [fileName, imports] = pair;
    if (fileName === "config.json") {
      configFile = imports as ConfigFile;
    } else {
      scripts.push([fileName, imports]);
    }
  }

  if (configFile === undefined) {
    throw new Error("No config.json file found in project directory");
  }

  for (const contractName of Object.keys(configFile.contracts)) {
    configFile.contracts[contractName] = join(projectDir, configFile.contracts[contractName]);
  }

  return { scripts, configFile };
}

export type DeploymentState =
  | "pending"
  | "compiling"
  | "compiled"
  | "optimizing"
  | "optimized"
  | "deploying"
  | "deployed"
  | "failure";

interface DeploymentRecord {
  completed: boolean;
  promise: Promise<Deployment>;
  resolver(deployment: Deployment): void;
}

interface DeploymentStatus {
  scriptName: string;
  contractFileName: string;
  state: DeploymentState;
  address?: string;
  failure?: string;
  transactionFee?: bigint;
}

export type ExecutionState = "pending" | "dry running" | "gas estimated" | "submitting" | "success" | "failure";

interface ExecutionStatus {
  functionName: string;
  scriptName: string;
  state: ExecutionState;
  gasRequired?: WeightV2;
  transactionFee?: bigint;
  transactionResult?: string;
  failure?: string;
}

async function processScripts(
  scripts: [string, DeployScript][],
  getNamedAccounts: () => Promise<NamedAccounts>,
  network: Network,
  configFile: ConfigFile,
  chainApi: ChainApi,
  updateText: (newLines: StyledText[]) => void
) {
  const deployments: Record<string, DeploymentRecord> = {};
  const deploymentStatus: Record<string, DeploymentStatus> = {};
  const contractOrder: string[] = [];
  const executionStatus: Record<string, ExecutionStatus[]> = {};

  const compiledContracts: Record<string, Promise<string>> = {};
  const scriptsRunning: Set<string> = new Set();
  const scriptsWaiting: Record<string, Set<string>> = {};

  const addDeploymentRecord = (contractName: string) => {
    if (deployments[contractName] !== undefined) {
      return;
    }

    let resolver: (deployment: Deployment) => void = () => {};

    const promise = new Promise<Deployment>((resolve) => {
      const innerResolver = (deployment: Deployment) => {
        deployments[contractName].completed = true;
        resolve(deployment);
      };

      resolver = innerResolver;
    });

    deployments[contractName] = {
      completed: false,
      promise,
      resolver,
    };
  };

  const updateDisplayedStatus = () => {
    const styledTexts: StyledText[] = [];
    for (const contractName of contractOrder) {
      const { scriptName, contractFileName, state, address, failure } = deploymentStatus[contractName];
      styledTexts.push([
        { text: "📝 " },
        { text: contractName, color: "blue" },
        { text: ` (source: ${contractFileName}, script: ${scriptName})` },
        {
          text: ` ${failure ?? state}`,
          color: state === "deployed" ? "green" : state === "failure" ? "red" : "yellow",
          spinning: state === "compiling" || state === "optimizing" || state === "deploying",
        },
        ...(address !== undefined ? [{ text: ` to ${address}`, color: "green" as "green" }] : []),
      ]);

      const thisExecutionStatus = executionStatus[contractName];
      if (thisExecutionStatus) {
        for (const execution of thisExecutionStatus) {
          const { functionName, scriptName, state, gasRequired, transactionResult, failure } = execution;

          styledTexts.push([
            { text: "    🛠️ " },
            { text: functionName, color: "blue" },
            { text: ` (script: ${scriptName})` },
            ...(gasRequired !== undefined ? [{ text: ` (gas required: ${gasRequired.refTime.toHuman()})` }] : []),
            {
              text: ` ${failure ?? state}`,
              color: state === "success" ? "green" : state === "failure" ? "red" : "yellow",
              spinning: state === "dry running" || state === "submitting",
            },
            ...(transactionResult !== undefined ? [{ text: `, result: ${transactionResult}` }] : []),
          ]);
        }
      }
    }
    updateText(styledTexts);
  };

  const checkStuckState = () => {
    const seemsToBeStuck =
      scriptsRunning.size > 0 &&
      Array.from(scriptsRunning).every((scriptName) => {
        return Array.from(scriptsWaiting[scriptName] ?? []).some((contractName) => {
          return !deployments[contractName]?.completed;
        });
      });

    if (!seemsToBeStuck) {
      return;
    }

    console.log("\nIt seems like all scripts are stuck waiting and cannot complete. Are there cyclic dependencies?");

    Array.from(scriptsRunning).forEach((scriptName) => {
      console.log(`Script "${scriptName}" is waiting for the following contracts to be deployed:`);
      return Array.from(scriptsWaiting[scriptName] ?? []).forEach((contractName) => {
        if (!deployments[contractName]?.completed) {
          console.log(`  - ${contractName}`);
        }
      });
    });
  };

  const getOrNull = async (scriptName: string, name: string): Promise<boolean> => {
    return deployments[name]?.completed ?? false;
  };

  const deploy = async (scriptName: string, contractName: string, args: DeploymentArguments) => {
    contractOrder.push(contractName);
    deploymentStatus[contractName] = {
      contractFileName: args.contract,
      scriptName,
      state: "pending",
    };

    updateDisplayedStatus();

    const updateContractStatus = (status: DeploymentState) => {
      deploymentStatus[contractName].state = status;
      updateDisplayedStatus();
    };

    const compiledContractFileName = await compileContract(args, configFile, compiledContracts, updateContractStatus);
    const { result, transactionFee } = await chainApi.instantiateWithCode(
      compiledContractFileName,
      args,
      configFile,
      updateContractStatus
    );

    deploymentStatus[contractName].transactionFee = transactionFee;
    if (result.type === "error") {
      deploymentStatus[contractName].failure = result.error;
      updateContractStatus("failure");

      throw new Error(`An error occurred deploying contract ${contractName}`);
    }

    const deployment: Deployment = {
      address: result.value,
      compiledContractFileName,
    };
    deploymentStatus[contractName].address = result.value;
    updateContractStatus("deployed");

    addDeploymentRecord(contractName);
    deployments[contractName].resolver(deployment);
    return deployment;
  };

  const get = async (scriptName: string, contractName: string) => {
    addDeploymentRecord(contractName);

    if (!deployments[contractName].completed) {
      if (scriptsWaiting[scriptName] === undefined) {
        scriptsWaiting[scriptName] = new Set();
      }
      scriptsWaiting[scriptName].add(contractName);
    }

    checkStuckState();
    const deployment = await deployments[contractName].promise;
    if (scriptsWaiting[scriptName] !== undefined) {
      scriptsWaiting[scriptName].delete(contractName);
    }
    return deployment;
  };

  const execute = async (
    scriptName: string,
    contractName: string,
    tx: TxOptions,
    functionName: string,
    ...rest: any[]
  ) => {
    const contract = await get(scriptName, contractName);
    if (executionStatus[contractName] === undefined) {
      executionStatus[contractName] = [];
    }

    executionStatus[contractName].push({
      functionName,
      scriptName,
      state: "pending",
    });

    const thisExecutionStatus = executionStatus[contractName][executionStatus[contractName].length - 1];

    const updateExecutionStatus = (state: ExecutionState, gasRequired?: WeightV2) => {
      thisExecutionStatus.state = state;

      if (gasRequired !== undefined) {
        thisExecutionStatus.gasRequired = gasRequired;
      }

      updateDisplayedStatus();
    };

    const { result, transactionFee } = await chainApi.executeContractFunction(
      contract,
      tx,
      functionName,
      configFile,
      updateExecutionStatus,
      ...rest
    );

    thisExecutionStatus.transactionFee = transactionFee;
    if (result.type === "error") {
      thisExecutionStatus.failure = result.error;
      updateExecutionStatus("failure", undefined);
    } else {
      updateExecutionStatus("success", undefined);
    }
  };

  scripts.forEach(([scriptName, _]) => {
    scriptsRunning.add(scriptName);
  });

  await Promise.all(
    scripts.map(async ([scriptName, script]) => {
      const deploymentsForScript: DeploymentsExtension = {
        getOrNull: getOrNull.bind(null, scriptName),
        deploy: deploy.bind(null, scriptName),
        get: get.bind(null, scriptName),
        execute: execute.bind(null, scriptName),
      };

      const environmentForScript: WasmDeployEnvironment = {
        getNamedAccounts,
        deployments: deploymentsForScript,
        network,
      };

      if (script.default.skip !== undefined && (await script.default.skip(environmentForScript))) {
        console.log(`Skip execution of script "${scriptName}"`);
        scriptsRunning.delete(scriptName);
        checkStuckState();
        return;
      }

      await script.default(environmentForScript);
      scriptsRunning.delete(scriptName);

      checkStuckState();
    })
  );
}

async function main() {
  const file = process.argv[2];
  const { scripts, configFile } = await scanProjectDir(join(__dirname, "..", file));

  const networkName = process.argv[3];
  const network = { name: networkName };

  const { networks } = configFile;
  if (networks[networkName] === undefined) {
    throw new Error(`Unknown network name ${networkName}`);
  }

  const networkConfig = networks[networkName];

  await cryptoWaitReady();
  const chainApi = await connectToChain(networkConfig.rpcUrl);

  const namedAccounts: NamedAccounts = {};
  for (const key of Object.keys(networkConfig.namedAccounts)) {
    const accountId = networkConfig.namedAccounts[key];
    const rl = readline.createInterface({ input, output });
    const suri = (await rl.question(`Enter the secret key URI for named account "${key}" (${accountId}): `)).trim();
    rl.close();

    namedAccounts[key] = {
      accountId,
      suri,
      keypair: chainApi.getKeyring().addFromUri(suri),
      mutex: new PromiseMutex(),
    };
  }

  const getNamedAccounts = async function (): Promise<NamedAccounts> {
    return namedAccounts;
  };

  await createAnimatedTextContext(async (updateText) => {
    await processScripts(scripts, getNamedAccounts, network, configFile, chainApi, updateText);
  });

  console.log("Deployment successful!");
  process.exit();
}

main();
