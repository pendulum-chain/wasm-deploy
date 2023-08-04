import { WasmDeployEnvironment } from "../src/index";
import { isTestnet, registerAsset, registerPriceFeed } from "./_lib";

async function DeployMockOracles({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const [mEUR, mETH, mUSD] = await Promise.all([
    deployments.get("mEUR"),
    deployments.get("mETH"),
    deployments.get("mUSD"),
  ]);

  const priceFeedWrapper = await deployments.deploy("priceFeedWrapper", {
    from: deployer,
    contract: "PriceFeedWrapper",
    args: [[
      {address: mUSD.address, blockchain: "USD-Blockchain", symbol: "USD-Symbol"},
      {address: mEUR.address, blockchain: "EUR-Blockchain", symbol: "EUR-Symbol"},
      {address: mETH.address, blockchain: "ETH-Blockchain", symbol: "ETH-Symbol"}
    ]],
    log: true,
  });

  await registerAsset(
    deployments,
    { from: deployer, log: true },
    mUSD.address,
    priceFeedWrapper.address,
  );
  await registerAsset(
    deployments,
    { from: deployer, log: true },
    mEUR.address,
    priceFeedWrapper.address,
  );
  await registerAsset(
    deployments,
    { from: deployer, log: true },
    mETH.address,
    priceFeedWrapper.address,
  );
}

DeployMockOracles.tags = ["oracles"];

DeployMockOracles.skip = async function skip({ deployments, network }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("compatOracle"));
  return alreadyDeployed;
};

export default DeployMockOracles;
