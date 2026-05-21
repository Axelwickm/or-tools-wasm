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
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const solverSelect = document.getElementById('solver') as HTMLSelectElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const maxWorkerCount = getMaxWorkerCount();

configureWorkerBridge(workerBridgeToggle);

if (workerInput) {
  workerInput.max = String(maxWorkerCount);
  workerInput.min = '1';
  workerInput.value = String(maxWorkerCount);
}

function selectedSolverId() {
  return solverSelect?.value === 'CLP'
    || solverSelect?.value === 'SAT'
    || solverSelect?.value === 'GLPK_LP'
    || solverSelect?.value === 'GLPK'
    || solverSelect?.value === 'SCIP'
    || solverSelect?.value === 'CBC'
    || solverSelect?.value === 'BOP'
    || solverSelect?.value === 'KNAPSACK'
    ? solverSelect.value
    : 'GLOP';
}

function getSelectedWorkerCount() {
  const requested = Number.parseInt(workerInput?.value ?? '1', 10) || 1;
  const workers = Math.min(Math.max(1, requested), maxWorkerCount);
  if (workerInput) workerInput.value = String(workers);
  return workers;
}

function updateWorkerInput() {
  if (!workerInput) return;
  workerInput.disabled = selectedSolverId() !== 'SAT';
}

solverSelect?.addEventListener('change', updateWorkerInput);
updateWorkerInput();

async function runSimpleLp() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    const solverId = selectedSolverId();
    const variableKind = solverId === 'SAT' || solverId === 'GLPK' || solverId === 'SCIP' || solverId === 'CBC' || solverId === 'BOP' || solverId === 'KNAPSACK' ? 'integer' : 'continuous';
    const workerCount = solverId === 'SAT' ? getSelectedWorkerCount() : undefined;
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    appendStatus(statusEl, workerCount
      ? `Solving with ${solverId}, workers=${workerCount}...`
      : `Solving with ${solverId}...`);
    const result = await solveSimpleMpProgram({
      solverId,
      variableKind,
      expectedObjective: 2,
      workerCount,
    });

    renderSimpleMpResult(solutionOutput, result);
    appendStatus(statusEl, `Variable domain: ${variableKind}`);
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
  void runSimpleLp();
});
