type RcpspConcurrencyApi = {
  RcpspModelBuilder: new (name?: string) => {
    addResource(input: { name: string; capacity: number }): any;
    addActivity(input: { name: string; duration: number; demands: Record<string, number> }): any;
    build(): {
      solve(options: { executor: 'direct' | 'worker' }): Promise<unknown>;
    };
  };
};

function createProblem(api: RcpspConcurrencyApi) {
  return new api.RcpspModelBuilder('concurrency')
    .addResource({ name: 'crew', capacity: 1 })
    .addActivity({ name: 'task', duration: 1, demands: { crew: 1 } })
    .build();
}

async function expectError(promise: Promise<unknown>, expectedName: string, label: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof Error) || caught.name !== expectedName) {
    throw new Error(`${label}: expected ${expectedName}, got ${String(caught)}`);
  }
}

export async function runRcpspConcurrencyCase(api: RcpspConcurrencyApi) {
  const first = createProblem(api);
  const second = createProblem(api);
  const directSolve = first.solve({ executor: 'direct' });
  await expectError(
    second.solve({ executor: 'direct' }),
    'SolverExecutorBusyError',
    'concurrent direct solve',
  );
  await directSolve;
  await second.solve({ executor: 'direct' });

  const shared = createProblem(api);
  const workerSolve = shared.solve({ executor: 'worker' });
  await expectError(
    shared.solve({ executor: 'direct' }),
    'RuntimeError',
    'concurrent solve on one RcpspProblem',
  );
  await workerSolve;
  await shared.solve({ executor: 'direct' });

  return {
    id: 'rcpsp.executor.concurrency' as const,
    name: 'RCPSP rejects unsafe solve concurrency' as const,
    solver: 'rcpsp' as const,
    ok: true as const,
  };
}
