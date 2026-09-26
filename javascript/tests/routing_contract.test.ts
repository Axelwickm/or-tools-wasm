import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('routing disjunction IDs ignore other operations', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-contract-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: {
        contents: `export * from './routing/api.ts'; export { routingProtocol } from './routing/protocol.ts';`,
        resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'no-native-execution', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export class DirectRoutingExecutor {}' }));
      } }],
    });
    const { RoutingModel, RoutingIndexManager, routingProtocol } = await import(outfile);
    assert.deepEqual(
      routingProtocol.decodeResult(routingProtocol.encodeResult({ type: 'solve', status: 3, solution: null })),
      { type: 'solve', status: 3, solution: null },
    );
    const routing = new RoutingModel(new RoutingIndexManager(4, 1, 0));
    routing.addConstantDimension(1, 10, true, 'distance');
    assert.equal(routing.addDisjunction([1], 10), 0);
    routing.addConstantDimension(1, 10, true, 'time');
    assert.equal(routing.addDisjunction([2], 10), 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('routing solve options are combined and assignments keep their own values', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-result-', import.meta.url)));
  const responses: unknown[] = [];
  const operations: unknown[] = [];
  (globalThis as Record<string, unknown>).__routingResultTest = { responses, operations };
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL('../lib/routing/api.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'routing-answer', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectRoutingExecutor {
            execute(operation) {
              const test = globalThis.__routingResultTest;
              test.operations.push(operation);
              return { result: Promise.resolve(test.responses.shift()) };
            }
          }
        ` }));
      } }],
    });
    const { RoutingModel, RoutingIndexManager, FirstSolutionStrategy } = await import(outfile);
    const routing = new RoutingModel(new RoutingIndexManager(3, 1, 0));
    routing.setArcCostEvaluatorOfAllVehicles(routing.registerTransitCallback(() => 1));
    const answer = (objectiveValue: bigint, nextValue: number) => ({
      status: 1, objectiveValue, nextValues: [nextValue, 2, 3, 3],
      dimensionCumulValues: {}, starts: [0], ends: [3],
    });
    responses.push(
      { type: 'solve', status: 1, solution: answer(3n, 1) },
      { type: 'solve', status: 1, solution: answer(9n, 2) },
      { type: 'solve', status: 3, solution: null },
    );
    const active = routing.solve({ executor: 'direct', firstSolutionStrategy: FirstSolutionStrategy.PATH_CHEAPEST_ARC });
    routing.addConstantDimension(1, 10, true, 'added-after-submission');
    assert.deepEqual((operations[0] as { request: { operations: unknown[] } }).request.operations, []);
    const firstResult = await active;
    const secondResult = await routing.solve({ executor: 'direct' });
    assert.equal((operations[1] as { request: { operations: unknown[] } }).request.operations.length, 1);
    const first = firstResult.assignment;
    const second = secondResult.assignment;
    assert.equal((operations[0] as { request: { firstSolutionStrategy: number } }).request.firstSolutionStrategy,
      FirstSolutionStrategy.PATH_CHEAPEST_ARC);
    assert.equal(firstResult.status, 1);
    assert.equal(firstResult.hasSolution, true);
    assert.equal(secondResult.status, 1);
    assert(first);
    assert(second);
    assert.equal(first.objectiveValue(), 3n);
    assert.equal(first.value(0), 1);
    assert.equal(second.objectiveValue(), 9n);
    assert.equal(second.value(0), 2);
    assert.throws(() => first.value(99), /no value/);
    const failed = await routing.solve({ executor: 'direct' });
    assert.equal(failed.status, 3);
    assert.equal(failed.hasSolution, false);
    assert.equal(failed.assignment, null);
    assert.equal(firstResult.status, 1);
    assert.equal(first.objectiveValue(), 3n);
  } finally {
    delete (globalThis as Record<string, unknown>).__routingResultTest;
    await rm(directory, { recursive: true, force: true });
  }
});
