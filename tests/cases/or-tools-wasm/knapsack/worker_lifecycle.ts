type KnapsackWorkerApi = {
  KnapsackSolver: new (solverType: 0, name: string) => {
    init(profits: number[], weights: number[][], capacities: number[]): void;
    solve(options: { executor: 'worker'; signal?: AbortSignal }): Promise<bigint>;
  };
  KnapsackSolverType: {
    KNAPSACK_BRUTE_FORCE_SOLVER: 0;
  };
};

export type KnapsackWorkerLifecycleResult = {
  id: 'knapsack.worker.lifecycle';
  name: 'Knapsack worker cancels and recovers';
  solver: 'knapsack';
  ok: true;
};

function createSolver(api: KnapsackWorkerApi, itemCount: number, name: string) {
  const solver = new api.KnapsackSolver(
    api.KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER,
    name,
  );
  const profits = Array.from({ length: itemCount }, (_, index) => index + 1);
  solver.init(profits, [profits.map(() => 1)], [Math.floor(itemCount / 2)]);
  return solver;
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), 10_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function runKnapsackWorkerLifecycleCase(
  api: KnapsackWorkerApi,
): Promise<KnapsackWorkerLifecycleResult> {
  const controller = new AbortController();
  const activeSolve = createSolver(api, 30, 'cancel').solve({
    executor: 'worker',
    signal: controller.signal,
  });

  let busyError: unknown;
  try {
    await createSolver(api, 8, 'contending').solve({ executor: 'worker' });
  } catch (error) {
    busyError = error;
  }
  if (!(busyError instanceof Error) || busyError.name !== 'SolverExecutorBusyError') {
    throw new Error(`expected SolverExecutorBusyError, got ${String(busyError)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 25));
  controller.abort();

  let cancellationError: unknown;
  try {
    await withTimeout(activeSolve, 'Knapsack worker cancellation');
  } catch (error) {
    cancellationError = error;
  }
  if (!(cancellationError instanceof Error) || cancellationError.name !== 'AbortError') {
    throw new Error(`expected AbortError, got ${String(cancellationError)}`);
  }

  await withTimeout(
    createSolver(api, 8, 'recovery').solve({ executor: 'worker' }),
    'Knapsack worker recovery',
  );

  return {
    id: 'knapsack.worker.lifecycle',
    name: 'Knapsack worker cancels and recovers',
    solver: 'knapsack',
    ok: true,
  };
}
