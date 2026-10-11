import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runSuccessorDomains({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const manager = new api.RoutingIndexManager(5, 1, 0);
  const model = new api.RoutingModel(manager);
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 3));
  model.addDisjunction([4], 17);
  model.setNextValues(model.start(0), [3, 1, 3]);
  model.setNextValue(model.start(0), 1);
  model.setNextValues(1, [3, 2, 2]);
  model.setNextValues(1, [2, 4]);
  const allowed = [model.end(0), 3];
  model.setNextValues(2, allowed);
  allowed.splice(0, allowed.length, 4);
  model.setNextValue(3, model.end(0));
  model.setNextValue(4, 4);
  for (const invalid of [() => model.setNextValue(-1, 1), () => model.setNextValues(model.end(0), [1]),
    () => model.setNextValue(manager.getNumberOfIndices(), 1), () => model.setNextValue(NaN, 1),
    () => model.setNextValue(1, -1), () => model.setNextValue(1, manager.getNumberOfIndices()),
    () => model.setNextValue(1, 0.5), () => model.setNextValues(1, [2, NaN]),
    () => model.setNextValues(1, new Array(1)), () => model.setNextValue(1, Number.MAX_SAFE_INTEGER + 1)]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid successor inputs must not partially record a domain');
  }
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment && assignment.objectiveValue() === 29n, 'Required arcs and optional self-loops must preserve exact costs');
    assert(model.nextVar(1) === 1 && assignment.value(model.nextVar(model.start(0))) === 1
      && assignment.value(model.nextVar(1)) === 2 && assignment.value(model.nextVar(2)) === 3
      && assignment.value(model.nextVar(3)) === model.end(0) && assignment.value(model.nextVar(4)) === 4,
      'Successor domains must intersect, forbid omitted arcs and preserve numeric NextVar access');
    return assignment;
  };
  const solution = check(await model.solveWithParameters({ solutionLimit: 1n }, { executor }));
  check(await model.solveFromAssignmentWithParameters(solution, { solutionLimit: 1n }, { executor }));
  check(await model.readAssignmentFromRoutes([[1, 2, 3]], false, { executor }));
  assert(await model.readAssignmentFromRoutes([[1, 3, 2]], false, { executor }) === null,
    'Route restoration must reject forbidden successor arcs');
  model.addConstraints(model.nextVarHandle(2).eq(model.end(0)));
  assert(await model.solveWithParameters({}, { executor }) === null, 'Later restrictions must preserve earlier intersections');
  assert(solution.value(model.nextVar(2)) === 3, 'Earlier assignments must retain their successor snapshot');
  results.push({ id: 'routing.correctness.successor_domains', name: 'Required and forbidden native successor arcs',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  for (const kind of ['intersection', 'mandatory-self', 'cycle', 'start-target', 'wrong-end']) {
    const impossible = new api.RoutingModel(new api.RoutingIndexManager(3, kind === 'wrong-end' ? 2 : 1, 0));
    if (kind === 'intersection') { impossible.setNextValue(1, 2); impossible.addConstraints(impossible.nextVarHandle(1).eq(impossible.end(0))); }
    if (kind === 'mandatory-self') impossible.setNextValue(1, 1);
    if (kind === 'cycle') { impossible.setNextValue(1, 2); impossible.setNextValue(2, 1); }
    if (kind === 'start-target') impossible.setNextValue(1, impossible.start(0));
    if (kind === 'wrong-end') impossible.setNextValue(impossible.start(0), impossible.end(1));
    assert(await impossible.solveWithParameters({}, { executor }) === null, `Incompatible successor domains must fail safely (${kind}/${mode})`);
  }
  const optional = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  optional.setArcCostEvaluatorOfAllVehicles(optional.registerTransitCallback(() => 1));
  optional.addDisjunction([1], 7);
  optional.setNextValue(optional.start(0), 1);
  optional.setNextValue(1, 2);
  optional.setNextValue(2, optional.end(0));
  const visited = await optional.solveWithParameters({}, { executor });
  assert(visited && visited.objectiveValue() === 3n && visited.value(optional.vehicleVar(1)) === 0,
    'A non-self successor must force optional activity');
  const empty = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  empty.addDisjunction([1], 0);
  empty.setNextValue(1, 1);
  empty.setNextValue(empty.start(0), empty.end(0));
  assert(await empty.solveWithParameters({}, { executor }), 'A start may lead directly to its own end on an empty route');
  results.push({ id: 'routing.correctness.successor_activity_conflicts', name: 'Successor activity and infeasible domains fail safely',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });

  const depots = new api.RoutingIndexManager(4, 2, [2, 2], [0, 0]);
  const distinct = new api.RoutingModel(depots);
  const customers = [depots.nodeToIndex(3), depots.nodeToIndex(1)];
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    distinct.setNextValue(distinct.start(vehicle), customers[vehicle]);
    distinct.setNextValue(customers[vehicle], distinct.end(vehicle));
  }
  const restored = await distinct.readAssignmentFromRoutes(customers.map(index => [index]), false, { executor });
  assert(restored, 'Successor domains must use native indices for repeated starts and end-only depots');
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    assert(restored.value(distinct.nextVar(distinct.start(vehicle))) === customers[vehicle]
      && restored.value(distinct.nextVar(customers[vehicle])) === distinct.end(vehicle), 'Vehicle-specific endpoints must remain distinct');
  }
  results.push({ id: 'routing.correctness.successor_depot_indices', name: 'Successor domains preserve native depot indices',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
