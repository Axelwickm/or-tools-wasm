import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { cpModelProtoSchema } from '../lib/generated/cp_sat_schemas.ts';

let directory: string;
let api: any;
const state = { cancellations: 0, interruptions: 0, emptyResponse: false,
  masks: [] as Array<Record<string, boolean>> };

before(async () => {
  directory = await mkdtemp(fileURLToPath(new URL('.cp-callbacks-', import.meta.url)));
  (globalThis as Record<string, unknown>).__cpCallbackTest = state;
  const type = protobuf.parse(cpModelProtoSchema).root.lookupType('operations_research.sat.CpSolverResponse');
  const response = [...type.encode(type.fromObject({ status: 'OPTIMAL', solution: [1] })).finish()];
  const stopped = [...type.encode(type.fromObject({ status: 'FEASIBLE', solution: [0], wallTime: 3.5 })).finish()];
  const outfile = `${directory}/api.mjs`;
  await build({
    entryPoints: [fileURLToPath(new URL('../lib/cp-sat.ts', import.meta.url))],
    outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{ name: 'controlled-cp-events', setup(builder) {
      builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'stub', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
        const response = Uint8Array.from(${JSON.stringify(response)});
        const stopped = Uint8Array.from(${JSON.stringify(stopped)});
        export class DirectCpSatExecutor {
          execute(request, options) {
            let interrupted = false;
            globalThis.__cpCallbackTest.masks.push(request.callbacks);
            return {
              interrupt: async () => { interrupted = true; globalThis.__cpCallbackTest.interruptions++; },
              cancel: async () => { globalThis.__cpCallbackTest.cancellations++; },
              result: Promise.resolve().then(async () => {
                for (const event of [
                  { type: 'solution', response },
                  { type: 'bestBound', bound: 1 },
                  { type: 'log', message: 'search log' },
                ]) {
                  if (request.callbacks[event.type]) await options.onEvent(event);
                }
                return { type: 'solve', response: globalThis.__cpCallbackTest.emptyResponse
                  ? new Uint8Array() : interrupted ? stopped : response, statistics: 'native final statistics' };
              }),
            };
          }
        }
      ` }));
    } }],
  });
  api = await import(outfile);
});

after(async () => {
  delete (globalThis as Record<string, unknown>).__cpCallbackTest;
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const boundary of ['onSolutionCallback', 'bestBoundCallback', 'logCallback']) {
  for (const kind of ['throw', 'fulfilled Promise', 'rejected Promise', 'rejecting thenable']) {
    test(`${boundary} rejects ${kind}, cleans up, and allows a subsequent solve`, async () => {
      const solver = new api.CpSolver();
      const model = new api.CpModel();
      model.newBoolVar('x');
      const callback = new api.CpSolverSolutionCallback();
      const failure = new Error('original callback failure');
      const handler = () => {
        if (kind === 'throw') throw failure;
        if (kind === 'fulfilled Promise') return Promise.resolve();
        if (kind === 'rejected Promise') return Promise.reject(failure);
        return { then(_resolve: unknown, reject: (error: Error) => void) { reject(failure); } };
      };
      if (boundary === 'onSolutionCallback') callback.onSolutionCallback = handler;
      else solver[boundary] = handler;
      const cancellations = state.cancellations;
      await assert.rejects(solver.solve(model, { executor: 'direct', solutionCallback: callback }),
        kind === 'throw' ? (error: unknown) => error === failure
          : (error: unknown) => error instanceof TypeError && error.message.includes(boundary)
            && /synchronously; use onEvent/.test(error.message));
      // Let rejected Promises/thenables reach Node's unhandled-rejection check.
      await setImmediate();
      assert.equal(state.cancellations, cancellations + 1);
      assert.equal(solver.response, null);
      callback.stopSearch();
      solver.stopSearch();
      assert.equal(state.cancellations, cancellations + 1, 'stop actions were detached');
      callback.onSolutionCallback = () => {};
      solver.bestBoundCallback = solver.logCallback = null;
      assert.equal(await solver.solve(model, { executor: 'direct', solutionCallback: callback }), 'OPTIMAL');
    });
  }
}

test('synchronous callbacks and asynchronous onEvent observers coexist', async () => {
  const solver = new api.CpSolver();
  const model = new api.CpModel();
  const x = model.newBoolVar('x');
  const callback = new api.CpSolverSolutionCallback();
  const seen: unknown[] = [];
  callback.onSolutionCallback = () => { seen.push(callback.value(x)); };
  solver.bestBoundCallback = (bound: number) => { seen.push(bound); };
  solver.logCallback = (message: string) => { seen.push(message); };
  const cancellations = state.cancellations;
  assert.equal(await solver.solve(model, { executor: 'direct', solutionCallback: callback,
    onEvent: async (event: { type: string }) => { await setImmediate(); seen.push(event.type); },
  }), 'OPTIMAL');
  assert.deepEqual(seen, [1n, 'solution', 1, 'bestBound', 'search log', 'log']);
  assert.equal(state.cancellations, cancellations);
});

test('ordinary solves do not subscribe to intermediate solutions', async () => {
  const model = new api.CpModel();
  model.newBoolVar('x');
  await api.CpSat.solve(model, { executor: 'direct' });
  assert.deepEqual(state.masks[state.masks.length - 1], { solution: false, bestBound: false, log: false });
  const events: string[] = [];
  await api.CpSat.solve(model, { executor: 'direct', eventMask: { log: true },
    onEvent: (event: { type: string }) => { events.push(event.type); },
  });
  assert.deepEqual(state.masks[state.masks.length - 1], { solution: false, bestBound: false, log: true });
  assert.deepEqual(events, ['log']);
});

for (const from of ['solution', 'log', 'before dispatch']) {
  test(`stopSearch from ${from} returns the native final response and statistics`, async () => {
    const model = new api.CpModel();
    const x = model.newBoolVar('x');
    const solver = new api.CpSolver();
    const callback = new api.CpSolverSolutionCallback();
    if (from === 'solution') callback.onSolutionCallback = () => {
      assert.equal(callback.value(x), 1n);
      callback.stopSearch();
    };
    if (from === 'log') solver.logCallback = () => { solver.stopSearch(); };
    const interruptions = state.interruptions, cancellations = state.cancellations;
    const solving = solver.solve(model, { executor: 'direct',
      ...(from === 'solution' ? { solutionCallback: callback } : {}),
    });
    if (from === 'before dispatch') solver.stopSearch();
    assert.equal(await solving, 'FEASIBLE');
    assert.equal(solver.value(x), 0n, 'the native final solution replaces the observed candidate');
    assert.equal(solver.wallTime, 3.5);
    assert.equal(solver.responseStats(), 'native final statistics');
    assert.equal(state.interruptions, interruptions + 1);
    assert.equal(state.cancellations, cancellations);
    assert.equal(state.masks[state.masks.length - 1]?.solution, from === 'solution');
  });
}

test('caller cancellation still rejects instead of returning a stopped response', async () => {
  const model = new api.CpModel();
  model.newBoolVar('x');
  const solver = new api.CpSolver(), controller = new AbortController();
  const reason = new Error('caller cancelled');
  solver.logCallback = () => { controller.abort(reason); };
  const cancellations = state.cancellations;
  await assert.rejects(solver.solve(model, { executor: 'direct', signal: controller.signal }), error => error === reason);
  assert.equal(state.cancellations, cancellations + 1);
  assert.equal(solver.response, null);
});

test('an empty native stopped response decodes as UNKNOWN instead of disappearing', async () => {
  state.emptyResponse = true;
  try {
    const result = await api.CpSat.solveProto(new Uint8Array(), { executor: 'direct' });
    assert.equal(result.response.status, 'UNKNOWN');
    assert.equal(result.bytes.length, 0);
  } finally { state.emptyResponse = false; }
});
