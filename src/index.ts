import { cryptoWaitReady } from "@polkadot/util-crypto";
import { parseCommandLine } from "./commandLine";
export type { WasmDeployEnvironment } from "./commands/deploy";

export type { TestContract, TestSuiteEnvironment } from "./commands/test";
export * from "./testing/stdLib";
export type { DeploymentsExtension, Network, TxOptions } from "./commands/deploy";

async function main() {
  await cryptoWaitReady();
  parseCommandLine();
}

main().catch((error) => console.log(error));
