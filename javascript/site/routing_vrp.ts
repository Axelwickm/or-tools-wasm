import {
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  RoutingIndexManager,
  RoutingModel,
  setExecutor,
} from 'or-tools-wasm/routing';
import { appendStatus, extractRoutes, renderRouteList, setRunning, type RouteSummary } from './routing_helpers.js';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

type Location = {
  name: string;
  x: number;
  y: number;
};

const routeOutput = document.getElementById('route-output');
const statusEl = document.getElementById('status');
const routeMap = document.getElementById('route-map') as SVGSVGElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const destinationCountInput = document.getElementById('destination-count') as HTMLInputElement | null;
const vehicleCountInput = document.getElementById('vehicle-count') as HTMLInputElement | null;
const randomizeButton = document.getElementById('randomize') as HTMLButtonElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

const mapWidth = 960;
const mapHeight = 620;
const depotLocation: Location = { name: 'Depot', x: mapWidth / 2, y: mapHeight / 2 };
const routeColors = ['#0969da', '#cf222e', '#1a7f37', '#8250df', '#bf8700', '#d1248f', '#0a7ea4', '#57606a'];
const routeRevealSeconds = 2;
let locations: Location[] = [];

configureSolverExecutorSelector({ setExecutor }, executorSelector);

const destinationCount = () => {
  const value = Number.parseInt(destinationCountInput?.value ?? '60', 10);
  return Math.max(4, Number.isFinite(value) ? value : 60);
};

const vehicleCount = () => {
  const value = Number.parseInt(vehicleCountInput?.value ?? '4', 10);
  return Math.max(1, Number.isFinite(value) ? value : 4);
};

const vehicleCapacity = () => Math.max(1, Math.ceil(destinationCount() / vehicleCount()));

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

const distance = (fromNode: number, toNode: number) => {
  const from = locations[fromNode];
  const to = locations[toNode];
  return Math.round(Math.hypot(to.x - from.x, to.y - from.y));
};

const setControlsDisabled = (disabled: boolean) => {
  setRunning(runButton, disabled);
  if (randomizeButton) randomizeButton.disabled = disabled;
  if (destinationCountInput) destinationCountInput.disabled = disabled;
  if (vehicleCountInput) vehicleCountInput.disabled = disabled;
};

const renderMap = (routes: RouteSummary[] | null = null, animate = false) => {
  if (!routeMap) return;
  const activeRoutes = routes?.filter((route) => route.used) ?? [];
  const routeSegments = activeRoutes.map((route) => {
    const color = routeColors[route.vehicle % routeColors.length];
    const segments = route.nodes.slice(0, -1).map((node, index) => {
      const from = locations[node];
      const to = locations[route.nodes[index + 1]];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      return { from, to, length, index };
    });
    const segmentDuration = segments.length ? routeRevealSeconds / segments.length : 0;
    return segments.map(({ from, to, length, index }) => {
      const nodeClearance = 10;
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
          stroke="${color}" stroke-width="3" stroke-linecap="round" marker-end="url(#route-arrow-${route.vehicle})" style="${arrowStyle}" />
      `;
    }).join('');
  }).join('');

  const markers = Array.from({ length: Math.max(vehicleCount(), routeColors.length) }, (_, vehicle) => {
    const color = routeColors[vehicle % routeColors.length];
    return `
      <marker id="route-arrow-${vehicle}" markerWidth="7" markerHeight="7" refX="6.2" refY="2.5" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,5 L7,2.5 z" fill="${color}"></path>
      </marker>
    `;
  }).join('');
  const nodes = locations.map((location, node) => {
    const isDepot = node === 0;
    const radius = isDepot ? 17 : 13;
    const fill = isDepot ? '#24292f' : '#fff';
    const textFill = isDepot ? '#fff' : '#24292f';
    return `
      <g>
        ${isDepot ? `<circle cx="${location.x}" cy="${location.y}" r="${radius + 7}" fill="#fff" opacity="0.86"></circle>` : ''}
        <circle cx="${location.x}" cy="${location.y}" r="${radius}" fill="${fill}" stroke="#24292f" stroke-width="2"></circle>
        <text x="${location.x}" y="${location.y + 4}" text-anchor="middle" font-size="12" fill="${textFill}" font-weight="700">${node}</text>
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
          to { opacity: 0.82; }
        }
      </style>
      ${markers}
      <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M40 0H0V40" fill="none" stroke="#d0d7de" stroke-width="1" opacity="0.45"></path>
      </pattern>
    </defs>
    <rect x="0" y="0" width="${mapWidth}" height="${mapHeight}" fill="url(#map-grid)"></rect>
    <text x="24" y="34" font-size="16" fill="#24292f" font-weight="700">${routes ? 'Solved vehicle routes' : 'Unassigned destinations'}</text>
    <text x="24" y="56" font-size="12" fill="#57606a">${routes ? 'Each color is one vehicle route from and back to the depot.' : 'The solver has not split destinations across vehicles yet.'}</text>
    ${routeSegments}
    ${nodes}
  `;
};

const resetRouteView = () => {
  if (routeOutput) routeOutput.textContent = 'Run the solver to view vehicle routes.';
  if (statusEl) statusEl.textContent = '';
  renderMap();
};

async function runVrp() {
  setControlsDisabled(true);
  if (statusEl) statusEl.textContent = '';
  if (routeOutput) routeOutput.textContent = 'Solving vehicle routes...';
  renderMap();
  try {
    appendStatus(statusEl, 'Initializing routing runtime...');
    await initRouting();

    const manager = new RoutingIndexManager(locations.length, vehicleCount(), 0);
    const routing = new RoutingModel(manager);
    try {
      const transitCallbackIndex = routing.RegisterTransitCallback((fromIndex, toIndex) => {
        const fromNode = manager.IndexToNode(fromIndex);
        const toNode = manager.IndexToNode(toIndex);
        return distance(fromNode, toNode);
      });
      routing.SetArcCostEvaluatorOfAllVehicles(transitCallbackIndex);

      const demandCallbackIndex = routing.RegisterUnaryTransitCallback((fromIndex) => {
        return manager.IndexToNode(fromIndex) === 0 ? 0 : 1;
      });
      const capacityAdded = routing.AddDimensionWithVehicleCapacity(
        demandCallbackIndex,
        0,
        Array(vehicleCount()).fill(vehicleCapacity()),
        true,
        'load',
      );
      if (!capacityAdded) {
        throw new Error('Could not add vehicle load dimension.');
      }

      const searchParameters = DefaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;

      appendStatus(statusEl, 'Solving...');
      const assignment = await routing.SolveWithParameters(searchParameters);
      if (!assignment) {
        if (routeOutput) routeOutput.textContent = 'No solution found.';
        appendStatus(statusEl, 'No solution found.');
        return;
      }

      const routes = extractRoutes(manager, routing, assignment);
      renderRouteList(routeOutput, routes);
      renderMap(routes, true);
      appendStatus(statusEl, `Objective: ${assignment.ObjectiveValue()}`);
      appendStatus(statusEl, `Total distance: ${routes.reduce((sum, route) => sum + route.distance, 0)}m`);
      appendStatus(statusEl, `Active vehicles: ${routes.filter((route) => route.used).length}/${vehicleCount()}`);
      appendStatus(statusEl, `Vehicle capacity: ${vehicleCapacity()} destinations`);
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
  void runVrp();
});

randomizeButton?.addEventListener('click', () => {
  const count = destinationCount();
  if (destinationCountInput) destinationCountInput.value = String(count);
  generateLocations(count);
  resetRouteView();
});

destinationCountInput?.addEventListener('change', () => {
  const count = destinationCount();
  if (destinationCountInput) destinationCountInput.value = String(count);
  generateLocations(count);
  resetRouteView();
});

vehicleCountInput?.addEventListener('change', () => {
  const count = vehicleCount();
  if (vehicleCountInput) vehicleCountInput.value = String(count);
  resetRouteView();
});

generateLocations();
renderMap();
