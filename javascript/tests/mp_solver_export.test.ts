import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

test('native model queries capture snapshots, forward options and release buffers on failure', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-query-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { contents: `export * from './api.ts'; export {mpSolverProtocol} from './protocol.ts';`,
      resolveDir: fileURLToPath(new URL('../lib/mp_solver/', import.meta.url)) }, outfile,
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'query-module', setup(builder) {
        builder.onResolve({ filter: /runtime_loader\.js$/ }, () => ({ path: 'module', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents:
          'export async function loadMPSolverRuntime(){return globalThis.__mpQueryModule;}' }));
      } }] });
    const { MPSolver, mpSolverProtocol } = await import(outfile);
    const schema = await readFile(new URL('../../ortools/linear_solver/linear_solver.proto', import.meta.url), 'utf8');
    const optional = await readFile(new URL('../../ortools/util/optional_boolean.proto', import.meta.url), 'utf8');
    const root = protobuf.parse(optional).root; protobuf.parse(schema, root); root.resolveAll();
    const models: Array<Record<string, unknown>> = [];
    const requests: Array<{ type: string; format?: string; obfuscate?: boolean; fixedFormat?: boolean; solution?: Uint8Array; editableSnapshot?: boolean }> = [];
    const allocated = new Set<number>(); let pointer = 8; let fail = false;
    const module = {
      HEAPU8: new Uint8Array(65536),
      _malloc(size: number) { const result = pointer; pointer += Math.max(4, Math.ceil(size / 4) * 4); allocated.add(result); return result; },
      _free(value: number) { if (value) assert.ok(allocated.delete(value)); },
      ccall(name: string, _return: unknown, _types: unknown, args: number[], options?: { async?: boolean }) {
        if (name === 'get_linear_solver_schema') return schema;
        if (name === 'get_optional_boolean_schema') return optional;
        if (name === 'mp_solver_backend_versions') return '{"2":"native-test"}';
        if (name === 'mp_solver_bridge_error') return 'native query failed';
        assert.ok(name === 'mp_solver_model_query_request' || name === 'mp_solver_solve_bridge_request');
        assert.equal(options?.async, true); assert.equal(args.length, name === 'mp_solver_model_query_request' ? 3 : 4);
        const operation = mpSolverProtocol.decodeRequest(module.HEAPU8.slice(args[0], args[0] + args[1]));
        requests.push(operation);
        if (operation.type !== 'solve') {
          const type = root.lookupType('operations_research.MPModelProto');
          models.push(type.toObject(type.decode(operation.model)));
        }
        if (fail) return 0;
        const result = mpSolverProtocol.encodeResult(operation.type === 'solve'
          ? { type: 'solve', response: root.lookupType('operations_research.MPSolutionResponse').encode({ status: 0 }).finish() }
          : operation.type === 'loadSolution' ? { type: 'loadSolution', loaded: true, solution: operation.solution }
          : operation.type === 'exportModel' ? { type: 'exportModel', text: 'native export result' }
          : { type: 'activities', activities: [19] });
        const resultPointer = module._malloc(result.length); module.HEAPU8.set(result, resultPointer);
        new DataView(module.HEAPU8.buffer).setUint32(args[2], result.length, true);
        return resultPointer;
      },
    };
    (globalThis as Record<string, unknown>).__mpQueryModule = module;
    const solver = new MPSolver('captured', MPSolver.GLOP_LINEAR_PROGRAMMING);
    const x = solver.addNumVariable(0, 4, 'x'); const row = solver.addConstraint(0, Infinity, 'row'); row.setCoefficient(x, 3);
    const execution = { executor: 'direct' as const };
    const exporting = solver.exportModelAsMpsFormat(true, true, execution);
    assert.ok(exporting instanceof Promise); x.setUpperBound(7);
    assert.equal(await exporting, 'native export result');
    assert.equal((models[0].variable as Array<{ upperBound: number }>)[0].upperBound, 4);
    assert.deepEqual({ format: requests[0].format, obfuscate: requests[0].obfuscate, fixedFormat: requests[0].fixedFormat },
      { format: 'mps', obfuscate: true, fixedFormat: true });
    assert.equal(await solver.exportModelAsLpFormat(false, execution), 'native export result');
    assert.equal(requests[1].format, 'lp');
    assert.equal(await solver.loadSolutionFromProto({ status: 0, objectiveValue: 0, variableValue: [2] }, Infinity, execution), true);
    const activities = solver.computeConstraintActivities(execution); solver.clear();
    assert.deepEqual(await activities, [19], 'Activities come from the native reply, independently of local arithmetic');
    const responseType = root.lookupType('operations_research.MPSolutionResponse');
    assert.deepEqual(responseType.toObject(responseType.decode(requests[3].solution!)).variableValue, [2]);
    assert.equal((models[3].variable as unknown[]).length, 1);
    assert.deepEqual(await solver.computeConstraintActivities(execution), [], 'An unsolved model has no native activities');
    assert.equal(requests.length, 4);
    fail = true;
    await assert.rejects(() => solver.exportModelAsLpFormat(false, execution), /native query failed/);
    assert.equal(allocated.size, 0, 'Request, length and response buffers are freed on both success and failure');
    fail = false; assert.equal(await solver.exportModelAsLpFormat(false, execution), 'native export result');
    assert.equal(allocated.size, 0);
    await solver.solveWithProto({ ...execution, loadSolution: false });
    assert.equal(requests[requests.length - 1]?.type, 'solve');
    assert.equal(requests[requests.length - 1]?.editableSnapshot, true,
      'Non-streaming editable solves use the binary bridge and preserve construction semantics');
    assert.equal(allocated.size, 0);
  } finally {
    delete (globalThis as Record<string, unknown>).__mpQueryModule;
    await rm(directory, { recursive: true, force: true });
  }
});
