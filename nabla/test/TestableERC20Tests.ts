/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestContract, TestSuiteEnvironment } from "../../src/index";
import { assertApproxEqAbs, assertApproxEqRel, assertEq, assertGt, assertLt, e } from "../../src/index";

const MAX_UINT256 = 2n ** 256n - 1n;

const BOB = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";

export default async function (environment: TestSuiteEnvironment) {
    const {
        address,
        unit,
        milliUnit,
        microUnit,
        getContractByAddress,
        vm,
        tester,
        constructors: {
            newTestableERC20Wrapper,
        },
    } = environment;

    let router: TestContract;
    let backstop: TestContract;
    let swapPool1: TestContract;
    let swapPool2: TestContract;

    const assetNative = await newTestableERC20Wrapper("TestNative", "TEST1", 12, [0], [0], [], []);
    const token1 = await newTestableERC20Wrapper("TestNonNative", "TEST2", 12, [1], [1], [], []);


    const MINT_AMOUNT = unit(10000);
    const BURN_AMOUNT = unit(10);


    return {
        async setUp() {

        },
        async testMintsNative() {
            let totalSupplyBef = await assetNative.totalSupply();
            await assetNative.mint(BOB, MINT_AMOUNT);
            let totalSupplyAft = await assetNative.totalSupply();

            assertEq(totalSupplyAft - totalSupplyBef, MINT_AMOUNT);
        },

        async testMintsTokensPallet() {
            let totalSupplyBef = await token1.totalSupply();
            let balanceBobBef = await token1.balanceOf(BOB);

            await token1.mint(BOB, MINT_AMOUNT);

            let totalSupplyAft = await token1.totalSupply();
            let balanceBob = await token1.balanceOf(BOB);

            assertEq(totalSupplyAft - totalSupplyBef, MINT_AMOUNT);
            assertEq(balanceBob - balanceBobBef, MINT_AMOUNT);
        },

        async testBurnsNative() {
            let totalSupplyBef = await assetNative.totalSupply();
            await assetNative.burn(BOB, BURN_AMOUNT);
            let totalSupplyAft = await assetNative.totalSupply();

            assertEq(totalSupplyBef - totalSupplyAft, BURN_AMOUNT);
        },

        async testBurnsToken() {
            let totalSupplyBef = await token1.totalSupply();
            await token1.burn(BOB, BURN_AMOUNT);
            let totalSupplyAft = await token1.totalSupply();

            assertEq(totalSupplyBef - totalSupplyAft, BURN_AMOUNT);
        },



    };
}