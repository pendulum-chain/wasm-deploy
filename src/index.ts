import { cryptoWaitReady } from "@polkadot/util-crypto";
import { parseCommandLine } from "./commandLine";
export { WasmDeployEnvironment } from "./types";

async function main() {
  await cryptoWaitReady();
  parseCommandLine();
}

main();
