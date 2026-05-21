import {
  initKnapsack,
  isWorkerBridgeEnabled,
  KnapsackSolver,
  KnapsackSolverType,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm/knapsack';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

const profits = [360, 83, 59, 130, 431, 67, 230, 52, 93, 125, 670, 892, 600];
const weights = [[7, 0, 30, 22, 80, 94, 11, 81, 70, 64, 59, 18, 0]];
const capacities = [170];

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Knapsack';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function renderSolution(profit: number, selectedItems: number[], optimal: boolean) {
  if (!solutionOutput) return;
  const selectedWeight = selectedItems.reduce((sum, item) => sum + weights[0][item], 0);
  solutionOutput.innerHTML = `
    <strong>Profit:</strong> ${profit}<br>
    <strong>Weight:</strong> ${selectedWeight} / ${capacities[0]}<br>
    <strong>Items:</strong> ${selectedItems.map((item) => item + 1).join(', ')}<br>
    <strong>Optimal:</strong> ${optimal ? 'yes' : 'not proven'}
  `;
}

async function runKnapsack() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus('Initializing Knapsack runtime...');
    await initKnapsack();

    const solver = new KnapsackSolver(
      KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
      'KnapsackExample',
    );
    solver.init(profits, weights, capacities);

    appendStatus(`Solving with worker bridge ${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
    const profit = await solver.solve();
    const selectedItems = profits
      .map((_, item) => item)
      .filter((item) => solver.best_solution_contains(item));
    renderSolution(profit, selectedItems, solver.is_solution_optimal());
    appendStatus(`Done. Profit ${profit}.`);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runKnapsack());
void runKnapsack();
