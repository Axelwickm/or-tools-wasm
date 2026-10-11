import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

test('MathOpt objective handles, exact priorities and per-objective protobuf updates', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-objectives-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/mathopt.ts', import.meta.url))], outfile,
      bundle: true, format: 'esm', platform: 'node', packages: 'external',
      plugins: [{ name: 'validator', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'validator', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export class DirectMathOptExecutor {
          execute(operation) { if(operation.type !== 'validateModel') throw Error('Expected native model validation');
            return {result:Promise.resolve({validationError:''})}; } }` }));
      } }] });
    const api: typeof import('../lib/mathopt.ts') = await import(pathToFileURL(outfile).href);
    const root = new protobuf.Root(); root.resolvePath = (_, path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
    root.loadSync(['ortools/math_opt/model_update.proto', 'ortools/math_opt/model_parameters.proto']).resolveAll();
    const modelType = root.lookupType('operations_research.math_opt.ModelProto');
    const updateType = root.lookupType('operations_research.math_opt.ModelUpdateProto');
    const parameterType = root.lookupType('operations_research.math_opt.ModelSolveParametersProto');
    const decode = (type: protobuf.Type, bytes: Uint8Array) => type.toObject(type.decode(bytes), { longs: String });
    const maximum = 9223372036854775807n;
    const large = api.MathOpt.Model();
    const variables = Array.from({ length: 1000 }, () => large.addVariable());
    const owns = large.assertOwnsVariable.bind(large);
    let checks = 0;
    large.assertOwnsVariable = variable => { ++checks; owns(variable); };
    for (const variable of variables) large.objective.setLinearCoefficient(variable, 1);
    assert.equal(checks, variables.length, 'Coefficient edits validate only their supplied variables');
    const snapshot = large.objective.linearTerms();
    checks = 0;
    large.objective.offset = 3;
    large.objective.isMaximize = true;
    assert.equal(checks, 0, 'Scalar edits do not revisit objective terms');
    const edits = large.addUpdateTracker();
    large.objective.setLinearCoefficient(variables[0], 7);
    large.objective.setLinearCoefficient(variables[1], 0);
    large.objective.setQuadraticCoefficient(variables[1], variables[0], 4);
    large.objective.setQuadraticCoefficient(variables[0], variables[1], 5);
    assert.equal(large.objective.getQuadraticCoefficient(variables[1], variables[0]), 5);
    assert.equal(large.objective.quadraticTerms().length, 1);
    assert.deepEqual(snapshot.slice(0, 2).map(term => term.coefficient), [1, 1]);
    const changes = decode(updateType, edits.exportUpdate()!).objectiveUpdates;
    assert.deepEqual(changes.linearCoefficients, { ids: ['0', '1'], values: [7, 0] });
    assert.deepEqual(changes.quadraticCoefficients, { rowIds: ['0'], columnIds: ['1'], coefficients: [5] });
    large.objective.setQuadraticCoefficient(variables[1], variables[0], 0);
    assert.equal(large.objective.quadraticTerms().length, 0);
    const original = large.encodeModelProto();
    assert.throws(() => large.objective.setLinearCoefficient(api.MathOpt.Model().addVariable(), 5), /different MathOpt/);
    assert.deepEqual(large.encodeModelProto(), original, 'Rejected edits leave the objective unchanged');
    const model = api.MathOpt.Model('objectives', { primaryObjectiveName: 'profit' });
    const x = model.addVariable({ name: 'x' }), y = model.addVariable({ name: 'y' });
    const rowModel = api.MathOpt.Model();
    const rowVariable = rowModel.addVariable();
    const row = rowModel.addLinearConstraint({ terms: [{ variable: rowVariable, coefficient: 2 }] });
    row.terms()[0].coefficient = 99;
    assert.equal(row.getCoefficient(rowVariable), 2, 'Linear row term snapshots do not mutate model storage');
    model.objective.priority = maximum;
    model.ensureNextAuxiliaryObjectiveIdAtLeast(3_000_000_000);
    const aux = model.addMaximizationObjective(api.MathOpt.asFlatLinearExpression(x).multiply(2).add(3), { priority: 1, name: 'reward' });
    assert.equal(aux.id, 3_000_000_000); assert.equal(aux.offset, 3); assert.equal(aux.getLinearCoefficient(x), 2);
    const exposedTerms = aux.linearTerms();
    exposedTerms[0].coefficient = 99;
    assert.equal(aux.getLinearCoefficient(x), 2, 'Objective term snapshots do not mutate model storage');
    model.objective.setQuadraticCoefficient(x, x, 3);
    model.objective.quadraticTerms()[0].coefficient = 99;
    assert.equal(model.objective.getQuadraticCoefficient(x, x), 3);
    model.objective.setQuadraticCoefficient(x, x, 0);
    assert.equal(model.objective.name, 'profit'); assert.equal(model.objective.priority, maximum);
    assert.ok(aux.equals(model.getAuxiliaryObjective(aux.id))); assert.ok(!aux.equals(model.objective));
    assert.equal(model.getNumAuxiliaryObjectives(), 1); assert.equal(model.getNextAuxiliaryObjectiveId(), aux.id + 1);
    assert.equal(decode(modelType, model.encodeModelProto()).objective.priority, String(maximum));
    const imported = await api.MathOptModel.fromModelProto(model.encodeModelProto());
    assert.deepEqual(imported.encodeModelProto(), model.encodeModelProto());
    const nameless = decode(modelType, model.encodeModelProto({ removeNames: true }));
    assert.equal(nameless.objective.name, undefined); assert.equal(nameless.auxiliaryObjectives[aux.id].name, undefined);
    const tracker = model.addUpdateTracker(); assert.equal(tracker.exportUpdate(), null);
    aux.clear();
    assert.equal(aux.isMaximize, true); assert.equal(aux.priority, 1n); assert.equal(aux.offset, 0);
    const cleared = decode(updateType, tracker.exportUpdate()!).auxiliaryObjectivesUpdates.objectiveUpdates[aux.id];
    assert.deepEqual(cleared.linearCoefficients, { ids: ['0'], values: [0] });
    assert.equal(cleared.directionUpdate, undefined);
    tracker.advanceCheckpoint();
    aux.setToLinearExpression(api.MathOpt.asFlatLinearExpression(y).multiply(4).add(7)); aux.priority = maximum - 1n;
    model.objective.priority = 0;
    const delta = decode(updateType, tracker.exportUpdate()!);
    assert.equal(delta.objectiveUpdates.priorityUpdate, '0');
    assert.equal(delta.auxiliaryObjectivesUpdates.objectiveUpdates[aux.id].priorityUpdate, String(maximum - 1n));
    tracker.advanceCheckpoint(); model.deleteVariable(y);
    const deletedVariable = decode(updateType, tracker.exportUpdate()!);
    assert.equal(deletedVariable.auxiliaryObjectivesUpdates, undefined, 'Native deletion already removes objective terms');
    tracker.advanceCheckpoint();
    const second = model.addMinimizationObjective(x, { priority: 2, name: 'cost' });
    model.deleteAuxiliaryObjective(aux);
    const replaced = decode(updateType, tracker.exportUpdate()!).auxiliaryObjectivesUpdates;
    assert.deepEqual(replaced.deletedObjectiveIds, [String(aux.id)]);
    assert.equal(replaced.newObjectives[second.id].name, 'cost');
    assert.equal(model.hasAuxiliaryObjective(aux.id), false);
    assert.throws(() => aux.offset, /deleted/); assert.throws(() => model.deleteAuxiliaryObjective(aux), /deleted/);
    assert.throws(() => second.setQuadraticCoefficient(x, x, 0), /Quadratic auxiliary/);
    assert.equal(second.getQuadraticCoefficient(x, x), 0); assert.deepEqual(second.quadraticTerms(), []);
    const foreign = api.MathOpt.Model().addVariable();
    assert.throws(() => second.setToLinearExpression(foreign), /different MathOpt/);
    assert.equal(second.getLinearCoefficient(x), 1, 'Failed expression assignment is atomic');
    assert.throws(() => second.priority = -1, /nonnegative/);
    assert.throws(() => second.priority = maximum + 1n, /int64/);
    assert.throws(() => second.priority = Number(maximum), /safe integer/);
    model.objective.isMaximize = true; model.objective.setLinearCoefficient(x, 2); model.objective.clear();
    assert.equal(model.objective.isMaximize, true, 'Primary clear preserves direction as upstream');
    const params = new api.MathOptModelSolveParameters({ objectiveParameters: new Map([
      [model.objective, new api.MathOptObjectiveParameters({ objectiveDegradationAbsoluteTolerance: 0 })],
      [second, new api.MathOptObjectiveParameters({ objectiveDegradationAbsoluteTolerance: 4.1,
        objectiveDegradationRelativeTolerance: 4.2, timeLimitSeconds: 60 })],
    ]) });
    const encoded = decode(parameterType, params.toProtoBytes());
    assert.deepEqual(encoded.primaryObjectiveParameters, { objectiveDegradationAbsoluteTolerance: 0 });
    assert.deepEqual(encoded.auxiliaryObjectiveParameters[second.id], { objectiveDegradationAbsoluteTolerance: 4.1,
      objectiveDegradationRelativeTolerance: 4.2, timeLimit: { seconds: '60' } });
    const baseHandle = Reflect.construct(api.MathOptObjective, [model, second.id]);
    const baseParameters = new api.MathOptModelSolveParameters({ objectiveParameters: new Map([[baseHandle,
      { objectiveDegradationAbsoluteTolerance: 2 }]]) });
    const baseEncoded = decode(parameterType, baseParameters.toProtoBytes(model));
    assert.equal(baseEncoded.primaryObjectiveParameters, undefined, 'Stored identity determines objective kind');
    assert.deepEqual(baseEncoded.auxiliaryObjectiveParameters[second.id], { objectiveDegradationAbsoluteTolerance: 2 });
    const forged = Object.assign(Object.create(api.MathOptObjective.prototype), { model });
    assert.throws(() => new api.MathOptModelSolveParameters({ objectiveParameters: new Map([[forged, {}]]) })
      .toProtoBytes(model), /not registered/);
    assert.throws(() => forged.assertLive(), /not registered/);
    assert.throws(() => api.MathOpt.encodeSolveRequest(api.MathOpt.Model(), { modelParameters: params }), /different MathOpt/);
    assert.throws(() => new api.MathOptModelSolveParameters({ objectiveParameters: new Map([[aux, {}]]) }).toProtoBytes(), /deleted/);
    assert.equal(new api.MathOpt.ObjectiveParameters().toProtoBytes().length, 0);
    const durationType = root.lookupType('operations_research.math_opt.ObjectiveParametersProto');
    assert.deepEqual(decode(durationType, new api.MathOptObjectiveParameters({ timeLimitSeconds: 1.9999999996 }).toProtoBytes()),
      { timeLimit: { seconds: '2' } }, 'Fractional seconds round to a canonical protobuf duration');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
