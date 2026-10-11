import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('CP-SAT mutation updates shared handles and keeps domains, literals and constant lookup consistent', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.cp-mutation-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/cp-sat.ts', import.meta.url))], outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external' });
    const { CpModel, Domain, IntVar, IntervalVar, Constraint }: typeof import('../lib/cp-sat.ts') = await import(pathToFileURL(outfile).href);
    const model = new CpModel(), x = model.newIntVar(0, 10, 'old');
    assert.equal(x.withName('new'), x); assert.equal(x.name, 'new'); x.name = ''; assert.equal(x.name, '');
    const exact = 9007199254740993n; assert.equal(x.withDomain(Domain.fromValues([exact, exact + 2n])), x);
    assert.deepEqual(x.domain.flatIntervals, [exact, exact, exact + 2n, exact + 2n]);
    const bounds = x.domain.flatIntervals; bounds[0] = 0n; assert.equal(x.domain.min(), exact);
    const snapshot = model.modelProto; snapshot.variables![x.index].name = 'snapshot'; assert.equal(x.name, '');
    for (const name of [undefined, 1, null]) assert.throws(() => { x.name = name as unknown as string; }, TypeError);
    assert.throws(() => { x.domain = [] as unknown as InstanceType<typeof Domain>; }, TypeError);
    assert.equal(x.domain.min(), exact);
    for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1, 1n << 63n]) assert.throws(() => x.withDomain(new Domain(value)), RangeError);
    const boolean = model.newBoolVar('flag'), negated = boolean.not(); boolean.name = 'renamed';
    assert.equal(negated.name, 'not(renamed)'); boolean.domain = new Domain(2, 3);
    assert.equal(boolean.isBoolean(), false); assert.throws(() => boolean.not(), TypeError);
    assert.throws(() => model.addBoolOr([negated]), TypeError);
    const presence = model.newBoolVar('presence');
    assert.doesNotThrow(() => model.newOptionalFixedSizeIntervalVar(boolean, 1, presence, 'now-integer'));
    boolean.domain = new Domain(0, 1); assert.equal(boolean.isBoolean(), true);
    model.addBoolOr([negated]);
    const row = model.addEquality(x, exact).withName('row'); row.name = 'new-row';
    const interval = model.newFixedSizeIntervalVar(0, 2, 'interval');
    const restored = model.getIntervalVarFromProtoIndex(interval.index);
    assert.equal(interval.withName('new-interval'), interval); assert.equal(restored.name, 'new-interval');
    new Constraint(model, interval.index).name = 'shared'; assert.equal(interval.name, 'shared');
    for (const handle of [row, interval]) {
      assert.throws(() => { handle.name = 3 as unknown as string; }, TypeError);
      assert.equal(handle.withName(''), handle); assert.equal(handle.name, '');
    }
    assert.throws(() => { new IntVar(model, -1).name = 'bad'; });
    assert.throws(() => { new IntVar(model, 100).domain = new Domain(0, 1); });
    assert.throws(() => { new Constraint(model, -1).name = 'bad'; });
    assert.throws(() => { new IntervalVar(model, row.index, 0, 1, 1).name = 'bad'; });
    const cached = model.newConstant(5); assert.equal(model.newConstant(5).index, cached.index);
    cached.domain = new Domain(7); const replacement = model.newConstant(5);
    assert.notEqual(replacement.index, cached.index); assert.deepEqual(replacement.domain.flatIntervals, [5, 5]);
    replacement.domain = Domain.fromValues([5, 6]); assert.notEqual(model.newConstant(5).index, replacement.index);
    const empty = model.newConstant(9); empty.domain = new Domain(); assert.equal(empty.domain.isEmpty(), true);
    assert.notEqual(model.newConstant(9).index, empty.index);
    model.removeAllNames(); assert.equal(negated.name, ''); assert.equal(restored.name, '');
    const clone = model.clone(); clone.getIntVarFromProtoIndex(x.index).withName('clone').withDomain(new Domain(1, 2));
    assert.equal(x.name, ''); assert.equal(x.domain.min(), exact);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
