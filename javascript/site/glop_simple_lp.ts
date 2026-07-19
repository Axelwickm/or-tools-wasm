import { initMPSolver, MPSolver } from 'or-tools-wasm/mp-solver';
import {
  appendStatus,
  applySolverThreads,
  configureSolverThreadsInput,
  configureMPSolverExecutor,
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
    await initMPSolver();
    const solver = MPSolver.CreateSolver(solverId);
    if (!solver) throw new Error(`${solverId} is unavailable in this build.`);
    try {
      const infinity = solver.infinity();
      const x = solver.NumVar(0, infinity, 'x');
      const y = solver.NumVar(0, infinity, 'y');

      const c0 = solver.Constraint(-infinity, 17.5, 'c0');
      c0.SetCoefficient(x, 1);
      c0.SetCoefficient(y, 7);
      const c1 = solver.Constraint(-infinity, 3.5, 'c1');
      c1.SetCoefficient(x, 1);

      const objective = solver.Objective();
      objective.SetCoefficient(x, 1);
      objective.SetCoefficient(y, 10);
      objective.SetMaximization();

      const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
      const threadConfig = applySolverThreads(solver, solverThreads);
      appendStatus(statusEl, `Solving with ${solver.SolverVersion()}, requested solver threads=${solverThreads}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);

      renderSimpleMpResult(solutionOutput, {
        status,
        objective: objective.Value(),
        x: x.solution_value(),
        y: y.solution_value(),
        variables: solver.NumVariables(),
        constraints: solver.NumConstraints(),
        wallTime: solver.WallTime(),
        iterations: solver.Iterations(),
        nodes: solver.nodes(),
        executor: currentMPSolverExecutor(),
        solverThreads: threadConfig.requested,
        solverThreadsAccepted: threadConfig.accepted,
        activeSolverThreads: threadConfig.active,
      });
      appendStatus(statusEl, `Objective: ${formatNumber(objective.Value())}`);
      appendStatus(statusEl, `x = ${formatNumber(x.solution_value())}`);
      appendStatus(statusEl, `y = ${formatNumber(y.solution_value())}`);
    } finally {
      solver.delete();
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
