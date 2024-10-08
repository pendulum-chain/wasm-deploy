import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { Dirent } from "node:fs";
import prompts from "prompts";
import { Keyring } from "@polkadot/api";

import { ContractSourcecodeId, NamedAccountId, ScriptName } from "./types";
import {
  ContractConfiguration,
  ImportMap,
  LimitsConfig,
  NetworkConfig,
  parseConfigFile,
  RepositoryConfig,
  TestSuiteConfig,
} from "./parseConfig";
import { rawAddressesAreEqual } from "./utils/addresses";
import { PromiseMutex } from "./utils/promiseMutex";
import { TestSuite } from "./commands/test";
import { DeployScript } from "./commands/deploy";
import { SigningSubmitter } from "./api/submitter";

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
    if (contractSource.repository === undefined) {
      return projectFolder;
    }

    return join(gitFolder, contractSource.repository);
  };

  const getRepositoryConfig = (contractId: string): RepositoryConfig | undefined => {
    const { repository } = getContractConfiguration(contractId);
    if (repository === undefined) {
      return undefined;
    }

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

  const getSigningSubmitter = async (
    networkName: string,
    namedAccountId: NamedAccountId,
    keyring: Keyring
  ): Promise<SigningSubmitter> => {
    const networkConfig = getNetworkDefinition(networkName);
    const namedAccountConfig = networkConfig.namedAccounts[namedAccountId];

    if (namedAccountConfig === undefined)
      throw new Error(
        `Named account ${namedAccountId} is not defined in the network definition for network ${networkName}`
      );

    const accountId = typeof namedAccountConfig === "string" ? namedAccountConfig : namedAccountConfig.address;
    let suri = typeof namedAccountConfig === "string" ? undefined : namedAccountConfig.suri;
    if (suri === undefined) {
      while (true /* eslint-disable-line no-constant-condition */) {
        try {
          const answers = await prompts<"value">({
            type: "password",
            name: "value",
            message: `Enter the secret key URI for named account "${namedAccountId}" (${accountId}): `,
          });

          if (typeof answers.value !== "string") {
            throw new Error("Invalid input");
          }

          suri = answers.value;
        } catch (error) {
          // Graceful exit here
          process.exit();
        }

        if (suri === undefined) {
          console.log(`Invalid suri for address ${accountId}`);
          continue;
        }

        suri = suri.trim();

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
      type: "signing",
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
        if (repositoryConfig?.importpaths !== undefined) {
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
        if (repositoryConfig?.importmaps !== undefined) {
          importmaps = repositoryConfig.importmaps;
        }
      }

      const gitCloneFolder = getGitCloneFolder(contractId);
      return importmaps.map((importmap) => ({ ...importmap, to: join(gitCloneFolder, importmap.to) }));
    },

    getContractSourcePath(contractId: ContractSourcecodeId): string {
      const contractConfiguration = getContractConfiguration(contractId);
      return join(getGitCloneFolder(contractId), contractConfiguration.path);
    },

    isContractPrecompiled(contractId: ContractSourcecodeId): boolean {
      const contractConfiguration = getContractConfiguration(contractId);
      return contractConfiguration.isPrecompiled === true;
    },

    async readDeploymentScripts(): Promise<[ScriptName, DeployScript][]> {
      const entries = await readdir(deployScriptsPath, { recursive: true, withFileTypes: true });
      const fileNames = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((fileName) => fileName !== configFileName);

      const scripts: [ScriptName, DeployScript][] = await Promise.all(
        fileNames.map(async (file) => {
          const path = join(deployScriptsPath, file);
          const imports = (await import(path)) as DeployScript;
          return [file, imports];
        })
      );

      scripts.sort(([fileName1], [fileName2]) => (fileName1 < fileName2 ? -1 : fileName1 > fileName2 ? 1 : 0));

      return scripts;
    },

    async readTests(): Promise<{ testSuitConfig: TestSuiteConfig; testSuites: [ScriptName, TestSuite][] }> {
      const entries = await readdir(testsPath, { recursive: true, withFileTypes: true });
      const files: Dirent[] = entries.filter((entry) => entry.isFile());

      const testSuites: [string, TestSuite][] = (
        await Promise.all(
          files.map<Promise<[string, TestSuite]>>(async (file) => {
            const path = join(file.path, file.name);
            const imports = (await import(path)) as TestSuite;
            return [file.name, imports];
          })
        )
      ).filter(([, testSuite]) => testSuite.default !== undefined);

      testSuites.sort(([fileName1], [fileName2]) => (fileName1 < fileName2 ? -1 : fileName1 > fileName2 ? 1 : 0));

      const testSuitConfig = configuration.tests;
      if (testSuitConfig === undefined)
        throw new Error(`No "tests" configuration entry in project ${relativeProjectPath}`);

      return {
        testSuitConfig,
        testSuites,
      };
    },

    getSigningSubmitter,

    async getAllSigningSubmitters(
      networkName: string,
      keyring: Keyring
    ): Promise<Record<NamedAccountId, SigningSubmitter>> {
      const signingSubmitters: Record<string, SigningSubmitter> = {};
      const networkConfig = getNetworkDefinition(networkName);

      for (const namedAccountId of Object.keys(networkConfig.namedAccounts)) {
        signingSubmitters[namedAccountId] = await getSigningSubmitter(networkName, namedAccountId, keyring);
      }

      return signingSubmitters;
    },
  };
}
