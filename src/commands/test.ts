import { readFile } from "node:fs/promises";

import { Address, ArgumentType, ContractSourcecodeId } from "../types";
import { ChainApi, connectToChain } from "../api/api";
import { Project, initializeProject } from "../project";
import { StyledText, createAnimatedTextContext } from "../helpers/terminal";
import { compileContract } from "../actions/compileContract";
import { toUnit } from "../helpers/rationals";
import { PanicCode, explainPanicError } from "../api/queryContract";
import { SigningSubmitter, Submitter, getSubmitterAddress } from "../api/submitTransaction";

export interface RunTestSuitesOptions {
  projectFolder: string;
  network: string;
}

export async function runTestSuits(options: RunTestSuitesOptions) {
  const project = await initializeProject(options.projectFolder);

  const networkName = options.network;
  const networkConfig = project.getNetworkDefinition(networkName);
  const { testSuitConfig, testSuites } = await project.readTests();

  const chainApi = await connectToChain<ContractSourcecodeId, undefined>(networkConfig.rpcUrl);

  const tester = await project.getSigningSubmitter(networkName, testSuitConfig.tester, chainApi.getKeyring());
  const root = await project.getSigningSubmitter(networkName, testSuitConfig.root, chainApi.getKeyring());

  const successful = await createAnimatedTextContext(async (updateDynamicText, addStaticText) => {
    await processTestScripts(project, chainApi, tester, root, testSuites, updateDynamicText, addStaticText);
  });

  if (successful) {
    console.log("Tests successful!");
  }
  process.exit();
}

class RevertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RevertError";
  }
}

class PanicError extends Error {
  constructor(errorCode: PanicCode) {
    super(explainPanicError(errorCode));
    this.name = "PanicError";
  }
}

class CallError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "CallError";
  }
}

export class AssertionError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AssertError";
  }
}

export type TestContract = Record<string, (...args: any[]) => Promise<any>> & {
  __internal: { deploymentAddress: Address };
};

export type TestConstructor = (...args: any[]) => Promise<TestContract>;

export type TestSuiteEnvironment = {
  address: (contract: TestContract) => string;
  unit: (number: number | string | bigint, precision?: number) => bigint;
  milliUnit: (number: number | string | bigint, precision?: number) => bigint;
  microUnit: (number: number | string | bigint, precision?: number) => bigint;
  startPrank: (prankster: Address) => void;
  stopPrank: () => void;
  expectRevert: (message: string) => void;
  expectEmit: (contract: TestContract, eventIdentifier: string, args: unknown[]) => void;
  getContractByAddress: (deploymentAddress: Address) => TestContract;
  tester: Address;
  constructors: Record<string, TestConstructor>;
};

export type TestFunction = () => Promise<void>;

export type TestSuiteFunction = {
  (environment: TestSuiteEnvironment): Promise<Record<string, TestFunction>>;
};

export interface TestSuite {
  default: TestSuiteFunction;
}

export interface ExpectedEmit {
  deploymentAddress: Address;
  eventIdentifier: string;
  args: unknown[];
  encoding: Buffer;
}

function processValue(value: any): any {
  if (value?.toRawType == undefined) {
    return undefined;
  }

  switch (value.toRawType()) {
    case "u256":
    case "i256":
      return value.toBigInt();
  }

  if (Array.isArray(value)) {
    return value.map(processValue);
  }

  return value;
}

async function processTestScripts(
  project: Project,
  chainApi: ChainApi<ContractSourcecodeId, undefined>,
  tester: SigningSubmitter,
  root: SigningSubmitter,
  testSuites: [string, TestSuite][],
  updateDynamicText: (newLines: StyledText[]) => void,
  addStaticText: (lines: StyledText[], removeDynamicText: boolean) => void
): Promise<void> {
  const compiledContracts: Record<ContractSourcecodeId, Promise<string>> = {};
  const contractsByAddress: Record<Address, TestContract> = {};
  let deployerAccount: Submitter | undefined = undefined;
  let expectedRevertMessage: string | undefined = undefined;
  let expectedEmits: ExpectedEmit[] = [];

  for (const testSuitePair of testSuites) {
    const [testSuiteName, testSuite] = testSuitePair;

    const newContract = async (
      contractSourcecodeId: ContractSourcecodeId,
      constructorName: string,
      ...args: ArgumentType[]
    ): Promise<TestContract> => {
      const updateContractStatus = () => undefined;

      const compiledContractFileName = await compileContract(
        contractSourcecodeId,
        project,
        compiledContracts,
        updateContractStatus
      );

      const compiledContractFile = await readFile(compiledContractFileName);
      chainApi.registerMetadata(contractSourcecodeId, compiledContractFile.toString("utf8"));

      const { status, contractEvents, deploymentAddress } = await chainApi.deployContract({
        constructorArguments: args,
        contractMetadataId: contractSourcecodeId,
        deployedContractId: undefined,
        project,
        submitter: deployerAccount ?? tester,
        constructorName: constructorName,
      });

      contractEvents.forEach((event) => {
        console.log("Contract event", event.emittingContractAddress, event.data.toString("hex"));
        if (event.decoded !== undefined) {
          console.log("Decoded event", event.decoded.eventIdentifier, event.decoded.args);
        }
      });

      if (status.type === "error") {
        addStaticText([[{ text: `Error: ${status.error}` }]], false);
        throw new Error(`An error occurred deploying contract ${contractSourcecodeId}`);
      }

      console.log("Deployed contract", contractSourcecodeId, "to", deploymentAddress, "with status", status);

      const deployedContract = { __internal: { deploymentAddress } } as TestContract;
      chainApi.getContractMessages(contractSourcecodeId).forEach((messageName) => {
        deployedContract[messageName] = async (...args: any[]) => {
          console.log("Call contract", contractSourcecodeId, "at address", deploymentAddress, messageName, args);

          const { result, execution } = await chainApi.messageCall({
            deploymentAddress: deploymentAddress,
            messageArguments: args,
            messageName,
            project,
            submitter: deployerAccount ?? tester,
          });

          if (result.type === "reverted") {
            throw new RevertError(result.description);
          }
          if (result.type === "panic") {
            throw new PanicError(result.errorCode);
          }
          if (result.type === "error") {
            throw new CallError(result.error);
          }

          if (execution.type === "extrinsic") {
            execution.contractEvents.forEach((event) => {
              if (
                expectedEmits.length !== 0 &&
                expectedEmits[0].encoding.toString("hex") === event.data.toString("hex")
              ) {
                expectedEmits.shift();
              }

              console.log("Contract event", event.emittingContractAddress, event.data.toString("hex"));
              if (event.decoded !== undefined) {
                console.log("Decoded event", event.decoded.eventIdentifier, event.decoded.args);
              }
            });
          }

          if (expectedEmits.length !== 0) {
            throw new Error(
              `The following expected events have not been emitted: ${expectedEmits
                .map((event) => `${event.eventIdentifier}(${event.args.map((arg) => String(arg)).join(", ")})`)
                .join(", ")}`
            );
          }

          console.log("Done", contractSourcecodeId, messageName, result.value?.toHuman());

          return processValue(result.value);
        };
      });

      contractsByAddress[deploymentAddress] = deployedContract;
      return deployedContract;
    };

    const address = (contract: TestContract): string => {
      return contract.__internal.deploymentAddress;
    };

    const units = chainApi.getUnits();

    const startPrank = (prankster: Address): void => {
      const submitter: Submitter = {
        type: "force",
        accountId: prankster,
        rootSigningSubmitter: root,
      };

      console.log("startPrank", prankster);
      deployerAccount = submitter;
    };

    const stopPrank = (): void => {
      console.log("stopPrank");
      deployerAccount = undefined;
    };

    const expectRevert = (message: string): void => {
      expectedRevertMessage = message;
    };

    const expectEmit = (contract: TestContract, eventIdentifier: string, args: unknown[]): void => {
      const contractAddress = address(contract);

      const encoding = chainApi.encodeContractEvent(contractAddress, eventIdentifier, args);

      expectedEmits.push({
        args,
        deploymentAddress: contractAddress,
        encoding: Buffer.from(encoding),
        eventIdentifier,
      });
    };

    const getContractByAddress = (deploymentAddress: Address): TestContract => {
      const contract = contractsByAddress[deploymentAddress];
      if (contract === undefined) {
        throw new Error(`No known contract at address ${deploymentAddress}`);
      }

      return contract;
    };

    const environmentForTestSuite: TestSuiteEnvironment = {
      address,
      unit: toUnit.bind(null, units.unit),
      milliUnit: toUnit.bind(null, units.milliUnit),
      microUnit: toUnit.bind(null, units.microUnit),
      startPrank,
      stopPrank,
      expectRevert,
      expectEmit,
      getContractByAddress,
      tester: getSubmitterAddress(tester),
      constructors: {},
    };

    for (const contractId of project.getContracts()) {
      environmentForTestSuite.constructors[`new${contractId}`] = newContract.bind(null, contractId, "new");
    }

    addStaticText([[{ text: "Process test suite " }, { text: testSuiteName, color: "cyan" }]], false);
    let testSuiteInstance = await testSuite.default(environmentForTestSuite);
    const tests = Object.keys(testSuiteInstance).filter((key) => key.startsWith("test") && key !== "setUp");

    for (const test of tests) {
      console.log(`\n\nRun test ${test}`);
      testSuiteInstance = await testSuite.default(environmentForTestSuite);
      try {
        expectedRevertMessage = undefined;
        if (testSuiteInstance.setUp !== undefined) {
          console.log(`Run setup code ${test}`);
          await testSuiteInstance.setUp();
        }

        console.log(`Run test function ${test}`);
        await testSuiteInstance[test]();
        if (expectedRevertMessage !== undefined) {
          throw new Error(
            `Test was expected to revert with message "${expectedRevertMessage}" but not revert happened.`
          );
        }
      } catch (error: any) {
        stopPrank();
        expectedEmits = [];
        if (error.name === "RevertError") {
          const revertMessage = (error as RevertError).message;
          if (expectedRevertMessage === undefined) {
            throw new Error(`Test unexpectedly reverted with message "${revertMessage}".`);
          }
          if (revertMessage !== expectedRevertMessage) {
            throw new Error(
              `Test was expected to revert with message "${expectedRevertMessage}" but reverted with message "${revertMessage}"`
            );
          }
          console.log(`Test reverted as expected with message "${expectedRevertMessage}"`);
        } else {
          throw error;
        }
      }
    }
  }
}
