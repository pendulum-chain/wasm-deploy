/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestContract, TestSuiteEnvironment } from "../../src/index";
import { assertApproxEqAbs, assertApproxEqRel, assertEq, assertGt, assertLt, e } from "../../src/index";

const MAX_UINT256 = 2n ** 256n - 1n;

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,

    tester,
    constructors: {
      newRouter,
      newTestableBackstopPool,
      newMockOracle,
      newMockERC20,
      newSwapPool,
      newNablaCurve,
      newTestableSwapPool,
    },
  } = environment;

  const asset1 = await newMockERC20("Test Token 1", "TEST1");
  const usd = await newMockERC20("Test Backstop Token", "USD");

  const nablaCurve = await newNablaCurve(0, e(0.01, 18));

  const beta = 0.01;
  const c = Math.sqrt(beta * beta + beta) + beta;

  async function displayStatus(pool: any) {
    const as = await pool.accumulatedSlippage();
    const [_B, _l] = await pool.coverage();
    const _b: bigint = (_B as bigint) - as;

    const [B, b, l] = [
      Number(_B / 10n ** 12n) / 10 ** 6,
      Number(_b / 10n ** 12n) / 10 ** 6,
      Number(_l / 10n ** 12n) / 10 ** 6,
    ];

    const phi = b === 0 && l === 0 ? 0 : (beta * (b - l) * (b - l)) / (b + c * l);

    console.log("[B, b, l, phi, B-b] = ", B, b, l, phi, B - b);
  }

  return {
    async setUp() {},

    async _testNabla1() {
      const router = await newRouter();
      const backstop = await newTestableBackstopPool(
        address(router),
        address(usd),
        address(nablaCurve),
        "Test Backstop LP",
        "BLP"
      );

      const failingSwapPool = await newTestableSwapPool(
        address(asset1),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Failing LP",
        "FLP"
      );

      await asset1.approve(address(failingSwapPool), MAX_UINT256);
      await asset1.mint(tester, 1000n * 10n ** 18n);

      const depositResult = await failingSwapPool.deposit(100000n * 10n ** 18n);
      console.log("depositResult", depositResult);
      await displayStatus(failingSwapPool);

      const swapIntoResult = await failingSwapPool.swapIntoFromRouter(100000n * 10n ** 18n);
      console.log("swapIntoResult", swapIntoResult);
      await displayStatus(failingSwapPool);

      const withdrawResult = await failingSwapPool.withdraw(99000n * 10n ** 18n, 0);
      console.log("withdrawResult", withdrawResult);
      await displayStatus(failingSwapPool);

      const nablaResult = await nablaCurve.effectiveSwapIn(
        BigInt(100100 * 10 ** 18),
        BigInt(100 * 10 ** 18),
        BigInt(Math.round(470.42276019572455 * 10 ** 18)),
        BigInt(100 * 10 ** 18)
      );
      console.log("nablaResult", nablaResult);

      const swapIntoResult2 = await failingSwapPool.swapIntoFromRouter(100n * 10n ** 18n);
      console.log("swapIntoResult2", swapIntoResult2);
      await displayStatus(failingSwapPool);
    },

    async _testNabla2() {
      const router = await newRouter();
      const backstop = await newTestableBackstopPool(
        address(router),
        address(usd),
        address(nablaCurve),
        "Test Backstop LP",
        "BLP"
      );

      const failingSwapPool = await newTestableSwapPool(
        address(asset1),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        "Failing LP",
        "FLP"
      );

      await asset1.approve(address(failingSwapPool), MAX_UINT256);
      await asset1.mint(tester, 10000000n * 10n ** 18n);

      const depositResult = await failingSwapPool.deposit(100000n * 10n ** 18n);
      console.log("depositResult", depositResult);
      await displayStatus(failingSwapPool);

      const swapIntoResult = await failingSwapPool.swapIntoFromRouter(100000n * 10n ** 18n);
      console.log("swapIntoResult", swapIntoResult);
      await displayStatus(failingSwapPool);

      const withdrawResult = await failingSwapPool.withdraw(99000n * 10n ** 18n, 0);
      console.log("withdrawResult", withdrawResult);
      await displayStatus(failingSwapPool);

      const nablaResult = await nablaCurve.effectiveSwapIn(
        BigInt(100100 * 10 ** 18),
        BigInt(100 * 10 ** 18),
        BigInt(Math.round(470.42276019572455 * 10 ** 18)),
        BigInt(100 * 10 ** 18)
      );
      console.log("nablaResult", nablaResult);

      const swapIntoResult2 = await failingSwapPool.swapIntoFromRouter(100n * 10n ** 18n);
      console.log("swapIntoResult2", swapIntoResult2);
      await displayStatus(failingSwapPool);
    },

    async testSwap() {
      const FERDIE = "6hXHGkma9bKW6caAA5Z9Pto8Yxh9BbD8ckE15hSAhbMdF7RC";

      const nablaCurve = await newNablaCurve(0, e(0.01, 18));
      const router = await newRouter();
      const treasury = FERDIE;

      const asset1 = await newMockERC20("Test Token 1", "TEST1");
      const asset2 = await newMockERC20("Test Token 2", "TEST2");
      const oracle1 = await newMockOracle(address(asset1), e(1, 18));
      const oracle2 = await newMockOracle(address(asset2), e(5.2, 18));

      const swapPool1 = await newSwapPool(
        address(asset1),
        address(nablaCurve),
        address(router),
        0,
        treasury,
        "Test LP 1",
        "LP1"
      );
      const swapPool2 = await newSwapPool(
        address(asset2),
        address(nablaCurve),
        address(router),
        0,
        treasury,
        "Test LP 2",
        "LP2"
      );

      await asset1.approve(address(router), MAX_UINT256);
      await asset2.approve(address(router), MAX_UINT256);

      await asset1.approve(address(swapPool1), MAX_UINT256);
      await asset2.approve(address(swapPool2), MAX_UINT256);

      await router.setPriceOracle(address(asset1), address(oracle1));
      await router.setPriceOracle(address(asset2), address(oracle2));

      await router.registerPool(address(asset1), address(swapPool1));
      await router.registerPool(address(asset2), address(swapPool2));

      await asset1.mint(tester, e(1_000_000, 18));
      await asset2.mint(tester, e(1_000_000, 18));

      await swapPool1.deposit(e(1000, 18));
      await swapPool2.deposit(e(200_000, 18));

      await displayStatus(swapPool1);
      await displayStatus(swapPool2);

      for (let i = 0; i < 4; i++) {
        const result = await router.swapExactTokensForTokens(
          e(5000 * 5.2, 18),
          0,
          [address(asset1), address(asset2)],
          tester,
          Math.floor(Date.now() / 1000 + 1000)
        );

        console.log("result", result);

        await displayStatus(swapPool1);
        await displayStatus(swapPool2);
      }
    },
  };
}
