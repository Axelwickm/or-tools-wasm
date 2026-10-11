import type * as Api from 'or-tools-wasm/rcpsp';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function rejects(action: () => unknown) {
  let rejected = false; try { action(); } catch { rejected = true; }
  assert(rejected, 'Unsafe scheduling input must reject');
}

export async function runRcpspNumericalCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode, numWorkers: 1 };
    const builder = new api.RcpspModelBuilder('recovery');
    for (const capacity of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      rejects(() => builder.addResource({ name: 'crew', capacity }));
    builder.addResource({ name: 'crew', capacity: 2 });
    for (const name of ['source', 'sink']) rejects(() => builder.addActivity({ name, duration: 1 }));
    const activity = { name: 'work', duration: 3, demands: { crew: 2 }, successors: [] as string[] };
    builder.addActivity(activity); activity.demands.crew = 99; activity.successors.push('missing');
    const result = await builder.build().solve(options);
    assert(result.statusName === 'OPTIMAL' && result.makespan === 3n && result.tasks[1].demands[0] === 2,
      'Rejected resources reserve no name, and accepted activities capture nested input');
    const exported = builder.build().exportModelAsProto(); exported.tasks![1].recipes![0].duration = 99;
    assert((await builder.build().solve(options)).makespan === 3n, 'Built problems remain independent of exported snapshots');
    results.push({ id: 'rcpsp.numerical.builder_ownership_and_recovery',
      name: 'Builder mutations preserve names and activity snapshots', solver: 'rcpsp', mode,
      source: 'javascript/lib/rcpsp/api.ts', tags: ['native-contract', 'ownership', 'recovery'], ok: true as const });

    const large = new api.RcpspProblem({ resources: [{ maxCapacity: Number.MAX_SAFE_INTEGER }], tasks: [{
      recipes: [{ duration: 2147483650, resources: [0, 0], demands: [Number.MAX_SAFE_INTEGER - 1, 1] }],
    }] });
    const solved = await large.solve(options);
    assert(solved.statusName === 'OPTIMAL' && solved.makespan === 2147483650n &&
      solved.tasks[0].demands[0] === Number.MAX_SAFE_INTEGER,
      'Native CP-SAT receives exact safe values and duplicate resource totals beyond int32');
    const unsafe = new api.RcpspProblem({ resources: [{ maxCapacity: Number.MAX_SAFE_INTEGER }], tasks: [{
      recipes: [{ duration: 1, resources: [0, 0], demands: [Number.MAX_SAFE_INTEGER, 1] }],
    }] });
    rejects(() => unsafe.toCpSatModel());
    rejects(() => new api.RcpspProblem({ tasks: [
      { recipes: [{ duration: Number.MAX_SAFE_INTEGER }] }, { recipes: [{ duration: 1 }] },
    ] }));
    assert((await large.solve(options)).makespan === 2147483650n && (await builder.build().solve(options)).makespan === 3n,
      'Unsafe aggregation rejects before native conversion and does not poison subsequent solves');
    results.push({ id: 'rcpsp.numerical.exact_values_and_aggregation',
      name: 'Exact durations and demands with safe aggregation', solver: 'rcpsp', mode,
      source: 'javascript/lib/rcpsp/api.ts', tags: ['native-contract', 'numerical'], ok: true as const });
  }
  return results;
}
