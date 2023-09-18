const SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

export function computeQuotient(a: bigint, b: bigint, precision: number): number {
  while (a > SAFE_INTEGER || b > SAFE_INTEGER) {
    a >>= 1n;
    b >>= 1n;
  }

  return Math.round((Number(a) / Number(b)) * precision) / precision;
}

export function toUnit(unit: bigint, number: number | string | bigint): bigint {
  if (typeof number === "string") {
    if (number.indexOf(".") !== -1) {
      const [integerPart, fractionalPart] = number.split(".");
      const scale = 10n ** BigInt(fractionalPart.length);
      number = BigInt(integerPart) * scale + BigInt(fractionalPart);
      return (number * unit) / scale;
    } else {
      number = BigInt(number);
    }
  }

  if (typeof number === "number") {
    const { numerator, denominator } = approximateAsFraction(number);
    return (BigInt(numerator) * unit) / BigInt(denominator);
  }

  return number * unit;
}

export const MAX_INT32 = 0x7fffffff;

export function approximateAsFraction(number: number): { numerator: number; denominator: number } {
  if (number === 0) {
    return { numerator: 0, denominator: 1 };
  }
  // approximate number as fraction constructing continued fraction
  let [numerator1, denominator1] = [0, 1];
  let [numerator2, denominator2] = [1, 0];

  while (number <= MAX_INT32) {
    const integerPart = Math.floor(number);
    const numerator = integerPart * numerator2 + numerator1;
    const denominator = integerPart * denominator2 + denominator1;
    if (numerator > MAX_INT32 || denominator > MAX_INT32) {
      break;
    }

    [numerator1, denominator1] = [numerator2, denominator2];
    [numerator2, denominator2] = [numerator, denominator];

    const fractionalPart = number - integerPart;
    if (fractionalPart === 0) {
      break;
    }
    number = 1 / fractionalPart;
  }

  if (numerator2 === 0 || denominator2 === 0) {
    throw new Error("Number cannot be approximated as positive fraction");
  }

  return { numerator: numerator2, denominator: denominator2 };
}
