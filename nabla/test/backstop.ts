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
    testNamedAccount,
    namedAccounts,
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

  const setUp = async () => {
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

    await asset1.mint(testNamedAccount.accountId, MINT_AMOUNT);
    await asset2.mint(testNamedAccount.accountId, MINT_AMOUNT);
    await usd.mint(testNamedAccount.accountId, MINT_AMOUNT);

    startPrank(namedAccounts.bob);
    await asset1.approve(address(swapPool1), MAX_UINT256);
    await asset2.approve(address(swapPool2), MAX_UINT256);
    await usd.approve(address(backstop), MAX_UINT256);
    await asset1.mint(namedAccounts.bob.accountId, MINT_AMOUNT);
    await asset2.mint(namedAccounts.bob.accountId, MINT_AMOUNT);
    await usd.mint(namedAccounts.bob.accountId, MINT_AMOUNT);
    await swapPool1.deposit(MINT_AMOUNT);
    await swapPool2.deposit(MINT_AMOUNT);
    await backstop.deposit(MINT_AMOUNT);
    stopPrank();

    await router.swapExactTokensForTokens(
      unit(30),
      unit(14),
      [address(asset1), address(asset2)],
      testNamedAccount.accountId,
      Math.floor(Date.now() / 1000) + 2
    );
  };

  const testPreventsDuplicateSwapPool = async () => {
    expectRevert("addSwapPool():DUPLICATE_SWAP_POOL");
    await backstop.addSwapPool(address(swapPool1), 0);
  };

  const testCanAddSwapPoolOfSameToken = async () => {
    const _pool = await newSwapPool(
      address(usd),
      address(nablaCurve),
      address(router),
      address(backstop),
      0,
      "Test LP 3",
      "LP3"
    );

    // Need to be able to do that, will need to secure by other means
    await backstop.addSwapPool(address(_pool), 0);
  };

  const testPoolCap = async () => {
    assertEq((await backstop.poolCap()).toBigInt(), 2n ** 256n - 1n, "Expected pool to have max cap by default");

    await backstop.deposit(unit(1));

    const _reserves = (await backstop.coverage())[0].toBigInt();
    const _newCap = _reserves + unit(1);
    await backstop.setPoolCap(_newCap);

    // Expectation: No revert
    await backstop.deposit(unit(1));

    // Expectation: Even tiny deposit fails, but cannot be minimally small or curve errors
    expectRevert("deposit: CAP_EXCEEDED");
    await backstop.deposit(microUnit(100));
  };

  const testOnlyOwnerCanSetPoolCap = async () => {
    await backstop.setPoolCap(unit(100));

    startPrank(namedAccounts.bob);
    expectRevert("Ownable: caller is not the owner");
    await backstop.setPoolCap(unit(100));
    stopPrank();
  };

  const testBackstopDeposit = async () => {
    const coverage = await backstop.coverage();
    const _reservesBefore = coverage[0].toBigInt();
    const _liabilitiesBefore = coverage[1].toBigInt();
    const _poolShares = (await backstop.simulateDeposit(unit(10)))[0].toBigInt();

    expectEmit(backstop, "Mint", [testNamedAccount.accountId, _poolShares, unit(10)]);
    const depositResult = await backstop.deposit(unit(10));
    const _lpTokens = depositResult[0].toBigInt();
    const _fee = depositResult[1].toBigInt();

    const coverageResult = await backstop.coverage();
    const _reservesAfter = coverageResult[0].toBigInt();
    const _liabilitiesAfter = coverageResult[1].toBigInt();

    const backStopBalance = (await backstop.balanceOf(testNamedAccount.accountId)).toBigInt();
    const usdBalance = (await usd.balanceOf(address(backstop))).toBigInt();
    assertEq(backStopBalance, _lpTokens, "Returned amount of shares mismatch");
    assertEq(usdBalance, _reservesAfter, "Returned reserves mismatch");
    assertGt(_lpTokens, 0n, "Must have received LP tokens");
    assertApproxEq(_fee, 0n, "Unexpected fee");
    assertApproxEq(_liabilitiesAfter, _liabilitiesBefore + unit(10), "Final liabilities mismatch");
    assertApproxEq(_reservesAfter, _reservesBefore + unit(10), "Final reserves mismatch");
  };

  return {
    setUp,
    testPreventsDuplicateSwapPool,
    testCanAddSwapPoolOfSameToken,
    testPoolCap,
    testOnlyOwnerCanSetPoolCap,
    testBackstopDeposit,
  };
}
