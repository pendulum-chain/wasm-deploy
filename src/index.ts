import { cryptoWaitReady } from "@polkadot/util-crypto";
import { parseCommandLine } from "./commandLine";
export { WasmDeployEnvironment } from "./commands/deploy";

export { TestContract, TestSuiteEnvironment } from "./commands/test";
export * from "./testing/stdLib";
export { DeploymentsExtension, Network, TxOptions } from "./commands/deploy";

async function main() {
  await cryptoWaitReady();
  parseCommandLine();
}

main();
