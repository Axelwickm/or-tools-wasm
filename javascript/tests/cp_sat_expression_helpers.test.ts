import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('CP-SAT bounded expression inspection and proto reconstruction validate references and exact integer data', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.cp-expression-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/cp-sat.ts', import.meta.url))], outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external' });
    const { CpModel, Domain, LinearExpr, BoundedLinearExpr, rebuildFromLinearExpressionProto }: typeof import('../lib/cp-sat.ts') = await import(pathToFileURL(outfile).href);
    const model = new CpModel(), x = model.newIntVar(0, 10, 'x'), y = model.newBoolVar('y');
    const proto = { vars: [y.index, x.index, x.index], coeffs: [2, 3, -2], offset: 4 };
    const rebuilt = rebuildFromLinearExpressionProto(proto, model), bounded = new BoundedLinearExpr(rebuilt, Domain.fromValues([5, 10, 20]));
    proto.coeffs.fill(0); proto.offset = 99;
    assert.equal(bounded.ok, true); assert.deepEqual(bounded.vars, [x, y]);
    assert.deepEqual(bounded.coeffs.map(BigInt), [1n, 2n]); assert.equal(BigInt(bounded.offset), 4n);
    assert.deepEqual(bounded.bounds.flatIntervals, [5, 5, 10, 10, 20, 20]); assert.match(String(bounded), /16, 16/);
    bounded.vars.pop(); bounded.coeffs.pop(); const bounds = bounded.bounds.flatIntervals; bounds[0] = 0;
    assert.equal(bounded.vars.length, 2); assert.equal(bounded.coeffs.length, 2); assert.equal(bounded.bounds.min(), 5n);
    assert.equal(new BoundedLinearExpr(x.times(0.5), new Domain(0, 5)).ok, false);
    assert.equal(new BoundedLinearExpr(new LinearExpr(model, new Map([[x.index, 1n << 63n]])), new Domain(0, 5)).ok, false);
    const empty = new BoundedLinearExpr(x, new Domain()); assert.equal(empty.ok, true); assert.equal(empty.bounds.isEmpty(), true); assert.match(String(empty), /\[\]/);
    const exact = 9007199254740993n;
    assert.equal(BigInt(model.rebuildFromLinearExpressionProto({ offset: exact }).toProto().offset!), exact);
    assert.deepEqual(model.rebuildFromLinearExpressionProto({ vars: [x.index, x.index], coeffs: [2, -2], offset: 7 }).toProto(), { vars: [], coeffs: [], offset: 7 });
    for (const malformed of [{ vars: [x.index], coeffs: [] }, { vars: [-1], coeffs: [1] }, { vars: [1.5], coeffs: [1] },
      { vars: [99], coeffs: [1] }, { vars: [x.index], coeffs: [0.5] }, { vars: [x.index], coeffs: [Number.MAX_SAFE_INTEGER + 1] },
      { vars: [x.index, x.index], coeffs: [(1n << 63n) - 1n, 1n] }, { offset: 1n << 63n }]) {
      assert.throws(() => model.rebuildFromLinearExpressionProto(malformed));
    }
    const other = new CpModel(); assert.throws(() => other.add(bounded));
    assert.throws(() => new BoundedLinearExpr(x, 0, 3, [0]));
    assert.equal(model.modelProto.constraints?.length, 0);
    // Native/Python intervals permit affine Boolean-domain expressions; it is
    // multiple variable terms, not a [0,1] domain, that makes an interval invalid.
    const short = new CpModel(), start = short.newIntVar(0, 1, 'start'), end = short.newIntVar(0, 1, 'end');
    const present = short.newBoolVar('present');
    short.newOptionalIntervalVar(start, 0, end, present, 'event');
    short.newIntervalVar(present, 0, present, 'boolean event');
    short.newOptionalFixedSizeIntervalVar(start, 1, present, 'short task');
    assert.equal(short.modelProto.constraints?.length, 3);
    for (const optional of [false, true]) for (const part of [0, 1, 2]) {
      const expressions = [start, 0, end] as Parameters<InstanceType<typeof CpModel>['newIntervalVar']>;
      expressions[part] = start.plus(end);
      assert.throws(() => optional ? short.newOptionalIntervalVar(expressions[0], expressions[1], expressions[2], present)
        : short.newIntervalVar(expressions[0], expressions[1], expressions[2]), /affine or constant/);
    }
    assert.equal(short.modelProto.constraints?.length, 3, 'Invalid intervals do not append partial constraints');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
