/* eslint-disable @typescript-eslint/require-await */
import { request, gql } from "graphql-request";

import { assertEq, assertTrue, e, TestContract, TestSuiteEnvironment } from "../../src/index";

const MAX_UINT256 = 2n ** 256n - 1n;

interface IndexerRouter {
  id: string;
  swapPools: IndexerSwapPools[];
  backstopPool: IndexerBackstopPool[];
  paused: boolean;
}

interface IndexerSwapPools {
  id: string;
  paused: boolean;
  name: string;
  reserve: string;
  reserveWithSlippage: string;
  totalLiabilities: string;
  totalSupply: string;
  feesHistory: IndexerFeesHistory[];
  symbol: string;
  token: IndexerToken;
  apr: string;
}

interface IndexerBackstopPool {
  id: string;
  name: string;
  paused: boolean;
  symbol: string;
  totalSupply: string;
  reserves: string;
  feesHistory: IndexerFeesHistory[];
  coveredSwapPools: { id: string }[];
  apr: string;
}

interface IndexerFeesHistory {
  backstopFees: string;
  lpFees: string;
  protocolFees: string;
}

interface IndexerToken {
  id: string;
  decimals: number;
  name: string;
  symbol: string;
  swapPools: { id: string }[];
}

async function readIndexer(): Promise<IndexerRouter[]> {
  const document = gql`
    {
      routers {
        id
        swapPools {
          id
          paused
          name
          reserve
          reserveWithSlippage
          totalLiabilities
          totalSupply
          apr
          lpTokenDecimals
          feesHistory {
            backstopFees
            lpFees
            protocolFees
            timestamp
            id
          }
          symbol
          token {
            id
            decimals
            name
            symbol
            swapPools {
              id
            }
          }
        }
        backstopPool {
          id
          name
          paused
          symbol
          totalSupply
          apr
          lpTokenDecimals
          reserves
          feesHistory {
            backstopFees
            lpFees
            protocolFees
            timestamp
            id
          }
          coveredSwapPools {
            id
          }
        }
        paused
      }
    }
  `;
  const result: { routers: IndexerRouter[] } = await request("http://localhost:4350/graphql", document);

  console.log(result);
  return result.routers;
}

async function readIndexerUntil(
  condition: (indexerRouter: IndexerRouter[]) => boolean,
  maxTimeoutMs: number
): Promise<IndexerRouter[] | undefined> {
  const startTime = Date.now();

  await new Promise((resolve) => setTimeout(resolve, 1000));
  while (Date.now() - startTime < maxTimeoutMs) {
    const indexerRouters = await readIndexer();
    if (condition(indexerRouters)) {
      return indexerRouters;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return undefined;
}

function assertFeeHistoriesEqual(actual: IndexerFeesHistory, expected: IndexerFeesHistory) {
  assertEq(actual.backstopFees, expected.backstopFees);
  assertEq(actual.lpFees, expected.lpFees);
  assertEq(actual.protocolFees, expected.protocolFees);
}

export default async function (environment: TestSuiteEnvironment) {
  const {
    address,
    unit,
    tester,
    vm,
    constructors: { newRouter, newERC20Wrapper, newSwapPool, newBackstopPool, newMockOracle, newNablaCurve },
  } = environment;

  type NablaInstance = ReturnType<typeof createNablaInstance> extends Promise<infer T> ? T : never;

  const createNablaInstance = async (initialBackstopPoolLiquidity: bigint, intialSwapPoolLiqudity: bigint[]) => {
    const noOfSwapPools = intialSwapPoolLiqudity.length;

    const nablaCurve = await newNablaCurve(0, e(0.01, 18));
    const router = await newRouter();

    const assets = [await newERC20Wrapper("Test US Dollar", "USD", 12, [1], [0], [], [])];
    for (let i = 1; i <= noOfSwapPools; i++) {
      assets.push(await newERC20Wrapper(`Token ${i}`, `Tok${i}`, 12, [1], [i], [], []));
    }

    for (let i = 0; i <= noOfSwapPools; i++) {
      const mintExtrinsic = vm.extrinsicBuilders.tokens.setBalance(tester, { XCM: i }, unit(1000), 0);
      await vm.executeRootExtrinsic(mintExtrinsic);
    }

    const oracles: TestContract[] = [];
    for (let i = 0; i <= noOfSwapPools; i++) {
      const oracle = await newMockOracle(address(assets[i]), unit(i + 1));
      oracles.push(oracle);
      await router.setPriceOracle(address(assets[i]), address(oracle));
    }

    const backstop = await newBackstopPool(address(router), address(assets[0]), "Backstop LP", "BLP");

    const TREASURY = "6k9LbZKC3dYDqaF6qhS9j438Vg1nawD98i8VuHRKxXSvf1rp";
    const swapPools: TestContract[] = [];
    for (let i = 1; i <= noOfSwapPools; i++) {
      const swapPool = await newSwapPool(
        address(assets[i]),
        address(nablaCurve),
        address(router),
        address(backstop),
        TREASURY,
        `LP ${i}`,
        `LP${i}`
      );
      swapPools.push(swapPool);

      await router.registerPool(address(assets[i]), address(swapPool));
      await backstop.addSwapPool(address(swapPool), 0);
    }

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

    for (let i = 0; i <= noOfSwapPools; i++) {
      const mintExtrinsic = vm.extrinsicBuilders.tokens.setBalance(BOB, { XCM: i }, unit(1000), 0);
      await vm.executeRootExtrinsic(mintExtrinsic);
    }

    for (let i = 0; i < noOfSwapPools; i++) {
      await swapPools[i].deposit(intialSwapPoolLiqudity[i]);
    }

    await backstop.deposit(initialBackstopPoolLiquidity);
    vm.stopPrank();

    return { nablaCurve, router, assets, oracles, backstop, swapPools };
  };

  interface SwapPoolConfig {
    reserve: string;
    reserveWithSlippage: string;
    totalLiabilities: string;
    totalSupply: string;
    tokenName: string;
  }

  const verifyIndexer = (
    routers: IndexerRouter[],
    instance: NablaInstance,
    expectedSwapPoolConfig: SwapPoolConfig[]
  ) => {
    const router = routers.find((router) => router.id === address(instance.router))!;
    assertTrue(router !== undefined);

    const backstopPool = router.backstopPool.find((backstopPool) => backstopPool.id === address(instance.backstop))!;
    assertTrue(backstopPool !== undefined);

    assertEq(backstopPool.id, address(instance.backstop));

    assertEq(router.swapPools.length, instance.swapPools.length);
    for (let i = 0; i < instance.swapPools.length; i++) {
      const swapPool = instance.swapPools[i];
      const indexerSwapPool = router.swapPools.find((pool) => pool.id === address(swapPool))!;
      assertTrue(indexerSwapPool !== undefined);

      const swapPoolConfig = expectedSwapPoolConfig[i];
      assertEq(indexerSwapPool.reserve, swapPoolConfig.reserve);
      assertEq(indexerSwapPool.reserveWithSlippage, swapPoolConfig.reserveWithSlippage);
      assertEq(indexerSwapPool.totalLiabilities, swapPoolConfig.totalLiabilities);
      assertEq(indexerSwapPool.totalSupply, swapPoolConfig.totalSupply);
      assertEq(indexerSwapPool.token.name, swapPoolConfig.tokenName);

      assertTrue(backstopPool.coveredSwapPools.find((pool) => pool.id === address(swapPool)) !== undefined);
    }
  };

  return {
    async setUp() {},

    async testStandard() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12), unit(13), unit(14)]);
      const indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers.length > 0 &&
          routers[0].swapPools.length === 4 &&
          routers[0].swapPools[3].reserve === "14000000000000",
        30000
      ))!;
      assertTrue(indexerRouters !== undefined);
      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "11000000000000",
          reserveWithSlippage: "11000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
        {
          reserve: "13000000000000",
          reserveWithSlippage: "13000000000000",
          totalLiabilities: "13000000000000",
          totalSupply: "13000000000000",
          tokenName: "Token 3",
        },
        {
          reserve: "14000000000000",
          reserveWithSlippage: "14000000000000",
          totalLiabilities: "14000000000000",
          totalSupply: "14000000000000",
          tokenName: "Token 4",
        },
      ]);
    },

    async testUnapprovedSwapPool() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers.find((router) => router.id === address(instance.router)) !== undefined &&
          routers[0].swapPools[1].reserve === "12000000000000",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "11000000000000",
          reserveWithSlippage: "11000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      const extraAsset1 = await newERC20Wrapper(`Token Extra 1`, `Ext1`, 12, [1], [3], [], []);
      const extraAsset2 = await newERC20Wrapper(`Token Extra 2`, `Ext2`, 12, [1], [4], [], []);

      // Add a new swap pools that are not approved by the router
      await newSwapPool(
        address(extraAsset1),
        address(instance.nablaCurve),
        address(instance.router),
        address(instance.backstop),
        0,
        `LP Extra 1`,
        `LPE1`
      );

      const extraSwapPool2 = await newSwapPool(
        address(extraAsset2),
        address(instance.nablaCurve),
        address(instance.router),
        address(instance.backstop),
        0,
        `LP Extra 2`,
        `LPE2`
      );

      await new Promise((resolve) => setTimeout(resolve, 3000));
      indexerRouters = await readIndexer();

      // expect that swap pools don't appear
      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "11000000000000",
          reserveWithSlippage: "11000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      // now approve second swap pool
      const extraOracle = await newMockOracle(address(extraAsset2), unit(42));
      await instance.router.setPriceOracle(address(extraAsset2), address(extraOracle));
      await instance.router.registerPool(address(extraAsset2), address(extraSwapPool2));

      instance.swapPools.push(extraSwapPool2);
      indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router))!.swapPools.length === 3,
        10000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "11000000000000",
          reserveWithSlippage: "11000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
        {
          reserve: "0",
          reserveWithSlippage: "0",
          totalLiabilities: "0",
          totalSupply: "0",
          tokenName: "Token Extra 2",
        },
      ]);
    },

    async testReplaceSwapPool() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "11000000000000",
          reserveWithSlippage: "11000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      const replacementPool = await newSwapPool(
        address(instance.assets[1]),
        address(instance.nablaCurve),
        address(instance.router),
        address(instance.backstop),
        0,
        `LP New 1`,
        `LPN1`
      );

      await instance.assets[1].approve(address(replacementPool), MAX_UINT256);
      await replacementPool.deposit(unit(20));

      await new Promise((resolve) => setTimeout(resolve, 3000));
      indexerRouters = await readIndexer();

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "11000000000000",
          reserveWithSlippage: "11000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      await instance.router.registerPool(address(instance.assets[1]), address(replacementPool));

      instance.swapPools[0] = replacementPool;
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((swapPool) => swapPool.id === address(replacementPool)) !== undefined,
        10000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "20000000000000",
          reserveWithSlippage: "20000000000000",
          totalLiabilities: "20000000000000",
          totalSupply: "20000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      // replace again
      const replacementPool2 = await newSwapPool(
        address(instance.assets[1]),
        address(instance.nablaCurve),
        address(instance.router),
        address(instance.backstop),
        0,
        `LP New New 1`,
        `LPNN1`
      );

      await instance.assets[1].approve(address(replacementPool2), MAX_UINT256);
      await replacementPool2.deposit(unit(15));

      await instance.router.registerPool(address(instance.assets[1]), address(replacementPool2));

      instance.swapPools[0] = replacementPool2;
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((swapPool) => swapPool.id === address(replacementPool2)) !== undefined,
        10000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "15000000000000",
          reserveWithSlippage: "15000000000000",
          totalLiabilities: "15000000000000",
          totalSupply: "15000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      // now replace the other pool (asset 2)
      const replacementPool3 = await newSwapPool(
        address(instance.assets[2]),
        address(instance.nablaCurve),
        address(instance.router),
        address(instance.backstop),
        0,
        `LP New New 1`,
        `LPNN1`
      );

      await instance.assets[2].approve(address(replacementPool3), MAX_UINT256);
      await replacementPool3.deposit(unit(28));

      await instance.router.registerPool(address(instance.assets[2]), address(replacementPool3));

      instance.swapPools[1] = replacementPool3;
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((swapPool) => swapPool.id === address(replacementPool3)) !== undefined,
        10000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "15000000000000",
          reserveWithSlippage: "15000000000000",
          totalLiabilities: "15000000000000",
          totalSupply: "15000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "28000000000000",
          reserveWithSlippage: "28000000000000",
          totalLiabilities: "28000000000000",
          totalSupply: "28000000000000",
          tokenName: "Token 2",
        },
      ]);
    },

    async testMultipleBackstopPools() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      const extraBackstopAsset = await newERC20Wrapper(`Backstop Extra`, `BEX`, 12, [1], [4], [], []);
      const extraAsset = await newERC20Wrapper(`Token Extra`, `Ext`, 12, [1], [3], [], []);

      const extraBackstopOracle = await newMockOracle(address(extraBackstopAsset), unit(42));
      const extraOracle = await newMockOracle(address(extraAsset), unit(12));

      await instance.router.setPriceOracle(address(extraBackstopAsset), address(extraBackstopOracle));
      await instance.router.setPriceOracle(address(extraAsset), address(extraOracle));

      const extraBackstop = await newBackstopPool(
        address(instance.router),
        address(extraBackstopAsset),
        "Extra Backstop LP",
        "EBLP"
      );

      const extraSwapPool = await newSwapPool(
        address(extraAsset),
        address(instance.nablaCurve),
        address(instance.router),
        address(extraBackstop),
        0,
        `LP Extra`,
        `LPE`
      );

      await instance.router.registerPool(address(extraAsset), address(extraSwapPool));

      instance.swapPools.push(extraSwapPool);
      indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router))!.swapPools.length === 3,
        10000
      ))!;
      assertTrue(indexerRouters !== undefined);

      const indexerRouter = indexerRouters.find((router) => router.id === address(instance.router))!;
      const originalIndexerBackstop = indexerRouter.backstopPool.find(
        (backstop) => backstop.id === address(instance.backstop)
      )!;
      const extraIndexerBackstop = indexerRouter.backstopPool.find(
        (backstop) => backstop.id === address(extraBackstop)
      )!;

      assertEq(originalIndexerBackstop.coveredSwapPools.length, 2);
      assertEq(extraIndexerBackstop.coveredSwapPools.length, 1);

      assertTrue(originalIndexerBackstop.coveredSwapPools.some((pool) => pool.id === address(instance.swapPools[0])));
      assertTrue(originalIndexerBackstop.coveredSwapPools.some((pool) => pool.id === address(instance.swapPools[1])));
      assertTrue(extraIndexerBackstop.coveredSwapPools.some((pool) => pool.id === address(extraSwapPool)));
    },

    async testSwapPoolDepositsWithdrawals() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      await instance.swapPools[0].deposit(unit(5));
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))?.reserve === "16000000000000",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "16000000000000",
          reserveWithSlippage: "16000000000000",
          totalLiabilities: "16000000000000",
          totalSupply: "16000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "12000000000000",
          reserveWithSlippage: "12000000000000",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      await instance.swapPools[1].deposit(unit(10));
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((pool) => pool.id === address(instance.swapPools[1]))?.reserve === "22000000000000",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "16000000000000",
          reserveWithSlippage: "16000000000000",
          totalLiabilities: "16000000000000",
          totalSupply: "16000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "22000000000000",
          reserveWithSlippage: "22000000000000",
          totalLiabilities: "22000000000000",
          totalSupply: "22000000000000",
          tokenName: "Token 2",
        },
      ]);

      await instance.swapPools[0].withdraw(unit(3), 0);
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))?.reserve === "13000000000000",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "13000000000000",
          reserveWithSlippage: "13000000000000",
          totalLiabilities: "13000000000000",
          totalSupply: "13000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "22000000000000",
          reserveWithSlippage: "22000000000000",
          totalLiabilities: "22000000000000",
          totalSupply: "22000000000000",
          tokenName: "Token 2",
        },
      ]);
    },

    async testBackstopPoolDepositsWithdrawals() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      await instance.backstop.deposit(unit(5));
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.backstopPool.find((pool) => pool.id === address(instance.backstop))?.reserves === "15000000000000",
        3000
      ))!;

      assertTrue(indexerRouters !== undefined);

      let router = indexerRouters.find((router) => router.id === address(instance.router))!;
      assertTrue(router !== undefined);

      let backstopPool = router.backstopPool.find((backstopPool) => backstopPool.id === address(instance.backstop))!;
      assertTrue(backstopPool !== undefined);
      assertEq(backstopPool.reserves, "15000000000000");
      assertEq(backstopPool.totalSupply, "15000000000000");

      // next deposit
      await instance.backstop.deposit(unit(3));
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.backstopPool.find((pool) => pool.id === address(instance.backstop))?.reserves === "18000000000000",
        3000
      ))!;

      assertTrue(indexerRouters !== undefined);

      router = indexerRouters.find((router) => router.id === address(instance.router))!;
      assertTrue(router !== undefined);

      backstopPool = router.backstopPool.find((backstopPool) => backstopPool.id === address(instance.backstop))!;
      assertTrue(backstopPool !== undefined);
      assertEq(backstopPool.reserves, "18000000000000");
      assertEq(backstopPool.totalSupply, "18000000000000");

      // withdrawal
      await instance.backstop.withdraw(unit(6), 0);
      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.backstopPool.find((pool) => pool.id === address(instance.backstop))?.reserves === "12000000000000",
        3000
      ))!;

      assertTrue(indexerRouters !== undefined);

      router = indexerRouters.find((router) => router.id === address(instance.router))!;
      assertTrue(router !== undefined);

      backstopPool = router.backstopPool.find((backstopPool) => backstopPool.id === address(instance.backstop))!;
      assertTrue(backstopPool !== undefined);
      assertEq(backstopPool.reserves, "12000000000000");
      assertEq(backstopPool.totalSupply, "12000000000000");
    },

    async testSwaps() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      await instance.router.swapExactTokensForTokens(
        unit(2),
        0,
        [address(instance.assets[1]), address(instance.assets[2])],
        tester,
        MAX_UINT256
      );

      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))?.reserve === "12997193504712",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "12997193504712",
          reserveWithSlippage: "13000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "10668537663526",
          reserveWithSlippage: "10670015664770",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      await instance.router.swapExactTokensForTokens(
        unit(3),
        0,
        [address(instance.assets[2]), address(instance.assets[1])],
        tester,
        MAX_UINT256
      );

      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))?.reserve === "8497760346518",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "8497760346518",
          reserveWithSlippage: "8504206392314",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "13668159768989",
          reserveWithSlippage: "13670015664770",
          totalLiabilities: "12000000000000",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);
    },

    async testSwapFeeHistory() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      await instance.swapPools[0].setSwapFees(30000, 15000, 10000);
      await instance.swapPools[1].setSwapFees(20000, 10000, 7000);

      await instance.router.swapExactTokensForTokens(
        unit(2),
        0,
        [address(instance.assets[1]), address(instance.assets[2])],
        tester,
        MAX_UINT256
      );

      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))?.reserve === "12997193504712",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      const feeHistory1 = {
        backstopFees: "13314623364",
        lpFees: "26629246729",
        protocolFees: "9298795400",
      };

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "12997193504712",
          reserveWithSlippage: "13000000000000",
          totalLiabilities: "11000000000000",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "10708481533619",
          reserveWithSlippage: "10709924961667",
          totalLiabilities: "12026629246729",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      let router = indexerRouters.find((router) => router.id === address(instance.router))!;
      let indexerSwapPool0 = router.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))!;
      let indexerSwapPool1 = router.swapPools.find((pool) => pool.id === address(instance.swapPools[1]))!;
      assertEq(indexerSwapPool0.feesHistory.length, 0);
      assertEq(indexerSwapPool1.feesHistory.length, 1);
      assertEq(router.backstopPool[0].feesHistory.length, 1);

      assertFeeHistoriesEqual(indexerSwapPool1.feesHistory[0], feeHistory1);
      assertFeeHistoriesEqual(router.backstopPool[0].feesHistory[0], feeHistory1);

      await instance.router.swapExactTokensForTokens(
        unit(3),
        0,
        [address(instance.assets[2]), address(instance.assets[1])],
        tester,
        MAX_UINT256
      );

      indexerRouters = (await readIndexerUntil(
        (routers) =>
          routers
            .find((router) => router.id === address(instance.router))
            ?.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))?.reserve === "8700319091739",
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      const feeHistory2 = {
        backstopFees: "67490174025",
        lpFees: "134980348051",
        protocolFees: "44748936055",
      };

      verifyIndexer(indexerRouters, instance, [
        {
          reserve: "8700319091739",
          reserveWithSlippage: "8706288019563",
          totalLiabilities: "11134980348051",
          totalSupply: "11000000000000",
          tokenName: "Token 1",
        },
        {
          reserve: "13708044823652",
          reserveWithSlippage: "13709924961667",
          totalLiabilities: "12026629246729",
          totalSupply: "12000000000000",
          tokenName: "Token 2",
        },
      ]);

      router = indexerRouters.find((router) => router.id === address(instance.router))!;
      indexerSwapPool0 = router.swapPools.find((pool) => pool.id === address(instance.swapPools[0]))!;
      indexerSwapPool1 = router.swapPools.find((pool) => pool.id === address(instance.swapPools[1]))!;
      assertEq(indexerSwapPool0.feesHistory.length, 1);
      assertEq(indexerSwapPool1.feesHistory.length, 1);
      assertEq(router.backstopPool[0].feesHistory.length, 2);

      assertFeeHistoriesEqual(indexerSwapPool0.feesHistory[0], feeHistory2);
      assertFeeHistoriesEqual(indexerSwapPool1.feesHistory[0], feeHistory1);
      assertFeeHistoriesEqual(router.backstopPool[0].feesHistory[0], feeHistory1);
      assertFeeHistoriesEqual(router.backstopPool[0].feesHistory[1], feeHistory2);
    },

    async testApr() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      await instance.swapPools[0].setSwapFees(300, 150, 100);
      await instance.swapPools[1].setSwapFees(200, 100, 70);

      const amounts = [unit(0.01), unit(0.03), unit(0.02), unit(0.05), unit(0.04), unit(0.08)];

      let counter = 0;
      for (const amount of amounts) {
        counter++;
        await instance.router.swapExactTokensForTokens(
          amount,
          0,
          [address(instance.assets[1]), address(instance.assets[2])],
          tester,
          MAX_UINT256
        );

        indexerRouters = (await readIndexerUntil(
          (routers) =>
            routers
              .find((router) => router.id === address(instance.router))
              ?.swapPools.find((pool) => pool.id === address(instance.swapPools[1]))?.feesHistory.length === counter,
          3000
        ))!;
        const router = indexerRouters.find((router) => router.id === address(instance.router))!;
        const swapPool = router.swapPools.find((pool) => pool.token.id === address(instance.assets[2]))!;
        const backstopPool = router.backstopPool.find((pool) => pool.id === address(instance.backstop))!;
        assertTrue(router !== undefined);
        assertTrue(swapPool !== undefined);
        assertTrue(backstopPool !== undefined);

        const swapPoolTotalSupply = BigInt(swapPool.totalSupply);
        const backstopPoolTotalSupply = BigInt(backstopPool.totalSupply);
        const totalLpFees = swapPool.feesHistory.reduce((a, b) => a + BigInt(b.lpFees), 0n);
        const totalBackstopFees = backstopPool.feesHistory.reduce((a, b) => a + BigInt(b.backstopFees), 0n);

        assertEq(BigInt(swapPool.apr), (totalLpFees * 10n ** 12n * 365n) / 7n / swapPoolTotalSupply);
        assertEq(BigInt(backstopPool.apr), (totalBackstopFees * 10n ** 12n * 365n) / 7n / backstopPoolTotalSupply);
      }
    },

    async testSwapPoolUnregistered() {
      const instance = await createNablaInstance(unit(10), [unit(11), unit(12)]);
      let indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router)) !== undefined,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);

      await instance.router.unregisterPool(address(instance.assets[1]));

      indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router))?.swapPools.length === 1,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);
      const router = indexerRouters.find((router) => router.id === address(instance.router))!;
      assertEq(router.swapPools.length, 1);
      assertEq(router.swapPools[0].id, address(instance.swapPools[1]));

      await instance.router.unregisterPool(address(instance.assets[2]));

      indexerRouters = (await readIndexerUntil(
        (routers) => routers.find((router) => router.id === address(instance.router))?.swapPools.length === 0,
        3000
      ))!;
      assertTrue(indexerRouters !== undefined);
    },
  };
}
