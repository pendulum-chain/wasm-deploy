import { WeightV2 } from "@polkadot/types/interfaces";
import { readFile } from "node:fs/promises";

import { Address, ContractSourcecodeId, DeployedContractId, NamedAccounts, ScriptName } from "./types";
import { ChainApi } from "./api/api";
import { StyledText } from "./utils/terminal";
import { compileContract } from "./actions/compileContract";
import { Project } from "./project";
import {
  DeployScript,
  Deployment,
  DeploymentArguments,
  DeploymentsExtension,
  Network,
  TxOptions,
  WasmDeployEnvironment,
} from "./commands/deploy";
import { SigningSubmitter, getSubmitterAddress } from "./api/submitter";
import { DecodedContractEvent } from "@pendulum-chain/api-solang";

export type ContractDeploymentState =
  | "pending"
  | "compiling"
  | "compiled"
  | "optimizing"
  | "optimized"
  | "deploying"
  | "deployed"
  | "failure";

interface ContractEvent extends DecodedContractEvent {
  deployedContractId: DeployedContractId | undefined;
}

interface ContractDeploymentStatus {
  contractFileId: ContractSourcecodeId;
  deployedContractId: DeployedContractId;
  state: ContractDeploymentState;
  address?: Address;
  failure?: string;
  transactionFee?: bigint;
  events: ContractEvent[];
}

export type MethodExecutionState = "pending" | "dry running" | "submitting" | "success" | "failure";

interface MethodExecutionStatus {
  deployedContractId: DeployedContractId;
  functionName: string;
  state: MethodExecutionState;
  events: ContractEvent[];
  gasRequired?: WeightV2;
  transactionFee?: bigint;
  transactionResult?: string;
  failure?: string;
}

const SHOW_ESTIMATED_GAS = true;

type ExecutionStatus =
  | { type: "contractDeployment"; status: ContractDeploymentStatus }
  | { type: "methodExecution"; status: MethodExecutionStatus };

function renderEvents(events: ContractEvent[]): StyledText[] {
  const result: StyledText[] = [];

  events.forEach(({ args, deployedContractId, eventIdentifier }) => {
    result.push([
      { text: "    🎉 Event " },
      ...(deployedContractId !== undefined ? [{ text: deployedContractId, color: "blue" as const }] : []),
      { text: "." },
      { text: eventIdentifier, color: "green" },
    ]);

    args.forEach(({ name, value }) => {
      result.push([
        { text: "      - " },
        { text: name },
        { text: ": " },
        { text: JSON.stringify(value), color: "cyan" },
      ]);
    });
  });

  return result;
}

function renderContractDeploymentStatus(
  contractDeploymentStatus: ContractDeploymentStatus,
  chainApi: ChainApi<ContractSourcecodeId, DeployedContractId>
): StyledText[] {
  const { contractFileId, deployedContractId, state, address, transactionFee, failure } = contractDeploymentStatus;
  const firstLine: StyledText = [
    { text: "  📝 " },
    { text: deployedContractId, color: "blue" },
    { text: ` (source: ${contractFileId})` },
    ...(transactionFee !== undefined ? [{ text: ` [fee: ${chainApi.getAmountString(transactionFee)}]` }] : []),
    {
      text: ` ${failure ?? state}`,
      color: state === "deployed" ? "green" : state === "failure" ? "red" : "yellow",
      spinning: state === "compiling" || state === "optimizing" || state === "deploying",
    },
    ...(address !== undefined ? [{ text: ` to ${address}`, color: "green" as const }] : []),
  ];

  return [firstLine, ...renderEvents(contractDeploymentStatus.events)];
}

function renderMethodExecutionStatus(
  methodExecutionStatus: MethodExecutionStatus,
  chainApi: ChainApi<ContractSourcecodeId, DeployedContractId>
): StyledText[] {
  const { deployedContractId, functionName, state, transactionResult, transactionFee, failure, gasRequired } =
    methodExecutionStatus;

  const firstLine: StyledText = [
    { text: "  🧰 " },
    { text: deployedContractId, color: "blue" },
    { text: "." },
    { text: functionName, color: "green" },
    ...(transactionFee !== undefined || (gasRequired !== undefined && SHOW_ESTIMATED_GAS)
      ? [
          { text: ` [` },
          ...(transactionFee !== undefined ? [{ text: ` fee: ${chainApi.getAmountString(transactionFee)}` }] : []),
          ...(gasRequired !== undefined && SHOW_ESTIMATED_GAS
            ? [
                {
                  text: ` gasTime: ${String(gasRequired.refTime.toHuman())} gasProof: ${String(
                    gasRequired.proofSize.toHuman()
                  )}`,
                },
              ]
            : []),
          { text: ` ]` },
        ]
      : []),
    {
      text: ` ${failure ?? state}`,
      color: state === "success" ? "green" : state === "failure" ? "red" : "yellow",
      spinning: state === "dry running" || state === "submitting",
    },
    ...(transactionResult !== undefined ? [{ text: `, result: ${transactionResult}` }] : []),
  ];

  return [firstLine, ...renderEvents(methodExecutionStatus.events)];
}

export async function processScripts(
  scripts: [ScriptName, DeployScript][],
  signingSubmitters: Record<string, SigningSubmitter>, //getNamedAccounts: () => Promise<NamedAccounts>,
  network: Network,
  project: Project,
  chainApi: ChainApi<ContractSourcecodeId, DeployedContractId>,
  deploymentName: string | undefined,
  updateDynamicText: (newLines: StyledText[]) => void,
  addStaticText: (lines: StyledText[], removeDynamicText: boolean) => void
) {
  let executionStatuses: ExecutionStatus[] = [];
  const compiledContracts: Record<ContractSourcecodeId, Promise<string>> = {};
  const deployedContracts: Record<DeployedContractId, Deployment> = {};
  const submittersByAddress: Record<Address, SigningSubmitter> = {};
  const namedAccounts: NamedAccounts = {};

  Object.entries(signingSubmitters).forEach(([namedAccountId, signingSubmitter]) => {
    const submitterAddress = getSubmitterAddress(signingSubmitter);
    namedAccounts[namedAccountId] = { accountId: submitterAddress };
    submittersByAddress[submitterAddress] = signingSubmitter;
  });

  const updateDisplayedStatus = (asStaticText: boolean = false) => {
    const styledTexts = executionStatuses
      .map((executionStatus) => {
        switch (executionStatus.type) {
          case "contractDeployment":
            return renderContractDeploymentStatus(executionStatus.status, chainApi);

          case "methodExecution": {
            return renderMethodExecutionStatus(executionStatus.status, chainApi);
          }
        }
      })
      .flat();

    if (asStaticText === true) {
      addStaticText(styledTexts, true);
    } else {
      updateDynamicText(styledTexts);
    }
  };

  /* eslint-disable @typescript-eslint/require-await */
  const getDeployment = async (scriptName: ScriptName, deployedContractId: DeployedContractId): Promise<Deployment> => {
    const deployment = deployedContracts[deployedContractId];
    if (deployment !== undefined) {
      return deployment;
    }
    throw new Error(`Try to load unknown contract ${deployedContractId} in script ${scriptName}`);
  };
  /* eslint-enable @typescript-eslint/require-await */

  const deploy = async (scriptName: ScriptName, deployedContractId: DeployedContractId, args: DeploymentArguments) => {
    const contractDeploymentStatus: ContractDeploymentStatus = {
      deployedContractId,
      contractFileId: args.contract,
      state: "pending",
      events: [],
    };
    executionStatuses.push({ type: "contractDeployment", status: contractDeploymentStatus });

    updateDisplayedStatus();

    const updateContractStatus = (status: ContractDeploymentState) => {
      contractDeploymentStatus.state = status;
      updateDisplayedStatus();
    };

    const compiledContractFileName = await compileContract(
      args.contract,
      project,
      compiledContracts,
      updateContractStatus
    );
    const compiledContractFile = await readFile(compiledContractFileName);
    chainApi.registerMetadata(args.contract, compiledContractFile.toString("utf8"));

    const result = await chainApi.deployContract({
      constructorArguments: args.args,
      contractMetadataId: args.contract,
      deployedContractId,
      project,
      submitter: submittersByAddress[args.from.accountId],
      constructorName: args.constructorName,
      onStartingDeployment: () => updateContractStatus("deploying"),
    });

    if (result.type === "success") {
      result.events.forEach((event) => {
        if (event.decoded !== undefined) {
          contractDeploymentStatus.events.push({
            ...event.decoded,
            deployedContractId: chainApi.lookupIdOfDeployedContract(event.emittingContractAddress),
          });
        }
      });
    }

    if (result.type !== "success") {
      switch (result.type) {
        case "error":
          contractDeploymentStatus.failure = `Error: ${result.error}`;
          break;
        case "panic":
          contractDeploymentStatus.failure = `Panic: ${result.explanation} (code: ${result.errorCode})`;
          break;
        case "reverted":
          contractDeploymentStatus.failure = `Revert: ${result.description}`;
          break;
      }
      updateContractStatus("failure");

      throw new Error(`An error occurred deploying contract (${result.type}): ${deployedContractId}`);
    }

    const { transactionFee, deploymentAddress } = result;
    contractDeploymentStatus.transactionFee = transactionFee;

    const deployment: Deployment = {
      address: deploymentAddress,
      compiledContractFileName,
    };
    contractDeploymentStatus.address = deploymentAddress;
    updateContractStatus("deployed");

    deployedContracts[deployedContractId] = deployment;
    return deployment;
  };

  const execute = async (
    scriptName: ScriptName,
    deployedContractId: DeployedContractId,
    tx: TxOptions,
    functionName: string,
    ...rest: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */
  ) => {
    const contract = await getDeployment(scriptName, deployedContractId);
    const methodExecutionStatus: MethodExecutionStatus = {
      deployedContractId,
      functionName,
      state: "pending",
      events: [],
    };
    executionStatuses.push({ type: "methodExecution", status: methodExecutionStatus });

    const updateExecutionStatus = (state: MethodExecutionState, gasRequired?: WeightV2) => {
      methodExecutionStatus.state = state;

      if (gasRequired !== undefined) {
        methodExecutionStatus.gasRequired = gasRequired;
      }

      updateDisplayedStatus();
    };

    const { result: maybeResult, execution } = await chainApi.messageCall({
      deploymentAddress: contract.address,
      messageArguments: rest,
      messageName: functionName,
      project,
      submitter: submittersByAddress[tx.from.accountId],
      onReadyToSubmit: () => updateExecutionStatus("submitting"),
    });

    // temporary fix until https://github.com/pendulum-chain/api-solang/issues/19 is resolved
    const result = maybeResult!;

    if (execution.type === "extrinsic") {
      methodExecutionStatus.transactionFee = execution.transactionFee;
      execution.contractEvents.forEach((event) => {
        if (event.decoded !== undefined) {
          methodExecutionStatus.events.push({
            ...event.decoded,
            deployedContractId: chainApi.lookupIdOfDeployedContract(event.emittingContractAddress),
          });
        }
      });
    }

    switch (result.type) {
      case "error":
        methodExecutionStatus.failure = result.error;
        updateExecutionStatus("failure", undefined);
        break;
      case "panic":
        methodExecutionStatus.failure = result.explanation;
        updateExecutionStatus("failure", undefined);
        break;
      case "reverted":
        methodExecutionStatus.failure = result.description;
        updateExecutionStatus("failure", undefined);
        break;
      case "success":
        updateExecutionStatus("success", undefined);
        break;
    }
  };

  for (const scriptPair of scripts) {
    const [scriptName, script] = scriptPair;

    const deploymentsForScript: DeploymentsExtension = {
      /* eslint-disable-next-line @typescript-eslint/require-await */
      getOrNull: async (deployedContractId: DeployedContractId) => deployedContracts[deployedContractId] ?? null,
      get: getDeployment.bind(null, scriptName),
      deploy: deploy.bind(null, scriptName),
      execute: execute.bind(null, scriptName),
    };

    const environmentForScript: WasmDeployEnvironment = {
      /* eslint-disable @typescript-eslint/require-await */
      getNamedAccounts: async (): Promise<NamedAccounts> => namedAccounts,
      deployments: deploymentsForScript,
      network,
      deploymentName,
    };

    if (script.default.skip !== undefined && (await script.default.skip(environmentForScript))) {
      addStaticText([[{ text: "Skip execution of script " }, { text: scriptName, color: "cyan" }]], false);
      continue;
    }

    addStaticText([[{ text: "Process script " }, { text: scriptName, color: "cyan" }]], false);
    await script.default(environmentForScript);
    updateDisplayedStatus(true);
    executionStatuses = [];
  }
}
