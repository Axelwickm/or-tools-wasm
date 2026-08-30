import {
  type Assignment,
  type ExecutorConfiguration,
  type RoutingIndexManager,
  type RoutingModel,
  type RoutingSolveOptions,
} from 'or-tools-wasm/routing';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

export type RouteSummary = {
  vehicle: number;
  nodes: number[];
  distance: number;
  used: boolean;
};

let readRoutingExecutor: () => ExecutorConfiguration = () => ({ type: 'worker' });

export function configureRoutingExecutor(selector: HTMLSelectElement | null): void {
  readRoutingExecutor = configureSolverExecutorSelector(null, selector);
}

export function currentRoutingExecutionOptions(): RoutingSolveOptions {
  return { executor: readRoutingExecutor() };
}

export function appendStatus(statusEl: HTMLElement | null, text: string) {
  if (statusEl) {
    statusEl.textContent += `${text}\n`;
  }
}

export function setRunning(runButton: HTMLButtonElement | null, running: boolean) {
  if (runButton) {
    runButton.disabled = running;
  }
}

export function extractRoutes(
  manager: RoutingIndexManager,
  routing: RoutingModel,
  assignment: Assignment,
): RouteSummary[] {
  const routes: RouteSummary[] = [];
  for (let vehicle = 0; vehicle < manager.getNumberOfVehicles(); vehicle++) {
    let index = routing.start(vehicle);
    const nodes = [manager.indexToNode(index)];
    let distance = 0;
    let step = 0;
    while (!routing.isEnd(index)) {
      const previousIndex = index;
      index = assignment.value(routing.nextVar(index));
      distance += routing.getArcCostForVehicle(previousIndex, index, vehicle);
      nodes.push(manager.indexToNode(index));
      step++;
      if (step > manager.getNumberOfIndices() + manager.getNumberOfVehicles()) {
        throw new Error(`Route ${vehicle} did not terminate.`);
      }
    }
    routes.push({
      vehicle,
      nodes,
      distance,
      used: nodes.length > 2,
    });
  }
  return routes;
}

export function renderRouteList(container: HTMLElement | null, routes: RouteSummary[]) {
  if (!container) return;
  container.innerHTML = '';
  const list = document.createElement('ul');
  for (const route of routes) {
    if (!route.used && routes.length > 1) continue;
    const item = document.createElement('li');
    item.textContent = `Vehicle ${route.vehicle}: ${route.nodes.join(' -> ')} (${route.distance}m)`;
    list.appendChild(item);
  }
  container.appendChild(list);
}
