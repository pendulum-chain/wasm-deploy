export interface NamedAccounts {
  deployer: string;
}

export interface Deployment {
  address: string;
}

export interface TxOptions {
  from?: string;
  log?: boolean;
}

export type ArgumentType = string | number | bigint;

export interface DeploymentArguments {
  from: string;
  contract: string;
  args: ArgumentType[];
  log: boolean;
}

export interface DeploymentsExtension {
  getOrNull(name: string): Promise<boolean>;
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
