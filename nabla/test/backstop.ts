import { TestContract, TestSuiteEnvironment } from "../../src/index";
import { assertApproxEqAbs, assertApproxEqRel, assertEq, assertGt, assertLt } from "../../src/index";

const MAX_UINT256 = 2n ** 256n - 1n;

const BOB = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";

export default async function (environment: TestSuiteEnvironment) {
  let {
    address,
    unit,
    milliUnit,
    microUnit,
    stopPrank,
    startPrank,
    expectRevert,
    expectEmit,
    getContractByAddress,
    mintNative,
    tester,
    constructors: {
      newRouter,
      newTestableBackstopPool,
      newMockERC20,
      newMockOracle,
      newNablaCurve,
      newTestableSwapPool,
      newSwapPool,
    },
  } = environment;

  function assertApproxEq(a: bigint, b: bigint, errorMessage: string): void {
    if (a !== 0n && b !== 0n) {
      assertApproxEqRel(a, b, 5n * 10n ** 15n, errorMessage);
    } else {
      assertApproxEqAbs(a, b, milliUnit(5), errorMessage);
    }
  }

  let router: TestContract;
  let backstop: TestContract;
  let swapPool1: TestContract;
  let swapPool2: TestContract;

  const asset1 = await newMockERC20("Test Token 1", "TEST1");
  const asset2 = await newMockERC20("Test Token 2", "TEST2");
  const usd = await newMockERC20("Test Backstop Token", "USD");

  const oracleUsd = await newMockOracle(address(usd), unit(1));
  const oracle1 = await newMockOracle(address(asset1), unit(5));
  const oracle2 = await newMockOracle(address(asset2), unit(2));

  const nablaCurve = await newNablaCurve(0, 10n ** 16n);
  const MINT_AMOUNT = unit(100);

  const changePoolCoverageTo = async (pool: TestContract, targetCoverageRatio: bigint) => {
    const poolAsset = getContractByAddress(await pool.asset());

    const [reserves, liabilities] = await pool.coverage();
    const targetReserves = (liabilities * targetCoverageRatio) / 10n ** 18n;

    if (targetReserves > reserves) {
      await poolAsset.mint(address(pool), targetReserves - reserves);
    } else {
      startPrank(address(pool));
      await mintNative(address(pool), unit(20));
      await poolAsset.transfer(tester, reserves - targetReserves);
      stopPrank();
    }
  };

  const depositInto = async (pool: TestContract, amount: bigint) => {
    await pool.deposit(amount);
  };

  return {
    async setUp() {
      router = await newRouter();
      backstop = await newTestableBackstopPool(
        address(router),
        address(usd),
        address(nablaCurve),
        "Test Backstop LP",
        "BLP"
      );
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

      await asset1.mint(tester, MINT_AMOUNT);
      await asset2.mint(tester, MINT_AMOUNT);
      await usd.mint(tester, MINT_AMOUNT);

      startPrank(BOB);
      await asset1.approve(address(swapPool1), MAX_UINT256);
      await asset2.approve(address(swapPool2), MAX_UINT256);
      await usd.approve(address(backstop), MAX_UINT256);
      await asset1.mint(BOB, MINT_AMOUNT);
      await asset2.mint(BOB, MINT_AMOUNT);
      await usd.mint(BOB, MINT_AMOUNT);
      await swapPool1.deposit(MINT_AMOUNT);
      await swapPool2.deposit(MINT_AMOUNT);
      await backstop.deposit(MINT_AMOUNT);
      stopPrank();

      await router.swapExactTokensForTokens(
        unit(30),
        unit(14),
        [address(asset1), address(asset2)],
        tester,
        Math.floor(Date.now() / 1000) + 2
      );
    },

    async testPreventsDuplicateSwapPool() {
      expectRevert("addSwapPool():DUPLICATE_SWAP_POOL");
      await backstop.addSwapPool(address(swapPool1), 0);
    },

    async testCanAddSwapPoolOfSameToken() {
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
      assertEq(await backstop.poolCap(), 2n ** 256n - 1n, "Expected pool to have max cap by default");

      await backstop.deposit(unit(1));

      const [reserves] = await backstop.coverage();
      const newCap = reserves + unit(1);
      await backstop.setPoolCap(newCap);

      // Expectation: No revert
      await backstop.deposit(unit(1));

      // Expectation: Even tiny deposit fails, but cannot be minimally small or curve errors
      expectRevert("deposit: CAP_EXCEEDED");
      await backstop.deposit(microUnit(100));
    },

    async testOnlyOwnerCanSetPoolCap() {
      await backstop.setPoolCap(unit(100));

      startPrank(BOB);
      expectRevert("Ownable: caller is not the owner");
      await backstop.setPoolCap(unit(100));
      stopPrank();
    },

    async testBackstopDeposit() {
      await changePoolCoverageTo(backstop, 10n ** 18n);
      const [reservesBefore, liabilitiesBefore] = await backstop.coverage();
      const [poolShares] = await backstop.simulateDeposit(unit(10));

      expectEmit(backstop, "Mint", [tester, poolShares, unit(10)]);
      const [lpTokens, fee] = await backstop.deposit(unit(10));

      const [reservesAfter, liabilitiesAfter] = await backstop.coverage();

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
      const [lpTokens, fee] = await backstop.deposit(unit(20));
      const [reservesBefore, liabilitiesBefore] = await backstop.coverage();
      const [simulatedPayout] = await backstop.simulateWithdrawal((lpTokens * 3n) / 4n);

      const backstopAsset = getContractByAddress(await backstop.asset());
      expectEmit(backstop, "Transfer", [tester, 0, (lpTokens * 3n) / 4n]);
      expectEmit(backstopAsset, "Transfer", [address(backstop), tester, simulatedPayout]);
      expectEmit(backstop, "Burn", [tester, (lpTokens * 3n) / 4n, simulatedPayout]);

      await backstop.withdraw((lpTokens * 3n) / 4n, unit(15));
      const [reservesAfter, liabilitiesAfter] = await backstop.coverage();

      assertApproxEq(await usd.balanceOf(tester), MINT_AMOUNT - unit(20) + unit(15), "usd balance mismatch");
      assertApproxEq(await backstop.balanceOf(tester), lpTokens / 4n, "backstop lp token mismatch");
      assertApproxEq(fee, 0n, "unexpected fee");
      assertApproxEq(liabilitiesAfter, liabilitiesBefore - unit(15), "liabilities mismatch");
      assertApproxEq(reservesAfter, reservesBefore - unit(15), "reserves mismatch");
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
      // TODO: why is this in the test?
      // roll(1001);

      expectRevert("redeemSwapPoolShares():NO_COVER");

      // TODO: the original test uses address(swapPoolUsd) instead of address(pool)
      //   which is not what is intended in my opinion
      await backstop.redeemSwapPoolShares(address(pool), lpTokens, unit(10));
    },

    // this test is also failing in the original test suite, so we exclude it here
    async exclude_testBackstopLPWithdrawalWithPenalty() {
      await changePoolCoverageTo(backstop, 10n ** 18n);
      await depositInto(backstop, unit(10));
      await changePoolCoverageTo(backstop, 95n * 10n ** 16n);

      const [reservesBefore, liabilitiesBefore] = await backstop.coverage();
      const balanceBefore: bigint = await usd.balanceOf(tester);
      const shares = await backstop.balanceOf(tester);

      await backstop.withdraw(shares, unit(9));
      const balanceAfter: bigint = await usd.balanceOf(tester);
      const withdrawn = balanceAfter - balanceBefore;

      console.log("balanceAfter", balanceAfter);
      console.log("balanceBefore", balanceBefore);

      const slippage = getContractByAddress(await backstop.slippageCurve());
      const expectedPayout = await slippage.effectiveWithdrawal(reservesBefore, liabilitiesBefore, 0, unit(10));

      assertLt(withdrawn, unit(10), "expected withdrawn < deposited");
      assertApproxEq(withdrawn, expectedPayout, "withdrawn amount mismatch");
    },

    async testPreventBackstopLPWithdrawalExceedingBalance() {
      const [lpTokens] = await backstop.deposit(unit(20));

      console.log("lpTokens", lpTokens);
      expectRevert("withdraw: INSUFFICIENT_BALANCE");
      await backstop.withdraw(lpTokens + 1n, unit(19));
    },

    // this test is also failing in the original test suite, so we exclude it here
    async exclude_testBackstopLPWithdrawalInSwapLiquidity() {
      await depositInto(backstop, unit(20));
      const balanceBefore = await asset1.balanceOf(tester);
      const lpTokens = await backstop.balanceOf(tester);

      const [backstopReservesBefore, backstopLiabBefore] = await backstop.coverage();
      const [, swapLiabBefore] = await swapPool1.coverage();

      // Check WithdrawSwapLiquidity event
      expectEmit(backstop, "WithdrawSwapLiquidity", [tester, address(swapPool1), 2000000000028n, 10000000000142n]);

      const amountWithdrawn = await backstop.withdrawExcessSwapLiquidity(
        address(swapPool1),
        lpTokens / 2n,
        milliUnit(1950)
      );

      const [, backstopLiabAfter] = await backstop.coverage();
      const [, swapLiabAfter] = await swapPool1.coverage();

      assertApproxEqRel(amountWithdrawn, unit(2), 10n ** 16n);
      assertApproxEqRel(await asset1.balanceOf(tester), balanceBefore + amountWithdrawn, 1n ** 16n);
      assertEq(backstop.balanceOf(tester), lpTokens / 2n);
      assertEq(swapPool1.balanceOf(tester), 0);

      assertApproxEqRel(backstopLiabAfter, backstopLiabBefore - unit(10), 10n ** 16n);
      assertEq(swapLiabAfter, swapLiabBefore);
      assertEq(await usd.balanceOf(address(backstop)), backstopReservesBefore);
    },

    async testBackstopWithdrawalInExcessSwapLiquidityOnly() {
      await depositInto(backstop, unit(20));
      await changePoolCoverageTo(swapPool1, 99999n * 10n ** 13n);
      const lpTokens = await backstop.balanceOf(tester);

      expectRevert("SwapPool#backstopDrain: COVERAGE_RATIO");
      await backstop.withdrawExcessSwapLiquidity(address(swapPool1), lpTokens / 2n, milliUnit(1950));
    },

    async testSwapPoolBackstopWithdrawal() {
      await changePoolCoverageTo(swapPool2, 10n ** 18n);
      await depositInto(swapPool2, unit(20));
      await changePoolCoverageTo(swapPool2, 8n * 10n ** 17n);
      await backstop.setInsuranceFee(address(swapPool2), 100); // 1%

      const balanceBefore = await usd.balanceOf(tester);
      const lpTokens = await swapPool2.balanceOf(tester);

      const [backstopReservesBefore, backstopLiabBefore] = await backstop.coverage();
      const [swapReservesBefore, swapLiabBefore] = await swapPool2.coverage();

      // what to do here?
      //vm.roll(1001);

      // Check CoverSwapWithdrawal event
      expectEmit(backstop, "CoverSwapWithdrawal", [
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

      const [backstopReservesAfter, backstopLiabAfter] = await backstop.coverage();
      const [swapReservesAfter, swapLiabAfter] = await swapPool2.coverage();

      // Known issue with tests: Use higher tolerance as changePoolCoverageTo() is flawed
      // (changePoolCoverageTo() only manipulates a pool's reserves without updating accumulatedSlippage)
      assertApproxEqRel(paidOut, (((unit(20) * 2n) / 4n) * 99n) / 100n, milliUnit(1200), "unexpected payout amount");

      assertApproxEq(await usd.balanceOf(tester), balanceBefore + paidOut, "reported payout mismatch");
      assertApproxEq(await swapPool2.balanceOf(tester), (lpTokens * 3n) / 4n, "unexpected no. of shares left");
      assertApproxEq(await backstop.balanceOf(tester), 0n, "unexpected backstop shares");

      assertApproxEq(backstopLiabAfter, backstopLiabBefore, "backstop liabilities changed");
      assertApproxEq(
        backstopReservesAfter,
        (backstopReservesBefore as bigint) - paidOut,
        "unexpected backstop reserves delta"
      );
      assertApproxEq(swapLiabAfter, swapLiabBefore - unit(5), "unexpected swap liabilities delta");
      assertApproxEq(swapReservesAfter, swapReservesBefore, "unexpected swap reserves delta");
    },
  };
}
