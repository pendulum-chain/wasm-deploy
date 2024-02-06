import { WasmDeployEnvironment } from "../../src/index";
import { registerAsset } from "../_lib";

import { selectDeployment } from "../deployments/selector";

async function DeployOracleWrappers({ getNamedAccounts, deployments, deploymentName }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const deploymentDescription = selectDeployment(deploymentName, deployer.accountId);

  const tokens = Object.entries(deploymentDescription.tokens);

  const tokenDeployments = await Promise.all(
    tokens.map(async ([tokenName, _]) => deployments.get(`${tokenName}Erc20Wrapper`))
  );

  const priceFeedWrapper = await deployments.deploy("priceFeedWrapper", {
    from: deployer,
    contract: "PriceOracleWrapper",
    args: [
      tokens.map(([_, tokenDescription], index) => ({
        asset: tokenDeployments[index].address,
        blockchain: tokenDescription.oracleBlockchain,
        symbol: tokenDescription.oracleSymbol,
      })),
    ],
    log: true,
  });

  for (const tokenDeployment of tokenDeployments) {
    await registerAsset(deployments, { from: deployer, log: true }, tokenDeployment.address, priceFeedWrapper.address);
  }
}

DeployOracleWrappers.tags = ["oracles"];

// eslint-disable-next-line @typescript-eslint/require-await
DeployOracleWrappers.skip = async function skip(_: WasmDeployEnvironment): Promise<boolean> {
  // the skip feature is not implemented yet in wasm-deploy
  return false;
};

export default DeployOracleWrappers;
