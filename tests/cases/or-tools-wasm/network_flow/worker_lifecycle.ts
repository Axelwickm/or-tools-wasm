type NetworkFlowWorkerApi = {
  SimpleMaxFlow: new () => {
    addArcWithCapacity(tail: number, head: number, capacity: number): number;
    solve(source: number, sink: number, options: {
      executor: 'worker';
      signal?: AbortSignal;
    }): Promise<number>;
  };
};

function createFlow(api: NetworkFlowWorkerApi) {
  const flow = new api.SimpleMaxFlow();
  flow.addArcWithCapacity(0, 1, 10);
  flow.addArcWithCapacity(1, 2, 10);
  return flow;
}

export async function runNetworkFlowWorkerLifecycleCase(api: NetworkFlowWorkerApi) {
  const controller = new AbortController();
  const activeSolve = createFlow(api).solve(0, 2, {
    executor: 'worker',
    signal: controller.signal,
  });

  let busyError: unknown;
  try {
    await createFlow(api).solve(0, 2, { executor: 'worker' });
  } catch (error) {
    busyError = error;
  }
  if (!(busyError instanceof Error) || busyError.name !== 'SolverExecutorBusyError') {
    throw new Error(`expected SolverExecutorBusyError, got ${String(busyError)}`);
  }

  controller.abort();
  let cancellationError: unknown;
  try {
    await activeSolve;
  } catch (error) {
    cancellationError = error;
  }
  if (!(cancellationError instanceof Error) || cancellationError.name !== 'AbortError') {
    throw new Error(`expected AbortError, got ${String(cancellationError)}`);
  }

  await createFlow(api).solve(0, 2, { executor: 'worker' });
  return {
    id: 'network_flow.worker.lifecycle' as const,
    name: 'Network Flow worker cancels and recovers' as const,
    solver: 'network-flow' as const,
    ok: true as const,
  };
}
