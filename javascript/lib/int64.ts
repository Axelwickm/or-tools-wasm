export const INT64_MIN = -9_223_372_036_854_775_808n;
export const INT64_MAX = 9_223_372_036_854_775_807n;

export type IntValue = number | bigint;

export function toInt64(value: IntValue, label = 'integer'): bigint {
  let exact: bigint;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${label} must be a safe integer or bigint, got ${value}`);
    }
    exact = BigInt(value);
  } else if (typeof value === 'bigint') {
    exact = value;
  } else {
    throw new TypeError(`${label} must be a safe integer or bigint`);
  }
  if (exact < INT64_MIN || exact > INT64_MAX) {
    throw new RangeError(`${label} is outside signed int64 range: ${exact}`);
  }
  return exact;
}

export function toIndex(
  value: IntValue,
  label = 'index',
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const exact = toInt64(value, label);
  if (exact < 0n || exact > BigInt(maximum)) {
    throw new RangeError(`${label} is outside range 0..${maximum}: ${exact}`);
  }
  return Number(exact);
}

export function asNumber(value: IntValue, label = 'integer'): number {
  const number = Number(toInt64(value, label));
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`${label} cannot be represented as a safe JavaScript number: ${value}`);
  }
  return number;
}
