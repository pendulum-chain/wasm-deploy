import { Command } from "commander";
import { deploy } from "./commands/deploy";
import { pull } from "./commands/pull";
import { runTestSuits } from "./commands/test";

export function parseCommandLine() {
  const program = new Command();

  program
    .name("wasm-deploy")
    .description("CLI tool to deploy Solidity smart contracts to a substrate chain")
    .version("0.1.0");

  program
    .command("pull")
    .description("Pull the latest version of the smart contracts from the upstream git repositories")
    .argument("<project>", "project folder")
    .action((str, _options) => {
      pull({ projectFolder: str });
    });

  program
    .command("deploy")
    .description("Run the project's deployment scripts")
    .argument("<project>", "project folder")
    .requiredOption("-n, --network <name>", "the network name of the project")
    .action(async (str, options) => {
      deploy({ projectFolder: str, network: options.network });
    });

  program
    .command("test")
    .description("Run the test suite defined in a project")
    .argument("<project>", "project folder")
    .requiredOption("-n, --network <name>", "the network name of the project")
    .action(async (str, options) => {
      runTestSuits({ projectFolder: str, network: options.network });
    });

  program.parse();
}
