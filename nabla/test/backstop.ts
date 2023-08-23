import { TestContract, TestSuiteEnvironment } from "../../src/types";

const MAX_UINT256 = 2n ** 256n - 1n;

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,
    stopPrank,
    startPrank,
    testNamedAccount,
    namedAccounts,
    constructors: {
      newRouter,
      newTestableBackstopPool,
      newMockERC20,
      newMockOracle,
      newNablaCurve,
      newTestableSwapPool,
    },
  } = environment;

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

  console.log("usd", address(usd));

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
      Math.floor(Date.now() / 1000)
    );
  };

  const testPreventsDuplicateSwapPool = async () => {
    await router!.pause();
  };

  return {
    setUp,
    testPreventsDuplicateSwapPool,
  };
}
