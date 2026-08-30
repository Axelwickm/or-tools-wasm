type RoutingConcurrencyApi = {
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
    solve(options: { executor: 'direct' }): Promise<unknown>;
  };
};

export type RoutingConcurrencyResult = {
  id: 'routing.executor.concurrency';
  name: 'Routing rejects unsafe local solve concurrency';
  solver: 'routing';
  ok: true;
};

function createModel(api: RoutingConcurrencyApi, size: number) {
  const manager = new api.RoutingIndexManager(size, 1, 0);
  const routing = new api.RoutingModel(manager);
  const transit = routing.registerTransitCallback((fromIndex, toIndex) => {
    const from = manager.indexToNode(fromIndex);
    const to = manager.indexToNode(toIndex);
    return Math.abs(from - to) + ((from * 31 + to * 17) % 11);
  });
  routing.setArcCostEvaluatorOfAllVehicles(transit);
  return routing;
}

export async function runRoutingConcurrencyCase(
  api: RoutingConcurrencyApi,
): Promise<RoutingConcurrencyResult> {
  const first = createModel(api, 90);
  const second = createModel(api, 40);
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

  return {
    id: 'routing.executor.concurrency',
    name: 'Routing rejects unsafe local solve concurrency',
    solver: 'routing',
    ok: true,
  };
}
