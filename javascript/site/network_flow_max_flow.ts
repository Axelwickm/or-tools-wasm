import {
  initNetworkFlow,
  isWorkerBridgeEnabled,
  setWorkerBridgeEnabled,
  SimpleMaxFlow,
} from 'or-tools-wasm/network-flow';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

const startNodes = [0, 0, 0, 1, 1, 2, 2, 3, 3];
const endNodes = [1, 2, 3, 2, 4, 3, 4, 2, 4];
const capacities = [20, 30, 10, 40, 30, 10, 20, 5, 20];

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Max Flow';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function renderSolution(maxFlow: SimpleMaxFlow, allArcs: number[]) {
  if (!solutionOutput) return;
  const rows = allArcs.map((arc) =>
    `<tr><td>${maxFlow.tail(arc)}</td><td>${maxFlow.head(arc)}</td><td>${maxFlow.capacity(arc)}</td><td>${maxFlow.flow(arc)}</td></tr>`,
  ).join('');
  solutionOutput.innerHTML = `
    <strong>Optimal flow:</strong> ${maxFlow.optimal_flow()}<br>
    <strong>Source-side min cut:</strong> ${maxFlow.get_source_side_min_cut().join(', ')}<br>
    <strong>Sink-side min cut:</strong> ${maxFlow.get_sink_side_min_cut().join(', ')}
    <table>
      <thead><tr><th>Tail</th><th>Head</th><th>Capacity</th><th>Flow</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function runMaxFlow() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus('Initializing Network Flow runtime...');
    await initNetworkFlow();

    const maxFlow = new SimpleMaxFlow();
    const allArcs = maxFlow.add_arcs_with_capacity(startNodes, endNodes, capacities);
    appendStatus(`Solving with worker bridge ${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
    const status = await maxFlow.solve(0, 4);
    appendStatus(`Done. Status ${status}.`);
    renderSolution(maxFlow, allArcs);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runMaxFlow());
void runMaxFlow();
