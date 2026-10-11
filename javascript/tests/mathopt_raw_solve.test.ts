import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

test('MathOpt raw solves preserve supplied wire bytes and decode the complete native result with exact IDs', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-raw-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/mathopt/api.ts', import.meta.url))], outfile, bundle: true,
      format: 'esm', platform: 'node', packages: 'external', plugins: [{ name: 'capture-native', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'capture', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectMathOptExecutor {
            execute(operation) {
              globalThis.__rawMathOptRequests.push(operation);
              return { requestId: 1, result: Promise.resolve({ response: globalThis.__rawMathOptResponse }), cancel: async () => {} };
            }
          }` }));
      } }] });
    const api: typeof import('../lib/mathopt/api.ts') = await import(pathToFileURL(outfile).href);
    const repository = fileURLToPath(new URL('../../', import.meta.url));
    const root = new protobuf.Root(); root.resolvePath = (_, target) => path.join(repository, target);
    root.loadSync('ortools/math_opt/rpc.proto').resolveAll();
    const responseType = root.lookupType('operations_research.math_opt.SolveResponse');
    const requestType = protobuf.parse('syntax="proto3"; message Request { bytes model=2; }').root.lookupType('Request');
    const id = 9_007_199_254_740_993n;
    const native = responseType.encode(responseType.fromObject({ result: {
      termination: { reason: 1 }, solutions: [{ primalSolution: { objectiveValue: 2,
        variableValues: { ids: [String(id)], values: [2] }, auxiliaryObjectiveValues: { '3': 7 }, feasibilityStatus: 2 },
        dualSolution: { quadraticDualValues: { ids: ['3'], values: [4] } } }],
    }, messages: ['native message', '重复名称 — lösen 🙂'] })).finish();
    const state = globalThis as typeof globalThis & { __rawMathOptRequests: Array<{ type: string; request: Uint8Array }>; __rawMathOptResponse: Uint8Array };
    state.__rawMathOptRequests = []; state.__rawMathOptResponse = native;
    const source = Uint8Array.of(0xa0, 0x06, 0x01); // ModelProto unknown field 100, retained verbatim.
    const expected = new Uint8Array(source);
    const pending = api.MathOpt.solveProto(source, { executor: 'direct' }); source.fill(255);
    const result = await pending;
    assert.equal(state.__rawMathOptRequests.length, 1, 'raw solving needs no separate model import or validation job');
    assert.equal(state.__rawMathOptRequests[0].type, 'solve');
    assert.deepEqual(requestType.decode(state.__rawMathOptRequests[0].request).model, expected);
    assert.equal(BigInt(result.response.solutions![0].primalSolution!.variableValues!.ids![0]), id);
    assert.deepEqual(result.response.solutions![0].primalSolution!.auxiliaryObjectiveValues, { '3': 7 });
    assert.deepEqual(result.response.solutions![0].dualSolution!.quadraticDualValues!.values, [4]);
    assert.deepEqual(result.messages, ['native message', '重复名称 — lösen 🙂']);
    assert.equal(result.response.termination!.reason, 'TERMINATION_REASON_OPTIMAL');
    const saved = new Uint8Array(result.bytes); native.fill(0);
    assert.deepEqual(result.bytes, saved, 'result bytes own their storage');
    result.bytes.fill(255);
    assert.equal(result.response.solutions![0].primalSolution!.objectiveValue, 2);
    await assert.rejects(api.MathOpt.solveProto(expected, { executor: 'direct', removeNames: true } as never), /remove names from the input proto/);
    assert.equal(state.__rawMathOptRequests.length, 1, 'raw-only options reject before dispatch');
    const nativeError = 'duplicate name inserted: 重复名称; ModelProto.variables are invalid';
    state.__rawMathOptResponse = responseType.encode(responseType.fromObject({ status: { code: 3, message: nativeError } })).finish();
    await assert.rejects(api.MathOpt.solveProto(expected, { executor: 'direct' }), { message: nativeError });
    await assert.rejects(api.MathOpt.solve(api.MathOpt.Model(), { executor: 'direct' }), { message: nativeError });
    const failed = new api.MathOptIncrementalSolver(api.MathOpt.Model(), 'GLOP', { executor: 'direct' });
    try { await assert.rejects(failed.solve(), { message: nativeError }); }
    finally { await failed.close(); }
  } finally {
    delete (globalThis as Record<string, unknown>).__rawMathOptRequests;
    delete (globalThis as Record<string, unknown>).__rawMathOptResponse;
    await rm(directory, { recursive: true, force: true });
  }
});

test('raw incremental sessions forward model/update bytes and preserve false update results', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-raw-session-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)), contents:
      `export * from './mathopt/api.ts'; export { mathOptProtocol } from './mathopt/protocol.ts';` },
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', plugins: [{ name: 'capture-session', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'capture', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectMathOptExecutor {
            execute(operation) {
              globalThis.__rawIncrementalCalls.push(operation);
              const result = operation.type === 'incrementalUpdate' ? { updated: globalThis.__rawIncrementalUpdated }
                : { response: operation.type === 'incrementalCreate' ? Uint8Array.of(18,1,49) : Uint8Array.of(10,0) };
              return { requestId: 1, result: Promise.resolve(result), cancel: async () => {} };
            }
          }` }));
      } }] });
    const api = await import(pathToFileURL(outfile).href);
    const state = globalThis as typeof globalThis & { __rawIncrementalCalls: Array<{ type: string; request: Uint8Array; modelUpdate: Uint8Array }>; __rawIncrementalUpdated: boolean };
    state.__rawIncrementalCalls = []; state.__rawIncrementalUpdated = true;
    const requestType = protobuf.parse('syntax="proto3"; message Request { bytes model=2; }').root.lookupType('Request');
    const modelBytes = Uint8Array.of(0xa0, 0x06, 1);
    const solver = new api.MathOpt.ProtoIncrementalSolver(modelBytes, api.MathOptSolverType.GLOP, { executor: 'direct' });
    modelBytes.fill(255);
    assert.deepEqual(requestType.decode(state.__rawIncrementalCalls[0].request).model, Uint8Array.of(0xa0, 0x06, 1));
    const updateBytes = Uint8Array.of(0xa0, 0x06, 2);
    const updating = solver.update(updateBytes); updateBytes.fill(255);
    assert.equal(await updating, true);
    assert.deepEqual(state.__rawIncrementalCalls[1].modelUpdate, Uint8Array.of(0xa0, 0x06, 2), 'unknown update fields are forwarded verbatim');
    await solver.solve();
    assert.equal(requestType.decode(state.__rawIncrementalCalls[2].request).model.length, 0, 'raw solves send no rebuilt model');
    for (const updated of [true, false]) assert.deepEqual(api.mathOptProtocol.decodeResult(api.mathOptProtocol.encodeResult({ updated })), { updated });
    state.__rawIncrementalUpdated = false;
    assert.equal(await solver.update({}), false, 'native false is returned without reconstruction');
    await assert.rejects(solver.solve(), /unusable/);
    await solver.close(); await solver.close();
    assert.deepEqual(state.__rawIncrementalCalls.map(call => call.type), ['incrementalCreate', 'incrementalUpdate', 'incrementalSolve', 'incrementalUpdate', 'incrementalDelete']);
  } finally {
    delete (globalThis as Record<string, unknown>).__rawIncrementalCalls;
    delete (globalThis as Record<string, unknown>).__rawIncrementalUpdated;
    await rm(directory, { recursive: true, force: true });
  }
});
