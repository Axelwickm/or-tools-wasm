import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

// Relevant wire fields from math_opt/{rpc,result,solution,sparse_containers}.proto.
const responseType = protobuf.parse(`syntax = "proto3";
  message Vector { repeated int64 ids = 1; repeated double values = 2; }
  message Primal { Vector variable_values = 1; double objective_value = 2; int32 feasibility_status = 3; }
  message Solution { Primal primal_solution = 1; }
  message Result { repeated Solution solutions = 3; }
  message Response { Result result = 1; }
`).root.lookupType('Response');

test('MathOpt result accessors and deferred incremental initialization failures', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-result-', import.meta.url)));
  const responses: Uint8Array[] = [];
  (globalThis as Record<string, unknown>).__mathoptResultResponses = responses;
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL('../lib/mathopt.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'mathopt-response', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectMathOptExecutor {
            execute() {
              return { result: Promise.resolve({ response: globalThis.__mathoptResultResponses.shift() }) };
            }
          }
        ` }));
      } }],
    });
    const { MathOpt, MathOptIncrementalSolver, MathOptSolverType } = await import(outfile);
    const incremental = new MathOptIncrementalSolver(MathOpt.Model(), MathOptSolverType.GLOP, {
      executor: { type: 'server', url: 'http://unused.invalid', fetch: async () => {
        throw new Error('initialization unavailable');
      } },
    });
    // node:test fails on an unhandled rejection during this delay.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await assert.rejects(incremental.solve(), /initialization unavailable/);
    await incremental.close();
    let createRequests = 0;
    const unused = new MathOptIncrementalSolver(MathOpt.Model(), MathOptSolverType.GLOP, {
      executor: { type: 'server', url: 'http://unused.invalid', fetch: async () => {
        createRequests++;
        throw new Error('initialization unavailable');
      } },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const closing = unused.close();
    assert.equal(unused.close(), closing, 'concurrent close calls share cleanup');
    await closing;
    await unused.close();
    assert.equal(createRequests, 1, 'failed creation has no handle to delete');
    await assert.rejects(unused.solve(), /closed/);
    const model = MathOpt.Model();
    const x = model.addVariable({ name: 'x' });
    for (const statuses of [[], [0], [1], [3], [2], [3, 2]]) {
      const solutions = statuses.map((feasibilityStatus, index) => ({ primalSolution: {
        feasibilityStatus, objectiveValue: index + 5,
        variableValues: { ids: [x.id], values: [index + 5] },
      } }));
      responses.push(responseType.encode(responseType.create({ result: { solutions } })).finish());
      const result = await MathOpt.solve(model, { executor: 'direct' });
      const feasibleIndex = statuses.indexOf(2);
      assert.equal(result.hasSolution, feasibleIndex !== -1);
      assert.equal(result.solutions.length, statuses.length);
      if (feasibleIndex === -1) {
        assert.equal(result.objectiveValue, null);
        assert.deepEqual(result.variableValuesById, {});
        assert.throws(() => result.value(x), /no feasible solution/);
      } else {
        assert.equal(result.objectiveValue, feasibleIndex + 5);
        assert.equal(result.value(x), feasibleIndex + 5);
        assert.throws(() => result.value(MathOpt.Model().addVariable()), /different MathOpt model/);
      }
    }
  } finally {
    delete (globalThis as Record<string, unknown>).__mathoptResultResponses;
    await rm(directory, { recursive: true, force: true });
  }
});
