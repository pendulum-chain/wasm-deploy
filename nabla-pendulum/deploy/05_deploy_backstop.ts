import { WasmDeployEnvironment } from "../../src/index";
import { setPoolCap } from "../_lib";

async function DeployBackstopPool({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const [router, usdc] = await Promise.all([deployments.get("router"), deployments.get("usdcErc20Wrapper")]);

  await deployments.deploy("backstop", {
    from: deployer,
    contract: "BackstopPool",
    args: [router.address, usdc.address, "Backstop LP", "BSP-LP"],
    log: true,
  });

  await setPoolCap(deployments, { from: deployer, log: true }, "backstop", 1000n * 10n ** 6n);
}

DeployBackstopPool.tags = ["backstop"];

DeployBackstopPool.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("backstop"));
  return alreadyDeployed;
};

export default DeployBackstopPool;
