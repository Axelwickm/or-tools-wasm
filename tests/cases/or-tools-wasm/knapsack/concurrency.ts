type KnapsackConcurrencyApi = {
  KnapsackSolver: new (solverType: 0, name: string) => {
    init(profits: number[], weights: number[][], capacities: number[]): void;
    solve(options: { executor: 'direct' | 'worker' }): Promise<{ profit: bigint }>;
  };
  KnapsackSolverType: {
    KNAPSACK_BRUTE_FORCE_SOLVER: 0;
  };
};

export type KnapsackConcurrencyResult = {
  id: 'knapsack.executor.concurrency';
  name: 'Knapsack rejects unsafe local solve concurrency';
  solver: 'knapsack';
  ok: true;
};

function createSolver(api: KnapsackConcurrencyApi, itemCount: number, name: string) {
  const solver = new api.KnapsackSolver(
    api.KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER,
    name,
  );
  const profits = Array.from({ length: itemCount }, (_, index) => index + 1);
  solver.init(profits, [profits.map(() => 1)], [Math.floor(itemCount / 2)]);
  return solver;
}

export async function runKnapsackConcurrencyCase(
  api: KnapsackConcurrencyApi,
): Promise<KnapsackConcurrencyResult> {
  const first = createSolver(api, 20, 'active');
  const second = createSolver(api, 8, 'contending');
  const activeSolve = first.solve({ executor: 'direct' });

  let busyError: unknown;
  try {
    await second.solve({ executor: 'direct' });
  } catch (error) {
    busyError = error;
  }
  if (!(busyError instanceof Error) || busyError.name !== 'SolverExecutorBusyError') {
    throw new Error(`expected SolverExecutorBusyError, got ${String(busyError)}`);
  }

  await activeSolve;
  await second.solve({ executor: 'direct' });

  const sharedSolver = createSolver(api, 8, 'shared-instance');
  const workerSolve = sharedSolver.solve({ executor: 'worker' });
  sharedSolver.init([3, 9], [[1, 1]], [1]);
  const directSolve = sharedSolver.solve({ executor: 'direct' });
  const [worker, direct] = await Promise.all([workerSolve, directSolve]);
  if (worker.profit !== 26n || direct.profit !== 9n) {
    throw new Error('Concurrent Knapsack results must use their own captured inputs');
  }

  return {
    id: 'knapsack.executor.concurrency',
    name: 'Knapsack rejects unsafe local solve concurrency',
    solver: 'knapsack',
    ok: true,
  };
}
