import {
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm/routing';
import { appendStatus, configureWorkerBridge, extractRoutes, renderRouteList, setRunning } from './routing_helpers.js';

const routeOutput = document.getElementById('route-output');
const statusEl = document.getElementById('status');
const routeMap = document.getElementById('route-map') as SVGSVGElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const nodeCountInput = document.getElementById('node-count') as HTMLInputElement | null;
const randomizeButton = document.getElementById('randomize') as HTMLButtonElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

type Location = {
  name: string;
  x: number;
  y: number;
};

const mapWidth = 960;
const mapHeight = 620;
const depotLocation: Location = { name: 'Depot', x: mapWidth / 2, y: mapHeight / 2 };
let locations: Location[] = [];

configureWorkerBridge(workerBridgeToggle);

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
  }
  if (statusEl) statusEl.textContent = '';
  if (routeOutput) {
    routeOutput.textContent = 'Solving route...';
  }
  renderMap();
  try {
    appendStatus(statusEl, 'Initializing routing runtime...');
    await initRouting();

    const numLocations = locations.length;
    const numVehicles = 1;
    const depot = 0;
    const manager = new RoutingIndexManager(numLocations, numVehicles, depot);
    const routing = new RoutingModel(manager);

    try {
      const transitCallbackIndex = routing.RegisterTransitCallback((fromIndex, toIndex) => {
        const fromNode = manager.IndexToNode(fromIndex);
        const toNode = manager.IndexToNode(toIndex);
        return distance(fromNode, toNode);
      });
      routing.SetArcCostEvaluatorOfAllVehicles(transitCallbackIndex);

      const searchParameters = DefaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;

      appendStatus(statusEl, 'Solving...');
      const assignment = await routing.SolveWithParameters(searchParameters);
      if (!assignment) {
        if (routeOutput) {
          routeOutput.textContent = 'No solution found.';
        }
        appendStatus(statusEl, 'No solution found.');
        return;
      }

      const routes = extractRoutes(manager, routing, assignment);
      renderRouteList(routeOutput, routes);
      renderMap(routes[0]?.nodes ?? null, true);
      appendStatus(statusEl, `Objective: ${assignment.ObjectiveValue()}`);
      appendStatus(statusEl, `Distance of the route: ${routes[0]?.distance ?? 0}m`);
    } finally {
      routing.delete();
      manager.delete();
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
