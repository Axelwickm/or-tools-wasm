import {
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm';
import { appendStatus, configureWorkerBridge, extractRoutes, renderRouteList, setRunning } from './routing_helpers.js';

const routeOutput = document.getElementById('route-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

configureWorkerBridge(workerBridgeToggle);

async function runSimpleRouting() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing routing runtime...');
    await initRouting();

    const numLocations = 5;
    const numVehicles = 1;
    const depot = 0;
    const manager = new RoutingIndexManager(numLocations, numVehicles, depot);
    const routing = new RoutingModel(manager);

    try {
      const transitCallbackIndex = routing.RegisterTransitCallback((fromIndex, toIndex) => {
        const fromNode = manager.IndexToNode(fromIndex);
        const toNode = manager.IndexToNode(toIndex);
        return Math.abs(toNode - fromNode);
      });
      routing.SetArcCostEvaluatorOfAllVehicles(transitCallbackIndex);

      const searchParameters = DefaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;

      appendStatus(statusEl, 'Solving...');
      const assignment = await routing.SolveWithParameters(searchParameters);
      if (!assignment) {
        appendStatus(statusEl, 'No solution found.');
        return;
      }

      const routes = extractRoutes(manager, routing, assignment);
      renderRouteList(routeOutput, routes);
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
  }
}

runButton?.addEventListener('click', () => {
  void runSimpleRouting();
});
