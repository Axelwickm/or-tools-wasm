import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as protobufModule from 'protobufjs';
import { cpModelProtoSchema, satParametersProtoSchema } from '../lib/generated/cp_sat_schemas.ts';
import {
  decodeProtobufWithExactLongs,
  encodeProtobufBigInts,
  omitAbsentProtobufMessages,
} from '../lib/protobufjs_helpers.ts';

const int64Min = -(1n << 63n);
const int64Max = (1n << 63n) - 1n;

test('protobuf encoding accepts signed int64 bigint boundaries in nested domains', () => {
  const type = protobufModule.parse(cpModelProtoSchema).root.lookupType(
    'operations_research.sat.CpModelProto',
  );
  const model = encodeProtobufBigInts({
    variables: [{ domain: [int64Min, int64Max] }],
  }) as Record<string, unknown>;
  assert.equal(type.verify(model), null);

  const bytes = type.encode(type.create(model)).finish();
  const decoded = decodeProtobufWithExactLongs<{
    variables: Array<{ domain: bigint[] }>;
  }>(type, bytes);
  assert.deepEqual(decoded.variables[0]?.domain, [int64Min, int64Max]);
});

test('protobuf encoding rejects bigint values outside the signed int64 range', () => {
  for (const value of [int64Max + 1n, int64Min - 1n, 1n << 64n, -(1n << 64n)]) {
    assert.throws(
      encodeLikeModel(value),
      {
        name: 'RangeError',
        message: `BigInt value ${value} is outside the signed 64-bit integer range.`,
      },
    );
  }
});

function encodeLikeModel(value: bigint): () => unknown {
  return () => encodeProtobufBigInts({ variables: [{ domain: [value, value] }] });
}

const modelType = protobufModule.parse(cpModelProtoSchema).root.lookupType(
  'operations_research.sat.CpModelProto',
);
const parametersType = protobufModule.parse(satParametersProtoSchema).root.lookupType(
  'operations_research.sat.SatParameters',
);

function encodeVerified(type: protobufModule.Type, value: unknown): Uint8Array {
  const converted = encodeProtobufBigInts(value, type) as Record<string, unknown>;
  assert.equal(type.verify(converted), null);
  return type.encode(type.create(converted)).finish();
}

test('enum names and numbers encode identically in scalar, repeated, and recursive parameters', () => {
  const named = {
    searchBranching: 'FIXED_SEARCH',
    restartAlgorithms: ['NO_RESTART', 'LUBY_RESTART'],
    subsolverParams: [{ searchBranching: 'AUTOMATIC_SEARCH', restartAlgorithms: ['LUBY_RESTART'] }],
    maxNumberOfConflicts: int64Max,
    name: 'FIXED_SEARCH',
  };
  const numeric = {
    ...named,
    searchBranching: 1,
    restartAlgorithms: [0, 1],
    subsolverParams: [{ searchBranching: 0, restartAlgorithms: [1] }],
  };
  assert.deepEqual(encodeVerified(parametersType, named), encodeVerified(parametersType, numeric));
  assert.equal(named.searchBranching, 'FIXED_SEARCH');
  const decoded = decodeProtobufWithExactLongs<typeof named>(parametersType, encodeVerified(parametersType, named));
  assert.equal(decoded.name, 'FIXED_SEARCH');
  assert.equal(decoded.maxNumberOfConflicts, int64Max);
});

test('enum names in model search strategies encode identically to numeric values', () => {
  assert.deepEqual(
    encodeVerified(modelType, { searchStrategy: [{ variableSelectionStrategy: 'CHOOSE_FIRST', domainReductionStrategy: 'SELECT_MAX_VALUE' }] }),
    encodeVerified(modelType, { searchStrategy: [{ variableSelectionStrategy: 0, domainReductionStrategy: 1 }] }),
  );
});

test('invalid enum names are rejected in scalar, repeated, and nested fields', () => {
  for (const name of ['UNKNOWN_SEARCH', '1', 'toString', 'constructor', '__proto__']) {
    for (const value of [
      { searchBranching: name },
      { restartAlgorithms: ['NO_RESTART', name] },
      { subsolverParams: [{ searchBranching: name }] },
    ]) {
      assert.throws(() => encodeProtobufBigInts(value, parametersType), {
        name: 'TypeError', message: /Unknown .* enum name:/,
      });
    }
  }
  const invalidNumeric = encodeProtobufBigInts({ searchBranching: 999 }, parametersType) as Record<string, unknown>;
  assert.match(parametersType.verify(invalidNumeric)!, /enum value expected/);
});

test('protobuf integer validation rejects unsafe numbers in nested domains and scalar parameters', () => {
  for (const value of [2 ** 64, -(2 ** 64), 2 ** 63, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1, 0.5, NaN, Infinity]) {
    assert.throws(
      () => encodeProtobufBigInts({ variables: [{ domain: [value, value] }] }, modelType),
      { name: 'RangeError', message: /int64/ },
    );
    assert.throws(
      () => encodeProtobufBigInts({ maxNumberOfConflicts: value }, parametersType),
      { name: 'RangeError', message: /int64/ },
    );
  }
});

test('safe integer boundaries and floating-point fields round-trip without narrowing', () => {
  const model = {
    variables: [{ domain: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER] }],
    floatingPointObjective: { vars: [0], coeffs: [2 ** 64], offset: 0.5 },
  };
  encodeProtobufBigInts(model, modelType);
  assert.equal(modelType.verify(model), null);
  const decoded = decodeProtobufWithExactLongs<typeof model>(modelType, modelType.encode(model).finish());
  assert.deepEqual(decoded.variables[0]?.domain, [BigInt(Number.MIN_SAFE_INTEGER), BigInt(Number.MAX_SAFE_INTEGER)]);
  assert.deepEqual(decoded.floatingPointObjective.coeffs, [2 ** 64]);
  assert.equal(decoded.floatingPointObjective.offset, 0.5);

  const params = { maxNumberOfConflicts: Number.MAX_SAFE_INTEGER, maxTimeInSeconds: 2 ** 64, relativeGapLimit: 0.5 };
  encodeProtobufBigInts(params, parametersType);
  assert.equal(parametersType.verify(params), null);
  const decodedParams = decodeProtobufWithExactLongs<typeof params>(parametersType, parametersType.encode(params).finish());
  assert.equal(decodedParams.maxNumberOfConflicts, BigInt(Number.MAX_SAFE_INTEGER));
  assert.equal(decodedParams.maxTimeInSeconds, 2 ** 64);
  assert.equal(decodedParams.relativeGapLimit, 0.5);
});

test('unsigned integer fields preserve uint64 boundaries and reject narrowing', async () => {
  const type = protobufModule.parse('syntax="proto2"; message Limits { optional uint64 count = 1; optional uint32 index = 2; }').root.lookupType('Limits');
  const maximum = (1n << 64n) - 1n;
  const converted = encodeProtobufBigInts({ count: maximum, index: 4294967295 }, type) as Record<string, unknown>;
  assert.equal(type.verify(converted), null);
  const restored = decodeProtobufWithExactLongs<{count: bigint; index: number}>(type, type.encode(type.create(converted)).finish());
  assert.equal(restored.count, maximum);
  assert.equal(restored.index, 4294967295);
  for (const count of [-1n, 1n << 64n, -1, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => encodeProtobufBigInts({count}, type), RangeError);
  for (const index of [-1, 4294967296, 0.5]) assert.throws(() => encodeProtobufBigInts({index}, type), RangeError);
});

test('strict protobuf normalization rejects dropped nested fields and keeps optional messages absent', async () => {
  const { normalizeProtobufInput } = await import('../lib/protobufjs_helpers.ts');
  const type = protobufModule.parse('syntax="proto2"; message Inner { optional int32 var_index = 1; } message Outer { optional Inner constraint = 1; repeated Inner constraints = 2; }').root.lookupType('Outer');
  assert.throws(() => normalizeProtobufInput({ constraint: { varIndex: 0, droppedConstraint: true } }, type), /Unknown protobuf field Outer.constraint.droppedConstraint/);
  assert.throws(() => normalizeProtobufInput({ constraints: [{ varIndex: 0, extra: true }] }, type), /constraints\[0\].extra/);
  assert.deepEqual(normalizeProtobufInput({ constraint: null, constraints: [] }, type), { constraints: [] });
  const normalized = normalizeProtobufInput({ constraint: { varIndex: 0 } }, type);
  assert.deepEqual(normalized, { constraint: { varIndex: 0 } });
  assert.deepEqual(normalizeProtobufInput({ constraint: { var_index: 0 } }, type), normalized);
  assert.throws(() => normalizeProtobufInput({ constraint: { var_index: 0, varIndex: 1 } }, type), /Duplicate protobuf field/);
});

test('protobuf normalization reuses schema aliases across repeated messages without sharing message data', async () => {
  const { normalizeProtobufInput } = await import('../lib/protobufjs_helpers.ts');
  const type = protobufModule.parse('syntax="proto3"; message Item { int32 item_id = 1; } message Batch { repeated Item items = 1; }').root.lookupType('Batch');
  const itemType = type.fields.items.resolve().resolvedType as protobufModule.Type;
  const fields = itemType.fieldsArray;
  let metadataReads = 0;
  Object.defineProperty(itemType, 'fieldsArray', { get() { ++metadataReads; return fields; } });
  const input = { items: Array.from({ length: 1000 }, (_, index) => ({ item_id: index })) };
  const output = normalizeProtobufInput(input, type) as { items: Array<{ itemId: number }> };
  assert.equal(metadataReads, 1);
  assert.equal(output.items[999].itemId, 999);
  input.items[0].item_id = 99;
  assert.equal(output.items[0].itemId, 0);
  assert.deepEqual(normalizeProtobufInput({ items: [{ itemId: 7 }] }, type), { items: [{ itemId: 7 }] });
  assert.equal(metadataReads, 1);
  assert.throws(() => normalizeProtobufInput({ items: [{ itemId: 0, item_id: 1 }] }, type), /Duplicate protobuf field/);
  assert.throws(() => normalizeProtobufInput({ items: [{ missing: 1 }] }, type), /Unknown protobuf field/);
  const other = protobufModule.parse('syntax="proto3"; message Item { int32 other_id = 1; }').root.lookupType('Item');
  assert.deepEqual(normalizeProtobufInput({ other_id: 3 }, other), { otherId: 3 });
  assert.throws(() => normalizeProtobufInput({ itemId: 3 }, other), /Unknown protobuf field/);
});


test('typed Long objects reject narrowing and signedness overflow', () => {
  const type = protobufModule.parse('syntax="proto2"; message Limits { optional int64 signed_count = 1; optional uint64 unsigned_count = 2; }').root.lookupType('Limits');
  for (const bits of [0.5, NaN, Infinity, 4294967296, -2147483649]) {
    assert.throws(() => encodeProtobufBigInts({ signedCount: { low: bits, high: 0, unsigned: false } }, type), RangeError);
    assert.throws(() => encodeProtobufBigInts({ signedCount: { low: 0, high: bits, unsigned: false } }, type), RangeError);
  }
  assert.throws(() => encodeProtobufBigInts({ signedCount: { low: -1, high: -1, unsigned: true } }, type), /signed 64-bit/);
  assert.throws(() => encodeProtobufBigInts({ unsignedCount: { low: -1, high: -1, unsigned: false } }, type), /unsigned 64-bit/);
  const encoded = encodeProtobufBigInts({ signedCount: { low: 0, high: 2147483648, unsigned: false }, unsignedCount: { low: -1, high: -1, unsigned: true } }, type) as Record<string, unknown>;
  assert.equal(type.verify(encoded), null);
  const decoded = decodeProtobufWithExactLongs<{signedCount: bigint; unsignedCount: bigint}>(type, type.encode(encoded).finish());
  assert.equal(decoded.signedCount, -(1n << 63n));
  assert.equal(decoded.unsignedCount, (1n << 64n) - 1n);
});

test('absent message cleanup preserves scalar defaults, exact integers and bytes', () => {
  const bytes = new Uint8Array([0, 255]);
  const value = { absent: null, count: 0n, enabled: false, text: '', bytes,
    children: [{ absent: null, value: 0 }], nested: { absent: null, count: 7n } };
  const cleaned = omitAbsentProtobufMessages(value);
  assert.deepEqual(cleaned, { count: 0n, enabled: false, text: '', bytes,
    children: [{ value: 0 }], nested: { count: 7n } });
  assert.equal(cleaned.bytes, bytes);
  assert.equal(value.absent, null);
});
