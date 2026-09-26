import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as protobufModule from 'protobufjs';
import { cpModelProtoSchema } from '../lib/generated/cp_sat_schemas.ts';
import { encodeProtobufBigInts } from '../lib/protobufjs_helpers.ts';

const modelType = protobufModule.parse(cpModelProtoSchema).root.lookupType(
  'operations_research.sat.CpModelProto',
);

test('CP-SAT serialization rejects overflowing and fractional int32 references', () => {
  for (const value of [2 ** 32, 2 ** 31, -(2 ** 31) - 1, 0.5, NaN, Infinity, -Infinity]) {
    for (const model of [
      { constraints: [{ boolOr: { literals: [0, value] } }] },
      { constraints: [{ linear: { vars: [0, value], coeffs: [1, 1], domain: [0, 1] } }] },
      { constraints: [{ enforcementLiteral: [value], boolOr: { literals: [0] } }] },
    ]) {
      assert.throws(() => encodeProtobufBigInts(model, modelType), {
        name: 'RangeError', message: /int32.*signed 32-bit range/,
      });
    }
  }
});

test('CP-SAT serialization preserves negative references and int32 wire boundaries', () => {
  const literals = [0, -1, -2, -2147483648, 2147483647];
  const model = encodeProtobufBigInts({
    constraints: [{ boolOr: { literals } }],
  }, modelType) as Record<string, unknown>;
  assert.equal(modelType.verify(model), null);
  const bytes = modelType.encode(modelType.create(model)).finish();
  const decoded = modelType.toObject(modelType.decode(bytes));
  assert.deepEqual(decoded.constraints[0].boolOr.literals, literals);
});
