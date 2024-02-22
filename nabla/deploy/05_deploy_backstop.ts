import { WasmDeployEnvironment } from "../../src/index";

async function DeployBackstopPool({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const [router, xcm1] = await Promise.all([deployments.get("router"), deployments.get("xcm1Erc20Wrapper")]);

  await deployments.deploy("backstop", {
    from: deployer,
    contract: "BackstopPool",
    args: [router.address, xcm1.address, "Nabla Backstop LP", "BS-LP"],
    log: true,
  });
}

DeployBackstopPool.tags = ["backstop"];

DeployBackstopPool.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("backstop"));
  return alreadyDeployed;
};

export default DeployBackstopPool;
