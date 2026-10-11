import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

// Field numbers match ModelProto and IndicatorConstraintUpdatesProto.
const root = protobuf.parse(`syntax = "proto3";
  message Indicator { optional int64 indicator_id = 1; double lower_bound = 3; double upper_bound = 4; string name = 5; }
  message Entry { int64 key = 1; Indicator value = 2; }
  message Model { repeated Entry indicator_constraints = 9; }
  message IndicatorUpdates { repeated int64 deleted_constraint_ids = 1; repeated Entry new_constraints = 2; }
  message Update { IndicatorUpdates indicator_constraint_updates = 12; }
`).root;

test('MathOpt indicator lifecycle, sparse IDs, independent inspection and incremental wire updates', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-indicators-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/mathopt/api.ts', import.meta.url))],
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external' });
    const { MathOpt, MathOptIndicatorConstraint }: typeof import('../lib/mathopt/api.ts') = await import(pathToFileURL(outfile).href);
    const model = MathOpt.Model('indicators');
    const x = model.addVariable({ lowerBound: 0, upperBound: 4 });
    const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
    const unused = model.addVariable();
    const foreign = MathOpt.Model('foreign');
    const other = foreign.addVariable();
    assert.equal(model.getNumIndicatorConstraints(), 0);
    assert.equal(model.getNextIndicatorConstraintId(), 0);
    assert.equal(model.getIndicatorConstraint(0), undefined);
    model.ensureNextIndicatorConstraintIdAtLeast(1_000_000_000);
    model.ensureNextIndicatorConstraintIdAtLeast(1);
    const constraint = model.addIndicatorConstraint({ indicator: z, upperBound: 6, expression: MathOpt.asFlatLinearExpression(x).multiply(2).add(2), name: 'limit' });
    assert.equal(constraint.id, 1_000_000_000);
    assert.equal(model.getNextIndicatorConstraintId(), 1_000_000_001);
    assert.equal(model.getNumIndicatorConstraints(), 1);
    assert.equal(model.hasIndicatorConstraint(constraint.id), true);
    assert.equal(model.hasIndicatorConstraint(0), false);
    assert.equal(constraint.getCoefficient(x), 2);
    assert.equal(constraint.getCoefficient(unused), 0);
    assert.equal(constraint.getImpliedConstraint().upperBound, 4);
    assert.equal(constraint.getImpliedConstraint().lowerBound, -Infinity);
    assert.equal(constraint.getImpliedConstraint().expression.evaluate(new Map([[x, 2]])), 4);
    constraint.terms()[0].coefficient = 99;
    assert.equal(constraint.getCoefficient(x), 2);
    model.indicatorConstraints().splice(0, 1);
    assert.equal(model.indicatorConstraints().length, 1);
    assert.equal(constraint.equals(model.getIndicatorConstraint(constraint.id)), true);
    assert.equal(constraint.equals(foreign.addIndicatorConstraint()), false);
    assert.equal(constraint.equals(x), false);
    assert.throws(() => constraint.getCoefficient(other), /different/);
    const tracker = model.addUpdateTracker();
    const encoded = root.lookupType('Model').decode(model.encodeModelProto()) as unknown as { indicatorConstraints: Array<{ key: { toString(): string }; value: { name: string; upperBound: number } }> };
    assert.equal(encoded.indicatorConstraints[0].key.toString(), String(constraint.id));
    assert.equal(encoded.indicatorConstraints[0].value.name, 'limit');
    assert.equal(encoded.indicatorConstraints[0].value.upperBound, 4);
    assert.throws(() => foreign.deleteIndicatorConstraint(constraint), /belong/);
    assert.throws(() => model.deleteIndicatorConstraint(Reflect.construct(MathOptIndicatorConstraint, [model, { id: constraint.id, name: constraint.name, indicator: x, activateOnZero: false, lowerBound: -Infinity, upperBound: 4, terms: [], deleted: false }])), /belong/);
    model.deleteIndicatorConstraint(model.getIndicatorConstraint(constraint.id)!);
    assert.equal(model.hasIndicatorConstraint(constraint.id), false);
    assert.equal(model.getNumIndicatorConstraints(), 0);
    assert.equal(model.indicatorConstraints().length, 0);
    assert.equal(model.getIndicatorConstraint(constraint.id), undefined);
    assert.equal(constraint.id, 1_000_000_000);
    assert.equal(constraint.equals(model.getIndicatorConstraint(constraint.id)), false);
    for (const read of [() => constraint.name, () => constraint.indicator, () => constraint.activateOnZero,
      () => constraint.lowerBound, () => constraint.upperBound, () => constraint.terms(), () => constraint.getCoefficient(x),
      () => constraint.getImpliedConstraint(), () => model.deleteIndicatorConstraint(constraint)]) assert.throws(read, /deleted/);
    const next = model.addIndicatorConstraint({ indicator: z, terms: [{ variable: x, coefficient: 1 }], upperBound: 1 });
    assert.equal(next.id, 1_000_000_001);
    const update = root.lookupType('Update').decode(tracker.exportUpdate()!) as unknown as {
      indicatorConstraintUpdates: { deletedConstraintIds: Array<{ toString(): string }>; newConstraints: Array<{ key: { toString(): string }; value: { upperBound: number } }> };
    };
    assert.deepEqual(update.indicatorConstraintUpdates.deletedConstraintIds.map(String), ['1000000000']);
    assert.equal(update.indicatorConstraintUpdates.newConstraints[0].key.toString(), '1000000001');
    assert.equal(update.indicatorConstraintUpdates.newConstraints[0].value.upperBound, 1);
    const current = root.lookupType('Model').decode(model.encodeModelProto()) as unknown as { indicatorConstraints: Array<{ key: { toString(): string } }> };
    assert.deepEqual(current.indicatorConstraints.map(entry => entry.key.toString()), ['1000000001']);
    tracker.advanceCheckpoint();
    const transient = model.addIndicatorConstraint(); model.deleteIndicatorConstraint(transient);
    assert.equal(tracker.exportUpdate(), null, 'Add then delete between checkpoints has no native effect');
    for (const invalid of [-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      const before = model.getNextIndicatorConstraintId();
      assert.throws(() => model.ensureNextIndicatorConstraintIdAtLeast(invalid), /safe integer/);
      assert.throws(() => model.getIndicatorConstraint(invalid));
      assert.equal(model.getNextIndicatorConstraintId(), before);
    }
    const before = model.getNextIndicatorConstraintId();
    assert.throws(() => model.addIndicatorConstraint({ indicator: other }), /different/);
    assert.throws(() => model.addIndicatorConstraint({ terms: [{ variable: other, coefficient: 1 }] }), /different/);
    assert.equal(model.getNextIndicatorConstraintId(), before);
    model.deleteVariable(unused);
    assert.throws(() => next.getCoefficient(unused), /deleted/);
    model.deleteVariable(x);
    assert.equal(next.terms().length, 0);
    model.deleteVariable(z);
    assert.equal(next.indicator, undefined);
    model.ensureNextIndicatorConstraintIdAtLeast(Number.MAX_SAFE_INTEGER);
    assert.throws(() => model.addIndicatorConstraint(), /safe integer/);
    assert.equal(model.getNumIndicatorConstraints(), 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
