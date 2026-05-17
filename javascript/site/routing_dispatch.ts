import {
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm';
import { appendStatus, configureWorkerBridge, extractRoutes, setRunning, type RouteSummary } from './routing_helpers.js';

type Stop = {
  name: string;
  x: number;
  y: number;
  demand: number;
  priority: 'standard' | 'express' | 'critical';
};

const stops: Stop[] = [
  { name: 'West depot', x: 115, y: 455, demand: 0, priority: 'standard' },
  { name: 'North depot', x: 455, y: 120, demand: 0, priority: 'standard' },
  { name: 'East depot', x: 785, y: 455, demand: 0, priority: 'standard' },
  { name: 'Bakery', x: 205, y: 220, demand: 4, priority: 'express' },
  { name: 'Market', x: 335, y: 175, demand: 5, priority: 'standard' },
  { name: 'Clinic', x: 455, y: 255, demand: 3, priority: 'critical' },
  { name: 'Hotel', x: 620, y: 210, demand: 4, priority: 'express' },
  { name: 'Warehouse B', x: 735, y: 320, demand: 6, priority: 'standard' },
  { name: 'School', x: 245, y: 455, demand: 3, priority: 'critical' },
  { name: 'Library', x: 380, y: 440, demand: 4, priority: 'standard' },
  { name: 'Cafe', x: 520, y: 465, demand: 2, priority: 'standard' },
  { name: 'Station', x: 680, y: 505, demand: 5, priority: 'express' },
  { name: 'Harbor', x: 215, y: 695, demand: 5, priority: 'standard' },
  { name: 'Arena', x: 355, y: 720, demand: 4, priority: 'express' },
  { name: 'Pharmacy', x: 500, y: 700, demand: 3, priority: 'critical' },
  { name: 'Theatre', x: 655, y: 725, demand: 4, priority: 'standard' },
  { name: 'Mall', x: 785, y: 665, demand: 5, priority: 'express' },
];

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

const vehicles: Vehicle[] = [
  { name: 'West truck', capacity: 20, color: '#0b57d0' },
  { name: 'North truck', capacity: 20, color: '#137333' },
  { name: 'East truck', capacity: 24, color: '#b3261e' },
];

const priorityPenalty = {
  standard: 4000,
  express: 9000,
  critical: 20000,
} satisfies Record<Stop['priority'], number>;

const canvas = document.getElementById('map') as HTMLCanvasElement | null;
const routeOutput = document.getElementById('route-output');
const summaryOutput = document.getElementById('dispatch-summary');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
let animationFrame = 0;

configureWorkerBridge(workerBridgeToggle);
drawMap([]);

function createDistanceMatrix() {
  return stops.map((from) =>
    stops.map((to) => Math.round(Math.hypot(from.x - to.x, from.y - to.y))),
  );
}

function routeColor(routeIndex: number) {
  return vehicles[routeIndex]?.color ?? '#57606a';
}

function priorityColor(priority: Stop['priority']) {
  if (priority === 'critical') return '#b3261e';
  if (priority === 'express') return '#b86e00';
  return '#57606a';
}

function drawMap(routes: DispatchRoute[], progress = 1) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#eef4f8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(11, 87, 208, 0.07)';
  ctx.fillRect(65, 130, 260, 680);
  ctx.fillStyle = 'rgba(19, 115, 51, 0.07)';
  ctx.fillRect(325, 85, 250, 725);
  ctx.fillStyle = 'rgba(179, 38, 30, 0.07)';
  ctx.fillRect(575, 130, 260, 680);

  ctx.strokeStyle = '#d0d7de';
  ctx.lineWidth = 1;
  for (let x = 90; x < canvas.width; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, 80);
    ctx.lineTo(x, canvas.height - 80);
    ctx.stroke();
  }
  for (let y = 90; y < canvas.height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(65, y);
    ctx.lineTo(canvas.width - 65, y);
    ctx.stroke();
  }

  routes.forEach((route, routeIndex) => {
    if (!route.used) return;
    const visibleSegments = Math.max(0, (route.nodes.length - 1) * progress);
    ctx.strokeStyle = routeColor(routeIndex);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let vehicleX = 0;
    let vehicleY = 0;
    for (let i = 0; i < route.nodes.length - 1; i++) {
      const from = stops[route.nodes[i]];
      const to = stops[route.nodes[i + 1]];
      if (i === 0) ctx.moveTo(from.x, from.y);
      if (i + 1 <= visibleSegments) {
        ctx.lineTo(to.x, to.y);
        vehicleX = to.x;
        vehicleY = to.y;
      } else if (i < visibleSegments) {
        const partial = visibleSegments - i;
        vehicleX = from.x + (to.x - from.x) * partial;
        vehicleY = from.y + (to.y - from.y) * partial;
        ctx.lineTo(vehicleX, vehicleY);
      }
    }
    ctx.stroke();

    if (vehicleX || vehicleY) {
      ctx.fillStyle = routeColor(routeIndex);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(vehicleX - 14, vehicleY - 9, 28, 18, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(routeIndex + 1), vehicleX, vehicleY + 4);
      ctx.textAlign = 'start';
    }
  });

  stops.forEach((stop, index) => {
    const isDepot = index < 3;
    ctx.fillStyle = isDepot ? '#111827' : '#ffffff';
    ctx.strokeStyle = isDepot ? '#111827' : priorityColor(stop.priority);
    ctx.lineWidth = isDepot ? 2 : 3;
    ctx.beginPath();
    ctx.arc(stop.x, stop.y, isDepot ? 12 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isDepot ? '#111827' : '#24292f';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(isDepot ? stop.name : `${index}. ${stop.name}`, stop.x + 14, stop.y - 10);
    if (!isDepot) {
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`${stop.demand} pallets / ${stop.priority}`, stop.x + 14, stop.y + 9);
    }
  });
}

function animateRoutes(routes: DispatchRoute[]) {
  cancelAnimationFrame(animationFrame);
  const start = performance.now();
  const durationMs = 2900;
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / durationMs);
    drawMap(routes, progress);
    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
    }
  };
  animationFrame = requestAnimationFrame(tick);
}

function routeLoad(route: RouteSummary) {
  return route.nodes.reduce((sum, node, index) => {
    if (index === 0 || index === route.nodes.length - 1) return sum;
    return sum + stops[node].demand;
  }, 0);
}

function enrichRoutes(routes: RouteSummary[]): DispatchRoute[] {
  return routes.map((route, index) => ({
    ...route,
    load: routeLoad(route),
    capacity: vehicles[index]?.capacity ?? 0,
    manifest: route.nodes
      .slice(1, -1)
      .map((node) => stops[node])
      .filter((stop) => stop.demand > 0),
  }));
}

function droppedStops(routes: DispatchRoute[]) {
  const served = new Set(routes.flatMap((route) => route.nodes));
  return stops.slice(3).filter((_, offset) => !served.has(offset + 3));
}

function renderDispatchSummary(routes: DispatchRoute[], dropped: Stop[]) {
  if (!summaryOutput) return;
  const totalDistance = routes.reduce((sum, route) => sum + route.distance, 0);
  const totalLoad = routes.reduce((sum, route) => sum + route.load, 0);
  summaryOutput.innerHTML = `
    <div><strong>${routes.filter((route) => route.used).length}</strong><span>active vehicles</span></div>
    <div><strong>${totalLoad}</strong><span>pallets delivered</span></div>
    <div><strong>${totalDistance}m</strong><span>total distance</span></div>
    <div><strong>${dropped.length}</strong><span>dropped stops</span></div>
  `;
}

function renderDispatchRoutes(routes: DispatchRoute[], dropped: Stop[]) {
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
      <h2>${vehicle?.name ?? `Vehicle ${route.vehicle}`}</h2>
      <p>${route.load}/${route.capacity} pallets, ${route.distance}m</p>
      <p>${manifest || 'No deliveries assigned.'}</p>
      <small>${route.nodes.join(' -> ')}</small>
    `;
    cards.appendChild(card);
  }
  routeOutput.appendChild(cards);

  if (dropped.length > 0) {
    const droppedEl = document.createElement('p');
    droppedEl.className = 'dropped-stops';
    droppedEl.textContent = `Dropped stops: ${dropped.map((stop) => stop.name).join(', ')}`;
    routeOutput.appendChild(droppedEl);
  }
}

async function runDispatch() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing routing runtime...');
    await initRouting();

    const manager = new RoutingIndexManager(stops.length, 3, [0, 1, 2], [0, 1, 2]);
    const routing = new RoutingModel(manager);
    try {
      const distanceMatrix = createDistanceMatrix();
      const distanceCallbackIndex = routing.RegisterTransitCallback((fromIndex, toIndex) => {
        const fromNode = manager.IndexToNode(fromIndex);
        const toNode = manager.IndexToNode(toIndex);
        return distanceMatrix[fromNode][toNode];
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
      if (!capacityAdded) {
        throw new Error('Could not add vehicle capacity dimension.');
      }

      const distanceAdded = routing.AddDimension(distanceCallbackIndex, 0, 2200, true, 'distance');
      if (!distanceAdded) {
        throw new Error('Could not add route distance dimension.');
      }

      for (let node = 3; node < stops.length; node++) {
        routing.AddDisjunction([manager.NodeToIndex(node)], priorityPenalty[stops[node].priority]);
      }

      const searchParameters = DefaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;
      searchParameters.solution_limit = 1;

      appendStatus(statusEl, 'Solving capacitated multi-depot vehicle routes...');
      const assignment = await routing.SolveWithParameters(searchParameters);
      if (!assignment) {
        appendStatus(statusEl, 'No solution found.');
        return;
      }

      const routes = enrichRoutes(extractRoutes(manager, routing, assignment));
      const dropped = droppedStops(routes);
      renderDispatchSummary(routes, dropped);
      renderDispatchRoutes(routes, dropped);
      animateRoutes(routes);
      appendStatus(statusEl, `Objective: ${assignment.ObjectiveValue()}`);
      appendStatus(statusEl, `Total distance: ${routes.reduce((sum, route) => sum + route.distance, 0)}m`);
      appendStatus(statusEl, `Vehicle loads: ${routes.map((route) => `${route.load}/${route.capacity}`).join(', ')}`);
      appendStatus(statusEl, 'Capacity, maximum route distance, and optional drop penalties are active.');
    } finally {
      routing.delete();
      manager.delete();
    }
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
  }
}

runButton?.addEventListener('click', () => {
  void runDispatch();
});
