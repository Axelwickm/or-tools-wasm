import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { satParametersProtoSchema } from '../lib/generated/cp_sat_schemas.ts';
import { encodeProtobufBigInts } from '../lib/protobufjs_helpers.ts';

const parametersType = protobuf.parse(satParametersProtoSchema).root.lookupType('operations_research.sat.SatParameters');
let directory: string;
let api: any;
const operations: Array<{ parameters: Uint8Array }> = [];

before(async () => {
  directory = await mkdtemp(fileURLToPath(new URL('.cp-parity-gaps-', import.meta.url)));
  (globalThis as Record<string, unknown>).__cpParityGapOperations = operations;
  const outfile = `${directory}/api.mjs`;
  await build({
    entryPoints: [fileURLToPath(new URL('../lib/cp-sat.ts', import.meta.url))],
    outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{ name: 'record-parameters', setup(builder) {
      builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
        export class DirectCpSatExecutor {
          execute(operation) {
            globalThis.__cpParityGapOperations.push(operation);
            return { result: Promise.resolve({ type: 'solve', response: new Uint8Array() }) };
          }
        }
      ` }));
    } }],
  });
  api = await import(outfile);
});

after(async () => {
  delete (globalThis as Record<string, unknown>).__cpParityGapOperations;
  if (directory) await rm(directory, { recursive: true, force: true });
});

function publicName(name: string) {
  return name.replace(/_([a-zA-Z0-9])/g, (_match, character: string) => character.toUpperCase());
}

function sampleValue(field: protobuf.Field): unknown {
  field.resolve();
  let value: unknown;
  if (field.resolvedType instanceof protobuf.Enum) value = Object.values(field.resolvedType.values)[0];
  else if (field.resolvedType instanceof protobuf.Type) value = { name: 'nested', useTimetablingInNoOverlap2d: true };
  else if (field.type === 'string') value = 'audit';
  else if (field.type === 'bool') value = true;
  else if (field.type === 'double' || field.type === 'float') value = 0.25;
  else value = field.type === 'int64' ? 7n : 7;
  return field.repeated ? [value] : value;
}

test('every public SatParameters field preserves its protobuf field ID and value', async () => {
  // This inventory assertion includes all nine digit-bearing fields, and catches
  // future public names that diverge from the runtime schema.
  assert.equal(parametersType.fieldsArray.length, 303);
  for (const field of parametersType.fieldsArray) {
    if (field.name === 'numSearchWorkers') continue; // Explicitly deprecated by the public solve contract.
    const value = sampleValue(field);
    await api.CpSat.solveProto(new Uint8Array(), { executor: 'direct', [publicName(field.name)]: value });
    const actual = parametersType.decode(operations[operations.length - 1].parameters) as unknown as Record<string, unknown>;
    assert.ok(Object.prototype.hasOwnProperty.call(actual, field.name), `field ${field.id} (${field.name}) disappeared`);
    if (field.resolvedType instanceof protobuf.Type) {
      const nested = (actual[field.name] as Array<Record<string, unknown>>)[0];
      assert.equal(nested.useTimetablingInNoOverlap_2d, true, 'nested digit-bearing parameter disappeared');
      assert.equal(nested.name, 'nested');
    } else {
      const expected = encodeProtobufBigInts({ [field.name]: value }, parametersType) as Record<string, unknown>;
      assert.deepEqual(operations[operations.length - 1].parameters, parametersType.encode(parametersType.create(expected)).finish(),
        `field ${field.id} (${field.name}) changed on the wire`);
    }
  }
});

test('recursive parameters reject typos, invalid values and duplicate alias spellings', async () => {
  await assert.rejects(api.CpSat.solveProto(new Uint8Array(), {
    executor: 'direct', useTimetablingInNoOverlap2d: 'yes',
  }), /boolean expected/);
  await assert.rejects(api.CpSat.solveProto(new Uint8Array(), {
    executor: 'direct', unknownParameter: true,
  }), /unknown solver parameter "unknownParameter"/);
  await assert.rejects(api.CpSat.solveProto(new Uint8Array(), {
    executor: 'direct', subsolverParams: [{ unknownParameter: true }],
  }), /unknown solver parameter "subsolverParams.unknownParameter"/);
  await assert.rejects(api.CpSat.solveProto(new Uint8Array(), {
    executor: 'direct', useTimetablingInNoOverlap2d: true, useTimetablingInNoOverlap_2d: false,
  }), /duplicate solver parameter/);
});

test('Domain factories canonicalize sorted, unsorted, overlapping, adjacent and inverted intervals', () => {
  const { Domain } = api;
  assert.deepEqual(Domain.fromIntervals([[2, 4], [-2, 0]]).flatIntervals, [-2, 0, 2, 4]);
  assert.deepEqual(Domain.fromFlatIntervals([2, 4, -2, 0]).flattenedIntervals(), [-2, 0, 2, 4]);
  assert.deepEqual(Domain.fromIntervals([[5], [2, 4], [3, 7], [9, 8]]).flatIntervals, [2, 7]);
  assert.deepEqual(Domain.fromValues([1, 3, -5, 5, 3, 2]).flatIntervals, [-5, -5, 1, 3, 5, 5]);
  assert.equal(new Domain(3, 2).isEmpty(), true);
  assert.equal(new Domain().isEmpty(), true);
  assert.throws(() => Domain.fromFlatIntervals([1, 2, 3]), /pairs of bounds/);
  assert.throws(() => Domain.fromIntervals([[]]), /one or two bounds/);
  assert.throws(() => new Domain(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
});

test('Domain queries and algebra match the upstream sorted interval Python tests', () => {
  const { Domain } = api;
  const bool = new Domain(0, 1);
  assert.equal(bool.size(), 2n);
  assert.equal(bool.min(), 0n);
  assert.equal(bool.max(), 1n);
  assert.equal(bool.isEmpty(), false);
  assert.equal(String(bool), '[0,1]');
  assert.equal(bool.repr(), 'Domain([0,1])');
  const sparse = Domain.fromValues([1, 3, -5, 5]);
  assert.equal(sparse.contains(1), true);
  assert.equal(sparse.contains(0), false);
  const left = new Domain(0, 5);
  const right = new Domain(10, 15);
  assert.deepEqual(left.unionWith(right).flatIntervals, [0, 5, 10, 15]);
  assert.deepEqual(new Domain(0, 10).intersectionWith(new Domain(5, 15)).flatIntervals, [5, 10]);
  assert.deepEqual(left.additionWith(right).flatIntervals, [10, 20]);
  assert.deepEqual(new Domain(5, 20).negation().flatIntervals, [-20, -5]);
  assert.equal(new Domain(0, 4).overlapsWith(new Domain(0, 4)), true);
  assert.equal(new Domain(0, 2).overlapsWith(new Domain(3, 5)), false);
  assert.equal(Domain.fromValues([1, 3, 5]).overlapsWith(Domain.fromValues([0, 2, 4])), false);
  assert.equal(Domain.fromValues([1, 2, 3, 5]).overlapsWith(Domain.fromValues([0, 2, 4])), true);
  assert.equal(sparse.isIncludedIn(new Domain(-5, 5)), true);
  assert.equal(new Domain(-5, 5).isIncludedIn(sparse), false);
  assert.equal(new Domain().isIncludedIn(sparse), true);
  assert.equal(sparse.isIncludedIn(new Domain()), false);
  assert.deepEqual(left.flatIntervals, [0, 5], 'algebra must preserve its operands');
  const copy = left.flatIntervals;
  copy[0] = 100;
  assert.deepEqual(left.flatIntervals, [0, 5], 'exposed interval copies must not corrupt canonical state');
  assert.throws(() => new Domain().min(), /empty domain/);
  assert.throws(() => new Domain().max(), /empty domain/);
});

test('Domain int64 boundary operations saturate cardinality and clip exact arithmetic', () => {
  const { Domain } = api;
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  assert.equal(Domain.allValues().size(), max);
  assert.equal(Domain.greaterOrEqual(3).min(), 3n);
  assert.equal(Domain.greaterOrEqual(3).max(), max);
  assert.equal(Domain.lowerOrEqual(5).min(), min);
  assert.equal(Domain.lowerOrEqual(5).max(), 5n);
  assert.deepEqual(new Domain(min, 5).complement().flatIntervals, [6, max]);
  assert.equal(Domain.allValues().complement().isEmpty(), true);
  assert.deepEqual(new Domain().complement().flatIntervals, [min, max]);
  assert.equal(new Domain(min).negation().isEmpty(), true);
  assert.deepEqual(new Domain(min, min + 2n).negation().flatIntervals, [max - 1n, max]);
  assert.deepEqual(Domain.allValues().negation().flatIntervals, [-max, max]);
  assert.equal(new Domain(max).additionWith(new Domain(1)).isEmpty(), true);
  assert.equal(new Domain(min).additionWith(new Domain(-1)).isEmpty(), true);
  assert.deepEqual(new Domain(max - 2n, max).additionWith(new Domain(1)).flatIntervals, [max - 1n, max]);
  assert.deepEqual(new Domain(min, min + 2n).additionWith(new Domain(-1)).flatIntervals, [min, min + 1n]);
  assert.deepEqual(Domain.fromValues([min, max]).additionWith(new Domain(0)).flatIntervals, [min, min, max, max]);
  assert.equal(String(Domain.fromValues([0, 2])), '[0][2]');
});


test('model reset helpers clear both objective kinds and hints before serialization', async () => {
  const model = new api.CpModel();
  const x = model.newIntVar(0, 2, 'x');
  model.addHint(x, 2);
  for (const objective of [x, x.times(0.5)]) {
    model.maximize(objective);
    assert.equal(model.hasObjective(), true);
    model.clearObjective();
    assert.equal(model.hasObjective(), false);
    // Confirm the live model, not just an exposed snapshot, is cleared.
    const bytes = await api.CpSat.createModel(model.modelProto);
    const schema = protobuf.parse((await api.CpSat.getSchemas()).cp_model).root.lookupType('operations_research.sat.CpModelProto');
    const encoded = schema.decode(bytes) as unknown as Record<string, unknown>;
    assert.equal(Object.prototype.hasOwnProperty.call(encoded, 'objective'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(encoded, 'floatingPointObjective'), false);
  }
  model.clearHints();
  model.addHint(x, 0);
  assert.deepEqual(model.modelProto.solutionHint, { vars: [x.index], values: [0] }, 'new hints must not retain stale entries');
  model.clearHints();
  assert.equal(model.modelProto.solutionHint, undefined);
});

test('linear expression domains preserve holes, constant truth and saturated bounds', () => {
  const { CpModel, Domain } = api;
  const model = new CpModel();
  const x = model.newIntVar(0, 10, 'x');
  const constraint = model.addLinearExpressionInDomain(x.plus(3), Domain.fromValues([4, 11]));
  assert.deepEqual(model.modelProto.constraints[constraint.index].linear.domain, [1, 1, 8, 8]);
  const hole = model.addLinearExpressionInDomain(5, Domain.fromValues([4, 6]));
  assert.deepEqual(model.modelProto.constraints[hole.index].boolOr, { literals: [] });
  const member = model.addLinearExpressionInDomain(6, Domain.fromValues([4, 6]));
  assert.deepEqual(model.modelProto.constraints[member.index].boolAnd, { literals: [] });
  const impossible = model.addLinearExpressionInDomain(x, new Domain());
  assert.deepEqual(model.modelProto.constraints[impossible.index].linear.domain, []);
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  const clipped = model.addLinearExpressionInDomain(x.plus(-max), new Domain(max - 1n));
  assert.deepEqual(model.modelProto.constraints[clipped.index].linear.domain, [max, max]);
  const unbounded = model.addLinearExpressionInDomain(x.plus(3), Domain.allValues());
  assert.deepEqual(model.modelProto.constraints[unbounded.index].linear.domain, [min, max]);
  assert.throws(() => model.addLinearExpressionInDomain(x.times(0.5), new Domain(0, 2)), /integer expressions/);
  assert.throws(() => model.addLinearExpressionInDomain(new CpModel().newIntVar(0, 1), new Domain(0, 1)), /different CpModel/);
});
