import { ApiPromise } from "@polkadot/api";
import { BN_ZERO } from "@polkadot/util";
import { ContractPromise } from "@polkadot/api-contract";
import { Event } from "@polkadot/types/interfaces";
import { AnyJson } from "@polkadot/types-codec/types";
import { Abi } from "@polkadot/api-contract";

import { PanicCode, rpcCall } from "./contractRpc.js";
import {
  Extrinsic,
  GenericSigner,
  KeyPairSigner,
  SubmitExtrinsicStatus,
  SubmitExtrinsicResult,
  submitExtrinsic,
} from "./submitExtrinsic.js";
import { addressEq } from "@polkadot/util-crypto";
import { basicDeployContract } from "./deployContract.js";

export {
  PanicCode,
  Extrinsic,
  GenericSigner,
  KeyPairSigner,
  SubmitExtrinsicStatus,
  SubmitExtrinsicResult,
  submitExtrinsic,
};

export type Address = string;

export interface Limits {
  gas: {
    refTime: string | number;
    proofSize: string | number;
  };
  storageDeposit?: string | number;
}

export interface DecodedContractEvent {
  eventIdentifier: string;
  args: { name: string; value: AnyJson }[];
}

export interface ContractEvent {
  emittingContractAddress: Address;
  data: Buffer;
  decoded?: DecodedContractEvent;
}

export interface DeployContractOptions {
  abi: Abi;
  api: ApiPromise;
  signer: KeyPairSigner | GenericSigner;
  constructorArguments: unknown[];
  constructorName?: string;
  limits: Limits;
  modifyExtrinsic?: (extrinsic: Extrinsic) => Extrinsic;
  lookupAbi?: (contractAddress: Address) => Abi | undefined;
}

export type DeployContractResult =
  | { type: "success"; events: ContractEvent[]; deploymentAddress: Address; transactionFee: bigint | undefined }
  | { type: "error"; error: string }
  | { type: "reverted"; description: string }
  | { type: "panic"; errorCode: PanicCode; explanation: string };

export interface MessageCallOptions {
  abi: Abi;
  api: ApiPromise;
  contractDeploymentAddress: Address;
  callerAddress: Address;
  getSigner: () => Promise<KeyPairSigner | GenericSigner>;
  messageName: string;
  messageArguments: unknown[];
  limits: Limits;
  modifyExtrinsic?: (extrinsic: Extrinsic) => Extrinsic;
  lookupAbi?: (contractAddress: Address) => Abi | undefined;
}

export type MessageCallResult = {
  execution:
    | { type: "onlyQuery" }
    | { type: "extrinsic"; contractEvents: ContractEvent[]; transactionFee: bigint | undefined };
  result:
    | { type: "success"; value: any }
    | { type: "error"; error: string }
    | { type: "reverted"; description: string }
    | { type: "panic"; errorCode: PanicCode; explanation: string };
};

function decodeContractEvents(
  events: Event[],
  lookupAbi?: (contractAddress: Address) => Abi | undefined
): ContractEvent[] {
  return events
    .filter(({ section, method }) => section === "contracts" && method === "ContractEmitted")
    .map(({ data }): ContractEvent => {
      const dataJson = data.toHuman() as { contract: string; data: string };
      const emittingContractAddress = dataJson.contract;
      const buffer = Buffer.from(dataJson.data.slice(2), "hex");

      const abi = lookupAbi?.(emittingContractAddress);
      if (abi === undefined) {
        return {
          emittingContractAddress,
          data: buffer,
        };
      }
      const decodedEvent = abi.decodeEvent(buffer);

      return {
        emittingContractAddress,
        data: buffer,
        decoded: {
          args: decodedEvent.event.args.map((arg, index) => ({
            name: arg.name,
            value: decodedEvent.args[index].toHuman(),
          })),
          eventIdentifier: decodedEvent.event.identifier,
        },
      };
    });
}

export async function deployContract({
  signer,
  api,
  abi,
  constructorArguments,
  constructorName,
  limits,
  modifyExtrinsic,
  lookupAbi,
}: DeployContractOptions): Promise<DeployContractResult> {
  const result = await basicDeployContract({
    api,
    abi,
    constructorArguments,
    constructorName,
    limits,
    signer,
    modifyExtrinsic,
  });

  switch (result.type) {
    case "panic":
    case "reverted":
    case "error":
      return result;
  }

  const extendedLookupAbi = (contractAddress: Address): Abi | undefined => {
    if (addressEq(contractAddress, result.deploymentAddress)) {
      return abi;
    }

    return lookupAbi?.(contractAddress);
  };

  return { ...result, events: decodeContractEvents(result.events, extendedLookupAbi) };
}

export async function messageCall({
  abi,
  api,
  contractDeploymentAddress,
  messageArguments,
  messageName,
  limits,
  callerAddress,
  getSigner,
  modifyExtrinsic,
  lookupAbi,
}: MessageCallOptions): Promise<MessageCallResult> {
  const contract = new ContractPromise(api, abi, contractDeploymentAddress);

  const { gasRequired, output } = await rpcCall({
    api,
    abi,
    contractAddress: contractDeploymentAddress,
    callerAddress,
    limits,
    messageName,
    messageArguments,
  });

  switch (output.type) {
    case "reverted":
      return { execution: { type: "onlyQuery" }, result: output };
    case "panic":
      return { execution: { type: "onlyQuery" }, result: output };
    case "error":
      return {
        execution: { type: "onlyQuery" },
        result: { type: "error", error: output.description ?? "unknown" },
      };
  }

  const message = abi.findMessage(messageName);
  if (!message.isMutating) {
    return { execution: { type: "onlyQuery" }, result: output };
  }

  const signer = await getSigner();

  const typesAddress = api.registry.createType("AccountId", contractDeploymentAddress);
  let extrinsic = api.tx.contracts.call(
    typesAddress,
    BN_ZERO,
    gasRequired,
    limits.storageDeposit,
    contract.abi.findMessage(messageName).toU8a(messageArguments)
  );

  if (modifyExtrinsic) {
    extrinsic = modifyExtrinsic(extrinsic);
  }
  const { events, status, transactionFee } = await submitExtrinsic(extrinsic, signer);

  return {
    execution: { type: "extrinsic", contractEvents: decodeContractEvents(events, lookupAbi), transactionFee },
    result: status.type === "success" ? { type: "success", value: output.value } : status,
  };
}
