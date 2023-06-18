import { WeightV2 } from "@polkadot/types/interfaces";

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

import { ChainApi } from "./api";
import { StyledText } from "./helpers/terminal";
import { DependencySystem } from "./helpers/dependencySystem";
import { compileContract } from "./actions/compileContract";

export type DeploymentState =
  | "pending"
  | "compiling"
  | "compiled"
  | "optimizing"
  | "optimized"
  | "deploying"
  | "deployed"
  | "failure";

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
  const deploymentStatus: Record<string, DeploymentStatus> = {};
  const contractOrder: string[] = [];
  const executionStatus: Record<string, ExecutionStatus[]> = {};
  const compiledContracts: Record<string, Promise<string>> = {};
  let stuckMessage: string | undefined = undefined;

  const scriptDependencies = new DependencySystem<Deployment>((waitingTasks) => {
    if (waitingTasks === undefined) {
      stuckMessage = undefined;
    } else {
      let stuckMessage =
        "It seems like all scripts are stuck waiting and cannot complete. Are there cyclic dependencies?";

      stuckMessage += Object.entries(waitingTasks)
        .map(
          ([scriptName, contracts]) =>
            `Script "${scriptName}" is waiting for the following contracts to be deployed:` +
            contracts.map((contractName) => `  - ${contractName}`).join("\n")
        )
        .join("\n");
    }

    updateDisplayedStatus();
  });

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

    if (stuckMessage !== undefined) {
      styledTexts.push([{ text: stuckMessage, color: "red" }]);
    }

    updateText(styledTexts);
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

    scriptDependencies.provide(contractName, deployment);
    return deployment;
  };

  const execute = async (
    scriptName: string,
    contractName: string,
    tx: TxOptions,
    functionName: string,
    ...rest: any[]
  ) => {
    const contract = await scriptDependencies.get(scriptName, contractName);
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
    scriptDependencies.registerTask(scriptName);
  });

  await Promise.all(
    scripts.map(async ([scriptName, script]) => {
      const deploymentsForScript: DeploymentsExtension = {
        getOrNull: (contractName: string) => scriptDependencies.getOrNull(contractName),
        get: (contractName: string) => scriptDependencies.get(scriptName, contractName),
        deploy: deploy.bind(null, scriptName),
        execute: execute.bind(null, scriptName),
      };

      const environmentForScript: WasmDeployEnvironment = {
        getNamedAccounts,
        deployments: deploymentsForScript,
        network,
      };

      if (script.default.skip !== undefined && (await script.default.skip(environmentForScript))) {
        scriptDependencies.removeTask(scriptName);
        return;
      }

      await script.default(environmentForScript);
      scriptDependencies.removeTask(scriptName);
    })
  );
}
