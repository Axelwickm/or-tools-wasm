import { MpModel, MPSolver } from 'or-tools-wasm/mp-solver';
import {
  appendStatus,
  configureSolverThreadsInput,
  configureMPSolverExecutor,
  currentMPSolverExecutionOptions,
  currentMPSolverExecutor,
  formatNumber,
  getSelectedSolverThreads,
  renderSimpleMpResult,
  setRunning,
} from './mp_solver_helpers.js';
import { getMaxWorkerCount } from './worker_limits.js';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const maxWorkerCount = getMaxWorkerCount();
const solverId = document.body.dataset.solverId === 'CLP'
  ? 'CLP'
  : document.body.dataset.solverId === 'GLPK_LP'
    ? 'GLPK_LP'
    : 'GLOP';

configureMPSolverExecutor(executorSelector);
configureSolverThreadsInput(workerInput, maxWorkerCount);

async function runSimpleGlop() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    const executionOptions = currentMPSolverExecutionOptions();
    const solverType = MPSolver.parseSolverType(solverId);
    if (solverType === null || !MPSolver.supportsProblemType(solverType)) {
      throw new Error(`${solverId} is unavailable in this build.`);
    }
    {
      const model = new MpModel('simple_lp');
      const x = model.addNumVariable(0, Infinity, 'x');
      const y = model.addNumVariable(0, Infinity, 'y');

      const c0 = model.addConstraint(-Infinity, 17.5, 'c0');
      c0.setCoefficient(x, 1);
      c0.setCoefficient(y, 7);
      const c1 = model.addConstraint(-Infinity, 3.5, 'c1');
      c1.setCoefficient(x, 1);

      const objective = model.objective();
      objective.setCoefficient(x, 1);
      objective.setCoefficient(y, 10);
      objective.setMaximization();

      const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
      appendStatus(statusEl, `Solving with ${solverId}, requested solver threads=${solverThreads}...`);
      const started = performance.now();
      const result = await MPSolver.solve(model, { ...executionOptions, solverType, threads: solverThreads });
      if (result.status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${result.status}`);

      renderSimpleMpResult(solutionOutput, {
        status: result.status,
        objective: result.objectiveValue ?? 0,
        x: result.value(x),
        y: result.value(y),
        variables: model.numVariables(),
        constraints: model.numConstraints(),
        wallTime: Math.round(performance.now() - started),
        executor: currentMPSolverExecutor(),
        solverThreads,
      });
      appendStatus(statusEl, `Objective: ${formatNumber(result.objectiveValue ?? 0)}`);
      appendStatus(statusEl, `x = ${formatNumber(result.value(x))}`);
      appendStatus(statusEl, `y = ${formatNumber(result.value(y))}`);
    }
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
  }
}

runButton?.addEventListener('click', () => {
  void runSimpleGlop();
});
