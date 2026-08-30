type SetCoverConcurrencyApi = {
  SetCoverModel: new () => {
    addEmptySubset(cost: number): void;
    addElementToLastSubset(element: number): void;
  };
  SetCoverInvariant: new (model: any) => unknown;
  GreedySolutionGenerator: new (invariant: any) => {
    nextSolution(focus: undefined, options: { executor: 'direct' | 'worker' }): Promise<boolean>;
  };
};

function createGenerator(api: SetCoverConcurrencyApi) {
  const model = new api.SetCoverModel();
  model.addEmptySubset(1);
  model.addElementToLastSubset(0);
  const invariant = new api.SetCoverInvariant(model);
  return new api.GreedySolutionGenerator(invariant);
}

export async function runSetCoverConcurrencyCase(api: SetCoverConcurrencyApi) {
  const first = createGenerator(api);
  const second = createGenerator(api);
  const activeSolve = first.nextSolution(undefined, { executor: 'direct' });

  let busyError: unknown;
  try {
    await second.nextSolution(undefined, { executor: 'direct' });
  } catch (error) {
    busyError = error;
  }
  if (!(busyError instanceof Error) || busyError.name !== 'SolverExecutorBusyError') {
    throw new Error(`expected SolverExecutorBusyError, got ${String(busyError)}`);
  }
  await activeSolve;
  await second.nextSolution(undefined, { executor: 'direct' });

  const shared = createGenerator(api);
  const workerSolve = shared.nextSolution(undefined, { executor: 'worker' });
  let instanceError: unknown;
  try {
    await shared.nextSolution(undefined, { executor: 'direct' });
  } catch (error) {
    instanceError = error;
  }
  if (!(instanceError instanceof Error) || instanceError.name !== 'RuntimeError') {
    throw new Error(`expected RuntimeError, got ${String(instanceError)}`);
  }
  await workerSolve;
  await shared.nextSolution(undefined, { executor: 'direct' });

  return {
    id: 'set_cover.executor.concurrency' as const,
    name: 'Set Cover rejects unsafe solve concurrency' as const,
    solver: 'set-cover' as const,
    ok: true as const,
  };
}
