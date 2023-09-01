import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";

import { Keyring } from "@polkadot/api";

import { ContractSourcecodeId, NamedAccountId, NamedAccounts, ScriptName } from "./types";
import {
  ContractConfiguration,
  ImportMap,
  LimitsConfig,
  NetworkConfig,
  parseConfigFile,
  RepositoryConfig,
  TestSuiteConfig,
} from "./parseConfig";
import { rawAddressesAreEqual } from "./helpers/addresses";
import { PromiseMutex } from "./helpers/promiseMutex";
import { Submitter } from "./api/api";
import { TestSuite } from "./commands/test";
import { DeployScript } from "./commands/deploy";

export type RepositoryInitialization = "npm" | "yarn";

export type Project = ReturnType<typeof initializeProject> extends Promise<infer T> ? T : never;

export async function initializeProject(relativeProjectPath: string, configFileName: string = "config.json") {
  console.log(`Load project in folder "${relativeProjectPath}"`);

  const projectFolder = join(process.cwd(), relativeProjectPath);
  const configFilePath = join(projectFolder, configFileName);
  const deployScriptsPath = join(projectFolder, "deploy");
  const testsPath = join(projectFolder, "test");

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

  const getNetworkDefinition = (networkName: string): NetworkConfig => {
    const networkConfig = configuration.networks[networkName];
    if (networkConfig === undefined)
      throw new Error(`Network ${networkName} does not exist in project ${relativeProjectPath}`);

    return networkConfig;
  };

  const getFullNamedAccount = async (
    networkName: string,
    namedAccountId: NamedAccountId,
    keyring: Keyring
  ): Promise<Submitter> => {
    const networkConfig = getNetworkDefinition(networkName);
    const namedAccountConfig = networkConfig.namedAccounts[namedAccountId];

    if (namedAccountConfig === undefined)
      throw new Error(
        `Named account ${namedAccountId} is not defined in the network definition for network ${networkName}`
      );

    const accountId = typeof namedAccountConfig === "string" ? namedAccountConfig : namedAccountConfig!.address;
    let suri = typeof namedAccountConfig === "string" ? undefined : namedAccountConfig!.suri;
    if (suri === undefined) {
      while (true) {
        const rl = readline.createInterface({ input, output });
        suri = (
          await rl.question(`Enter the secret key URI for named account "${namedAccountId}" (${accountId}): `)
        ).trim();
        rl.close();

        const keyRingPair = keyring.addFromUri(suri);
        const publicKey = keyring.addFromAddress(accountId);
        if (!rawAddressesAreEqual(keyRingPair.addressRaw, publicKey.addressRaw)) {
          console.log(`Invalid suri for address ${accountId}`);
        } else {
          break;
        }
      }
    }

    return {
      accountId,
      keypair: keyring.addFromUri(suri),
      mutex: new PromiseMutex(),
    };
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

    getNetworkDefinition,

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
      const entries = await readdir(deployScriptsPath, { recursive: true, withFileTypes: true });
      const fileNames = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name as ScriptName)
        .filter((fileName) => fileName !== configFileName);

      const scripts: [ScriptName, DeployScript][] = await Promise.all(
        fileNames.map(async (file) => {
          const path = join(deployScriptsPath, file);
          const imports: DeployScript = await import(path);
          return [file, imports];
        })
      );

      scripts.sort(([fileName1], [fileName2]) => (fileName1 < fileName2 ? -1 : fileName1 > fileName2 ? 1 : 0));

      return scripts;
    },

    async readTests(): Promise<{ testSuitConfig: TestSuiteConfig; testSuites: [ScriptName, TestSuite][] }> {
      const entries = await readdir(testsPath, { recursive: true, withFileTypes: true });
      const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

      const testSuites: [string, TestSuite][] = await Promise.all(
        fileNames.map(async (file) => {
          const path = join(testsPath, file);
          const imports: TestSuite = await import(path);
          return [file, imports];
        })
      );

      testSuites.sort(([fileName1], [fileName2]) => (fileName1 < fileName2 ? -1 : fileName1 > fileName2 ? 1 : 0));

      const testSuitConfig = configuration.tests;
      if (testSuitConfig === undefined)
        throw new Error(`No "tests" configuration entry in project ${relativeProjectPath}`);

      return {
        testSuitConfig,
        testSuites,
      };
    },

    getFullNamedAccount,

    async getAllNamedAccounts(networkName: string, keyring: Keyring): Promise<NamedAccounts> {
      const namedAccounts: NamedAccounts = {};
      const networkConfig = getNetworkDefinition(networkName);

      for (const key of Object.keys(networkConfig.namedAccounts) as NamedAccountId[]) {
        namedAccounts[key] = await getFullNamedAccount(networkName, key, keyring);
      }

      return namedAccounts;
    },
  };
}
