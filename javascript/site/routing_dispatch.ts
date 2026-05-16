import {
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm';
import { appendStatus, configureWorkerBridge, extractRoutes, renderRouteList, setRunning, type RouteSummary } from './routing_helpers.js';

type Stop = {
  name: string;
  x: number;
  y: number;
  demand: number;
};

const stops: Stop[] = [
  { name: 'West depot', x: 130, y: 350, demand: 0 },
  { name: 'North depot', x: 560, y: 110, demand: 0 },
  { name: 'East depot', x: 1045, y: 360, demand: 0 },
  { name: 'Bakery', x: 235, y: 185, demand: 4 },
  { name: 'Market', x: 410, y: 150, demand: 5 },
  { name: 'Clinic', x: 545, y: 230, demand: 3 },
  { name: 'Hotel', x: 770, y: 170, demand: 4 },
  { name: 'Warehouse B', x: 920, y: 250, demand: 6 },
  { name: 'School', x: 290, y: 365, demand: 3 },
  { name: 'Library', x: 475, y: 380, demand: 4 },
  { name: 'Cafe', x: 650, y: 395, demand: 2 },
  { name: 'Station', x: 840, y: 415, demand: 5 },
  { name: 'Harbor', x: 230, y: 555, demand: 5 },
  { name: 'Arena', x: 430, y: 570, demand: 4 },
  { name: 'Depot East', x: 620, y: 575, demand: 3 },
  { name: 'Theatre', x: 820, y: 600, demand: 4 },
  { name: 'Mall', x: 1045, y: 545, demand: 5 },
];

const routeColors = ['#0b57d0', '#137333', '#b3261e'];
const canvas = document.getElementById('map') as HTMLCanvasElement | null;
const routeOutput = document.getElementById('route-output');
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

function drawMap(routes: RouteSummary[], progress = 1) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f6f8fa';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#d0d7de';
  ctx.lineWidth = 1;
  for (let x = 120; x < canvas.width; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x, canvas.height - 70);
    ctx.stroke();
  }
  for (let y = 90; y < canvas.height; y += 120) {
    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(canvas.width - 70, y);
    ctx.stroke();
  }

  routes.forEach((route, routeIndex) => {
    if (!route.used) return;
    const visibleSegments = Math.max(0, (route.nodes.length - 1) * progress);
    ctx.strokeStyle = routeColors[routeIndex % routeColors.length];
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < route.nodes.length - 1; i++) {
      const from = stops[route.nodes[i]];
      const to = stops[route.nodes[i + 1]];
      if (i === 0) ctx.moveTo(from.x, from.y);
      if (i + 1 <= visibleSegments) {
        ctx.lineTo(to.x, to.y);
      } else if (i < visibleSegments) {
        const partial = visibleSegments - i;
        ctx.lineTo(from.x + (to.x - from.x) * partial, from.y + (to.y - from.y) * partial);
      }
    }
    ctx.stroke();
  });

  stops.forEach((stop, index) => {
    const isDepot = index < 3;
    ctx.fillStyle = isDepot ? '#111827' : '#ffffff';
    ctx.strokeStyle = isDepot ? '#111827' : '#57606a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stop.x, stop.y, isDepot ? 12 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isDepot ? '#111827' : '#24292f';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(isDepot ? stop.name : `${index}. ${stop.name}`, stop.x + 14, stop.y - 10);
    if (!isDepot) {
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`load ${stop.demand}`, stop.x + 14, stop.y + 9);
    }
  });
}

function animateRoutes(routes: RouteSummary[]) {
  cancelAnimationFrame(animationFrame);
  const start = performance.now();
  const durationMs = 4200;
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / durationMs);
    drawMap(routes, progress);
    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
    }
  };
  animationFrame = requestAnimationFrame(tick);
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

      const searchParameters = DefaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;
      searchParameters.solution_limit = 1;

      appendStatus(statusEl, 'Solving multi-depot vehicle routes...');
      const assignment = await routing.SolveWithParameters(searchParameters);
      if (!assignment) {
        appendStatus(statusEl, 'No solution found.');
        return;
      }

      const routes = extractRoutes(manager, routing, assignment);
      renderRouteList(routeOutput, routes);
      animateRoutes(routes);
      appendStatus(statusEl, `Objective: ${assignment.ObjectiveValue()}`);
      appendStatus(statusEl, `Total distance: ${routes.reduce((sum, route) => sum + route.distance, 0)}m`);
      appendStatus(statusEl, 'Vehicles start and end at separate depots.');
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
