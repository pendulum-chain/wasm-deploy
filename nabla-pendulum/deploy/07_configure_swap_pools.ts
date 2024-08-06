import { WasmDeployEnvironment } from "../../src/index";
import { setInsuranceWithdrawalTimelock, setPoolCap, setSwapFees } from "../_lib";

async function ConfigureSwapFees({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  for (const swapPool of ["swap-usdc", "swap-eurc", "swap-brl"]) {
    await setSwapFees(
      deployments,
      { from: deployer, log: true },
      swapPool,
      600, // 0.06% = 0.1% * 60%
      400, // 0.04% = 0.1% * 40%
      0 // 0%
    );

    await setInsuranceWithdrawalTimelock(deployments, { from: deployer, log: true }, swapPool, 7200);
  }

  await setPoolCap(deployments, { from: deployer, log: true }, "swap-usdc", 1000n * 15n ** 6n);
  await setPoolCap(deployments, { from: deployer, log: true }, "swap-eurc", 1000n * 20n ** 12n);
  await setPoolCap(deployments, { from: deployer, log: true }, "swap-brl", 5000n * 140n ** 12n);
}

ConfigureSwapFees.tags = ["swap-fees"];

export default ConfigureSwapFees;
