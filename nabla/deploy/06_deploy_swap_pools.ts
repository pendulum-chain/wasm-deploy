import { WasmDeployEnvironment } from "../../src/index";
import { registerSwapPool } from "../_lib";

async function DeploySwapPools({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();
  const treasury = deployer;

  const [backstop, router, curve, native, xcm0, xcm1, xcm2, xcm3] = await Promise.all([
    deployments.get("backstop"),
    deployments.get("router"),
    deployments.get("nablaCurve"),
    deployments.get("nativeErc20Wrapper"),
    deployments.get("xcm0Erc20Wrapper"),
    deployments.get("xcm1Erc20Wrapper"),
    deployments.get("xcm2Erc20Wrapper"),
    deployments.get("xcm3Erc20Wrapper"),
  ]);

  const poolNative = await deployments.deploy("swap-native", {
    from: deployer,
    contract: "SwapPool",
    args: [
      native.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "Nabla Native Swap LP",
      "Native-LP",
    ],
    log: true,
  });

  const poolXcm0 = await deployments.deploy("swap-xcm0", {
    from: deployer,
    contract: "SwapPool",
    args: [
      xcm0.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "Nabla Xcm0 Swap LP",
      "XCM0-LP",
    ],
    log: true,
  });

  const poolXcm1 = await deployments.deploy("swap-xcm1", {
    from: deployer,
    contract: "SwapPool",
    args: [
      xcm1.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "Nabla Xcm1 Swap LP",
      "XCM1-LP",
    ],
    log: true,
  });

  const poolXcm2 = await deployments.deploy("swap-xcm2", {
    from: deployer,
    contract: "SwapPool",
    args: [
      xcm2.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "Nabla Xcm2 Swap LP",
      "XCM2-LP",
    ],
    log: true,
  });

  const poolXcm3 = await deployments.deploy("swap-xcm3", {
    from: deployer,
    contract: "SwapPool",
    args: [
      xcm3.address,
      curve.address,
      router.address,
      backstop.address,
      treasury.accountId,
      "Nabla Xcm3 Swap LP",
      "XCM3-LP",
    ],
    log: true,
  });

  await registerSwapPool(deployments, { from: deployer, log: true }, native.address, poolNative.address);
  await registerSwapPool(deployments, { from: deployer, log: true }, xcm0.address, poolXcm0.address);
  await registerSwapPool(deployments, { from: deployer, log: true }, xcm1.address, poolXcm1.address);
  await registerSwapPool(deployments, { from: deployer, log: true }, xcm2.address, poolXcm2.address);
  await registerSwapPool(deployments, { from: deployer, log: true }, xcm3.address, poolXcm3.address);
}

DeploySwapPools.tags = ["swap-pools"];

DeploySwapPools.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("swap-native"));
  return alreadyDeployed;
};

export default DeploySwapPools;
