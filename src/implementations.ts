import { join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import blake2b from "blake2b";

import { runCommand } from "./helpers/childProcess";
import { ConfigFile, Deployment, DeploymentArguments, Network, TxOptions } from "./types";

export async function compileContrac(
  args: DeploymentArguments,
  configFile: ConfigFile,
  compiledContracts: Record<string, Promise<string>>
): Promise<string> {
  const { contract } = args;
  const uploadedCodePromise = (await compiledContracts[contract])?.trim();

  if (uploadedCodePromise === undefined) {
    let resolve: (value: string) => void;
    compiledContracts[contract] = new Promise<string>((_resolve) => (resolve = _resolve));
    const codeHash = await actuallyCompileContract(args, configFile);
    resolve!(codeHash);

    return codeHash;
  }

  return uploadedCodePromise;
}

async function actuallyCompileContract(args: DeploymentArguments, configFile: ConfigFile): Promise<string> {
  const { contract } = args;
  const contractSourceName = configFile.contracts[contract];
  const builtFileName = join(configFile.buildFolder, basename(contractSourceName));

  const wasmFileName = builtFileName.replace(/.sol$/, ".wasm");
  const optimizedWasmFileName = builtFileName.replace(/.sol$/, ".optimized.wasm");
  const metadataFileName = builtFileName.replace(/.sol$/, ".contract");

  const { importpaths } = configFile;
  console.log(`  Compile contract ${contract}`);
  const solangResult = await runCommand([
    "solang",
    "compile",
    "--target",
    "substrate",
    "-O",
    "aggressive",
    "--release",
    "--output",
    configFile.buildFolder,
    ...importpaths.map((path) => ["--importpath", path]).flat(),
    contractSourceName,
  ]);

  if (solangResult.exitCode !== 0) {
    console.log(solangResult.stdout, solangResult.stderr);
    throw new Error("Solang error, abort");
  }

  console.log(`  Optimize contract ${contract}`);
  const wasmOptResult = await runCommand([
    "wasm-opt",
    "-Oz",
    "--zero-filled-memory",
    "--mvp-features",
    "--output",
    optimizedWasmFileName,
    wasmFileName,
  ]);

  if (wasmOptResult.exitCode !== 0) {
    console.log(wasmOptResult.stdout, wasmOptResult.stderr);
    throw new Error("Wasm-opt error, abort");
  }

  const optimizedContract = await readFile(optimizedWasmFileName);

  const hexContract = `0x${optimizedContract.toString("hex")}`;
  const codeHash = blake2b(32).update(Uint8Array.from(optimizedContract)).digest();
  const codeHexHash = Array.from(codeHash).reduce((acc, byte) => acc + byte.toString(16).padStart(2, "0"), "0x");

  const metadataFile = await readFile(metadataFileName);
  const metadata = JSON.parse(metadataFile.toString("utf8"));
  metadata.source.hash = codeHexHash;
  metadata.source.wasm = hexContract;
  await writeFile(metadataFileName, JSON.stringify(metadata, null, 2));

  return codeHexHash;
}

export async function deployContract(
  name: string,
  args: DeploymentArguments,
  configFile: ConfigFile,
  network: Network,
  codeHash: string
): Promise<Deployment> {
  const { contract, from: deployer, args: constructorArguments } = args;
  if (deployer === undefined) {
    throw new Error(`Unknown deployer account`);
  }

  const contractFile = configFile.contracts[contract];
  const metadataFileName = join(configFile.buildFolder, basename(contractFile).replace(".sol", ".contract"));

  await deployer.mutex.exclusive(async () => {
    console.log(`  Instantiate contract ${name} from ${contract}`);

    const cargoContractResult = await runCommand([
      "cargo",
      "contract",
      "instantiate",
      "--constructor",
      "new",
      "--suri",
      deployer.suri,
      "--url",
      configFile.networks[network.name].rpcUrl,
      "--skip-confirm",
      "-x",
      "--manifest-path",
      ".",
      ...constructorArguments.map((arg) => ["--args", String(arg)]).flat(),
      //"--code-hash",
      //codeHash,
      metadataFileName,
    ]);

    console.log("STDOUT");
    console.log(cargoContractResult.stdout);
    console.log("STDERR");
    console.log(cargoContractResult.stderr);

    if (
      cargoContractResult.stderr &&
      !cargoContractResult.stderr.startsWith("ERROR: This contract has already been uploaded with code hash")
    ) {
      console.log(cargoContractResult.stdout, cargoContractResult.stderr);
      throw new Error("Cargo contract error, abort");
    }
  });

  // replace the following lines
  await new Promise((resolve) => setTimeout(resolve, 500));

  let fakeAddress = "0x";
  for (let i = 0; i < 32; i++)
    fakeAddress += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");

  return { address: fakeAddress } as any;
}

export async function executeContractFunction(name: Deployment, tx: TxOptions, functionName: string, ...rest: any[]) {
  // TODO
}
