import type * as Api from 'or-tools-wasm/rcpsp';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

// Independently check the RCPSP proto's level definition, aggregating simultaneous events.
function checkLevels(proto: Api.RcpspProblemProto, tasks: Api.RcpspScheduleTask[]) {
  const times = new Set([0n, ...tasks.map(task => task.start)]);
  for (const [resource, bounds] of (proto.resources ?? []).entries()) for (const time of times) {
    const level = tasks.reduce((sum, task) => sum + (task.start <= time ? BigInt(task.demands[resource]) : 0n), 0n);
    assert(level >= BigInt(bounds.minCapacity ?? 0) && level <= BigInt(bounds.maxCapacity ?? 0),
      `Resource ${resource} level ${level} outside bounds at ${time}`);
  }
  assert(tasks.every(task => task.start === task.end && task.duration === 0), 'Consumer events must have zero duration');
}

function checkInvestment(result: Api.RcpspSolveResult, proto: Api.RcpspProblemProto) {
  assert(result.resourceCapacities !== null, 'Investment solutions expose purchased capacities');
  assert(result.tasks.every(task => task.end <= BigInt(proto.deadline ?? 0)), 'All activities finish by the investment deadline');
  for (const time of result.tasks.map(task => task.start)) for (const [resource, capacity] of result.resourceCapacities.entries()) {
    const demand = result.tasks.reduce((sum, task) => sum +
      (task.start <= time && time < task.end ? BigInt(task.demands[resource]) : 0n), 0n);
    assert(demand <= capacity, 'Purchased capacity must cover concurrent native interval demand');
  }
  assert(result.makespan === result.tasks.reduce((maximum, task) => task.end > maximum ? task.end : maximum, 0n),
    'Investment makespan reports the actual maximum end, independently of the cost objective');
}

export async function runRcpspVariantCases(api: typeof Api) {
  const results: Array<{ id: string; name: string; solver: string; mode: (typeof executorFixtureModes)[number]; source: string;
    upstream: string; tags: string[]; ok: true }> = [];
  for (const mode of executorFixtureModes) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode, numWorkers: 1 };
    const record = (id: string, name: string) => results.push({ id: `rcpsp.variants.${id}`, name,
      solver: 'rcpsp', mode, source: 'ortools/scheduling/rcpsp.proto',
      upstream: 'examples/python/rcpsp_sat.py', tags: ['native-contract', 'scheduling', 'variants'], ok: true as const });

    const consumer: Api.RcpspProblemProto = { isConsumerProducer: true, isRcpspMax: true,
      resources: [{ minCapacity: 0, maxCapacity: 5 }], tasks: [
        { successors: [1], successorDelays: [{ recipeDelays: [{ minDelays: [2] }] }],
          recipes: [{ duration: 0, demands: [5] }] },
        { recipes: [{ duration: 0, demands: [-4] }] },
      ] };
    const consumerProblem = api.RcpspProblem.fromProto(consumer);
    const events: Extract<Api.RcpspEvent, { type: 'solution' }>[] = [];
    const produced = await consumerProblem.solve({ ...options, eventMask: { solution: true }, onEvent: event => {
      if (event.type === 'solution') { checkLevels(consumer, event.tasks); events.push(event); }
    } });
    assert(produced.statusName === 'OPTIMAL' && produced.makespan === 2n && produced.objectiveValue === 2,
      'Consumer/producer minimizes the makespan with signed start events and Max lags');
    assert(produced.tasks[0].start === 0n && produced.tasks[1].start === 2n, 'Native lags reach the reservoir');
    assert(produced.resourceCapacities === null
      && events.length > 0 && events.every(event => event.resourceCapacities === null), 'Only investment has purchased capacities');
    checkLevels(consumer, produced.tasks);
    assert((await consumerProblem.solve(options)).makespan === 2n, 'Consumer problems are reusable');
    record('signed_events', 'Signed reservoir events, minimum lags, callbacks and reuse');

    for (const [minimum, maximum, demand] of [[2, 4, 3], [-4, -2, -3], [3, 3, 3]] as const) {
      const proto: Api.RcpspProblemProto = { isConsumerProducer: true, horizon: 3,
        resources: [{ minCapacity: minimum, maxCapacity: maximum, renewable: false }],
        tasks: [{ recipes: [{ demands: [demand] }] }] };
      const result = await api.RcpspProblem.fromProto(proto).solve(options);
      assert(result.statusName === 'OPTIMAL' && result.tasks[0].start === 0n, 'Bounds excluding zero require an event at time zero');
      checkLevels(proto, result.tasks);
      const noEvents = await api.RcpspProblem.fromProto({ ...proto, tasks: [] }).solve(options);
      assert(noEvents.statusName === 'INFEASIBLE', 'No events cannot satisfy bounds excluding zero');
      const late = await api.RcpspProblem.fromProto({ ...proto, isRcpspMax: true, tasks: [
        { successors: [1], recipes: [{}], successorDelays: [{ recipeDelays: [{ minDelays: [1] }] }] },
        proto.tasks![0],
      ] }).solve(options);
      assert(late.statusName === 'INFEASIBLE', 'An event forced after zero cannot satisfy the initial level');
    }
    const simultaneous: Api.RcpspProblemProto = { isConsumerProducer: true, horizon: 0,
      resources: [{ minCapacity: 2, maxCapacity: 4 }, { minCapacity: -4, maxCapacity: -2 }],
      tasks: [{ recipes: [{ demands: [6, -6] }] }, { recipes: [{ demands: [-3, 3] }] }] };
    const atZero = await api.RcpspProblem.fromProto(simultaneous).solve(options);
    assert(atZero.statusName === 'OPTIMAL' && atZero.makespan === 0n, 'Simultaneous events are checked as one level change');
    checkLevels(simultaneous, atZero.tasks);
    record('initial_levels', 'Positive and negative bounds, simultaneous events and native infeasibility');

    const multimode: Api.RcpspProblemProto = { isConsumerProducer: true, isRcpspMax: true,
      resources: [{ maxCapacity: 4 }], tasks: [
        { successors: [1], recipes: [{ demands: [2, 2], resources: [0, 0] }, { demands: [7] }],
          successorDelays: [{ recipeDelays: [{ minDelays: [1] }, { minDelays: [1] }] }] },
        { recipes: [{ demands: [-4] }] },
      ] };
    const selected = await api.RcpspProblem.fromProto(multimode).solve(options);
    assert(selected.statusName === 'OPTIMAL' && selected.makespan === 1n && selected.tasks[0].selectedRecipe === 0
      && selected.tasks[0].demands[0] === 4, 'Only selected recipe events contribute, including repeated resource entries');
    checkLevels(multimode, selected.tasks);
    const wide: Api.RcpspProblemProto = { isConsumerProducer: true,
      resources: [{ minCapacity: -Number.MAX_SAFE_INTEGER, maxCapacity: Number.MAX_SAFE_INTEGER }],
      tasks: [{ recipes: [{ demands: [-Number.MAX_SAFE_INTEGER] }] }] };
    const exact = await api.RcpspProblem.fromProto(wide).solve(options);
    assert(exact.statusName === 'OPTIMAL', 'Shifting safe-integer bounds preserves a range wider than a safe number');
    checkLevels(wide, exact.tasks);
    record('recipe_reservoirs', 'Native active reservoir literals and exact shifted bounds');

    const investment: Api.RcpspProblemProto = { isResourceInvestment: true, deadline: 2, horizon: 1,
      resources: [{ maxCapacity: 10, unitCost: 4, renewable: false }],
      tasks: [{ recipes: [{ duration: 2, demands: [2] }] }, { recipes: [{ duration: 2, demands: [3] }] }] };
    const capacityEvents: Extract<Api.RcpspEvent, { type: 'solution' }>[] = [];
    const invested = await api.RcpspProblem.fromProto(investment).solve({ ...options,
      eventMask: { solution: true }, onEvent: event => { if (event.type === 'solution') capacityEvents.push(event); } });
    assert(invested.statusName === 'OPTIMAL' && invested.resourceCapacities![0] === 5n && invested.objectiveValue === 20,
      'The deadline governs investment domains and forces enough renewable capacity even with renewable=false');
    checkInvestment(invested, investment);
    assert(capacityEvents.length > 0 && capacityEvents.every(event => event.resourceCapacities !== null
      && event.objectiveValue === Number(event.resourceCapacities[0]) * 4), 'Callbacks report purchased capacities and investment cost');
    const relaxedProto = { ...investment, deadline: 4 };
    const relaxed = await api.RcpspProblem.fromProto(relaxedProto).solve(options);
    assert(relaxed.statusName === 'OPTIMAL' && relaxed.resourceCapacities![0] === 3n && relaxed.objectiveValue === 12,
      'A later deadline permits sequential tasks and cheaper capacity');
    checkInvestment(relaxed, relaxedProto);
    const limited = await api.RcpspProblem.fromProto({ ...investment, resources: [{ maxCapacity: 4, unitCost: 4 }] }).solve(options);
    assert(limited.statusName === 'INFEASIBLE' && limited.resourceCapacities === null && limited.makespan === null
      && limited.tasks.length === 0, 'Declared capacity limits remain hard native bounds');
    record('capacity_cost', 'Investment deadlines, costs, capacity limits and callback results');

    const tradeoff: Api.RcpspProblemProto = { isResourceInvestment: true, deadline: 1,
      resources: [{ maxCapacity: -1, unitCost: 1 }, { maxCapacity: -1, unitCost: 3 }], tasks: [
        { recipes: [{ duration: 1, demands: [5, 1] }, { duration: 1, demands: [2, 4] }] },
      ] };
    const cheaper = await api.RcpspProblem.fromProto(tradeoff).solve(options);
    assert(cheaper.statusName === 'OPTIMAL' && cheaper.objectiveValue === 8 && cheaper.tasks[0].selectedRecipe === 0
      && cheaper.resourceCapacities![0] === 5n && cheaper.resourceCapacities![1] === 1n, 'Native search selects the weighted capacity tradeoff');
    checkInvestment(cheaper, tradeoff);
    const large: Api.RcpspProblemProto = { isResourceInvestment: true, deadline: 1,
      resources: [{ maxCapacity: -1, unitCost: 1 }], tasks: [0, 1].map(() =>
        ({ recipes: [{ duration: 1, demands: [Number.MAX_SAFE_INTEGER] }] })) };
    const largeResult = await api.RcpspProblem.fromProto(large).solve(options);
    assert(largeResult.statusName === 'OPTIMAL' && largeResult.resourceCapacities![0] === 2n * BigInt(Number.MAX_SAFE_INTEGER),
      'Native capacity variables and fallback bounds stay exact beyond Number safe range');
    checkInvestment(largeResult, large);
    for (const tasks of [[], [{ recipes: [{ duration: 0, demands: [7] }] }]]) {
      const zero = await api.RcpspProblem.fromProto({ isResourceInvestment: true, deadline: 0,
        resources: [{ maxCapacity: -1, unitCost: 1 }], tasks }).solve(options);
      assert(zero.statusName === 'OPTIMAL' && zero.makespan === 0n && zero.resourceCapacities![0] === 0n
        && zero.objectiveValue === 0, 'Zero-duration intervals and empty projects need no purchased capacity');
    }
    record('investment_recipes', 'Weighted recipes, unbounded-capacity domains and exact capacity results');

    for (const invalid of [
      { isConsumerProducer: true, isResourceInvestment: true },
      { isConsumerProducer: true, tasks: [{ recipes: [{ duration: 1 }] }] },
      { isConsumerProducer: true, resources: [{ minCapacity: 3, maxCapacity: 2 }] },
      { isResourceInvestment: true, resources: [{ maxCapacity: -2 }] },
      { isResourceInvestment: true, resources: [{ maxCapacity: 1, unitCost: -1 }] },
      { isResourceInvestment: true, resources: [{ maxCapacity: 1 }], tasks: [{ recipes: [{ demands: [-1] }] }] },
    ]) {
      let rejected = false; try { api.RcpspProblem.fromProto(invalid); } catch { rejected = true; }
      assert(rejected, 'Malformed variant inputs reject before native execution');
    }
    const generated = api.RcpspProblem.fromProto(tradeoff).toCpSatModel().modelProto;
    const cumulative = generated.constraints!.filter(constraint => constraint.cumulative).map(constraint => constraint.cumulative!);
    assert(cumulative.length === 2 && cumulative.every(constraint => constraint.capacity!.vars!.length === 1),
      'Investment uses native cumulative capacities');
    const objectiveNames = generated.objective!.vars!.map(index => generated.variables![index].name);
    assert(objectiveNames.every(name => name!.endsWith('_capacity')) && !objectiveNames.includes('makespan')
      && generated.objective!.coeffs!.join(',') === '1,3', 'The objective is weighted capacity cost without a makespan tie-break');
    record('variant_validation', 'Native model primitives, objective shape and basic input validation');
  }
  return results;
}
