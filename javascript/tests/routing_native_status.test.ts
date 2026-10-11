import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('Routing reads unsuccessful native status before deleting the model', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.routing-native-', import.meta.url)));
  try {
    const outfile = `${directory}/runtime.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL('../lib/routing/native_runtime.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
    });
    const { solveRoutingWithModule } = await import(outfile);
    for (const status of [3, 4, 5, 6]) {
      const calls: string[] = [];
      const allocations = new Set<number>();
      let nextPointer = 8;
      let deleted = false;
      const module = {
        HEAPU8: new Uint8Array(1024),
        _malloc(size: number) {
          const pointer = nextPointer;
          nextPointer += Math.max(size, 8);
          allocations.add(pointer);
          return pointer;
        },
        _free(pointer: number) { assert.equal(allocations.delete(pointer), true); },
        ccall(name: string) {
          calls.push(name);
          switch (name) {
            case 'routing_create_index_manager_starts_ends': return 1;
            case 'routing_create_model': return 2;
            case 'routing_register_matrix_transit_callback': return 0;
            case 'routing_set_arc_cost_evaluator_of_all_vehicles': return 1;
            case 'routing_set_arc_cost_evaluator_of_vehicle': return 1;
            case 'routing_capture_assignment_variables': return 1;
            case 'routing_solve_with_parameters_proto': return 0;
            case 'routing_local_search_profile': return '';
            case 'routing_get_automatic_first_solution_strategy':
              assert.equal(deleted, false);
              return status === 5 ? 0 : 3;
            case 'routing_status':
              assert.equal(deleted, false);
              return status;
            case 'routing_delete_model': deleted = true; return;
            case 'routing_delete_index_manager': return;
            default: throw new Error(`Unexpected native call: ${name}`);
          }
        },
      };
      const result = await solveRoutingWithModule(module, {
        numLocations: 2, numVehicles: 2, starts: [0, 0], ends: [0, 0],
        searchParametersProto: new Uint8Array(),
        transitMatrix: new BigInt64Array(25), transitMatrixDimension: 5,
        operations: [{ type: 'setArcCostEvaluatorOfVehicles', vehicles: [0, 1], transitMatrix: new BigInt64Array(25) }], dimensionNames: [],
      });
      assert.deepEqual(result, { status, solution: null, localSearchProfile: '', automaticFirstSolutionStrategy: status === 5 ? 0 : 3 });
      assert.equal(deleted, true);
      assert.equal(allocations.size, 0);
      assert.equal(calls.filter(name => name === 'routing_register_matrix_transit_callback').length, 2, 'Default and shared override each register once');
      assert.equal(calls.filter(name => name === 'routing_set_arc_cost_evaluator_of_vehicle').length, 2, 'Both vehicles receive the shared native evaluator');
      assert.ok(calls.indexOf('routing_status') < calls.indexOf('routing_delete_model'));
      assert.ok(calls.indexOf('routing_get_automatic_first_solution_strategy') < calls.indexOf('routing_delete_model'));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
