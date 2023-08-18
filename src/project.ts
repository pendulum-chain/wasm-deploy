import { join } from "node:path";
import { createHmac } from "node:crypto";
import { readdir } from "node:fs/promises";

import { ContractSourcecodeId, DeployScript, NamedAccountId, ScriptName } from "./types";

export interface ContractSourceReference {
  git: string;
  path: string;
  branch: string;
}

export interface ConfigFile {
  contracts: Record<ContractSourcecodeId, ContractSourceReference>;
  importpaths: string[];
  networks: Record<string, NetworkConfig>;
  buildFolder: string;
  limits: LimitsConfig;
}

export interface NetworkConfig {
  namedAccounts: Record<NamedAccountId, NamedAccountConfig>;
  rpcUrl: string;
}

export type NamedAccountConfig =
  | string
  | {
      address: string;
      suri?: string;
    };

export interface LimitsConfig {
  gas: {
    refTime: number | string;
    proofSize: number | string;
  };
  storageDeposit?: number | string | null;
}

function getGitCloneName({ branch, git }: ContractSourceReference) {
  const hashMaterial = `${git} -> ${branch}`;
  const hash = createHmac("sha256", hashMaterial).update("I love cupcakes").digest("hex");

  return hash.slice(0, 20);
}

export type Project = ReturnType<typeof initializeProject> extends Promise<infer T> ? T : never;

export async function initializeProject(relativeProjectPath: string, configFileName: string = "config.json") {
  console.log(`Load project in folder "${relativeProjectPath}"`);

  const projectFolder = join(process.cwd(), relativeProjectPath);
  const configFilePath = join(projectFolder, configFileName);

  const configFile: ConfigFile = await import(configFilePath);
  const buildFolder = join(projectFolder, configFile.buildFolder);
  const gitFolder = join(buildFolder, "git");
  const importpaths = (configFile.importpaths ?? []).map((importpath) => join(projectFolder, importpath));

  const getContractSourceReference = (contractId: ContractSourcecodeId): ContractSourceReference => {
    const contractSource = configFile.contracts[contractId];
    if (contractSource === undefined)
      throw new Error(`Contract ${contractId} does not exist in project ${relativeProjectPath}`);

    return contractSource;
  };

  const getGitCloneFolder = (contractId: ContractSourcecodeId): string => {
    const contractSource = getContractSourceReference(contractId);
    return join(gitFolder, getGitCloneName(contractSource));
  };

  return {
    getBuildFolder() {
      return buildFolder;
    },

    getGitFolder() {
      return gitFolder;
    },

    getContracts(): ContractSourcecodeId[] {
      return Object.keys(configFile.contracts);
    },

    getGitCloneFolder,

    getContractSourceReference,

    getImportPaths(): string[] {
      return importpaths;
    },

    getLimits(): LimitsConfig {
      return configFile.limits;
    },

    getNetworkDefinition(networkName: string): NetworkConfig {
      const networkConfig = configFile.networks[networkName];
      if (networkConfig === undefined)
        throw new Error(`Network ${networkName} does not exist in project ${relativeProjectPath}`);

      return networkConfig;
    },

    getContractSourcePath(contractId: ContractSourcecodeId): string {
      const contractSource = getContractSourceReference(contractId);
      return join(getGitCloneFolder(contractId), contractSource.path);
    },

    async readDeploymentScripts(): Promise<[ScriptName, DeployScript][]> {
      const entries = await readdir(projectFolder, { recursive: true, withFileTypes: true });
      const fileNames = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name as ScriptName)
        .filter((fileName) => fileName !== configFileName);

      const scripts: [ScriptName, DeployScript][] = await Promise.all(
        fileNames.map(async (file) => {
          const path = join(projectFolder, file);
          const imports: DeployScript = await import(path);
          return [file, imports];
        })
      );

      scripts.sort(([fileName1], [fileName2]) => (fileName1 < fileName2 ? -1 : fileName1 > fileName2 ? 1 : 0));

      return scripts;
    },
  };
}
