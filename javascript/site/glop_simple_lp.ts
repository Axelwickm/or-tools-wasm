import { MPSolver } from 'or-tools-wasm/mp-solver';
import {
  appendStatus,
  applySolverThreads,
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
    const solver = MPSolver.createSolver(solverId);
    if (!solver) throw new Error(`${solverId} is unavailable in this build.`);
    {
      const infinity = solver.infinity();
      const x = solver.addNumVariable(0, infinity, 'x');
      const y = solver.addNumVariable(0, infinity, 'y');

      const c0 = solver.addConstraint(-infinity, 17.5, 'c0');
      c0.setCoefficient(x, 1);
      c0.setCoefficient(y, 7);
      const c1 = solver.addConstraint(-infinity, 3.5, 'c1');
      c1.setCoefficient(x, 1);

      const objective = solver.objective();
      objective.setCoefficient(x, 1);
      objective.setCoefficient(y, 10);
      objective.setMaximization();

      const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
      const threadConfig = applySolverThreads(solver, solverThreads);
      appendStatus(statusEl, `Solving with ${solver.solverVersion()}, requested solver threads=${solverThreads}...`);
      const status = await solver.solve(executionOptions);
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);

      renderSimpleMpResult(solutionOutput, {
        status,
        objective: objective.value(),
        x: x.solutionValue(),
        y: y.solutionValue(),
        variables: solver.numVariables(),
        constraints: solver.numConstraints(),
        wallTime: solver.wallTime(),
        iterations: solver.iterations(),
        executor: currentMPSolverExecutor(),
        solverThreads: threadConfig.requested,
        solverThreadsAccepted: threadConfig.accepted,
        activeSolverThreads: threadConfig.active,
      });
      appendStatus(statusEl, `Objective: ${formatNumber(objective.value())}`);
      appendStatus(statusEl, `x = ${formatNumber(x.solutionValue())}`);
      appendStatus(statusEl, `y = ${formatNumber(y.solutionValue())}`);
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
