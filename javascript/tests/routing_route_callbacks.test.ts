import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build } from 'esbuild';

test('route callback codec preserves int64 costs, copied indices and null rejection', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.route-callback-', import.meta.url)));
  try {
    const outfile = `${directory}/codec.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/routing/route_callbacks.ts', import.meta.url))], outfile,
      bundle: true, platform: 'node', format: 'esm' });
    const { routingRouteCallback } = await import(outfile);
    const data = new Uint8Array(4 + 3 * 8), view = new DataView(data.buffer);
    [0n, 2n, 4n].forEach((index, i) => view.setBigInt64(4 + i * 8, index, true));
    let retained: number[] = [], value: unknown = -(1n << 63n);
    const callback = routingRouteCallback([(route: number[]) => { retained = route; return value; }, () => null]);
    let reply = callback(data);
    assert.equal(new DataView(reply.buffer).getBigInt64(1, true), -(1n << 63n));
    assert.deepEqual(retained, [0, 2, 4]); data[4] = 1; assert.deepEqual(retained, [0, 2, 4]);
    value = (1n << 63n) - 1n; reply = callback(data);
    assert.equal(new DataView(reply.buffer).getBigInt64(1, true), value);
    view.setUint32(0, 1, true); assert.deepEqual(callback(data), new Uint8Array([0]));
    view.setUint32(0, 2, true); assert.throws(() => callback(data), /Unknown/);
    assert.throws(() => callback(new Uint8Array(5)), /payload/);
    view.setUint32(0, 0, true);
    for (value of [1.5, 1n << 63n, undefined, Promise.resolve(1)]) assert.throws(() => callback(data));
    view.setBigInt64(4, 9007199254740993n, true); assert.throws(() => callback(data), /index/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('async route callbacks fail synchronously without leaking rejected promises', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.route-async-', import.meta.url)));
  try {
    const outfile = `${directory}/probe.mjs`;
    await build({ stdin: { contents: `
      import assert from 'node:assert/strict';
      import { routingRouteCallback } from './routing/route_callbacks.ts';
      const failure = new Error('async route failure');
      const data = new Uint8Array(4);
      for (const callback of [async () => { throw failure; }, async () => 1,
          () => ({ then(resolve, reject) { reject(failure); } })]) {
        assert.throws(() => routingRouteCallback([callback])(data), /must return synchronously/);
      }
      await new Promise(resolve => setImmediate(resolve));
      const result = routingRouteCallback([() => 7])(data);
      assert.equal(new DataView(result.buffer).getBigInt64(1, true), 7n);
    `, resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) },
      outfile, bundle: true, platform: 'node', format: 'esm' });
    await promisify(execFile)(process.execPath, ['--unhandled-rejections=strict', outfile]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('direct route callback failures stop native evaluation and release registrations before reuse', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.route-executor-', import.meta.url)));
  try {
    const outfile = `${directory}/executor.mjs`;
    await build({
      stdin: { contents: `export { DirectRoutingExecutor } from './routing/direct_executor.ts';`,
        resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'native-callback-probe', setup(builder) {
        builder.onResolve({ filter: /\/runtime_loader\.js$/ }, () => ({ path: 'loader', namespace: 'probe' }));
        builder.onResolve({ filter: /^\.\/native_runtime\.js$/ }, () => ({ path: 'solve', namespace: 'probe' }));
        builder.onLoad({ filter: /.*/, namespace: 'probe' }, ({ path }) => ({ contents: path === 'loader'
          ? `export function loadRoutingRuntime() { throw new Error('Unexpected native load'); }`
          : `export async function solveRoutingWithModule(module, request, interruptible, id) {
              const pointer = module.__ortoolsRoutingRouteCallbacks.get(id)(new Uint8Array(4));
              if (pointer) module._free(pointer);
              return {status: 0, solution: null};
            }` }));
      } }],
    });
    const { DirectRoutingExecutor } = await import(outfile);
    let allocated = 0, freed = 0;
    const module = { HEAPU8: new Uint8Array(128), _malloc: () => { allocated++; return 8; }, _free: () => { freed++; },
      __ortoolsRoutingCallbacks: { nextId: 1, sinks: new Map<number, (bytes: Uint8Array) => void>() },
      __ortoolsRoutingRouteCallbacks: new Map<number, (bytes: Uint8Array) => number>() };
    const executor = new DirectRoutingExecutor(async () => module);
    const operation = { type: 'solve', interruptible: false, request: { operations: [{ type: 'addRouteConstraint', evaluator: 0 }], solutionEvents: true } };
    const options = { onEvent: () => {}, onCallback: () => new Uint8Array([0, 0]) };
    await assert.rejects(executor.execute(operation, options).result, /Invalid Routing route callback reply/);
    assert.equal(allocated, 0);
    assert.equal(module.__ortoolsRoutingRouteCallbacks.size, 0);
    assert.equal(module.__ortoolsRoutingCallbacks.sinks.size, 0);
    const failure = new Error('User route callback failed');
    await assert.rejects(executor.execute(operation, { ...options, onCallback: () => { throw failure; } }).result, error => error === failure);
    await executor.execute(operation, { ...options, onCallback: () => new Uint8Array([0]) }).result;
    assert.equal(allocated, 1); assert.equal(freed, 1);
    assert.equal(module.__ortoolsRoutingRouteCallbacks.size, 0);
    assert.equal(module.__ortoolsRoutingCallbacks.sinks.size, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Routing callback boundaries reject async replies without unhandled rejections and recover', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-boundaries-', import.meta.url)));
  try {
    const outfile = `${directory}/boundaries.mjs`;
    await build({ stdin: { contents: `
      import assert from 'node:assert/strict';
      import { RoutingModel, RoutingIndexManager } from './routing/api.ts';
      const failure = new Error('callback failure');
      const model = () => new RoutingModel(new RoutingIndexManager(3, 1, 0));
      const setups = [
        ['sibling', true, 0, callback => {
          const routing = model(); routing.addPickupAndDelivery(1, 2);
          return () => routing.getFirstMatchingPickupDeliverySibling(1, callback);
        }],
        ['state-dependent', { x: [0, 9], y: [1, 1] }, 0, callback => {
          const routing = model(), fixed = routing.registerTransitCallback(() => 0);
          const dependent = routing.registerStateDependentTransitCallback(callback, { domainStart: 0, domainEnd: 10 });
          return () => routing.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], null, 0, [100], true, 'time');
        }],
        ['pickup/delivery limit', 10, 1.5, callback => {
          const routing = model(), fixed = routing.registerTransitCallback(() => 1);
          routing.addDimension(fixed, 0, 100, true, 'time');
          const pair = routing.addPickupAndDelivery(1, 2);
          routing.getDimensionOrDie('time').setPickupToDeliveryLimitFunctionForPair(callback, pair);
          return () => routing.solve();
        }],
        ...[false, true].map(unary => [unary ? 'unary transit' : 'transit', 1, 1.5, callback => {
          const routing = model();
          const evaluator = unary ? routing.registerUnaryTransitCallback(callback) : routing.registerTransitCallback(callback);
          routing.setArcCostEvaluatorOfAllVehicles(evaluator);
          return () => routing.solve();
        }]),
      ];
      for (const [name, valid, malformed, setup] of setups) {
        for (const [supplier, expected] of [
          [() => { throw failure; }, error => error === failure],
          [async () => valid, /must return synchronously/],
          [async () => { throw failure; }, /must return synchronously/],
          [() => ({ then(resolve, reject) { reject(failure); } }), /must return synchronously/],
          [() => malformed, Error],
        ]) {
          let reply = supplier, calls = 0;
          const operation = setup(() => { calls++; return reply(); });
          // State-dependent dimension construction fails synchronously; the other
          // operations return promises. Check both through the same boundary.
          let caught;
          try { await operation(); } catch (error) { caught = error; }
          assert.ok(caught, name + ' rejects invalid callback reply');
          if (expected instanceof RegExp) assert.match(caught.message, expected, name);
          else if (expected === Error) assert.ok(caught instanceof Error, name);
          else assert.ok(expected(caught), name + ' preserves the original exception');
          assert.equal(calls, 1, name + ' stops evaluation after failure');
          await new Promise(resolve => setImmediate(resolve));
          reply = () => valid;
          await operation();
          assert.ok(calls > 1, name + ' invokes the callback successfully after failure');
        }
      }
    `, resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'callback-boundary-executor', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectRoutingExecutor {
            execute(operation, options) {
              return { result: Promise.resolve().then(() => {
                if (operation.request.modelQuery?.kind === 27) {
                  const data = new Uint8Array(12), view = new DataView(data.buffer);
                  view.setUint32(0, operation.request.modelQuery.predicateEvaluator, true);
                  view.setBigInt64(4, 2n, true);
                  options.onCallback(data);
                  return { type: 'solve', status: 0, solution: null, modelInspection: { value: 2n } };
                }
                return { type: 'solve', status: 0, solution: null };
              }) };
            }
          }` }));
      } }],
    });
    await promisify(execFile)(process.execPath, ['--unhandled-rejections=strict', outfile]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
