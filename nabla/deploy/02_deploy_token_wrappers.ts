import { WasmDeployEnvironment } from "../../src/index";
import { selectDeployment } from "../deployments/selector";

async function DeployTokenWrappers({ getNamedAccounts, deployments, deploymentName }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const deploymentDescription = selectDeployment(deploymentName, deployer.accountId);

  for (const tokenEntry of Object.entries(deploymentDescription.tokens)) {
    const [tokenName, tokenDescription] = tokenEntry;
    const { name, symbol, decimals, variant, index, code, issuer } = tokenDescription;

    await deployments.deploy(`${tokenName}Erc20Wrapper`, {
      from: deployer,
      contract: "ERC20Wrapper",
      args: [name, symbol, decimals, variant, index, code, issuer],
      log: true,
    });
  }
}

DeployTokenWrappers.tags = ["tokens"];

// eslint-disable-next-line @typescript-eslint/require-await
DeployTokenWrappers.skip = async function skip(_: WasmDeployEnvironment): Promise<boolean> {
  // the skip feature is not implemented yet in wasm-deploy
  return false;
};

export default DeployTokenWrappers;
