import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('routing finalizers validate variable ownership atomically and preserve wire priorities', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-finalizers-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { contents: `export * from './routing/api.ts'; export { routingProtocol } from './routing/protocol.ts';`,
      resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'capture-finalizers', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export class DirectRoutingExecutor {
          execute(operation) { globalThis.__routingFinalizerRequest = operation;
            return { result: Promise.resolve({ type: 'solve', status: 3, solution: null }) }; }
        }` }));
      } }] });
    const { RoutingModel, RoutingIndexManager, routingProtocol } = await import(outfile);
    const model = new RoutingModel(new RoutingIndexManager(2, 1, 0));
    model.addConstantDimensionWithSlack(1, 10, 5, true, 'time');
    const time = model.getDimensionOrDie('time');
    const foreign = new RoutingModel(new RoutingIndexManager(2, 1, 0));
    foreign.addConstantDimension(1, 10, true, 'time');
    for (const invalid of [
      () => model.addVariableMinimizedByFinalizer(foreign.getDimensionOrDie('time').cumulVar(1)),
      () => time.transitVar(model.end(0)),
      () => time.fixedTransitVar(model.end(0)),
      () => model.activeVehicleVar(1),
      () => model.vehicleRouteConsideredVar(1),
      () => model.vehicleRouteConsideredVar(-1),
      () => model.vehicleRouteConsideredVar(NaN),
      () => model.addVariableMinimizedByFinalizer({ ...model.vehicleRouteConsideredVar(0), index: 1 }),
      () => model.addVariableMinimizedByFinalizer(foreign.vehicleRouteConsideredVar(0)),
      () => model.addConstraints(foreign.vehicleRouteConsideredVar(0).eq(1)),
      () => model.addVariableMinimizedByFinalizer({ ...model.activeVehicleVar(0), index: 1 }),
      () => model.addVariableMinimizedByFinalizer({ ...time.transitVar(1), dimensionName: 'missing' }),
      () => model.addVariableMinimizedByFinalizer(foreign.activeVehicleVar(0)),
      () => model.addConstraints(foreign.getDimensionOrDie('time').fixedTransitVar(1).eq(1)),
      () => model.addVariableMinimizedByFinalizer({ ...time.cumulVar(1), index: 99 }),
      () => model.addVariableMinimizedByFinalizer({ ...time.cumulVar(1), dimensionName: 'missing' }),
      () => model.addVariableMinimizedByFinalizer({ ...time.slackVar(1), index: model.end(0) }),
      () => model.addVariableMinimizedByFinalizer({ ...model.activeVar(1), index: model.end(0) }),
      () => model.addVariableMinimizedByFinalizer(model.end(0)),
      () => model.addVariableMinimizedByFinalizer({ kind: 'unsupported', model, index: 1 }),
      () => model.addVariableTargetToFinalizer(time.cumulVar(1), Number.MAX_SAFE_INTEGER + 1),
      () => model.addWeightedVariableTargetToFinalizer(time.cumulVar(1), 0, 1n << 63n),
    ]) assert.throws(invalid);
    const exact = 9_007_199_254_741_003n;
    model.addVariableMinimizedByFinalizer(time.cumulVar(1));
    model.addVariableMaximizedByFinalizer(time.slackVar(1));
    model.addVariableTargetToFinalizer(model.vehicleVar(model.end(0)), -1);
    model.addWeightedVariableMinimizedByFinalizer(model.nextVar(1), 0);
    model.addWeightedVariableMaximizedByFinalizer(model.activeVar(1), -exact);
    model.addWeightedVariableTargetToFinalizer(time.cumulVar(model.end(0)), exact, exact);
    model.addVariableMinimizedByFinalizer(time.transitVar(1));
    model.addWeightedVariableTargetToFinalizer(time.fixedTransitVar(1), exact, 0);
    model.addVariableMaximizedByFinalizer(model.activeVehicleVar(0));
    model.addVariableTargetToFinalizer(model.vehicleRouteConsideredVar(0), 1);
    await model.solve({ executor: 'direct' });
    const request = (globalThis as Record<string, unknown>).__routingFinalizerRequest;
    const decoded = routingProtocol.decodeRequest(routingProtocol.encodeRequest(request));
    const finalizers = decoded.request.operations.filter((operation: { type: string }) => operation.type === 'addFinalizer');
    assert.equal(finalizers.length, 10, 'Invalid calls do not record partially validated operations');
    assert.deepEqual(finalizers.map((operation: { variableKind: number; kind: number; target: bigint; weight?: bigint }) =>
      [operation.variableKind, operation.kind, operation.target, operation.weight]), [
      [1, 1, 0n, undefined], [2, 2, 0n, undefined], [4, 3, -1n, undefined],
      [3, 1, 0n, 0n], [5, 2, 0n, -exact], [1, 3, exact, exact],
      [6, 1, 0n, undefined], [7, 3, exact, 0n], [8, 2, 0n, undefined], [9, 3, 1n, undefined],
    ]);
  } finally {
    delete (globalThis as Record<string, unknown>).__routingFinalizerRequest;
    await rm(directory, { recursive: true, force: true });
  }
});
