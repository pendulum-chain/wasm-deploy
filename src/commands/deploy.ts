import { join } from "node:path";
import { readdir } from "node:fs/promises";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { cryptoWaitReady } from "@polkadot/util-crypto";

import { DeployScript, NamedAccountId, NamedAccounts, ScriptName } from "../types";
import { connectToChain } from "../api";
import { rawAddressesAreEqual } from "../helpers/addresses";
import { createAnimatedTextContext } from "../helpers/terminal";
import { PromiseMutex } from "../helpers/promiseMutex";
import { processScripts } from "../processScripts";
import { ConfigFile, initializeProject } from "../project";

export interface DeployOptions {
  projectFolder: string;
  network: string;
}

export async function deploy(options: DeployOptions) {
  const project = await initializeProject(options.projectFolder);

  const networkName = options.network;
  const network = { name: networkName };
  const networkConfig = project.getNetworkDefinition(networkName);

  await cryptoWaitReady();
  const chainApi = await connectToChain(networkConfig.rpcUrl);

  const namedAccounts: NamedAccounts = {};
  for (const key of Object.keys(networkConfig.namedAccounts) as NamedAccountId[]) {
    const namedAccountConfig = networkConfig.namedAccounts[key];

    const accountId = typeof namedAccountConfig === "string" ? namedAccountConfig : namedAccountConfig.address;
    let suri = typeof namedAccountConfig === "string" ? undefined : namedAccountConfig.suri;
    if (suri === undefined) {
      while (true) {
        const rl = readline.createInterface({ input, output });
        suri = (await rl.question(`Enter the secret key URI for named account "${key}" (${accountId}): `)).trim();
        rl.close();

        const keyRingPair = chainApi.getKeyring().addFromUri(suri);
        const publicKey = chainApi.getKeyring().addFromAddress(accountId);
        if (!rawAddressesAreEqual(keyRingPair.addressRaw, publicKey.addressRaw)) {
          console.log(`Invalid suri for address ${accountId}`);
        } else {
          break;
        }
      }
    }

    namedAccounts[key] = {
      accountId,
      suri,
      keypair: chainApi.getKeyring().addFromUri(suri),
      mutex: new PromiseMutex(),
    };
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
