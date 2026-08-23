type CpSatWorkerApi = {
  createModel(model: object): Promise<Uint8Array>;
  solve(
    model: Uint8Array,
    options: {
      executor: 'worker';
      signal?: AbortSignal;
      maxTimeInSeconds?: number;
    },
  ): Promise<{ bytes: Uint8Array }>;
};

export type CpSatWorkerLifecycleResult = {
  id: 'cp_sat.worker.lifecycle';
  name: 'CP-SAT worker enforces one active job and recovers after cancellation';
  solver: 'cp-sat';
  ok: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runCpSatWorkerLifecycleCase(
  CpSat: CpSatWorkerApi,
): Promise<CpSatWorkerLifecycleResult> {
  const model = await CpSat.createModel({ name: 'worker_lifecycle' });
  const controller = new AbortController();
  const activeSolve = CpSat.solve(model, {
    executor: 'worker',
    signal: controller.signal,
    maxTimeInSeconds: 30,
  });

  let busyError: unknown;
  try {
    await CpSat.solve(model, { executor: 'worker' });
  } catch (error) {
    busyError = error;
  }
  assert(busyError instanceof Error, 'a concurrent worker solve must fail');
  assert(
    busyError.name === 'SolverExecutorBusyError',
    `expected SolverExecutorBusyError, got ${busyError.name}`,
  );

  controller.abort('worker lifecycle test');
  let cancellationError: unknown;
  try {
    await activeSolve;
  } catch (error) {
    cancellationError = error;
  }
  assert(cancellationError instanceof Error, 'cancelled worker solve must fail');
  assert(
    cancellationError.name === 'AbortError',
    `expected AbortError, got ${cancellationError.name}`,
  );

  const recovered = await CpSat.solve(model, { executor: 'worker' });
  assert(recovered.bytes.length > 0, 'worker must solve again after cancellation');

  return {
    id: 'cp_sat.worker.lifecycle',
    name: 'CP-SAT worker enforces one active job and recovers after cancellation',
    solver: 'cp-sat',
    ok: true,
  };
}
