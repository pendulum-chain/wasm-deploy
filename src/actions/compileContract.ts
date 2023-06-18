import { join, basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import blake2b from "blake2b";

import { runCommand } from "../helpers/childProcess";
import { ConfigFile, DeploymentArguments } from "../types";
import { DeploymentState } from "..";

export async function compileContract(
  args: DeploymentArguments,
  configFile: ConfigFile,
  compiledContracts: Record<string, Promise<string>>,
  updateContractStatus: (status: DeploymentState) => void
): Promise<string> {
  const { contract } = args;
  const uploadedCodePromise = (await compiledContracts[contract])?.trim();

  if (uploadedCodePromise === undefined) {
    let resolve: (value: string) => void;
    compiledContracts[contract] = new Promise<string>((_resolve) => (resolve = _resolve));
    const codeHash = await actuallyCompileContract(args, configFile, updateContractStatus);
    resolve!(codeHash);

    return codeHash;
  }

  return uploadedCodePromise;
}

async function actuallyCompileContract(
  args: DeploymentArguments,
  configFile: ConfigFile,
  updateContractStatus: (status: DeploymentState) => void
): Promise<string> {
  const { contract } = args;
  const contractSourceName = configFile.contracts[contract];
  const builtFileName = join(configFile.buildFolder, basename(contractSourceName));

  const wasmFileName = builtFileName.replace(/.sol$/, ".wasm");
  const optimizedWasmFileName = builtFileName.replace(/.sol$/, ".optimized.wasm");
  const metadataFileName = builtFileName.replace(/.sol$/, ".contract");

  const { importpaths } = configFile;
  updateContractStatus("compiling");
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
  updateContractStatus("compiled");

  if (solangResult.exitCode !== 0) {
    throw new Error(`Solang error: ${solangResult.stdout}, ${solangResult.stderr}`);
  }

  updateContractStatus("optimizing");
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
    throw new Error(`Wasm-opt error: ${wasmOptResult.stdout}, ${wasmOptResult.stderr}`);
  }
  updateContractStatus("optimized");

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
