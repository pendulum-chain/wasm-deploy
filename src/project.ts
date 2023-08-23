import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";

import { ContractSourcecodeId, DeployScript, ScriptName } from "./types";
import {
  ContractConfiguration,
  ImportMap,
  LimitsConfig,
  NetworkConfig,
  parseConfigFile,
  RepositoryConfig,
} from "./parseConfig";
import { isFailure, isSuccess } from "fefe";

export type RepositoryInitialization = "npm" | "yarn";

export type Project = ReturnType<typeof initializeProject> extends Promise<infer T> ? T : never;

export async function initializeProject(relativeProjectPath: string, configFileName: string = "config.json") {
  console.log(`Load project in folder "${relativeProjectPath}"`);

  const projectFolder = join(process.cwd(), relativeProjectPath);
  const configFilePath = join(projectFolder, configFileName);

  const configFileContent = (await readFile(configFilePath)).toString("utf-8");
  const configuration = parseConfigFile(configFileContent);

  const buildFolder = join(projectFolder, configuration.buildFolder);
  const gitFolder = join(buildFolder, "git");
  const tempFolder = join(buildFolder, "temp");

  const getContractConfiguration = (contractId: ContractSourcecodeId): ContractConfiguration => {
    const contractSource = configuration.contracts[contractId];
    if (contractSource === undefined)
      throw new Error(`Contract ${contractId} does not exist in project ${relativeProjectPath}`);

    return contractSource;
  };

  const getGitCloneFolder = (contractId: ContractSourcecodeId): string => {
    const contractSource = getContractConfiguration(contractId);
    return join(gitFolder, contractSource.repository);
  };

  const getRepositoryConfig = (contractId: string): RepositoryConfig => {
    const { repository } = getContractConfiguration(contractId);
    const repositoryConfig = configuration.repositories[repository];
    if (repositoryConfig === undefined)
      throw new Error(`Repository ${repository} does not exist in project ${relativeProjectPath}`);

    return repositoryConfig;
  };

  return {
    getBuildFolder() {
      return buildFolder;
    },

    getGitFolder() {
      return gitFolder;
    },

    getTempFolder() {
      return tempFolder;
    },

    getContracts(): ContractSourcecodeId[] {
      return Object.keys(configuration.contracts);
    },

    getGitCloneFolder,

    getContractConfiguration,

    getRepositoryConfig,

    getLimits(): LimitsConfig {
      return configuration.limits;
    },

    getNetworkDefinition(networkName: string): NetworkConfig {
      const networkConfig = configuration.networks[networkName];
      if (networkConfig === undefined)
        throw new Error(`Network ${networkName} does not exist in project ${relativeProjectPath}`);

      return networkConfig;
    },

    getImportPaths(contractId: string): string[] {
      let importpaths: string[] = [];

      const contractConfig = getContractConfiguration(contractId);
      if (contractConfig.importpaths !== undefined) {
        importpaths = contractConfig.importpaths;
      } else {
        const repositoryConfig = getRepositoryConfig(contractId);
        if (repositoryConfig.importpaths !== undefined) {
          importpaths = repositoryConfig.importpaths;
        }
      }

      const gitCloneFolder = getGitCloneFolder(contractId);
      return importpaths.map((importpath) => join(gitCloneFolder, importpath));
    },

    getImportMaps(contractId: string): ImportMap[] {
      let importmaps: ImportMap[] = [];

      const contractConfig = getContractConfiguration(contractId);
      if (contractConfig.importmaps !== undefined) {
        importmaps = contractConfig.importmaps;
      } else {
        const repositoryConfig = getRepositoryConfig(contractId);
        if (repositoryConfig.importmaps !== undefined) {
          importmaps = repositoryConfig.importmaps;
        }
      }

      const gitCloneFolder = getGitCloneFolder(contractId);
      return importmaps.map((importmap) => ({ ...importmap, to: join(gitCloneFolder, importmap.to) }));
    },

    getContractSourcePath(contractId: ContractSourcecodeId): string {
      const contractSource = getContractConfiguration(contractId);
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
