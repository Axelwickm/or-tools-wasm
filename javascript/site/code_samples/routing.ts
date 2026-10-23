import { checked, executor, numberValue, value } from './controls.js';

export function routingCode(): string {
  const lines = [`import {
  RoutingIndexManager, RoutingModel, FirstSolutionStrategy, LocalSearchMetaheuristic,
  RoutingPrecedencePerformedConstraint, VisitTypePolicy,
} from 'or-tools-wasm/routing';

const locations = [
  { x: 480, y: 310 },
  ...Array.from({ length: ${Math.max(3, numberValue('node-count', 20))} }, () => ({
    x: 52 + Math.random() * 856, y: 52 + Math.random() * 516,
  })),
];
const numLocations = locations.length;
const manager = new RoutingIndexManager(numLocations, 1, 0);
const routing = new RoutingModel(manager);
const execution = { executor: ${executor()} as const };
const distance = (from: number, to: number) => Math.round(Math.hypot(
  locations[from].x - locations[to].x, locations[from].y - locations[to].y));
const transit = routing.registerTransitCallback((from, to) =>
  distance(manager.indexToNode(from), manager.indexToNode(to)));
routing.setArcCostEvaluatorOfAllVehicles(transit);`];
  if (checked('route-cost')) lines.push(`routing.addRouteConstraint(route => {
  let longestLeg = 0;
  for (let i = 1; i < route.length; i++) longestLeg = Math.max(longestLeg,
    distance(manager.indexToNode(route[i - 1]), manager.indexToNode(route[i])));
  return longestLeg;
}, true);`);
  if (checked('energy-cost')) lines.push(`const pickups = routing.registerUnaryTransitCallback(index => manager.indexToNode(index) === 0 ? 0 : 1);
routing.addDimension(pickups, 0, numLocations, true, 'Load');
routing.addDimension(transit, 0, 1_000_000, true, 'Distance');
routing.setPathEnergyCostOfVehicle('Load', 'Distance', 1, 0);`);
  if (checked('excluded-stops')) lines.push(`for (const node of [1, 2]) {
  const index = manager.nodeToIndex(node);
  routing.addDisjunction([index], 1000);
  routing.activeVar(index).setValue(0);
}
routing.ignoreDisjunctionsAlreadyForcedToZero();`);
  if (checked('grouped-stops')) lines.push(`const indices = [manager.nodeToIndex(1), manager.nodeToIndex(2)];
for (const index of indices) routing.addDisjunction([index], 50);
routing.addSameActivityGroup(indices);`);
  if (checked('ordered-stops')) lines.push(`const firstGroup = routing.addDisjunction([manager.nodeToIndex(1)], 0);
const secondGroup = routing.addDisjunction([manager.nodeToIndex(2)], 1000);
routing.addOrderedActivityGroup([firstGroup, secondGroup]);`);
  if (checked('precedence-stops')) lines.push(`routing.addDisjunction([manager.nodeToIndex(1)], 0);
routing.addDisjunction([manager.nodeToIndex(2)], 1000);
routing.addConstantDimension(1, numLocations + 1, true, 'Visit order');
routing.getDimensionOrDie('Visit order').addNodePrecedence(
  manager.nodeToIndex(1), manager.nodeToIndex(2), 1,
  RoutingPrecedencePerformedConstraint.SECOND_IMPLIES_FIRST);`);
  if (checked('alternative-pickup')) lines.push(`const pickup = routing.addDisjunction([manager.nodeToIndex(1), manager.nodeToIndex(2)]);
const delivery = routing.addDisjunction([manager.nodeToIndex(3)]);
const pair = routing.addPickupAndDeliverySets(pickup, delivery);
if (!routing.hasDimension('Distance')) routing.addDimension(transit, 0, 1_000_000, true, 'Distance');
routing.getDimensionOrDie('Distance').setPickupToDeliveryLimitFunctionForPair(() => 1000, pair);
routing.setVisitType(manager.nodeToIndex(1), 0, VisitTypePolicy.TYPE_ADDED_TO_VEHICLE);`);
  if (checked('driver-break') || checked('peak-traffic') || checked('tiered-lateness')) {
    lines.push(`const minutes = routing.registerTransitCallback((from, to) =>
  Math.max(1, Math.ceil(distance(manager.indexToNode(from), manager.indexToNode(to)) / 100)));
const horizon = numLocations * 30;`);
    lines.push(checked('peak-traffic') ? `const traffic = routing.registerStateDependentTransitCallback(
  () => ({ x: [0, 5, 10, horizon], y: [0, 3, 0, 0] }),
  { domainStart: 0, domainEnd: horizon + 1 });
routing.addDimensionDependentDimensionWithVehicleCapacity([minutes], [traffic], null, 10, [horizon], true, 'Time');`
      : `routing.addDimension(minutes, 10, horizon, true, 'Time');`);
    if (checked('tiered-lateness')) lines.push(`routing.getDimensionOrDie('Time').setCumulVarPiecewiseLinearCost(routing.end(0), [
  { pointX: 0, pointY: 0, slope: 0, otherPointX: 5 },
  { pointX: 5, pointY: 0, slope: 10, otherPointX: 10 },
  { pointX: 10, pointY: 50, slope: 30, otherPointX: horizon },
]);`);
    if (checked('driver-break')) lines.push(`const rest = routing.addBreakInterval({ startMin: 1, startMax: 1, duration: 2, name: 'driver rest' });
routing.getDimensionOrDie('Time').setBreakIntervalsOfVehicle([rest], 0);`);
  }
  const strategy = ({ '3': 'PATH_CHEAPEST_ARC', '5': 'EVALUATOR_STRATEGY', '11': 'SWEEP',
    '4': 'PATH_MOST_CONSTRAINED_ARC', '9': 'LOCAL_CHEAPEST_INSERTION', '16': 'LOCAL_CHEAPEST_COST_INSERTION' } as Record<string, string>)[value('first-solution-strategy', '3')];
  if (checked('secondary-model')) lines.push(`const secondary = new RoutingModel(manager);
secondary.setArcCostEvaluatorOfAllVehicles(secondary.registerTransitCallback((from, to) =>
  distance(manager.indexToNode(from), manager.indexToNode(to))));
routing.setSecondaryModel(secondary, { localSearchMetaheuristic: LocalSearchMetaheuristic.GREEDY_DESCENT,
  timeLimit: { nanos: 50000000 } });`);
  if (strategy === 'SWEEP') lines.push(`routing.setSweepArranger(Array.from({ length: manager.getNumberOfIndices() }, (_, index) => {
  const point = locations[manager.indexToNode(index)];
  return { x: Math.round(point.x), y: Math.round(point.y) };
}));`);
  if (strategy === 'EVALUATOR_STRATEGY') lines.push('routing.setFirstSolutionEvaluator(transit);');
  if (strategy === 'PATH_MOST_CONSTRAINED_ARC') lines.push(`if (routing.hasDimension('Time')) routing.setPrimaryConstrainedDimension('Time');`);
  if (checked('generic-tabu')) lines.push(`routing.setTabuVars(Array.from({ length: numLocations }, (_, index) => routing.nextVarHandle(index)));`);
  if (checked('native-inspection')) lines.push(`console.log(await routing.isMatchingModel(execution));
console.log(await routing.getCostClassesCount(execution));
console.log(await routing.getUnaryDimensions(execution));`);
  const options = [`  ...execution,`, `  firstSolutionStrategy: FirstSolutionStrategy.${strategy},`];
  if (checked('secondary-model')) options.push('  firstSolutionOptimizationPeriod: 1,');
  if (checked('generic-tabu')) options.push('  localSearchMetaheuristic: LocalSearchMetaheuristic.GENERIC_TABU_SEARCH,');
  if (checked('generic-tabu') || checked('iterated-local-search')) options.push('  timeLimit: { nanos: 100000000 },');
  if (checked('iterated-local-search')) options.push(`  useIteratedLocalSearch: true,
  iteratedLocalSearchParameters: { ruinRecreateParameters: {
    ruinStrategies: [{ spatiallyCloseRoutes: { numRuinedRoutes: 1 } }],
  } },`);
  else options.push('  numberOfSolutionsToCollect: 3,');
  lines.push(`const result = await routing.solve({\n${options.join('\n')}\n});
let assignment = result.assignment;
if (!assignment) throw new Error('No route found.');`);
  if (checked('transfer-route')) lines.push(`const repriced = new RoutingModel(manager);
repriced.setArcCostEvaluatorOfAllVehicles(repriced.registerTransitCallback((from, to) =>
  2 * distance(manager.indexToNode(from), manager.indexToNode(to))));
const seed = await repriced.transferAssignmentFrom(assignment, execution);
const updated = await repriced.solveFromAssignmentWithParameters(seed, { timeLimit: { nanos: 100000000 } }, execution);
console.log(updated?.objectiveValue());`);
  if (checked('replan')) lines.push(`const committed: number[] = [];
for (let index = assignment.value(routing.nextVar(routing.start(0)));
  committed.length < 2 && !routing.isEnd(index); index = assignment.value(routing.nextVar(index))) committed.push(index);
if (!await routing.applyLocksToAllVehicles([committed], false, execution)) throw new Error('Could not lock route.');
routing.setFirstSolutionHint(assignment);
assignment = (await routing.solve({ ...execution,
  firstSolutionStrategy: FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION })).assignment;
if (!assignment) throw new Error('No replan found.');`);
  if (checked('pack-schedule')) lines.push(`const packed = await routing.packCumulsOfOptimizerDimensionsFromAssignment(assignment, 1, execution);
if (!packed.assignment) throw new Error('Schedule packing failed.');
assignment = packed.assignment;
console.log(packed.timeLimitReached);`);
  lines.push('console.log(result.status, assignment.objectiveValue());');
  return lines.join('\n\n');
}
