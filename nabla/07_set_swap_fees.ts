import { WasmDeployEnvironment } from "../src/index";
import { setSwapFees } from "./_lib";

async function SetSwapFees({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  for (const swapPool of ["swap-mEUR", "swap-mETH", "swap-mUSD"]) {
    await setSwapFees(
      deployments,
      { from: deployer, log: true },
      swapPool,
      15, // 0.15%
      30, // 0.30%
      5 // 0.05%
    );
  }
}

SetSwapFees.tags = ["swap-fees"];

export default SetSwapFees;
