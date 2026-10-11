import type * as Api from 'or-tools-wasm/rcpsp';

type RcpspConcurrencyBuilder = {
  addResource(input: { name: string; capacity: number }): RcpspConcurrencyBuilder;
  addActivity(input: { name: string; duration: number; demands: Record<string, number> }): RcpspConcurrencyBuilder;
  build(): {
    solve(options: { executor: 'direct' | 'worker'; numWorkers?: number; signal?: AbortSignal;
      eventMask?: { solution?: boolean }; onEvent?: (event: Api.RcpspEvent) => void }):
      Promise<Pick<Api.RcpspSolveResult, 'statusName' | 'makespan' | 'tasks'>>;
  };
};
type RcpspConcurrencyApi = { RcpspModelBuilder: new (name?: string) => RcpspConcurrencyBuilder };

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
  const schedules: Api.RcpspEvent[][] = [[], []];
  const solutions = await Promise.all((['worker', 'direct'] as const).map((executor, index) => shared.solve({
    executor, numWorkers: 1, eventMask: { solution: true },
    onEvent: event => { schedules[index].push(event); },
  })));
  for (let index = 0; index < solutions.length; index++) {
    const result = solutions[index];
    if (result.statusName !== 'OPTIMAL' || result.makespan !== 1n || result.tasks[1].end !== 1n
      || !schedules[index].some(event => event.type === 'solution' && event.makespan === 1n)) {
      throw new Error('Independent solves must return complete schedules and deliver their own callbacks');
    }
  }
  solutions[0].tasks[1].end = 99n;
  if (solutions[1].tasks[1].end !== 1n) throw new Error('Concurrent result schedules must be independent');
  const controller = new AbortController();
  controller.abort();
  const active = shared.solve({ executor: 'direct', numWorkers: 1 });
  await expectError(shared.solve({ executor: 'worker', signal: controller.signal }), 'AbortError', 'pre-aborted independent solve');
  if ((await active).makespan !== 1n) throw new Error('A rejected solve must not interrupt an independent solve');
  await shared.solve({ executor: 'direct' });

  return {
    id: 'rcpsp.executor.concurrency' as const,
    name: 'RCPSP permits independent solves and respects executor concurrency' as const,
    solver: 'rcpsp' as const,
    ok: true as const,
  };
}
