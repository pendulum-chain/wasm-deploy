/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestSuiteEnvironment } from "../../src/index";
import { assertApproxEqRel, assertEq, assertFalse, assertTrue, e } from "../../src/index";
import { assertApproxEq } from "./lib/extraAssertions";
import {
  testPoolCap as genericTestPoolCap,
  testOnlyOwnerCanSetPoolCap as genericTestOnlyOwnerCanSetPoolCap,
} from "./lib/genericPoolTests";
import { changePoolCoverageTo } from "./lib/swapPoolTests";

const CHARLIE = "6k9LbZKC3dYDqaF6qhS9j438Vg1nawD98i8VuHRKxXSvf1rp";
const FERDIE = "6hXHGkma9bKW6caAA5Z9Pto8Yxh9BbD8ckE15hSAhbMdF7RC";

const PROTOCOL_TREASURY = "6n5dP3mHz2N6rGwgqPpr9YMFdGAwi7Chko7aTpFifv44hPLL";
const ATTACKER = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,
    vm,
    tester,
    constructors: { newNablaCurve, newTestableSwapPool, newTestableERC20Wrapper },
  } = environment;

  const MAX_UINT256 = 2n ** 256n - 1n;
  const MINT_AMOUNT = unit(100);

  const nablaCurve = await newNablaCurve(0, e(0.01, 18));

  const asset = await newTestableERC20Wrapper("Test Token", "TEST", 12, [1], [1], [], []);
  const pool = await newTestableSwapPool(
    address(asset),
    address(nablaCurve),
    0,
    0,
    PROTOCOL_TREASURY,
    "Test LP Token",
    "LP"
  );

  return {
    async setUp() {
      await asset.approve(address(pool), MAX_UINT256);

      await asset.burn(tester, await asset.balanceOf(tester));
      await asset.mint(tester, MINT_AMOUNT);

      // Important to deposit something before tests start, as first deposit
      // does not invoke usual _sharesToMint() logic, due to total supply being 0

      //we ensure that only the MINT_AMOUNT is on the required accounts by
      //burning pre-existing balances.

      //This is required since the assets are on the standalone testing
      //chain and we cannot ensure in the test alone that the balances
      //of these tokens is indeed 0 (a test could have run earlier)
      await asset.burn(CHARLIE, await asset.balanceOf(CHARLIE));
      await asset.mint(CHARLIE, unit(1));

      vm.startPrank(CHARLIE);
      await asset.approve(address(pool), unit(1));
      await pool.deposit(unit(1));
      vm.stopPrank();
    },

    async test_setUp_ProtocolTreasuryIsSet() {
      assertEq(
        ((await pool.protocolTreasury()) as any).toString(),
        PROTOCOL_TREASURY,
        "Unexpected protocol treasury address"
      );
    },

    async testPoolCap() {
      await genericTestPoolCap(pool, environment);
    },

    async testOnlyOwnerCanSetPoolCap() {
      await genericTestOnlyOwnerCanSetPoolCap(pool, environment);
    },

    async test_maxCoverageRatioForSwapIn_CheckDefaultValue() {
      assertEq(await pool.maxCoverageRatioForSwapIn(), 200n, "Unexpected default maxCoverageRatioForSwapIn");
    },

    async test_setMaxCoverageRatioForSwapIn_OnlyOwnerCanSetValue() {
      vm.startPrank(CHARLIE);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.setMaxCoverageRatioForSwapIn(300n);
      vm.stopPrank();
      assertEq(await pool.maxCoverageRatioForSwapIn(), 200n, "Unexpected maxCoverageRatioForSwapIn after set");

      await pool.setMaxCoverageRatioForSwapIn(300n);
      assertEq(await pool.maxCoverageRatioForSwapIn(), 300n, "Unexpected maxCoverageRatioForSwapIn after set");
    },

    async test_quoteSwapInto_RevertsIfSwapInWouldExceedMaxCoverageRatio() {
      await changePoolCoverageTo(pool, e(2, 18), environment);
      vm.expectRevert("SwapPool: EXCEEDS_MAX_COVERAGE_RATIO");
      await pool.quoteSwapInto(10);

      const maxCoverageRatio: bigint = await pool.maxCoverageRatioForSwapIn();
      const [liabilities, reserves] = await pool.coverage();

      const swapInAmountTooBig = (maxCoverageRatio * liabilities) / 100n - reserves + 1n;

      vm.startPrank(CHARLIE);
      vm.expectRevert("SwapPool: EXCEEDS_MAX_COVERAGE_RATIO");
      vm.stopPrank();
      await pool.quoteSwapInto(swapInAmountTooBig);
    },

    async test_quoteSwapInto_UserCanGetQuote() {
      const maxCoverageRatio: bigint = await pool.maxCoverageRatioForSwapIn();
      const [liabilities, reserves] = await pool.coverage();

      const swapInAmount = (maxCoverageRatio * liabilities) / 100n - reserves;

      await pool.quoteSwapInto(swapInAmount);
    },

    async testOnlyOwnerCanSetSwapFee() {
      await pool.setSwapFees(40, 5, 5);

      vm.startPrank(FERDIE);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.setSwapFees(40, 5, 5);
      vm.stopPrank();
    },

    async testOwnerCannotSetSwapFeeAbove30Percent() {
      vm.expectRevert("setSwapFees: FEES_TOO_HIGH");
      await pool.setSwapFees(200000n, 50000n, 50000n);
    },

    async testOnlyOwnerCanSetWithdrawalTimelock() {
      await pool.setInsuranceWithdrawalTimelock(20);

      vm.startPrank(FERDIE);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.setInsuranceWithdrawalTimelock(20);
      vm.stopPrank();
    },

    async testDeposit() {
      const poolBalanceBefore = await asset.balanceOf(address(pool));

      const depositQuote = await pool.quoteDeposit(unit(5));

      // Check Mint event
      vm.expectEmit(pool, "Mint", [tester, depositQuote, unit(5)]);

      await pool.deposit(unit(5));

      assertApproxEq(await pool.balanceOf(tester), unit(5), "LP should own 5.0 (5E18) LP tokens after deposit");
      assertApproxEq(
        await asset.balanceOf(address(pool)),
        poolBalanceBefore + unit(5),
        "Pool should own 5.0 (5E18) more test tokens after deposit"
      );
    },

    async testWithdrawal() {
      await pool.deposit(unit(5));

      const assetAmountBefore = await asset.balanceOf(tester);

      const sharesBefore = await pool.balanceOf(tester);
      const poolBalanceBefore = await asset.balanceOf(address(pool));
      const withdrawQuote = await pool.quoteWithdraw(unit(3));

      // Check Burn event
      vm.expectEmit(pool, "Burn", [tester, unit(3), withdrawQuote]);

      await pool.withdraw(unit(3), unit(3));

      assertEq(
        await asset.balanceOf(tester),
        assetAmountBefore + withdrawQuote,
        "LP should own 3.0 (3E18) more test tokens after withdrawal"
      );
      assertEq(
        await pool.balanceOf(tester),
        sharesBefore - unit(3),
        "LP should still own 2.0 (2E18) LP tokens after withdrawal"
      );
      assertEq(
        await asset.balanceOf(address(pool)),
        poolBalanceBefore - withdrawQuote,
        "Pool should own 3.0 (3E18) less test tokens after withdrawal"
      );
    },

    async testDepositWithdrawalAffectAccumulatedSlippage() {
      await changePoolCoverageTo(pool, e(0.5, 18), environment);
      const accumulatedSlippageInitial = (await pool.reserveWithSlippage()) - (await pool.reserve());

      const [lpTokens, depositFee] = await pool.deposit(unit(20));
      assertEq(
        (await pool.reserveWithSlippage()) - (await pool.reserve()),
        accumulatedSlippageInitial + depositFee,
        "Unexpected accumulated slippage after deposit"
      );

      const [, withdrawalFee] = await pool.withdraw(lpTokens, unit(19.99));
      assertEq(
        (await pool.reserveWithSlippage()) - (await pool.reserve()),
        accumulatedSlippageInitial + depositFee + withdrawalFee,
        "Unexpected accumulated slippage after withdrawal"
      );
    },

    async testHighCoverageDepositWithdrawal() {
      // bring coverage ratio to > 100%
      await asset.transfer(address(pool), unit(20));

      const [shares] = await pool.deposit(unit(5));
      const poolBalanceBeforeWithdrawal: bigint = await asset.balanceOf(address(pool));

      const [payout] = await pool.withdraw((shares * 4n) / 5n, /*4*/ unit(0));

      assertApproxEq(
        await pool.balanceOf(tester),
        (shares * 1n) / 5n,
        "LP should still own 1/5 of LP tokens after withdrawal"
      );
      assertApproxEq(
        await asset.balanceOf(address(pool)),
        poolBalanceBeforeWithdrawal - payout,
        "Pool should own ca. 4.0 (4E18) less test tokens after withdrawal"
      );
      assertApproxEqRel(payout, unit(4), unit(0.05));
    },

    async testCanPause() {
      assertFalse(await pool.paused(), "Pool is not supposed to be paused initially");

      await pool.deposit(unit(1));

      vm.startPrank(CHARLIE);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.pause();
      vm.stopPrank();

      await pool.pause();
      assertTrue(await pool.paused(), "Pool is supposed to be paused now");

      vm.expectRevert("Pausable: paused");
      await pool.deposit(unit(1));

      // Withdrawals should never be paused
      await pool.withdraw(unit(0.1), unit(0.1));

      vm.startPrank(CHARLIE);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.unpause();
      vm.stopPrank();

      await pool.unpause();
      assertFalse(await pool.paused(), "Pool is not supposed to be paused anymore");
    },

    async testShareWorthBasic() {
      // pool is expected to have an initial coverage ratio of 100%
      const [shares] = await pool.deposit(unit(10));
      assertApproxEq(await pool.sharesTargetWorth(shares), unit(10), "Expected shareTargetWorth() to match deposit");
    },

    // sharesTargetWorth() semantics are not clearly specified and might intrinsically be tricky
    async skipTestShareWorthHighCoverage() {
      // bring coverage ratio to > 100%
      await asset.transfer(address(pool), unit(20));

      const [shares] = await pool.deposit(unit(5));
      assertApproxEq(await pool.sharesTargetWorth(shares), unit(5), "Expected shareTargetWorth() to match deposit");
    },

    /**
     * Test: setProtocolTreasury
     */
    async test_setProtocolTreasury_RevertIfSenderIsNotOwner() {
      vm.startPrank(ATTACKER);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.setProtocolTreasury(ATTACKER);
      vm.stopPrank();
    },

    async test_setProtocolTreasury_RevertIfAddressIsZeroAddress() {
      vm.expectRevert("setProtocolTreasury: ZERO_ADDRESS");
      await pool.setProtocolTreasury(0);
    },

    async test_setProtocolTreasury_RevertIfAddressIsEqualToCurrentTreasury() {
      vm.expectRevert("setProtocolTreasury: NO_CHANGE");
      await pool.setProtocolTreasury(PROTOCOL_TREASURY);
    },

    async test_setProtocolTreasury_Success() {
      const newTreasury = "6mfqoTMHrMeVMyKwjqomUjVomPMJ4AjdCm1VReFtk7Be8wqr";

      vm.expectEmit(pool, "ProtocolTreasuryChanged", [tester, newTreasury]);

      const returned = await pool.setProtocolTreasury(newTreasury);

      assertEq(
        ((await pool.protocolTreasury()) as any).toString(),
        newTreasury,
        "Unexpected protocol treasury address"
      );
      assertTrue(returned, "Expected setProtocolTreasury() to return true");
    },
  };
}
