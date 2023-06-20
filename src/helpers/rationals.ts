const SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

export function computeQuotient(a: bigint, b: bigint, precision: number): number {
  while (a > SAFE_INTEGER || b > SAFE_INTEGER) {
    a >>= 1n;
    b >>= 1n;
  }

  return Math.round((Number(a) / Number(b)) * precision) / precision;
}
