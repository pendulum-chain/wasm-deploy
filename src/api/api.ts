import { WsProvider, ApiPromise, Keyring } from "@polkadot/api";
import { u8aConcat } from "@polkadot/util";
import { Abi } from "@polkadot/api-contract";

import { Address } from "../types";
import { computeQuotient } from "../utils/rationals";
import { Project } from "../project";
import {
  SigningSubmitter,
  Submitter,
  extractSigningSubmitter,
  getSubmitterAddress,
  modifyExtrinsic,
} from "./submitter";
import {
  DeployContractResult,
  MessageCallResult,
  SubmitExtrinsicResult,
  deployContract,
  messageCall,
  submitExtrinsic,
} from "@pendulum-chain/api-solang";

export interface DeployedContractInformation<MetadataId, DeployedContractId> {
  deploymentAddress: string;
  id: DeployedContractId;
  contractMetadataId: MetadataId;
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

export interface MessageCallOptions {
  deploymentAddress: Address;
  submitter: Submitter;
  messageName: string;
  messageArguments: unknown[];
  project: Project;
  onReadyToSubmit?(): void;
}

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

  const lookupAbi = (contractAddress: Address): Abi | undefined => {
    const deployedContract = deployedContracts[contractAddress];
    if (deployedContract === undefined) {
      return undefined;
    }

    return contractMetadataPool[deployedContract.contractMetadataId];
  };

  const encodeContractEvent = (
    contractMetadataId: MetadataId,
    eventIdentifier: string,
    args: unknown[]
  ): Uint8Array => {
    const contractMetadada = contractMetadataPool[contractMetadataId];
    if (contractMetadada === undefined) {
      throw new Error(`No contract metadata for ${String(contractMetadataId)}`);
    }

    const event = contractMetadada.events.find((event) => event.identifier === eventIdentifier);
    if (event === undefined) {
      throw new Error(`Event not defined ${eventIdentifier}`);
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

    getSS58Encoding(binaryAddress: Uint8Array): string {
      return keyring.addFromAddress(binaryAddress).address;
    },

    registerMetadata(contractMetadataId: MetadataId, metadataString: string) {
      if (contractMetadataPool[contractMetadataId] !== undefined) {
        return;
      }
      const metadata = JSON.parse(metadataString) as Record<string, unknown>;
      contractMetadataPool[contractMetadataId] = new Abi(metadata, api.registry.getChainProperties());
    },

    getContractMessages(contractMetadataId: MetadataId): string[] {
      const contractMetadata = contractMetadataPool[contractMetadataId];
      if (contractMetadata === undefined) {
        return [];
      }

      return contractMetadata.messages.map((message) => message.identifier);
    },

    async getBlockNumber(): Promise<bigint> {
      const block = await api.rpc.chain.getBlock();
      const skippedBlocks = await api.query.contracts.skippedBlocks();
      return BigInt(skippedBlocks.toPrimitive() as number) + block.block.header.number.toBigInt();
    },

    encodeContractEvent(deploymentAddress: Address, eventIdentifier: string, args: unknown[]): Uint8Array {
      const deployedContract = deployedContracts[deploymentAddress];
      if (deployedContract === undefined) {
        throw new Error(`Unknown contract at address ${deploymentAddress}`);
      }

      return encodeContractEvent(deployedContract.contractMetadataId, eventIdentifier, args);
    },

    lookupIdOfDeployedContract(deploymentAddress: Address): DeployedContractId | undefined {
      const deployedContract = deployedContracts[deploymentAddress];
      if (deployedContract === undefined) {
        return undefined;
      }
      return deployedContract.id;
    },

    async deployContract({
      constructorArguments,
      contractMetadataId,
      deployedContractId,
      project,
      submitter,
      constructorName,
      onStartingDeployment,
    }: DeployContractOptions<MetadataId, DeployedContractId>): Promise<DeployContractResult> {
      const contractMetadata = contractMetadataPool[contractMetadataId];
      if (contractMetadata === undefined) {
        throw new Error(`Contract metadata for ${String(contractMetadataId)} undefined`);
      }

      const signingSubmitter = extractSigningSubmitter(submitter);

      const result = await signingSubmitter.mutex.exclusive<DeployContractResult>(async () => {
        onStartingDeployment?.();

        return await deployContract({
          signer: {
            type: "keypair",
            keypair: signingSubmitter.keypair,
          },
          api,
          abi: contractMetadata,
          constructorArguments,
          constructorName,
          limits: project.getLimits(),
          modifyExtrinsic: modifyExtrinsic.bind(null, api, submitter),
          lookupAbi,
        });
      });

      if (result.type === "success") {
        const { deploymentAddress } = result;
        deployedContracts[deploymentAddress] = { contractMetadataId, deploymentAddress, id: deployedContractId };
      }

      return result;
    },

    async setFreeBalance(
      address: Address,
      amount: bigint,
      rootSigningSubmitter: SigningSubmitter
    ): Promise<SubmitExtrinsicResult> {
      const setBalanceExtrinsic = api.tx.balances.setBalance(address, amount, 0);
      const sudoExtrinsic = api.tx.sudo.sudoUncheckedWeight(setBalanceExtrinsic, 0);

      return rootSigningSubmitter.mutex.exclusive<SubmitExtrinsicResult>(async () =>
        submitExtrinsic(sudoExtrinsic, {
          type: "keypair",
          keypair: rootSigningSubmitter.keypair,
        })
      );
    },

    async skipBlocks(
      noOfBlocks: bigint | number,
      rootSigningSubmitter: SigningSubmitter
    ): Promise<SubmitExtrinsicResult> {
      const setBalanceExtrinsic = api.tx.contracts.skipBlocks(noOfBlocks);
      const sudoExtrinsic = api.tx.sudo.sudoUncheckedWeight(setBalanceExtrinsic, 0);

      return rootSigningSubmitter.mutex.exclusive<SubmitExtrinsicResult>(async () =>
        submitExtrinsic(sudoExtrinsic, {
          type: "keypair",
          keypair: rootSigningSubmitter.keypair,
        })
      );
    },

    async messageCall({
      messageArguments,
      deploymentAddress,
      messageName,
      project,
      submitter,
      onReadyToSubmit,
    }: MessageCallOptions): Promise<MessageCallResult> {
      const deployedContract = deployedContracts[deploymentAddress];
      if (deployedContract === undefined) {
        throw new Error(`Unknown contract at address ${deploymentAddress}`);
      }

      const contractMetadata = contractMetadataPool[deployedContract.contractMetadataId];
      if (contractMetadata === undefined) {
        throw new Error(`Unknown contract metadata for id ${String(deployedContract.contractMetadataId)}`);
      }

      const signingSubmitter = extractSigningSubmitter(submitter);

      try {
        return await messageCall({
          abi: contractMetadata,
          api,
          messageArguments,
          contractDeploymentAddress: deploymentAddress,
          messageName,
          limits: project.getLimits(),
          callerAddress: getSubmitterAddress(submitter),
          getSigner: async () => {
            await signingSubmitter.mutex.startExclusive();
            onReadyToSubmit?.();
            return {
              type: "keypair",
              keypair: signingSubmitter.keypair,
            };
          },
          modifyExtrinsic: modifyExtrinsic.bind(null, api, submitter),
          lookupAbi,
        });
      } finally {
        signingSubmitter.mutex.endExclusive();
      }
    },
  };
}
