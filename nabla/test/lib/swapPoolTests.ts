/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestContract, TestSuiteEnvironment } from "../../../src";
import { e } from "../../../src/index";

export async function changePoolCoverageTo(
  pool: TestContract,
  targetCoverageRatio: bigint,
  environment: TestSuiteEnvironment
) {
  const { address, unit, tester, getContractByAddress, vm } = environment;

  const poolAsset = getContractByAddress(await pool.asset());

  const liabilities = await pool.totalLiabilities();
  const targetReserves = (liabilities * targetCoverageRatio) / e(1, 18);

  const targetReservesWithSlippage = await getContractByAddress(await pool.slippageCurve()).psi(
    targetReserves,
    await pool.totalLiabilities(),
    await pool.assetDecimals()
  );

  const reservesWithSlippage = await pool.reserveWithSlippage();
  await pool.setReserve(targetReserves, targetReservesWithSlippage);

  if (targetReservesWithSlippage > reservesWithSlippage) {
    await poolAsset.mint(address(pool), targetReservesWithSlippage - reservesWithSlippage);
  } else {
    vm.startPrank(address(pool));
    await vm.mintNative(address(pool), unit(20));
    await poolAsset.transfer(tester, reservesWithSlippage - targetReservesWithSlippage);
    vm.stopPrank();
  }
}
