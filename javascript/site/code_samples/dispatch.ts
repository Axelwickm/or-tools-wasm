import type { getDispatchScenario } from '../routing_dispatch.js';
import { checked, executor, numberValue } from './controls.js';

export function dispatchCode(scenario: ReturnType<typeof getDispatchScenario>): string {
  const { stops, vehicleCapacities, distanceCap, priorityPenalty } = scenario;
  const data = stops.map(({ x, y, demand, priority }) => ({ x, y, demand, priority }));
  const lines = [`import { RoutingIndexManager, RoutingModel, FirstSolutionStrategy, RoutingBoolExpr } from 'or-tools-wasm/routing';

const stops = [
${data.map(stop => `  ${JSON.stringify(stop)},`).join('\n')}
] as const;
const vehicleCapacities = ${JSON.stringify(vehicleCapacities)};
const routeDistanceCap = ${distanceCap};
const priorityPenalty = ${JSON.stringify(priorityPenalty)};
const starts = Array.from({ length: vehicleCapacities.length }, (_, vehicle) => vehicle);
const manager = new RoutingIndexManager(stops.length, starts.length, starts, starts);
const routing = new RoutingModel(manager);
const transit = routing.registerTransitCallback((from, to) => {
  const a = stops[manager.indexToNode(from)], b = stops[manager.indexToNode(to)];
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y));
});
routing.setArcCostEvaluatorOfAllVehicles(transit);
const demand = routing.registerUnaryTransitCallback(from => stops[manager.indexToNode(from)].demand);
routing.addDimensionWithVehicleCapacity(demand, 0, vehicleCapacities, true, 'load');
routing.addDimension(transit, 0, (1n << 63n) - 1n, true, 'distance');
const routeDistance = routing.getDimensionOrDie('distance');
for (let vehicle = 0; vehicle < starts.length; vehicle++) {
  const end = routeDistance.cumulVar(routing.end(vehicle));
  end.removeInterval(BigInt(routeDistanceCap) + 1n, (1n << 63n) - 1n);
  routing.addVariableMinimizedByFinalizer(end);
}
for (let node = starts.length; node < stops.length; node++) {
  routing.addDisjunction([manager.nodeToIndex(node)], priorityPenalty[stops[node].priority]);
}`];
  if (checked('delivery-order') && stops.length >= vehicleCapacities.length + 2) lines.push(`const first = manager.nodeToIndex(starts.length);
const second = manager.nodeToIndex(starts.length + 1);
routing.addConstraints(routeDistance.cumulVar(first).le(routeDistance.cumulVar(second)).onlyEnforceIf(
  routing.activeVar(first).eq(1), routing.activeVar(second).eq(1), routing.vehicleVar(first).eq(routing.vehicleVar(second)),
));`);
  if (checked('delivery-choice')) lines.push(`const required = routing.reify(RoutingBoolExpr.or(
  ...stops.slice(starts.length, starts.length + 2).map((_, offset) => routing.activeVar(manager.nodeToIndex(starts.length + offset))),
));
required.setValue(1);`);
  if (checked('use-resources')) lines.push(`const resources = routing.addResourceGroup();
for (let slot = 0; slot < ${numberValue('resource-slots', 2)}; slot++) resources.addResource({
  startDomain: [[0, 0]], endDomain: [[0, routeDistanceCap]],
}, 'distance');
for (let vehicle = 0; vehicle < starts.length; vehicle++) resources.notifyVehicleRequiresAResource(vehicle);`);
  lines.push(`const result = await routing.solve({
  firstSolutionStrategy: FirstSolutionStrategy.PATH_CHEAPEST_ARC,
  solutionLimit: 1, executor: ${executor()},
});
if (!result.assignment) throw new Error('No dispatch route found.');
console.log(result.status, result.assignment.objectiveValue());`);
  return lines.join('\n\n');
}
