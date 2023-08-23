import { readFile } from "node:fs/promises";

import { Abi } from "@polkadot/api-contract";

import {
  ArgumentType,
  ContractSourcecodeId,
  DeployedContractId,
  DeploymentsExtension,
  ExecuctionEvent,
  NamedAccount,
  NamedAccountId,
  NamedAccounts,
  TestContract,
  TestSuite,
  TestSuiteEnvironment,
} from "../types";
import { ChainApi, connectToChain } from "../api";
import { rawAddressesAreEqual } from "../helpers/addresses";
import { PromiseMutex } from "../helpers/promiseMutex";
import { Project, initializeProject } from "../project";
import { StyledText, createAnimatedTextContext } from "../helpers/terminal";
import { ContractDeploymentState } from "../processScripts";
import { compileContract } from "../actions/compileContract";

export interface RunTestSuitesOptions {
  projectFolder: string;
  network: string;
}

export async function runTestSuits(options: RunTestSuitesOptions) {
  const project = await initializeProject(options.projectFolder);

  const networkName = options.network;
  const networkConfig = project.getNetworkDefinition(networkName);
  const { testSuitConfig, testSuites } = await project.readTests();

  const chainApi = await connectToChain(networkConfig.rpcUrl);

  const { testNamedAccount } = testSuitConfig;
  const namedAccount = await project.getFullNamedAccount(networkName, testNamedAccount, chainApi.getKeyring());

  const successful = await createAnimatedTextContext(async (updateDynamicText, addStaticText) => {
    await processTestScripts(project, chainApi, namedAccount, testSuites, updateDynamicText, addStaticText);
  });

  if (successful) {
    console.log("Tests successful!");
  }
  process.exit();
}

async function processTestScripts(
  project: Project,
  chainApi: ChainApi,
  testNamedAccount: NamedAccount,
  testSuites: [string, TestSuite][],
  updateDynamicText: (newLines: StyledText[]) => void,
  addStaticText: (lines: StyledText[], removeDynamicText: boolean) => void
): Promise<void> {
  const compiledContracts: Record<ContractSourcecodeId, Promise<string>> = {};

  for (const testSuitePair of testSuites) {
    const [testSuiteName, testSuite] = testSuitePair;

    const newContract = async (
      contractSourcecodeId: ContractSourcecodeId,
      constructorName: string,
      args?: ArgumentType[]
    ): Promise<TestContract> => {
      const updateContractStatus = () => undefined;
      const addEvent = () => undefined;
      const resolveContractEvent = () => undefined;

      const compiledContractFileName = await compileContract(
        contractSourcecodeId,
        project,
        compiledContracts,
        updateContractStatus
      );
      const compiledContractFile = await readFile(compiledContractFileName);
      const metadata = JSON.parse(compiledContractFile.toString("utf8"));
      const abi = new Abi(metadata, chainApi.api().registry.getChainProperties());

      const { result } = await chainApi.instantiateWithCode(
        compiledContractFileName,
        { from: testNamedAccount, contract: contractSourcecodeId, constructorName, args: args ?? [] },
        project,
        updateContractStatus,
        resolveContractEvent,
        addEvent,
        abi,
        ""
      );

      if (result.type === "error") {
        addStaticText([[{ text: `Error: ${result.error}` }]], false);
        throw new Error(`An error occurred deploying contract ${contractSourcecodeId}`);
      }

      const deployedAddress = result.value;

      const deployedContract: TestContract = {};
      console.log("Array", abi.metadata.spec.messages.toArray());
      Object.values(abi.metadata.spec.messages.toArray()).forEach((message) => {
        console.log("message", message.label.toHuman());
        const label = message.label.toString();
        deployedContract[label] = async (...args: any[]) => {
          console.log("Call contract", contractSourcecodeId, label, args);

          const updateExecutionStatus = () => undefined;
          const addEvent = () => undefined;

          const { result, transactionFee } = await chainApi.executeContractFunction(
            deployedAddress,
            metadata,
            { from: testNamedAccount },
            label,
            project,
            resolveContractEvent,
            updateExecutionStatus,
            addEvent,
            ...args
          );

          console.log(contractSourcecodeId, label, result);
        };
      });

      return deployedContract;
    };

    const environmentForTestSuite: TestSuiteEnvironment = {
      newContract,
    };

    addStaticText([[{ text: "Process test suite " }, { text: testSuiteName, color: "cyan" }]], false);
    const testSuiteInstance = await testSuite.default(environmentForTestSuite);
    const tests = Object.keys(testSuiteInstance).filter((key) => key.startsWith("test") && key !== "setUp");

    for (const test of tests) {
      console.log(`Run test ${test}`);
      const testSuiteInstance = await testSuite.default(environmentForTestSuite);
      if (testSuiteInstance.setUp !== undefined) {
        await testSuiteInstance.setUp();
      }
      await testSuiteInstance[test]();
    }
  }
}
