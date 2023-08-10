import { KeyringPair } from "@polkadot/keyring/types";

import { PromiseMutex } from "./helpers/promiseMutex";
import { Abi } from "@polkadot/api-contract";
import { AnyJson } from "@polkadot/types-codec/types";

export type DeployedContractId = string;
export type ContractSourcecodeId = string;
export type NamedAccountId = string;
export type ScriptName = string;
export type Address = string;

export interface NamedAccount {
  accountId: Address;
  suri: string;
  keypair: KeyringPair;
  mutex: PromiseMutex;
}

export type NamedAccounts = Record<NamedAccountId, NamedAccount>;

export interface Deployment {
  address: Address;
  compiledContractFileName: string;
  metadata: Record<string, unknown>;
  abi: Abi;
}

export interface TxOptions {
  from: NamedAccount;
  log?: boolean;
}

export type ArgumentType = string | number | bigint | Array<ArgumentType> | Object;

export interface DeploymentArguments {
  from: NamedAccount;
  contract: ContractSourcecodeId;
  args: ArgumentType[];
  log: boolean;
  constructorName?: string;
}

export interface DeploymentsExtension {
  getOrNull(name: DeployedContractId): Promise<Deployment | null>;
  deploy(name: DeployedContractId, args: DeploymentArguments): Promise<Deployment>;
  get(name: DeployedContractId): Promise<Deployment>;
  execute(name: DeployedContractId, tx: TxOptions, functionName: string, ...rest: ArgumentType[]): Promise<void>;
}

export interface WasmDeployEnvironment {
  getNamedAccounts(): Promise<NamedAccounts>;
  deployments: DeploymentsExtension;
  network: Network;
}

export interface Network {
  name: string;
}

export type DeployScriptFunction = {
  tags: string[];
  skip(environment: WasmDeployEnvironment): Promise<boolean>;
  (environment: WasmDeployEnvironment): Promise<void>;
};

export interface DeployScript {
  default: DeployScriptFunction;
}

export interface Limits {
  gas: {
    refTime: number | string;
    proofSize: number | string;
  };
  storageDeposit?: number | string | null;
}

export interface ConfigFile {
  contracts: Record<ContractSourcecodeId, string>;
  importpaths: string[];
  networks: Record<string, NetworkConfig>;
  buildFolder: string;
  limits: Limits;
}

export type NamedAccountConfig =
  | string
  | {
      address: string;
      suri?: string;
    };

export interface NetworkConfig {
  namedAccounts: Record<NamedAccountId, NamedAccountConfig>;
  rpcUrl: string;
}

export interface ExecuctionEvent {
  deployedContractId: DeployedContractId;
  identifier: string;
  args: { name: string; value: AnyJson }[];
}
