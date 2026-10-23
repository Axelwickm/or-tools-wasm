import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown | Promise<unknown>, pattern?: RegExp) {
  try { await action(); } catch (error) { assert(error instanceof Error && (!pattern || pattern.test(error.message)), `Unexpected rejection: ${String(error)}`); return error; }
  throw new Error('Expected Routing rejection');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const routingRemainingNativeCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.pickup_delivery', name: 'Native pickup/delivery positions preserve alternative IDs and absent classifications', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetPickupPosition', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(5, 1, 0)), options = execution(mode);
    const pair = model.addPickupAndDeliverySets(model.addDisjunction([1, 2]), model.addDisjunction([3, 4]));
    for (const [index, delivery, alternativeIndex] of [[1, false, 0], [2, false, 1], [3, true, 0], [4, true, 1]] as const) {
      const position = await (delivery ? model.getDeliveryPosition(index, options) : model.getPickupPosition(index, options));
      assert(position?.pairIndex === pair && position.alternativeIndex === alternativeIndex, 'Native position identifies the pair and alternative');
      assert(await model.isPickup(index, options) === !delivery && await model.isDelivery(index, options) === delivery, 'Native classifications match positions');
      assert(await (delivery ? model.getPickupPosition(index, options) : model.getDeliveryPosition(index, options)) === null, 'Absent opposite position is null');
    }
    assert(await model.getPickupPosition(0, options) === null && !await model.isDelivery(0, options), 'Depot has no fabricated pair');
    await rejects(() => model.getPickupPosition(model.end(0), options), /index/i);
    await rejects(() => model.isDelivery(-1, options), /index/i);
    const position = await model.getPickupPosition(2, options); position!.pairIndex = 99;
    assert((await model.getPickupPosition(2, options))?.pairIndex === pair, 'Position reads are independent');
    return {};
  },
}, {
  id: 'routing.inspection.breaks_hint', name: 'Native break configuration returns owned intervals and exact limits; hints are explicit configuration', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetBreakIntervalsOfVehicle', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)), options = execution(mode);
    const transit = model.registerTransitCallback(() => 1);
    model.setArcCostEvaluatorOfAllVehicles(transit); model.addDimension(transit, 10, 100, true, 'time');
    const time = model.getDimensionOrDie('time');
    assert(!await time.hasBreakConstraints(options), 'Native dimension starts without initialized break vectors');
    await rejects(() => time.getBreakIntervalsOfVehicle(0, options), /initialized/i);
    const rest = model.addBreakInterval({ startMin: 1, startMax: 1, duration: 2, name: 'rest' });
    const pre = model.registerTransitCallback(() => 0), post = model.registerTransitCallback(() => 0);
    time.setBreakIntervalsOfVehicle([rest], 0, { preTravelEvaluator: pre, postTravelEvaluator: post });
    const distance = 9007199254740993n;
    time.setBreakDistanceDurationOfVehicle(distance, 1, 0);
    const config = await time.inspectBreaks(0, options);
    assert(config.hasBreakConstraints && config.intervals.length === 1 && config.distanceDuration[0].distance === distance
      && config.distanceDuration[0].duration === 1n && config.preTravelEvaluator === pre && config.postTravelEvaluator === post, 'Native configuration preserves portable evaluator handles and bigint precision');
    time.setBreakIntervalsOfVehicle([], 0);
    assert(await time.getPreTravelEvaluatorOfVehicle(0, options) === pre && await time.getPostTravelEvaluatorOfVehicle(0, options) === post, 'Native empty setter leaves earlier evaluators intact');
    assert((await time.getBreakDistanceDurationOfVehicle(0, options))[0].distance === distance, 'Dedicated distance getter reads native values');
    assert((await time.getBreakIntervalsOfVehicle(0, options)).length === 1, 'Dedicated interval getter reads native values');
    const answer = (await model.solve(options)).assignment;
    assert(answer && answer.breakInterval(config.intervals[0]).performed, 'Inspected interval handles belong to the original model');
    config.intervals.length = 0; config.distanceDuration[0].distance = 0n;
    assert((await time.inspectBreaks(0, options)).intervals.length === 1, 'Inspection mutation cannot edit native configuration');
    assert(model.getFirstSolutionHint() === null, 'Solving does not create a hint or cache a last solution');
    model.setFirstSolutionHint(answer);
    assert(model.getFirstSolutionHint() === answer, 'Configured immutable assignment is the hint');
    assert((await model.solve(options)).assignment, 'Configured native hint is accepted');
    const foreign = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    await rejects(() => foreign.setFirstSolutionHint(answer), /belong|model/i);
    model.setFirstSolutionHint(null); assert(model.getFirstSolutionHint() === null, 'Clearing removes the configured hint');
    await rejects(() => time.inspectBreaks(1, options), /vehicle/i);
    return {};
  },
}, {
  id: 'routing.callbacks.route_cost', name: 'Native whole-route callbacks add exact costs and preserve route index snapshots', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:AddRouteConstraint', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const manager = new api.RoutingIndexManager(3, 1, 0), model = new api.RoutingModel(manager), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    const seen: number[][] = [], exact = 9007199254740993n;
    model.addRouteConstraint(route => { seen.push([...route]); return exact; }, true);
    model.addRouteConstraint(() => 2);
    const answer = (await model.solve({ ...options, solutionLimit: 1 })).assignment;
    assert(answer?.objectiveValue() === exact + 5n && seen.length > 0, 'Native route costs sum with arc costs without number rounding');
    const complete = seen.find(route => route.length === 4);
    assert(complete?.[0] === model.start(0) && complete[3] === model.end(0) && complete.slice(1, 3).every(index => index > 0 && index < 3), 'Callback receives complete native routes including start and end indices');
    const retained = [...complete]; await model.solve({ ...options, solutionLimit: 1 });
    assert(complete.join() === retained.join(), 'Later solves do not overwrite callback payloads');
    return {};
  },
}, {
  id: 'routing.callbacks.route_rejection', name: 'Native route rejection controls feasibility without wrapper route validation', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:GetRouteCost', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    let calls = 0;
    model.addRouteConstraint(route => { calls++; return route.length === 4 ? null : 0; });
    const answer = await model.solve({ ...execution(mode), timeLimit: { seconds: 1 } });
    assert(!answer.assignment && calls > 0, 'Native solver rejects every complete route');
    return {};
  },
}, {
  id: 'routing.callbacks.concurrent', name: 'Route callback costs and progress stay isolated, including six concurrent server solves', solver: 'routing',
  source: 'javascript/lib/solver_server_executor.ts', tags: ['gap-regression', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const solve = async (cost: number) => {
      const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
      let calls = 0, events = 0;
      model.addRouteConstraint(() => { calls++; return cost; });
      const result = await model.solve({ ...execution(mode), solutionLimit: 1, satParameters: { numWorkers: 1 }, onEvent: () => { events++; } });
      assert(calls > 0 && events > 0, 'Both callback and progress channels operate during concurrent solves');
      return result.assignment?.objectiveValue();
    };
    // Local executors intentionally allow one active job; server jobs can overlap.
    const answers: Array<bigint | undefined> = [];
    if (mode === 'server') answers.push(...await Promise.all(Array.from({ length: 6 }, (_, cost) => solve(cost))));
    else for (let cost = 0; cost < 6; cost++) answers.push(await solve(cost));
    assert(answers.every((objective, cost) => objective === BigInt(cost + 3)), 'Each job receives only its own route evaluator reply');
    return {};
  },
}, {
  id: 'routing.callbacks.failure_recovery', name: 'Callback errors and invalid costs reject jobs and allow later solves', solver: 'routing',
  source: 'javascript/lib/routing/route_callbacks.ts', tags: ['gap-regression', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    const failure = new Error('route callback failure'); let result: unknown = failure;
    model.addRouteConstraint(() => { if (result === failure) throw failure; return (typeof result === 'function' ? result() : result) as number; });
    for (const invalid of [failure, 1.5, 1n << 63n, Promise.resolve(1), () => Promise.reject(failure), undefined]) {
      result = invalid;
      await rejects(() => model.solve({ ...options, solutionLimit: 1 }));
      result = 0;
      assert((await model.solve({ ...options, solutionLimit: 1 })).assignment?.objectiveValue() === 3n, 'Failed callback transport is cleaned up before reuse');
    }
    const controller = new AbortController(); controller.abort(failure);
    assert(await rejects(() => model.solve({ ...options, signal: controller.signal })) === failure, 'Pre-abort preserves its reason');
    return {};
  },
}];
