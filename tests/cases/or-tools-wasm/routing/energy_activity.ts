import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function throws(action: () => unknown) { try { action(); } catch { return; } throw new Error('Expected Routing operation to reject'); }

export const routingEnergyActivityCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.energy.native_costs', name: 'Native path energy composes threshold rates, warm starts and exact costs', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1273', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    for (const variant of ['plain', 'capacity', 'transits', 'combined'] as const) {
      const unaryModel = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      unaryModel.setArcCostEvaluatorOfAllVehicles(unaryModel.registerTransitCallback(() => 1));
      const unary = unaryModel.registerUnaryTransitCallback(index => index === 1 || index === 2 ? 1 : 0);
      if (variant === 'plain') unaryModel.addDimension(unary, 0, 10, true, 'load');
      if (variant === 'capacity') unaryModel.addDimensionWithVehicleCapacity(unary, 0, [10], true, 'load');
      if (variant === 'transits') unaryModel.addDimensionWithVehicleTransits([unary], 0, 10, true, 'load');
      if (variant === 'combined') unaryModel.addDimensionWithVehicleTransitAndCapacity([unary], 0, [10], true, 'load');
      unaryModel.addConstantDimension(2, 100, true, 'distance');
      unaryModel.setPathEnergyCostOfVehicle('load', 'distance', 3, 0);
      assert((await unaryModel.solve(execution)).assignment?.objectiveValue() === 21n, `Unforced native search preserves unary arity for ${variant} dimensions`);
    }
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addConstantDimension(1, 100, true, 'force'); model.addConstantDimension(2, 100, true, 'distance');
    model.nextVarHandle(0).setValues([1]); model.nextVarHandle(1).setValues([2]); model.nextVarHandle(2).setValues([3]);
    throws(() => model.setPathEnergyCostOfVehicle('missing', 'distance', 1, 0));
    throws(() => model.setPathEnergyCostOfVehicle('force', 'distance', -1, 0));
    throws(() => model.setPathEnergyCostOfVehicle('force', 'distance', 1, 1));
    throws(() => model.setPathEnergyCostsOfVehicle('force', 'distance', -1, 2, 3, 0));
    model.setPathEnergyCostOfVehicle('force', 'distance', 3, 0);
    const initial = (await model.solve(execution)).assignment;
    assert(initial?.objectiveValue() === 39n, 'Energy integrates next-node force (1+2+3) times distance 2 and rate 3, plus three arcs');
    model.setPathEnergyCostsOfVehicle('force', 'distance', 2, 2, 5, 0);
    const answer = (await model.solve(execution)).assignment;
    assert(answer?.objectiveValue() === 33n, 'Native threshold splits force into two rates');
    assert((await model.solveFromAssignmentWithParameters(answer, {}, execution))?.objectiveValue() === 33n, 'Warm start retains threshold energy');
    assert((await model.readAssignmentFromRoutes([[1, 2]], true, execution))?.objectiveValue() === 33n, 'Restoration accounts for native energy');
    model.setPathEnergyCostOfVehicle('force', 'distance', 0, 0);
    assert((await model.solve(execution)).assignment?.objectiveValue() === 33n, 'Native zero-cost setter is a no-op');
    const exact = 9007199254740993n;
    model.setPathEnergyCostOfVehicle('force', 'distance', exact, 0);
    assert((await model.solve(execution)).assignment?.objectiveValue() === 3n + 12n * exact, 'Energy costs remain exact beyond safe numbers');
    assert(initial.objectiveValue() === 39n && answer.objectiveValue() === 33n, 'Earlier assignments retain their own objective');
    return {};
  },
}, {
  id: 'routing.activity.native_groups', name: 'Native activity groups merge overlapping stops and expose independent inspection', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:1960', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 10));
    for (const index of [1, 2, 3]) model.addDisjunction([index], 5);
    const group = [1, 2]; model.addSameActivityGroup(group); group.length = 0;
    model.addSameActivityGroup([2, 3]); model.addSameActivityGroup([]); model.addSameActivityGroup([1]); model.addSameActivityGroup([1, 1]);
    for (const index of [-1, 4, NaN, 2147483647]) throws(() => model.addSameActivityGroup([index]));
    const native = await model.inspectActivityGroups(execution);
    assert(native.groups.length === 4 && native.groups[1] === native.groups[2] && native.groups[2] === native.groups[3], 'Native equality analysis merges overlapping groups');
    assert(native.members[native.groups[1]].join(',') === '1,2,3', 'Inspection exposes native group members');
    native.members[native.groups[1]].length = 0; native.groups[1] = -1;
    const fresh = await model.inspectActivityGroups(execution);
    assert(fresh.members[fresh.groups[1]].join(',') === '1,2,3', 'Inspection arrays are owned snapshots');
    model.activeVar(1).setValues([0]);
    const answer = (await model.solve(execution)).assignment;
    assert(answer?.objectiveValue() === 15n && [1, 2, 3].every(index => answer.value(model.activeVar(index)) === 0), 'All grouped stops drop together and retain individual penalties');
    assert((await model.readAssignmentFromRoutes([[]], true, execution))?.objectiveValue() === 15n, 'Restoration respects grouped optionality');
    assert((await model.solveFromAssignmentWithParameters(answer, {}, execution))?.objectiveValue() === 15n, 'Warm start respects grouped optionality');
    model.activeVar(2).setValues([1]);
    assert(!(await model.solve(execution)).assignment, 'Conflicting native active-variable equalities are infeasible');
    assert(answer.value(model.activeVar(2)) === 0, 'Earlier assignment survives later conflicting activity');
    return {};
  },
}];
