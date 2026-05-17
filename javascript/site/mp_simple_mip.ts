import {
  appendStatus,
  formatNumber,
  renderSimpleMpResult,
  setRunning,
  solveSimpleMpProgram,
} from './mp_solver_helpers.js';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const runButton = document.getElementById('run') as HTMLButtonElement | null;

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
