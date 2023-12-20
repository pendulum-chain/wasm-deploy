/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestSuiteEnvironment } from "../../src/index";
import { assertEq } from "../../src/index";

const BOB = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";

export default async function (environment: TestSuiteEnvironment) {
  const {
    unit,
    constructors: { newTestableERC20Wrapper },
  } = environment;

  const assetNative = await newTestableERC20Wrapper("TestNative", "TEST1", 12, [0], [0], [], []);
  const token1 = await newTestableERC20Wrapper("TestNonNative", "TEST2", 12, [1], [1], [], []);

  const MINT_AMOUNT = unit(10000);
  const BURN_AMOUNT = unit(10);

  return {
    async setUp() {},
    async testMintsNative() {
      const totalSupplyBef = await assetNative.totalSupply();
      await assetNative.mint(BOB, MINT_AMOUNT);
      const totalSupplyAft = await assetNative.totalSupply();

      assertEq(totalSupplyAft - totalSupplyBef, MINT_AMOUNT);
    },

    async testMintsTokensPallet() {
      const totalSupplyBef = await token1.totalSupply();
      const balanceBobBef = await token1.balanceOf(BOB);

      await token1.mint(BOB, MINT_AMOUNT);

      const totalSupplyAft = await token1.totalSupply();
      const balanceBob = await token1.balanceOf(BOB);

      assertEq(totalSupplyAft - totalSupplyBef, MINT_AMOUNT);
      assertEq(balanceBob - balanceBobBef, MINT_AMOUNT);
    },

    async testBurnsNative() {
      const totalSupplyBef = await assetNative.totalSupply();
      await assetNative.burn(BOB, BURN_AMOUNT);
      const totalSupplyAft = await assetNative.totalSupply();

      assertEq(totalSupplyBef - totalSupplyAft, BURN_AMOUNT);
    },

    async testBurnsToken() {
      const totalSupplyBef = await token1.totalSupply();
      await token1.burn(BOB, BURN_AMOUNT);
      const totalSupplyAft = await token1.totalSupply();

      assertEq(totalSupplyBef - totalSupplyAft, BURN_AMOUNT);
    },
  };
}
