type CpSatConcurrencyApi = {
  CpSat: {
    createModel(model: object): Promise<Uint8Array>;
    solve(
      model: Uint8Array,
      options: { executor: 'direct' },
    ): Promise<{ bytes: Uint8Array }>;
  };
  CpModel: new () => object;
  CpSolver: new () => {
    solve(model: object, options: { executor: 'direct' }): Promise<unknown>;
  };
};

export type CpSatConcurrencyResult = {
  id: 'cp_sat.executor.concurrency';
  name: 'CP-SAT rejects unsafe local solve concurrency';
  solver: 'cp-sat';
  ok: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectError(
  promise: Promise<unknown>,
  expectedName: string,
  message: string,
) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error, `${message}: expected an error`);
  assert(
    caught.name === expectedName,
    `${message}: expected ${expectedName}, got ${caught.name}`,
  );
}

export async function runCpSatConcurrencyCase(
  api: CpSatConcurrencyApi,
): Promise<CpSatConcurrencyResult> {
  const modelBytes = await api.CpSat.createModel({ name: 'direct_concurrency' });
  const directSolve = api.CpSat.solve(modelBytes, { executor: 'direct' });
  await expectError(
    api.CpSat.solve(modelBytes, { executor: 'direct' }),
    'SolverExecutorBusyError',
    'concurrent direct solve',
  );
  await directSolve;
  const directRecovery = await api.CpSat.solve(modelBytes, { executor: 'direct' });
  assert(directRecovery.bytes.length > 0, 'direct executor must recover after its active solve');

  const solver = new api.CpSolver();
  const model = new api.CpModel();
  const highLevelSolve = solver.solve(model, { executor: 'direct' });
  await expectError(
    solver.solve(model, { executor: 'direct' }),
    'RuntimeError',
    'concurrent solve on one CpSolver',
  );
  await highLevelSolve;
  await solver.solve(model, { executor: 'direct' });

  return {
    id: 'cp_sat.executor.concurrency',
    name: 'CP-SAT rejects unsafe local solve concurrency',
    solver: 'cp-sat',
    ok: true,
  };
}
