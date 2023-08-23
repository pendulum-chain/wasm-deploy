import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { NamedAccountId, NamedAccounts } from "../types";
import { connectToChain } from "../api";
import { createAnimatedTextContext } from "../helpers/terminal";
import { processScripts } from "../processScripts";
import { initializeProject } from "../project";

export interface DeployOptions {
  projectFolder: string;
  network: string;
}

export async function deploy(options: DeployOptions) {
  const project = await initializeProject(options.projectFolder);

  const networkName = options.network;
  const network = { name: networkName };
  const networkConfig = project.getNetworkDefinition(networkName);

  const chainApi = await connectToChain(networkConfig.rpcUrl);

  const namedAccounts: NamedAccounts = {};
  for (const key of Object.keys(networkConfig.namedAccounts) as NamedAccountId[]) {
    namedAccounts[key] = await project.getFullNamedAccount(networkName, key, chainApi.getKeyring());
  }

  const getNamedAccounts = async function (): Promise<NamedAccounts> {
    return namedAccounts;
  };

  const successful = await createAnimatedTextContext(async (updateDynamicText, addStaticText) => {
    await processScripts(
      await project.readDeploymentScripts(),
      getNamedAccounts,
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
