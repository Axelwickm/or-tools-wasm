import { assert, type RoutingControlContext, type RoutingControlResult } from './shared.ts';

export async function runVehicleAssignments({ api, mode, executor }: RoutingControlContext): Promise<RoutingControlResult[]> {
  const results: RoutingControlResult[] = [];
  const vehicleManager = new api.RoutingIndexManager(4, 2, 0);
  const vehicleModel = new api.RoutingModel(vehicleManager);
  vehicleModel.setArcCostEvaluatorOfAllVehicles(vehicleModel.registerTransitCallback(() => 5n));
  vehicleModel.addDisjunction([vehicleManager.nodeToIndex(3)], 0n);
  const loads = vehicleModel.registerUnaryTransitVector([0, 1, 1, 0]);
  vehicleModel.addDimensionWithVehicleCapacity(loads, 0, [1, 1], true, 'load');
  const initialVehicles = await vehicleModel.readAssignmentFromRoutes([[1], [2]], false, { executor });
  assert(initialVehicles, 'Vehicle assignments must restore natively');
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    for (const index of [vehicleModel.start(vehicle), vehicle + 1, vehicleModel.end(vehicle)]) {
      const variable = vehicleModel.vehicleVar(index);
      assert(initialVehicles.value(variable) === vehicle && initialVehicles.min(variable) === vehicle
        && initialVehicles.max(variable) === vehicle, 'Restored customer and terminal vehicle values must be bound');
    }
  }
  const droppedVehicle = vehicleModel.vehicleVar(3);
  assert(initialVehicles.value(droppedVehicle) === -1 && initialVehicles.min(droppedVehicle) === -1
    && initialVehicles.max(droppedVehicle) === -1, 'Dropped nodes must preserve the native -1 vehicle value');
  const swappedVehicles = await vehicleModel.readAssignmentFromRoutes([[2], [1]], false, { executor });
  assert(swappedVehicles && swappedVehicles.value(vehicleModel.vehicleVar(1)) === 1
    && initialVehicles.value(vehicleModel.vehicleVar(1)) === 0, 'Vehicle values must remain independent assignment snapshots');
  const optimizedVehicles = await vehicleModel.solveWithParameters({}, { executor });
  assert(optimizedVehicles && optimizedVehicles.value(droppedVehicle) === -1, 'Normal solves must return native dropped vehicle values');
  for (let vehicle = 0; vehicle < 2; ++vehicle) {
    let index = vehicleModel.start(vehicle);
    for (let steps = 0; ; ++steps) {
      assert(steps < vehicleManager.getNumberOfIndices(), 'Solved routes must terminate');
      assert(optimizedVehicles.value(vehicleModel.vehicleVar(index)) === vehicle, 'Solved vehicle values must match route membership');
      if (vehicleModel.isEnd(index)) break;
      index = optimizedVehicles.value(vehicleModel.nextVar(index));
    }
  }
  const warmedVehicles = await vehicleModel.solveFromAssignmentWithParameters(initialVehicles, {}, { executor });
  assert(warmedVehicles && warmedVehicles.value(droppedVehicle) === -1, 'Warm solves must transport vehicle values');
  const foreignModel = new api.RoutingModel(new api.RoutingIndexManager(4, 2, 0));
  for (const access of [() => initialVehicles.value(foreignModel.vehicleVar(1)),
    () => initialVehicles.min(foreignModel.vehicleVar(1)), () => initialVehicles.max(foreignModel.vehicleVar(1)),
    () => vehicleModel.addConstraints(vehicleModel.vehicleVar(1).eq(foreignModel.vehicleVar(2)))]) {
    let rejected = false;
    try { access(); } catch (error) { rejected = error instanceof Error && /different Routing model/.test(error.message); }
    assert(rejected, 'Foreign vehicle variables must be rejected');
  }
  for (const index of [-1, vehicleManager.getNumberOfIndices(), 1.5]) {
    let rejected = false;
    try { vehicleModel.vehicleVar(index); } catch { rejected = true; }
    assert(rejected, 'Vehicle variable indices must be validated');
  }
  results.push({ id: 'routing.correctness.vehicle_assignment_values',
    name: 'Native vehicle values, dropped nodes and independent snapshots', solver: 'routing',
    source: 'javascript/lib/routing/api.ts', tags: ['contract', 'model-correctness'], mode, ok: true as const });
  return results;
}
