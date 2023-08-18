import { WasmDeployEnvironment } from "../../../src";
import { registerSwapPool } from "../_lib";

async function DeploySwapPools({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();
  const treasury = deployer;

  const [backstop, router, curve, mEUR, mETH, mUSD] = await Promise.all([
    deployments.get("backstop"),
    deployments.get("router"),
    deployments.get("amber-curve-0.0-0.01"),
    deployments.get("mEUR"),
    deployments.get("mETH"),
    deployments.get("mUSD"),
  ]);

  const poolEUR = await deployments.deploy("swap-mEUR", {
    from: deployer,
    contract: "SwapPool",
    args: [
      mEUR.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "0xAmber mEUR Swap LP",
      "mEUR-LP",
    ],
    log: true,
  });

  const poolETH = await deployments.deploy("swap-mETH", {
    from: deployer,
    contract: "SwapPool",
    args: [
      mETH.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "0xAmber mETH Swap LP",
      "mETH-LP",
    ],
    log: true,
  });

  const poolUSD = await deployments.deploy("swap-mUSD", {
    from: deployer,
    contract: "SwapPool",
    args: [
      mUSD.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "0xAmber mUSD Swap LP",
      "mUSD-LP",
    ],
    log: true,
  });

  await registerSwapPool(deployments, { from: deployer, log: true }, mEUR.address, poolEUR.address);
  await registerSwapPool(deployments, { from: deployer, log: true }, mETH.address, poolETH.address);
  await registerSwapPool(deployments, { from: deployer, log: true }, mUSD.address, poolUSD.address);
}

DeploySwapPools.tags = ["swap-pools"];

DeploySwapPools.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("swap-mETH"));
  return alreadyDeployed;
};

export default DeploySwapPools;
