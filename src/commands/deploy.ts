import { Address, ArgumentType, ContractSourcecodeId, DeployedContractId, NamedAccount, NamedAccounts } from "../types";
import { connectToChain } from "../api/api";
import { createAnimatedTextContext } from "../utils/terminal";
import { processScripts } from "../processScripts";
import { initializeProject } from "../project";

export interface DeployOptions {
  projectFolder: string;
  network: string;
}

export interface Deployment {
  address: Address;
  compiledContractFileName: string;
}

export interface TxOptions {
  from: NamedAccount;
  log?: boolean;
}

export interface DeploymentArguments {
  from: NamedAccount;
  contract: ContractSourcecodeId;
  args: ArgumentType[];
  log?: boolean;
  constructorName?: string;
  allowReuse?: boolean;
  preDeployedAddress?: string;
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

export async function deploy(options: DeployOptions) {
  const project = await initializeProject(options.projectFolder);

  const networkName = options.network;
  const network = { name: networkName };
  const networkConfig = project.getNetworkDefinition(networkName);

  const chainApi = await connectToChain<ContractSourcecodeId, DeployedContractId>(networkConfig.rpcUrl);

  const signingSubmitters = await project.getAllSigningSubmitters(networkName, chainApi.getKeyring());

  const successful = await createAnimatedTextContext(async (updateDynamicText, addStaticText) => {
    await processScripts(
      await project.readDeploymentScripts(),
      signingSubmitters,
      network,
      project,
      chainApi,
      updateDynamicText,
      addStaticText
    );
  });

  if (successful) {
    console.log("Deployment successful!");
  }
  process.exit();
}
