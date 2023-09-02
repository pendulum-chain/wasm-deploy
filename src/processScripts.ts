import { WeightV2 } from "@polkadot/types/interfaces";
import { readFile } from "node:fs/promises";

import { Address, ContractSourcecodeId, DeployedContractId, NamedAccounts, ScriptName } from "./types";
import { ChainApi, DecodedContractEvent } from "./api/api";
import { StyledText } from "./helpers/terminal";
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
import { SigningSubmitter, getSubmitterAddress } from "./api/submitTransaction";

export type ContractDeploymentState =
  | "pending"
  | "compiling"
  | "compiled"
  | "optimizing"
  | "optimized"
  | "deploying"
  | "deployed"
  | "failure";

interface ContractDeploymentStatus {
  contractFileId: ContractSourcecodeId;
  deployedContractId: DeployedContractId;
  state: ContractDeploymentState;
  address?: Address;
  failure?: string;
  transactionFee?: bigint;
  events: DecodedContractEvent<DeployedContractId>[];
}

export type MethodExecutionState = "pending" | "dry running" | "gas estimated" | "submitting" | "success" | "failure";

interface MethodExecutionStatus {
  deployedContractId: DeployedContractId;
  functionName: string;
  state: MethodExecutionState;
  events: DecodedContractEvent<DeployedContractId>[];
  gasRequired?: WeightV2;
  transactionFee?: bigint;
  transactionResult?: string;
  failure?: string;
}

const SHOW_ESTIMATED_GAS = true;

type ExecutionStatus =
  | { type: "contractDeployment"; status: ContractDeploymentStatus }
  | { type: "methodExecution"; status: MethodExecutionStatus };

function renderEvents(events: DecodedContractEvent<DeployedContractId>[]): StyledText[] {
  const result: StyledText[] = [];

  events.forEach(({ args, deployedContractId, eventIdentifier }) => {
    result.push([
      { text: "    🎉 Event " },
      { text: deployedContractId, color: "blue" },
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
    ...(address !== undefined ? [{ text: ` to ${address}`, color: "green" as "green" }] : []),
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
            ? [{ text: ` gasTime: ${gasRequired.refTime.toHuman()} gasProof: ${gasRequired.proofSize.toHuman()}` }]
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

  const getDeployment = async (scriptName: ScriptName, deployedContractId: DeployedContractId): Promise<Deployment> => {
    const deployment = deployedContracts[deployedContractId];
    if (deployment !== undefined) {
      return deployment;
    }
    throw new Error(`Try to load unknown contract ${deployedContractId} in script ${scriptName}`);
  };

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

    const { status, transactionFee, contractEvents, deploymentAddress } = await chainApi.deployContract({
      constructorArguments: args.args,
      contractMetadataId: args.contract,
      deployedContractId,
      project,
      submitter: submittersByAddress[args.from.accountId],
      constructorName: args.constructorName,
      onStartingDeployment: () => updateContractStatus("deploying"),
    });

    contractEvents.forEach((event) => {
      if (event.decoded !== undefined) {
        contractDeploymentStatus.events.push(event.decoded);
      }
    });

    contractDeploymentStatus.transactionFee = transactionFee;
    if (status.type === "error") {
      contractDeploymentStatus.failure = `${status.error}`;
      updateContractStatus("failure");

      throw new Error(`An error occurred deploying contract (${status.type}): ${deployedContractId}`);
    }

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
    ...rest: any[]
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

    const { result, execution } = await chainApi.messageCall({
      deploymentAddress: contract.address,
      messageArguments: rest,
      messageName: functionName,
      project,
      submitter: submittersByAddress[tx.from.accountId],
      onPreflightExecuted: (gasRequired) => updateExecutionStatus("gas estimated", gasRequired),
      onReadyToSubmit: () => updateExecutionStatus("submitting"),
    });

    if (execution.type === "extrinsic") {
      methodExecutionStatus.transactionFee = execution.transactionFee;
      execution.contractEvents.forEach((event) => {
        if (event.decoded !== undefined) {
          methodExecutionStatus.events.push(event.decoded);
        }
      });
    }

    if (result.type === "error") {
      methodExecutionStatus.failure = result.error;
      updateExecutionStatus("failure", undefined);
    } else {
      updateExecutionStatus("success", undefined);
    }
  };

  for (const scriptPair of scripts) {
    const [scriptName, script] = scriptPair;

    const deploymentsForScript: DeploymentsExtension = {
      getOrNull: async (deployedContractId: DeployedContractId) => deployedContracts[deployedContractId] ?? null,
      get: getDeployment.bind(null, scriptName),
      deploy: deploy.bind(null, scriptName),
      execute: execute.bind(null, scriptName),
    };

    const environmentForScript: WasmDeployEnvironment = {
      getNamedAccounts: async (): Promise<NamedAccounts> => namedAccounts,
      deployments: deploymentsForScript,
      network,
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
