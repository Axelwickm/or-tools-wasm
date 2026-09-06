import Long from 'long';
import * as protobufModule from 'protobufjs';

protobufModule.util.Long = Long;
protobufModule.configure();

type ProtobufLong = {
  low: number;
  high: number;
  unsigned: boolean;
};

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
  return {
    low: Number(BigInt.asIntN(32, value)),
    high: Number(BigInt.asIntN(32, value >> 32n)),
    unsigned: false,
  };
}

export function encodeProtobufBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') return bigintAsLong(value);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(encodeProtobufBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeProtobufBigInts(entry)]),
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
