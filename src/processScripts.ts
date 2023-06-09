import { WeightV2 } from "@polkadot/types/interfaces";
import { readFile } from "node:fs/promises";

import {
  Address,
  ConfigFile,
  ContractSourcecodeId,
  DeployScript,
  DeployedContractId,
  Deployment,
  DeploymentArguments,
  DeploymentsExtension,
  ExecuctionEvent,
  NamedAccounts,
  Network,
  ScriptName,
  TxOptions,
  WasmDeployEnvironment,
} from "./types";

import { ChainApi } from "./api";
import { StyledText } from "./helpers/terminal";
import { compileContract } from "./actions/compileContract";
import { addressesAreEqual } from "./helpers/addresses";
import { Abi } from "@polkadot/api-contract";
import { DecodedEvent } from "@polkadot/api-contract/types";

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
}

export type MethodExecutionState = "pending" | "dry running" | "gas estimated" | "submitting" | "success" | "failure";

interface MethodExecutionStatus {
  deployedContractId: DeployedContractId;
  functionName: string;
  state: MethodExecutionState;
  events: ExecuctionEvent[];
  gasRequired?: WeightV2;
  transactionFee?: bigint;
  transactionResult?: string;
  failure?: string;
}

type ExecutionStatus =
  | { type: "contractDeployment"; status: ContractDeploymentStatus }
  | { type: "methodExecution"; status: MethodExecutionStatus };

function renderContractDeploymentStatus(
  contractDeploymentStatus: ContractDeploymentStatus,
  chainApi: ChainApi
): StyledText {
  const { contractFileId, deployedContractId, state, address, transactionFee, failure } = contractDeploymentStatus;
  return [
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
}

function renderMethodExecutionStatus(methodExecutionStatus: MethodExecutionStatus, chainApi: ChainApi): StyledText[] {
  const { deployedContractId, functionName, state, transactionResult, transactionFee, failure } = methodExecutionStatus;

  const firstLine: StyledText = [
    { text: "  🧰 " },
    { text: deployedContractId, color: "blue" },
    { text: "." },
    { text: functionName, color: "green" },
    ...(transactionFee !== undefined ? [{ text: ` [fee: ${chainApi.getAmountString(transactionFee)}]` }] : []),
    {
      text: ` ${failure ?? state}`,
      color: state === "success" ? "green" : state === "failure" ? "red" : "yellow",
      spinning: state === "dry running" || state === "submitting",
    },
    ...(transactionResult !== undefined ? [{ text: `, result: ${transactionResult}` }] : []),
  ];

  const result = [firstLine];

  methodExecutionStatus.events.forEach(({ args, deployedContractId, identifier }) => {
    result.push([
      { text: "    🎉 Event " },
      { text: deployedContractId, color: "blue" },
      { text: "." },
      { text: identifier, color: "green" },
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

export async function processScripts(
  scripts: [ScriptName, DeployScript][],
  getNamedAccounts: () => Promise<NamedAccounts>,
  network: Network,
  configFile: ConfigFile,
  chainApi: ChainApi,
  updateDynamicText: (newLines: StyledText[]) => void,
  addStaticText: (lines: StyledText[], removeDynamicText: boolean) => void
) {
  let executionStatuses: ExecutionStatus[] = [];
  const compiledContracts: Record<DeployedContractId, Promise<string>> = {};
  const deployedContracts: Record<DeployedContractId, Deployment> = {};

  const resolveContractEvent = (
    contractAddress: string,
    data: Buffer
  ): [DeployedContractId, DecodedEvent] | undefined => {
    for (const entry of Object.entries(deployedContracts)) {
      const [deployedContractId, deployment] = entry;
      if (addressesAreEqual(deployment.address, contractAddress, chainApi)) {
        return [deployedContractId, deployment.abi.decodeEvent(data)];
      }
    }
  };

  const updateDisplayedStatus = (asStaticText: boolean = false) => {
    const styledTexts = executionStatuses
      .map((executionStatus) => {
        switch (executionStatus.type) {
          case "contractDeployment":
            return [renderContractDeploymentStatus(executionStatus.status, chainApi)];

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
    };
    executionStatuses.push({ type: "contractDeployment", status: contractDeploymentStatus });

    updateDisplayedStatus();

    const updateContractStatus = (status: ContractDeploymentState) => {
      contractDeploymentStatus.state = status;
      updateDisplayedStatus();
    };

    const compiledContractFileName = await compileContract(args, configFile, compiledContracts, updateContractStatus);
    const { result, transactionFee } = await chainApi.instantiateWithCode(
      compiledContractFileName,
      args,
      configFile,
      updateContractStatus
    );

    contractDeploymentStatus.transactionFee = transactionFee;
    if (result.type === "error") {
      contractDeploymentStatus.failure = result.error;
      updateContractStatus("failure");

      throw new Error(`An error occurred deploying contract ${deployedContractId}`);
    }

    const compiledContractFile = await readFile(compiledContractFileName);
    const metadata = JSON.parse(compiledContractFile.toString("utf8"));

    const deployment: Deployment = {
      address: result.value,
      compiledContractFileName,
      metadata,
      abi: new Abi(metadata, chainApi.api().registry.getChainProperties()),
    };
    contractDeploymentStatus.address = result.value;
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

    const addEvent = (event: ExecuctionEvent) => {
      methodExecutionStatus.events.push(event);
      updateDisplayedStatus();
    };

    const { result, transactionFee } = await chainApi.executeContractFunction(
      contract,
      tx,
      functionName,
      configFile,
      resolveContractEvent,
      updateExecutionStatus,
      addEvent,
      ...rest
    );

    methodExecutionStatus.transactionFee = transactionFee;
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
      getNamedAccounts,
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
