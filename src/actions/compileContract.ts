import { join, basename } from "node:path";
import { readFile, writeFile, rename } from "node:fs/promises";
import blake2b from "blake2b";

import { runCommand } from "../helpers/childProcess";
import { DeploymentArguments } from "../types";
import { ContractDeploymentState } from "../processScripts";
import { ConfigFile, Project } from "../project";

export async function compileContract(
  args: DeploymentArguments,
  project: Project,
  compiledContracts: Record<string, Promise<string>>,
  updateContractStatus: (status: ContractDeploymentState) => void
): Promise<string> {
  const { contract } = args;
  const uploadedCodePromise = (await compiledContracts[contract])?.trim();

  if (uploadedCodePromise === undefined) {
    let resolve: (value: string) => void;
    compiledContracts[contract] = new Promise<string>((_resolve) => (resolve = _resolve));
    const codeHash = await actuallyCompileContract(args, project, updateContractStatus);
    resolve!(codeHash);

    return codeHash;
  }

  return uploadedCodePromise;
}

async function actuallyCompileContract(
  args: DeploymentArguments,
  project: Project,
  updateContractStatus: (status: ContractDeploymentState) => void
): Promise<string> {
  const { contract } = args;

  const contractSourceName = project.getContractSourcePath(contract);
  const builtFileName = join(project.getTempFolder(), basename(contractSourceName));

  const builtWasmFileName = builtFileName.replace(/.sol$/, ".wasm");
  const builtMetadataFileName = builtFileName.replace(/.sol$/, ".contract");

  const wasmFileName = join(project.getBuildFolder(), `${contract}.wasm`);
  const metadataFileName = join(project.getBuildFolder(), `${contract}.contract`);
  const optimizedWasmFileName = join(project.getBuildFolder(), `${contract}.optimized.wasm`);

  const importpaths = project.getImportPaths();
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
    project.getTempFolder(),
    ...importpaths.map((path) => ["--importpath", path]).flat(),
    contractSourceName,
  ]);
  updateContractStatus("compiled");

  if (solangResult.exitCode !== 0) {
    throw new Error(`Solang error: ${solangResult.stdout}, ${solangResult.stderr}`);
  }

  await Promise.all([rename(builtWasmFileName, wasmFileName), rename(builtMetadataFileName, metadataFileName)]);

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
