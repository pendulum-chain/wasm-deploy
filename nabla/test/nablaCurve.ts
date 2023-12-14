/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestSuiteEnvironment } from "../../src/index";
import { assertApproxEqRel, assertLt, e } from "../../src/index";

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    constructors: { newNablaCurve, newVendingMachine },
  } = environment;

  const curve = await newNablaCurve(0, e(0.01, 18));

  async function calcEffectiveDeposit(reserves: bigint, liabilities: bigint, depositAmount: bigint) {
    const potential = await curve.phi(reserves, liabilities);
    return curve.effectiveDeposit(reserves + potential, liabilities, potential, depositAmount);
  }

  return {
    async testResultingOutputMatchesPythonImpl() {
      // test_trade_in_out
      let amm = await newVendingMachine(address(curve));
      await amm.init(e(2, 18), e(5, 18));
      assertApproxEqRel(
        await amm.totalReserves(),
        e(2.035259635368343, 18),
        e(0.001, 18),
        "test_trade_in_out accumulated slippage mismatch"
      );
      assertApproxEqRel(
        await amm.swapInto(e(1.0, 18)),
        e(1.02435, 18),
        e(0.01, 18),
        "test_trade_in_out amount mismatch"
      );

      // test_trade_in_split
      amm = await newVendingMachine(address(curve));
      await amm.init(e(80, 18), e(100, 18));
      assertApproxEqRel(
        await amm.totalReserves(),
        e(80.0439, 18),
        e(0.001, 18),
        "test_trade_in_split total reserves mismatch"
      );
      assertApproxEqRel(
        await amm.swapInto(e(100, 18)),
        e(99.71085, 18),
        e(0.01, 18),
        "test_trade_in_split amount mismatch"
      );

      // test_trade_out_split
      amm = await newVendingMachine(address(curve));
      await amm.init(e(80, 18), e(100, 18));
      assertApproxEqRel(
        await amm.swapOutOf(e(30, 18)),
        e(29.6344, 18),
        e(0.01, 18),
        "test_trade_out_split amount mismatch"
      );

      // test_trade_out_full
      amm = await newVendingMachine(address(curve));
      await amm.init(e(2, 18), e(5, 18));
      assertApproxEqRel(
        await amm.totalReserves(),
        e(2.035259635368343, 18),
        e(0.001, 18),
        "test_trade_out_full total reserves mismatch"
      );
      // TODO: Add assertion for swap out using exact resulting amount
    },

    async testEffectiveDepositEquation() {
      assertApproxEqRel(
        await calcEffectiveDeposit(e(80, 18), e(100, 18), e(10, 18)),
        e(10.004777762470999, 18),
        e(0.001, 18),
        "#1 mismatch"
      );
    },

    async testDepositWithdrawal() {
      const amm = await newVendingMachine(address(curve));
      await amm.init(e(950, 18), e(1000, 18));
      assertApproxEqRel(
        await amm.totalReserves(),
        e(950.0235738135982, 18),
        e(0.001, 18),
        "test_deposit_withdraw initial total reserves mismatch"
      );
      const deposited = await amm.deposit(e(1000, 18));
      assertApproxEqRel(deposited, e(1000.012058440754, 18), e(0.01, 18), "test_deposit_withdraw lp mismatch");
      assertApproxEqRel(
        await amm.totalReserves(),
        e(1950.0235738135982, 18),
        e(0.001, 18),
        "test_deposit_withdraw intermediate total reserves mismatch"
      );
      assertApproxEqRel(
        await amm.withdraw(deposited),
        e(1000, 18),
        e(0.01, 18),
        "test_deposit_withdraw withdrawn amount mismatch"
      );
      assertApproxEqRel(
        await amm.totalReserves(),
        e(950.0235738135982, 18),
        e(0.001, 18),
        "test_deposit_withdraw final total reserves mismatch"
      );
    },

    async testNoNegativeDeposits() {
      // Regression test: (0x58788cb94b1d7fc19, 0x5b6e16f2c648b620c, 0, 0x3e8)
      assertLt(
        await curve.effectiveDeposit(e(102, 18), e(105.41165658966665, 18), 0, e(0.0000001, 18)),
        2n ** 255n - 1n,
        "Regression test #1 overflow"
      );
    },
  };
}
