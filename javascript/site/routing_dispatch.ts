import {
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  RoutingIndexManager,
  RoutingModel,
  setExecutor,
} from 'or-tools-wasm/routing';
import { appendStatus, extractRoutes, setRunning, type RouteSummary } from './routing_helpers.js';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

type Priority = 'standard' | 'express' | 'critical';

type Stop = {
  name: string;
  x: number;
  y: number;
  demand: number;
  priority: Priority;
  depot: boolean;
};

type Vehicle = {
  name: string;
  capacity: number;
  color: string;
};

type DispatchRoute = RouteSummary & {
  load: number;
  capacity: number;
  manifest: Stop[];
};

const routeOutput = document.getElementById('route-output');
const summaryOutput = document.getElementById('dispatch-summary');
const statusEl = document.getElementById('status');
const routeMap = document.getElementById('dispatch-map') as SVGSVGElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const deliveryCountInput = document.getElementById('delivery-count') as HTMLInputElement | null;
const vehicleCountInput = document.getElementById('vehicle-count') as HTMLInputElement | null;
const vehicleCapacityInput = document.getElementById('vehicle-capacity') as HTMLInputElement | null;
const distanceCapInput = document.getElementById('distance-cap') as HTMLInputElement | null;
const randomizeButton = document.getElementById('randomize') as HTMLButtonElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

const mapWidth = 960;
const mapHeight = 620;
const routeRevealSeconds = 2.4;
const routeColors = ['#0969da', '#cf222e', '#1a7f37', '#8250df', '#bf8700', '#d1248f', '#0a7ea4', '#57606a'];
const priorityPenalty = {
  standard: 4000,
  express: 9000,
  critical: 20000,
} satisfies Record<Priority, number>;

let stops: Stop[] = [];
let vehicles: Vehicle[] = [];

configureSolverExecutorSelector({ setExecutor }, executorSelector);

const deliveryCount = () => {
  const value = Number.parseInt(deliveryCountInput?.value ?? '60', 10);
  return Math.max(1, Number.isFinite(value) ? value : 60);
};

const vehicleCount = () => {
  const value = Number.parseInt(vehicleCountInput?.value ?? '4', 10);
  return Math.max(1, Number.isFinite(value) ? value : 4);
};

const vehicleCapacity = () => {
  const value = Number.parseInt(vehicleCapacityInput?.value ?? '100', 10);
  return Math.max(1, Number.isFinite(value) ? value : 100);
};

const distanceCap = () => {
  const value = Number.parseInt(distanceCapInput?.value ?? '1600', 10);
  return Math.max(1, Number.isFinite(value) ? value : 1600);
};

const randomCoordinate = (min: number, max: number) => min + Math.random() * (max - min);

const randomPriority = (): Priority => {
  const roll = Math.random();
  if (roll > 0.88) return 'critical';
  if (roll > 0.62) return 'express';
  return 'standard';
};

const createDepot = (index: number): Stop => ({
  name: `Depot ${index + 1}`,
  x: randomCoordinate(64, mapWidth - 64),
  y: randomCoordinate(78, mapHeight - 64),
  demand: 0,
  priority: 'standard',
  depot: true,
});

const createDelivery = (index: number): Stop => ({
  name: `Delivery ${index + 1}`,
  x: randomCoordinate(46, mapWidth - 46),
  y: randomCoordinate(70, mapHeight - 54),
  demand: 1 + Math.floor(Math.random() * 6),
  priority: randomPriority(),
  depot: false,
});

const syncVehicles = () => {
  vehicles = Array.from({ length: vehicleCount() }, (_, vehicle) => ({
    name: `Truck ${vehicle + 1}`,
    capacity: vehicleCapacity(),
    color: routeColors[vehicle % routeColors.length],
  }));
};

const setDeliveryCount = (count: number) => {
  const depots = stops.filter((stop) => stop.depot);
  const deliveries = stops.filter((stop) => !stop.depot);
  if (deliveries.length > count) {
    deliveries.length = count;
  }
  while (deliveries.length < count) {
    deliveries.push(createDelivery(deliveries.length));
  }
  deliveries.forEach((delivery, index) => {
    delivery.name = `Delivery ${index + 1}`;
  });
  stops = [...depots, ...deliveries];
};

const setVehicleCount = (count: number) => {
  const depots = stops.filter((stop) => stop.depot);
  const deliveries = stops.filter((stop) => !stop.depot);
  if (depots.length > count) {
    depots.length = count;
  }
  while (depots.length < count) {
    depots.push(createDepot(depots.length));
  }
  depots.forEach((depot, index) => {
    depot.name = `Depot ${index + 1}`;
  });
  stops = [...depots, ...deliveries];
  syncVehicles();
};

const generateScenario = () => {
  syncVehicles();
  stops = [
    ...Array.from({ length: vehicleCount() }, (_, index) => createDepot(index)),
    ...Array.from({ length: deliveryCount() }, (_, index) => createDelivery(index)),
  ];
};

const distance = (fromNode: number, toNode: number) => {
  const from = stops[fromNode];
  const to = stops[toNode];
  return Math.round(Math.hypot(to.x - from.x, to.y - from.y));
};

const priorityColor = (priority: Priority) => {
  if (priority === 'critical') return '#cf222e';
  if (priority === 'express') return '#bf8700';
  return '#57606a';
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const setControlsDisabled = (disabled: boolean) => {
  setRunning(runButton, disabled);
  if (randomizeButton) randomizeButton.disabled = disabled;
  if (deliveryCountInput) deliveryCountInput.disabled = disabled;
  if (vehicleCountInput) vehicleCountInput.disabled = disabled;
  if (vehicleCapacityInput) vehicleCapacityInput.disabled = disabled;
  if (distanceCapInput) distanceCapInput.disabled = disabled;
};

const routeLoad = (route: RouteSummary) =>
  route.nodes.reduce((sum, node, index) => {
    if (index === 0 || index === route.nodes.length - 1) return sum;
    return sum + stops[node].demand;
  }, 0);

const enrichRoutes = (routes: RouteSummary[]): DispatchRoute[] =>
  routes.map((route, index) => ({
    ...route,
    load: routeLoad(route),
    capacity: vehicles[index]?.capacity ?? 0,
    manifest: route.nodes
      .slice(1, -1)
      .map((node) => stops[node])
      .filter((stop) => !stop.depot),
  }));

const droppedStops = (routes: DispatchRoute[]) => {
  const served = new Set(routes.flatMap((route) => route.nodes));
  return stops.filter((stop, node) => !stop.depot && !served.has(node));
};

const renderMap = (routes: DispatchRoute[] | null = null, dropped: Stop[] = [], animate = false) => {
  if (!routeMap) return;
  const droppedSet = new Set(dropped.map((stop) => stop.name));
  const activeRoutes = routes?.filter((route) => route.used) ?? [];
  const routeSegments = activeRoutes.map((route) => {
    const color = vehicles[route.vehicle]?.color ?? routeColors[route.vehicle % routeColors.length];
    const segments = route.nodes.slice(0, -1).map((node, index) => {
      const from = stops[node];
      const to = stops[route.nodes[index + 1]];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      return { from, to, length, index };
    });
    const segmentDuration = segments.length ? routeRevealSeconds / segments.length : 0;
    return segments.map(({ from, to, length, index }) => {
      const nodeClearance = 11;
      const arrowRatio = length > nodeClearance ? (length - nodeClearance) / length : 1;
      const arrowToX = from.x + (to.x - from.x) * arrowRatio;
      const arrowToY = from.y + (to.y - from.y) * arrowRatio;
      const delay = index * segmentDuration;
      const arrowDelay = delay + segmentDuration * 0.78;
      const drawStyle = animate
        ? `stroke-dasharray: ${length}; stroke-dashoffset: ${length}; animation: draw-route-segment ${segmentDuration}s linear ${delay}s forwards;`
        : '';
      const arrowStyle = animate
        ? `opacity: 0; animation: show-route-arrow 0.001s linear ${arrowDelay}s forwards;`
        : '';
      return `
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
          stroke="${color}" stroke-width="4.5" stroke-linecap="round" opacity="0.82" style="${drawStyle}" />
        <line x1="${from.x}" y1="${from.y}" x2="${arrowToX}" y2="${arrowToY}"
          stroke="${color}" stroke-width="3" stroke-linecap="round" marker-end="url(#dispatch-arrow-${route.vehicle})" style="${arrowStyle}" />
      `;
    }).join('');
  }).join('');
  const markers = vehicles.map((vehicle, index) => `
    <marker id="dispatch-arrow-${index}" markerWidth="7" markerHeight="7" refX="6.2" refY="2.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,5 L7,2.5 z" fill="${vehicle.color}"></path>
    </marker>
  `).join('');
  const nodes = stops.map((stop, node) => {
    const isDropped = droppedSet.has(stop.name);
    const radius = stop.depot ? 17 : 12;
    const fill = stop.depot ? '#24292f' : isDropped ? '#cf222e' : '#fff';
    const stroke = stop.depot ? '#24292f' : priorityColor(stop.priority);
    const textFill = stop.depot || isDropped ? '#fff' : '#24292f';
    const title = stop.depot
      ? `${stop.name}: truck start/end depot`
      : `${stop.name}: ${stop.demand} pallets, ${stop.priority} priority, drop penalty ${priorityPenalty[stop.priority]}`;
    return `
      <g>
        <title>${escapeXml(title)}</title>
        ${stop.depot ? `<circle cx="${stop.x}" cy="${stop.y}" r="${radius + 7}" fill="#fff" opacity="0.86"></circle>` : ''}
        <circle cx="${stop.x}" cy="${stop.y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${stop.depot ? 2 : 2.5}"></circle>
        <text x="${stop.x}" y="${stop.y + 4}" text-anchor="middle" font-size="11" fill="${textFill}" font-weight="700">${node}</text>
        ${stop.depot ? `<text x="${stop.x}" y="${stop.y + radius + 18}" text-anchor="middle" font-size="12" fill="#24292f">${stop.name}</text>` : ''}
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
          to { opacity: 0.82; }
        }
      </style>
      ${markers}
      <pattern id="dispatch-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="#d0d7de" stroke-width="1" opacity="0.45"></path>
      </pattern>
    </defs>
    <rect x="0" y="0" width="${mapWidth}" height="${mapHeight}" fill="url(#dispatch-grid)"></rect>
    <text x="24" y="34" font-size="16" fill="#24292f" font-weight="700">${routes ? 'Solved dispatch routes' : 'Unassigned dispatch stops'}</text>
    <text x="24" y="56" font-size="12" fill="#57606a">${routes ? 'Each color is one truck route from and back to its depot; dropped deliveries are red.' : 'Depots and delivery demand are generated randomly.'}</text>
    ${routeSegments}
    ${nodes}
  `;
};

const renderDispatchSummary = (routes: DispatchRoute[] = [], dropped: Stop[] = []) => {
  if (!summaryOutput) return;
  const totalDemand = stops.reduce((sum, stop) => sum + stop.demand, 0);
  const totalCapacity = vehicles.reduce((sum, vehicle) => sum + vehicle.capacity, 0);
  const totalDistance = routes.reduce((sum, route) => sum + route.distance, 0);
  const delivered = routes.reduce((sum, route) => sum + route.load, 0);
  summaryOutput.innerHTML = `
    <div><strong>${vehicles.length}</strong><span>available vehicles</span></div>
    <div><strong>${routes.length ? delivered : totalDemand}</strong><span>${routes.length ? 'pallets delivered' : 'pallets requested'}</span></div>
    <div><strong>${totalCapacity}</strong><span>pallet capacity</span></div>
    <div><strong>${routes.length ? `${totalDistance}m` : `${distanceCap()}m`}</strong><span>${routes.length ? 'total distance' : 'route distance cap'}</span></div>
    <div><strong>${dropped.length}</strong><span>dropped stops</span></div>
  `;
};

const renderDispatchRoutes = (routes: DispatchRoute[], dropped: Stop[]) => {
  if (!routeOutput) return;
  routeOutput.innerHTML = '';
  const cards = document.createElement('div');
  cards.className = 'route-cards';
  for (const route of routes) {
    if (!route.used && routes.length > 1) continue;
    const vehicle = vehicles[route.vehicle];
    const card = document.createElement('section');
    card.className = 'route-card';
    card.style.borderColor = vehicle?.color ?? '#d0d7de';
    const manifest = route.manifest
      .map((stop) => `${stop.name} (${stop.demand})`)
      .join(', ');
    card.innerHTML = `
      <h2>${vehicle?.name ?? `Vehicle ${route.vehicle + 1}`}</h2>
      <p>${route.load}/${route.capacity} pallets, ${route.distance}m</p>
      <p>${manifest || 'No deliveries assigned.'}</p>
      <small>${route.nodes.join(' -> ')}</small>
    `;
    cards.appendChild(card);
  }
  routeOutput.appendChild(cards);
  if (dropped.length) {
    const droppedEl = document.createElement('p');
    droppedEl.className = 'dropped-stops';
    droppedEl.textContent = `Dropped stops: ${dropped.map((stop) => stop.name).join(', ')}`;
    routeOutput.appendChild(droppedEl);
  }
};

const resetDispatchView = () => {
  if (routeOutput) routeOutput.textContent = 'Run the solver to animate dispatch routes.';
  if (statusEl) statusEl.textContent = '';
  renderDispatchSummary();
  renderMap();
};

async function runDispatch() {
  setControlsDisabled(true);
  if (statusEl) statusEl.textContent = '';
  if (routeOutput) routeOutput.textContent = 'Solving dispatch routes...';
  renderMap();
  try {
    appendStatus(statusEl, 'Initializing routing runtime...');
    await initRouting();

    const vehicleTotal = vehicleCount();
    const starts = Array.from({ length: vehicleTotal }, (_, index) => index);
    const manager = new RoutingIndexManager(stops.length, vehicleTotal, starts, starts);
    const routing = new RoutingModel(manager);
    try {
      const distanceCallbackIndex = routing.RegisterTransitCallback((fromIndex, toIndex) => {
        const fromNode = manager.IndexToNode(fromIndex);
        const toNode = manager.IndexToNode(toIndex);
        return distance(fromNode, toNode);
      });
      routing.SetArcCostEvaluatorOfAllVehicles(distanceCallbackIndex);

      const demandCallbackIndex = routing.RegisterUnaryTransitCallback((fromIndex) => {
        return stops[manager.IndexToNode(fromIndex)].demand;
      });
      const capacityAdded = routing.AddDimensionWithVehicleCapacity(
        demandCallbackIndex,
        0,
        vehicles.map((vehicle) => vehicle.capacity),
        true,
        'load',
      );
      if (!capacityAdded) throw new Error('Could not add vehicle capacity dimension.');

      const distanceAdded = routing.AddDimension(distanceCallbackIndex, 0, distanceCap(), true, 'distance');
      if (!distanceAdded) throw new Error('Could not add route distance dimension.');

      for (let node = vehicleTotal; node < stops.length; node++) {
        routing.AddDisjunction([manager.NodeToIndex(node)], priorityPenalty[stops[node].priority]);
      }

      const searchParameters = DefaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;
      searchParameters.solution_limit = 1;

      appendStatus(statusEl, 'Solving capacitated multi-depot vehicle routes...');
      const assignment = await routing.SolveWithParameters(searchParameters);
      if (!assignment) {
        if (routeOutput) routeOutput.textContent = 'No solution found.';
        appendStatus(statusEl, 'No solution found.');
        return;
      }

      const routes = enrichRoutes(extractRoutes(manager, routing, assignment));
      const dropped = droppedStops(routes);
      renderDispatchSummary(routes, dropped);
      renderDispatchRoutes(routes, dropped);
      renderMap(routes, dropped, true);
      appendStatus(statusEl, `Objective: ${assignment.ObjectiveValue()}`);
      appendStatus(statusEl, `Total distance: ${routes.reduce((sum, route) => sum + route.distance, 0)}m`);
      appendStatus(statusEl, `Vehicle loads: ${routes.map((route) => `${route.load}/${route.capacity}`).join(', ')}`);
      appendStatus(statusEl, `Dropped stops: ${dropped.length}`);
      appendStatus(statusEl, 'Capacity, maximum route distance, and optional drop penalties are active.');
    } finally {
      routing.delete();
      manager.delete();
    }
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setControlsDisabled(false);
  }
}

runButton?.addEventListener('click', () => {
  void runDispatch();
});

randomizeButton?.addEventListener('click', () => {
  generateScenario();
  resetDispatchView();
});

deliveryCountInput?.addEventListener('change', () => {
  const count = deliveryCount();
  if (deliveryCountInput) deliveryCountInput.value = String(count);
  setDeliveryCount(count);
  resetDispatchView();
});

vehicleCountInput?.addEventListener('change', () => {
  const count = vehicleCount();
  if (vehicleCountInput) vehicleCountInput.value = String(count);
  setVehicleCount(count);
  resetDispatchView();
});

vehicleCapacityInput?.addEventListener('change', () => {
  const capacity = vehicleCapacity();
  if (vehicleCapacityInput) vehicleCapacityInput.value = String(capacity);
  syncVehicles();
  resetDispatchView();
});

distanceCapInput?.addEventListener('change', () => {
  const cap = distanceCap();
  if (distanceCapInput) distanceCapInput.value = String(cap);
  resetDispatchView();
});

generateScenario();
resetDispatchView();
