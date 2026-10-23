import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { try { action(); } catch { return; } throw new Error('Expected Routing operation to reject'); }
async function rejects(action: () => Promise<unknown>) { try { await action(); } catch { return; } throw new Error('Expected native Routing rejection'); }

export const routingStateDependentCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.transit.native_state_dependence', name: 'Native piecewise transit evaluates self/base cumuls, rounding and independent assignments', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:775', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const [variant, expected] of [[0, 33n], [1, 7n], [2, 10n], [3, 6n], [4, 30n]] as const) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      const fixed = model.registerTransitCallback(() => variant === 2 ? 2 : 1);
      model.setArcCostEvaluatorOfAllVehicles(fixed);
      if (variant === 3) model.addDimension(fixed, 0, 100, true, 'clock');
      const points = { x: [0, 100], y: variant === 0 ? [10, 10] : variant === 2 ? [0, 50] : variant === 4 ? [10, 0] : [0, 100] };
      const domain = { domainStart: 0, domainEnd: 101 };
      const dependent = model.registerStateDependentTransitCallback(() => points, domain);
      domain.domainEnd = 1;
      assert(model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], variant === 3 ? 'clock' : null,
        0, [100], true, 'time'), 'Native dependent dimension is added');
      points.y.fill(99);
      assert(!model.addDimensionDependentDimensionWithVehicleCapacity([], [], null, 0, [], true, 'time'), 'Duplicate dimension does not sample callbacks');
      const answer = (await model.solve(execution)).assignment;
      assert(answer && answer.value(model.getDimensionOrDie('time').cumulVar(model.end(0))) === expected, `Native transit variant ${variant}`);
      const route: number[] = [];
      for (let next = answer.value(model.start(0)); !model.isEnd(next); next = answer.value(next)) route.push(next);
      const routes = [route];
      const restored = await model.readAssignmentFromRoutes(routes, true, execution);
      assert(restored?.value(model.getDimensionOrDie('time').cumulVar(model.end(0))) === expected, 'Restoration recomputes native state-dependent transits');
      assert((await model.solveFromAssignmentWithParameters(answer, {}, execution))?.value(model.getDimensionOrDie('time').cumulVar(model.end(0))) === expected, 'Warm start preserves native cumul dependence');
      model.getDimensionOrDie('time').cumulVar(model.end(0)).setMax(expected - 1n);
      assert(!(await model.solve(execution)).assignment, 'Native cumul restriction makes every equivalent route infeasible');
      assert(answer.value(model.getDimensionOrDie('time').cumulVar(model.end(0))) === expected, 'Old assignment remains independent');
    }
    const manager = new api.RoutingIndexManager(3, 2, [0, 0], [0, 0]);
    const model = new api.RoutingModel(manager);
    const fixed = model.registerUnaryTransitCallback(index => index === model.start(1) ? 2 : 1);
    model.setArcCostEvaluatorOfAllVehicles(fixed);
    const dependent = [1, 3].map(value => model.registerStateDependentTransitCallback((from, to) => {
      const transit = value + (from === model.start(1) ? 2 : 0) + (to === model.end(1) ? 1 : 0);
      return { x: [0, 100], y: [transit, transit] };
    }, { domainStart: 0, domainEnd: 101 }));
    model.addDimensionDependentDimensionWithVehicleCapacity([fixed, fixed], dependent, null, 0, [100, 100], true, 'time');
    model.nextVarHandle(model.start(0)).setValues([manager.nodeToIndex(1)]);
    model.nextVarHandle(manager.nodeToIndex(1)).setValues([model.end(0)]);
    model.nextVarHandle(model.start(1)).setValues([manager.nodeToIndex(2)]);
    model.nextVarHandle(manager.nodeToIndex(2)).setValues([model.end(1)]);
    const answer = (await model.solve(execution)).assignment;
    assert(answer?.value(model.getDimensionOrDie('time').cumulVar(model.end(0))) === 4n, 'First vehicle uses its own function');
    assert(answer.value(model.getDimensionOrDie('time').cumulVar(model.end(1))) === 12n, 'Per-arc functions preserve both routing indices, duplicated depots and unary arity');
    return {};
  },
}, {
  id: 'routing.transit.native_state_validation', name: 'State-dependent domains and anchors reject safely and allow recovery', solver: 'routing',
  source: 'javascript/routing_state_dependent_transit.h', tags: ['gap-regression', 'native-contract', 'ownership'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const variant of ['length', 'order', 'coverage', 'capacity', 'base', 'precision', 'overflow'] as const) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
      const fixed = model.registerTransitCallback(() => 1);
      if (variant === 'base') model.addDimension(fixed, 0, 200, true, 'clock');
      const fn = { x: [0n, 100n], y: [1n, 1n] };
      if (variant === 'length') fn.y.pop();
      if (variant === 'order') fn.x[1] = 0n;
      if (variant === 'coverage') fn.x[1] = 99n;
      if (variant === 'precision') fn.y[1] = 9007199254740992n;
      if (variant === 'overflow') fn.x[1] = (1n << 63n) - 1n;
      const dependent = model.registerStateDependentTransitCallback(() => fn, { domainStart: 0, domainEnd: 101 });
      model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], variant === 'base' ? 'clock' : null,
        0, [variant === 'capacity' ? 101 : 100], true, 'time');
      await rejects(() => model.solve(execution));
    }
    const model = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
    const fixed = model.registerTransitCallback(() => 1);
    const good = () => ({ x: [0, 100], y: [1, 1] });
    for (const domain of [{ domainStart: -1, domainEnd: 101 }, { domainStart: 1, domainEnd: 1 }, { domainStart: 0, domainEnd: 2147483648 }])
      throws(() => model.registerStateDependentTransitCallback(good, domain));
    const dependent = model.registerStateDependentTransitCallback(good, { domainStart: 0, domainEnd: 101 });
    const failing = model.registerStateDependentTransitCallback(() => { throw new Error('Sampling failed'); }, { domainStart: 0, domainEnd: 101 });
    throws(() => model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [failing], null, 0, [100], true, 'time'));
    throws(() => model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], 'missing', 0, [100], true, 'time'));
    throws(() => model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [99], null, 0, [100], true, 'time'));
    throws(() => model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [], null, 0, [100], true, 'time'));
    throws(() => model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], null, -1, [100], true, 'time'));
    assert(!model.hasDimension('time'), 'Failed construction does not reserve a dimension name');
    model.addDimensionDependentDimensionWithVehicleCapacity([fixed], [dependent], null, 0, [100], true, 'time');
    await rejects(() => model.solve({ ...execution, signal: AbortSignal.abort() }));
    assert((await model.solve(execution)).assignment?.value(model.getDimensionOrDie('time').cumulVar(model.end(0))) === 4n, 'A healthy solve succeeds after rejected requests');
    const shiftedManager = new api.RoutingIndexManager(2, 1, 0);
    const shifted = new api.RoutingModel(shiftedManager);
    const shiftedFixed = shifted.registerTransitCallback(() => 1);
    shifted.addDimension(shiftedFixed, 0, 100, false, 'clock');
    for (let i = 0; i < shiftedManager.getNumberOfIndices(); ++i) shifted.getDimensionOrDie('clock').cumulVar(i).setMin(1);
    const shiftedDependent = shifted.registerStateDependentTransitCallback(() => ({ x: [1, 100], y: [1, 1] }), { domainStart: 1, domainEnd: 101 });
    shifted.addDimensionDependentDimensionWithVehicleCapacity([shiftedFixed], [shiftedDependent], 'clock', 0, [100], true, 'time');
    assert((await shifted.solve(execution)).assignment?.value(shifted.getDimensionOrDie('time').cumulVar(shifted.end(0))) === 4n, 'A shifted domain uses native base bounds and cache indexing');
    return {};
  },
}, {
  id: 'routing.transit.costs_and_breaks', name: 'Native span costs count dependent transit once and unsupported breaks reject explicitly', solver: 'routing',
  tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const dependent of [false, true]) for (const control of ['global-span', 'break', 'break-distance'] as const) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      const one = model.registerTransitCallback(() => 1);
      model.setArcCostEvaluatorOfAllVehicles(one);
      if (dependent) {
        const callback = model.registerStateDependentTransitCallback(() => ({ x: [0, 100], y: [1, 1] }),
          { domainStart: 0, domainEnd: 101 });
        model.addDimensionDependentDimensionWithVehicleCapacity([one], [callback], null, 10, [100], true, 'time');
      } else model.addDimension(model.registerTransitCallback(() => 2), 10, 100, true, 'time');
      const dimension = model.getDimensionOrDie('time');
      if (control === 'global-span') dimension.setGlobalSpanCostCoefficient(1);
      if (control === 'break') dimension.setBreakIntervalsOfVehicle([
        model.addBreakInterval({ startMin: 1, startMax: 1, duration: 2 })], 0);
      if (control === 'break-distance') dimension.setBreakDistanceDurationOfVehicle(2, 1, 0);
      if (dependent && control !== 'global-span') {
        let error: unknown;
        try { await model.solve(execution); } catch (caught) { error = caught; }
        assert(error instanceof Error && /breaks on state-dependent dimensions are not supported/.test(error.message),
          'Unsupported native break propagation rejects with a specific error');
        continue;
      }
      const answer = (await model.solve(execution)).assignment;
      if (control === 'break-distance') { assert(!answer, 'A fixed-transit route without required distance breaks remains infeasible'); continue; }
      assert(answer && answer.value(dimension.cumulVar(model.end(0))) === (control === 'break' ? 8n : 6n),
        'Equivalent native travel preserves the expected end cumul');
      assert(answer.objectiveValue() === (control === 'global-span' ? 9n : 3n), 'Objective equals native arc plus span cost');
      if (control === 'global-span') {
        const restored = await model.restoreAssignment(answer, execution);
        assert(restored?.objectiveValue() === 9n, 'Restoration preserves the corrected native objective');
      }
    }
    return {};
  },
}];
