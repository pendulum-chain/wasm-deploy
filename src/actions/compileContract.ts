import { join, basename } from "node:path";
import { readFile, writeFile, rename, copyFile } from "node:fs/promises";
import blake2b from "blake2b";

import { runCommand } from "../utils/childProcess";
import { ContractSourcecodeId } from "../types";
import { ContractDeploymentState } from "../processScripts";
import { Project } from "../project";
import { getLocalConfiguration } from "../utils/localConfiguration";

export async function compileContract(
  contractId: ContractSourcecodeId,
  project: Project,
  compiledContracts: Record<ContractSourcecodeId, Promise<string>>,
  updateContractStatus: (status: ContractDeploymentState) => void
): Promise<string> {
  const uploadedCodePromise =
    compiledContracts[contractId] !== undefined ? (await compiledContracts[contractId]).trim() : undefined;

  if (uploadedCodePromise === undefined) {
    let resolve: (value: string) => void;
    compiledContracts[contractId] = new Promise<string>((_resolve) => (resolve = _resolve));
    const codeHash = await actuallyCompileContract(contractId, project, updateContractStatus);
    resolve!(codeHash);

    return codeHash;
  }

  return uploadedCodePromise;
}

export interface MessageMetadataArgument {
  label?: string;
}

export interface MessageMetadata {
  mutates?: boolean;
  label?: string;
  selector: string;
  args: MessageMetadataArgument[];
}

export interface MetadataFile {
  source?: {
    hash?: string;
    wasm?: string;
  };
  spec: {
    messages?: MessageMetadata[];
  };
}

async function actuallyCompileContract(
  contractId: ContractSourcecodeId,
  project: Project,
  updateContractStatus: (status: ContractDeploymentState) => void
): Promise<string> {
  const contractSourceName = project.getContractSourcePath(contractId);
  const builtFileName = join(project.getTempFolder(), basename(contractSourceName));

  const builtWasmFileName = builtFileName.replace(/.sol$/, ".wasm");
  const builtMetadataFileName = builtFileName.replace(/.sol$/, ".contract");

  const wasmFileName = join(project.getBuildFolder(), `${contractId}.wasm`);
  const metadataFileName = join(project.getBuildFolder(), `${contractId}.contract`);
  const optimizedWasmFileName = join(project.getBuildFolder(), `${contractId}.optimized.wasm`);

  const importpaths = project.getImportPaths(contractId);
  const importmaps = project.getImportMaps(contractId);

  if (project.isContractPrecompiled(contractId)) {
    await copyFile(contractSourceName, metadataFileName);
    return metadataFileName;
  }

  const { solangPath } = await getLocalConfiguration();

  updateContractStatus("compiling");
  const solangResult = await runCommand([
    solangPath,
    "compile",
    "--no-strength-reduce", // temporary fix for https://github.com/hyperledger/solang/issues/1507
    "--target",
    "polkadot",
    "-O",
    "aggressive",
    "--release",
    "--output",
    project.getTempFolder(),
    ...importpaths.map((path) => ["--importpath", path]).flat(),
    ...importmaps.map(({ from, to }) => ["--importmap", `${from}=${to}`]).flat(),
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
  const metadata = JSON.parse(metadataFile.toString("utf8")) as MetadataFile;
  if (metadata.source === undefined) {
    metadata.source = {};
  }
  metadata.source.hash = codeHexHash;
  metadata.source.wasm = hexContract;

  const { mutatingOverwrites, messageNameOverwrites, argumentNameOverwrites } =
    project.getContractConfiguration(contractId);
  if (mutatingOverwrites !== undefined) {
    Object.entries(mutatingOverwrites).forEach(([messageLabel, mutates]) => {
      const foundMessage = metadata.spec.messages?.find((message) => message.label === messageLabel);
      if (foundMessage !== undefined && mutates !== undefined) {
        foundMessage.mutates = mutates;
      }
    });
  }

  if (messageNameOverwrites !== undefined) {
    Object.entries(messageNameOverwrites).forEach(([messageLabel, newLabel]) => {
      const foundMessage = metadata.spec.messages?.find((message) => message.label === messageLabel);
      if (foundMessage !== undefined) {
        foundMessage.label = newLabel;
      }
    });
  }

  if (argumentNameOverwrites !== undefined) {
    Object.entries(argumentNameOverwrites).forEach(([messageLabel, newArgumentNames]) => {
      if (newArgumentNames === undefined) return;

      const foundMessage = metadata.spec.messages?.find((message) => message.label === messageLabel);
      if (foundMessage !== undefined && foundMessage.args.length === newArgumentNames.length) {
        for (let i = 0; i < newArgumentNames.length; i++) {
          foundMessage.args[i].label = newArgumentNames[i];
        }
      }
    });
  }

  await writeFile(metadataFileName, JSON.stringify(metadata, null, 2));

  return metadataFileName;
}
