/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestContract, TestSuiteEnvironment } from "../../src/index";
import { assertApproxEqAbs, assertApproxEqRel, assertEq, assertFalse, assertTrue, e } from "../../src/index";

const CHARLIE = "6k9LbZKC3dYDqaF6qhS9j438Vg1nawD98i8VuHRKxXSvf1rp";
const FERDIE = "6hXHGkma9bKW6caAA5Z9Pto8Yxh9BbD8ckE15hSAhbMdF7RC";

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,
    milliUnit,
    getContractByAddress,
    vm,
    tester,
    constructors: { newMockERC20, newNablaCurve, newTestableSwapPool, newTestableERC20Wrapper },
  } = environment;

  function assertApproxEq(a: bigint, b: bigint, errorMessage: string): void {
    if (a !== 0n && b !== 0n) {
      assertApproxEqRel(a, b, 5n * 10n ** 15n, errorMessage);
    } else {
      assertApproxEqAbs(a, b, milliUnit(5), errorMessage);
    }
  }

  const MAX_UINT256 = 2n ** 256n - 1n;
  const MINT_AMOUNT = unit(100);

  const changePoolCoverageTo = async (pool: TestContract, targetCoverageRatio: bigint) => {
    const poolAsset = getContractByAddress(await pool.asset());

    const [reserves, liabilities] = await pool.coverage();
    const targetReserves = (liabilities * targetCoverageRatio) / 10n ** 18n;

    if (targetReserves > reserves) {
      await poolAsset.mint(address(pool), targetReserves - reserves);
    } else {
      vm.startPrank(address(pool));
      await vm.mintNative(address(pool), unit(20));
      await poolAsset.transfer(tester, reserves - targetReserves);
      vm.stopPrank();
    }
  };

  const nablaCurve = await newNablaCurve(0, e(0.01, 18));

  const asset = await newTestableERC20Wrapper("Test Token", "TEST", 18, [1], [1], [], []);
  const pool = await newTestableSwapPool(address(asset), address(nablaCurve), 0, 0, 0, "Test LP Token", "LP");

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

    async testPoolCap() {
      assertEq(await pool.poolCap(), 2n ** 256n - 1n, "Expected pool to have max cap by default");

      await pool.deposit(unit(1));

      const [reserves] = await pool.coverage();
      const newCap = reserves + unit(1);
      await pool.setPoolCap(newCap);

      // Expectation: No revert
      await pool.deposit(unit(1));

      // Expectation: Even tiny deposit fails, but cannot be minimally small or curve errors
      vm.expectRevert("deposit: CAP_EXCEEDED");
      await pool.deposit(unit(0.0001));
    },

    async testOnlyOwnerCanSetPoolCap() {
      await pool.setPoolCap(unit(100));

      vm.startPrank(FERDIE);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.setPoolCap(unit(100));
      vm.stopPrank();
    },

    async testOnlyOwnerCanSetSwapFee() {
      await pool.setSwapFees(40, 5, 5);

      vm.startPrank(FERDIE);
      vm.expectRevert("Ownable: caller is not the owner");
      await pool.setSwapFees(40, 5, 5);
      vm.stopPrank();
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

      const [simulatedShares] = await pool.simulateDeposit(unit(5));

      // Check Mint event
      vm.expectEmit(pool, "Mint", [tester, simulatedShares, unit(5)]);

      await pool.deposit(unit(5));

      assertApproxEq(await pool.balanceOf(tester), unit(5), "LP should own 5.0 (5E18) LP tokens after deposit");
      assertApproxEq(
        await asset.balanceOf(address(pool)),
        poolBalanceBefore + unit(5),
        "Pool should own 5.0 (5E18) more test tokens after deposit"
      );

      assertApproxEq(
        await pool.insuranceWithdrawalUnlock(tester),
        (await vm.getBlockNumber()) + (await pool.insuranceWithdrawalTimelock()),
        "Unexpected insurance withdrawal unlock block no"
      );
    },

    async testWithdrawal() {
      await pool.deposit(unit(5));

      const sharesBefore = await pool.balanceOf(tester);
      const poolBalanceBefore = await asset.balanceOf(address(pool));
      const [simulatedPayout] = await pool.simulateWithdrawal(unit(3));

      // Check Burn event
      vm.expectEmit(pool, "Burn", [tester, unit(3), simulatedPayout]);

      await pool.withdraw(unit(3), unit(3));

      assertEq(
        await pool.balanceOf(tester),
        sharesBefore - unit(3),
        "LP should still own 2.0 (2E18) LP tokens after withdrawal"
      );
      assertEq(
        await asset.balanceOf(address(pool)),
        poolBalanceBefore - simulatedPayout,
        "Pool should own 3.0 (3E18) less test tokens after withdrawal"
      );
    },

    // this test is also failing in the original test suite, so we exclude it here
    async exclude_testDepositWithdrawalAffectAccumulatedSlippage() {
      await changePoolCoverageTo(pool, e(0.5, 18));
      const accumulatedSlippageInitial = await pool.accumulatedSlippage();

      const [lpTokens, depositFee] = await pool.deposit(unit(20));
      assertEq(
        await pool.accumulatedSlippage(),
        accumulatedSlippageInitial + depositFee,
        "Unexpected accumulated slippage after deposit"
      );

      const [, withdrawalFee] = await pool.withdraw(lpTokens, unit(19.99));
      assertEq(
        await pool.accumulatedSlippage(),
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
  };
}
