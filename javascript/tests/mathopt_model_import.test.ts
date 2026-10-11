import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

test('MathOpt import preserves sparse IDs and rejects malformed/unsupported models; trackers have independent lifecycles', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-import-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/mathopt/api.ts', import.meta.url))], outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', plugins:[{name:'native-validator-stub', setup(builder) {
      builder.onResolve({filter:/^\.\/direct_executor\.js$/},()=>({path:'validator',namespace:'test'}));
      builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export class DirectMathOptExecutor { execute(operation) { globalThis.__mathoptValidation = operation; return {result:Promise.resolve({validationError:globalThis.__mathoptValidationError ?? ''})};} }`}));
    }}] });
    const { MathOptModel }: typeof import('../lib/mathopt/api.ts') = await import(pathToFileURL(outfile).href);
    const root = new protobuf.Root(); root.resolvePath = (_, path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
    root.loadSync('ortools/math_opt/model_update.proto').resolveAll();
    const modelType = root.lookupType('operations_research.math_opt.ModelProto'), updateType = root.lookupType('operations_research.math_opt.ModelUpdateProto');
    const id = 3_000_000_000;
    const input = { name: 'sparse', variables: { ids: [id, id + 3], lowerBounds: [0, 1], upperBounds: [4, 1], integers: [false, true], names: ['x', 'z'] },
      linearConstraints: { ids: [id + 1], lowerBounds: [-Infinity], upperBounds: [4], names: ['row'] },
      linearConstraintMatrix: { rowIds: [id + 1], columnIds: [id], coefficients: [2] },
      objective: { maximize: true, offset: 7, name: 'profit', priority: 2, linearCoefficients: { ids: [id], values: [1] },
        quadraticCoefficients: { rowIds: [id + 3], columnIds: [id + 3], coefficients: [0.25] } },
      quadraticConstraints: { '1000000000': { lowerBound: -Infinity, upperBound: 9, quadraticTerms: { rowIds: [id], columnIds: [id], coefficients: [1] }, name: 'quadratic' } },
      indicatorConstraints: { '2000000000': { indicatorId: id + 3, expression: { ids: [id], values: [1] }, lowerBound: -Infinity, upperBound: 2, name: 'indicator' } } };
    const model = await MathOptModel.fromModelProto(input);
    input.variables.lowerBounds[0] = 99;
    assert.equal(model.getVariable(id)!.lowerBound, 0);
    assert.equal(model.getNextVariableId(), id + 4); assert.equal(model.getNextLinearConstraintId(), id + 2);
    assert.equal(model.objective.name, 'profit'); assert.equal(model.getNumVariables(), 2);
    assert.equal(model.getLinearConstraint(id + 1)!.getCoefficient(model.getVariable(id)!), 2);
    assert.equal(model.getIndicatorConstraint(2_000_000_000)!.indicator!.id, id + 3);
    const imported = await MathOptModel.fromModelProto(model.encodeModelProto());
    assert.deepEqual(imported.encodeModelProto(), model.encodeModelProto());
    const exported = modelType.toObject(modelType.decode(imported.encodeModelProto()), { longs: Number });
    assert.equal(exported.objective.priority, 2); assert.equal(exported.objective.name, 'profit');
    const stripped = modelType.toObject(modelType.decode(imported.encodeModelProto({ removeNames: true })));
    assert.equal(stripped.name, undefined); assert.equal(stripped.objective.name, undefined);
    const emptyIndicator = await MathOptModel.fromModelProto({ indicatorConstraints: { '7': {} } });
    assert.equal(emptyIndicator.getIndicatorConstraint(7)!.indicator, undefined);
    const empty = await MathOptModel.fromModelProto(new Uint8Array()); assert.equal(empty.getNumVariables(), 0);
    const valid = { variables: { ids: [0], lowerBounds: [0], upperBounds: [1], integers: [false] } };
    (globalThis as Record<string, unknown>).__mathoptValidationError = 'Native validator rejected malformed model';
    await assert.rejects(MathOptModel.fromModelProto(valid), /Native validator rejected/);
    delete (globalThis as Record<string, unknown>).__mathoptValidationError;
    assert.equal(((globalThis as Record<string, unknown>).__mathoptValidation as {type:string}).type, 'validateModel');
    await assert.rejects(MathOptModel.fromModelProto({ secondOrderConeConstraints: { '1': {} } }), /does not support/);
    await assert.rejects(MathOptModel.fromModelProto({ variables: { ...valid.variables, ids: [9007199254740992n] } }), /safe integer|range/);
    const inverted = await MathOptModel.fromModelProto({ variables: { ...valid.variables, lowerBounds: [2] } });
    assert.equal(inverted.getVariable(0)!.lowerBound, 2, 'Infeasible bounds remain valid modeling input');

    const x = model.getVariable(id)!, first = model.addUpdateTracker(), second = model.addUpdateTracker();
    assert.equal(first.exportUpdate(), null); assert.notEqual(first, second);
    x.upperBound = 3;
    const initial = first.exportUpdate()!; assert.deepEqual(first.exportUpdate(), initial);
    first.advanceCheckpoint(); assert.equal(first.exportUpdate(), null); assert.deepEqual(second.exportUpdate(), initial);
    x.upperBound = 2;
    const delta = updateType.toObject(updateType.decode(first.exportUpdate()!), { longs: Number });
    assert.deepEqual(delta.variableUpdates.upperBounds, { ids: [id], values: [2] });
    model.deleteVariable(x);
    const deleted = updateType.toObject(updateType.decode(first.exportUpdate()!), { longs: Number });
    assert.deepEqual(deleted.deletedVariableIds, [id]);
    assert.equal(deleted.linearConstraintMatrixUpdates, undefined);
    assert.equal(deleted.objectiveUpdates, undefined, 'Deletion does not emit coefficients for removed IDs');
    const added = model.addVariable({ name: 'new' }); assert.equal(added.id, id + 4);
    const named = updateType.toObject(updateType.decode(first.exportUpdate()!));
    assert.deepEqual(named.newVariables.names, ['new']);
    const nameless = updateType.toObject(updateType.decode(first.exportUpdate({ removeNames: true })!));
    assert.equal(nameless.newVariables.names, undefined);
    model.removeUpdateTracker(first);
    assert.throws(() => first.exportUpdate(), /removed/); assert.throws(() => first.advanceCheckpoint(), /removed/);
    assert.throws(() => model.removeUpdateTracker(first), /removed/);
    assert.throws(() => imported.removeUpdateTracker(second), /another model/);
    second.advanceCheckpoint(); assert.equal(second.exportUpdate(), null);
    assert.throws(() => model.ensureNextVariableIdAtLeast(-1)); assert.throws(() => model.ensureNextLinearConstraintIdAtLeast(0.5));
    assert.equal(model.getVariable(id), undefined); assert.throws(() => x.lowerBound, /deleted/);
  } finally { delete (globalThis as Record<string, unknown>).__mathoptValidation; delete (globalThis as Record<string, unknown>).__mathoptValidationError; await rm(directory, { recursive: true, force: true }); }
});
