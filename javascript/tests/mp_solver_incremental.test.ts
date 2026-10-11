import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

test('retained MPSolver sessions snapshot, acknowledge ordered edits and reject stale runtime handles', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-session-', import.meta.url)));
  const state = globalThis as typeof globalThis & { __mpSessionTest: any };
  try {
    const linearSchema = await readFile(new URL('../../ortools/linear_solver/linear_solver.proto', import.meta.url), 'utf8');
    const optionalSchema = await readFile(new URL('../../ortools/util/optional_boolean.proto', import.meta.url), 'utf8');
    const root = protobuf.parse(linearSchema.replace(/^import .*;\s*$/m, ''), protobuf.parse(optionalSchema).root).root;
    const requestType = root.lookupType('operations_research.MPModelRequest');
    const responseType = root.lookupType('operations_research.MPSolutionResponse');
    state.__mpSessionTest = { calls: [], runtime: {}, linearSchema, optionalSchema, nextHandle: 1n,
      metadata: { solverVersion: 'controlled-glop', iterations: 9223372036854775807n, nodes: 0n, variableBasisStatus: [4], constraintBasisStatus: [] },
      response: responseType.encode(responseType.create({ status: 0, variableValue: [2], objectiveValue: 2 })).finish() };
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)), contents:
      "export * from './mp_solver/api.ts'; export { mpSolverProtocol } from './mp_solver/protocol.ts';" },
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', plugins: [{ name: 'test-native', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'native', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectMpSolverExecutor {
            execute(operation, options) {
              const state = globalThis.__mpSessionTest;
              const result = Promise.resolve().then(async () => {
                options.onDispatch?.(state.runtime);
                state.calls.push(operation);
                await options.onEvent({type:'status', status:{state:3}});
                if (operation.type === 'schema') return {type:'schema',linearSolverProtoSchema:state.linearSchema,optionalBooleanProtoSchema:state.optionalSchema,backendVersions:{2:state.version}};
                if (operation.type === 'solve') return {type:'solve',response:state.response,metadata:state.metadata};
                if (operation.type === 'sessionCreate') return {type:'sessionCreate',handle:state.nextHandle++};
                return {type:'sessionResult',hasSolution:true,response:operation.type==='sessionClose'?new Uint8Array():state.response,metadata:state.metadata};
              });
              return {requestId:1,result,cancel:async()=>{}};
            }
          }` }));
      } }] });
    const api = await import(pathToFileURL(outfile).href);
    const model = new api.MPSolver('journal', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
    state.__mpSessionTest.version = 'first-runtime';
    assert.equal(await model.solverVersion({ executor: 'direct' }), 'first-runtime');
    state.__mpSessionTest.version = 'replacement-runtime';
    assert.equal(await model.solverVersion({ executor: 'direct' }), 'replacement-runtime', 'Version queries do not reuse schema-cache metadata');
    const x = model.addNumVariable(0, 4, 'x'); model.objective().setCoefficient(x, 1);
    const first = new api.MPSolver.IncrementalSolver(model, { executor: 'direct' });
    x.setUpperBound(2);
    await assert.rejects(first.solve({ parameters: {} }), /Invalid MPSolverParameters/);
    await first.solve();
    const calls = state.__mpSessionTest.calls;
    assert.equal(requestType.decode(calls.find((call: any) => call.type === 'sessionCreate').request).model.variable[0].upperBound, 4);
    const run = calls.find((call: any) => call.type === 'sessionRun');
    assert.equal(Object.prototype.hasOwnProperty.call(requestType.decode(run.request), 'model'), false, 'solve packet contains no rebuilt model');
    assert.equal(run.edits.length, 1); assert.equal(run.edits[0].second, 2);
    await first.solve();
    assert.equal(calls.at(-1).edits.length, 0, 'acknowledged edits are released');
    const error = new Error('observer failed');
    x.setUpperBound(3);
    await assert.rejects(first.solve({ onEvent: () => { throw error; } }), value => value === error);
    await first.solve();
    assert.equal(calls.at(-1).edits.length, 0, 'native result commits edits before deferred observer error escapes');
    state.__mpSessionTest.runtime = {};
    await assert.rejects(first.solve(), /runtime was replaced/);
    const before = calls.length;
    await first.close(); await first.close();
    assert.equal(calls.length, before, 'stale cleanup never dispatches deletion against a replacement runtime');
    const healthy = new api.MPSolver.IncrementalSolver(model, { executor: 'direct' });
    await healthy.solve(); await healthy.close();
    assert.equal(calls.at(-1).type, 'sessionClose');
    await model.solve({ executor: 'direct' });
    assert.equal(x.basisStatus(), 4);
    await model.solveWithProto({ executor: 'direct' });
    assert.equal(x.basisStatus(), 4, 'Proto solves retain native metadata through shared answer construction');
    const exported: Record<string, unknown> = {};
    model.fillSolutionResponseProto(exported);
    assert.equal(exported.status, api.MPSolver.OPTIMAL, 'Facade export retains numeric status');
    assert.deepEqual(exported.variableValue, [2]);
    assert.throws(() => model.iterations(), /safe integer/, 'Only the numeric convenience getter narrows exact counters');
    const editable = new api.MpModel('modern');
    const value = editable.addNumVariable(0, 4, 'value');
    const modern = editable.incremental({ executor: 'direct', parameters: { primalTolerance: 1e-8 } });
    try {
      const result = await modern.solve();
      assert.equal(result.iterations, 9223372036854775807n);
      assert.equal(result.value(value), 2); assert.equal(result.basisStatus(value), 4);
      result.nativeMetadata.variableBasisStatus.fill(0);
      result.response.variableValue.fill(99);
      assert.equal(result.value(value), 2); assert.equal(result.basisStatus(value), 4);
      assert.equal(value.solutionValue(), 0, 'Result-first model does not store a last solution');
      assert.equal(calls.at(-1).parameters.doubleParams[1], 1e-8, 'Constructor parameter defaults survive solves without overrides');
      const coefficients: Map<number, number> = editable.state.state.objective.coeffs;
      const get = coefficients.get;
      let coefficientReads = 0;
      coefficients.get = function (key) { ++coefficientReads; return get.call(this, key); };
      try { await modern.solve(); } finally { coefficients.get = get; }
      assert.equal(coefficientReads, 0, 'An unchanged retained solve never reads coefficients to rebuild a discarded model');
    } finally { await modern.close(); }
    const stale = model.addNumVariable(0, 1, 'stale');
    const staleRow = model.addConstraint(0, 1, 'stale row');
    model.clear();
    for (const read of [() => stale.solutionValue(), () => stale.unroundedSolutionValue(), () => stale.reducedCost(), () => stale.basisStatus(),
      () => staleRow.dualValue(), () => staleRow.basisStatus()]) {
      assert.throws(read, /deleted by clear/, 'Unsolved getters still validate handle generations');
    }
    const wire = api.mpSolverProtocol.decodeResult(api.mpSolverProtocol.encodeResult({type:'sessionResult',hasSolution:false,response:new Uint8Array()}));
    assert.equal(wire.hasSolution, false, 'native false survives the bridge');
  } finally {
    delete state.__mpSessionTest;
    await rm(directory, { recursive: true, force: true });
  }
});
