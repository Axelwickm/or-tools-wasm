import { knapsackNumericalCases } from '../../or-tools-wasm/knapsack/numerical.ts';
import { assertCaseMatrix } from '../../../harness/shared_case.ts';
import type { ExecutorFixtureMode, SharedCase, SharedCaseResult } from '../../../harness/shared_case.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  passedCase,
  serverExecutorConfiguration,
  solverJobStates,
} from '../../../harness/shared_case.ts';
import { knapsackExecutionOptions, setKnapsackMode } from './execution.ts';

export type KnapsackCaseResult = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: ExecutorFixtureMode;
  ok: boolean;
  profit: number;
  selectedItems: number[];
  optimal: boolean;
} & SharedCaseResult<ExecutorFixtureMode>;

type KnapsackSolverLike = {
  init(profits: (number | bigint)[], weights: (number | bigint)[][], capacities: (number | bigint)[]): void;
  solve(options?: {
    numWorkers?: number;
    executor?: 'direct' | 'worker' | ReturnType<typeof serverExecutorConfiguration>;
    onEvent?: (event: { type: string; status?: { state: number } }) => void;
  }): Promise<{ profit: bigint; optimal: boolean; contains(itemId: number): boolean }>;
  setUseReduction(useReduction: boolean): void;
  setTimeLimit(seconds: number): void;
};

type KnapsackSolverTypeLike = 0 | 1 | 2 | 3 | 5 | 6 | 7 | 8 | 9 | 10;

export type KnapsackApi = {
  KnapsackSolver: {
    new(solverType: KnapsackSolverTypeLike, name: string): KnapsackSolverLike;
  };
  KnapsackSolverType: {
    KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER: 5;
    KNAPSACK_BRUTE_FORCE_SOLVER: 0;
    KNAPSACK_64ITEMS_SOLVER: 1;
    KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER: 2;
    KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER: 6;
    KNAPSACK_DIVIDE_AND_CONQUER_SOLVER: 9;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function realSolve(
  api: KnapsackApi,
  profits: number[],
  weights: number[][],
  capacities: number[],
  solverType: KnapsackSolverTypeLike,
  useReduction: boolean,
) {
  const solver = new api.KnapsackSolver(solverType, 'solver');
  solver.setUseReduction(useReduction);
  solver.init(profits, weights, capacities);
  const states: number[] = [];
  const result = await solver.solve({
    ...knapsackExecutionOptions(),
    onEvent: (event) => {
      if (event.type === 'status' && event.status) states.push(event.status.state);
    },
  });
  assert(states.includes(solverJobStates.RUNNING), 'Knapsack solve did not emit RUNNING status');
  assert(states.includes(solverJobStates.SUCCEEDED), 'Knapsack solve did not emit SUCCEEDED status');
  return {
    profit: result.profit,
    selectedItems: profits.map((_, item) => item).filter((item) => result.contains(item)),
    optimal: result.optimal,
  };
}

async function solveKnapsackProblemUsingSpecificSolver(
  api: KnapsackApi,
  profits: number[],
  weights: number[][],
  capacities: number[],
  solverType: KnapsackSolverTypeLike,
) {
  const resultWhenReduction = await realSolve(api, profits, weights, capacities, solverType, true);
  const resultWhenNoReduction = await realSolve(api, profits, weights, capacities, solverType, false);
  if (resultWhenReduction.profit !== resultWhenNoReduction.profit) {
    return { profit: -1n, selectedItems: [], optimal: false };
  }
  return resultWhenReduction;
}

async function solveKnapsackProblem(
  api: KnapsackApi,
  profits: number[],
  weights: number[][],
  capacities: number[],
) {
  const maxNumberOfItemsForBruteForce = 15;
  const maxNumberOfItemsForDivideAndConquer = 32;
  const maxNumberOfItemsFor64ItemsSolver = 64;
  const maxCapacityForDynamicProgrammingSolver = 1000000;
  const numberOfItems = profits.length;
  const invalidSolution = -1n;

  const genericResult = await solveKnapsackProblemUsingSpecificSolver(
    api,
    profits,
    weights,
    capacities,
    api.KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
  );
  if (genericResult.profit === invalidSolution) return genericResult;

  const scipResult = await solveKnapsackProblemUsingSpecificSolver(
    api,
    profits,
    weights,
    capacities,
    api.KnapsackSolverType.KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER,
  );
  if (scipResult.profit !== genericResult.profit) return { profit: invalidSolution, selectedItems: [], optimal: false };

  if (weights.length > 1) return genericResult;

  if (numberOfItems <= maxNumberOfItemsForBruteForce) {
    const bruteForceResult = await solveKnapsackProblemUsingSpecificSolver(
      api,
      profits,
      weights,
      capacities,
      api.KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER,
    );
    if (bruteForceResult.profit !== genericResult.profit) return { profit: invalidSolution, selectedItems: [], optimal: false };
  }

  if (numberOfItems <= maxNumberOfItemsFor64ItemsSolver) {
    const items64Result = await solveKnapsackProblemUsingSpecificSolver(
      api,
      profits,
      weights,
      capacities,
      api.KnapsackSolverType.KNAPSACK_64ITEMS_SOLVER,
    );
    if (items64Result.profit !== genericResult.profit) return { profit: invalidSolution, selectedItems: [], optimal: false };
  }

  if (capacities[0] <= maxCapacityForDynamicProgrammingSolver) {
    const dynamicProgrammingResult = await solveKnapsackProblemUsingSpecificSolver(
      api,
      profits,
      weights,
      capacities,
      api.KnapsackSolverType.KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER,
    );
    if (dynamicProgrammingResult.profit !== genericResult.profit) return { profit: invalidSolution, selectedItems: [], optimal: false };
  }

  if (numberOfItems <= maxNumberOfItemsForDivideAndConquer) {
    const divideAndConquerResult = await solveKnapsackProblemUsingSpecificSolver(
      api,
      profits,
      weights,
      capacities,
      api.KnapsackSolverType.KNAPSACK_DIVIDE_AND_CONQUER_SOLVER,
    );
    if (divideAndConquerResult.profit !== genericResult.profit) return { profit: invalidSolution, selectedItems: [], optimal: false };
  }

  return genericResult;
}

async function runKnapsackProblemCase(
  api: KnapsackApi,
  mode: ExecutorFixtureMode,
  name: string,
  profits: number[],
  weights: number[][],
  capacities: number[],
  expectedProfit: number,
): Promise<{ profit: number; selectedItems: number[]; optimal: boolean }> {
  const result = await solveKnapsackProblem(api, profits, weights, capacities);
  assert(result.profit === BigInt(expectedProfit), `${name} (${mode}): expected profit ${expectedProfit}, got ${result.profit}`);
  assert(result.optimal, `${name} (${mode}): expected proven optimal solution`);
  return {
    profit: Number(result.profit),
    selectedItems: result.selectedItems,
    optimal: result.optimal,
  };
}

type KnapsackCase = SharedCase<KnapsackApi, {
  profit: number;
  selectedItems: number[];
  optimal: boolean;
}, ExecutorFixtureMode>;

export const knapsackCases: KnapsackCase[] = [
  {
    id: 'knapsack.pywrap_algorithms.test_solve_one_dimension',
    name: 'PyWrapAlgorithmsKnapsackSolverTest.testSolveOneDimension',
    solver: 'knapsack',
    source: 'ortools/algorithms/python/knapsack_solver_test.py',
    upstream: 'testSolveOneDimension',
    tags: ['python-parity'],
    // TEMP: parity - mirrors ortools/algorithms/python/knapsack_solver_test.py
    // testSolveOneDimension, including reduction/no-reduction comparisons
    // across the same applicable one-dimensional solver variants.
    async run(api, context) {
      return runKnapsackProblemCase(
        api,
        context.mode ?? 'direct',
        'PyWrapAlgorithmsKnapsackSolverTest.testSolveOneDimension',
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [[1, 2, 3, 4, 5, 6, 7, 8, 9]],
        [34],
        34,
      );
    },
  },
  {
    id: 'knapsack.pywrap_algorithms.test_solve_two_dimensions',
    name: 'PyWrapAlgorithmsKnapsackSolverTest.testSolveTwoDimensions',
    solver: 'knapsack',
    source: 'ortools/algorithms/python/knapsack_solver_test.py',
    upstream: 'testSolveTwoDimensions',
    tags: ['python-parity'],
    // TEMP: parity - mirrors ortools/algorithms/python/knapsack_solver_test.py
    // testSolveTwoDimensions. Upstream returns after the generic solver for
    // multi-dimensional cases, so this does the same.
    async run(api, context) {
      return runKnapsackProblemCase(
        api,
        context.mode ?? 'direct',
        'PyWrapAlgorithmsKnapsackSolverTest.testSolveTwoDimensions',
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [[1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 1, 1, 1, 1, 1, 1, 1, 1]],
        [34, 4],
        30,
      );
    },
  },
  {
    id: 'knapsack.pywrap_algorithms.test_solve_big_one_dimension',
    name: 'PyWrapAlgorithmsKnapsackSolverTest.testSolveBigOneDimension',
    solver: 'knapsack',
    source: 'ortools/algorithms/python/knapsack_solver_test.py',
    upstream: 'testSolveBigOneDimension',
    tags: ['python-parity'],
    // TEMP: parity - mirrors ortools/algorithms/python/knapsack_solver_test.py
    // testSolveBigOneDimension with the same data and expected profit.
    async run(api, context) {
      return runKnapsackProblemCase(
        api,
        context.mode ?? 'direct',
        'PyWrapAlgorithmsKnapsackSolverTest.testSolveBigOneDimension',
        [
          360, 83, 59, 130, 431, 67, 230, 52, 93, 125, 670, 892, 600,
          38, 48, 147, 78, 256, 63, 17, 120, 164, 432, 35, 92, 110,
          22, 42, 50, 323, 514, 28, 87, 73, 78, 15, 26, 78, 210,
          36, 85, 189, 274, 43, 33, 10, 19, 389, 276, 312,
        ],
        [[
          7, 0, 30, 22, 80, 94, 11, 81, 70, 64, 59, 18, 0, 36,
          3, 8, 15, 42, 9, 0, 42, 47, 52, 32, 26, 48, 55, 6,
          29, 84, 2, 4, 18, 56, 7, 29, 93, 44, 71, 3, 86, 66,
          31, 65, 0, 79, 20, 65, 52, 13,
        ]],
        [850],
        7534,
      );
    },
  },
];

knapsackCases.push({
  id: 'knapsack.native.empty_problem', name: 'KnapsackSolver.empty_problem', solver: 'knapsack',
  source: 'ortools/algorithms/knapsack_solver.cc', upstream: 'KnapsackSolver::Init', tags: ['python-parity', 'gap-regression'],
  async run(api) {
    const solver = new api.KnapsackSolver(api.KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER, 'empty');
    solver.init([], [[]], [10]);
    const result = await solver.solve(knapsackExecutionOptions());
    assert(result.profit === 0n && result.optimal, 'empty generic knapsack must return optimal zero');
    return { profit: 0, selectedItems: [], optimal: true };
  },
}, {
  id: 'knapsack.native.zero_and_infinite_time_limits', name: 'KnapsackSolver.zero_and_infinite_time_limits', solver: 'knapsack',
  source: 'ortools/algorithms/knapsack_solver.h; ortools/algorithms/knapsack_solver.cc',
  upstream: 'KnapsackSolver::set_time_limit', tags: ['python-parity', 'gap-regression'],
  async run(api) {
    const solver = new api.KnapsackSolver(api.KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER, 'limits');
    solver.setUseReduction(false);
    const profits = Array.from({ length: 40 }, (_, i) => i * 7 % 31 + 1);
    const weights = Array.from({ length: 40 }, (_, i) => i * 13 % 29 + 1);
    solver.init(profits, [weights], [180]);
    solver.setTimeLimit(0);
    const stopped = await solver.solve(knapsackExecutionOptions());
    assert(!stopped.optimal, 'zero time limit must stop before proving optimality');
    solver.setTimeLimit(Infinity);
    const unlimited = await solver.solve(knapsackExecutionOptions());
    assert(unlimited.optimal && unlimited.profit > stopped.profit, 'positive infinity must permit the complete search');
    return { profit: Number(unlimited.profit), selectedItems: profits.map((_, i) => i).filter(i => unlimited.contains(i)), optimal: true };
  },
});

for (const [solverType, name] of [[3, 'cbc'], [10, 'cp_sat']] as const) knapsackCases.push({
  id: `knapsack.native.${name}_backend`, name: `KnapsackSolver.${name}_backend`, solver: 'knapsack',
  source: 'ortools/algorithms/python/knapsack_solver.cc', upstream: 'KnapsackSolver::SolverType', tags: ['python-parity', 'gap-regression'],
  async run(api) {
    const solver = new api.KnapsackSolver(solverType, name);
    solver.init([3, 5, 9], [[2, 3, 5]], [5]);
    const result = await solver.solve(knapsackExecutionOptions());
    assert(result.optimal && result.profit === 9n && result.contains(2), `${name}: exact optimal knapsack result`);
    return { profit: 9, selectedItems: [2], optimal: true };
  },
});

knapsackCases.push(...knapsackNumericalCases);

export async function runKnapsackCases(
  api: KnapsackApi,
  options: { modes?: readonly ExecutorFixtureMode[] } = {},
): Promise<KnapsackCaseResult[]> {
  const results: KnapsackCaseResult[] = [];
  const modes = options.modes ?? executorFixtureModes;
  if (modes.includes('server')) await assertServerExecutorIsRunning();
  for (const mode of modes) {
    setKnapsackMode(mode);
    for (const testCase of knapsackCases) {
      const result = await testCase.run(api, { mode });
      results.push(passedCase({ ...testCase, name: `${testCase.name} (${mode})` }, { mode }, result));
    }
  }
  setKnapsackMode('direct');
  assertCaseMatrix(results, knapsackCases, modes);
  return results;
}
