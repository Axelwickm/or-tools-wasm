type MpSolverConcurrencyApi = {
  MPSolver: {
    GLOP_LINEAR_PROGRAMMING: number;
    createModelRequest(request: object): Promise<Uint8Array>;
    solveModelRequest(
      request: Uint8Array,
      options: { executor: 'direct' },
    ): Promise<{ bytes: Uint8Array }>;
  };
};

export type MpSolverConcurrencyResult = {
  id: 'mp_solver.executor.concurrency';
  name: 'MP Solver rejects unsafe local solve concurrency';
  solver: 'mp-solver';
  ok: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectBusy(promise: Promise<unknown>, message: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error, `${message}: expected an error`);
  assert(
    caught.name === 'SolverExecutorBusyError',
    `${message}: expected SolverExecutorBusyError, got ${caught.name}`,
  );
}

export async function runMpSolverConcurrencyCase(
  api: MpSolverConcurrencyApi,
): Promise<MpSolverConcurrencyResult> {
  const request = await api.MPSolver.createModelRequest({
    solverType: api.MPSolver.GLOP_LINEAR_PROGRAMMING,
    model: {
      maximize: true,
      variable: [{
        lowerBound: 0,
        upperBound: 1,
        objectiveCoefficient: 1,
        name: 'x',
      }],
    },
  });
  const directSolve = api.MPSolver.solveModelRequest(request, { executor: 'direct' });
  await expectBusy(
    api.MPSolver.solveModelRequest(request, { executor: 'direct' }),
    'concurrent direct solve',
  );
  await directSolve;
  const recovery = await api.MPSolver.solveModelRequest(request, { executor: 'direct' });
  assert(recovery.bytes.length > 0, 'direct executor must recover after its active solve');

  return {
    id: 'mp_solver.executor.concurrency',
    name: 'MP Solver rejects unsafe local solve concurrency',
    solver: 'mp-solver',
    ok: true,
  };
}
