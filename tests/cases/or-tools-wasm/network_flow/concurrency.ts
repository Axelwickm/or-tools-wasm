type NetworkFlowConcurrencyApi = {
  SimpleMaxFlow: new () => {
    addArcWithCapacity(tail: number, head: number, capacity: number): number;
    setArcCapacity(arc: number, capacity: number): void;
    solve(options: { source: number; sink: number; executor: 'direct' | 'worker' }): Promise<{ optimalFlow: bigint }>;
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
  const activeSolve = first.solve({ source: 0, sink: 2, executor: 'direct' });

  let busyError: unknown;
  try {
    await second.solve({ source: 0, sink: 2, executor: 'direct' });
  } catch (error) {
    busyError = error;
  }
  if (!(busyError instanceof Error) || busyError.name !== 'SolverExecutorBusyError') {
    throw new Error(`expected SolverExecutorBusyError, got ${String(busyError)}`);
  }
  await activeSolve;
  await second.solve({ source: 0, sink: 2, executor: 'direct' });

  const shared = createFlow(api);
  const workerSolve = shared.solve({ source: 0, sink: 2, executor: 'worker' });
  shared.setArcCapacity(0, 4); shared.setArcCapacity(1, 4);
  const directSolve = shared.solve({ source: 0, sink: 2, executor: 'direct' });
  const [worker, direct] = await Promise.all([workerSolve, directSolve]);
  if (worker.optimalFlow !== 10n || direct.optimalFlow !== 4n) {
    throw new Error('Concurrent flow results must use their own captured inputs');
  }

  return {
    id: 'network_flow.executor.concurrency' as const,
    name: 'Network Flow rejects unsafe solve concurrency' as const,
    solver: 'network-flow' as const,
    ok: true as const,
  };
}
