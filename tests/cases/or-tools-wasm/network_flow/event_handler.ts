type NetworkFlowEventHandlerApi = {
  SimpleMaxFlow: new () => {
    addArcWithCapacity(tail: number, head: number, capacity: number): number;
    solve(options: {
      source: number;
      sink: number;
      executor: 'direct' | 'worker';
      onEvent?: (event: unknown) => void;
    }): Promise<{ optimalFlow: bigint }>;
  };
};

function createFlow(api: NetworkFlowEventHandlerApi) {
  const flow = new api.SimpleMaxFlow();
  flow.addArcWithCapacity(0, 1, 10);
  flow.addArcWithCapacity(1, 2, 10);
  return flow;
}

async function assertCallbackRecovery(
  api: NetworkFlowEventHandlerApi,
  executor: 'direct' | 'worker',
) {
  const flow = createFlow(api);
  const callbackError = new Error(`${executor} callback failed`);
  let thrown: unknown;
  try {
    await flow.solve({ source: 0, sink: 2,
      executor,
      onEvent: () => { throw callbackError; },
    });
  } catch (error) {
    thrown = error;
  }
  if (thrown !== callbackError) {
    throw new Error(`${executor}: expected original callback error, got ${String(thrown)}`);
  }
  const result = await flow.solve({ source: 0, sink: 2, executor });
  if (result.optimalFlow !== 10n) {
    throw new Error(`${executor}: expected recovery flow 10, got ${result.optimalFlow}`);
  }
}

export async function runNetworkFlowEventHandlerCase(api: NetworkFlowEventHandlerApi) {
  await assertCallbackRecovery(api, 'direct');
  await assertCallbackRecovery(api, 'worker');
  return {
    id: 'network_flow.event-handler.recovery' as const,
    name: 'Network Flow isolates event-handler errors and recovers' as const,
    solver: 'network-flow' as const,
    ok: true as const,
  };
}
