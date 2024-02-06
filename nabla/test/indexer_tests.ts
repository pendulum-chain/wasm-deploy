/* eslint-disable @typescript-eslint/require-await */
import { e, TestSuiteEnvironment } from "../../src/index";

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,
    tester,
    vm,
    constructors: {
      newRouter,
      newTestableERC20Wrapper,
      newTestableSwapPool,
      newTestableBackstopPool,
      newMockOracle,
      newNablaCurve,
    },
  } = environment;

  const createNablaInstance = async (initialBackstopPoolLiquidity: bigint, intialSwapPoolLiqudity: bigint[]) => {
    const noOfSwapPools = intialSwapPoolLiqudity.length;

    const nablaCurve = await newNablaCurve(0, e(0.01, 18));
    const router = await newRouter();

    const assets = [await newTestableERC20Wrapper("Test US Dollar", "USD", 12, [1], [0], [], [])];
    for (let i = 1; i <= noOfSwapPools; i++) {
      assets.push(await newTestableERC20Wrapper(`Token ${i}`, `Tok${i}`, 12, [1], [i], [], []));
    }

    for (const asset of assets) {
      await asset.mint(tester, unit(1000));
    }

    const oracles = [];
    for (let i = 0; i <= noOfSwapPools; i++) {
      const oracle = await newMockOracle(address(assets[i]), unit(i + 1));
      oracles.push(oracle);
      await router.setPriceOracle(address(assets[i]), address(oracle));
    }

    const backstop = await newTestableBackstopPool(address(router), address(assets[0]), "Backstop LP", "BLP");

    const swapPools = [];
    for (let i = 1; i <= noOfSwapPools; i++) {
      const swapPool = await newTestableSwapPool(
        address(assets[i]),
        address(nablaCurve),
        address(router),
        address(backstop),
        0,
        `LP ${i}`,
        `LP${i}`
      );
      swapPools.push(swapPool);

      await router.registerPool(address(assets[i]), address(swapPool));
      await backstop.addSwapPool(address(swapPool), 0);
    }

    const MAX_UINT256 = 2n ** 256n - 1n;
    await assets[0].approve(address(backstop), MAX_UINT256);
    for (let i = 1; i <= noOfSwapPools; i++) {
      await assets[i].approve(address(router), MAX_UINT256);
      await assets[i].approve(address(swapPools[i - 1]), MAX_UINT256);
    }

    const BOB = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";
    vm.startPrank(BOB);
    await assets[0].approve(address(backstop), MAX_UINT256);
    for (let i = 1; i <= noOfSwapPools; i++) {
      await assets[i].approve(address(router), MAX_UINT256);
      await assets[i].approve(address(swapPools[i - 1]), MAX_UINT256);
    }

    for (const asset of assets) {
      await asset.mint(BOB, unit(1000));
    }

    for (let i = 0; i < noOfSwapPools; i++) {
      await swapPools[i].deposit(intialSwapPoolLiqudity[i]);
    }

    await backstop.deposit(initialBackstopPoolLiquidity);
    vm.stopPrank();

    return { nablaCurve, router, assets, oracles, backstop, swapPools };
  };

  return {
    async setUp() {},

    async testIndexer1() {
      await createNablaInstance(unit(10), [unit(11), unit(12), unit(13)]);
    },
  };
}
