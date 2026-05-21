import {
  initNetworkFlow,
  isWorkerBridgeEnabled,
  setWorkerBridgeEnabled,
  SimpleMinCostFlow,
} from 'or-tools-wasm';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

const startNodes = [0, 0, 1, 1, 1, 2, 2, 3, 4];
const endNodes = [1, 2, 2, 3, 4, 3, 4, 4, 2];
const capacities = [15, 8, 20, 4, 10, 15, 4, 20, 5];
const unitCosts = [4, 4, 2, 2, 6, 1, 3, 2, 3];
const supplies = [20, 0, 0, -5, -15];

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Min-Cost Flow';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function renderSolution(minCostFlow: SimpleMinCostFlow, allArcs: number[]) {
  if (!solutionOutput) return;
  const rows = allArcs.map((arc) =>
    `<tr><td>${minCostFlow.tail(arc)}</td><td>${minCostFlow.head(arc)}</td><td>${minCostFlow.capacity(arc)}</td><td>${minCostFlow.unit_cost(arc)}</td><td>${minCostFlow.flow(arc)}</td></tr>`,
  ).join('');
  solutionOutput.innerHTML = `
    <strong>Optimal cost:</strong> ${minCostFlow.optimal_cost()}<br>
    <strong>Maximum flow:</strong> ${minCostFlow.maximum_flow()}
    <table>
      <thead><tr><th>Tail</th><th>Head</th><th>Capacity</th><th>Unit cost</th><th>Flow</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function runMinCostFlow() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus('Initializing Network Flow runtime...');
    await initNetworkFlow();

    const minCostFlow = new SimpleMinCostFlow();
    const allArcs = minCostFlow.add_arcs_with_capacity_and_unit_cost(startNodes, endNodes, capacities, unitCosts);
    minCostFlow.set_nodes_supplies([0, 1, 2, 3, 4], supplies);

    appendStatus(`Solving with worker bridge ${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
    const status = await minCostFlow.solve();
    appendStatus(`Done. Status ${status}.`);
    renderSolution(minCostFlow, allArcs);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runMinCostFlow());
void runMinCostFlow();
