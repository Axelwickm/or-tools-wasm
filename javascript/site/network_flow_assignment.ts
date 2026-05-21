import {
  initNetworkFlow,
  isWorkerBridgeEnabled,
  setWorkerBridgeEnabled,
  SimpleLinearSumAssignment,
} from 'or-tools-wasm';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

const costs = [
  [90, 76, 75, 70],
  [35, 85, 55, 65],
  [125, 95, 90, 105],
  [45, 110, 95, 115],
];

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Assignment';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function buildAssignmentData() {
  const leftNodes: number[] = [];
  const rightNodes: number[] = [];
  const arcCosts: number[] = [];
  for (let worker = 0; worker < costs.length; ++worker) {
    for (let task = 0; task < costs[worker].length; ++task) {
      leftNodes.push(worker);
      rightNodes.push(task);
      arcCosts.push(costs[worker][task]);
    }
  }
  return { leftNodes, rightNodes, arcCosts };
}

function renderSolution(assignment: SimpleLinearSumAssignment) {
  if (!solutionOutput) return;
  const rows = Array.from({ length: assignment.num_nodes() }, (_, worker) =>
    `<tr><td>${worker}</td><td>${assignment.right_mate(worker)}</td><td>${assignment.assignment_cost(worker)}</td></tr>`,
  ).join('');
  solutionOutput.innerHTML = `
    <strong>Optimal cost:</strong> ${assignment.optimal_cost()}
    <table>
      <thead><tr><th>Worker</th><th>Task</th><th>Cost</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function runAssignment() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus('Initializing Network Flow runtime...');
    await initNetworkFlow();

    const { leftNodes, rightNodes, arcCosts } = buildAssignmentData();
    const assignment = new SimpleLinearSumAssignment();
    assignment.add_arcs_with_cost(leftNodes, rightNodes, arcCosts);

    appendStatus(`Solving with worker bridge ${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
    const status = await assignment.solve();
    appendStatus(`Done. Status ${status}.`);
    renderSolution(assignment);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runAssignment());
void runAssignment();
