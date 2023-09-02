import { TestContract, TestSuiteEnvironment } from "../../src/index";
import { assertApproxEqAbs, assertApproxEqRel, assertEq, assertGt } from "../../src/index";

const MAX_UINT256 = 2n ** 256n - 1n;

/*async function _testPoolCap(_pool: TestContract) {
  assertEq(_pool.poolCap(), 2**256 - 1, "Expected pool to have max cap by default");

  _pool.deposit(1 ether);

  (uint256 _reserves, ) = _pool.coverage();
  uint256 _newCap = _reserves + 1 ether;
  _pool.setPoolCap(_newCap);

  // Expectation: No revert
  _pool.deposit(1 ether);

  // Expectation: Even tiny deposit fails, but cannot be minimally small or curve errors
  vm.expectRevert("deposit: CAP_EXCEEDED");
  _pool.deposit(0.0001 ether);
}*/

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

  async function setUp() {
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
  }

  async function testPreventsDuplicateSwapPool() {
    expectRevert("addSwapPool():DUPLICATE_SWAP_POOL");
    await backstop.addSwapPool(address(swapPool1), 0);
  }

  async function testCanAddSwapPoolOfSameToken() {
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
  }

  async function testPoolCap() {
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
  }

  async function testOnlyOwnerCanSetPoolCap() {
    await backstop.setPoolCap(unit(100));

    startPrank(BOB);
    expectRevert("Ownable: caller is not the owner");
    await backstop.setPoolCap(unit(100));
    stopPrank();
  }

  const changePoolCoverageTo = async (pool: TestContract, targetCoverageRatio: bigint) => {
    const poolAsset = getContractByAddress(await pool.asset());

    const [reserves, liabilities] = await pool.coverage();
    const targetReserves = (liabilities * targetCoverageRatio) / 10n ** 18n;

    if (targetReserves > reserves) {
      await poolAsset.mint(address(pool), targetReserves - reserves);
    } else {
      startPrank(address(pool));
      await poolAsset.transfer(tester, reserves - targetReserves);
      stopPrank();
    }
  };

  async function testBackstopDeposit() {
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
  }

  async function testImmediateBackstopWithdrawal() {
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
  }

  /*const testPreventsBackstopWithdrawalForUncoveredPool = async () => {
    SwapPool _pool = new SwapPool(address(asset1), address(nablaCurve), address(router), address(backstop), address(0), "Test LP 3", "LP3");
    asset1.approve(address(_pool), MAX_UINT256);

    (uint _lpTokens, ) = _pool.deposit(10 ether);
    vm.roll(1001);

    vm.expectRevert("redeemSwapPoolShares():NO_COVER");
    backstop.redeemSwapPoolShares(address(swapPoolUsd), _lpTokens, 10 ether);
}*/

  return {
    setUp,
    testPreventsDuplicateSwapPool,
    testCanAddSwapPoolOfSameToken,
    testPoolCap,
    testOnlyOwnerCanSetPoolCap,
    testBackstopDeposit,
    testImmediateBackstopWithdrawal,
  };
}
