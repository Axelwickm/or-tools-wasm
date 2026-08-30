type SetCoverEventHandlerApi = {
  SetCoverModel: new () => {
    addEmptySubset(cost: number): void;
    addElementToLastSubset(element: number): void;
  };
  SetCoverInvariant: new (model: any) => {
    numUncoveredElements(): number;
  };
  GreedySolutionGenerator: new (invariant: any) => {
    nextSolution(focus: undefined, options: {
      executor: 'direct' | 'worker';
      onEvent?: (event: unknown) => void;
    }): Promise<boolean>;
  };
};

function createGenerator(api: SetCoverEventHandlerApi) {
  const model = new api.SetCoverModel();
  model.addEmptySubset(1);
  model.addElementToLastSubset(0);
  const invariant = new api.SetCoverInvariant(model);
  return { generator: new api.GreedySolutionGenerator(invariant), invariant };
}

async function assertCallbackRecovery(
  api: SetCoverEventHandlerApi,
  executor: 'direct' | 'worker',
) {
  const { generator, invariant } = createGenerator(api);
  const callbackError = new Error(`${executor} callback failed`);
  let thrown: unknown;
  try {
    await generator.nextSolution(undefined, {
      executor,
      onEvent: () => { throw callbackError; },
    });
  } catch (error) {
    thrown = error;
  }
  if (thrown !== callbackError) {
    throw new Error(`${executor}: expected original callback error, got ${String(thrown)}`);
  }
  await generator.nextSolution(undefined, { executor });
  if (invariant.numUncoveredElements() !== 0) {
    throw new Error(`${executor}: expected a feasible solution after recovery`);
  }
}

export async function runSetCoverEventHandlerCase(api: SetCoverEventHandlerApi) {
  await assertCallbackRecovery(api, 'direct');
  await assertCallbackRecovery(api, 'worker');
  return {
    id: 'set_cover.event-handler.recovery' as const,
    name: 'Set Cover isolates event-handler errors and recovers' as const,
    solver: 'set-cover' as const,
    ok: true as const,
  };
}
