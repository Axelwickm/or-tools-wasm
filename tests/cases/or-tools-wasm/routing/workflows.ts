import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => Promise<unknown>, pattern: RegExp) {
  try { await action(); } catch (error) { assert(error instanceof Error && pattern.test(error.message), `Unexpected rejection: ${String(error)}`); return; }
  throw new Error('Expected native workflow rejection');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });

export const routingWorkflowCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.workflows.ils', name: 'ILS dispatches natively, records status and rejects unsupported combinations', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:3550', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(6, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((a, b) => a === b ? 0 : 1 + (a * 17 + b * 11) % 23));
    const parameters = { useIteratedLocalSearch: true, timeLimit: { nanos: 50000000 },
      iteratedLocalSearchParameters: { ruinRecreateParameters: { ruinStrategies: [{ spatiallyCloseRoutes: { numRuinedRoutes: 1 } }] } } };
    const result = await model.solve({ ...execution(mode), ...parameters });
    assert(result.assignment && result.status === api.RoutingSearchStatus.ROUTING_SUCCESS, 'A native ILS solution reports successful completion');
    assert(result.collectedAssignments.length === 0, 'ILS does not fabricate a collection');
    await rejects(() => model.solve({ ...execution(mode), ...parameters, numberOfSolutionsToCollect: 2 }), /ILS.*collected solutions/);
    await rejects(() => model.solveFromAssignmentWithParameters(result.assignment!, parameters, execution(mode)), /ILS.*initial assignments/);
    await rejects(() => model.solve({ ...execution(mode), useIteratedLocalSearch: true }), /ruin_strategies|ruin strategies/i);
    assert((await model.solve(execution(mode))).assignment, 'Ordinary solving recovers after rejected ILS requests');
    return {};
  },
}, {
  id: 'routing.workflows.collection_and_bounds', name: 'Collected assignments retain full independent snapshots, ordering and native bounds/statistics', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1439', tags: ['gap-regression', 'ownership'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(6, 1, 0));
    const reverse = model.registerTransitCallback((a, b) => b === a - 1 || (a === model.start(0) && b === 5) ? 1 : 100);
    model.setArcCostEvaluatorOfAllVehicles(reverse);
    model.addDimension(model.registerTransitCallback(() => 1), 0, 100, true, 'time');
    const result = await model.solve({ ...execution(mode), firstSolutionStrategy: api.FirstSolutionStrategy.FIRST_UNBOUND_MIN_VALUE,
      numberOfSolutionsToCollect: 3, localSearchMetaheuristic: api.LocalSearchMetaheuristic.GREEDY_DESCENT });
    assert(result.assignment && result.collectedAssignments.length >= 2 && result.collectedAssignments.length <= 3, 'Native collected solutions are retrievable');
    const single = await model.solve({ ...execution(mode), numberOfSolutionsToCollect: 1 });
    assert(single.assignment && single.collectedAssignments.length === 1 && single.collectedAssignments[0] === single.assignment, 'Single-solution collection reuses the owned best snapshot');
    const costs = result.collectedAssignments.map(assignment => assignment.objectiveValue());
    assert(costs.every((cost, i) => i === 0 || costs[i - 1] >= cost) && costs.at(-1) === result.assignment.objectiveValue(), 'Native worst-to-best order ends with the returned best assignment');
    for (const assignment of result.collectedAssignments) {
      assert(assignment.value(model.getDimensionOrDie('time').cumulVar(model.end(0))) === 6n, 'Collected snapshots include dimension bounds');
      assert((await model.restoreAssignment(assignment, execution(mode)))?.objectiveValue() === assignment.objectiveValue(), 'Every collected assignment can be restored after its native model is destroyed');
    }
    assert(result.searchStatistics && Object.values(result.searchStatistics).length === 7
      && Object.values(result.searchStatistics).every(value => typeof value === 'bigint' && value >= 0n), 'All seven counters preserve int64 precision');
    assert(typeof result.objectiveLowerBound === 'bigint', 'Search bound remains a native int64, including its unset sentinel');
    const lowerBound = await model.computeLowerBound(execution(mode));
    assert(lowerBound > 0n && lowerBound <= result.assignment.objectiveValue(), 'Explicit native lower-bound computation is separate from search metadata');
    model.addDisjunction([1], 1);
    assert(await model.computeLowerBound(execution(mode)) === 0n, 'Unsupported native disjunction case preserves its zero result');
    await model.solve(execution(mode));
    assert(result.collectedAssignments.every((assignment, i) => assignment.objectiveValue() === costs[i]), 'Later edits and solves do not mutate collected results');
    return {};
  },
}, {
  id: 'routing.workflows.packing', name: 'Packing preserves unchanged, timed-out, successful and failed native outcomes', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:133', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    for (const optimized of [false, true]) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      const one = model.registerTransitCallback(() => 1);
      model.setArcCostEvaluatorOfAllVehicles(one); model.addDimension(one, 10, 100, false, 'time');
      const dimension = model.getDimensionOrDie('time');
      dimension.cumulVar(model.end(0)).setMin(10);
      if (optimized) dimension.setGlobalSpanCostCoefficient(1);
      const answer = (await model.solve(execution(mode))).assignment;
      assert(answer, 'Packing input is feasible');
      const oldStart = answer.value(dimension.cumulVar(model.start(0))), oldEnd = answer.value(dimension.cumulVar(model.end(0)));
      for (const duration of [0, -1, -Infinity]) {
        const unchanged = await model.packCumulsOfOptimizerDimensionsFromAssignment(answer, duration, execution(mode));
        assert(unchanged.assignment && unchanged.timeLimitReached && unchanged.assignment.value(dimension.cumulVar(model.end(0))) === oldEnd, 'Nonpositive native duration preserves the assignment and reports the limit');
      }
      const packed = await model.packCumulsOfOptimizerDimensionsFromAssignment(answer, 1, execution(mode));
      assert(packed.assignment && !packed.timeLimitReached, 'Positive-duration packing returns its native flag');
      if (optimized) assert(packed.assignment.value(dimension.cumulVar(model.end(0))) === 10n && packed.assignment.value(dimension.cumulVar(model.start(0))) === 7n, 'Native packing minimizes ends then maximizes starts at minimum cumul cost');
      else assert(packed.assignment.value(dimension.cumulVar(model.start(0))) === oldStart && packed.assignment.value(dimension.cumulVar(model.end(0))) === oldEnd, 'Without an optimizer native packing preserves the original bounds');
      assert(answer.value(dimension.cumulVar(model.start(0))) === oldStart, 'Packing leaves its input snapshot unchanged');
      await rejects(() => model.packCumulsOfOptimizerDimensionsFromAssignment(answer, NaN, execution(mode)), /NaN/);
      const unlimited = await model.packCumulsOfOptimizerDimensionsFromAssignment(answer, Infinity, execution(mode));
      assert(unlimited.assignment && !unlimited.timeLimitReached, 'Native unlimited packing is supported');
      if (optimized) {
        const first = answer.value(model.start(0));
        model.nextVarHandle(model.start(0)).setValue(first === 1 ? 2 : 1);
        const failed = await model.packCumulsOfOptimizerDimensionsFromAssignment(answer, 1, execution(mode));
        assert(!failed.assignment, 'An incompatible fixed route returns null instead of a fabricated schedule');
      }
    }
    return {};
  },
}, {
  id: 'routing.workflows.reoptimization', name: 'Multiple starting assignments retain candidate order and fast solving preserves native checks/status', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1452', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((a, b) => b === a - 1 || (a === model.start(0) && b === 3) ? 1 : 100));
    const first = await model.readAssignmentFromRoutes([[1, 2, 3]], true, execution(mode));
    const best = await model.readAssignmentFromRoutes([[3, 2, 1]], true, execution(mode));
    assert(first && best && first.objectiveValue() > best.objectiveValue(), 'Candidate routes have distinct native costs');
    const ordered = await model.solveFromAssignmentsWithParameters([first, best], { solutionLimit: 1 }, execution(mode));
    assert(ordered.assignment?.objectiveValue() === first.objectiveValue(), 'The first successful candidate wins; native does not rank all starting assignments');
    const fast = await model.fastSolveFromAssignmentWithParameters(first, { localSearchMetaheuristic: api.LocalSearchMetaheuristic.GREEDY_DESCENT }, true, execution(mode));
    assert(fast.assignment && fast.status === api.RoutingSearchStatus.ROUTING_SUCCESS && fast.assignment.objectiveValue() <= first.objectiveValue(), 'Checked fast solving reports native success with a feasible assignment');
    await rejects(() => model.fastSolveFromAssignmentWithParameters(first, { localSearchMetaheuristic: api.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH }, true, execution(mode)), /GREEDY_DESCENT.*AUTOMATIC/);
    model.nextVarHandle(model.start(0)).setValue(3);
    const fallback = await model.solveFromAssignmentsWithParameters([first, best], { solutionLimit: 1 }, execution(mode));
    assert(fallback.assignment?.value(model.start(0)) === 3, 'Native tries the next candidate after an infeasible first route');
    assert(first.value(model.start(0)) === 1, 'Reoptimization does not mutate its inputs');
    return {};
  },
}, {
  id: 'routing.workflows.compaction', name: 'Checked and unchecked compaction return owned snapshots and retain native vehicle restrictions', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:3948', tags: ['gap-regression', 'ownership'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
    const one = model.registerTransitCallback(() => 1); model.setArcCostEvaluatorOfAllVehicles(one);
    const original = await model.readAssignmentFromRoutes([[], [1, 2]], true, execution(mode));
    assert(original && model.isEnd(original.value(model.start(0))), 'The initial route uses the higher vehicle');
    for (const check of [false, true]) {
      const compacted = check ? await model.compactAndCheckAssignment(original, execution(mode)) : await model.compactAssignment(original, execution(mode));
      assert(compacted && compacted.value(model.start(0)) === 1 && model.isEnd(compacted.value(model.start(1))), 'Native compaction moves the route to the equivalent lower vehicle');
      assert((await model.restoreAssignment(compacted, execution(mode)))?.objectiveValue() === original.objectiveValue(), 'Compacted snapshots survive native ownership cleanup and can be restored');
    }
    assert(model.isEnd(original.value(model.start(0))), 'The original assignment remains independent');
    model.setArcCostEvaluatorOfVehicle(model.registerTransitCallback(() => 2), 1);
    assert(await model.compactAndCheckAssignment(original, execution(mode)) === null, 'Native heterogeneous-cost restriction returns null');
    assert(await model.computeLowerBound(execution(mode)) === 0n, 'Heterogeneous costs retain the native unsupported bound');
    const foreign = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0));
    await rejects(() => foreign.compactAssignment(original, execution(mode)), /another model/);
    return {};
  },
}, {
  id: 'routing.workflows.fast_cp_failure', name: 'Fast solving distinguishes unchecked candidates from failed native CP validation', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:3291', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const manager = new api.RoutingIndexManager(4, 1, 0), model = new api.RoutingModel(manager);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((a, b) => manager.indexToNode(b) === (manager.indexToNode(a) + 1) % 4 ? 1 : 100));
    const product = model.product(model.nextVarHandle(model.start(0)), model.nextVarHandle(1));
    const input = await model.readAssignmentFromRoutes([[1, 2, 3]], true, execution(mode));
    assert(input && input.value(product) === 2n, 'The native input captures the product before the constraint is changed');
    model.addConstraints(api.RoutingLinearExpr.from(product).ne(2));
    const parameters = { localSearchMetaheuristic: api.LocalSearchMetaheuristic.GREEDY_DESCENT };
    const unchecked = await model.fastSolveFromAssignmentWithParameters(input, parameters, false, execution(mode));
    assert(unchecked.assignment && unchecked.status === api.RoutingSearchStatus.ROUTING_SUCCESS && unchecked.assignment.value(product) === 2n, 'Unchecked native search can return a candidate violating the new CP-only constraint');
    const checked = await model.fastSolveFromAssignmentWithParameters(input, parameters, true, execution(mode));
    assert(!checked.assignment && !checked.hasSolution && checked.status === api.RoutingSearchStatus.ROUTING_FAIL, 'Failed native CP validation retains failure status and exposes no checked assignment');
    assert(input.value(product) === 2n, 'Fast solving leaves its input snapshot unchanged');
    return {};
  },
}];
