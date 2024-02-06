/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestContract, TestSuiteEnvironment } from "../../src/index";
import { assertEq, assertGe, assertGt, assertLt, assertFalse, assertApproxEqAbs, assertTrue, e } from "../../src/index";
import { changePoolCoverageTo } from "./lib/swapPoolTests";

const FERDIE = "6hXHGkma9bKW6caAA5Z9Pto8Yxh9BbD8ckE15hSAhbMdF7RC";

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,
    vm,
    tester,
    constructors: { newRouter, newTestableERC20Wrapper, newTestableSwapPool, newMockOracle, newNablaCurve },
  } = environment;

  const deadlineTime = () => Math.floor(Date.now() / 1000 + 10);

  function makePath(from: TestContract, to: TestContract) {
    return [address(from), address(to)];
  }

  const testSwap = async () => {
    await swapPool1.deposit(DEPOSIT_POOL_AMOUNT);
    await swapPool2.deposit(DEPOSIT_POOL_AMOUNT);

    const balanceBefore = await asset2.balanceOf(tester);
    const path = makePath(asset1, asset2);

    const [quote] = await router.getAmountOut(WITHDRAW_AMOUNT, path);

    // Check Swap event
    vm.expectEmit(router, "Swap", [tester, WITHDRAW_AMOUNT, quote, address(asset1), address(asset2), tester]);

    const amounts: bigint[] = await router.swapExactTokensForTokens(
      WITHDRAW_AMOUNT,
      WITHDRAW_AMOUNT / 2n - LOW_SLIPPAGE,
      path,
      tester,
      deadlineTime()
    );

    const balanceAfter = await asset2.balanceOf(tester);
    assertGe(balanceAfter, balanceBefore, "Output asset balance afterwards not greater than balance before");

    assertEq(amounts.length, 2, "Result amounts array length");
    assertEq(amounts[0], WITHDRAW_AMOUNT, "First of resulting amounts supposed to be input amount");
    assertEq(amounts[1], quote, "Quote does not match actual swap result");
  };

  const MAX_UINT256 = 2n ** 256n - 1n;
  const MINT_AMOUNT = unit(100);
  const DEPOSIT_POOL_AMOUNT = unit(50);
  const WITHDRAW_AMOUNT = unit(10);
  const LOW_SLIPPAGE = unit(0.1);
  const HIGH_SLIPPAGE = unit(1);

  const nablaCurve = await newNablaCurve(0, e(0.01, 18));
  const router = await newRouter();
  const treasury = FERDIE;

  const asset1 = await newTestableERC20Wrapper("Test Token 1", "TEST1", 12, [1], [2], [], []);
  const asset2 = await newTestableERC20Wrapper("Test Token 2", "TEST2", 12, [1], [3], [], []);

  const oracle1 = await newMockOracle(address(asset1), unit(1));
  const oracle2 = await newMockOracle(address(asset2), unit(2));

  const swapPool1 = await newTestableSwapPool(
    address(asset1),
    address(nablaCurve),
    address(router),
    0,
    treasury,
    "Test LP 1",
    "LP1"
  );
  const swapPool2 = await newTestableSwapPool(
    address(asset2),
    address(nablaCurve),
    address(router),
    0,
    treasury,
    "Test LP 2",
    "LP2"
  );

  return {
    async setUp() {
      //we ensure that only the MINT_AMOUNT is on the required accounts by
      //burning pre-existing balances.

      //This is required since the assets are on the standalone testing
      //chain and we cannot ensure in the test alone that the balances
      //of these tokens is indeed 0 (a test could have run earlier)
      await asset1.burn(tester, await asset1.balanceOf(tester));
      await asset2.burn(tester, await asset2.balanceOf(tester));

      await asset1.burn(treasury, await asset1.balanceOf(treasury));
      await asset2.burn(treasury, await asset2.balanceOf(treasury));

      await asset1.burn(address(swapPool1), await asset1.balanceOf(address(swapPool1)));
      await asset1.burn(address(swapPool2), await asset1.balanceOf(address(swapPool2)));

      await asset2.burn(address(swapPool1), await asset2.balanceOf(address(swapPool1)));
      await asset2.burn(address(swapPool2), await asset2.balanceOf(address(swapPool2)));

      await asset1.approve(address(router), MAX_UINT256);
      await asset2.approve(address(router), MAX_UINT256);

      await asset1.approve(address(swapPool1), MAX_UINT256);
      await asset2.approve(address(swapPool2), MAX_UINT256);

      //set up
      await router.setPriceOracle(address(asset1), address(oracle1));
      await router.setPriceOracle(address(asset2), address(oracle2));

      await router.registerPool(address(asset1), address(swapPool1));
      await router.registerPool(address(asset2), address(swapPool2));

      await asset1.mint(tester, MINT_AMOUNT);
      await asset2.mint(tester, MINT_AMOUNT);
    },

    async testSwap() {
      await testSwap();
    },

    async testSwapWithLPFee() {
      await swapPool2.deposit(DEPOSIT_POOL_AMOUNT);

      const balanceBefore = await asset2.balanceOf(address(router));
      const treasuryBefore: bigint = await asset2.balanceOf(treasury);

      const [, liabilitiesBefore] = await swapPool2.coverage();

      // in this test we don't impose any protocol fee because
      // it is hard to expect emit the correct value for ChargedSwapFees
      // as it is influences by slippage
      await swapPool2.setSwapFees(150, 50, 0);
      const [quoteWithFee, protocolFeeWithSlippage, effectiveLpFee, backstopFee] = await swapPool2.quoteSwapOut(
        WITHDRAW_AMOUNT
      );

      assertEq(effectiveLpFee, (WITHDRAW_AMOUNT * 150n) / 1_000_000n, "Expected effective LP fee to be 0.015%");
      assertEq(backstopFee, (WITHDRAW_AMOUNT * 50n) / 1_000_000n, "Expected backstop fee to be 0.005%");
      assertEq(protocolFeeWithSlippage, 0n, "Expected protocol fee to be 0%");

      // Check ChargedSwapFees event
      vm.expectEmit(swapPool1, "ChargedSwapFees", [effectiveLpFee, backstopFee, protocolFeeWithSlippage]);

      vm.startPrank(address(router));
      // give enough funds to router to call contract functions
      await vm.mintNative(address(router), unit(20));
      const amountOut = await swapPool2.swapOutFromRouter(WITHDRAW_AMOUNT);
      vm.stopPrank();

      const balanceAfter = await asset2.balanceOf(address(router));
      const treasuryAfter = await asset2.balanceOf(treasury);

      const [, liabilitiesAfter] = await swapPool2.coverage();

      assertEq(
        balanceAfter,
        balanceBefore + amountOut,
        "Output asset balance afterwards not greater than balance before"
      );
      assertEq(amountOut, quoteWithFee, "Quote does not match actual swap result");
      assertEq(
        treasuryAfter,
        treasuryBefore,
        "Expected treasury balance to have increased by the amount of protocol fee charged"
      );
      assertEq(
        liabilitiesAfter,
        liabilitiesBefore + (WITHDRAW_AMOUNT * 150n) / 1_000_000n,
        "Expected pool liabilities to increase by fee amount, so LP token worth increases"
      );
    },

    async testSwapWithFeeHighCoverage() {
      await swapPool2.deposit(DEPOSIT_POOL_AMOUNT);

      const balanceBefore = await asset2.balanceOf(address(router));
      const treasuryBefore = await asset2.balanceOf(treasury);

      await changePoolCoverageTo(swapPool2, e(1.3, 18), environment);
      const [, liabilitiesBefore] = await swapPool2.coverage();

      const [quoteWithoutFee] = await swapPool2.quoteSwapOut(WITHDRAW_AMOUNT);

      // in this test we don't impose any lp fee because
      // this makes it easier to predict the other two fees
      await swapPool2.setSwapFees(0, 30, 20);
      const [quoteWithFee] = await swapPool2.quoteSwapOut(WITHDRAW_AMOUNT);

      vm.startPrank(address(router));
      // give enough funds to router to call contract functions
      await vm.mintNative(address(router), unit(20));
      const amountOut = await swapPool2.swapOutFromRouter(WITHDRAW_AMOUNT);
      vm.stopPrank();

      const balanceAfter = await asset2.balanceOf(address(router));
      const treasuryAfter = await asset2.balanceOf(treasury);

      const [, liabilitiesAfter] = await swapPool2.coverage();

      assertEq(
        balanceAfter,
        balanceBefore + amountOut,
        "Output asset balance afterwards not greater than balance before"
      );

      // psi(., l) (i.e., for constant l) is a convex function and therefore
      // psi(t*a + (t-1)*b, l) <= t*psi(a, l) + (t-1)*psi(b, l)
      // for every 0 <= t <= 1
      // equivalently (what we test here):
      // t * (psi(b, l) - psi(b - c, l)) <= psi(b, l) - psi(b - t*c, l)
      assertGe(
        quoteWithFee,
        (quoteWithoutFee * 995n) / 1000n,
        "Expected quote after fee to equal quote before fee -0.5%"
      );
      assertEq(amountOut, quoteWithFee, "Quote does not match actual swap result");
      // With high CR the slippage function psi has a derivative of more than 1
      // so that the actual amount transferred to the treasury
      // should be more than (WITHDRAW_AMOUNT * 20) / 10000
      assertGt(
        treasuryAfter,
        treasuryBefore + (WITHDRAW_AMOUNT * 20n) / 1_000_000n,
        "Expected treasury balance to have increased by the amount of protocol fee charged"
      );
      assertEq(liabilitiesAfter, liabilitiesBefore, "Expected pool liabilities to stay the same");
    },

    async testSwapWithFeeLowCoverage() {
      await swapPool2.deposit(DEPOSIT_POOL_AMOUNT);

      const balanceBefore = await asset2.balanceOf(address(router));
      const treasuryBefore = await asset2.balanceOf(treasury);

      await changePoolCoverageTo(swapPool2, e(0.9, 18), environment);
      const [, liabilitiesBefore] = await swapPool2.coverage();

      const [quoteWithoutFee] = await swapPool2.quoteSwapOut(WITHDRAW_AMOUNT);

      // in this test we don't impose any lp fee because
      // this makes it easier to predict the other two fees
      await swapPool2.setSwapFees(0, 3000, 2000);
      const [quoteWithFee] = await swapPool2.quoteSwapOut(WITHDRAW_AMOUNT);

      vm.startPrank(address(router));
      // give enough funds to router to call contract functions
      await vm.mintNative(address(router), unit(20));
      const amountOut = await swapPool2.swapOutFromRouter(WITHDRAW_AMOUNT);
      vm.stopPrank();

      const balanceAfter = await asset2.balanceOf(address(router));
      const treasuryAfter = await asset2.balanceOf(treasury);

      const [, liabilitiesAfter] = await swapPool2.coverage();

      assertEq(
        balanceAfter,
        balanceBefore + amountOut,
        "Output asset balance afterwards not greater than balance before"
      );

      // psi(., l) (i.e., for constant l) is a convex function and therefore
      // psi(t*a + (t-1)*b, l) <= t*psi(a, l) + (t-1)*psi(b, l)
      // for every 0 <= t <= 1
      // equivalently (what we test here):
      // t * (psi(b, l) - psi(b - c, l)) <= psi(b, l) - psi(b - t*c, l)
      assertGe(
        quoteWithFee,
        (quoteWithoutFee * 995n) / 1000n,
        "Expected quote after fee to equal quote before fee -0.5%"
      );
      assertEq(amountOut, quoteWithFee, "Quote does not match actual swap result");
      // With low CR the slippage function psi has a derivative of less than 1
      // so that the actual amount transferred to the treasury
      // should be less than (WITHDRAW_AMOUNT * 20) / 10000
      assertLt(
        treasuryAfter,
        treasuryBefore + (WITHDRAW_AMOUNT * 20n) / 10000n,
        "Expected treasury balance to have increased by the amount of protocol fee charged"
      );
      assertEq(liabilitiesAfter, liabilitiesBefore, "Expected pool liabilities to stay the same");
    },

    async testImperfectCoverageRatioWithdrawal() {
      await testSwap();

      const balanceBefore = await asset2.balanceOf(tester);
      await swapPool2.withdraw(WITHDRAW_AMOUNT, WITHDRAW_AMOUNT - HIGH_SLIPPAGE);

      const balanceAfter = await asset2.balanceOf(tester);
      assertGe(balanceBefore + WITHDRAW_AMOUNT, balanceAfter, "Balance afterwards has no slippage applied");
    },

    async testCoherentStateChanges() {
      await swapPool1.deposit(unit(50));
      await swapPool2.deposit(unit(50));

      const initialBalance1 = await asset1.balanceOf(tester);
      const initialBalance2 = await asset2.balanceOf(tester);

      // Swap forward
      const [initialReserves, initialLiabilities] = await swapPool1.coverage();
      const [initialReserves2, initialLiabilities2] = await swapPool2.coverage();

      const path1 = makePath(asset1, asset2);
      const [, forwardSwapOutput] = await router.swapExactTokensForTokens(
        unit(20),
        unit(10) - HIGH_SLIPPAGE,
        path1,
        tester,
        deadlineTime()
      );

      const path2 = makePath(asset2, asset1);
      await router.swapExactTokensForTokens(forwardSwapOutput, unit(20) - HIGH_SLIPPAGE, path2, tester, deadlineTime());

      const [finalReserves, finalLiabilities] = await swapPool1.coverage();
      const [finalReserves2, finalLiabilities2] = await swapPool2.coverage();

      assertEq(finalLiabilities, initialLiabilities, "Liabilities must eventually be equal to initial ones");
      assertEq(finalLiabilities2, initialLiabilities2, "Liabilities must eventually be equal to initial ones");
      assertGt(finalReserves, (initialReserves * 99999n) / 100000n, "Reserves 1 must eventually be >= initially");
      assertLt(
        finalReserves,
        (initialReserves * 110n) / 100n,
        "Reserves 1 are not expected to be much more eventually"
      );
      assertGt(finalReserves2, (initialReserves2 * 99999n) / 100000n, "Reserves 2 must eventually be >= initially");
      assertLt(
        finalReserves2,
        (initialReserves2 * 110n) / 100n,
        "Reserves 2 are not expected to be much more eventually"
      );

      const finalBalance1 = await asset1.balanceOf(tester);
      const finalBalance2 = await asset2.balanceOf(tester);

      // Give it a tiny bit of tolerance, due to slippage rounding errors
      // (Should be uncritical in practice as long as rounding error < gas + swap fees)
      assertLt((finalBalance1 * 9999n) / 10000n, initialBalance1, "User 1 must not end up with more funds");
      assertLt((finalBalance2 * 9999n) / 10000n, initialBalance2, "User 2 must not end up with more funds");

      assertGe(
        finalBalance1,
        (initialBalance1 * 75n) / 100n,
        "Final balance must not be much less than initial balance"
      );
      assertGe(
        finalBalance2,
        (initialBalance2 * 75n) / 100n,
        "Final balance must not be much less than initial balance"
      );
    },

    async testCoherentStateChangesOnSkewedCoverageRatios() {
      await swapPool1.deposit(unit(50));
      await swapPool2.deposit(unit(30));

      const path1 = makePath(asset1, asset2);
      await router.swapExactTokensForTokens(unit(20), unit(10) - HIGH_SLIPPAGE, path1, tester, deadlineTime());

      const initialBalance1 = await asset1.balanceOf(tester);
      const initialBalance2 = await asset2.balanceOf(tester);

      // Swap forward
      const [initialReserves, initialLiabilities] = await swapPool1.coverage();
      const [initialReserves2, initialLiabilities2] = await swapPool2.coverage();

      const path2 = makePath(asset1, asset2);
      const [, forwardSwapOutput] = await router.swapExactTokensForTokens(
        unit(20),
        unit(10) - HIGH_SLIPPAGE,
        path2,
        tester,
        deadlineTime()
      );

      const path3 = makePath(asset2, asset1);

      await router.swapExactTokensForTokens(forwardSwapOutput, unit(20) - HIGH_SLIPPAGE, path3, tester, deadlineTime());

      const [finalReserves, finalLiabilities] = await swapPool1.coverage();

      const [finalReserves2, finalLiabilities2] = await swapPool2.coverage();

      assertEq(finalLiabilities, initialLiabilities, "Liabilities must eventually be equal to initial ones");
      assertEq(finalLiabilities2, initialLiabilities2, "Liabilities must eventually be equal to initial ones");
      assertGt(finalReserves, (initialReserves * 99999n) / 100000n, "Reserves 1 must eventually be >= initially");
      assertLt(
        finalReserves,
        (initialReserves * 110n) / 100n,
        "Reserves 1 are not expected to be much more eventually"
      );
      assertGt(finalReserves2, (initialReserves2 * 99999n) / 100000n, "Reserves 2 must eventually be >= initially");
      assertLt(
        finalReserves2,
        (initialReserves2 * 110n) / 100n,
        "Reserves 2 are not expected to be much more eventually"
      );

      const finalBalance1 = await asset1.balanceOf(tester);
      const finalBalance2 = await asset2.balanceOf(tester);

      // Give it a tiny bit of tolerance, due to slippage rounding errors
      // (Should be uncritical in practice as long as rounding error < gas + swap fees)
      assertLt((finalBalance1 * 9999n) / 10000n, initialBalance1, "User 1 must not end up with more funds");
      assertLt((finalBalance2 * 9999n) / 10000n, initialBalance2, "User 2 must not end up with more funds");

      assertGe(
        finalBalance1,
        (initialBalance1 * 75n) / 100n,
        "Final balance must not be much less than initial balance"
      );
      assertGe(
        finalBalance2,
        (initialBalance2 * 75n) / 100n,
        "Final balance must not be much less than initial balance"
      );
    },

    async testCanPauseAndUnpause() {
      await swapPool1.deposit(DEPOSIT_POOL_AMOUNT);
      await swapPool2.deposit(DEPOSIT_POOL_AMOUNT);

      const path = makePath(asset1, asset2);

      await router.pause();
      assertTrue(await router.paused());

      vm.expectRevert("Pausable: paused");

      await router.swapExactTokensForTokens(
        WITHDRAW_AMOUNT,
        WITHDRAW_AMOUNT / 2n - LOW_SLIPPAGE,
        path,
        tester,
        deadlineTime()
      );

      await router.unpause();
      assertFalse(await router.paused());
    },

    async testSwapSplitInHalf() {
      await swapPool1.deposit(DEPOSIT_POOL_AMOUNT);

      await changePoolCoverageTo(swapPool1, e(1.3, 18), environment);
      const poolBalance = await asset1.balanceOf(address(swapPool1));
      const [singleSwap] = await swapPool1.quoteSwapOut((poolBalance * 6n) / 13n);

      vm.startPrank(address(router));
      // give enough funds to router to call contract functions
      await vm.mintNative(address(router), unit(20));
      const firstHalf = await swapPool1.swapOutFromRouter((poolBalance * 3n) / 13n);
      vm.stopPrank();
      const [secondHalf] = await swapPool1.quoteSwapOut((poolBalance * 3n) / 13n);
      const doubleSwap = firstHalf + secondHalf;

      assertApproxEqAbs(
        singleSwap,
        doubleSwap,
        1n,
        "Expected swapped amount to be the same, no matter if done in one or two steps"
      );
    },

    async testSwapCrossingFullPoolCoverage() {
      await swapPool1.deposit(DEPOSIT_POOL_AMOUNT);

      await changePoolCoverageTo(swapPool1, e(1.3, 18), environment);
      const poolBalance = await swapPool1.reserve();
      const [singleSwap] = await swapPool1.quoteSwapOut((poolBalance * 6n) / 13n);

      const [firstHalf] = await swapPool1.quoteSwapOut((poolBalance * 3n) / 13n);
      await changePoolCoverageTo(swapPool1, e(1, 18), environment);
      const equiPoolBalance = await asset1.balanceOf(address(swapPool1));
      const [secondHalf] = await swapPool1.quoteSwapOut((equiPoolBalance * 3n) / 10n);
      const doubleSwap = firstHalf + secondHalf;

      assertEq(singleSwap, doubleSwap, "Expected swapped amount to be the same, no matter if done in one or two steps");
    },
  };
}
