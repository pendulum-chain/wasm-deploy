import { readFile } from "node:fs/promises";

import { Abi } from "@polkadot/api-contract";

import {
  ArgumentType,
  ContractSourcecodeId,
  NamedAccount,
  NamedAccounts,
  TestContract,
  TestSuite,
  TestSuiteEnvironment,
} from "../types";
import { ChainApi, connectToChain } from "../api";
import { Project, initializeProject } from "../project";
import { StyledText, createAnimatedTextContext } from "../helpers/terminal";
import { compileContract } from "../actions/compileContract";
import { toUnit } from "../helpers/rationals";

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

  const testNamedAccount = await project.getFullNamedAccount(
    networkName,
    testSuitConfig.testNamedAccount,
    chainApi.getKeyring()
  );
  const namedAccounts = await project.getAllNamedAccounts(networkName, chainApi.getKeyring());

  const successful = await createAnimatedTextContext(async (updateDynamicText, addStaticText) => {
    await processTestScripts(
      project,
      chainApi,
      testNamedAccount,
      namedAccounts,
      testSuites,
      updateDynamicText,
      addStaticText
    );
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
  namedAccounts: NamedAccounts,
  testSuites: [string, TestSuite][],
  updateDynamicText: (newLines: StyledText[]) => void,
  addStaticText: (lines: StyledText[], removeDynamicText: boolean) => void
): Promise<void> {
  const compiledContracts: Record<ContractSourcecodeId, Promise<string>> = {};
  let deployerAccount: NamedAccount | undefined = undefined;

  for (const testSuitePair of testSuites) {
    const [testSuiteName, testSuite] = testSuitePair;

    const newContract = async (
      contractSourcecodeId: ContractSourcecodeId,
      constructorName: string,
      ...args: ArgumentType[]
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
        {
          from: deployerAccount ?? testNamedAccount,
          contract: contractSourcecodeId,
          constructorName,
          args: args ?? [],
        },
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

      console.log("Deployed contract", contractSourcecodeId, result);

      const deployedAddress = result.value;

      const deployedContract = { __internal: { deployedAddress } } as TestContract;
      Object.values(abi.metadata.spec.messages.toArray()).forEach((message) => {
        const label = message.label.toString();
        deployedContract[label] = async (...args: any[]) => {
          console.log("Call contract", contractSourcecodeId, label, args);

          const updateExecutionStatus = () => undefined;
          const addEvent = () => undefined;

          const { result, transactionFee } = await chainApi.executeContractFunction(
            deployedAddress,
            metadata,
            { from: deployerAccount ?? testNamedAccount },
            label,
            project,
            resolveContractEvent,
            updateExecutionStatus,
            addEvent,
            ...args
          );

          console.log("Done", contractSourcecodeId, label, result);
        };
      });

      return deployedContract;
    };

    const address = (contract: TestContract): string => {
      return contract.__internal.deployedAddress;
    };

    const units = chainApi.getUnits();

    const startPrank = (namedAccount: NamedAccount): void => {
      deployerAccount = namedAccount;
    };
    const stopPrank = (): void => {
      deployerAccount = undefined;
    };

    const environmentForTestSuite: TestSuiteEnvironment = {
      address,
      unit: toUnit.bind(null, units.unit),
      milliUnit: toUnit.bind(null, units.milliUnit),
      startPrank,
      stopPrank,
      testNamedAccount,
      namedAccounts,
      constructors: {},
    };
    for (const contractId of project.getContracts()) {
      environmentForTestSuite.constructors[`new${contractId}`] = newContract.bind(null, contractId, "new");
    }

    addStaticText([[{ text: "Process test suite " }, { text: testSuiteName, color: "cyan" }]], false);
    const testSuiteInstance = await testSuite.default(environmentForTestSuite);
    const tests = Object.keys(testSuiteInstance).filter((key) => key.startsWith("test") && key !== "setUp");

    for (const test of tests) {
      console.log(`Run test ${test}`);
      if (testSuiteInstance.setUp !== undefined) {
        await testSuiteInstance.setUp();
      }
      await testSuiteInstance[test]();
    }
  }
}
