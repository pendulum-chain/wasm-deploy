/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestContract, TestSuiteEnvironment, assertApproxEqAbs } from "../../src/index";
import { assertApproxEqRel, assertEq, assertGt, assertLe, e } from "../../src/index";
import { assertApproxEq } from "./lib/extraAssertions";
import {
  testPoolCap as genericTestPoolCap,
  testOnlyOwnerCanSetPoolCap as genericTestOnlyOwnerCanSetPoolCap,
} from "./lib/genericPoolTests";
import { changePoolCoverageTo } from "./lib/swapPoolTests";

const MAX_UINT256 = 2n ** 256n - 1n;

const BOB = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";
const ATTACKER = "6k9LbZKC3dYDqaF6qhS9j438Vg1nawD98i8VuHRKxXSvf1rp";

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,
    getContractByAddress,
    vm,
    tester,
    constructors: {
      newRouter,
      newTestableBackstopPool,
      newTestableERC20Wrapper,
      newMockOracle,
      newNablaCurve,
      newTestableSwapPool,
      newSwapPool,
    },
  } = environment;

  let router: TestContract;
  let backstop: TestContract;
  let swapPool1: TestContract;
  let swapPool2: TestContract;

  const PRICE_ASSET1 = unit(5);
  const PRICE_ASSET2 = unit(2);
  const PRICE_USD = unit(1);

  const TIMELOCK = 1000;

  const usd = await newTestableERC20Wrapper("Test Backstop Token", "USD", 12, [1], [1], [], []);
  const asset1 = await newTestableERC20Wrapper("Test Token 1", "TEST1", 12, [1], [2], [], []);
  const asset2 = await newTestableERC20Wrapper("Test Token 2", "TEST2", 12, [1], [3], [], []);
  const asset3 = await newTestableERC20Wrapper("Test Token 3", "TEST3", 12, [1], [4], [], []);

  const oracleUsd = await newMockOracle(address(usd), PRICE_USD);
  const oracle1 = await newMockOracle(address(asset1), PRICE_ASSET1);
  const oracle2 = await newMockOracle(address(asset2), PRICE_ASSET2);

  const nablaCurve = await newNablaCurve(0, e(0.01, 18));
  const MINT_AMOUNT = unit(100);

  const depositInto = async (pool: TestContract, amount: bigint) => {
    await pool.deposit(amount);
  };

  const coverage = async (): Promise<[bigint, bigint]> => {
    const poolAsset = getContractByAddress(await backstop.asset());
    const reserves = await poolAsset.balanceOf(address(backstop));
    const liability = await backstop.totalSupply();

    return [reserves, liability];
  };

  return {
    async setUp() {
      router = await newRouter();
      backstop = await newTestableBackstopPool(address(router), address(usd), "Test Backstop LP", "BLP");
      swapPool1 = await newTestableSwapPool(
        address(asset1),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Test LP 1",
        "LP1"
      );
      swapPool2 = await newTestableSwapPool(
        address(asset2),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Test LP 2",
        "LP2"
      );

      await asset1.approve(address(router), MAX_UINT256);
      await asset2.approve(address(router), MAX_UINT256);

      await asset1.approve(address(swapPool1), MAX_UINT256);
      await asset2.approve(address(swapPool2), MAX_UINT256);
      await usd.approve(address(backstop), MAX_UINT256);

      await router.setPriceOracle(address(asset1), address(oracle1));
      await router.setPriceOracle(address(asset2), address(oracle2));
      await router.setPriceOracle(address(usd), address(oracleUsd));

      await router.registerPool(address(asset1), address(swapPool1));
      await router.registerPool(address(asset2), address(swapPool2));

      await backstop.addSwapPool(address(swapPool1), 0);
      await backstop.addSwapPool(address(swapPool2), 0);

      //we ensure that only the MINT_AMOUNT is on the required accounts by
      //burning pre-existing balances.

      //This is required since the assets are on the standalone testing
      //chain and we cannot ensure in the test alone that the balances
      //of these tokens is indeed 0 (a test could have run earlier)
      await asset1.burn(tester, await asset1.balanceOf(tester));
      await asset1.mint(tester, MINT_AMOUNT);

      await asset2.burn(tester, await asset2.balanceOf(tester));
      await asset2.mint(tester, MINT_AMOUNT);

      await usd.burn(tester, await usd.balanceOf(tester));
      await usd.mint(tester, MINT_AMOUNT);

      vm.startPrank(BOB);
      await asset1.approve(address(swapPool1), MAX_UINT256);
      await asset2.approve(address(swapPool2), MAX_UINT256);
      await usd.approve(address(backstop), MAX_UINT256);

      await asset1.burn(BOB, await asset1.balanceOf(BOB));
      await asset1.mint(BOB, MINT_AMOUNT);

      await asset2.burn(BOB, await asset2.balanceOf(BOB));
      await asset2.mint(BOB, MINT_AMOUNT);

      await usd.burn(BOB, await usd.balanceOf(BOB));
      await usd.mint(BOB, MINT_AMOUNT);

      await swapPool1.deposit(MINT_AMOUNT);
      await swapPool2.deposit(MINT_AMOUNT);
      await backstop.deposit(MINT_AMOUNT);
      vm.stopPrank();

      await router.swapExactTokensForTokens(
        unit(30),
        unit(14),
        [address(asset1), address(asset2)],
        tester,
        Math.floor(Date.now() / 1000) + 2
      );
    },

    async testPreventsDuplicateSwapPool() {
      vm.expectRevert("addSwapPool():DUPLICATE");
      await backstop.addSwapPool(address(swapPool1), 0);
    },

    /**
     * addSwapPool(address _swapPool, uint256 _insuranceFeeBps)
     */
    async test_addSwapPool_RevertIfMsgSenderIsNotOwner() {
      const pool = await newSwapPool(
        address(asset3),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Test LP 3",
        "LP3"
      );

      vm.expectRevert("Ownable: caller is not the owner");
      vm.startPrank(ATTACKER);
      await backstop.addSwapPool(address(pool), 0);
      vm.stopPrank();
    },

    async test_addSwapPool_RevertIfSwapPoolIsZeroAddress() {
      vm.expectRevert("addSwapPool():ZERO_ADDRESS");
      await backstop.addSwapPool(0, 0);
    },

    async test_addSwapPool_RevertIfSwapPoolIsDuplicate() {
      vm.expectRevert("addSwapPool():DUPLICATE");
      await backstop.addSwapPool(address(swapPool1), 0);
    },

    async test_addSwapPool_RevertIfExcessiveFeeIsSet() {
      const pool = await newSwapPool(
        address(asset3),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Test LP 3",
        "LP3"
      );

      vm.expectRevert("_setInsuranceFee():EXCESSIVE_FEE");
      await backstop.addSwapPool(address(pool), 30_01); // revert if > 30%
    },

    async test_addSwapPool_RevertIfBackstopPoolMismatch() {
      const differentBackstopPool = await newTestableBackstopPool(
        address(router),
        address(usd),
        "Test Backstop LP",
        "BLP"
      );

      const pool = await newSwapPool(
        address(asset3),
        address(nablaCurve),
        address(router),
        address(differentBackstopPool),
        0,
        "Test LP 3",
        "LP3"
      );

      vm.expectRevert("addSwapPool():BACKSTOP_MISMATCH");
      await backstop.addSwapPool(address(pool), 0);
    },

    async test_addSwapPool_EventsAreEmittedAndReturnsTrue() {
      const pool = await newSwapPool(
        address(asset3),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Test LP 3",
        "LP3"
      );

      const insuranceFeeBps = 0n;

      // Check InsuranceFeeSet event
      vm.expectEmit(backstop, "InsuranceFeeSet", [tester, address(pool), insuranceFeeBps]);

      // Check SwapPoolAdded event
      vm.expectEmit(backstop, "SwapPoolAdded", [tester, address(pool)]);

      const response = await backstop.addSwapPool(address(pool), 0);
      assertEq(response, true, "Expected true");
    },

    async test_addSwapPool_OwnerCanAddSwapPoolOfSameTokenAsBackstopPoolToken() {
      const pool = await newSwapPool(
        address(usd),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Test LP 3",
        "LP3"
      );

      // Need to be able to do that, will need to secure by other means
      await backstop.addSwapPool(address(pool), 0);
    },

    async testPoolCap() {
      await genericTestPoolCap(backstop, environment);
    },

    async testOnlyOwnerCanSetPoolCap() {
      await genericTestOnlyOwnerCanSetPoolCap(backstop, environment);
    },

    async testBackstopDeposit() {
      const [reservesBefore, liabilitiesBefore] = await coverage();
      const [poolShares] = await backstop.simulateDeposit(unit(10));

      vm.expectEmit(backstop, "Mint", [tester, poolShares, unit(10)]);
      const [lpTokens, fee] = await backstop.deposit(unit(10));

      const [reservesAfter, liabilitiesAfter] = await coverage();

      const backStopBalance = await backstop.balanceOf(tester);
      const usdBalance = await usd.balanceOf(address(backstop));
      assertEq(backStopBalance, lpTokens, "Returned amount of shares mismatch");
      assertEq(usdBalance, reservesAfter, "Returned reserves mismatch");
      assertGt(lpTokens, 0n, "Must have received LP tokens");
      assertApproxEq(fee, 0n, "Unexpected fee");
      assertApproxEq(liabilitiesAfter, liabilitiesBefore + unit(10), "Final liabilities mismatch");
      assertApproxEq(reservesAfter, reservesBefore + unit(10), "Final reserves mismatch");
    },

    async testImmediateBackstopWithdrawal() {
      await changePoolCoverageTo(swapPool1, e(2, 18), environment);
      const depositAmount = unit(20);
      const [lpTokens, fee] = await backstop.deposit(depositAmount);
      const withdrawAmount = (lpTokens * 3n) / 4n;

      const [reservesBefore, liabilitiesBefore] = await coverage();
      const [simulatedPayout] = await backstop.simulateWithdrawal(withdrawAmount);

      const backstopAsset = getContractByAddress(await backstop.asset());
      vm.expectEmit(backstop, "Transfer", [tester, 0, withdrawAmount]);
      vm.expectEmit(backstopAsset, "Transfer", [address(backstop), tester, simulatedPayout]);
      vm.expectEmit(backstop, "Burn", [tester, withdrawAmount, simulatedPayout]);

      const [payoutAmount] = await backstop.withdraw(withdrawAmount, unit(14));
      const [reservesAfter, liabilitiesAfter] = await coverage();

      assertEq(await usd.balanceOf(tester), MINT_AMOUNT - depositAmount + payoutAmount, "usd balance mismatch");
      assertEq(await backstop.balanceOf(tester), lpTokens - withdrawAmount, "backstop lp token mismatch");
      assertEq(fee, 0n, "unexpected fee");
      assertEq(liabilitiesAfter, liabilitiesBefore - withdrawAmount, "liabilities mismatch");
      assertEq(reservesAfter, reservesBefore - simulatedPayout, "reserves mismatch");
    },

    async testPreventsBackstopWithdrawalForUncoveredPool() {
      const pool = await newSwapPool(
        address(asset1),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Test LP 3",
        "LP3"
      );
      await asset1.approve(address(pool), MAX_UINT256);

      const [lpTokens] = await pool.deposit(unit(10));

      await vm.roll(TIMELOCK + 1);
      vm.expectRevert("redeemSwapPoolShares():NO_COVER");

      // TODO: the original test uses address(swapPoolUsd) instead of address(pool)
      //   which is not what is intended in my opinion
      await backstop.redeemSwapPoolShares(address(pool), lpTokens, unit(10));
    },

    async testBackstopLPWithdrawalWithPenalty() {
      await depositInto(backstop, unit(10));

      const balanceBefore: bigint = await usd.balanceOf(tester);
      const shares = await backstop.balanceOf(tester);

      await backstop.withdraw(shares, unit(9));
      const balanceAfter: bigint = await usd.balanceOf(tester);
      const withdrawn = balanceAfter - balanceBefore;

      const expectedPayout = unit(10);

      assertLe(withdrawn, expectedPayout, "expected withdrawn <= deposited");
      assertApproxEq(withdrawn, expectedPayout, "withdrawn amount mismatch");
    },

    async testPreventBackstopLPWithdrawalExceedingBalance() {
      const [lpTokens] = await backstop.deposit(unit(20));

      console.log("lpTokens", lpTokens);
      vm.expectRevert("withdraw: INSUFFICIENT_BALANCE");
      await backstop.withdraw(lpTokens + 1n, unit(19));
    },

    async testBackstopLPWithdrawalInSwapLiquidity() {
      await depositInto(backstop, unit(20));
      const balanceBefore = await asset1.balanceOf(tester);
      const lpTokens = await backstop.balanceOf(tester);

      const [reserve1, liability1] = await swapPool1.coverage();
      const [reserve2, liability2] = await swapPool2.coverage();
      const poolWorth =
        (await usd.balanceOf(address(backstop))) +
        (((reserve1 as bigint) - liability1) * PRICE_ASSET1) / PRICE_USD +
        (((reserve2 as bigint) - liability2) * PRICE_ASSET2) / PRICE_USD;

      assertEq(
        poolWorth,
        await backstop.getTotalPoolWorth(),
        "Expect that backstop pool worth is computed as defined in spec"
      );

      const sharesToWithdraw = lpTokens / 2n;
      const expectedReserveDecrement =
        (((poolWorth * PRICE_USD) / PRICE_ASSET1) * sharesToWithdraw) / (await backstop.totalSupply());

      const backstopReservesBefore = await usd.balanceOf(address(backstop));
      const backstopLiabBefore = await backstop.totalSupply();

      const quoteBackstopDrain = await swapPool1.quoteBackstopDrain(expectedReserveDecrement);

      // Check BackstopDrain event
      vm.expectEmit(swapPool1, "BackstopDrain", [tester, quoteBackstopDrain]);

      // Check WithdrawSwapLiquidity event
      vm.expectEmit(backstop, "WithdrawSwapLiquidity", [
        tester,
        address(swapPool1),
        quoteBackstopDrain,
        sharesToWithdraw,
      ]);

      const amountWithdrawn = await backstop.withdrawExcessSwapLiquidity(address(swapPool1), sharesToWithdraw, unit(2));

      assertEq(
        reserve1 - expectedReserveDecrement,
        await swapPool1.reserve(),
        "Expect that swap pool reserve gets decreased as defined in spec"
      );

      assertEq(
        await asset1.balanceOf(tester),
        balanceBefore + amountWithdrawn,
        "Caller should receive the number of swap pool tokens returned by the call"
      );
      assertApproxEqAbs(await backstop.balanceOf(tester), sharesToWithdraw, 1n, "Unexpected backstop shares");
      assertEq(await swapPool1.balanceOf(tester), 0n, "Unexpected swap pool shares");

      assertEq(
        await backstop.totalSupply(),
        backstopLiabBefore - sharesToWithdraw,
        "Backstop liabilities have not decreased as expected"
      );
      assertEq(await swapPool1.totalLiabilities(), liability1, "Swap pool liabilities should not have changed");
      assertEq(
        await usd.balanceOf(address(backstop)),
        backstopReservesBefore,
        "Backstop reserves should not have changed"
      );
    },

    async testBackstopWithdrawalInExcessSwapLiquidityOnly() {
      await depositInto(backstop, unit(20));
      await changePoolCoverageTo(swapPool1, e(0.99999, 18), environment);
      await changePoolCoverageTo(swapPool2, e(1.5, 18), environment);
      const lpTokens = await backstop.balanceOf(tester);

      vm.expectRevert("SwapPool#backstopDrain():INSUFFICIENT_COVERAGE");
      await backstop.withdrawExcessSwapLiquidity(address(swapPool1), lpTokens / 2n, unit(1.95));
    },

    async testSwapPoolBackstopWithdrawal() {
      await changePoolCoverageTo(swapPool2, e(1, 18), environment);
      await depositInto(swapPool2, unit(20));
      await changePoolCoverageTo(swapPool2, e(0.8, 18), environment);
      await backstop.setInsuranceFee(address(swapPool2), 100); // 1%

      const balanceBefore = await usd.balanceOf(tester);
      const lpTokens = await swapPool2.balanceOf(tester);

      const [backstopReservesBefore, backstopLiabBefore] = await coverage();
      const [swapReservesBefore, swapLiabBefore] = await swapPool2.coverage();

      await vm.roll(TIMELOCK + 1);

      // Check CoverSwapWithdrawal event
      vm.expectEmit(backstop, "CoverSwapWithdrawal", [
        tester,
        address(swapPool2),
        lpTokens / 4n,
        await swapPool2.sharesTargetWorth(lpTokens / 4n),
        2n * (await swapPool2.sharesTargetWorth(lpTokens / 4n)),
      ]);

      const paidOut = await backstop.redeemSwapPoolShares(
        address(swapPool2),
        lpTokens / 4n,
        (((unit(20) * 2n) / 4n) * 99n) / 100n
      );

      const [backstopReservesAfter, backstopLiabAfter] = await coverage();
      const [swapReservesAfter, swapLiabAfter] = await swapPool2.coverage();

      // Known issue with tests: Use higher tolerance as changePoolCoverageTo() is flawed
      // (changePoolCoverageTo() only manipulates a pool's reserves without updating accumulatedSlippage)
      assertApproxEqRel(paidOut, (((unit(20) * 2n) / 4n) * 99n) / 100n, unit(1.2), "unexpected payout amount");

      assertApproxEq(await usd.balanceOf(tester), balanceBefore + paidOut, "reported payout mismatch");
      assertApproxEq(await swapPool2.balanceOf(tester), (lpTokens * 3n) / 4n, "unexpected no. of shares left");
      assertApproxEq(await backstop.balanceOf(tester), 0n, "unexpected backstop shares");

      assertApproxEq(backstopLiabAfter, backstopLiabBefore, "backstop liabilities changed");
      assertApproxEq(backstopReservesAfter, backstopReservesBefore - paidOut, "unexpected backstop reserves delta");
      assertApproxEq(swapLiabAfter, swapLiabBefore - unit(5), "unexpected swap liabilities delta");
      assertApproxEq(swapReservesAfter, swapReservesBefore, "unexpected swap reserves delta");
    },

    async testSwapPoolBackstopWithdrawalLowCoverageOnly() {
      await depositInto(swapPool1, unit(20));
      await depositInto(swapPool2, unit(20));
      await changePoolCoverageTo(swapPool1, e(1, 18), environment);
      await changePoolCoverageTo(swapPool2, e(1.5, 18), environment);
      const lpTokens1 = await swapPool1.balanceOf(tester);
      const lpTokens2 = await swapPool2.balanceOf(tester);

      await vm.roll(TIMELOCK + 1);

      vm.expectRevert("SwapPool#backstopBurn():INSUFFICIENT_COVERAGE");
      await backstop.redeemSwapPoolShares(address(swapPool1), lpTokens1 / 4n, 0);

      vm.expectRevert("SwapPool#backstopBurn():INSUFFICIENT_COVERAGE");
      await backstop.redeemSwapPoolShares(address(swapPool2), lpTokens2 / 4n, 0);
    },

    async test_redeemSwapPoolShares_RevertIfWithdrawalTimeLockIsStillActive() {
      await depositInto(swapPool2, unit(10));
      await changePoolCoverageTo(swapPool2, e(0.7, 18), environment);

      const lpTokens = await swapPool2.balanceOf(tester);
      const withdrawAmount = lpTokens / 4n;

      vm.expectRevert("SwapPool#backstopBurn: TIMELOCK");
      await backstop.redeemSwapPoolShares(address(swapPool2), withdrawAmount, 0);

      await vm.roll(TIMELOCK);
      await backstop.redeemSwapPoolShares(address(swapPool2), withdrawAmount, 0);
    },

    async testPreventsPausedSwapPoolBackstopWithdrawal() {
      await depositInto(swapPool2, unit(20));
      await changePoolCoverageTo(swapPool2, e(0.8, 18), environment);
      await vm.roll(TIMELOCK);
      await swapPool2.pause();

      const shares = await swapPool2.balanceOf(tester);

      vm.expectRevert("Pausable: paused");
      await backstop.redeemSwapPoolShares(address(swapPool2), shares, unit(20) * 2n);
    },
  };
}
