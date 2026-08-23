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
  const bigint = value.unsigned
    ? (BigInt(value.high >>> 0) << 32n) | BigInt(value.low >>> 0)
    : BigInt(value.high) * 0x100000000n + BigInt(value.low >>> 0);
  if (bigint >= BigInt(Number.MIN_SAFE_INTEGER) &&
      bigint <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(bigint);
  }
  return {
    low: value.low,
    high: value.high,
    unsigned: value.unsigned,
  };
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
