type RoutingWorkerApi = {
  RoutingIndexManager: new (
    numLocations: number,
    numVehicles: number,
    depot: number,
  ) => {
    indexToNode(index: number): number;
  };
  RoutingModel: new (manager: unknown) => {
    registerTransitCallback(
      callback: (fromIndex: number, toIndex: number) => number,
    ): number;
    setArcCostEvaluatorOfAllVehicles(evaluatorIndex: number): void;
    solve(options: {
      executor: 'worker';
      signal?: AbortSignal;
    }): Promise<unknown>;
  };
};

export type RoutingWorkerLifecycleResult = {
  id: 'routing.worker.lifecycle';
  name: 'Routing worker cancels and recovers';
  solver: 'routing';
  ok: true;
};

function createModel(api: RoutingWorkerApi, size: number) {
  const manager = new api.RoutingIndexManager(size, 1, 0);
  const routing = new api.RoutingModel(manager);
  const transit = routing.registerTransitCallback((fromIndex, toIndex) => {
    const from = manager.indexToNode(fromIndex);
    const to = manager.indexToNode(toIndex);
    return Math.abs(from - to) + ((from * 37 + to * 19) % 23);
  });
  routing.setArcCostEvaluatorOfAllVehicles(transit);
  return routing;
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

export async function runRoutingWorkerLifecycleCase(
  api: RoutingWorkerApi,
): Promise<RoutingWorkerLifecycleResult> {
  const routing = createModel(api, 250);
  const controller = new AbortController();
  const activeSolve = routing.solve({
    executor: 'worker',
    signal: controller.signal,
  });

  // Let the native Routing search enter its solve loop before signalling the
  // search engine's cross-thread FinishCurrentSearch() hook.
  await new Promise((resolve) => setTimeout(resolve, 50));
  controller.abort();
  let cancellationError: unknown;
  try {
    await withTimeout(activeSolve, 'Routing worker cancellation');
  } catch (error) {
    cancellationError = error;
  }
  if (!(cancellationError instanceof Error) || cancellationError.name !== 'AbortError') {
    throw new Error(`expected AbortError, got ${String(cancellationError)}`);
  }

  // Bun's worker bridge reports the cancellation before the native Routing
  // search has released its executor. Give that teardown a bounded grace
  // period before submitting the recovery solve.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const recoveryModel = createModel(api, 50);
  await withTimeout(
    recoveryModel.solve({ executor: 'worker' }),
    'Routing worker recovery',
  );

  return {
    id: 'routing.worker.lifecycle',
    name: 'Routing worker cancels and recovers',
    solver: 'routing',
    ok: true,
  };
}
