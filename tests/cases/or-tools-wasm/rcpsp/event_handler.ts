type RcpspEventHandlerApi = {
  RcpspModelBuilder: new (name?: string) => {
    addResource(input: { name: string; capacity: number }): any;
    addActivity(input: { name: string; duration: number; demands: Record<string, number> }): any;
    build(): {
      solve(options: {
        executor: 'direct' | 'worker';
        onEvent?: (event: unknown) => void;
      }): Promise<{ statusName: string }>;
    };
  };
};

function createProblem(api: RcpspEventHandlerApi) {
  return new api.RcpspModelBuilder('event_handler')
    .addResource({ name: 'crew', capacity: 1 })
    .addActivity({ name: 'task', duration: 1, demands: { crew: 1 } })
    .build();
}

async function assertCallbackRecovery(
  api: RcpspEventHandlerApi,
  executor: 'direct' | 'worker',
) {
  const problem = createProblem(api);
  const callbackError = new Error(`${executor} callback failed`);
  let thrown: unknown;
  try {
    await problem.solve({
      executor,
      onEvent: () => { throw callbackError; },
    });
  } catch (error) {
    thrown = error;
  }
  if (thrown !== callbackError) {
    throw new Error(`${executor}: expected original callback error, got ${String(thrown)}`);
  }
  const recovered = await problem.solve({ executor });
  if (recovered.statusName !== 'OPTIMAL' && recovered.statusName !== 'FEASIBLE') {
    throw new Error(`${executor}: expected successful recovery, got ${recovered.statusName}`);
  }
}

export async function runRcpspEventHandlerCase(api: RcpspEventHandlerApi) {
  await assertCallbackRecovery(api, 'direct');
  await assertCallbackRecovery(api, 'worker');
  return {
    id: 'rcpsp.event-handler.recovery' as const,
    name: 'RCPSP isolates event-handler errors and recovers' as const,
    solver: 'rcpsp' as const,
    ok: true as const,
  };
}
