import { WasmDeployEnvironment } from "../src/index";
import { isTestnet, registerAsset, registerPriceFeed } from "./_lib";

async function DeployMockOracles({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const [mEUR, mETH, mUSD] = await Promise.all([
    deployments.get("mEUR"),
    deployments.get("mETH"),
    deployments.get("mUSD"),
  ]);

  const compatOracle = await deployments.deploy("compatOracle", {
    from: deployer,
    contract: "ChainlinkAdapter",
    args: [],
    log: true,
  });

  await registerPriceFeed(
    deployments,
    { from: deployer, log: true },
    mUSD.address,
    "6jEej8RZyb6bbLabGUD8BDTdBHBQc12C5RojbBC2buMkDqex" //"0x572dDec9087154dC5dfBB1546Bb62713147e0Ab0" // USDC price feed
  );
  await registerPriceFeed(
    deployments,
    { from: deployer, log: true },
    mEUR.address,
    "6jEej8RZyb6bbLabGUD8BDTdBHBQc12C5RojbBC2buMkDqex" //"0x7d7356bF6Ee5CDeC22B216581E48eCC700D0497A" // EUR price feed
  );
  await registerPriceFeed(
    deployments,
    { from: deployer, log: true },
    mETH.address,
    "6jEej8RZyb6bbLabGUD8BDTdBHBQc12C5RojbBC2buMkDqex" //"0x0715A7794a1dc8e42615F059dD6e406A6594651A" // ETH price feed
  );

  await registerAsset(deployments, { from: deployer, log: true }, mUSD.address, compatOracle.address);
  await registerAsset(deployments, { from: deployer, log: true }, mEUR.address, compatOracle.address);
  await registerAsset(deployments, { from: deployer, log: true }, mETH.address, compatOracle.address);
}

DeployMockOracles.tags = ["oracles"];

DeployMockOracles.skip = async function skip({ deployments, network }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("compatOracle"));
  return !isTestnet(network) || alreadyDeployed;
};

export default DeployMockOracles;
