import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('MP solve parameters survive transport and reach native setters, with cleanup on failure', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-parameters-', import.meta.url)));
  try {
    const outfile = `${directory}/executor.mjs`;
    await build({
      stdin: {
        contents: `export { MPSolver } from './api.ts'; export { DirectMpSolverExecutor } from './direct_executor.ts';
          export { mpSolverProtocol } from './protocol.ts';`,
        resolveDir: fileURLToPath(new URL('../lib/mp_solver', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{
        name: 'unused-runtime-loader',
        setup(builder) {
          builder.onResolve({ filter: /runtime_loader\.js$/ }, () => ({ path: 'runtime', namespace: 'test' }));
          builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: 'export function loadMPSolverRuntime() { return globalThis.__mpSolverValidationModule; }',
          }));
        },
      }],
    });
    const { MPSolver, DirectMpSolverExecutor, mpSolverProtocol } = await import(outfile);
    const operation = {
      type: 'solve', request: Uint8Array.of(1), numThreads: 1, interruptible: false,
      parameters: { doubleParams: { 0: 0.125, 1: 0.001, 2: 0.002 }, integerParams: { 1000: 0, 1001: 11, 1002: 0, 1003: 1 } },
    };
    const decoded = mpSolverProtocol.decodeRequest(mpSolverProtocol.encodeRequest(operation));
    assert.deepEqual({ ...decoded.parameters.doubleParams }, operation.parameters.doubleParams);
    assert.deepEqual({ ...decoded.parameters.integerParams }, operation.parameters.integerParams);
    const validation = { type: 'validateParameters', solverType: 2, parameters: 'µ\0native text' };
    assert.deepEqual(mpSolverProtocol.decodeRequest(mpSolverProtocol.encodeRequest(validation)), validation);
    for (const accepted of [true, false]) assert.deepEqual(
      mpSolverProtocol.decodeResult(mpSolverProtocol.encodeResult({ type:'validateParameters', accepted })),
      { type:'validateParameters', accepted });
    const solver = MPSolver.createSolver('GLOP');
    let nativeAccepted = 1;
    const heap = new Uint8Array(512), allocations = new Set<number>();
    const validationModule = { HEAPU8: heap,
      _malloc(size: number) { assert.ok(size <= heap.length - 8); allocations.add(8); return 8; },
      _free(pointer: number) { assert.ok(allocations.delete(pointer)); },
      ccall(name: string, _return: unknown, _types: unknown, args: number[], options: {async?:boolean}) {
        assert.equal(name, 'mp_solver_validate_solver_specific_parameters');
        assert.equal(args[0], 2); assert.equal(options.async, true);
        assert.deepEqual(heap.slice(args[1], args[1] + args[2]), new TextEncoder().encode(validation.parameters));
        return nativeAccepted;
      },
    };
    (globalThis as Record<string, unknown>).__mpSolverValidationModule = validationModule;
    for (const accepted of [1, 0]) {
      nativeAccepted = accepted;
      assert.equal(await solver.setSolverSpecificParametersAsString(validation.parameters, {executor:'direct'}), accepted === 1);
      assert.equal(solver.getSolverSpecificParametersAsString(), validation.parameters);
      assert.equal(allocations.size, 0);
    }
    nativeAccepted = -1;
    await assert.rejects(solver.setSolverSpecificParametersAsString(validation.parameters, {executor:'direct'}), /unavailable/);
    assert.equal(allocations.size, 0);
    assert.equal(solver.getSolverSpecificParametersAsString(), validation.parameters);
    await assert.rejects(solver.setSolverSpecificParametersAsString(1), /must be a string/);
    delete (globalThis as Record<string, unknown>).__mpSolverValidationModule;

    for (const fail of [false, true]) {
      const calls: Array<[string, number[]]> = [];
      const freed: number[] = [];
      let nextPointer = 8;
      const module = {
        HEAPU8: new Uint8Array(128),
        _malloc(size: number) { const pointer = nextPointer; nextPointer += size; return pointer; },
        _free(pointer: number) { freed.push(pointer); },
        ccall(name: string, _returnType: unknown, _types: unknown, args: number[]) {
          calls.push([name, args]);
          if (name === 'mp_solver_last_solve_metadata') return '{}';
        if (name === 'mp_solver_parameters_create') return 7;
          if (name === 'mp_solver_solve_model_request_with_parameters') {
            assert.deepEqual(args.slice(0, 5), [8, 1, 1, 7, 0]);
            if (fail) throw new Error('native failure');
            return 0;
          }
          return undefined;
        },
      };
      const executor = new DirectMpSolverExecutor(async () => module);
      const job = executor.execute(decoded, { onEvent: () => {} });
      if (fail) await assert.rejects(job.result, /native failure/);
      else await job.result;
      for (const [key, value] of Object.entries(operation.parameters.doubleParams)) {
        assert.ok(calls.some(([name, args]) => name === 'mp_solver_parameters_set_double_param'
          && JSON.stringify(args) === JSON.stringify([7, Number(key), value])));
      }
      for (const [key, value] of Object.entries(operation.parameters.integerParams)) {
        assert.ok(calls.some(([name, args]) => name === 'mp_solver_parameters_set_integer_param'
          && JSON.stringify(args) === JSON.stringify([7, Number(key), value])));
      }
      assert.deepEqual(calls[calls.length - 1], ['mp_solver_parameters_delete', [7]]);
      assert.ok(freed.includes(8));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('native solution verification transports false results and frees both snapshots on rejection', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-verification-', import.meta.url)));
  try {
    const outfile = `${directory}/executor.mjs`;
    await build({
      stdin: {
        contents: `export { DirectMpSolverExecutor } from './direct_executor.ts'; export { mpSolverProtocol } from './protocol.ts';`,
        resolveDir: fileURLToPath(new URL('../lib/mp_solver', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'unused-runtime', setup(builder) {
        builder.onResolve({ filter: /runtime_loader\.js$/ }, () => ({ path: 'runtime', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function loadMPSolverRuntime() { throw new Error("unused"); }' }));
      } }],
    });
    const { DirectMpSolverExecutor, mpSolverProtocol } = await import(outfile);
    for (const nativeResult of [1, 0, -1, 'throw', 'allocation']) {
      const operation = { type: 'verifySolution', model: Uint8Array.of(1, 2), solution: Uint8Array.of(3, 4, 5),
        solverType: 2, tolerance: -1, logErrors: true };
      assert.deepEqual(mpSolverProtocol.decodeRequest(mpSolverProtocol.encodeRequest(operation)), operation);
      let nextPointer = 8;
      const allocated = new Set<number>();
      const module = { HEAPU8: new Uint8Array(64),
        _malloc(size: number) {
          if (nativeResult === 'allocation' && allocated.size) throw new Error('allocation failed');
          const pointer = nextPointer; nextPointer += size; allocated.add(pointer); return pointer;
        },
        _free(pointer: number) { assert.ok(allocated.delete(pointer)); },
        ccall(name: string, _return: unknown, _types: unknown, args: number[], options?: { async?: boolean }) {
          if (name === 'mp_solver_last_verification_error') return 'native loader diagnostic';
          assert.equal(name, 'mp_solver_verify_solution_proto');
          assert.equal(options?.async, true);
          assert.deepEqual(args.slice(4), [2, -1, 1]);
          assert.deepEqual(module.HEAPU8.slice(args[0], args[0] + args[1]), operation.model);
          assert.deepEqual(module.HEAPU8.slice(args[2], args[2] + args[3]), operation.solution);
          if (nativeResult === 'throw') throw new Error('native failure');
          return nativeResult;
        },
      };
      const executor = new DirectMpSolverExecutor(async () => module);
      const job = executor.execute(operation, { onEvent() {} });
      if (typeof nativeResult === 'string' || nativeResult === -1) await assert.rejects(job.result, /native loader diagnostic|native failure|allocation failed/);
      else {
        const result = { type: 'verifySolution', verified: nativeResult === 1 };
        assert.deepEqual(await job.result, result);
        assert.deepEqual(mpSolverProtocol.decodeResult(mpSolverProtocol.encodeResult(result)), result);
      }
      assert.equal(allocated.size, 0);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
