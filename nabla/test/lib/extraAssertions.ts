import { assertApproxEqAbs, assertApproxEqRel } from "../../../src/index";

export function assertApproxEq(a: bigint, b: bigint, errorMessage: string): void {
  if (a !== 0n && b !== 0n) {
    assertApproxEqRel(a, b, 5n * 10n ** 15n, errorMessage);
  } else {
    assertApproxEqAbs(a, b, 10000n, errorMessage);
  }
}
