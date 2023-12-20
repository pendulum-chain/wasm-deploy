/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { TestContract, TestSuiteEnvironment, assertEq } from "../../../src";

const BOB = "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT";

export async function testPoolCap(pool: TestContract, environment: TestSuiteEnvironment) {
  const { address, unit, microUnit, vm, getContractByAddress } = environment;

  assertEq(await pool.poolCap(), 2n ** 256n - 1n, "Expected pool to have max cap by default");

  const poolAsset = getContractByAddress(await pool.asset());
  const poolBalance = await poolAsset.balanceOf(address(pool));

  const newCap = poolBalance + unit(1);
  await pool.setPoolCap(newCap);

  // Expectation: No revert
  await pool.deposit(unit(1));

  // Expectation: Even tiny deposit fails, but cannot be minimally small or curve errors
  vm.expectRevert("deposit: CAP_EXCEEDED");
  await pool.deposit(microUnit(100));
}

export async function testOnlyOwnerCanSetPoolCap(pool: TestContract, environment: TestSuiteEnvironment) {
  const { unit, vm } = environment;

  await pool.setPoolCap(unit(100));

  vm.startPrank(BOB);
  vm.expectRevert("Ownable: caller is not the owner");
  await pool.setPoolCap(unit(100));
  vm.stopPrank();
}
