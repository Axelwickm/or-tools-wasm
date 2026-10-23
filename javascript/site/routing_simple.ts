import { setControlAvailable } from './example_controls.js';
import {
  FirstSolutionStrategy,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  RoutingPrecedencePerformedConstraint,
  RoutingTransitEvaluatorSign,
  VisitTypePolicy,
  type RoutingBreakInterval,
} from 'or-tools-wasm/routing';
import {
  appendStatus,
  configureRoutingExecutor,
  currentRoutingExecutionOptions,
  extractRoutes,
  renderRouteList,
  setRunning,
} from './routing_helpers.js';

const routeOutput = document.getElementById('route-output');
const statusEl = document.getElementById('status');
const routeMap = document.getElementById('route-map') as SVGSVGElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const nodeCountInput = document.getElementById('node-count') as HTMLInputElement | null;
const randomizeButton = document.getElementById('randomize') as HTMLButtonElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const precedenceStopsInput = document.getElementById('precedence-stops') as HTMLInputElement | null;
const orderedStopsInput = document.getElementById('ordered-stops') as HTMLInputElement | null;
const excludedStopsInput = document.getElementById('excluded-stops') as HTMLInputElement | null;
const tabuInput = document.getElementById('generic-tabu') as HTMLInputElement | null;
const inspectionInput = document.getElementById('native-inspection') as HTMLInputElement | null;
const tieredLatenessInput = document.getElementById('tiered-lateness') as HTMLInputElement | null;
const routeCostInput = document.getElementById('route-cost') as HTMLInputElement | null;
const driverBreakInput = document.getElementById('driver-break') as HTMLInputElement | null;
const peakTrafficInput = document.getElementById('peak-traffic') as HTMLInputElement | null;
for (const [selected, other] of [[driverBreakInput, peakTrafficInput], [peakTrafficInput, driverBreakInput]]) {
  selected?.addEventListener('change', () => { if (selected.checked && other) other.checked = false; });
}
const energyCostInput = document.getElementById('energy-cost') as HTMLInputElement | null;
const groupedStopsInput = document.getElementById('grouped-stops') as HTMLInputElement | null;
const replanInput = document.getElementById('replan') as HTMLInputElement | null;
const transferInput = document.getElementById('transfer-route') as HTMLInputElement | null;
const ilsInput = document.getElementById('iterated-local-search') as HTMLInputElement | null;
const packInput = document.getElementById('pack-schedule') as HTMLInputElement | null;
const firstStrategyInput = document.getElementById('first-solution-strategy') as HTMLSelectElement | null;
const secondaryInput = document.getElementById('secondary-model') as HTMLInputElement | null;
secondaryInput?.addEventListener('change', () => {
  if (secondaryInput.checked && firstStrategyInput && !['9', '16'].includes(firstStrategyInput.value)) firstStrategyInput.value = '9';
});
firstStrategyInput?.addEventListener('change', () => {
  if (secondaryInput && !['9', '16'].includes(firstStrategyInput.value)) secondaryInput.checked = false;
});
for (const [selected, other] of [[ilsInput, replanInput], [replanInput, ilsInput]]) {
  selected?.addEventListener('change', () => { if (selected.checked && other) other.checked = false; });
}
const alternativePickupInput = document.getElementById('alternative-pickup') as HTMLInputElement | null;
alternativePickupInput?.addEventListener('change', () => { if (alternativePickupInput.checked && groupedStopsInput) groupedStopsInput.checked = false; });
groupedStopsInput?.addEventListener('change', () => { if (groupedStopsInput.checked && alternativePickupInput) alternativePickupInput.checked = false; });

const scenarioInput = document.getElementById('scenario') as HTMLSelectElement | null;
const scenarios: Record<string, readonly string[]> = {
  basic: [], breaks: ['driver-break'], traffic: ['peak-traffic'], pickup: ['alternative-pickup'],
  grouped: ['grouped-stops'], load: ['energy-cost'], replan: ['replan'],
};
function enabled(id: string): boolean {
  return Boolean((document.getElementById(id) as HTMLInputElement | null)?.checked);
}
function updateRoutingControls() {
  setControlAvailable(secondaryInput, ['9', '16'].includes(firstStrategyInput?.value ?? ''));
  for (const [control, conflict] of [[driverBreakInput, 'peak-traffic'], [peakTrafficInput, 'driver-break'],
    [ilsInput, 'replan'], [replanInput, 'iterated-local-search'],
    [alternativePickupInput, 'grouped-stops'], [groupedStopsInput, 'alternative-pickup']] as const)
    setControlAvailable(control, !enabled(conflict));
}
firstStrategyInput?.addEventListener('change', updateRoutingControls);
document.querySelectorAll<HTMLInputElement>('.controls input[type="checkbox"], .advanced-settings input[type="checkbox"]').forEach(input => input.addEventListener('change', updateRoutingControls));
updateRoutingControls();

type Location = {
  name: string;
  x: number;
  y: number;
};

const mapWidth = 960;
const mapHeight = 620;
const depotLocation: Location = { name: 'Depot', x: mapWidth / 2, y: mapHeight / 2 };
let locations: Location[] = [];

configureRoutingExecutor(executorSelector);

const destinationCount = () => {
  const value = Number.parseInt(nodeCountInput?.value ?? '20', 10);
  return Math.max(3, Number.isFinite(value) ? value : 20);
};

const randomCoordinate = (min: number, max: number) => min + Math.random() * (max - min);

const generateLocations = (count = destinationCount()) => {
  locations = [
    depotLocation,
    ...Array.from({ length: count }, (_, index) => ({
      name: `Destination ${index + 1}`,
      x: randomCoordinate(46, mapWidth - 46),
      y: randomCoordinate(70, mapHeight - 54),
    })),
  ];
};

const resetRouteView = () => {
  if (routeOutput) {
    routeOutput.textContent = 'Run the solver to view the route.';
  }
  if (statusEl) {
    statusEl.textContent = '';
  }
  renderMap();
};

const distance = (fromNode: number, toNode: number) => {
  const from = locations[fromNode];
  const to = locations[toNode];
  return Math.round(Math.hypot(to.x - from.x, to.y - from.y));
};

const renderMap = (routeNodes: number[] | null = null, animate = false) => {
  if (!routeMap) return;
  const isSolved = Boolean(routeNodes);
  const segments = routeNodes
    ? routeNodes.slice(0, -1).map((node, index) => {
      const from = locations[node];
      const to = locations[routeNodes[index + 1]];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      return { from, to, index, length };
    })
    : [];
  const segmentDuration = segments.length ? 0.5 / segments.length : 0;
  const routeSegments = segments.map(({ from, to, index, length }) => {
      const delay = index * segmentDuration;
      const arrowDelay = delay + segmentDuration * 0.78;
      const animationStyle = animate
        ? `stroke-dasharray: ${length}; stroke-dashoffset: ${length}; animation: draw-route-segment ${segmentDuration}s linear ${delay}s forwards;`
        : '';
      const arrowStyle = animate
        ? `opacity: 0; animation: show-route-arrow 0.001s linear ${arrowDelay}s forwards;`
        : '';
      return `
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
          stroke="#0969da" stroke-width="5" stroke-linecap="round" opacity="0.86" style="${animationStyle}" />
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
          stroke="#0969da" stroke-width="5" stroke-linecap="round" marker-end="url(#route-arrow)" style="${arrowStyle}" />
      `;
    }).join('');
  const nodes = locations.map((location, node) => {
    const isDepot = node === 0;
    const fill = isDepot ? '#cf222e' : '#1a7f37';
    const radius = isDepot ? 17 : 14;
    return `
      <g>
        <circle cx="${location.x}" cy="${location.y}" r="${radius + 7}" fill="#fff" opacity="0.86"></circle>
        <circle cx="${location.x}" cy="${location.y}" r="${radius}" fill="${fill}" stroke="#24292f" stroke-width="2"></circle>
        <text x="${location.x}" y="${location.y + 4}" text-anchor="middle" font-size="12" fill="#fff" font-weight="700">${node}</text>
        ${isDepot ? `<text x="${location.x}" y="${location.y + radius + 18}" text-anchor="middle" font-size="12" fill="#24292f">${location.name}</text>` : ''}
      </g>
    `;
  }).join('');
  routeMap.innerHTML = `
    <defs>
      <style>
        @keyframes draw-route-segment {
          to { stroke-dashoffset: 0; }
        }
        @keyframes show-route-arrow {
          to { opacity: 0.86; }
        }
      </style>
      <marker id="route-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="#0969da"></path>
      </marker>
      <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="#d0d7de" stroke-width="1" opacity="0.45"></path>
      </pattern>
    </defs>
    <rect x="0" y="0" width="${mapWidth}" height="${mapHeight}" fill="url(#map-grid)"></rect>
    <text x="24" y="34" font-size="16" fill="#24292f" font-weight="700">${isSolved ? 'Solved route' : 'Unsolved locations'}</text>
    <text x="24" y="56" font-size="12" fill="#57606a">${isSolved ? 'Arrows show the vehicle visit order and return to the depot.' : 'The solver has not chosen a route yet.'}</text>
    ${routeSegments}
    ${nodes}
  `;
};

async function runSimpleRouting() {
  setRunning(runButton, true);
  if (randomizeButton) {
    randomizeButton.disabled = true;
  }
  if (nodeCountInput) {
    nodeCountInput.disabled = true;
    if (scenarioInput) scenarioInput.disabled = true;
  }
  if (statusEl) statusEl.textContent = '';
  if (routeOutput) {
    routeOutput.textContent = 'Solving route...';
  }
  renderMap();
  try {
    const numLocations = locations.length;
    const numVehicles = 1;
    const depot = 0;
    const manager = new RoutingIndexManager(numLocations, numVehicles, depot);
    const routing = new RoutingModel(manager);
    routing.addEnterSearchCallback(() => appendStatus(statusEl, 'Native search entered.'));

    const transitCallbackIndex = routing.registerTransitCallback((fromIndex, toIndex) => {
        const fromNode = manager.indexToNode(fromIndex);
        const toNode = manager.indexToNode(toIndex);
        return distance(fromNode, toNode);
      });
      routing.setArcCostEvaluatorOfAllVehicles(transitCallbackIndex);
      if (enabled('route-cost')) {
        routing.addRouteConstraint(route => {
          let longestLeg = 0;
          for (let i = 1; i < route.length; i++) longestLeg = Math.max(longestLeg,
            distance(manager.indexToNode(route[i - 1]), manager.indexToNode(route[i])));
          return longestLeg;
        }, true);
      }
      const energyCost = enabled('energy-cost');
      if (energyCost) {
        const pickups = routing.registerUnaryTransitCallback(index => manager.indexToNode(index) === depot ? 0 : 1);
        routing.addDimension(pickups, 0, numLocations, true, 'Load');
        routing.addDimension(transitCallbackIndex, 0, 1_000_000, true, 'Distance');
        routing.setPathEnergyCostOfVehicle('Load', 'Distance', 1, 0);
      }
      const groupedStops = enabled('grouped-stops');
      if (enabled('excluded-stops')) {
        const excluded = [manager.nodeToIndex(1), manager.nodeToIndex(2)];
        routing.addDisjunction(excluded, 50);
        for (const index of excluded) routing.activeVar(index).setValue(0);
        routing.ignoreDisjunctionsAlreadyForcedToZero();
        appendStatus(statusEl, 'Stops 1 and 2 excluded; their disjunction penalty is ignored.');
      }
      if (groupedStops) {
        const indices = [manager.nodeToIndex(1), manager.nodeToIndex(2)];
        for (const index of indices) routing.addDisjunction([index], 50);
        routing.addSameActivityGroup(indices);
      }
      if (enabled('ordered-stops')) {
        const first = routing.addDisjunction([manager.nodeToIndex(1)], 0);
        const second = routing.addDisjunction([manager.nodeToIndex(2)], 1000);
        routing.addOrderedActivityGroup([first, second]);
        appendStatus(statusEl, 'Ordered optional stops: visiting stop 2 requires stop 1.');
      }
      if (enabled('precedence-stops')) {
        routing.addDisjunction([manager.nodeToIndex(1)], 0);
        routing.addDisjunction([manager.nodeToIndex(2)], 1000);
        routing.addConstantDimension(1, numLocations + 1, true, 'Visit order');
        routing.getDimensionOrDie('Visit order').addNodePrecedence(manager.nodeToIndex(1), manager.nodeToIndex(2), 1,
          RoutingPrecedencePerformedConstraint.SECOND_IMPLIES_FIRST);
        appendStatus(statusEl, 'Precedence: serving stop 2 requires stop 1 earlier in the route.');
        const layers = await routing.getTopologicallySortedNodePrecedences(currentRoutingExecutionOptions());
        appendStatus(statusEl, `Native node-precedence layers: ${JSON.stringify(layers)}.`);
        const dimension = routing.getDimensionOrDie('Visit order');
        const records = await dimension.getNodePrecedences(currentRoutingExecutionOptions());
        const sign = await dimension.getTransitEvaluatorSign(0, currentRoutingExecutionOptions());
        appendStatus(statusEl, `Native precedence records: ${records.length}; vehicle 0 transit sign: ${RoutingTransitEvaluatorSign[sign]}.`);
      }
      const alternativePickup = enabled('alternative-pickup');
      if (alternativePickup) {
        const pickup = routing.addDisjunction([manager.nodeToIndex(1), manager.nodeToIndex(2)]);
        const delivery = routing.addDisjunction([manager.nodeToIndex(3)]);
        const pair = routing.addPickupAndDeliverySets(pickup, delivery);
        if (!routing.hasDimension('Distance')) routing.addDimension(transitCallbackIndex, 0, 1_000_000, true, 'Distance');
        routing.getDimensionOrDie('Distance').setPickupToDeliveryLimitFunctionForPair(() => 1000, pair);
        const limit = await routing.getDimensionOrDie('Distance').getPickupToDeliveryLimitForPair(pair, 0, 0, currentRoutingExecutionOptions());
        appendStatus(statusEl, `Native pickup-to-delivery limit for the first alternatives: ${limit}.`);
        routing.setVisitType(manager.nodeToIndex(1), 0, VisitTypePolicy.TYPE_ADDED_TO_VEHICLE);
        const pairIds = await routing.getPairIndicesOfType(0, currentRoutingExecutionOptions());
        appendStatus(statusEl, `Pickup visit type 0 belongs to pairs: ${pairIds.join(', ')}.`);
        const position = await routing.getPickupPosition(manager.nodeToIndex(1), currentRoutingExecutionOptions());
        appendStatus(statusEl, `Pickup pair: ${position?.pairIndex}, alternative: ${position?.alternativeIndex}.`);
        const sibling = await routing.getFirstMatchingPickupDeliverySibling(manager.nodeToIndex(3), index => manager.indexToNode(index) === 2, currentRoutingExecutionOptions());
        appendStatus(statusEl, `Matching pickup for stop 3: ${sibling === null ? 'none' : manager.indexToNode(sibling)}.`);
      }
      let driverBreak: RoutingBreakInterval | undefined;
      const peakTraffic = enabled('peak-traffic');
      if (enabled('driver-break') || peakTraffic || enabled('tiered-lateness')) {
        const minutes = routing.registerTransitCallback((from, to) => Math.max(1, Math.ceil(distance(manager.indexToNode(from), manager.indexToNode(to)) / 100)));
        const horizon = numLocations * 30;
        if (peakTraffic) {
          const traffic = routing.registerStateDependentTransitCallback(() => ({ x: [0, 5, 10, horizon], y: [0, 3, 0, 0] }),
            { domainStart: 0, domainEnd: horizon + 1 });
          routing.addDimensionDependentDimensionWithVehicleCapacity([minutes], [traffic], null, 10, [horizon], true, 'Time');
        } else routing.addDimension(minutes, 10, horizon, true, 'Time');
        if (enabled('tiered-lateness')) {
          routing.getDimensionOrDie('Time').setCumulVarPiecewiseLinearCost(routing.end(0), [
            { pointX: 0, pointY: 0, slope: 0, otherPointX: 5 },
            { pointX: 5, pointY: 0, slope: 10, otherPointX: 10 },
            { pointX: 10, pointY: 50, slope: 30, otherPointX: horizon },
          ]);
        }
        if (enabled('driver-break')) {
          driverBreak = routing.addBreakInterval({ startMin: 1, startMax: 1, duration: 2, name: 'driver rest' });
          routing.getDimensionOrDie('Time').setBreakIntervalsOfVehicle([driverBreak], 0);
        }
      }

      if (routing.hasDimension('Time')) {
        const time = routing.getDimensionOrDie('Time');
        const intervals = await time.getAllowedIntervalsInRange(manager.nodeToIndex(1), 0, numLocations * 30, currentRoutingExecutionOptions());
        const minutes = await time.getTransitValue(routing.start(0), manager.nodeToIndex(1), 0, currentRoutingExecutionOptions());
        appendStatus(statusEl, `First-stop allowed time intervals: ${intervals.map(interval => `${interval.start}–${interval.end}`).join(', ')}. Travel time: ${minutes} minutes.`);
      }
      appendStatus(statusEl, 'Solving...');
      const firstSolutionStrategy = Number(firstStrategyInput?.value ?? FirstSolutionStrategy.PATH_CHEAPEST_ARC);
      if (enabled('secondary-model')) {
        const secondary = new RoutingModel(manager);
        secondary.setArcCostEvaluatorOfAllVehicles(secondary.registerTransitCallback((from, to) =>
          distance(manager.indexToNode(from), manager.indexToNode(to))));
        routing.setSecondaryModel(secondary, { localSearchMetaheuristic: LocalSearchMetaheuristic.GREEDY_DESCENT,
          timeLimit: { nanos: 50000000 } });
        appendStatus(statusEl, 'Native secondary model enabled (period 1).');
      }
      if (firstSolutionStrategy === FirstSolutionStrategy.SWEEP) {
        routing.setSweepArranger(Array.from({ length: manager.getNumberOfIndices() }, (_, index) => {
          const point = locations[manager.indexToNode(index)]; return { x: Math.round(point.x), y: Math.round(point.y) };
        }));
      }
      if (firstSolutionStrategy === FirstSolutionStrategy.EVALUATOR_STRATEGY) routing.setFirstSolutionEvaluator(transitCallbackIndex);
      if (firstSolutionStrategy === FirstSolutionStrategy.PATH_MOST_CONSTRAINED_ARC && routing.hasDimension('Time')) routing.setPrimaryConstrainedDimension('Time');
      if (enabled('generic-tabu')) routing.setTabuVars(Array.from({ length: numLocations }, (_, index) => routing.nextVarHandle(index)));
      if (enabled('native-inspection')) {
        const options = currentRoutingExecutionOptions();
        const pairs = await routing.getPerfectBinaryDisjunctions(options);
        const singletons = await routing.getNumOfSingletonNodes(options);
        const allowed = await routing.isVehicleAllowedForIndex(0, manager.nodeToIndex(1), options);
        const constructionCost = await routing.getArcCostForFirstSolution(routing.start(0), manager.nodeToIndex(1), options);
        appendStatus(statusEl, `Native classification: ${pairs.length} perfect binary disjunctions; ${singletons} singleton visits. Vehicle 0 allowed at stop 1: ${allowed}; first-solution arc cost: ${constructionCost}.`);
        const costClass = await routing.getCostClassIndexOfVehicle(0, options);
        const classes = await routing.getCostClassesCount(options);
        const vehicleClass = await routing.getVehicleClassIndexOfVehicle(0, options);
        const vehicleClasses = await routing.getVehicleClassesCount(options);
        const representative = await routing.getVehicleOfClass(vehicleClass, options);
        const components = await routing.getVisitTypeComponents(options);
        const typeOrder = await routing.getTopologicallySortedVisitTypes(options);
        const sameVehicle = await routing.getSameVehicleIndicesOfIndex(manager.nodeToIndex(1), options);
        const equivalentVehicles = await routing.getVehiclesOfSameClass(routing.start(0), options);
        const equivalentArcs = await routing.getSameVehicleClassArcs(routing.start(0), manager.nodeToIndex(1), options);
        const precedenceLayers = await routing.getTopologicallySortedNodePrecedences(options);
        const matching = await routing.isMatchingModel(options);
        const interdependent = await routing.areRoutesInterdependent({ localSearchMetaheuristic: LocalSearchMetaheuristic.GREEDY_DESCENT }, options);
        appendStatus(statusEl, `Native model classification: matching ${matching}; routes interdependent ${interdependent}.`);
        const preferFirst = await routing.arcIsMoreConstrainedThanArc(routing.start(0), manager.nodeToIndex(1), manager.nodeToIndex(2), options);
        appendStatus(statusEl, `Native arc preference, stop 1 before stop 2: ${preferFirst}.`);
        const firstArc = await routing.getArcCostForClass(routing.start(0), manager.nodeToIndex(1), costClass, options);
        const penalty = await routing.unperformedPenalty(manager.nodeToIndex(1), options);
        const unary = await routing.getUnaryDimensions(options);
        const costly = await routing.getDimensionsWithSoftOrSpanCosts(options);
        appendStatus(statusEl, `Native inspection: cost class ${costClass} of ${classes}; first arc cost ${firstArc}; stop 1 penalty ${penalty}.`);
        appendStatus(statusEl, `Vehicle equivalence: class ${vehicleClass} of ${vehicleClasses}; representative vehicle ${representative}.`);
        appendStatus(statusEl, `Visit-type components: ${JSON.stringify(components)}. Dependency layers: ${JSON.stringify(typeOrder)}.`);
        appendStatus(statusEl, `Same-vehicle nodes for stop 1: ${sameVehicle.join(', ')}. Equivalent vehicles: ${equivalentVehicles.join(', ')}. Start arcs: ${JSON.stringify(equivalentArcs)}.`);
        appendStatus(statusEl, `Native node-precedence layers: ${JSON.stringify(precedenceLayers)}.`);
        appendStatus(statusEl, `Unary dimensions: ${unary.map(dimension => dimension.name).join(', ') || 'none'}. Soft/span dimensions: ${costly.map(dimension => dimension.name).join(', ') || 'none'}.`);
      }
      const result = await routing.solve({
        ...currentRoutingExecutionOptions(),
        firstSolutionStrategy,
        ...(enabled('secondary-model') ? { firstSolutionOptimizationPeriod: 1 } : {}),
        ...(enabled('generic-tabu') ? { localSearchMetaheuristic: LocalSearchMetaheuristic.GENERIC_TABU_SEARCH,
          timeLimit: { nanos: 100000000 } } : {}),
        ...(enabled('iterated-local-search') ? {
          useIteratedLocalSearch: true, timeLimit: { nanos: 100000000 },
          iteratedLocalSearchParameters: { ruinRecreateParameters: { ruinStrategies: [{ spatiallyCloseRoutes: { numRuinedRoutes: 1 } }] } },
        } : { numberOfSolutionsToCollect: 3 }),
      });
      if (enabled('native-inspection') && result.searchStatistics) {
        appendStatus(statusEl, `First-solution decisions: ${result.searchStatistics.numDecisionsInFirstSolution ?? 'unavailable'}; rejects: ${result.searchStatistics.numRejectsInFirstSolution ?? 'unavailable'}.`);
      }
      let assignment = result.assignment;
      if (!assignment) {
        if (routeOutput) {
          routeOutput.textContent = 'No solution found.';
        }
        appendStatus(statusEl, 'No solution found.');
        return;
      }

      if (enabled('transfer-route')) {
        const repriced = new RoutingModel(manager);
        repriced.setArcCostEvaluatorOfAllVehicles(repriced.registerTransitCallback((from, to) =>
          2 * distance(manager.indexToNode(from), manager.indexToNode(to))));
        const options = currentRoutingExecutionOptions();
        const seed = await repriced.transferAssignmentFrom(assignment, options);
        const updated = await repriced.solveFromAssignmentWithParameters(seed, { timeLimit: { nanos: 100000000 } }, options);
        appendStatus(statusEl, `Transferred route seed; repriced model objective: ${updated?.objectiveValue() ?? 'no feasible assignment'}.`);
      }

      if (enabled('replan')) {
        const committed: number[] = [];
        for (let index = assignment.value(routing.nextVar(routing.start(0))); committed.length < 2 && !routing.isEnd(index);
          index = assignment.value(routing.nextVar(index))) committed.push(index);
        if (!(await routing.applyLocksToAllVehicles([committed], false, currentRoutingExecutionOptions()))) {
          throw new Error('Could not commit the initial route prefix.');
        }
        routing.setFirstSolutionHint(assignment);
        appendStatus(statusEl, `First-solution hint configured: ${routing.getFirstSolutionHint() !== null}.`);
        assignment = (await routing.solve({ ...currentRoutingExecutionOptions(),
          firstSolutionStrategy: FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION })).assignment;
        if (!assignment) throw new Error('No feasible replan found.');
        appendStatus(statusEl, `Replanned with committed visits: ${committed.map(index => manager.indexToNode(index)).join(' → ')}.`);
      }

      if (enabled('pack-schedule')) {
        const optimizers = await routing.getDimensionsWithGlobalCumulOptimizers(currentRoutingExecutionOptions());
        appendStatus(statusEl, `Global schedule optimizer dimensions: ${optimizers.length}.`);
        const packed = await routing.packCumulsOfOptimizerDimensionsFromAssignment(assignment, 1, currentRoutingExecutionOptions());
        if (!packed.assignment) throw new Error('Native schedule packing failed.');
        assignment = packed.assignment;
        appendStatus(statusEl, `Schedule packing time limit reached: ${packed.timeLimitReached}.`);
      }
      appendStatus(statusEl, enabled('iterated-local-search') ? `Iterated local search status: ${result.status}.` : `Collected assignments: ${result.collectedAssignments.length}.`);
      if (!await routing.checkIfAssignmentIsFeasible(assignment, false, currentRoutingExecutionOptions())) throw new Error('Native assignment feasibility check failed.');
      appendStatus(statusEl, 'Native assignment feasibility: true.');
      if (enabled('generic-tabu')) appendStatus(statusEl, 'Native generic tabu search tracks successor variables.');
      const routes = await extractRoutes(manager, routing, assignment);
      renderRouteList(routeOutput, routes);
      renderMap(routes[0]?.nodes ?? null, true);
      appendStatus(statusEl, `Objective: ${assignment.objectiveValue()}`);
      if (enabled('route-cost')) {
        const route = [routing.start(0)];
        while (!routing.isEnd(route[route.length - 1])) route.push(assignment.value(routing.nextVar(route[route.length - 1])));
        const customCost = await routing.getRouteCost(route, currentRoutingExecutionOptions());
        appendStatus(statusEl, `Native custom-route cost: ${customCost}; longest travel leg.`);
      }
      appendStatus(statusEl, `Distance of the route: ${routes[0]?.distance ?? 0}m`);
      if (energyCost) appendStatus(statusEl, 'Objective includes native load × distance costs.');
      if (alternativePickup) {
        const pickup = assignment.value(routing.activeVar(manager.nodeToIndex(1))) ? 1 : 2;
        const dimension = routing.getDimensionOrDie('Distance');
        const ride = assignment.value(dimension.cumulVar(manager.nodeToIndex(3))) - assignment.value(dimension.cumulVar(manager.nodeToIndex(pickup)));
        appendStatus(statusEl, `Pickup: stop ${pickup}, delivery: stop 3; ride distance: ${ride}m (limit 1000m).`);
      }
      if (peakTraffic) {
        const time = routing.getDimensionOrDie('Time');
        appendStatus(statusEl, `Return time with peak traffic: ${assignment.value(time.cumulVar(routing.end(0)))} minutes.`);
        const slack = await time.shortestTransitionSlack(assignment, routing.start(0), currentRoutingExecutionOptions());
        appendStatus(statusEl, `Shortest transition slack at departure: ${slack} minutes.`);
      }
      if (groupedStops) appendStatus(statusEl, `Grouped stops: ${assignment.value(routing.activeVar(manager.nodeToIndex(1))) ? 'served' : 'skipped'} together.`);
      if (driverBreak) {
        const configured = await routing.getDimensionOrDie('Time').inspectBreaks(0, currentRoutingExecutionOptions());
        appendStatus(statusEl, `Configured driver breaks: ${configured.intervals.length}.`);
        const rest = assignment.breakInterval(driverBreak);
        appendStatus(statusEl, `Driver break: ${rest.startMin}–${rest.endMax} minutes`);
      }
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
    if (randomizeButton) {
      randomizeButton.disabled = false;
    }
    if (nodeCountInput) {
      nodeCountInput.disabled = false;
      if (scenarioInput) scenarioInput.disabled = false;
    }
  }
}

runButton?.addEventListener('click', () => {
  void runSimpleRouting();
});

randomizeButton?.addEventListener('click', () => {
  const count = destinationCount();
  if (nodeCountInput) {
    nodeCountInput.value = String(count);
  }
  generateLocations(count);
  resetRouteView();
});

nodeCountInput?.addEventListener('change', () => {
  const count = destinationCount();
  if (nodeCountInput) {
    nodeCountInput.value = String(count);
  }
  generateLocations(count);
  resetRouteView();
});

generateLocations();
renderMap();

scenarioInput?.addEventListener('change', () => {
  if (scenarioInput.value === 'custom') return;
  const selected = scenarios[scenarioInput.value] ?? [];
  document.querySelectorAll<HTMLInputElement>('.advanced-settings input[type="checkbox"]').forEach(input => {
    input.checked = selected.includes(input.id);
  });
  if (firstStrategyInput) firstStrategyInput.value = '3';
  updateRoutingControls();
  resetRouteView();
});
document.querySelector('.advanced-settings')?.addEventListener('change', () => {
  if (scenarioInput) scenarioInput.value = 'custom';
  resetRouteView();
});
