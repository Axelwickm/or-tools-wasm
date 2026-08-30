type NetworkFlowConcurrencyApi = {
  SimpleMaxFlow: new () => {
    addArcWithCapacity(tail: number, head: number, capacity: number): number;
    solve(source: number, sink: number, options: { executor: 'direct' | 'worker' }): Promise<number>;
  };
};

function createFlow(api: NetworkFlowConcurrencyApi) {
  const flow = new api.SimpleMaxFlow();
  flow.addArcWithCapacity(0, 1, 10);
  flow.addArcWithCapacity(1, 2, 10);
  return flow;
}

export async function runNetworkFlowConcurrencyCase(api: NetworkFlowConcurrencyApi) {
  const first = createFlow(api);
  const second = createFlow(api);
  const activeSolve = first.solve(0, 2, { executor: 'direct' });

  let busyError: unknown;
  try {
    await second.solve(0, 2, { executor: 'direct' });
  } catch (error) {
    busyError = error;
  }
  if (!(busyError instanceof Error) || busyError.name !== 'SolverExecutorBusyError') {
    throw new Error(`expected SolverExecutorBusyError, got ${String(busyError)}`);
  }
  await activeSolve;
  await second.solve(0, 2, { executor: 'direct' });

  const shared = createFlow(api);
  const workerSolve = shared.solve(0, 2, { executor: 'worker' });
  let instanceError: unknown;
  try {
    await shared.solve(0, 2, { executor: 'direct' });
  } catch (error) {
    instanceError = error;
  }
  if (!(instanceError instanceof Error) || instanceError.name !== 'RuntimeError') {
    throw new Error(`expected RuntimeError, got ${String(instanceError)}`);
  }
  await workerSolve;
  await shared.solve(0, 2, { executor: 'direct' });

  return {
    id: 'network_flow.executor.concurrency' as const,
    name: 'Network Flow rejects unsafe solve concurrency' as const,
    solver: 'network-flow' as const,
    ok: true as const,
  };
}
