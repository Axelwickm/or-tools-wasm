import { initMPSolver, isWorkerBridgeEnabled, MPSolver, setWorkerBridgeEnabled, type MPVariable } from 'or-tools-wasm/mp-solver';
import {
  appendStatus,
  applySolverThreads,
  configureSolverThreadsInput,
  configureWorkerBridge,
  formatNumber,
  getSelectedSolverThreads,
  setRunning,
} from './mp_solver_helpers.js';
import { getMaxWorkerCount } from './worker_limits.js';

const costs = [
  [90, 76, 75, 70, 50, 74, 12, 68],
  [35, 85, 55, 65, 48, 101, 70, 83],
  [125, 95, 90, 105, 59, 120, 36, 73],
  [45, 110, 95, 115, 104, 83, 37, 71],
  [60, 105, 80, 75, 59, 62, 93, 88],
  [45, 65, 110, 95, 47, 31, 81, 34],
  [38, 51, 107, 41, 69, 99, 115, 48],
  [47, 85, 57, 71, 92, 77, 109, 36],
  [39, 63, 97, 49, 118, 56, 92, 61],
  [47, 101, 71, 60, 88, 109, 52, 90],
];
const taskSizes = [10, 7, 3, 12, 15, 4, 11, 5];
const totalSizeMax = 15;

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const maxWorkerCount = getMaxWorkerCount();

configureWorkerBridge(workerBridgeToggle);
configureSolverThreadsInput(workerInput, maxWorkerCount);

async function runAssignment() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    await initMPSolver();
    const solver = MPSolver.CreateSolver('SCIP');
    if (!solver) throw new Error('SCIP backend is unavailable');

    try {
      const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
      const threadConfig = applySolverThreads(solver, solverThreads);
      const numWorkers = costs.length;
      const numTasks = costs[0].length;
      const x: MPVariable[][] = [];
      for (let worker = 0; worker < numWorkers; worker++) {
        x[worker] = [];
        for (let task = 0; task < numTasks; task++) {
          x[worker][task] = solver.BoolVar(`x[${worker},${task}]`);
        }
      }

      for (let worker = 0; worker < numWorkers; worker++) {
        const capacity = solver.Constraint(-solver.infinity(), totalSizeMax, `capacity_${worker}`);
        for (let task = 0; task < numTasks; task++) {
          capacity.SetCoefficient(x[worker][task], taskSizes[task]);
        }
      }

      for (let task = 0; task < numTasks; task++) {
        const assignedOnce = solver.Constraint(1, 1, `task_${task}`);
        for (let worker = 0; worker < numWorkers; worker++) {
          assignedOnce.SetCoefficient(x[worker][task], 1);
        }
      }

      const objective = solver.Objective();
      for (let worker = 0; worker < numWorkers; worker++) {
        for (let task = 0; task < numTasks; task++) {
          objective.SetCoefficient(x[worker][task], costs[worker][task]);
        }
      }
      objective.SetMinimization();

      appendStatus(statusEl, `Solving assignment MIP with SCIP, requested solver threads=${solverThreads}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL && status !== MPSolver.FEASIBLE) {
        throw new Error(`expected OPTIMAL or FEASIBLE, got ${status}`);
      }

      const assignments: Array<{ worker: number; task: number; cost: number; size: number }> = [];
      for (let worker = 0; worker < numWorkers; worker++) {
        for (let task = 0; task < numTasks; task++) {
          if (x[worker][task].solution_value() > 0.5) {
            assignments.push({ worker, task, cost: costs[worker][task], size: taskSizes[task] });
          }
        }
      }

      if (solutionOutput) {
        solutionOutput.innerHTML = `
          <table>
            <tbody>
              <tr><th>Status</th><td>${status === MPSolver.OPTIMAL ? 'OPTIMAL' : 'FEASIBLE'}</td></tr>
              <tr><th>Worker bridge</th><td>${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}</td></tr>
              <tr><th>Requested solver threads</th><td>${threadConfig.requested}</td></tr>
              <tr><th>Thread request accepted</th><td>${threadConfig.accepted ? 'yes' : 'no'}</td></tr>
              <tr><th>Active solver threads</th><td>${threadConfig.active}</td></tr>
              <tr><th>Total cost</th><td>${formatNumber(objective.Value())}</td></tr>
              <tr><th>Variables</th><td>${solver.NumVariables()}</td></tr>
              <tr><th>Constraints</th><td>${solver.NumConstraints()}</td></tr>
              <tr><th>Branch-and-bound nodes</th><td>${solver.nodes()}</td></tr>
            </tbody>
          </table>
          <table>
            <thead><tr><th>Worker</th><th>Task</th><th>Task size</th><th>Cost</th></tr></thead>
            <tbody>
              ${assignments.map((item) => `<tr><td>${item.worker}</td><td>${item.task}</td><td>${item.size}</td><td>${item.cost}</td></tr>`).join('')}
            </tbody>
          </table>
        `;
      }
      appendStatus(statusEl, `Total cost: ${formatNumber(objective.Value())}`);
      appendStatus(statusEl, `Assignments: ${assignments.length}`);
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
  void runAssignment();
});
