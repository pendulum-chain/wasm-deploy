import { join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import blake2b from "blake2b";

import { runCommand } from "../helpers/childProcess";
import { ConfigFile, DeploymentArguments } from "../types";

export async function compileContract(
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

  return metadataFileName;
}
