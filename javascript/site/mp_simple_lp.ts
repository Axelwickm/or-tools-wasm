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
import { MpModel } from 'or-tools-wasm/mp-solver';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const solverSelect = document.getElementById('solver') as HTMLSelectElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const diagnoseButton = document.getElementById('diagnose') as HTMLButtonElement | null;
const solverParametersInput = document.getElementById('solver-parameters') as HTMLInputElement | null;
const incrementalInput = document.getElementById('incremental') as HTMLInputElement | null;
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

async function runSimpleLp() {
  setRunning(runButton, true);
  if (diagnoseButton) diagnoseButton.disabled = true;
  if (statusEl) statusEl.textContent = '';
  try {
    const solverId = selectedSolverId();
    const variableKind = solverId === 'SAT' || solverId === 'GLPK' || solverId === 'SCIP' || solverId === 'CBC' || solverId === 'BOP' || solverId === 'KNAPSACK' ? 'integer' : 'continuous';
    const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
    const incremental = incrementalInput?.checked ?? false;
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    appendStatus(statusEl, `Solving with ${solverId}, requested solver threads=${solverThreads}...`);
    const result = await solveSimpleMpProgram({
      solverId,
      variableKind,
      expectedObjective: incremental ? 1 : 2,
      solverThreads,
      solverSpecificParameters: solverParametersInput?.value,
      incremental,
      messageCallback: solverId === 'BOP' || solverId === 'KNAPSACK' ? undefined
        : messages => messages.forEach(message => appendStatus(statusEl, message)),
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
    if (diagnoseButton) diagnoseButton.disabled = false;
  }
}

runButton?.addEventListener('click', () => {
  void runSimpleLp();
});

diagnoseButton?.addEventListener('click', () => { void diagnoseConflict(); });
async function diagnoseConflict() {
  if (diagnoseButton) { diagnoseButton.disabled = true; diagnoseButton.textContent = 'Finding conflict...'; }
  if (runButton) runButton.disabled = true;
  if (statusEl) statusEl.textContent = '';
  try {
    const model = new MpModel('conflicting limits');
    const x = model.addNumVariable(0, 10, 'x');
    model.addConstraint(2, Infinity, 'x at least 2').setCoefficient(x, 1);
    model.addConstraint(-Infinity, 1, 'x at most 1').setCoefficient(x, 1);
    const result = await model.computeIrreducibleInfeasibleSubset({
      ...currentMPSolverExecutionOptions(), timeLimitSeconds: 5,
    });
    const names = ['x at least 2', 'x at most 1'];
    if (solutionOutput) solutionOutput.textContent = result.isInfeasible
      ? `SCIP conflict: ${result.constraintIndices.map(index => names[index]).join('; ')}.`
      : 'SCIP did not prove a conflict within the limit.';
    appendStatus(statusEl, `SCIP IIS: infeasible=${result.isInfeasible}, irreducible=${result.isIrreducible}`);
    appendStatus(statusEl, `Native search: ${formatNumber(result.timeSeconds)} seconds, ${result.nodes} nodes`);
  } catch (error) { appendStatus(statusEl, `Conflict diagnosis failed: ${(error as Error).message}`); }
  finally {
    if (diagnoseButton) { diagnoseButton.disabled = false; diagnoseButton.textContent = 'Diagnose conflicting limits (SCIP)'; }
    if (runButton) runButton.disabled = false;
  }
}
