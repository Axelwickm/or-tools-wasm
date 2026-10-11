import { runRcpspAdversarialCases } from '../adversarial.ts';
import type * as Api from 'or-tools-wasm/rcpsp';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import { multimodePsplib, repeatedJobPsplib, invalidPsplibCases } from './psplib_fixtures.ts';
import { runRcpspNumericalCases } from './numerical.ts';
import { runRcpspVariantCases } from './variants.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export async function runRcpspModelCorrectnessCases(api: typeof Api) {
  await runRcpspAdversarialCases(api);
  const results = await runRcpspNumericalCases(api);
  results.push(...await runRcpspVariantCases(api));
  for (const mode of executorFixtureModes) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode, numWorkers: 1 };
    for (const text of [multimodePsplib, repeatedJobPsplib]) {
      const problem = api.RcpspProblem.fromPsplib(text);
      const proto = problem.exportModelAsProto();
      assert(proto.resources!.length === 2 && proto.resources![1].renewable === false
        && proto.resources![1].maxCapacity === 3, 'Nonrenewable resource and budget must survive parsing');
      assert(proto.tasks![1].recipes!.length === 3 && proto.tasks![1].recipes![1].duration === 4,
        'Every mode must survive parsing in its declared order');
      const result = await problem.solve(options);
      assert(result.statusName === 'OPTIMAL' && result.makespan === 6n,
        `Parsed modes and nonrenewable budget must determine the native optimum (${mode})`);
      assert(result.tasks[1].selectedRecipe === 1 && result.tasks[1].duration === 4,
        'Native solve must select the middle mode rather than the last parsed mode');
      assert(result.tasks.reduce((sum, task) => sum + task.demands[1], 0) === 3,
        'Selected recipes must consume exactly the nonrenewable project budget');
      const relaxed = await api.RcpspProblem.fromPsplib(text.replace('\n 1 3\n', '\n 1 5\n')).solve(options);
      assert(relaxed.statusName === 'OPTIMAL' && relaxed.makespan === 3n && relaxed.tasks[1].selectedRecipe === 0,
        'A larger parsed budget must allow the faster mode');
      const overBudget = await api.RcpspProblem.fromPsplib(text.replace('\n 1 3\n', '\n 1 2\n')).solve(options);
      assert(overBudget.statusName === 'INFEASIBLE' && overBudget.makespan === null && overBudget.tasks.length === 0,
        'Nonrenewable demand cannot be hidden by recipe overwrites or ignored resources');
      const noRenewableCapacity = await api.RcpspProblem.fromPsplib(text.replace('\n 1 3\n', '\n 0 3\n')).solve(options);
      assert(noRenewableCapacity.statusName === 'INFEASIBLE', 'Renewable capacity must also reach native search');
      assert((await problem.solve(options)).makespan === 6n, 'Parsed problems must remain reusable');
    }
    for (const [name, text] of invalidPsplibCases) {
      let rejected = false;
      try { api.RcpspProblem.fromPsplib(text); } catch (error) {
        rejected = error instanceof Error && /RCPSP PSPLIB parser:/.test(error.message);
      }
      assert(rejected, `Invalid PSPLIB ${name} must fail before native conversion (${mode})`);
    }
    results.push({ id: 'rcpsp.model_correctness.psplib_modes_resources',
      name: 'PSPLIB preserves modes and renewable/nonrenewable budgets and rejects malformed input',
      solver: 'rcpsp', mode, source: 'javascript/lib/rcpsp/psplib.ts',
      tags: ['native-contract', 'psplib', 'resources'], ok: true as const });
    if (mode === 'server') {
      const shared = api.RcpspProblem.fromProto({ tasks: [{ recipes: [{ duration: 2 }] }] });
      const counts = [0, 0];
      const concurrent = await Promise.all(counts.map((_, index) => shared.solve({ ...options,
        eventMask: { solution: true }, onEvent: event => { if (event.type === 'solution') counts[index]++; },
      })));
      assert(concurrent.every(result => result.statusName === 'OPTIMAL' && result.makespan === 2n)
        && counts.every(count => count > 0), 'Concurrent solves on one problem must isolate results and observers');
      results.push({ id: 'rcpsp.model_correctness.concurrent_problem', name: 'Independent solves share an immutable problem',
        solver: 'rcpsp', mode, source: 'javascript/lib/rcpsp/api.ts', tags: ['native-contract', 'concurrency'], ok: true as const });
    }
    const ordinary: Api.RcpspProblemProto = { tasks: [
      { successors: [1], recipes: [{ duration: 4 }] }, { recipes: [{ duration: 3 }] },
    ] };
    const infeasible = await api.RcpspProblem.fromProto({ ...ordinary, deadline: 6 }).solve(options);
    assert(infeasible.statusName === 'INFEASIBLE' && infeasible.makespan === null && infeasible.tasks.length === 0,
      'A deadline before project completion must reject the schedule');
    for (const deadline of [0, 7]) {
      const result = await api.RcpspProblem.fromProto({ ...ordinary, deadline }).solve(options);
      assert(result.statusName === 'OPTIMAL' && result.makespan === 7n, 'Deadline zero/default and exact boundary must be preserved');
    }
    const disconnected = await api.RcpspProblem.fromProto({ tasks: [
      { recipes: [{ duration: 9 }] }, { recipes: [{ duration: 1 }] },
    ] }).solve(options);
    assert(disconnected.makespan === 9n, 'Makespan must include every activity, including disconnected ones');
    const empty = await api.RcpspProblem.fromProto({ tasks: [] }).solve(options);
    assert(empty.statusName === 'OPTIMAL' && empty.makespan === 0n, 'An empty project has zero makespan');

    const max: Api.RcpspProblemProto = { isRcpspMax: true, tasks: [
      { successors: [1], recipes: [{ duration: 0 }], successorDelays: [{ recipeDelays: [{ minDelays: [0, 0] }] }] },
      { successors: [2], recipes: [{ duration: 2 }, { duration: 5 }],
        successorDelays: [{ recipeDelays: [{ minDelays: [10, 3] }, { minDelays: [1, 8] }] }] },
      { successors: [3], recipes: [{ duration: 2 }, { duration: 1 }],
        successorDelays: [{ recipeDelays: [{ minDelays: [2] }, { minDelays: [1] }] }] },
      { recipes: [{ duration: 0 }] },
    ] };
    const problem = api.RcpspProblem.fromProto(max);
    const exported = problem.exportModelAsProto();
    assert(exported.tasks![1].successorDelays![0].recipeDelays![0].minDelays![0] === 10,
      'Export must retain minimum-delay matrices');
    exported.tasks![1].successorDelays![0].recipeDelays![0].minDelays![0] = 999;
    const selected = await problem.solve(options);
    assert(selected.statusName === 'OPTIMAL' && selected.makespan === 4n,
      'Native search must honor only the selected pair of recipe delays');
    assert(selected.tasks[1].selectedRecipe === 0 && selected.tasks[2].selectedRecipe === 1,
      'Delay matrices must use predecessor and successor recipe coordinates');
    assert(selected.tasks[2].start - selected.tasks[1].start >= 3n, 'Selected minimum delay was dropped');
    const impossibleMax = await api.RcpspProblem.fromProto({ ...max, deadline: 3 }).solve(options);
    assert(impossibleMax.statusName === 'INFEASIBLE', 'Deadline must apply to RCPSP/Max too');
    const overlap = await api.RcpspProblem.fromProto({ isRcpspMax: true, tasks: [
      { recipes: [{ duration: 6 }], successors: [1], successorDelays: [{ recipeDelays: [{ minDelays: [-2] }] }] },
      { recipes: [{ duration: 3 }] },
    ] }).solve(options);
    assert(overlap.statusName === 'OPTIMAL' && overlap.makespan === 6n,
      'Negative start-to-start lags must permit overlap and retain actual completion makespan');

    for (const invalid of [
      { ...ordinary, horizon: -1 }, { ...ordinary, horizon: Number.MAX_SAFE_INTEGER + 1 },
      { ...ordinary, deadline: -1 }, { ...max, tasks: [{ ...max.tasks![0], successorDelays: [] }, ...max.tasks!.slice(1)] },
      { ...max, tasks: [{ ...max.tasks![0], successorDelays: [{ recipeDelays: [{ minDelays: [0] }] }] }, ...max.tasks!.slice(1)] },
      { tasks: [{ recipes: [{ duration: 1, demands: [-1], resources: [0] }] }], resources: [{ maxCapacity: 1 }] },
      { tasks: [], resources: [{ maxCapacity: -1 }] },
      { ...max, isRcpspMax: false },
    ]) {
      let rejected = false;
      try { api.RcpspProblem.fromProto(invalid); } catch { rejected = true; }
      assert(rejected, 'Invalid scheduling inputs must fail before native conversion');
    }
    results.push({ id: 'rcpsp.model_correctness.deadlines_delays_makespan',
      name: 'RCPSP deadlines, recipe-dependent minimum delays and complete makespan',
      solver: 'rcpsp', mode, source: 'javascript/lib/rcpsp/api.ts',
      tags: ['native-contract', 'scheduling'], ok: true as const });
  }
  return results;
}
