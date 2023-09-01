import { AssertionError } from "../commands/test";

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

export function assertEq(a: any, b: any, errorMessage: string): void {
  if (a !== b) {
    throw new AssertionError(`${errorMessage} (expected left = right, left: ${a}, right: ${b})`);
  }
  console.log("AssertEq okay", a, b);
}

export function assertGt(a: bigint, b: bigint, errorMessage: string): void {
  if (a <= b) {
    throw new AssertionError(`${errorMessage} (expected left > right, left: ${a}, right: ${b})`);
  }
  console.log("AssertGt okay", a, b);
}

export function assertApproxEqAbs(a: bigint, b: bigint, maxDelta: bigint, errorMessage: string): void {
  const delta = stdMath.delta(a, b);

  if (delta > maxDelta) {
    throw new AssertionError(`${errorMessage} (expected a approx = right, left: ${a}, right: ${b})`);
  }
  console.log("AssertEqAbs okay", a, b, delta, maxDelta);
}

export function assertApproxEqRel(
  a: bigint,
  b: bigint,
  maxPercentDelta: bigint, // An 18 decimal fixed point number, where 10n ** 18n == 100%
  errorMessage: string
): void {
  if (b === 0n) return assertEq(a, b, errorMessage);

  const percentDelta = stdMath.percentDelta(a, b);

  if (percentDelta > maxPercentDelta) {
    throw new AssertionError(`${errorMessage} (expected a approx = right, left: ${a}, right: ${b})`);
  }
  console.log("AssertEqRel okay", a, b, percentDelta, maxPercentDelta);
}
