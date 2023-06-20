import { KeyringPair } from "@polkadot/keyring/types";

import { PromiseMutex } from "./helpers/promiseMutex";

export interface NamedAccount {
  accountId: string;
  suri: string;
  keypair: KeyringPair;
  mutex: PromiseMutex;
}

export type NamedAccounts = Record<string, NamedAccount>;

export interface Deployment {
  address: string;
  compiledContractFileName: string;
}

export interface TxOptions {
  from: NamedAccount;
  log?: boolean;
}

export type ArgumentType = string | number | bigint;

export interface DeploymentArguments {
  from: NamedAccount;
  contract: string;
  args: ArgumentType[];
  log: boolean;
  constructorName?: string;
}

export interface DeploymentsExtension {
  getOrNull(name: string): Promise<Deployment | null>;
  deploy(name: string, args: DeploymentArguments): Promise<Deployment>;
  get(name: string): Promise<Deployment>;
  execute(name: string, tx: TxOptions, functionName: string, ...rest: ArgumentType[]): Promise<void>;
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
  contracts: Record<string, string>;
  importpaths: string[];
  networks: Record<string, NetworkConfig>;
  buildFolder: string;
  limits: Limits;
}

export interface NetworkConfig {
  namedAccounts: Record<string, string>;
  rpcUrl: string;
}
