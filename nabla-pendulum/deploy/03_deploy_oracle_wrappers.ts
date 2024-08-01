import { WasmDeployEnvironment } from "../../src/index";
import { registerAsset } from "../_lib";

async function DeployOracleWrappers({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const [usdc, eurc, brl] = await Promise.all([
    deployments.get("usdcErc20Wrapper"),
    deployments.get("eurcErc20Wrapper"),
    deployments.get("brlErc20Wrapper"),
  ]);

  const priceFeedWrapper = await deployments.deploy("priceFeedWrapper", {
    from: deployer,
    contract: "PriceOracleWrapper",
    args: [
      [
        { asset: usdc.address, blockchain: "FIAT", symbol: "USD-USD" },
        { asset: eurc.address, blockchain: "FIAT", symbol: "EUR-USD" },
        { asset: brl.address, blockchain: "FIAT", symbol: "BRL-USD" },
      ],
    ],
    log: true,
  });

  await registerAsset(deployments, { from: deployer, log: true }, usdc.address, priceFeedWrapper.address);
  await registerAsset(deployments, { from: deployer, log: true }, eurc.address, priceFeedWrapper.address);
  await registerAsset(deployments, { from: deployer, log: true }, brl.address, priceFeedWrapper.address);
}

DeployOracleWrappers.tags = ["oracles"];

DeployOracleWrappers.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("priceFeedWrapper"));
  return alreadyDeployed;
};

export default DeployOracleWrappers;
