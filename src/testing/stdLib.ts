import { AssertionError } from "../commands/test";
import { toUnit } from "../utils/rationals";

const stdMath = (() => {
  function abs(a: bigint): bigint {
    return a >= 0n ? a : -a;
  }

  function delta(a: bigint, b: bigint): bigint {
    return a > b ? a - b : b - a;
  }

  function percentDelta(a: bigint, b: bigint): bigint {
    const absDelta = delta(a, b);
    return (absDelta * 10n ** 18n) / abs(b);
  }

  return { abs, delta, percentDelta };
})();

export function assertTrue(condition: boolean, errorMessage?: string) {
  if (!condition) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected true, got ${condition})`);
  }
  console.log("AssertTrue okay", condition);
}

export function assertFalse(condition: boolean, errorMessage?: string) {
  if (condition) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected false, got ${condition})`);
  }
  console.log("AssertFalse okay", condition);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function assertEq(a: any, b: any, errorMessage?: string): void {
  if (a !== b) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected left = right, left: ${a}, right: ${b})`);
  }
  console.log("AssertEq okay", a, b);
}

export function assertGt(a: bigint, b: bigint, errorMessage?: string): void {
  if (a <= b) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected left > right, left: ${a}, right: ${b})`);
  }
  console.log("AssertGt okay", a, b);
}

export function assertGe(a: bigint, b: bigint, errorMessage?: string): void {
  if (a < b) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected left >= right, left: ${a}, right: ${b})`);
  }
  console.log("AssertGe okay", a, b);
}

export function assertLt(a: bigint, b: bigint, errorMessage?: string): void {
  if (a >= b) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected left < right, left: ${a}, right: ${b})`);
  }
  console.log("AssertLt okay", a, b);
}

export function assertLe(a: bigint, b: bigint, errorMessage?: string): void {
  if (a > b) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected left <= right, left: ${a}, right: ${b})`);
  }
  console.log("AssertLe okay", a, b);
}

export function assertApproxEqAbs(a: bigint, b: bigint, maxDelta: bigint, errorMessage?: string): void {
  const delta = stdMath.delta(a, b);

  if (delta > maxDelta) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected a approx = right, left: ${a}, right: ${b})`);
  }
  console.log("AssertEqAbs okay", a, b, delta, maxDelta);
}

export function assertApproxEqRel(
  a: bigint,
  b: bigint,
  maxPercentDelta: bigint, // An 18 decimal fixed point number, where 10n ** 18n == 100%
  errorMessage?: string
): void {
  if (b === 0n) return assertEq(a, b, errorMessage);

  const percentDelta = stdMath.percentDelta(a, b);

  if (percentDelta > maxPercentDelta) {
    const prefix = errorMessage ? `${errorMessage}: ` : "";
    throw new AssertionError(`${prefix}(expected a approx = right, left: ${a}, right: ${b})`);
  }
  console.log("AssertEqRel okay", a, b, percentDelta, maxPercentDelta);
}

// this function is used to form expressions like 0.025e18 in order to minimize
// numerical errors – just call the function as e(0.025, 18)
// possible numerical errors:
// - expressions of the form 0.025e18 are larger than Number.MAX_SAFE_INTEGER
// - transforming fractions such as 0.025 into BigInt can lead to numerical deviations
export function e(factor: number, decimalExponent: number): bigint {
  return toUnit(10n ** BigInt(decimalExponent), factor);
}
