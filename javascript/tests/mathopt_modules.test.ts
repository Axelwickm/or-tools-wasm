import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('MathOpt storage and algebra work without loading execution code', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-storage-', import.meta.url)));
  try {
    const outfile = `${directory}/model.mjs`;
    await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib/mathopt/', import.meta.url)), contents: `
      export * from './model.ts';
      export { MathOptLinearExpression } from './expressions.ts';
      export { encodeModelSnapshot } from './model_snapshot.ts';` },
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external',
      plugins: [{ name: 'without-execution', setup(builder) {
        // Preserve the lazy native-conversion boundary, but make it unavailable.
        builder.onResolve({ filter: /^\.\/execution\.js$/ }, () => ({ path: './unavailable-execution.mjs', external: true }));
        builder.onResolve({ filter: /(?:executor|solver_job|worker_helpers)\.js$/ }, () => {
          throw new Error('Model building must not load execution infrastructure');
        });
      } }] });
    const api: typeof import('../lib/mathopt/model.ts') & typeof import('../lib/mathopt/expressions.ts')
      & typeof import('../lib/mathopt/model_snapshot.ts') = await import(pathToFileURL(outfile).href);
    const model = new api.MathOptModel('storage');
    const x = model.addVariable({ lowerBound: 1, upperBound: 3, name: 'x' });
    const expression = new api.MathOptLinearExpression([{ variable: x, coefficient: 2 }], 1);
    model.maximize(expression);
    const tracker = model.addUpdateTracker();
    const snapshot = api.snapshotModel(model);
    const captured = api.encodeModelSnapshot(model.name, snapshot);
    x.upperBound = 4;
    assert.equal(expression.evaluate(new Map([[x, 2]])), 5);
    assert.ok(tracker.exportUpdate()!.length > 0);
    assert.deepEqual(api.encodeModelSnapshot(model.name, snapshot), captured, 'Captured serialization does not read current storage');
    snapshot.variables[0].upperBound = 99;
    snapshot.objective.linearTerms[0].coefficient = 99;
    assert.equal(x.upperBound, 4); assert.equal(model.objective.getLinearCoefficient(x), 2);
    tracker.advanceCheckpoint(); assert.equal(tracker.exportUpdate(), null);
    assert.equal(model.encodeModelProto().constructor, Uint8Array);
    await assert.rejects(model.exportMps(), /unavailable-execution/, 'Native conversion remains lazy');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('MathOpt facade retains class identity and private ownership checks across modules', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-facade-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib/mathopt/', import.meta.url)), contents: `
      export * from './api.ts';
      export * as storage from './model.ts';
      export * as algebra from './expressions.ts';
      export * as variables from './variable.ts';
      export * as sessions from './sessions.ts';
      export { calls } from 'capture-native';` },
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external',
      plugins: [{ name: 'capture-conversion', setup(builder) {
        builder.onResolve({ filter: /^(capture-native|\.\/direct_executor\.js)$/ }, () => ({ path: 'capture', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export const calls = [];
          export class DirectMathOptExecutor {
            execute(operation) {
              calls.push(operation);
              return { result: Promise.resolve({ mps: 'native MPS' }), cancel: async () => {} };
            }
          }` }));
      } }] });
    const api: typeof import('../lib/mathopt/api.ts') & {
      storage: typeof import('../lib/mathopt/model.ts'); algebra: typeof import('../lib/mathopt/expressions.ts');
      variables: typeof import('../lib/mathopt/variable.ts'); sessions: typeof import('../lib/mathopt/sessions.ts');
      calls: Array<{ type: string; model: Uint8Array }>;
    } = await import(pathToFileURL(outfile).href);
    assert.equal(api.MathOptModel, api.storage.MathOptModel);
    assert.equal(api.MathOptVariable, api.variables.MathOptVariable);
    assert.equal(api.MathOpt.LinearExpression, api.algebra.MathOptLinearExpression);
    assert.equal(api.MathOpt.IncrementalSolver, api.sessions.MathOptIncrementalSolver);
    assert.equal(api.MathOpt.ProtoIncrementalSolver, api.sessions.MathOptProtoIncrementalSolver);
    const model = api.MathOpt.Model();
    const x = model.addVariable();
    assert.equal(model.getVariable(x.id), x);
    const sum = api.fastSum([x, model.getVariable(x.id)!]);
    assert.equal(api.evaluateExpression(sum, new Map([[x, 3]])), 6);
    const foreign = api.MathOpt.Model().addVariable();
    assert.throws(() => model.maximize(foreign), /different MathOpt/);
    const forged = Reflect.construct(api.MathOptVariable, [model,
      { id: x.id, lowerBound: 0, upperBound: 1, integer: false, name: '', deleted: false }]);
    assert.throws(() => model.objective.setLinearCoefficient(forged, 1), /not registered/);
    model.objective.setLinearCoefficient(x, 2);
    assert.equal(model.objective.getLinearCoefficient(x), 2);
    const captured = model.encodeModelProto();
    const exporting = model.exportMps();
    x.upperBound = 5;
    assert.equal(await exporting, 'native MPS');
    assert.equal(api.calls[0].type, 'modelProtoToMps');
    assert.deepEqual(api.calls[0].model, captured, 'Lazy native conversion preserves the model at submission');
    model.deleteVariable(x);
    assert.throws(() => x.lowerBound, /deleted/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
