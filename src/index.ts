import { cryptoWaitReady } from "@polkadot/util-crypto";
import { parseCommandLine } from "./commandLine";
export { WasmDeployEnvironment } from "./commands/deploy";

export { TestContract, TestSuiteEnvironment } from "./commands/test";
export { assertApproxEqAbs, assertApproxEqRel, assertEq, assertGt } from "./testing/stdLib";
export { DeploymentsExtension, Network, TxOptions } from "./commands/deploy";

async function main() {
  await cryptoWaitReady();
  parseCommandLine();
}

main();
