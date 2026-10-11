import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { routingParametersDescriptor } from '../lib/generated/routing_schemas.ts';

async function bundled() {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-parameters-', import.meta.url)));
  const outfile = `${directory}/parameters.mjs`;
  await build({ stdin: { contents: `export * from './routing/search_parameters.ts'; export { routingProtocol } from './routing/protocol.ts'; export { solveRoutingWithModule } from './routing/native_runtime.ts';`, resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) }, outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  return { directory, module: await import(outfile) };
}

test('routing parameters preserve nested imports, explicit zero/false, empty arrays and int64', async () => {
  const { directory, module } = await bundled();
  try {
    const parameters = { solutionLimit: 2147483648n, firstSolutionStrategy: 'SAVINGS', localSearchMetaheuristic: 'GUIDED_LOCAL_SEARCH', timeLimit: { seconds: 0n, nanos: 100000000 }, localSearchOperators: { useCross: 0, useTwoOpt: 'BOOL_FALSE' }, localSearchMetaheuristics: [], globalCheapestInsertionLsOperatorParameters: { useNeighborsRatioForInitialization: false }, satParameters: { maxTimeInSeconds: 1, randomSeed: 17, noOverlap2dBooleanRelationsLimit: 7, subsolverParams: [{ name: 'nested', useEnergeticReasoningInNoOverlap2d: true }] }, iteratedLocalSearchParameters: { improvePerturbedSolution: false } };
    const encoded = module.encodeRoutingSearchParameters(parameters);
    const type = protobuf.Root.fromJSON(routingParametersDescriptor).lookupType('operations_research.RoutingSearchParameters');
    const decoded = type.toObject(type.decode(encoded.proto), { longs: String, enums: String, defaults: true, arrays: true });
    assert.equal(decoded.solutionLimit, '2147483648');
    assert.equal(decoded.timeLimit.seconds, '0');
    assert.equal(decoded.localSearchOperators.useCross, 'BOOL_UNSPECIFIED');
    assert.equal(decoded.globalCheapestInsertionLsOperatorParameters.useNeighborsRatioForInitialization, false);
    assert.equal(decoded.satParameters.randomSeed, 17);
    assert.equal(decoded.satParameters.noOverlap_2dBooleanRelationsLimit, 7);
    assert.equal(decoded.satParameters.subsolverParams[0].useEnergeticReasoningInNoOverlap_2d, true);
    assert.ok(encoded.fields.includes('satParameters.noOverlap2dBooleanRelationsLimit'));
    assert.ok(encoded.fields.includes('satParameters.subsolverParams'));
    assert.ok(encoded.fields.includes('localSearchMetaheuristics'));
    assert.ok(encoded.fields.includes('iteratedLocalSearchParameters.improvePerturbedSolution'));
    const operation = { type: 'solve', interruptible: false, request: { numLocations: 2, numVehicles: 1, starts: [0], ends: [0], transitMatrix: new BigInt64Array(9), transitMatrixDimension: 3, operations: [], dimensionNames: [], searchParametersProto: encoded.proto, searchParameterFields: encoded.fields } };
    const restored = module.routingProtocol.decodeRequest(module.routingProtocol.encodeRequest(operation));
    assert.deepEqual(restored.request.searchParametersProto, encoded.proto);
    assert.deepEqual(restored.request.searchParameterFields, encoded.fields);
    assert.equal(type.toObject(type.decode(restored.request.searchParametersProto), { longs: String }).solutionLimit, '2147483648');
    assert.equal('solutionLimit' in restored.request, false);
    assert.equal('firstSolutionStrategy' in restored.request, false);
    assert.throws(() => module.encodeRoutingSearchParameters({ localSearchOperators: { madeUpOperator: true } }), /Unknown.*madeUpOperator/);
    assert.throws(() => module.encodeRoutingSearchParameters({ timeLimit: { seconds: Number.MAX_SAFE_INTEGER + 1 } }), /safe integer/);
    assert.throws(() => module.encodeRoutingSearchParameters({ localSearchMetaheuristic: 'NOT_A_STRATEGY' }), /Unknown.*enum/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('routing native solve passes complete parameter payload and releases memory on validation failure', async () => {
  const { directory, module } = await bundled();
  try {
    const encoded = module.encodeRoutingSearchParameters({ localSearchOperators: { useCross: 0 } });
    const allocations = new Set<number>(); let pointer = 16; let passed = false;
    const wasm = { HEAPU8: new Uint8Array(4096), _malloc(size: number) { const p = pointer; pointer += Math.max(size, 8); allocations.add(p); return p; }, _free(p: number) { assert.ok(allocations.delete(p)); }, ccall(name: string, _return: unknown, _types: unknown, args: number[], options?: { async?: boolean }) {
      if (name === 'routing_create_index_manager_starts_ends') return 1;
      if (name === 'routing_create_model') return 2;
      if (name === 'routing_register_matrix_transit_callback') return 0;
      if (name === 'routing_set_arc_cost_evaluator_of_all_vehicles' || name === 'routing_capture_assignment_variables') return 1;
      if (name === 'routing_solve_with_parameters_proto') { passed = true; assert.deepEqual(this.HEAPU8.slice(args[1], args[1]+args[2]), encoded.proto); return -1; }
      if (name === 'routing_last_search_parameter_error') { assert.equal(options?.async, undefined); return 'use_cross is invalid'; }
      if (name === 'routing_delete_model' || name === 'routing_delete_index_manager') return;
      throw new Error(`Unexpected native call ${name}`);
    } };
    await assert.rejects(module.solveRoutingWithModule(wasm, { numLocations: 2, numVehicles: 1, starts: [0], ends: [0], transitMatrix: new BigInt64Array(9), transitMatrixDimension: 3, operations: [], dimensionNames: [], searchParametersProto: encoded.proto, searchParameterFields: encoded.fields }), /use_cross is invalid/);
    assert.equal(passed, true);
    assert.equal(allocations.size, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
