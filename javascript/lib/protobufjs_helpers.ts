import Long from 'long';
import * as protobufModule from 'protobufjs';

protobufModule.util.Long = Long;
protobufModule.configure();

type ProtobufLong = {
  low: number;
  high: number;
  unsigned: boolean;
};

const int64Min = -(1n << 63n);
const int64Max = (1n << 63n) - 1n;

function isProtobufLong(value: unknown): value is ProtobufLong {
  return value !== null &&
    typeof value === 'object' &&
    typeof (value as Partial<ProtobufLong>).low === 'number' &&
    typeof (value as Partial<ProtobufLong>).high === 'number' &&
    typeof (value as Partial<ProtobufLong>).unsigned === 'boolean';
}

function exactLongValue(value: ProtobufLong) {
  return value.unsigned
    ? (BigInt(value.high >>> 0) << 32n) | BigInt(value.low >>> 0)
    : BigInt(value.high) * 0x100000000n + BigInt(value.low >>> 0);
}

function bigintAsLong(value: bigint): ProtobufLong {
  if (value < int64Min || value > int64Max) {
    throw new RangeError(`BigInt value ${value} is outside the signed 64-bit integer range.`);
  }
  return {
    low: Number(BigInt.asIntN(32, value)),
    high: Number(BigInt.asIntN(32, value >> 32n)),
    unsigned: false,
  };
}

export function encodeProtobufBigInts(
  value: unknown,
  type?: protobufModule.Type | protobufModule.Enum | string,
): unknown {
  if (type instanceof protobufModule.Enum && typeof value === 'string') {
    if (!Object.prototype.hasOwnProperty.call(type.values, value)) {
      throw new TypeError(`Unknown ${type.fullName} enum name: ${value}`);
    }
    return type.values[value];
  }
  if (type === 'int64' && typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`int64 value ${value} must be a safe integer number; use bigint for larger integers.`);
  }
  if (type === 'int32' && typeof value === 'number' &&
      (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) {
    throw new RangeError(`int32 value ${value} must be an integer in the signed 32-bit range.`);
  }
  if (typeof value === 'bigint') return bigintAsLong(value);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map((entry) => encodeProtobufBigInts(entry, type));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const field = type instanceof protobufModule.Type ? type.fields[key]?.resolve() : undefined;
        const entryType = field?.resolvedType ?? field?.type;
        return [key, encodeProtobufBigInts(entry, entryType)];
      }),
    );
  }
  return value;
}

function preserveExactProtobufLongs(value: unknown): unknown {
  if (isProtobufLong(value)) return exactLongValue(value);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(preserveExactProtobufLongs);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, preserveExactProtobufLongs(entry)]),
    );
  }
  return value;
}

export function decodeProtobufWithExactLongs<T>(
  type: protobufModule.Type,
  bytes: Uint8Array,
): T {
  const value = type.toObject(type.decode(bytes), {
    enums: String,
    defaults: true,
    arrays: true,
    objects: true,
  });
  return preserveExactProtobufLongs(value) as T;
}
