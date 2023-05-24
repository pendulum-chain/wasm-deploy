import { join } from "path";
import { readdir } from "node:fs/promises";

import {
  DeployScript,
  Deployment,
  DeploymentArguments,
  DeploymentsExtension,
  NamedAccounts,
  TxOptions,
  WasmDeployEnvironment,
} from "./types";
import { deployContract, executeContractFunction } from "./implementations";
export { WasmDeployEnvironment } from "./types";

async function scanProjectDir(projectDir: string): Promise<[string, DeployScript][]> {
  console.log("Scan project in folder", projectDir);

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

async function main() {
  const file = process.argv[2];
  const projects = await scanProjectDir(join(__dirname, "..", file));

  const deploymentPromises: Record<string, Promise<Deployment>> = {};
  const deploymentResolvers: Record<string, (deployment: Deployment) => void> = {};

  const deployments: DeploymentsExtension = {
    async getOrNull(name: string) {
      return deploymentPromises[name] !== undefined;
    },

    async deploy(name: string, args: DeploymentArguments) {
      console.log("Deploy contract", name);
      const deployment = await deployContract(name, args);
      console.log("Contract", name, "deployed to address", deployment.address);

      if (deploymentResolvers[name] === undefined) {
        deploymentPromises[name] = new Promise<Deployment>((resolve) => {
          deploymentResolvers[name] = resolve;
        });
      }

      deploymentResolvers[name](deployment);

      console.log("Deploy contract", name, "completed");
      return deployment;
    },

    get(name: string) {
      if (deploymentPromises[name] === undefined) {
        deploymentPromises[name] = new Promise<Deployment>((resolve) => {
          deploymentResolvers[name] = resolve;
        });
      }

      return deploymentPromises[name];
    },

    async execute(name: string, tx: TxOptions, functionName: string, ...rest: any[]) {
      executeContractFunction(name, tx, functionName, rest);
    },
  };

  const getNamedAccounts = async function (): Promise<NamedAccounts> {
    return { deployer: "0x000abc" };
  };

  const environment: WasmDeployEnvironment = {
    getNamedAccounts,
    deployments,
    network: { name: "foucoco" },
  };

  await Promise.all(
    projects.map(async ([fileName, script]) => {
      if (script.default.skip !== undefined && (await script.default.skip(environment))) {
        console.log("Skip execution of file", fileName);
        return;
      }

      await script.default(environment);
    })
  );
}

main();
