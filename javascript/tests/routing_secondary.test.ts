import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function bundled() {
  const output = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)), contents: `
    export { routingProtocol } from './routing/protocol.ts';
    export { encodeRoutingSearchParameters } from './routing/search_parameters.ts';
    export { solveRoutingWithModule } from './routing/native_runtime.ts';
  ` }, bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
}

test('routing secondary model snapshots preserve independent parameters, matrices and exact costs', async () => {
  const { routingProtocol, encodeRoutingSearchParameters } = await bundled();
  const base = { numLocations: 2, numVehicles: 1, starts: [0], ends: [0],
    transitMatrix: new BigInt64Array(9), transitMatrixDimension: 3, operations: [], dimensionNames: [] };
  const parent = encodeRoutingSearchParameters({ firstSolutionOptimizationPeriod: 1, firstSolutionStrategy: 9 });
  const child = encodeRoutingSearchParameters({ solutionLimit: 9007199254740993n, timeLimit: { nanos: 0 }, satParameters: { numWorkers: 0 } });
  const request = { ...base, searchParametersProto: parent.proto, searchParameterFields: parent.fields,
    secondaryModel: { ...base, transitMatrix: new BigInt64Array(9).fill(-9007199254740993n),
      searchParametersProto: child.proto, searchParameterFields: child.fields,
      operations: [{ type: 'setFixedVehicleCost', vehicle: 0, cost: 9007199254740993n }] } };
  const restored = routingProtocol.decodeRequest(routingProtocol.encodeRequest({ type: 'solve', interruptible: true, request })).request;
  assert.deepEqual(restored.searchParametersProto, parent.proto);
  assert.deepEqual(restored.secondaryModel.searchParametersProto, child.proto);
  assert.deepEqual(restored.secondaryModel.searchParameterFields, child.fields);
  assert.deepEqual(restored.secondaryModel.transitMatrix, request.secondaryModel.transitMatrix);
  assert.equal(restored.secondaryModel.operations[0].vehicle, 0);
  assert.equal(restored.secondaryModel.operations[0].cost, 9007199254740993n);
});

test('routing secondary-model binding failure frees both models in primary-first order', async () => {
  const { solveRoutingWithModule } = await bundled();
  const allocations = new Set<number>(), deleted: number[] = [];
  let next = 8, managers = 0, models = 0;
  const module = {
    HEAPU8: new Uint8Array(1 << 20),
    _malloc(size: number) { const ptr = next; next += (size + 7) & ~7; allocations.add(ptr); return ptr; },
    _free(ptr: number) { if (ptr) assert(allocations.delete(ptr), `unowned allocation ${ptr}`); },
    ccall(name: string, _result: unknown, _types: unknown, args: number[]) {
      if (name === 'routing_create_index_manager_starts_ends') return ++managers;
      if (name === 'routing_create_model') return ++models;
      if (name === 'routing_register_matrix_transit_callback') return 1;
      if (name === 'routing_set_arc_cost_evaluator_of_all_vehicles') return 1;
      if (name === 'routing_set_secondary_model') return 0;
      if (name === 'routing_last_search_parameter_error') return 'bad secondary parameters';
      if (name === 'routing_delete_model') { deleted.push(args[0]); return; }
      if (name === 'routing_delete_index_manager') return;
      throw new Error(`Unexpected native call: ${name}`);
    },
  };
  const child = { numLocations: 2, numVehicles: 1, starts: [0], ends: [0], searchParametersProto: new Uint8Array(),
    operations: [], dimensionNames: [], transitMatrix: new BigInt64Array(9), transitMatrixDimension: 3 };
  await assert.rejects(() => solveRoutingWithModule(module, { ...child, secondaryModel: child }), /bad secondary parameters/);
  assert.deepEqual(deleted, [1, 2]);
  assert.equal(allocations.size, 0);
});
