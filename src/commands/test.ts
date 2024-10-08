import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

import { Address, ArgumentType, ContractSourcecodeId } from "../types";
import { ChainApi, connectToChain } from "../api/api";
import { Project, initializeProject } from "../project";
import { StyledText, createAnimatedTextContext } from "../utils/terminal";
import { compileContract } from "../actions/compileContract";
import { toUnit } from "../utils/rationals";
import { SigningSubmitter, Submitter, getSubmitterAddress } from "../api/submitter";
import { Extrinsic, PanicCode, SubmitExtrinsicResult } from "@pendulum-chain/api-solang";
import { Codec } from "@polkadot/types-codec/types";
import { SubmittableExtrinsics } from "@polkadot/api/types";

const NUMBER_OF_FUZZING_ITERATIONS = 64;

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
  constructor(errorCode: PanicCode, explanation: string) {
    super(`${explanation} (code ${errorCode})`);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestContract = Record<string, (...args: any[]) => Promise<any>> & {
  __internal: { deploymentAddress: Address };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestConstructor = (...args: any[]) => Promise<TestContract>;

export interface CheatCodeInstance {
  startPrank: (prankster: Address) => void;
  stopPrank: () => void;
  expectRevert: (message: string) => void;
  expectEmit: (contract: TestContract, eventIdentifier: string, args: unknown[]) => void;
  mintNative: (account: Address, amount: bigint) => Promise<void>;
  executeRootExtrinsic: (rootExtrinsic: Extrinsic) => Promise<SubmitExtrinsicResult>;
  roll: (noOfBlocks: bigint | number) => Promise<void>;
  getBlockNumber: () => Promise<bigint>;
  extrinsicBuilders: SubmittableExtrinsics<"promise">;
}

export type TestSuiteEnvironment = {
  vm: CheatCodeInstance;
  address: (contract: TestContract) => string;
  unit: (number: number | string | bigint) => bigint;
  milliUnit: (number: number | string | bigint) => bigint;
  microUnit: (number: number | string | bigint) => bigint;
  getContractByAddress: (deploymentAddress: Address | Uint8Array) => TestContract;
  tester: Address;
  constructors: Record<string, TestConstructor>;
};

export type TestFunction = (...fuzzingParameters: bigint[]) => Promise<void>;

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

/* eslint-disable  */
function processValue(value: any): any {
  if (value?.toRawType == undefined) {
    return undefined;
  }

  switch (value.toRawType()) {
    case "u256":
    case "i256":
      return value.toBigInt();
    case "bool":
      return value.toPrimitive();
  }

  if (Array.isArray(value)) {
    return value.map(processValue);
  }

  return value;
}
/* eslint-enable */

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

  let totalTests = 0;
  let totalTestSuites = 0;

  for (const testSuitePair of testSuites) {
    totalTestSuites++;
    const [testSuiteName, testSuite] = testSuitePair;

    const newContract = async (
      contractSourcecodeId: ContractSourcecodeId,
      constructorName: string,
      ...args: ArgumentType[]
    ): Promise<TestContract> => {
      console.log("Deploying new contract", contractSourcecodeId);
      const updateContractStatus = () => undefined;

      const compiledContractFileName = await compileContract(
        contractSourcecodeId,
        project,
        compiledContracts,
        updateContractStatus
      );

      const compiledContractFile = await readFile(compiledContractFileName);
      chainApi.registerMetadata(contractSourcecodeId, compiledContractFile.toString("utf8"));

      const result = await chainApi.deployContract({
        constructorArguments: args,
        contractMetadataId: contractSourcecodeId,
        deployedContractId: undefined,
        project,
        submitter: deployerAccount ?? tester,
        constructorName: constructorName,
      });

      if (result.type !== "success") {
        switch (result.type) {
          case "error":
            console.log(`An error occurred: ${result.error}`);
            break;
          case "panic":
            console.log(`A panic occurred: ${result.explanation} (code: ${result.errorCode})`);
            break;
          case "reverted":
            console.log(`The contract reverted: ${result.description}`);
            break;
        }
        throw new Error(`An error occurred deploying contract ${contractSourcecodeId}`);
      }

      const { events, deploymentAddress } = result;
      events.forEach((event) => {
        console.log("Contract event", event.emittingContractAddress, Buffer.from(event.data).toString("hex"));
        if (event.decoded !== undefined) {
          console.log("Decoded event", event.decoded.eventIdentifier, event.decoded.args);
        }
      });

      console.log("Successfully deployed contract", contractSourcecodeId, "to", deploymentAddress);

      const deployedContract = { __internal: { deploymentAddress } } as TestContract;
      chainApi.getContractMessages(contractSourcecodeId).forEach((messageName) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deployedContract[messageName] = async (...args: any[]): Promise<unknown> => {
          console.log("Call contract", contractSourcecodeId, "at address", deploymentAddress, messageName, args);

          const { result: maybeResult, execution } = await chainApi.messageCall({
            deploymentAddress: deploymentAddress,
            messageArguments: args,
            messageName,
            project,
            submitter: deployerAccount ?? tester,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let resultValue: Codec | undefined = undefined;

          // temporary fix until https://github.com/pendulum-chain/api-solang/issues/19 is resolved
          const result = maybeResult!;

          switch (result.type) {
            case "success":
              resultValue = result.value as Codec;
              if (expectedRevertMessage !== undefined) {
                throw new Error(
                  `Test was expected to revert with message "${expectedRevertMessage}" but no revert happened.`
                );
              }
              break;
            case "reverted":
              if (expectedRevertMessage !== undefined && expectedRevertMessage === result.description) {
                console.log(`Test reverted as expected with message "${expectedRevertMessage}"`);
                expectedRevertMessage = undefined;
              } else {
                throw new RevertError(result.description);
              }
              break;
            case "panic":
              throw new PanicError(result.errorCode, result.explanation);
            case "error":
              throw new CallError(result.error);
          }

          if (execution.type === "extrinsic") {
            execution.contractEvents.forEach((event) => {
              if (
                expectedEmits.length !== 0 &&
                expectedEmits[0].encoding.toString("hex") === Buffer.from(event.data).toString("hex")
              ) {
                expectedEmits.shift();
              }

              console.log("Contract event", event.emittingContractAddress, Buffer.from(event.data).toString("hex"));
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

          console.log("Done", contractSourcecodeId, messageName, resultValue?.toHuman());
          return processValue(resultValue) as unknown;
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

    const stopPrank = (showLog: boolean = true): void => {
      if (showLog) {
        console.log("stopPrank");
      }
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

    const getContractByAddress = (deploymentAddress: Address | Uint8Array): TestContract => {
      if (typeof deploymentAddress !== "string") {
        deploymentAddress = chainApi.getSS58Encoding(deploymentAddress);
      }

      const contract = contractsByAddress[deploymentAddress];
      if (contract === undefined) {
        throw new Error(`No known contract at address ${deploymentAddress}`);
      }

      return contract;
    };

    const mintNative = async (account: Address, amount: bigint): Promise<void> => {
      await chainApi.setFreeBalance(account, amount, root);
    };

    const executeRootExtrinsic = async (rootExtrinsic: Extrinsic): Promise<SubmitExtrinsicResult> => {
      return chainApi.executeRootExtrinsic(rootExtrinsic, root);
    };

    const roll = async (noOfBlocks: bigint | number): Promise<void> => {
      console.log(`Skip ${String(noOfBlocks)} blocks`);
      await chainApi.skipBlocks(noOfBlocks, root);
    };

    const getBlockNumber = async (): Promise<bigint> => {
      return chainApi.getBlockNumber();
    };

    const environmentForTestSuite: TestSuiteEnvironment = {
      address,
      unit: toUnit.bind(null, units.unit),
      milliUnit: toUnit.bind(null, units.milliUnit),
      microUnit: toUnit.bind(null, units.microUnit),
      getContractByAddress,
      vm: {
        startPrank,
        stopPrank,
        expectRevert,
        expectEmit,
        mintNative,
        executeRootExtrinsic,
        roll,
        getBlockNumber,
        extrinsicBuilders: chainApi.api().tx,
      },
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
      totalTests++;
      console.log(`\n\nRun test ${test}`);
      testSuiteInstance = await testSuite.default(environmentForTestSuite);

      try {
        expectedRevertMessage = undefined as undefined | string;
        if (testSuiteInstance.setUp !== undefined) {
          console.log(`Run setup code ${test}`);
          await testSuiteInstance.setUp();
        }

        console.log(`Run test function ${test}`);

        const numberOfFuzzingParameters = testSuiteInstance[test].length;
        const testIterations =
          numberOfFuzzingParameters > 0 ? NUMBER_OF_FUZZING_ITERATIONS * numberOfFuzzingParameters : 1;
        for (let iterations = 0; iterations < testIterations; iterations++) {
          const fuzzArguments = [];

          if (numberOfFuzzingParameters > 0) {
            const randomNumbers = randomBytes(numberOfFuzzingParameters * 32);
            for (let i = 0; i < numberOfFuzzingParameters; i++) {
              fuzzArguments.push(BigInt(`0x${randomNumbers.subarray(i * 32, (i + 1) * 32).toString("hex")}`));
            }
            console.log(`Fuzzing with arguments`, fuzzArguments);
          }

          await testSuiteInstance[test](...fuzzArguments);
          if (expectedRevertMessage !== undefined) {
            throw new Error(
              `Test was expected to revert with message "${expectedRevertMessage}" but no revert happened.`
            );
          }
        }
      } catch (error: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
        stopPrank(false);
        expectedEmits = [];

        if ((error as RevertError).name === "RevertError") {
          const revertMessage = (error as RevertError).message;
          let message: string;
          if (expectedRevertMessage === undefined) {
            message = `Test unexpectedly reverted with message "${revertMessage}".`;
          } else {
            message = `Test was expected to revert with message "${expectedRevertMessage}" but reverted with message "${revertMessage}"`;
          }
          (error as RevertError).message = message;
        }

        throw error;
      }
    }
  }

  console.log(`\n\nAll tests completed: ${totalTestSuites} test files executed, ${totalTests} test functions executed`);
}
