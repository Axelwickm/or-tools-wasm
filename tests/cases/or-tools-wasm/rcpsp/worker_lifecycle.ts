type RcpspWorkerApi = {
  RcpspModelBuilder: new (name?: string) => {
    addResource(input: { name: string; capacity: number }): any;
    addActivity(input: { name: string; duration: number; demands: Record<string, number> }): any;
    build(): {
      solve(options: {
        executor: 'worker';
        signal?: AbortSignal;
        maxTimeInSeconds?: number;
      }): Promise<{ statusName: string }>;
    };
  };
};

function createProblem(api: RcpspWorkerApi) {
  return new api.RcpspModelBuilder('worker_lifecycle')
    .addResource({ name: 'crew', capacity: 1 })
    .addActivity({ name: 'task', duration: 1, demands: { crew: 1 } })
    .build();
}

export async function runRcpspWorkerLifecycleCase(api: RcpspWorkerApi) {
  const controller = new AbortController();
  const activeSolve = createProblem(api).solve({
    executor: 'worker',
    signal: controller.signal,
    maxTimeInSeconds: 30,
  });

  let busyError: unknown;
  try {
    await createProblem(api).solve({ executor: 'worker' });
  } catch (error) {
    busyError = error;
  }
  if (!(busyError instanceof Error) || busyError.name !== 'SolverExecutorBusyError') {
    throw new Error(`expected SolverExecutorBusyError, got ${String(busyError)}`);
  }

  controller.abort('worker lifecycle test');
  let cancellationError: unknown;
  try {
    await activeSolve;
  } catch (error) {
    cancellationError = error;
  }
  if (!(cancellationError instanceof Error) || cancellationError.name !== 'AbortError') {
    throw new Error(`expected AbortError, got ${String(cancellationError)}`);
  }

  const recovered = await createProblem(api).solve({ executor: 'worker' });
  if (recovered.statusName !== 'OPTIMAL' && recovered.statusName !== 'FEASIBLE') {
    throw new Error(`expected successful recovery, got ${recovered.statusName}`);
  }

  return {
    id: 'rcpsp.worker.lifecycle' as const,
    name: 'RCPSP worker cancels and recovers' as const,
    solver: 'rcpsp' as const,
    ok: true as const,
  };
}
