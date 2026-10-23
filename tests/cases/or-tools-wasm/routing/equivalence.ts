import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid inspection to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const routingEquivalenceCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.vehicle_equivalence', name: 'Native vehicle equivalence differs from cost classes and preserves representative sentinels', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetVehicleOfClass', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 3, 0)), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    assert(await model.getVehicleClassesCount(options) === 1, 'Equivalent vehicles share a native class');
    const pending = model.getVehicleClassesCount(options);
    model.setFixedCostOfVehicle(5, 2);
    assert(await pending === 1 && await model.getVehicleClassesCount(options) === 2, 'Queries snapshot classification before edits');
    const a = await model.getVehicleClassIndexOfVehicle(0, options), b = await model.getVehicleClassIndexOfVehicle(1, options),
      c = await model.getVehicleClassIndexOfVehicle(2, options);
    assert(a === b && a !== c, 'Fixed cost separates vehicle classes');
    assert(await model.getCostClassIndexOfVehicle(0, options) === await model.getCostClassIndexOfVehicle(2, options),
      'Fixed cost does not separate arc cost classes');
    const representative = await model.getVehicleOfClass(a, options);
    assert((representative === 0 || representative === 1) && await model.getVehicleOfClass(c, options) === 2,
      'Native representatives belong to the requested class');
    assert(await model.getVehicleOfClass(2, options) === -1 && await model.getVehicleOfClass(2147483647, options) === -1,
      'Nonexistent classes preserve native -1 sentinel');
    for (const action of [() => model.getVehicleClassIndexOfVehicle(3, options), () => model.getVehicleClassIndexOfVehicle(-1, options),
      () => model.getVehicleOfClass(-1, options), () => model.getVehicleOfClass(0.5, options)]) await rejects(action);
    model.setFixedCostOfVehicle(0, 2);
    assert(await model.getVehicleClassesCount(options) === 1 && (await model.solve(options)).assignment,
      'Classifications refresh after edits and invalid queries do not poison execution');
    return {};
  },
}, {
  id: 'routing.inspection.visit_relationships', name: 'Native visit components and topological layers preserve empty groups, cycles and ownership', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:ComputeVisitTypesConnectedComponents', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0)), options = execution(mode);
    for (let index = 1; index <= 3; index++) model.setVisitType(index, index - 1, api.VisitTypePolicy.TYPE_ADDED_TO_VEHICLE);
    assert((await model.getVisitTypeComponents(options)).length === 0 && (await model.getTopologicallySortedVisitTypes(options)).length === 0,
      'Native results are empty when no requirements exist');
    model.addSameVehicleRequiredTypeAlternatives(1, [0]);
    const components = await model.getVisitTypeComponents(options);
    assert(JSON.stringify(components) === '[[0,1],[2],[]]', 'Preserve native component ordering, isolated types and trailing empty groups');
    const pending = model.getTopologicallySortedVisitTypes(options);
    model.addSameVehicleRequiredTypeAlternatives(0, [1]);
    const sorted = await pending;
    assert(JSON.stringify(sorted) === '[[0],[1]]', 'Native dependency layers omit types outside the requirement graph and snapshot edits');
    assert((await model.getTopologicallySortedVisitTypes(options)).length === 0, 'Native cycle result stays empty, without an invented order');
    components[0].push(999); components.pop(); sorted[0].push(999);
    assert(JSON.stringify(await model.getVisitTypeComponents(options)) === '[[0,1],[2],[]]', 'Nested arrays remain independent across calls');
    const abort = new AbortController(); abort.abort();
    await rejects(() => model.getVisitTypeComponents({ ...options, signal: abort.signal }));
    assert((await model.getVisitTypeComponents(options)).length === 3, 'Inspection recovers after cancellation');
    return {};
  },
}];
