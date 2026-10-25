import Long from 'long';
import * as protobufModule from 'protobufjs/light.js';

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
    : BigInt(value.high | 0) * 0x100000000n + BigInt(value.low >>> 0);
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

const protobufFieldAliases = new WeakMap<protobufModule.Type, Map<string, protobufModule.Field>>();

/** Reject fields that protobufjs would silently discard and normalize JSON aliases. */
export function normalizeProtobufInput(value: unknown, type: protobufModule.Type, path = type.name): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Uint8Array) {
    throw new TypeError(`${path} must be a protobuf message object.`);
  }
  let aliases = protobufFieldAliases.get(type);
  if (!aliases) {
    aliases = new Map();
    for (const field of type.fieldsArray) {
      aliases.set(field.name, field.resolve());
      aliases.set(field.name.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`), field);
      aliases.set(field.name.replace(/_([a-zA-Z0-9])/g, (_match, letter: string) => letter.toUpperCase()), field);
    }
    protobufFieldAliases.set(type, aliases);
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    const field = aliases.get(key);
    if (!field) throw new TypeError(`Unknown protobuf field ${path}.${key}.`);
    if (Object.prototype.hasOwnProperty.call(normalized, field.name)) throw new TypeError(`Duplicate protobuf field ${path}.${key}.`);
    const nested = field.resolvedType;
    // protobufjs decoding represents absent optional messages as null.
    if (entry === null && nested instanceof protobufModule.Type && !field.repeated && !field.map) continue;
    const fieldPath = `${path}.${key}`;
    if (field.map) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError(`${fieldPath} must be a map.`);
      normalized[field.name] = Object.fromEntries(Object.entries(entry).map(([mapKey, mapValue]) => [mapKey,
        nested instanceof protobufModule.Type ? normalizeProtobufInput(mapValue, nested, `${fieldPath}[${mapKey}]`) : mapValue]));
    } else if (nested instanceof protobufModule.Type) {
      if (field.repeated) {
        if (!Array.isArray(entry)) throw new TypeError(`${fieldPath} must be an array.`);
        normalized[field.name] = entry.map((item, index) => normalizeProtobufInput(item, nested, `${fieldPath}[${index}]`));
      } else normalized[field.name] = normalizeProtobufInput(entry, nested, fieldPath);
    } else normalized[field.name] = entry;
  }
  return normalized;
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
  if (['int64', 'sint64', 'sfixed64', 'uint64', 'fixed64'].includes(String(type)) && typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError(`int64 value ${value} must be a safe integer number; use bigint for larger integers.`);
  }
  if (['uint64', 'fixed64'].includes(String(type)) && typeof value === 'number' && value < 0) {
    throw new RangeError(`uint64 value ${value} must be nonnegative.`);
  }
  if (['int32', 'sint32', 'sfixed32'].includes(String(type)) && typeof value === 'number' &&
      (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)) {
    throw new RangeError(`int32 value ${value} must be an integer in the signed 32-bit range.`);
  }
  if (['uint32', 'fixed32'].includes(String(type)) && typeof value === 'number' &&
      (!Number.isInteger(value) || value < 0 || value > 4294967295)) {
    throw new RangeError(`uint32 value ${value} must be an integer in the unsigned 32-bit range.`);
  }
  if (isProtobufLong(value) && ['int64', 'sint64', 'sfixed64', 'uint64', 'fixed64'].includes(String(type))) {
    for (const bits of [value.low, value.high]) {
      if (!Number.isInteger(bits) || bits < -2147483648 || bits > 4294967295) {
        throw new RangeError('Protobuf Long low/high values must fit 32-bit words.');
      }
    }
    return encodeProtobufBigInts(exactLongValue(value), type);
  }
  if (typeof value === 'bigint' && ['uint64', 'fixed64'].includes(String(type))) {
    if (value < 0n || value > (1n << 64n) - 1n) throw new RangeError(`BigInt value ${value} is outside the unsigned 64-bit integer range.`);
    return { low: Number(BigInt.asIntN(32, value)), high: Number(BigInt.asIntN(32, value >> 32n)), unsigned: true };
  }
  if (typeof value === 'bigint') return bigintAsLong(value);
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map((entry) => encodeProtobufBigInts(entry, type));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const field = type instanceof protobufModule.Type ? type.fields[key]?.resolve() : undefined;
        const entryType = field?.resolvedType ?? field?.type;
        if (field?.map && entry && typeof entry === 'object' && !Array.isArray(entry)) {
          return [key, Object.fromEntries(Object.entries(entry).map(([mapKey, mapValue]) =>
            [mapKey, encodeProtobufBigInts(mapValue, entryType)]))];
        }
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
  enums: StringConstructor | NumberConstructor = String,
  defaults = true,
): T {
  return protobufObjectWithExactLongs<T>(type, type.decode(bytes), enums, defaults);
}

/** Convert a decoded message without narrowing its int64 fields. */
export function protobufObjectWithExactLongs<T>(
  type: protobufModule.Type,
  message: protobufModule.Message,
  enums: StringConstructor | NumberConstructor = String,
  defaults = true,
): T {
  const value = type.toObject(message, {
    enums,
    defaults,
    arrays: true,
    objects: true,
  });
  return preserveExactProtobufLongs(value) as T;
}

/** Remove absent message defaults while retaining scalar defaults and bytes. */
export function omitAbsentProtobufMessages<T>(value: T): T {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(omitAbsentProtobufMessages) as T;
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null)
      .map(([key, entry]) => [key, omitAbsentProtobufMessages(entry)])) as T;
  return value;
}
