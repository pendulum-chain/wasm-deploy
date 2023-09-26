import { WasmDeployEnvironment } from "../../src/index";

async function DeployBackstopPool({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const [router, curve, mUSD] = await Promise.all([
    deployments.get("router"),
    deployments.get("amber-curve-0.0-0.01"),
    deployments.get("mUSD"),
  ]);

  await deployments.deploy("backstop", {
    from: deployer,
    contract: "BackstopPool",
    args: [router.address, mUSD.address, curve.address, "0xAmber Backstop LP", "mUSD-BLP"],
    log: true,
  });
}

DeployBackstopPool.tags = ["backstop"];

DeployBackstopPool.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("backstop"));
  return alreadyDeployed;
};

export default DeployBackstopPool;
