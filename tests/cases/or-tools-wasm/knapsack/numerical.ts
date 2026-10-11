import type { ExecutorFixtureMode, SharedCase } from '../../../harness/shared_case.ts';
import type { KnapsackApi } from '../../python-parity/knapsack/index.ts';
import { knapsackExecutionOptions } from '../../python-parity/knapsack/execution.ts';

type Output = { profit: number; selectedItems: number[]; optimal: boolean };
const maximum = 9_223_372_036_854_775_807n;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export const knapsackNumericalCases: SharedCase<KnapsackApi, Output, ExecutorFixtureMode>[] = [{
  id: 'knapsack.numerical.large_weight_dimension', name: 'Large Knapsack weight arrays reach native solving',
  solver: 'knapsack', source: 'javascript/lib/knapsack/native_runtime.ts',
  tags: ['binding-contract', 'serialization'],
  async run(api) {
    const count = 200_000;
    const solver = new api.KnapsackSolver(2, 'large weight dimension');
    solver.init(Array(count).fill(1), [Array(count).fill(1)], [1]);
    const result = await solver.solve(knapsackExecutionOptions());
    assert(result.optimal && result.profit === 1n, 'A valid large dimension solves without exceeding the JS argument limit');
    const selectedItems: number[] = [];
    for (let item = 0; item < count; ++item) if (result.contains(item)) selectedItems.push(item);
    assert(selectedItems.length === 1, 'Native solving selects exactly one item for capacity one');
    return { profit: 1, selectedItems, optimal: true };
  },
}, {
  id: 'knapsack.numerical.invalid_input_recovery', name: 'Knapsack numerical boundaries and atomic initialization',
  solver: 'knapsack', source: 'ortools/algorithms/knapsack_solver.cc',
  upstream: 'KnapsackSolver::ReduceCapacities/ComputeAdditionalProfit', tags: ['native-contract', 'numerical'],
  async run(api) {
    const solver = new api.KnapsackSolver(5, 'numeric recovery');
    solver.init([7], [[1]], [1]);
    for (const input of [
      { profits: [-1n], weights: [[1n]], capacities: [1n] },
      { profits: [1n], weights: [[-1n]], capacities: [1n] },
      { profits: [1n], weights: [[1n]], capacities: [-1n] },
      { profits: [maximum - 1n, 2n], weights: [[1n, 1n]], capacities: [1n] },
      { profits: [1n, 1n], weights: [[maximum, 1n]], capacities: [1n] },
      { profits: [maximum], weights: [[1n]], capacities: [0n] },
    ]) {
      let rejected = false;
      try { solver.init(input.profits, input.weights, input.capacities); } catch (error) { rejected = error instanceof RangeError; }
      assert(rejected, 'Unsafe integer inputs must reject before native work');
      const result = await solver.solve(knapsackExecutionOptions());
      assert(result.optimal && result.profit === 7n && result.contains(0), 'Rejected initialization must preserve the previous model');
    }
    for (const type of [2, 9, 3, 6, 10] as const) {
      const unsafe = new api.KnapsackSolver(type, 'native arithmetic boundary');
      let rejected = false;
      try { unsafe.init([type === 2 || type === 9 ? 1n : maximum], [[1n]], [type === 2 || type === 9 ? maximum : 1n]); }
      catch (error) { rejected = error instanceof RangeError; }
      assert(rejected, 'Native capacity increment or float-to-int overflow must reject');
      unsafe.init([2], [[1]], [1]);
      const recovered = await unsafe.solve(knapsackExecutionOptions());
      assert(recovered.optimal && recovered.profit === 2n, 'Backend remains usable after numeric rejection');
    }
    return { profit: 7, selectedItems: [0], optimal: true };
  },
}, {
  id: 'knapsack.numerical.exact_and_empty_snapshots', name: 'Knapsack exact totals, zero weights and empty snapshots',
  solver: 'knapsack', source: 'ortools/algorithms/knapsack_solver.cc',
  upstream: 'KnapsackSolver::Solve/BestSolutionContains', tags: ['native-contract', 'numerical'],
  async run(api) {
    const solver = new api.KnapsackSolver(5, 'exact totals');
    const exact = 9_007_199_254_740_993n;
    solver.init([exact, 7n], [[0n, 1n]], [1n]);
    const result = await solver.solve(knapsackExecutionOptions());
    assert(result.optimal && result.profit === exact + 7n && result.contains(0) && result.contains(1), 'Native integer totals above safe-number range stay exact');
    solver.init([], [[]], [0]);
    const empty = await solver.solve(knapsackExecutionOptions());
    assert(empty.profit === 0n && empty.optimal, 'Empty problem returns the native optimal zero');
    assert(result.profit === exact + 7n && result.contains(1), 'Reinitialization and empty solve do not change earlier answers');
    for (const type of [0, 1, 2, 3, 6, 9, 10] as const) {
      const other = new api.KnapsackSolver(type, 'empty backend');
      other.init([], [[]], [0]);
      const answer = await other.solve(knapsackExecutionOptions());
      assert(answer.profit === 0n && answer.optimal, 'All built backends support empty problems with default reduction');
      if (type === 1) {
        other.setUseReduction(false);
        let rejected = false;
        try { await other.solve(knapsackExecutionOptions()); } catch (error) { rejected = error instanceof RangeError; }
        assert(rejected, '64-item backend rejects dereferencing an empty item set without reduction');
        other.setUseReduction(true);
        assert((await other.solve(knapsackExecutionOptions())).optimal, 'Re-enabling reduction restores normal execution');
      }
    }
    return { profit: 0, selectedItems: [], optimal: true };
  },
}, {
  id: 'knapsack.numerical.worker_budget', name: 'Knapsack CP-SAT worker budgets and recovery',
  solver: 'knapsack', source: 'ortools/algorithms/knapsack_solver.cc',
  upstream: 'KnapsackCpSat::Solve/SatParameters::num_workers', tags: ['native-contract', 'threading'],
  async run(api) {
    const solver = new api.KnapsackSolver(10, 'worker budget');
    solver.init([3, 5, 9], [[2, 3, 5]], [5]);
    for (const numWorkers of [1, 4]) {
      const result = await solver.solve({ ...knapsackExecutionOptions(), numWorkers });
      assert(result.optimal && result.profit === 9n && result.contains(2), 'Native CP-SAT optimization honors admitted one/four-worker solves');
    }
    for (const numWorkers of [0, -1, 1.5, 2_147_483_648]) {
      let rejected = false;
      try { await solver.solve({ ...knapsackExecutionOptions(), numWorkers }); } catch (error) { rejected = error instanceof RangeError; }
      assert(rejected, 'Malformed worker count rejects');
    }
    let rejected = false;
    try { await solver.solve({ ...knapsackExecutionOptions(), numWorkers: 2_147_483_647 }); } catch { rejected = true; }
    assert(rejected, 'Worker counts above actual runtime/server capacity reject before allocation');
    assert((await solver.solve(knapsackExecutionOptions())).profit === 9n, 'Capacity rejection preserves executor recovery');
    const single = new api.KnapsackSolver(5, 'single-thread backend');
    single.init([1], [[1]], [1]);
    rejected = false;
    try { await single.solve({ ...knapsackExecutionOptions(), numWorkers: 2 }); } catch (error) { rejected = error instanceof RangeError; }
    assert(rejected && (await single.solve(knapsackExecutionOptions())).profit === 1n, 'Single-thread algorithms reject parallel settings without poisoning state');
    return { profit: 9, selectedItems: [2], optimal: true };
  },
}, {
  id: 'knapsack.numerical.unavailable_backend_recovery', name: 'Unavailable Knapsack backends reject without terminating the executor',
  solver: 'knapsack', source: 'ortools/algorithms/knapsack_solver.cc; ortools/linear_solver/linear_solver.cc',
  upstream: 'KnapsackMIPSolver::Solve/MPSolver::SupportsProblemType', tags: ['native-contract', 'backend'],
  async run(api) {
    for (const type of [7, 8] as const) {
      const unavailable = new api.KnapsackSolver(type, 'unavailable backend');
      unavailable.init([3, 5, 9], [[2, 3, 5]], [5]);
      let rejected = false;
      try { await unavailable.solve(knapsackExecutionOptions()); }
      catch (error) { rejected = error instanceof Error && /not available/.test(error.message); }
      assert(rejected, 'Unavailable native backends return an error instead of a fatal constructor check');
      const valid = new api.KnapsackSolver(5, 'recovery');
      valid.init([2], [[1]], [1]);
      assert((await valid.solve(knapsackExecutionOptions())).profit === 2n, 'Runtime remains reusable after unavailable backend rejection');
    }
    return { profit: 2, selectedItems: [0], optimal: true };
  },
}];
