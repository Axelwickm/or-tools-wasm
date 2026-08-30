type KnapsackEventHandlerApi = {
  KnapsackSolver: new (solverType: 0, name: string) => {
    init(profits: number[], weights: number[][], capacities: number[]): void;
    solve(options: {
      executor: 'direct' | 'worker';
      onEvent?: (event: unknown) => void;
    }): Promise<number>;
  };
  KnapsackSolverType: {
    KNAPSACK_BRUTE_FORCE_SOLVER: 0;
  };
};

export type KnapsackEventHandlerResult = {
  id: 'knapsack.event-handler.recovery';
  name: 'Knapsack isolates event-handler errors and recovers';
  solver: 'knapsack';
  ok: true;
};

function createSolver(api: KnapsackEventHandlerApi, name: string) {
  const solver = new api.KnapsackSolver(
    api.KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER,
    name,
  );
  solver.init([1, 2, 3, 4, 5, 6], [[1, 1, 1, 1, 1, 1]], [3]);
  return solver;
}

async function assertCallbackRecovery(
  api: KnapsackEventHandlerApi,
  executor: 'direct' | 'worker',
) {
  const solver = createSolver(api, `callback-${executor}`);
  const callbackError = new Error(`${executor} callback failed`);
  let thrown: unknown;
  try {
    await solver.solve({
      executor,
      onEvent: () => { throw callbackError; },
    });
  } catch (error) {
    thrown = error;
  }
  if (thrown !== callbackError) {
    throw new Error(`${executor}: expected the original callback error, got ${String(thrown)}`);
  }
  const profit = await solver.solve({ executor });
  if (profit !== 15) {
    throw new Error(`${executor}: expected recovery profit 15, got ${profit}`);
  }
}

export async function runKnapsackEventHandlerCase(
  api: KnapsackEventHandlerApi,
): Promise<KnapsackEventHandlerResult> {
  await assertCallbackRecovery(api, 'direct');
  await assertCallbackRecovery(api, 'worker');
  return {
    id: 'knapsack.event-handler.recovery',
    name: 'Knapsack isolates event-handler errors and recovers',
    solver: 'knapsack',
    ok: true,
  };
}
