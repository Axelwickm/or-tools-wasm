import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('MPSolver and Routing reject overlapping instance solves and recover after completion', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.solve-concurrency-', import.meta.url)));
  try {
    const linearSolverProtoSchema = await readFile(new URL('../../ortools/linear_solver/linear_solver.proto', import.meta.url), 'utf8');
    const optionalBooleanProtoSchema = await readFile(new URL('../../ortools/util/optional_boolean.proto', import.meta.url), 'utf8');
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: {
        contents: `export { MPSolver } from './mp_solver/api.ts';
          export { RoutingModel, RoutingIndexManager } from './routing/api.ts';
          export { pending } from 'test-executor';`,
        resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'deferred-executor', setup(builder) {
        builder.onResolve({ filter: /^(test-executor|\.\/direct_executor\.js)$/ }, () => ({ path: 'executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export const pending = [];
          class Executor {
            execute(operation) {
              if (operation.type === 'schema') return { result: Promise.resolve(${JSON.stringify({ type: 'schema', linearSolverProtoSchema, optionalBooleanProtoSchema })}) };
              return { result: new Promise((resolve, reject) => pending.push({resolve, reject})) };
            }
          }
          export { Executor as DirectMpSolverExecutor, Executor as DirectRoutingExecutor };
        ` }));
      } }],
    });
    const { MPSolver, RoutingModel, RoutingIndexManager, pending } = await import(outfile);
    const options = { executor: 'direct' };
    const mp = new MPSolver('test', MPSolver.GLOP_LINEAR_PROGRAMMING);
    const routing = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    routing.setArcCostEvaluatorOfAllVehicles(routing.registerTransitCallback(() => 1));
    const assignment = routing.readAssignmentFromRoutes([[1, 2]], true);
    const variants = [
      [() => mp.solve(options), () => mp.solveWithProto({ ...options, loadSolution: false })],
      [() => routing.solve(options), () => routing.solveWithParameters({}, options),
        () => routing.solveFromAssignmentWithParameters(assignment, {}, options)],
    ];
    const mpBytes = await MPSolver.createSolutionResponse({ status: 0, variableValue: [], objectiveValue: 0 }, options);
    for (const [index, solves] of variants.entries()) {
      for (const start of solves) {
        for (const fail of [false, true]) {
          const active = start();
          const completion = fail ? assert.rejects(active, /executor failed/) : active;
          for (const overlap of solves) await assert.rejects(overlap(), /already in progress/);
          await new Promise(resolve => setImmediate(resolve));
          assert.equal(pending.length, 1);
          const job = pending.shift();
          if (fail) job.reject(new Error('executor failed'));
          else job.resolve(index === 0 ? { type: 'solve', response: mpBytes } : { type: 'solve', status: 3, solution: null });
          await completion;
        }
      }
    }
    const other = new MPSolver('other', MPSolver.GLOP_LINEAR_PROGRAMMING);
    const first = mp.solve(options);
    const second = other.solve(options);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pending.length, 2);
    for (const job of pending.splice(0)) job.resolve({ type: 'solve', response: mpBytes });
    await Promise.all([first, second]);
    const otherRouting = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    otherRouting.setArcCostEvaluatorOfAllVehicles(otherRouting.registerTransitCallback(() => 1));
    const routingSolves = [routing.solve(options), otherRouting.solve(options)];
    assert.equal(pending.length, 2);
    for (const job of pending.splice(0)) job.resolve({ type: 'solve', status: 3, solution: null });
    await Promise.all(routingSolves);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
