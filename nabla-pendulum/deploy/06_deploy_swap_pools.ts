import { WasmDeployEnvironment } from "../../src/index";
import { registerSwapPool } from "../_lib";

async function DeploySwapPools({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();
  const treasury = deployer;

  const [backstop, router, curveLowSlippage, curveNoSlippage, usdc, eurc, brl] = await Promise.all([
    deployments.get("backstop"),
    deployments.get("router"),
    deployments.get("nablaCurveLowSlippage"),
    deployments.get("nablaCurveNoSlippage"),
    deployments.get("usdcErc20Wrapper"),
    deployments.get("eurcErc20Wrapper"),
    deployments.get("brlErc20Wrapper"),
  ]);

  const poolUsdt = await deployments.deploy("swap-usdc", {
    from: deployer,
    contract: "SwapPool",
    args: [
      usdc.address,
      curveNoSlippage.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "USDC Swap LP",
      "USDC-LP",
    ],
    log: true,
  });

  const poolEurc = await deployments.deploy("swap-eurc", {
    from: deployer,
    contract: "SwapPool",
    args: [
      eurc.address,
      curveLowSlippage.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "EURC Swap LP",
      "EURC-LP",
    ],
    log: true,
  });

  const poolBrl = await deployments.deploy("swap-brl", {
    from: deployer,
    contract: "SwapPool",
    args: [
      brl.address,
      curveLowSlippage.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "BRL Swap LP",
      "BRL-LP",
    ],
    log: true,
  });

  await registerSwapPool(deployments, { from: deployer, log: true }, usdc.address, poolUsdt.address, 100);
  await registerSwapPool(deployments, { from: deployer, log: true }, eurc.address, poolEurc.address, 100);
  await registerSwapPool(deployments, { from: deployer, log: true }, brl.address, poolBrl.address, 100);
}

DeploySwapPools.tags = ["swap-pools"];

DeploySwapPools.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("swap-native"));
  return alreadyDeployed;
};

export default DeploySwapPools;
