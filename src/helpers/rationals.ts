const SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

export function computeQuotient(a: bigint, b: bigint, precision: number): number {
  while (a > SAFE_INTEGER || b > SAFE_INTEGER) {
    a >>= 1n;
    b >>= 1n;
  }

  return Math.round((Number(a) / Number(b)) * precision) / precision;
}

export function toUnit(unit: bigint, number: number | string | bigint, precision: number = 1): bigint {
  if (typeof number === "string") {
    if (number.indexOf(".") !== -1) {
      number = parseInt(number, 10);
    } else {
      number = BigInt(number);
    }
  }

  if (typeof number === "number") {
    return (BigInt(number * precision) * unit) / BigInt(precision);
  }

  return number * unit;
}
