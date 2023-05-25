import { join } from "path";
import { readdir } from "node:fs/promises";

import {
  ArgumentType,
  DeployScript,
  Deployment,
  DeploymentArguments,
  DeploymentsExtension,
  NamedAccounts,
  Network,
  TxOptions,
  WasmDeployEnvironment,
} from "./types";
import { deployContract, executeContractFunction } from "./implementations";
export { WasmDeployEnvironment } from "./types";

async function scanProjectDir(projectDir: string): Promise<[string, DeployScript][]> {
  console.log(`Scan project in folder "${projectDir}"`);

  const entries = await readdir(projectDir, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  return Promise.all(
    files.map(async (file) => {
      const path = join(projectDir, file);
      const imports = await import(path);
      return [file, imports];
    })
  );
}

interface DeploymentRecord {
  completed: boolean;
  promise: Promise<Deployment>;
  resolver(deployment: Deployment): void;
}

async function processScripts(
  scripts: [string, DeployScript][],
  getNamedAccounts: () => Promise<NamedAccounts>,
  network: Network
) {
  const deployments: Record<string, DeploymentRecord> = {};
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

  const checkStuckState = () => {
    const seemsToBeStuck = Array.from(scriptsRunning).every((scriptName) => {
      return Array.from(scriptsWaiting[scriptName] ?? []).some((contractName) => {
        return !deployments[contractName]?.completed;
      });
    });

    if (!seemsToBeStuck) {
      return;
    }

    console.log("Looks like all scripts are stuck waiting. It could be that there are cyclic dependencies.");

    Array.from(scriptsRunning).forEach((scriptName) => {
      console.log(`Script "${scriptName}" is waiting for the following contracts to be deployed:`);
      return Array.from(scriptsWaiting[scriptName] ?? []).forEach((contractName) => {
        if (!deployments[contractName]?.completed) {
          console.log(`   "${contractName}"`);
        }
      });
    });

    console.log("You might need to terminate this application.");
  };

  const getOrNull = async (scriptName: string, name: string): Promise<boolean> => {
    return deployments[name]?.completed ?? false;
  };

  const deploy = async (scriptName: string, contractName: string, args: DeploymentArguments) => {
    console.log(`${scriptName}: Deploy contract "${contractName}"`);
    const deployment = await deployContract(contractName, args);
    console.log(`${scriptName}: Contract "${contractName}" deployed to address ${deployment.address}`);

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

    console.log(`${scriptName}: Execute function "${functionName}" in contract "${contractName}"`);
    executeContractFunction(contract, tx, functionName, rest);
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
  const scripts = await scanProjectDir(join(__dirname, "..", file));

  const getNamedAccounts = async function (): Promise<NamedAccounts> {
    return { deployer: "0x000abc" };
  };

  const network = { name: "foucoco" };

  await processScripts(scripts, getNamedAccounts, network);
}

main();
