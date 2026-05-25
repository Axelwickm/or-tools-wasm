import { initMPSolver, isWorkerBridgeEnabled, MPSolver, type MPVariable } from 'or-tools-wasm/mp-solver';
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

type Plant = { name: string; supply: number };
type Warehouse = { name: string; demand: number };
type TransportationProblem = {
  plants: Plant[];
  warehouses: Warehouse[];
  costs: number[][];
};

const defaultProblem: TransportationProblem = {
  plants: [
    { name: 'Detroit', supply: 350 },
    { name: 'Denver', supply: 600 },
    { name: 'Austin', supply: 500 },
  ],
  warehouses: [
    { name: 'Boston', demand: 325 },
    { name: 'Atlanta', demand: 300 },
    { name: 'Chicago', demand: 275 },
    { name: 'Seattle', demand: 250 },
  ],
  costs: [
    [2.7, 1.8, 1.4, 2.9],
    [2.2, 2.5, 1.7, 1.1],
    [1.9, 1.6, 2.3, 2.4],
  ],
};

let problem = cloneProblem(defaultProblem);

const solutionOutput = document.getElementById('solution-output');
const transportViz = document.getElementById('transport-viz');
const transportDetail = document.getElementById('transport-detail');
const transportEditor = document.getElementById('transport-editor');
const statusEl = document.getElementById('status');
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const resetButton = document.getElementById('reset') as HTMLButtonElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const maxWorkerCount = getMaxWorkerCount();

configureWorkerBridge(workerBridgeToggle);
configureSolverThreadsInput(workerInput, maxWorkerCount);

const plantColors = ['#0969da', '#8250df', '#1a7f37'];
let lastTransportationValues: number[][] | undefined;

function cloneProblem(source: TransportationProblem): TransportationProblem {
  return {
    plants: source.plants.map((plant) => ({ ...plant })),
    warehouses: source.warehouses.map((warehouse) => ({ ...warehouse })),
    costs: source.costs.map((row) => [...row]),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char));
}

function shipmentMatrix(shipments: MPVariable[][]) {
  return shipments.map((row) => row.map((variable) => variable.solution_value()));
}

function readNumberInput(selector: string, fallback: number) {
  const input = transportEditor?.querySelector<HTMLInputElement>(selector);
  const value = Number.parseFloat(input?.value ?? '');
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function readTextInput(selector: string, fallback: string) {
  const input = transportEditor?.querySelector<HTMLInputElement>(selector);
  return input?.value.trim() || fallback;
}

function readProblemFromEditor() {
  problem = {
    plants: problem.plants.map((plant, plantId) => ({
      name: readTextInput(`[data-plant-name="${plantId}"]`, plant.name),
      supply: readNumberInput(`[data-plant-supply="${plantId}"]`, plant.supply),
    })),
    warehouses: problem.warehouses.map((warehouse, warehouseId) => ({
      name: readTextInput(`[data-warehouse-name="${warehouseId}"]`, warehouse.name),
      demand: readNumberInput(`[data-warehouse-demand="${warehouseId}"]`, warehouse.demand),
    })),
    costs: problem.costs.map((row, plantId) =>
      row.map((cost, warehouseId) => readNumberInput(`[data-cost="${plantId}-${warehouseId}"]`, cost)),
    ),
  };
}

function renderProblemEditor() {
  if (!transportEditor) return;
  transportEditor.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Plant</th>
          <th>Supply</th>
          ${problem.warehouses.map((warehouse, warehouseId) => `
            <th>
              <input class="name-input" data-warehouse-name="${warehouseId}" value="${escapeHtml(warehouse.name)}" aria-label="Warehouse ${warehouseId + 1} name">
              <br>
              Demand <input data-warehouse-demand="${warehouseId}" type="number" min="0" step="1" value="${warehouse.demand}" aria-label="${escapeHtml(warehouse.name)} demand">
            </th>
          `).join('')}
        </tr>
      </thead>
      <tbody>
        ${problem.plants.map((plant, plantId) => `
          <tr>
            <th>
              <input class="name-input" data-plant-name="${plantId}" value="${escapeHtml(plant.name)}" aria-label="Plant ${plantId + 1} name">
            </th>
            <td>
              <input data-plant-supply="${plantId}" type="number" min="0" step="1" value="${plant.supply}" aria-label="${escapeHtml(plant.name)} supply">
            </td>
            ${problem.warehouses.map((warehouse, warehouseId) => `
              <td>
                <input data-cost="${plantId}-${warehouseId}" type="number" min="0" step="0.1" value="${problem.costs[plantId][warehouseId]}" aria-label="${escapeHtml(plant.name)} to ${escapeHtml(warehouse.name)} cost">
              </td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  transportEditor.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => {
      readProblemFromEditor();
      renderTransportationVisualization();
      if (solutionOutput) {
        solutionOutput.textContent = 'Solve the edited problem to view shipment quantities and total cost.';
      }
    });
  });
}

function setTransportDetail(message = 'Hover a plant, warehouse, or lane to inspect it.') {
  if (transportDetail) transportDetail.textContent = message;
}

function clearTransportHighlight() {
  transportViz?.classList.remove('has-focus');
  transportViz?.querySelectorAll('.highlight').forEach((element) => {
    element.classList.remove('highlight');
  });
  setTransportDetail();
}

function highlightTransport(kind: 'plant' | 'warehouse' | 'lane', plantId: number, warehouseId?: number) {
  if (!transportViz) return;
  clearTransportHighlight();
  transportViz.classList.add('has-focus');
  const laneSelector = kind === 'plant'
    ? `.transport-lane[data-plant="${plantId}"]`
    : kind === 'warehouse'
      ? `.transport-lane[data-warehouse="${warehouseId}"]`
      : `.transport-lane[data-plant="${plantId}"][data-warehouse="${warehouseId}"]`;
  transportViz.querySelectorAll(laneSelector).forEach((element) => element.classList.add('highlight'));

  const plantsToHighlight = new Set<number>();
  const warehousesToHighlight = new Set<number>();
  if (kind === 'plant') {
    plantsToHighlight.add(plantId);
    problem.warehouses.forEach((_, index) => warehousesToHighlight.add(index));
  } else if (kind === 'warehouse' && warehouseId !== undefined) {
    warehousesToHighlight.add(warehouseId);
    problem.plants.forEach((_, index) => plantsToHighlight.add(index));
  } else if (warehouseId !== undefined) {
    plantsToHighlight.add(plantId);
    warehousesToHighlight.add(warehouseId);
  }
  plantsToHighlight.forEach((index) => {
    transportViz.querySelector(`.transport-node.plant[data-plant="${index}"]`)?.classList.add('highlight');
  });
  warehousesToHighlight.forEach((index) => {
    transportViz.querySelector(`.transport-node.warehouse[data-warehouse="${index}"]`)?.classList.add('highlight');
  });

  if (kind === 'plant') {
    const plant = problem.plants[plantId];
    const shipped = problem.warehouses.reduce((total, _, index) => total + (lastTransportationValues?.[plantId]?.[index] ?? 0), 0);
    setTransportDetail(`${plant.name}: supply ${plant.supply}${lastTransportationValues ? `, ships ${formatNumber(shipped)}` : ''}.`);
  } else if (kind === 'warehouse' && warehouseId !== undefined) {
    const warehouse = problem.warehouses[warehouseId];
    const received = problem.plants.reduce((total, _, index) => total + (lastTransportationValues?.[index]?.[warehouseId] ?? 0), 0);
    setTransportDetail(`${warehouse.name}: demand ${warehouse.demand}${lastTransportationValues ? `, receives ${formatNumber(received)}` : ''}.`);
  } else if (warehouseId !== undefined) {
    const quantity = lastTransportationValues?.[plantId]?.[warehouseId];
    const cost = problem.costs[plantId][warehouseId];
    const prefix = `${problem.plants[plantId].name} to ${problem.warehouses[warehouseId].name}: ${formatNumber(cost)} cost/unit`;
    setTransportDetail(quantity === undefined
      ? prefix
      : `${prefix}, ships ${formatNumber(quantity)}, lane cost ${formatNumber(quantity * cost)}.`);
  }
}

function wireTransportInteractions() {
  transportViz?.querySelectorAll<SVGElement>('.transport-lane').forEach((element) => {
    const plantId = Number.parseInt(element.dataset.plant ?? '-1', 10);
    const warehouseId = Number.parseInt(element.dataset.warehouse ?? '-1', 10);
    element.addEventListener('mouseenter', () => highlightTransport('lane', plantId, warehouseId));
    element.addEventListener('focus', () => highlightTransport('lane', plantId, warehouseId));
  });
  transportViz?.querySelectorAll<SVGGElement>('.transport-node.plant').forEach((element) => {
    const plantId = Number.parseInt(element.dataset.plant ?? '-1', 10);
    element.addEventListener('mouseenter', () => highlightTransport('plant', plantId));
    element.addEventListener('focus', () => highlightTransport('plant', plantId));
  });
  transportViz?.querySelectorAll<SVGGElement>('.transport-node.warehouse').forEach((element) => {
    const warehouseId = Number.parseInt(element.dataset.warehouse ?? '-1', 10);
    element.addEventListener('mouseenter', () => highlightTransport('warehouse', 0, warehouseId));
    element.addEventListener('focus', () => highlightTransport('warehouse', 0, warehouseId));
  });
  transportViz?.addEventListener('mouseleave', clearTransportHighlight);
  transportViz?.addEventListener('focusout', (event) => {
    if (!transportViz.contains(event.relatedTarget as Node | null)) clearTransportHighlight();
  });
}

function renderTransportationVisualization(values?: number[][]) {
  if (!transportViz) return;
  lastTransportationValues = values;
  const { plants, warehouses, costs } = problem;
  const width = 840;
  const height = 430;
  const plantX = 120;
  const warehouseX = 700;
  const plantPositions = plants.map((_, index) => ({
    x: plantX,
    y: 92 + index * 118,
  }));
  const warehousePositions = warehouses.map((_, index) => ({
    x: warehouseX,
    y: 62 + index * 90,
  }));
  const maxShipment = Math.max(1, ...(values?.flat() ?? [1]));
  const outbound = plants.map((_, plantId) =>
    warehouses.reduce((total, _, warehouseId) => total + (values?.[plantId]?.[warehouseId] ?? 0), 0),
  );
  const inbound = warehouses.map((_, warehouseId) =>
    plants.reduce((total, _, plantId) => total + (values?.[plantId]?.[warehouseId] ?? 0), 0),
  );

  const lanes = plants.flatMap((plant, plantId) =>
    warehouses.map((warehouse, warehouseId) => {
      const start = plantPositions[plantId];
      const end = warehousePositions[warehouseId];
      const quantity = values?.[plantId]?.[warehouseId] ?? 0;
      const solved = values !== undefined;
      const strokeWidth = solved ? 1.5 + (quantity / maxShipment) * 12 : 2;
      const opacity = solved ? (quantity > 1e-7 ? 0.78 : 0.08) : 0.22;
      const color = plantColors[plantId % plantColors.length];
      const controlOffset = (warehouseId - plantId) * 18;
      const path = `M ${start.x + 74} ${start.y} C ${start.x + 250} ${start.y + controlOffset}, ${end.x - 250} ${end.y - controlOffset}, ${end.x - 74} ${end.y}`;
      const labelX = (start.x + end.x) / 2;
      const labelY = (start.y + end.y) / 2 + controlOffset * 0.18;
      return `
        <path class="transport-lane ${solved ? (quantity > 1e-7 ? '' : 'zero') : 'unsolved'}"
          tabindex="0"
          data-plant="${plantId}"
          data-warehouse="${warehouseId}"
          d="${path}"
          stroke="${color}"
          stroke-width="${strokeWidth.toFixed(2)}"
          opacity="${opacity}">
          <title>${escapeHtml(plant.name)} to ${escapeHtml(warehouse.name)}: ${solved ? `${formatNumber(quantity)} units, ` : ''}${formatNumber(costs[plantId][warehouseId])} cost/unit</title>
        </path>
        <text class="transport-lane-label" x="${labelX}" y="${labelY}">${formatNumber(costs[plantId][warehouseId])}</text>
      `;
    }),
  ).join('');

  const plantNodes = plants.map((plant, index) => {
    const { x, y } = plantPositions[index];
    const shipped = outbound[index];
    return `
      <g class="transport-node plant" tabindex="0" data-plant="${index}" transform="translate(${x - 74} ${y - 31})">
        <rect width="148" height="62" rx="6"></rect>
        <text x="14" y="24">${escapeHtml(plant.name)}</text>
        <text class="metric" x="14" y="45">${values ? `ships ${formatNumber(shipped)} / ${plant.supply}` : `supply ${plant.supply}`}</text>
      </g>
    `;
  }).join('');

  const warehouseNodes = warehouses.map((warehouse, index) => {
    const { x, y } = warehousePositions[index];
    const received = inbound[index];
    return `
      <g class="transport-node warehouse" tabindex="0" data-warehouse="${index}" transform="translate(${x - 74} ${y - 31})">
        <rect width="148" height="62" rx="6"></rect>
        <text x="14" y="24">${escapeHtml(warehouse.name)}</text>
        <text class="metric" x="14" y="45">${values ? `gets ${formatNumber(received)} / ${warehouse.demand}` : `demand ${warehouse.demand}`}</text>
      </g>
    `;
  }).join('');

  transportViz.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Transportation LP network">
      <rect width="${width}" height="${height}" fill="#ffffff"></rect>
      ${lanes}
      ${plantNodes}
      ${warehouseNodes}
    </svg>
  `;
  wireTransportInteractions();
  clearTransportHighlight();
}

function renderTransportationResult(
  shipments: MPVariable[][],
  objective: number,
  wallTime: number,
  iterations: number,
  threadConfig: ReturnType<typeof applySolverThreads>,
) {
  const values = shipmentMatrix(shipments);
  renderTransportationVisualization(values);
  if (!solutionOutput) return;
  const { plants, warehouses } = problem;
  solutionOutput.innerHTML = `
    <table>
      <tbody>
        <tr><th>Total cost</th><td>${formatNumber(objective)}</td></tr>
        <tr><th>Worker bridge</th><td>${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}</td></tr>
        <tr><th>Requested solver threads</th><td>${threadConfig.requested}</td></tr>
        <tr><th>Thread request accepted</th><td>${threadConfig.accepted ? 'yes' : 'no'}</td></tr>
        <tr><th>Active solver threads</th><td>${threadConfig.active}</td></tr>
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
            ${warehouses.map((_, warehouseId) => `<td>${formatNumber(values[plantId][warehouseId])}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function runTransportation() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  readProblemFromEditor();
  renderTransportationVisualization();
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    await initMPSolver();
    const solver = MPSolver.CreateSolver('CLP');
    if (!solver) throw new Error('CLP is unavailable in this build.');
    try {
      const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
      const threadConfig = applySolverThreads(solver, solverThreads);
      const { plants, warehouses, costs } = problem;
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

      appendStatus(statusEl, `Solving with ${solver.SolverVersion()}, requested solver threads=${solverThreads}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);

      renderTransportationResult(shipments, objective.Value(), solver.WallTime(), solver.Iterations(), threadConfig);
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
resetButton?.addEventListener('click', () => {
  problem = cloneProblem(defaultProblem);
  lastTransportationValues = undefined;
  renderProblemEditor();
  renderTransportationVisualization();
  if (solutionOutput) {
    solutionOutput.textContent = 'Run the solver to view shipment quantities and total cost.';
  }
  if (statusEl) statusEl.textContent = '';
});

renderProblemEditor();
renderTransportationVisualization();
