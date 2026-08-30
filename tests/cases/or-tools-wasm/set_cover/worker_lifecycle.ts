type SetCoverWorkerApi = {
  SetCoverModel: new () => {
    addEmptySubset(cost: number): void;
    addElementToLastSubset(element: number): void;
  };
  SetCoverInvariant: new (model: any) => unknown;
  GreedySolutionGenerator: new (invariant: any) => {
    nextSolution(focus: undefined, options: {
      executor: 'worker';
      signal?: AbortSignal;
    }): Promise<boolean>;
  };
};

function createGenerator(api: SetCoverWorkerApi) {
  const model = new api.SetCoverModel();
  model.addEmptySubset(1);
  model.addElementToLastSubset(0);
  return new api.GreedySolutionGenerator(new api.SetCoverInvariant(model));
}

export async function runSetCoverWorkerLifecycleCase(api: SetCoverWorkerApi) {
  const controller = new AbortController();
  const activeSolve = createGenerator(api).nextSolution(undefined, {
    executor: 'worker',
    signal: controller.signal,
  });

  let busyError: unknown;
  try {
    await createGenerator(api).nextSolution(undefined, { executor: 'worker' });
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

  await createGenerator(api).nextSolution(undefined, { executor: 'worker' });
  return {
    id: 'set_cover.worker.lifecycle' as const,
    name: 'Set Cover worker cancels and recovers' as const,
    solver: 'set-cover' as const,
    ok: true as const,
  };
}
