import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { CpSat, terminateLoadedRuntimeThreads } from 'or-tools-wasm/cp-sat';
import { buildModel, buildProblem, type ProblemData, type SolverMethod } from './steel_mill_slab.ts';

after(() => terminateLoadedRuntimeThreads());

const cases: Array<[string, ProblemData, number]> = [
  ['default problem', buildProblem(3), 20],
  ['same-color orders share a slab', { id: -1, numSlabs: 2, capacities: [0, 10], numColors: 2,
    orders: [{ width: 4, color: 1 }, { width: 6, color: 1 }] }, 0],
  ['three distinct colors require two slabs', { id: -1, numSlabs: 3, capacities: [0, 10], numColors: 3,
    orders: [{ width: 2, color: 1 }, { width: 3, color: 2 }, { width: 4, color: 3 }] }, 11],
];
for (const [name, problem, expectedLoss] of cases) {
  test(`steel mill: all formulations agree on ${name}`, async () => {
    for (const method of ['sat', 'sat_table', 'sat_column'] as SolverMethod[]) {
      for (const symmetry of method === 'sat_column' ? [false] : [false, true]) {
        const { model, metadata } = buildModel(method, problem, symmetry);
        const built = await CpSat.createModel(model);
        const { response } = await CpSat.solveProto(built, { executor: 'direct', numWorkers: 1 });
        assert.equal(response?.status, 'OPTIMAL', method);
        assert.equal(response.objectiveValue, expectedLoss, method);
        const values = Array.from(response.solution!, Number);
        if (metadata.assignByOrder) {
          for (let slab = 0; slab < problem.numSlabs; slab++) {
            const orders = problem.orders.filter((_, order) => values[metadata.assignByOrder![order][slab]] === 1);
            const colors = new Set(orders.map(order => order.color));
            assert.ok(colors.size <= 2);
            metadata.colorIndices![slab].forEach((index, color) => {
              assert.equal(values[index], Number(colors.has(color + 1)));
            });
          }
        }
      }
    }
  });
}
