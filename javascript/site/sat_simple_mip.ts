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
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const maxWorkerCount = getMaxWorkerCount();
const solverId = document.body.dataset.solverId === 'GLPK'
  ? 'GLPK'
  : document.body.dataset.solverId === 'SCIP'
    ? 'SCIP'
    : document.body.dataset.solverId === 'CBC'
      ? 'CBC'
      : 'SAT';

configureSolverThreadsInput(workerInput, maxWorkerCount);

configureMPSolverExecutor(executorSelector);

async function runSimpleMip() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    const executionOptions = currentMPSolverExecutionOptions();
    const solver = MPSolver.createSolver(solverId);
    if (!solver) throw new Error(`${solverId} backend is unavailable in this build.`);
    {
      const infinity = solver.infinity();
      const x = solver.addIntVariable(0, infinity, 'x');
      const y = solver.addIntVariable(0, infinity, 'y');

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
      appendStatus(statusEl, `Solving with ${solverId} integer backend, requested solver threads=${solverThreads}...`);
      if (solverId === 'SAT') {
        const protoResult = await solver.solveWithProto({
          ...executionOptions,
          solverSpecificParameters: `num_workers: ${solverThreads}`,
        });
        if (!protoResult.loaded) throw new Error('Solver returned a solution response that could not be loaded.');
      } else {
        const status = await solver.solve(executionOptions);
        if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);
      }
      if (Math.abs(objective.value() - 23) > 1e-6) {
        throw new Error(`Expected objective 23, got ${formatNumber(objective.value())}.`);
      }

      renderSimpleMpResult(solutionOutput, {
        status: MPSolver.OPTIMAL,
        objective: objective.value(),
        x: x.solutionValue(),
        y: y.solutionValue(),
        variables: solver.numVariables(),
        constraints: solver.numConstraints(),
        wallTime: solver.wallTime(),
        iterations: solver.iterations(),
        nodes: solver.nodes(),
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
  void runSimpleMip();
});
