import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

test('MPSolver.solve(MpModel) uses the existing serializer and owns its result', async () => {
  const linearSolverProtoSchema = await readFile(new URL('../../ortools/linear_solver/linear_solver.proto', import.meta.url), 'utf8');
  const optionalBooleanProtoSchema = await readFile(new URL('../../ortools/util/optional_boolean.proto', import.meta.url), 'utf8');
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-result-', import.meta.url)));
  const responses: Uint8Array[] = [];
  const operations: unknown[] = [];
  const globalKey = '__mpResultTest' as const;
  (globalThis as Record<string, unknown>)[globalKey] = { responses, operations };
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL('../lib/mp-solver.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'mp-executor', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'mp-executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectMpSolverExecutor {
            execute(operation) {
              if (operation.type === 'schema') return { result: Promise.resolve(${JSON.stringify({ type: 'schema', linearSolverProtoSchema, optionalBooleanProtoSchema })}) };
              const test = globalThis.${globalKey};
              test.operations.push(operation);
              return { result: Promise.resolve({ type: 'solve', response: test.responses.shift() }) };
            }
          }
        ` }));
      } }],
    });
    const { MpModel, MPSolver, MPSolverResultStatus } = await import(outfile);
    const model = new MpModel('test');
    const x = model.addNumVariable(0, 10, 'x');
    model.objective().setCoefficient(x, 1);
    model.objective().setMaximization();
    const constraint = model.addConstraint(0, 10, 'limit');
    constraint.setCoefficient(x, 1);
    const other = new MpModel().addNumVariable(0, 10, 'other');
    for (const value of [3, 7]) {
      responses.push(await MPSolver.createSolutionResponse({
        status: 0, objectiveValue: value, variableValue: [value],
        reducedCost: [0.2], dualValue: [0.1],
      }, { executor: 'direct' }));
    }
    const first = await MPSolver.solve(model, {
      executor: 'direct', threads: 2, parameters: { primalTolerance: 1e-8 },
    });
    const second = await MPSolver.solve(model, { executor: 'direct' });
    assert.equal(first.status, MPSolverResultStatus.OPTIMAL);
    assert.equal(first.value(x), 3);
    assert.equal(second.value(x), 7);
    assert.equal(first.value(x), 3);
    assert.equal(first.dualValue(constraint), 0.1);
    assert.equal(first.reducedCost(x), 0.2);
    assert.throws(() => first.value(other), /different MPSolver model/);
    assert.throws(() => first.value(model.addNumVariable(0, 1, 'later')), /added after this solve/);
    const response = first.response;
    response.variableValue[0] = 99;
    assert.equal(first.value(x), 3);
    const firstOperation = operations[0] as { request: Uint8Array; numThreads: number; parameters: { doubleParams: Record<string, number> } };
    assert.equal(firstOperation.numThreads, 2);
    assert.equal(firstOperation.parameters.doubleParams['1'], 1e-8);
    const root = protobuf.parse(linearSolverProtoSchema).root;
    protobuf.parse(optionalBooleanProtoSchema, root);
    const request = root.lookupType('operations_research.MPModelRequest')
      .decode(firstOperation.request) as unknown as { model: { variable: Array<{ objectiveCoefficient: number }>; constraint: Array<{ varIndex: number[] }> } };
    assert.equal(request.model.variable[0].objectiveCoefficient, 1);
    assert.deepEqual(request.model.constraint[0].varIndex, [0]);
  } finally {
    delete (globalThis as Record<string, unknown>)[globalKey];
    await rm(directory, { recursive: true, force: true });
  }
});
