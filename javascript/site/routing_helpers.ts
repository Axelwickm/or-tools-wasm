import { setWorkerBridgeEnabled, type Assignment, type RoutingIndexManager, type RoutingModel } from 'or-tools-wasm/routing';

export type RouteSummary = {
  vehicle: number;
  nodes: number[];
  distance: number;
  used: boolean;
};

export function configureWorkerBridge(toggle: HTMLInputElement | null) {
  if (!toggle) return;
  toggle.checked = true;
  setWorkerBridgeEnabled(true);
  toggle.addEventListener('change', () => {
    setWorkerBridgeEnabled(toggle.checked);
  });
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
  for (let vehicle = 0; vehicle < manager.GetNumberOfVehicles(); vehicle++) {
    let index = routing.Start(vehicle);
    const nodes = [manager.IndexToNode(index)];
    let distance = 0;
    let step = 0;
    while (!routing.IsEnd(index)) {
      const previousIndex = index;
      index = assignment.Value(routing.NextVar(index));
      distance += routing.GetArcCostForVehicle(previousIndex, index, vehicle);
      nodes.push(manager.IndexToNode(index));
      step++;
      if (step > manager.GetNumberOfIndices() + manager.GetNumberOfVehicles()) {
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
