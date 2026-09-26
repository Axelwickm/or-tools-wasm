import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as protobufModule from 'protobufjs';
import { cpModelProtoSchema, satParametersProtoSchema } from '../lib/generated/cp_sat_schemas.ts';
import {
  decodeProtobufWithExactLongs,
  encodeProtobufBigInts,
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
