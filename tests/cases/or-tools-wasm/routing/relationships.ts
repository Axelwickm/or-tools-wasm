import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid relationship query to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
const equal = (actual: unknown, expected: unknown, message: string) => assert(JSON.stringify(actual) === JSON.stringify(expected), message);
export const routingRelationshipCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.vehicle_relationships', name: 'Native same-vehicle groups and equivalent vehicles/arcs preserve routing indices', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetSameVehicleIndicesOfIndex/GetSameVehicleClassArcs', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const manager = new api.RoutingIndexManager(6, 3, 0), model = new api.RoutingModel(manager), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.setFixedCostOfVehicle(7, 2);
    model.addConstraints(model.vehicleVar(1).eq(model.vehicleVar(2)));
    const pending = model.getSameVehicleIndicesOfIndex(1, options);
    model.addConstraints(model.vehicleVar(2).eq(model.vehicleVar(3)));
    equal(await pending, [1, 2], 'Same-vehicle inspection captures the submitted equalities');
    const group = await model.getSameVehicleIndicesOfIndex(2, options);
    equal(group, [1, 2, 3], 'Native model inspection computes transitive equality membership');
    equal(await model.getSameVehicleIndicesOfIndex(4, options), [4], 'Unrelated node has native singleton membership');
    const vehicles = await model.getVehiclesOfSameClass(model.start(0), options);
    equal(vehicles, [0, 1], 'Native equivalent vehicles preserve their order');
    equal(await model.getVehiclesOfSameClass(model.end(1), options), vehicles, 'End index identifies the same vehicle class');
    equal(await model.getVehiclesOfSameClass(model.start(2), options), [2], 'Different fixed cost splits vehicle equivalence');
    const starts = await model.getSameVehicleClassArcs(model.start(0), 4, options);
    equal(starts, [[model.start(0), 4], [model.start(1), 4]], 'Start arcs use native routing indices for each equivalent vehicle');
    equal(await model.getSameVehicleClassArcs(4, model.end(0), options), [[4, model.end(0)], [4, model.end(1)]], 'End arcs expand across the destination vehicle class');
    equal(await model.getSameVehicleClassArcs(model.start(0), model.end(2), options),
      [[model.start(0), model.end(0)], [model.start(1), model.end(1)]], 'Native start-to-end expansion pairs each equivalent vehicle with its own end');
    equal(await model.getSameVehicleClassArcs(4, 5, options), [[4, 5]], 'Native ordinary arc returns itself');
    equal(await model.getSameVehicleClassArcs(model.end(2), 5, options), [[model.end(2), 5]], 'Inspection does not fabricate arc feasibility rules');
    group.push(999); vehicles.length = 0; starts[0][0] = 999;
    equal(await model.getSameVehicleIndicesOfIndex(1, options), [1, 2, 3], 'Group arrays are independent');
    equal(await model.getVehiclesOfSameClass(model.start(0), options), [0, 1], 'Vehicle arrays are independent');
    equal(await model.getSameVehicleClassArcs(model.start(0), 4, options), [[model.start(0), 4], [model.start(1), 4]], 'Arc tuples are independent');
    for (const action of [() => model.getSameVehicleIndicesOfIndex(model.end(0), options),
      () => model.getVehiclesOfSameClass(1, options), () => model.getVehiclesOfSameClass(-1, options),
      () => model.getSameVehicleClassArcs(0, manager.getNumberOfIndices(), options)]) await rejects(action);
    assert((await model.solve({ ...options, solutionLimit: 1 })).assignment, 'Queries and invalid inputs preserve the usable model');
    return {};
  },
}, {
  id: 'routing.inspection.node_precedence_layers', name: 'Native node-precedence layers preserve filtering, priority order and cyclic dimensions', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:FinalizePrecedences', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0)), options = execution(mode);
    equal(await model.getTopologicallySortedNodePrecedences(options), [], 'No precedence dimensions yields empty native output');
    for (const name of ['empty', 'first', 'second']) model.addConstantDimension(1, 20, true, name);
    const first = model.getDimensionOrDie('first'), second = model.getDimensionOrDie('second');
    first.addNodePrecedence(1, 3, 1); first.addNodePrecedence(2, 3, 5); second.addNodePrecedence(3, 1, 0);
    const pending = model.getTopologicallySortedNodePrecedences(options);
    first.addNodePrecedence(3, 2, 0);
    const layers = await pending;
    equal(layers, [[[2, 1], [3]], [[3], [1]]], 'Native dimension filtering and descending offset tie order are preserved before edits');
    equal(await model.getTopologicallySortedNodePrecedences(options), [[], [[3], [1]]], 'Native cyclic dimension retains its empty slot');
    layers[0][0].push(999); layers[1].length = 0;
    equal(await model.getTopologicallySortedNodePrecedences(options), [[], [[3], [1]]], 'Nested results are independently owned');
    const abort = new AbortController(); abort.abort();
    await rejects(() => model.getTopologicallySortedNodePrecedences({ ...options, signal: abort.signal }));
    equal(await model.getTopologicallySortedNodePrecedences(options), [[], [[3], [1]]], 'Query recovers after cancellation');
    return {};
  },
}];
