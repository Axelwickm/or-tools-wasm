import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runActiveDomains({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const manager = new api.RoutingIndexManager(4, 1, 0);
  const model = new api.RoutingModel(manager);
  model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 5));
  model.addDisjunction([1], 7);
  model.addDisjunction([2], 9);
  const dropped = model.activeVar(1), visited = model.activeVar(2);
  const values = [1, 0, 1];
  dropped.setValues(values);
  values.splice(0, values.length, 1);
  model.activeVar(1).setValue(0);
  visited.setValue(1);
  model.setNextValue(model.start(0), 2);
  model.setNextValue(2, 3);
  model.setNextValue(3, model.end(0));
  assert(!Reflect.set(dropped, 'index', 2) && Object.keys(dropped).join(',') === 'kind,model,index', 'Active identity must be immutable');
  for (const invalid of [() => model.activeVar(model.end(0)), () => model.activeVar(-1),
    () => dropped.setValue(2), () => dropped.setValue(-1), () => dropped.setValue(NaN),
    () => dropped.setValues([0, 2]), () => dropped.setValues(new Array(1))]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid activity domains must not partially record restrictions');
  }
  const check = (assignment: Awaited<ReturnType<typeof model.solveWithParameters>>) => {
    assert(assignment && assignment.objectiveValue() === 22n && assignment.value(dropped) === 0 && assignment.value(visited) === 1,
      'Native activity must force optional drops/visits and preserve penalties');
    assert(assignment.min(dropped) === 0 && assignment.max(dropped) === 0
      && assignment.value(model.activeVar(model.start(0))) === 1 && assignment.value(model.activeVar(3)) === 1,
      'Active assignment reads must use native successor snapshots');
    return assignment;
  };
  const solution = check(await model.solveWithParameters({}, { executor }));
  check(await model.solveFromAssignmentWithParameters(solution, {}, { executor }));
  check(await model.readAssignmentFromRoutes([[2, 3]], false, { executor }));
  assert(await model.readAssignmentFromRoutes([[1, 2, 3]], false, { executor }) === null
    && await model.readAssignmentFromRoutes([[3]], false, { executor }) === null, 'Restoration must respect forced activity');
  const foreign = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
  let rejected = false;
  try { solution.value(foreign.activeVar(1)); } catch { rejected = true; }
  assert(rejected, 'Foreign active handles must be rejected');
  dropped.setValue(1);
  assert(await model.solveWithParameters({}, { executor }) === null && solution.value(dropped) === 0,
    'Repeated domains must intersect while earlier assignment snapshots remain independent');
  const removed = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
  removed.activeVar(1).setValue(0);
  const removedAssignment = await removed.solveWithParameters({}, { executor });
  assert(removedAssignment && removedAssignment.value(removed.activeVar(1)) === 0
    && removedAssignment.value(removed.activeVar(2)) === 1,
    'Native ActiveVar zero explicitly removes a node even without a disjunction');
  const results: RoutingControlResult[] = [{ id: 'routing.correctness.active_domains', name: 'Native optional activity domains and assignment snapshots',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true }];
  for (const kind of ['intersection', 'vehicle-drop', 'successor-self']) {
    const impossible = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
    if (kind === 'intersection') { impossible.activeVar(1).setValue(0); impossible.addConstraints(impossible.activeVar(1).eq(1)); }
    if (kind === 'vehicle-drop' || kind === 'successor-self') {
      impossible.addDisjunction([1], 7);
      impossible.activeVar(1).setValue(1);
      if (kind === 'vehicle-drop') impossible.vehicleVar(1).setValue(-1);
      else impossible.setNextValue(1, 1);
    }
    assert(await impossible.solveWithParameters({}, { executor }) === null, `Conflicting activity must fail safely (${kind}/${mode})`);
  }
  results.push({ id: 'routing.correctness.active_conflicts', name: 'Activity conflicts with starts, vehicles and successors',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true });
  return results;
}
