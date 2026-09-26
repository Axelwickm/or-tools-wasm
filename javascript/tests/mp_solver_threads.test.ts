import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('MPSolver validates thread counts and forwards valid counts unchanged', async () => {
  const linearSolverProtoSchema = await readFile(new URL('../../ortools/linear_solver/linear_solver.proto', import.meta.url), 'utf8');
  const optionalBooleanProtoSchema = await readFile(new URL('../../ortools/util/optional_boolean.proto', import.meta.url), 'utf8');
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-threads-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL('../lib/mp_solver/api.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{
        name: 'thread-count-executor',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
          builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: `export class DirectMpSolverExecutor {
              execute(operation, options) {
                if (operation.type === 'solve') throw new Error('threads: ' + operation.numThreads + ', resources: ' + options.resources.threads);
                if (operation.type !== 'schema') throw new Error('Unexpected operation');
                return { result: Promise.resolve(${JSON.stringify({ type: 'schema', linearSolverProtoSchema, optionalBooleanProtoSchema })}) };
              }
            }`,
          }));
        },
      }],
    });
    const { MPSolver } = await import(outfile);
    const invalidCounts = [0, -1, 1.5, NaN, Infinity, 2 ** 31, Number.MAX_SAFE_INTEGER, null, '2'];
    for (const numThreads of invalidCounts) {
      await assert.rejects(MPSolver.solveModelRequest({}, { executor: 'direct', numThreads }), {
        name: 'RangeError', message: 'numThreads must be a positive signed 32-bit integer.',
      });
    }
    for (const numThreads of [undefined, 1, 2, 0x7fffffff]) {
      const expected = numThreads ?? 1;
      await assert.rejects(MPSolver.solveModelRequest({}, { executor: 'direct', numThreads }), {
        message: `threads: ${expected}, resources: ${expected}`,
      });
    }
    const solver = MPSolver.createSolver('SCIP');
    assert.ok(solver);
    assert.equal(solver.setNumThreads(2), true);
    for (const numThreads of invalidCounts) {
      assert.equal(solver.setNumThreads(numThreads), false);
      assert.equal(solver.getNumThreads(), 2);
    }
    assert.equal(solver.setNumThreads(0x7fffffff), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
