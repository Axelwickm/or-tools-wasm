type MpSolverWorkerApi = {
  MPSolver: {
    GLOP_LINEAR_PROGRAMMING: number;
    createModelRequest(request: object): Promise<Uint8Array>;
    solveModelRequest(
      request: Uint8Array,
      options: {
        executor: 'worker';
        signal?: AbortSignal;
      },
    ): Promise<{ bytes: Uint8Array }>;
  };
};

export type MpSolverWorkerLifecycleResult = {
  id: 'mp_solver.worker.lifecycle';
  name: 'MP Solver worker cancels and recovers';
  solver: 'mp-solver';
  ok: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runMpSolverWorkerLifecycleCase(
  api: MpSolverWorkerApi,
): Promise<MpSolverWorkerLifecycleResult> {
  const request = await api.MPSolver.createModelRequest({
    solverType: api.MPSolver.GLOP_LINEAR_PROGRAMMING,
    model: {
      name: 'worker_lifecycle',
      maximize: true,
      variable: Array.from({ length: 400 }, (_, index) => ({
        lowerBound: 0,
        upperBound: 1,
        objectiveCoefficient: index + 1,
        name: `x${index}`,
      })),
      constraint: Array.from({ length: 100 }, (_, row) => ({
        lowerBound: 0,
        upperBound: 250,
        varIndex: Array.from({ length: 400 }, (_, index) => index),
        coefficient: Array.from(
          { length: 400 },
          (_, index) => ((row + 1) * (index + 3)) % 17,
        ),
      })),
    },
  });
  const controller = new AbortController();
  const activeSolve = api.MPSolver.solveModelRequest(request, {
    executor: 'worker',
    signal: controller.signal,
  });

  let busyError: unknown;
  try {
    await api.MPSolver.solveModelRequest(request, { executor: 'worker' });
  } catch (error) {
    busyError = error;
  }
  assert(busyError instanceof Error, 'a concurrent worker solve must fail');
  assert(
    busyError.name === 'SolverExecutorBusyError',
    `expected SolverExecutorBusyError, got ${busyError.name}`,
  );

  controller.abort('MP Solver worker lifecycle test');
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

  const recovery = await api.MPSolver.solveModelRequest(request, {
    executor: 'worker',
  });
  assert(recovery.bytes.length > 0, 'worker must solve again after cancellation');

  return {
    id: 'mp_solver.worker.lifecycle',
    name: 'MP Solver worker cancels and recovers',
    solver: 'mp-solver',
    ok: true,
  };
}
