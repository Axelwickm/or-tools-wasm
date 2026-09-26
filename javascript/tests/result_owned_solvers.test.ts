import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('Solver results enforce concurrency, bounds, and defensive copies', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.result-owned-', import.meta.url)));
  const responses: unknown[] = [];
  (globalThis as Record<string, unknown>).__resultOwnedResponses = responses;
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: {
        contents: `export * from './knapsack.ts';
          export * from './network-flow.ts';`,
        resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'answer-executor', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          class Executor {
            execute() { return { result: Promise.resolve(globalThis.__resultOwnedResponses.shift()) }; }
          }
          export { Executor as DirectKnapsackExecutor, Executor as DirectNetworkFlowExecutor };
        ` }));
      } }],
    });
    const { KnapsackSolver, KnapsackSolverType, SimpleMaxFlow, SimpleMinCostFlow, SimpleLinearSumAssignment } = await import(outfile);

    for (const [type, limit] of [[0, 30], [1, 64], [2, Infinity], [9, Infinity]]) {
      const solver = new KnapsackSolver(type, 'limits');
      assert.throws(() => solver.init([1], [[1], [1]], [1, 1]), /one weight dimension/);
      if (Number.isFinite(limit)) {
        assert.throws(() => solver.init(Array(limit + 1).fill(1), [Array(limit + 1).fill(1)], [1]), /at most/);
        solver.init(Array(limit).fill(1), [Array(limit).fill(1)], [1]);
      }
      solver.init([5], [[1]], [1]);
      assert.throws(() => solver.init([1], [[1], [1]], [1, 1]), /one weight dimension/);
      responses.push({ profit: 5n, optimal: true, contains: [true] });
      assert.equal((await solver.solve({ executor: 'direct' })).profit, 5n);
    }

    for (const [Solver, add, read, valid] of [
      [SimpleMaxFlow, 'addArcWithCapacity', 'capacity', [0, 1, 7]],
      [SimpleMinCostFlow, 'addArcWithCapacityAndUnitCost', 'unitCost', [0, 1, 7, 3]],
      [SimpleLinearSumAssignment, 'addArcWithCost', 'cost', [0, 1, 3]],
    ] as const) {
      const model = new Solver();
      for (let position = 0; position < valid.length; position++) {
        for (const invalid of [NaN, Infinity, 0.5, 2n ** 63n]) {
          const args: unknown[] = [...valid]; args[position] = invalid;
          assert.throws(() => model[add](...args));
          assert.equal(model.numArcs(), 0, 'invalid input must not append any arc fields');
        }
      }
      assert.equal(model[add](...valid), 0);
      assert.equal(model[read](0), BigInt(valid[valid.length - 1]));
      assert.equal(model.numNodes(), 2);
      assert.throws(() => model[add](0, NaN, 2, 3));
      assert.equal(model.numArcs(), 1, 'existing model survives invalid insertion');
      assert.equal(model[add](...valid), 1);
      assert.equal(model[read](1), BigInt(valid[valid.length - 1]));
    }

    const knapsack = new KnapsackSolver(KnapsackSolverType.KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER, 'test');
    knapsack.init([5, 7], [[2, 3]], [3]);
    responses.push({ profit: 7n, optimal: true, contains: [false, true] });
    const firstSolve = knapsack.solve({ executor: 'direct' });
    await assert.rejects(knapsack.solve({ executor: 'direct' }), /already in progress/);
    const first = await firstSolve;
    assert.throws(() => first.contains(2), /out of range/);

    const maxFlow = new SimpleMaxFlow();
    maxFlow.addArcWithCapacity(0, 1, 10);
    responses.push({ status: 0, optimalFlow: 4n, flows: [4n], sourceSideMinCut: [0], sinkSideMinCut: [1] });
    const flowSolve = maxFlow.solve({ source: 0, sink: 1, executor: 'direct' });
    await assert.rejects(maxFlow.solve({ source: 0, sink: 1, executor: 'direct' }), /already in progress/);
    const flow = await flowSolve;
    assert.equal(flow.flow(0), 4n);
    const cut = flow.getSourceSideMinCut();
    cut.push(3);
    assert.deepEqual(flow.getSourceSideMinCut(), [0]);

  } finally {
    delete (globalThis as Record<string, unknown>).__resultOwnedResponses;
    await rm(directory, { recursive: true, force: true });
  }
});
