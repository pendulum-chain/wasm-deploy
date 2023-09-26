/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestSuiteEnvironment } from "wasm-deploy";
import { assertEq } from "wasm-deploy";

const CHARLIE = "6k9LbZKC3dYDqaF6qhS9j438Vg1nawD98i8VuHRKxXSvf1rp";
const BOB = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";

export default async function (environment: TestSuiteEnvironment) {
    const {
        constructors: { newERC20 },
        vm,
        tester
    } = environment;

    const erc20 = await newERC20("MyToken", "MT", 12, 100_000_000n);

    return {
        async testApprove() {
            vm.expectEmit(erc20, "Approval", [tester, CHARLIE, 100n]);
            await erc20.approve(CHARLIE, 100);

        },

        async testTransfer() {
            await erc20.transfer(CHARLIE, 100);
            let balanceOfRec = await erc20.balanceOf(CHARLIE);

            assertEq(100n, balanceOfRec, "transferred amount does not match")
        },

        async testTransferInsBalance() {

            vm.startPrank(BOB);
            vm.expectRevert("Insufficient balance");
            await erc20.transfer(CHARLIE, 100);
            vm.stopPrank();
        },

        async testAllowance() {
            await erc20.approve(BOB, 100);

            vm.startPrank(BOB);
            await erc20.transferFrom(tester, CHARLIE, 80);
            vm.stopPrank();

            let balanceOfRec = await erc20.balanceOf(CHARLIE);
            assertEq(80n, balanceOfRec, "transferred amount does not match")
        },

        async testInsuficientAllowanceForTransfer() {
            await erc20.approve(BOB, 100);

            vm.startPrank(BOB);
            vm.expectRevert("Insufficient allowance");
            await erc20.transferFrom(tester, CHARLIE, 120);
            vm.stopPrank();

        },

    };
}
