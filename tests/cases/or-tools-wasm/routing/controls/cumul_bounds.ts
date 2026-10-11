import type * as Api from 'or-tools-wasm/routing';
import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runCumulBounds({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const windowManager = new api.RoutingIndexManager(3, 1, 0);
  const windowModel = new api.RoutingModel(windowManager);
  const travel = windowModel.registerTransitCallback(() => 1n);
  windowModel.setArcCostEvaluatorOfAllVehicles(travel);
  windowModel.addDimension(travel, 10n, 30n, false, 'time');
  const windowTime = windowModel.getDimensionOrDie('time');
  windowTime.cumulVar(windowModel.start(0)).setRange(2, 4n);
  const firstWindow = windowTime.cumulVar(1);
  firstWindow.setRange(5n, 6);
  windowTime.cumulVar(2).setMin(8);
  windowTime.cumulVar(2).setMax(10n);
  windowTime.cumulVar(windowModel.end(0)).setRange(11n, 12n);
  for (const invalid of [() => firstWindow.setRange(7, 6), () => firstWindow.setMin(NaN),
    () => firstWindow.setMax(Number.MAX_SAFE_INTEGER + 1), () => firstWindow.setMin(1n << 63n),
    () => windowTime.cumulVar(-1).setMax(10), () => windowTime.cumulVar(windowManager.getNumberOfIndices()).setMin(0)]) {
    let rejected = false;
    try { invalid(); } catch { rejected = true; }
    assert(rejected, 'Invalid cumul bounds and indices must fail without altering the model');
  }
  const checkWindows = (assignment: Api.Assignment | null) => {
    assert(assignment, 'Valid time windows must have an assignment');
    for (const [index, lower, upper] of [[windowModel.start(0), 2n, 4n], [1, 5n, 6n],
      [2, 8n, 10n], [windowModel.end(0), 11n, 12n]] as const) {
      const variable = windowTime.cumulVar(index);
      assert(assignment.min(variable) >= lower && assignment.max(variable) <= upper,
        'Native assignment intervals must obey customer and terminal windows');
    }
    return assignment;
  };
  const originalWindows = checkWindows(await windowModel.readAssignmentFromRoutes([[1, 2]], false, { executor }));
  const originalMinimum = originalWindows.min(firstWindow), originalMaximum = originalWindows.max(firstWindow);
  assert(await windowModel.readAssignmentFromRoutes([[2, 1]], false, { executor }) === null,
    'Restoration must reject a route that misses a customer window');
  checkWindows(await windowModel.solveWithParameters({}, { executor }));
  checkWindows(await windowModel.solveFromAssignmentWithParameters(originalWindows, {}, { executor }));
  firstWindow.setMin(6n);
  windowTime.cumulVar(1).setRange(-10n, 20n);
  const tightened = checkWindows(await windowModel.readAssignmentFromRoutes([[1, 2]], false, { executor }));
  assert(tightened.min(firstWindow) === 6n && tightened.max(firstWindow) === 6n,
    'Repeated handles must intersect bounds; wider ranges must not loosen limits');
  assert(originalWindows.min(firstWindow) === originalMinimum && originalWindows.max(firstWindow) === originalMaximum,
    'Bound mutations must preserve earlier assignment snapshots');
  firstWindow.setMax(5n);
  assert(await windowModel.solveWithParameters({}, { executor }) === null,
    'Contradictory repeated bounds must return no solution without aborting the runtime');
  assert(await windowModel.readAssignmentFromRoutes([[1, 2]], false, { executor }) === null,
    'Contradictory bounds must also reject route restoration');
  assert(await windowModel.solveFromAssignmentWithParameters(originalWindows, {}, { executor }) === null,
    'Contradictory bounds must reject warm assignments');
  const exact = 9_007_199_254_741_003n;
  const exactModel = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
  exactModel.addConstantDimension(0n, exact + 10n, false, 'exact');
  const exactTime = exactModel.getDimensionOrDie('exact');
  exactTime.cumulVar(exactModel.start(0)).setRange(exact, exact + 2n);
  exactTime.cumulVar(exactModel.end(0)).setMax(exact + 2n);
  const exactAssignment = await exactModel.readAssignmentFromRoutes([[1]], false, { executor });
  assert(exactAssignment && exactAssignment.min(exactTime.cumulVar(1)) === exact
    && exactAssignment.max(exactTime.cumulVar(1)) === exact + 2n,
    'Cumul bounds must preserve bigint values beyond safe-number precision');
  for (const bound of ['fixed-start', 'capacity'] as const) {
    const impossible = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
    impossible.addConstantDimension(1, 10, true, 'limited');
    impossible.addConstraints(impossible.getDimensionOrDie('limited').cumulVar(bound === 'fixed-start' ? impossible.start(0) : 1)
      .ge(bound === 'fixed-start' ? 1 : 11));
    assert(await impossible.solveWithParameters({}, { executor }) === null,
      'Bounds conflicting with fixed starts or dimension capacity must return no solution');
  }
  results.push({ id: 'routing.correctness.cumul_bounds', name: 'Native time windows and exact intersecting cumul bounds',
    solver: 'routing', source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
