import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('MPSolver schema failures are retryable and decoded responses round-trip', async (t) => {
  const linearSolverProtoSchema = await readFile(new URL('../../ortools/linear_solver/linear_solver.proto', import.meta.url), 'utf8');
  const optionalBooleanProtoSchema = await readFile(new URL('../../ortools/util/optional_boolean.proto', import.meta.url), 'utf8');
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-serialization-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: {
        contents: `export * from './api.ts';
          export { mpSolverProtocol } from './protocol.ts';
          export { encodeSolverBridgeResult } from '../solver_bridge.ts';`,
        resolveDir: fileURLToPath(new URL('../lib/mp_solver/', import.meta.url)),
      },
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      plugins: [{
        name: 'schema-only-executor',
        setup(builder) {
          builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'schema-executor', namespace: 'test' }));
          builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: `export class DirectMpSolverExecutor {
              execute(operation) {
                if (operation.type === 'solve') throw new Error('solve parameters: ' + JSON.stringify(operation.parameters));
                if (operation.type !== 'schema') throw new Error('Unexpected solver execution');
                return { result: Promise.resolve(${JSON.stringify({ type: 'schema', linearSolverProtoSchema, optionalBooleanProtoSchema })}) };
              }
            }`,
          }));
        },
      }],
    });
    for (const malformed of [false, true]) {
      await t.test(malformed ? 'malformed schema can be replaced on retry' : 'same server recovers and caches a successful load', async () => {
        const { MPSolver: API, mpSolverProtocol, encodeSolverBridgeResult } = await import(`${outfile}?malformed=${malformed}`);
        let requests = 0;
        const server = { executor: { type: 'server', url: 'http://unused.invalid', fetch: async () => {
          requests++;
          if (requests === 1 && !malformed) throw new TypeError('offline');
          const bytes = mpSolverProtocol.encodeResult({
            type: 'schema', optionalBooleanProtoSchema,
            linearSolverProtoSchema: requests === 1 ? 'not a protobuf schema' : linearSolverProtoSchema,
          });
          return new Response(encodeSolverBridgeResult(1, 'mp-solver', bytes));
        } } };
        await assert.rejects(API.createModelRequest({}, server));
        const results = await Promise.all(Array.from({ length: 4 }, () => API.createModelRequest({}, server)));
        assert.equal(requests, 2, 'concurrent retries share one successful schema load');
        for (const result of results) assert.ok(result instanceof Uint8Array);
        await API.createModelRequest({}, server);
        await API.createSolutionResponse({}, server);
        assert.equal(requests, 2, 'successful schema remains cached');
      });
    }
    const { MPSolver, MPSolverParameters, DoubleParam, IntegerParam, PresolveValues } = await import(outfile);
    const options = { executor: 'direct' };
    const solver = new MPSolver('validation', MPSolver.GLOP_LINEAR_PROGRAMMING);
    let attempts = 0;
    const offline = { executor: { type: 'server', url: 'http://unused.invalid', fetch: async () => {
      attempts++;
      throw new Error('schema unavailable');
    } } };
    for (let attempt = 1; attempt <= 2; attempt++) {
      const operations = [
        MPSolver.getLinearSolverSchemas(offline),
        MPSolver.createModelRequest({}, offline),
        MPSolver.createSolutionResponse({}, offline),
        solver.exportModelProto(offline),
      ];
      await Promise.all(operations.map((operation) => assert.rejects(operation, /schema unavailable/)));
      assert.equal(attempts, attempt, 'concurrent requests share a load, but failure allows retry');
    }
    // A different executor must also recover every dependent schema/type cache.
    await MPSolver.getLinearSolverSchemas(options);
    await MPSolver.createModelRequest({}, options);
    await MPSolver.createSolutionResponse({}, options);
    await solver.exportModelProto(options);
    const x = solver.addNumVariable(0, 1, 'x');
    const parameters = new MPSolverParameters();
    parameters.setDoubleParam(DoubleParam.PRIMAL_TOLERANCE, 0.001);
    parameters.setIntegerParam(IntegerParam.PRESOLVE, PresolveValues.PRESOLVE_OFF);
    const expectedParameters = {
      doubleParams: { [DoubleParam.PRIMAL_TOLERANCE]: 0.001 },
      integerParams: { [IntegerParam.PRESOLVE]: PresolveValues.PRESOLVE_OFF },
    };
    for (const solve of [
      () => solver.solve({ ...options, parameters }),
      () => solver.solveWithProto({ ...options, parameters }),
      () => MPSolver.solveModelRequest({ model: {} }, { ...options, parameters }),
    ]) {
      await assert.rejects(solve(), { message: 'solve parameters: ' + JSON.stringify(expectedParameters) });
    }
    parameters.reset();
    await assert.rejects(solver.solve({ ...options, parameters }), {
      message: 'solve parameters: ' + JSON.stringify({ doubleParams: {}, integerParams: {} }),
    });
    await assert.rejects(solver.solve(options), { message: 'solve parameters: undefined' });
    const other = new MPSolver('other', MPSolver.GLOP_LINEAR_PROGRAMMING);
    const foreign = other.addNumVariable(0, 1, 'foreign');
    const constraint = solver.addConstraint(0, 1, 'constraint');
    for (const operation of [
      () => solver.objective().setCoefficient(foreign, 7),
      () => solver.objective().getCoefficient(foreign),
      () => constraint.setCoefficient(foreign, 7),
      () => constraint.getCoefficient(foreign),
      () => solver.setHint([foreign], [1]),
    ]) assert.throws(operation, /different MPSolver model/);
    assert.equal(solver.objective().getCoefficient(x), 0);
    assert.equal(constraint.getCoefficient(x), 0);
    solver.objective().setCoefficient(x, 2);
    solver.objective().setOffset(1);
    const solution = { status: 0, variableValue: [0.5], objectiveValue: 2 };
    assert.equal(await solver.loadSolutionFromProto(solution, 1e-7), true);
    assert.equal(solver.verifySolution(1e-7, false), true);
    for (const variableValue of [[], [0.5, 0.5], [2], [NaN]]) {
      assert.equal(await solver.loadSolutionFromProto({ ...solution, variableValue }, 1e-7), false);
      assert.equal(x.solutionValue(), 0.5, 'invalid imports preserve the previous solution');
    }
    assert.equal(await solver.loadSolutionFromProto({ ...solution, status: 2 }, 1e-7), false);
    assert.equal(await solver.loadSolutionFromProto({ ...solution, variableValue: [1 + 1e-8], objectiveValue: 3 + 2e-8 }, 1e-7), true);
    assert.equal(solver.verifySolution(1e-7, false), true);
    assert.equal(await solver.loadSolutionFromProto({ ...solution, variableValue: [2] }, Infinity), true);
    assert.equal(solver.verifySolution(1e-7, false), false);
    for (const objectiveValue of [999, NaN]) {
      assert.equal(await solver.loadSolutionFromProto({ ...solution, objectiveValue }, 1e-7), true);
      assert.equal(solver.verifySolution(1e-7, false), false);
    }
    assert.equal(await solver.loadSolutionFromProto({ ...solution, objectiveValue: 2 + 1e-8 }, 1e-7), true);
    assert.equal(solver.verifySolution(1e-7, false), true);
    const invalidBytes = await MPSolver.createSolutionResponse({ ...solution, variableValue: [] }, options);
    assert.equal(await solver.loadSolutionFromProto(invalidBytes, 1e-7, options), false);
    const bytes = await MPSolver.createSolutionResponse({
      status: 0,
      statusStr: 'optimal',
      objectiveValue: 1.5,
      variableValue: [0.5, 1],
      solverSpecificInfo: Uint8Array.of(0, 255),
      additionalSolutions: [{ objectiveValue: 2.5, variableValue: [1.5, 1] }],
    }, options);
    const decoded = await MPSolver.decodeSolutionResponse(bytes, options);
    assert.equal(decoded.status, 'MPSOLVER_OPTIMAL');
    const reencoded = await MPSolver.createSolutionResponse(decoded, options);
    assert.deepEqual(await MPSolver.decodeSolutionResponse(reencoded, options), decoded);
    await assert.rejects(MPSolver.createSolutionResponse({ status: 'NOT_A_STATUS' }, options), /Unknown .* enum name/);
    await assert.rejects(MPSolver.createSolutionResponse({ status: 123456 }, options), /enum value expected/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
