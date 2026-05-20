import { initMPSolver, isWorkerBridgeEnabled, MPSolver, type MPVariable } from 'or-tools-wasm';
import { appendStatus, configureWorkerBridge, formatNumber, setRunning } from './mp_solver_helpers.js';

type Plant = { name: string; supply: number };
type Warehouse = { name: string; demand: number };

const plants: Plant[] = [
  { name: 'Detroit', supply: 350 },
  { name: 'Denver', supply: 600 },
  { name: 'Austin', supply: 500 },
];

const warehouses: Warehouse[] = [
  { name: 'Boston', demand: 325 },
  { name: 'Atlanta', demand: 300 },
  { name: 'Chicago', demand: 275 },
  { name: 'Seattle', demand: 250 },
];

const costs = [
  [2.7, 1.8, 1.4, 2.9],
  [2.2, 2.5, 1.7, 1.1],
  [1.9, 1.6, 2.3, 2.4],
];

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;

configureWorkerBridge(workerBridgeToggle);

function renderTransportationResult(
  shipments: MPVariable[][],
  objective: number,
  wallTime: number,
  iterations: number,
) {
  if (!solutionOutput) return;
  solutionOutput.innerHTML = `
    <table>
      <tbody>
        <tr><th>Total cost</th><td>${formatNumber(objective)}</td></tr>
        <tr><th>Worker bridge</th><td>${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}</td></tr>
        <tr><th>Solver workers</th><td>1</td></tr>
        <tr><th>Wall time</th><td>${wallTime} ms</td></tr>
        <tr><th>Iterations</th><td>${iterations}</td></tr>
      </tbody>
    </table>
    <h2>Shipments</h2>
    <table>
      <thead>
        <tr>
          <th>Plant</th>
          ${warehouses.map((warehouse) => `<th>${warehouse.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${plants.map((plant, plantId) => `
          <tr>
            <th>${plant.name}</th>
            ${warehouses.map((_, warehouseId) => `<td>${formatNumber(shipments[plantId][warehouseId].solution_value())}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function runTransportation() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    await initMPSolver();
    const solver = MPSolver.CreateSolver('CLP');
    if (!solver) throw new Error('CLP is unavailable in this build.');
    try {
      const shipments = plants.map((plant) =>
        warehouses.map((warehouse) =>
          solver.NumVar(0, solver.infinity(), `ship_${plant.name}_${warehouse.name}`),
        ),
      );

      for (const [plantId, plant] of plants.entries()) {
        const constraint = solver.Constraint(0, plant.supply, `supply_${plant.name}`);
        for (const warehouseId of warehouses.keys()) {
          constraint.SetCoefficient(shipments[plantId][warehouseId], 1);
        }
      }

      for (const [warehouseId, warehouse] of warehouses.entries()) {
        const constraint = solver.Constraint(warehouse.demand, warehouse.demand, `demand_${warehouse.name}`);
        for (const plantId of plants.keys()) {
          constraint.SetCoefficient(shipments[plantId][warehouseId], 1);
        }
      }

      const objective = solver.Objective();
      for (const plantId of plants.keys()) {
        for (const warehouseId of warehouses.keys()) {
          objective.SetCoefficient(shipments[plantId][warehouseId], costs[plantId][warehouseId]);
        }
      }
      objective.SetMinimization();

      appendStatus(statusEl, `Solving with ${solver.SolverVersion()}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);

      renderTransportationResult(shipments, objective.Value(), solver.WallTime(), solver.Iterations());
      appendStatus(statusEl, `Objective: ${formatNumber(objective.Value())}`);
      appendStatus(statusEl, `Variables: ${solver.NumVariables()}`);
      appendStatus(statusEl, `Constraints: ${solver.NumConstraints()}`);
      appendStatus(statusEl, `Iterations: ${solver.Iterations()}`);
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
  void runTransportation();
});
