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
        contents: `export { DirectMpSolverExecutor } from './direct_executor.ts';
          export { mpSolverProtocol } from './protocol.ts';`,
        resolveDir: fileURLToPath(new URL('../lib/mp_solver', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{
        name: 'unused-runtime-loader',
        setup(builder) {
          builder.onResolve({ filter: /runtime_loader\.js$/ }, () => ({ path: 'runtime', namespace: 'test' }));
          builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: 'export function loadMPSolverRuntime() { throw new Error("Unexpected runtime load"); }',
          }));
        },
      }],
    });
    const { DirectMpSolverExecutor, mpSolverProtocol } = await import(outfile);
    const operation = {
      type: 'solve', request: Uint8Array.of(1), numThreads: 1, interruptible: false,
      parameters: { doubleParams: { 0: 0.125, 1: 0.001, 2: 0.002 }, integerParams: { 1000: 0, 1001: 11, 1002: 0, 1003: 1 } },
    };
    const decoded = mpSolverProtocol.decodeRequest(mpSolverProtocol.encodeRequest(operation));
    assert.deepEqual({ ...decoded.parameters.doubleParams }, operation.parameters.doubleParams);
    assert.deepEqual({ ...decoded.parameters.integerParams }, operation.parameters.integerParams);
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
