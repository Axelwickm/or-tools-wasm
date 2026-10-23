import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown | Promise<unknown>) { try { await run(); } catch (error) { assert(error instanceof Error, String(error)); return; } throw new Error('Expected rejection'); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const routingSweepOrderedCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.search.sweep', name: 'Native sweep receives owned routing-index coordinates and enables the exposed strategy', solver: 'routing',
  source: 'ortools/constraint_solver/routing_search.cc:SweepArranger', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const manager = new api.RoutingIndexManager(4, 1, 0), model = new api.RoutingModel(manager), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback((a,b) => a === b ? 0 : 1));
    const parameters = { ...options, firstSolutionStrategy: api.FirstSolutionStrategy.SWEEP };
    assert((await model.solve(parameters)).status === api.RoutingSearchStatus.ROUTING_INVALID, 'Missing arranger retains native invalid status');
    const locations = [{ x:0, y:0 },{ x:1, y:0 },{ x:0, y:1 },{ x:-1, y:0 }];
    const points = Array.from({ length: manager.getNumberOfIndices() }, (_, index) => ({ ...locations[manager.indexToNode(index)] }));
    model.setSweepArranger(points); points[0].x = 2147483647;
    const first = (await model.solve(parameters)).assignment;
    assert(first && first.objectiveValue() === 4n, 'Native SWEEP produces a checked assignment from copied coordinates');
    model.setSweepArranger(points.map(() => ({ x:0, y:0 })));
    assert((await model.solve(parameters)).assignment && first.objectiveValue() === 4n, 'Native ownership supports arranger replacement and independent results');
    await rejects(() => model.setSweepArranger([]));
    await rejects(() => model.setSweepArranger(points.map(() => ({ x: 2147483648, y:0 }))));
    points[1].x = -2147483648;
    const invalid = new api.RoutingModel(manager); invalid.setSweepArranger(points);
    await rejects(() => invalid.solve(parameters));
    assert((await model.solve(parameters)).assignment, 'Invalid native coordinate offsets leave the runtime reusable');
    return {};
  },
}, {
  id: 'routing.activity.ordered_disjunctions', name: 'Ordered activation forwards native disjunction cardinality semantics', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::CloseModelWithParameters', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4,1,0)), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    const first = model.addDisjunction([1,2], 0, 2), second = model.addDisjunction([3], 100);
    model.activeVar(1).setValue(0);
    const original = (await model.solve(options)).assignment;
    assert(original?.value(model.activeVar(3)) === 1, 'Later group is independently worthwhile without the order');
    const group = [first,second]; model.addOrderedActivityGroup(group); group.reverse();
    const snapshot = model.getOrderedActivityGroups(); assert(snapshot.length === 1 && snapshot[0][0] === first, 'Configured disjunction order is copied');
    snapshot[0].reverse(); model.addOrderedActivityGroup([]); model.addOrderedActivityGroup([first]);
    assert(model.getOrderedActivityGroups().length === 1 && model.getOrderedActivityGroups()[0][0] === first, 'Getter owns its arrays and native singleton/empty groups are no-ops');
    const constrained = (await model.solve(options)).assignment;
    assert(constrained?.value(model.activeVar(3)) === 0, 'Later activation requires the earlier group to reach its native maximum cardinality');
    assert(original.value(model.activeVar(3)) === 1, 'Earlier result remains independent');
    await rejects(() => model.addOrderedActivityGroup([second + 1]));
    return {};
  },
}];
