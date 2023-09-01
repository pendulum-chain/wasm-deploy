import { WsProvider, ApiPromise, Keyring } from "@polkadot/api";
import { BN_ZERO, u8aConcat } from "@polkadot/util";
import { ContractPromise } from "@polkadot/api-contract";
import { Event, WeightV2 } from "@polkadot/types/interfaces";
import { AnyJson } from "@polkadot/types-codec/types";
import { Abi } from "@polkadot/api-contract";
import { KeyringPair } from "@polkadot/keyring/types";

import { Address } from "../types";
import { computeQuotient } from "../helpers/rationals";
import { Project } from "../project";
import { PanicCode, queryContract } from "./queryContract";
import { PromiseMutex } from "../helpers/promiseMutex";
import { SubmitTransactionStatus, submitTransaction } from "./submitTransaction";
import { basicDeployContract } from "./deployContract";
import { addressesAreEqual } from "../helpers/addresses";

export type SubmitTransactionResult<T> = {
  transactionFee: bigint | undefined;
  result: { type: "success"; value: T } | { type: "error"; error: string };
};

export interface Submitter {
  accountId: Address;
  keypair: KeyringPair;
  mutex: PromiseMutex;
}

export interface DeployedContractInformation<MetadataId, DeployedContractId> {
  deploymentAddress: string;
  id: DeployedContractId;
  contractMetadataId: MetadataId;
}

export interface DecodedContractEvent<DeployedContractId> {
  deployedContractId: DeployedContractId;
  eventIdentifier: string;
  args: { name: string; value: AnyJson }[];
}

export interface ContractEvent<DeployedContractId> {
  emittingContractAddress: Address;
  data: Buffer;
  decoded?: DecodedContractEvent<DeployedContractId>;
}

export interface DeployContractOptions<MetadataId, DeployedContractId> {
  deployedContractId: DeployedContractId;
  submitter: Submitter;
  contractMetadataId: MetadataId;
  constructorArguments: unknown[];
  constructorName?: string;
  project: Project;
  onStartingDeployment?: () => void;
}

export interface DeployContractResult<DeployedContractId> {
  contractEvents: ContractEvent<DeployedContractId>[];
  deploymentAddress: Address;
  transactionFee: bigint | undefined;
  status: SubmitTransactionStatus;
}

export interface MessageCallOptions {
  deploymentAddress: Address;
  submitter: Submitter;
  messageName: string;
  messageArguments: unknown[];
  project: Project;
  onReadyToSubmit?(): void;
  onPreflightExecuted?(gasRequired: WeightV2): void;
}

export type MessageCallResult<DeployedContractId> = {
  execution:
    | { type: "onlyQuery" }
    | { type: "extrinsic"; contractEvents: ContractEvent<DeployedContractId>[]; transactionFee: bigint | undefined };
  result:
    | { type: "success"; value: any }
    | { type: "error"; error: string }
    | { type: "reverted"; description: string }
    | { type: "panic"; errorCode: PanicCode };
};

type Key = string | number | symbol;

type ChainApiPromise<MetadataId extends Key, DeployedContractId> = ReturnType<
  typeof connectToChain<MetadataId, DeployedContractId>
>;
export type ChainApi<MetadataId extends Key, DeployedContractId> = ChainApiPromise<
  MetadataId,
  DeployedContractId
> extends Promise<infer T>
  ? T
  : never;

export async function connectToChain<MetadataId extends Key, DeployedContractId>(rpcUrl: string) {
  const provider = new WsProvider(rpcUrl);

  const api = await ApiPromise.create({
    provider: provider,
    noInitWarn: true,
  });

  const [chainProperties, ss58Prefix, chainName] = await Promise.all([
    api.rpc.system.properties(),
    api.consts.system.ss58Prefix,
    api.rpc.system.chain(),
  ]);

  const parsedSs58Prefix = Number.parseInt(ss58Prefix.toString() || "0", 10);

  const tokenDecimals = chainProperties.tokenDecimals
    .unwrapOrDefault()
    .toArray()
    .map((i) => i.toNumber());

  const nativeTokenDecimals = tokenDecimals[0] !== undefined ? BigInt(tokenDecimals[0]) : 12n;
  const unit = 10n ** nativeTokenDecimals;
  const milliUnit = 10n ** (nativeTokenDecimals - 3n);
  const microUnit = 10n ** (nativeTokenDecimals - 6n);

  const tokenSymbols = chainProperties.tokenSymbol
    .unwrapOrDefault()
    .toArray()
    .map((i) => i.toString());
  const mainTokenSymbol: string | undefined = tokenSymbols[0];

  const chainNameString = chainName.toString();

  console.log(`Connected to chain ${chainNameString}`);
  const keyring = new Keyring({ type: "sr25519", ss58Format: parsedSs58Prefix });

  const deployedContracts: Record<Address, DeployedContractInformation<MetadataId, DeployedContractId>> = {};
  const contractMetadataPool: Partial<Record<MetadataId, Abi>> = {};

  const decodeContractEvents = (events: Event[]): ContractEvent<DeployedContractId>[] => {
    return events
      .filter(({ section, method }) => section === "contracts" && method === "ContractEmitted")
      .map(({ data }): ContractEvent<DeployedContractId> => {
        const dataJson = data.toHuman() as { contract: string; data: string };
        const emittingContractAddress = dataJson.contract;
        const buffer = Buffer.from(dataJson.data.slice(2), "hex");

        for (const entry of Object.entries(deployedContracts)) {
          if (addressesAreEqual(entry[0], emittingContractAddress, keyring)) {
            const contractMetadataId = entry[1].contractMetadataId;
            const contractMetadada = contractMetadataPool[contractMetadataId];

            if (contractMetadada !== undefined) {
              const decodedEvent = contractMetadada.decodeEvent(buffer);

              return {
                emittingContractAddress,
                data: buffer,
                decoded: {
                  args: decodedEvent.event.args.map((arg, index) => ({
                    name: arg.name,
                    value: decodedEvent.args[index].toHuman(),
                  })),
                  deployedContractId: entry[1].id,
                  eventIdentifier: decodedEvent.event.identifier,
                },
              };
            }
          }
        }

        return {
          emittingContractAddress,
          data: buffer,
        };
      });
  };

  const encodeContractEvent = (
    contractMetadataId: MetadataId,
    eventIdentifier: string,
    args: unknown[]
  ): Uint8Array | undefined => {
    const contractMetadada = contractMetadataPool[contractMetadataId];
    if (contractMetadada === undefined) {
      return undefined;
    }

    const event = contractMetadada.events.find((event) => event.identifier === eventIdentifier);
    if (event === undefined) {
      return undefined;
    }

    if (event.args.length !== args.length) {
      throw new Error(
        `Event ${eventIdentifier} of contract ${String(contractMetadataId)} expects ${
          event.args.length
        } arguments (found ${args.length})`
      );
    }

    const encodedArgs = event.args.map(({ type: { lookupName, type } }, index) => {
      const value = api.registry.createType(lookupName || type, args[index]);
      return value.toU8a();
    });

    return u8aConcat(Uint8Array.from([event.index]), ...encodedArgs);
  };

  return {
    api() {
      return api;
    },

    getKeyring() {
      return keyring;
    },

    getAmountString(amount: bigint) {
      const quotient = computeQuotient(amount, unit, 10000);
      return mainTokenSymbol !== undefined ? `${quotient} ${mainTokenSymbol}` : quotient;
    },

    getUnits() {
      return {
        unit,
        milliUnit,
        microUnit,
      };
    },

    registerMetadata(contractMetadataId: MetadataId, metadataString: string) {
      if (contractMetadataPool[contractMetadataId] !== undefined) {
        return;
      }
      const metadata = JSON.parse(metadataString);
      contractMetadataPool[contractMetadataId] = new Abi(metadata, api.registry.getChainProperties());
    },

    getContractMessages(contractMetadataId: MetadataId): string[] {
      const contractMetadata = contractMetadataPool[contractMetadataId];
      if (contractMetadata === undefined) {
        return [];
      }

      return contractMetadata.messages.map((message) => message.identifier);
    },

    encodeContractEvent(deploymentAddress: Address, eventIdentifier: string, args: unknown[]): Uint8Array | undefined {
      const deployedContract = deployedContracts[deploymentAddress];
      if (deployedContract === undefined) {
        throw new Error(`Unknown contract at address ${deploymentAddress}`);
      }

      return encodeContractEvent(deployedContract.contractMetadataId, eventIdentifier, args);
    },

    async deployContract({
      constructorArguments,
      contractMetadataId,
      deployedContractId,
      project,
      submitter,
      constructorName,
      onStartingDeployment,
    }: DeployContractOptions<MetadataId, DeployedContractId>): Promise<DeployContractResult<DeployedContractId>> {
      const contractMetadata = contractMetadataPool[contractMetadataId];
      if (contractMetadata === undefined) {
        throw new Error(`Contract metadata for ${String(contractMetadataId)} undefined`);
      }

      const { events, deploymentAddress, status, transactionFee } = await basicDeployContract({
        api,
        contractMetadata,
        constructorArguments,
        constructorName,
        limits: project.getLimits(),
        submitter,
        onStartingDeployment,
      });

      deployedContracts[deploymentAddress] = { contractMetadataId, deploymentAddress, id: deployedContractId };

      return {
        contractEvents: decodeContractEvents(events),
        deploymentAddress,
        transactionFee,
        status,
      };
    },

    async messageCall({
      messageArguments,
      deploymentAddress,
      messageName,
      project,
      submitter,
      onReadyToSubmit,
      onPreflightExecuted,
    }: MessageCallOptions): Promise<MessageCallResult<DeployedContractId>> {
      const deployedContract = deployedContracts[deploymentAddress];
      if (deployedContract === undefined) {
        throw new Error(`Unknown contract at address ${deploymentAddress}`);
      }

      const contractMetadata = contractMetadataPool[deployedContract.contractMetadataId];
      if (contractMetadata === undefined) {
        throw new Error(`Unknown contract metadata for id ${String(deployedContract.contractMetadataId)}`);
      }

      const contract = new ContractPromise(api, contractMetadata, deploymentAddress);
      const limits = project.getLimits();

      const { gasRequired, output } = await queryContract({
        api,
        abi: contractMetadata,
        contractAddress: deploymentAddress,
        callerAddress: submitter.keypair.address,
        limits,
        messageName,
        messageArguments,
      });

      onPreflightExecuted?.(gasRequired);

      switch (output.type) {
        case "reverted":
          return { execution: { type: "onlyQuery" }, result: output };
        case "panic":
          return { execution: { type: "onlyQuery" }, result: output };
        case "error":
          return {
            execution: { type: "onlyQuery" },
            result: { type: "error", error: output.error?.type ?? "unknown" },
          };
      }

      const message = contractMetadata.findMessage(messageName);
      if (!message.isMutating) {
        return { execution: { type: "onlyQuery" }, result: output };
      }

      const typesAddress = api.registry.createType("AccountId", deploymentAddress);
      const extrinsic = api.tx.contracts.call(
        typesAddress,
        BN_ZERO,
        gasRequired,
        limits.storageDeposit,
        contract.abi.findMessage(messageName).toU8a(messageArguments)
      );

      const { events, status, transactionFee } = await submitTransaction({
        submitter,
        extrinsic,
        onReadyToSubmit,
      });

      return {
        execution: { type: "extrinsic", contractEvents: decodeContractEvents(events), transactionFee },
        result: status.type === "success" ? { type: "success", value: output.value } : status,
      };
    },
  };
}
