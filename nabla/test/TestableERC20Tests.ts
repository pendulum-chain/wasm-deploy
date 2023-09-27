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

    const asset1 = await newTestableERC20Wrapper("TestNative", "TEST1", 12, [0], [0], [], []);
    const asset2 = await newTestableERC20Wrapper("TestNonNative", "TEST2", 12, [1], [1], [], []);


    const MINT_AMOUNT = unit(10000);
    const BURN_AMOUNT = unit(10);


    return {
        async setUp() {

        },
        async testMintsNative() {
            let totalSupplyBef = await asset1.totalSupply();
            await asset1.mint(BOB, MINT_AMOUNT);
            let totalSupplyAft = await asset1.totalSupply();

            assertEq(totalSupplyAft - totalSupplyBef, MINT_AMOUNT);
        },

        async testMintsTokensPallet() {
            let totalSupplyBef = await asset2.totalSupply();
            let balanceBobBef = await asset2.balanceOf(BOB);

            await asset2.mint(BOB, MINT_AMOUNT);

            let totalSupplyAft = await asset2.totalSupply();
            let balanceBob = await asset2.balanceOf(BOB);

            assertEq(totalSupplyAft - totalSupplyBef, MINT_AMOUNT);
            assertEq(balanceBob - balanceBobBef, MINT_AMOUNT);
        },

        async testBurnsNative() {
            let totalSupplyBef = await asset1.totalSupply();
            await asset1.burn(BOB, BURN_AMOUNT);
            let totalSupplyAft = await asset1.totalSupply();

            assertEq(totalSupplyBef - totalSupplyAft, BURN_AMOUNT);
        },

        async testBurnsToken() {
            let totalSupplyBef = await asset2.totalSupply();
            await asset2.burn(BOB, BURN_AMOUNT);
            let totalSupplyAft = await asset2.totalSupply();

            assertEq(totalSupplyBef - totalSupplyAft, BURN_AMOUNT);
        },



    };
}