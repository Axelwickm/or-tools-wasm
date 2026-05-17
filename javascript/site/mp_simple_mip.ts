import {
  appendStatus,
  configureWorkerBridge,
  formatNumber,
  renderSimpleMpResult,
  setRunning,
  solveSimpleMpProgram,
} from './mp_solver_helpers.js';
import { getMaxWorkerCount } from './worker_limits.js';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const maxWorkerCount = getMaxWorkerCount();

if (workerInput) {
  workerInput.max = String(maxWorkerCount);
  workerInput.min = '1';
  workerInput.value = String(maxWorkerCount);
}

configureWorkerBridge(workerBridgeToggle);

function getSelectedWorkerCount() {
  const requested = Number.parseInt(workerInput?.value ?? '1', 10) || 1;
  const workers = Math.min(Math.max(1, requested), maxWorkerCount);
  if (workerInput) {
    workerInput.value = String(workers);
  }
  return workers;
}

async function runSimpleMip() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    appendStatus(statusEl, 'Solving with SAT integer backend...');
    const result = await solveSimpleMpProgram({
      solverId: 'SAT',
      variableKind: 'integer',
      expectedObjective: 23,
      workerCount: getSelectedWorkerCount(),
    });

    renderSimpleMpResult(solutionOutput, result);
    appendStatus(statusEl, `Objective: ${formatNumber(result.objective)}`);
    appendStatus(statusEl, `x = ${formatNumber(result.x)}`);
    appendStatus(statusEl, `y = ${formatNumber(result.y)}`);
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
  }
}

runButton?.addEventListener('click', () => {
  void runSimpleMip();
});
