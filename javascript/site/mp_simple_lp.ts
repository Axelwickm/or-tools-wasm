import { setControlAvailable } from './example_controls.js';
import {
  appendStatus,
  configureSolverThreadsInput,
  configureMPSolverExecutor,
  currentMPSolverExecutionOptions,
  formatNumber,
  getSelectedSolverThreads,
  renderSimpleMpResult,
  setRunning,
  solveSimpleMpProgram,
} from './mp_solver_helpers.js';
import { getMaxWorkerCount } from './worker_limits.js';
import { MPSolver } from 'or-tools-wasm/mp-solver';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const solverSelect = document.getElementById('solver') as HTMLSelectElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const solverParametersInput = document.getElementById('solver-parameters') as HTMLInputElement | null;
const incrementalInput = document.getElementById('incremental') as HTMLInputElement | null;
const warmStartInput = document.getElementById('warm-start') as HTMLInputElement | null;
const clampSampleInput = document.getElementById('clamp-sample') as HTMLInputElement | null;
const lazyLimitInput = document.getElementById('lazy-limit') as HTMLInputElement | null;
const maxWorkerCount = getMaxWorkerCount();

configureMPSolverExecutor(executorSelector);
configureSolverThreadsInput(workerInput, maxWorkerCount);

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

function updateNativeControls() {
  setControlAvailable(workerInput, !['GLPK', 'GLPK_LP'].includes(selectedSolverId()));
  if (lazyLimitInput?.checked && selectedSolverId() === 'SCIP' && workerInput) workerInput.value = '1';
  for (const [input, backend] of [[warmStartInput, 'GLOP'], [lazyLimitInput, 'SCIP']] as const) {
    setControlAvailable(input, selectedSolverId() === backend);
  }
}
solverSelect?.addEventListener('change', updateNativeControls);
lazyLimitInput?.addEventListener('change', updateNativeControls);
updateNativeControls();

async function runSimpleLp() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  if (solutionOutput) solutionOutput.textContent = 'Solving…';
  try {
    const solverId = selectedSolverId();
    const backend = MPSolver.createSolver(solverId);
    if (!backend) throw new Error(`${solverId} is unavailable.`);
    const callbacks = await backend.supportsCallbacks(currentMPSolverExecutionOptions());
    const messages = await backend.supportsMessageCallbacks(currentMPSolverExecutionOptions());
    appendStatus(statusEl, `Native callback support: search=${callbacks}, messages=${messages}`);
    const variableKind = solverId === 'SAT' || solverId === 'GLPK' || solverId === 'SCIP' || solverId === 'CBC' || solverId === 'BOP' || solverId === 'KNAPSACK' ? 'integer' : 'continuous';
    if (clampSampleInput?.checked) {
      const sample = backend.addVariable(0, 1, variableKind === 'integer', 'sample');
      const clamped = await MPSolver.clampSolutionWithinBounds(backend,
        { status: MPSolver.FEASIBLE, variableValue: [2] }, currentMPSolverExecutionOptions());
      appendStatus(statusEl, `Native bound clamping: sample=${clamped.value(sample)} (input=2)`);
    }
    const solverThreads = workerInput?.disabled ? 1 : getSelectedSolverThreads(workerInput, maxWorkerCount);
    const incremental = incrementalInput?.checked ?? false;
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    appendStatus(statusEl, `Solving with ${solverId}, requested solver threads=${solverThreads}...`);
    const result = await solveSimpleMpProgram({
      solverId,
      variableKind,
      expectedObjective: incremental || lazyLimitInput?.checked ? 1 : 2,
      warmStart: warmStartInput?.checked, lazyLimit: lazyLimitInput?.checked,
      solverThreads,
      solverSpecificParameters: solverParametersInput?.value,
      incremental,
      messageCallback: messages ? batch => batch.forEach(message => appendStatus(statusEl, message)) : undefined,
    });

    renderSimpleMpResult(solutionOutput, result);
    appendStatus(statusEl, `Variable domain: ${variableKind}`);
    appendStatus(statusEl, `Objective: ${formatNumber(result.objective)}`);
    appendStatus(statusEl, `x = ${formatNumber(result.x)}`);
    appendStatus(statusEl, `y = ${formatNumber(result.y)}`);
  } catch (error) {
    if (solutionOutput) solutionOutput.textContent = 'No solution available for this run.';
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
  }
}

runButton?.addEventListener('click', () => {
  void runSimpleLp();
});
