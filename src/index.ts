import { join } from "node:path";
import { readdir } from "node:fs/promises";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { cryptoWaitReady } from "@polkadot/util-crypto";

import { ConfigFile, DeployScript, NamedAccounts } from "./types";
import { PromiseMutex } from "./helpers/promiseMutex";
import { connectToChain } from "./api";
import { createAnimatedTextContext } from "./helpers/terminal";
import { processScripts } from "./processScripts";
export { WasmDeployEnvironment } from "./types";

async function scanProjectDir(
  projectDir: string
): Promise<{ scripts: [string, DeployScript][]; configFile: ConfigFile }> {
  console.log(`Scan project in folder "${projectDir}"`);

  const entries = await readdir(projectDir, { recursive: true, withFileTypes: true });
  const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

  const files: [string, any][] = await Promise.all(
    fileNames.map(async (file) => {
      const path = join(projectDir, file);
      const imports = await import(path);
      return [file, imports];
    })
  );

  const scripts: [string, DeployScript][] = [];
  let configFile: ConfigFile | undefined = undefined;

  for (const pair of files) {
    const [fileName, imports] = pair;
    if (fileName === "config.json") {
      configFile = imports as ConfigFile;
    } else {
      scripts.push([fileName, imports]);
    }
  }

  if (configFile === undefined) {
    throw new Error("No config.json file found in project directory");
  }

  for (const contractName of Object.keys(configFile.contracts)) {
    configFile.contracts[contractName] = join(projectDir, configFile.contracts[contractName]);
  }

  return { scripts, configFile };
}

async function main() {
  const file = process.argv[2];
  const { scripts, configFile } = await scanProjectDir(join(__dirname, "..", file));

  const networkName = process.argv[3];
  const network = { name: networkName };

  const { networks } = configFile;
  if (networks[networkName] === undefined) {
    throw new Error(`Unknown network name ${networkName}`);
  }

  const networkConfig = networks[networkName];

  await cryptoWaitReady();
  const chainApi = await connectToChain(networkConfig.rpcUrl);

  const namedAccounts: NamedAccounts = {};
  for (const key of Object.keys(networkConfig.namedAccounts)) {
    const accountId = networkConfig.namedAccounts[key];
    const rl = readline.createInterface({ input, output });
    const suri = (await rl.question(`Enter the secret key URI for named account "${key}" (${accountId}): `)).trim();
    rl.close();

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

  const successful = await createAnimatedTextContext(async (updateText) => {
    await processScripts(scripts, getNamedAccounts, network, configFile, chainApi, updateText);
  });

  if (successful) {
    console.log("Deployment successful!");
  }
  process.exit();
}

main();
