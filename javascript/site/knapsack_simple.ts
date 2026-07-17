import {
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
  setExecutor,
} from 'or-tools-wasm/knapsack';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

const matrixEl = document.getElementById('matrix') as HTMLTableElement | null;
const solutionOutput = document.getElementById('solution-output');
const usageOutput = document.getElementById('usage-output');
const statusEl = document.getElementById('status');
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const addItemButton = document.getElementById('add-item') as HTMLButtonElement | null;
const removeItemButton = document.getElementById('remove-item') as HTMLButtonElement | null;
const addResourceButton = document.getElementById('add-resource') as HTMLButtonElement | null;
const removeResourceButton = document.getElementById('remove-resource') as HTMLButtonElement | null;

let values = [
  360, 83, 59, 130, 431, 67, 230, 52, 93, 125, 670, 892, 600, 38, 48, 147,
  78, 256,
];
let weights = [[
  7, 0, 30, 22, 80, 94, 11, 81, 70, 64, 59, 18, 0, 36, 3, 8, 15, 42,
], [
  12, 4, 38, 20, 55, 45, 9, 52, 41, 35, 48, 16, 8, 22, 6, 12, 10, 28,
]];
let capacities = [240, 150];
let resourceNames = ['Weight', 'Volume'];
let selectedItems: number[] = [];
let lastProfit: number | null = null;
let lastOptimal = false;

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Knapsack';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function readNumberInput(input: HTMLInputElement): number {
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function syncFromInputs() {
  if (!matrixEl) return;
  for (const input of matrixEl.querySelectorAll<HTMLInputElement>('input[data-kind="value"]')) {
    values[Number(input.dataset.item)] = readNumberInput(input);
  }
  for (const input of matrixEl.querySelectorAll<HTMLInputElement>('input[data-kind="weight"]')) {
    weights[Number(input.dataset.dimension)][Number(input.dataset.item)] = readNumberInput(input);
  }
  for (const input of matrixEl.querySelectorAll<HTMLInputElement>('input[data-kind="capacity"]')) {
    capacities[Number(input.dataset.dimension)] = readNumberInput(input);
  }
}

function clearSolution() {
  selectedItems = [];
  lastProfit = null;
  lastOptimal = false;
  renderMatrix();
  renderSolution();
}

function resourceName(dimension: number) {
  return resourceNames[dimension] ?? `Resource ${dimension + 1}`;
}

function renderMatrix() {
  if (!matrixEl) return;
  const selected = new Set(selectedItems);
  const headerCells = values
    .map((_, item) => `<th class="${selected.has(item) ? 'selected-column' : ''}">Item ${item}</th>`)
    .join('');
  const valueCells = values
    .map((value, item) => `
      <td class="${selected.has(item) ? 'selected-column' : 'unselected-column'}">
        <input data-kind="value" data-item="${item}" type="number" min="0" step="1" value="${value}">
      </td>
    `)
    .join('');
  const weightRows = weights
    .map((row, dimension) => {
      const weightCells = row
        .map((weight, item) => `
          <td class="${selected.has(item) ? 'selected-column' : 'unselected-column'}">
            <input data-kind="weight" data-dimension="${dimension}" data-item="${item}" type="number" min="0" step="1" value="${weight}">
          </td>
        `)
        .join('');
      return `
        <tr>
          <th scope="row">${resourceName(dimension)}</th>
          ${weightCells}
          <td>
            <input data-kind="capacity" data-dimension="${dimension}" type="number" min="0" step="1" value="${capacities[dimension]}">
          </td>
        </tr>
      `;
    })
    .join('');
  const selectedCells = values
    .map((_, item) => `
      <td class="${selected.has(item) ? 'selected-column selected-cell' : 'unselected-column'}">
        ${selected.has(item) ? 'yes' : ''}
      </td>
    `)
    .join('');

  matrixEl.innerHTML = `
    <thead>
      <tr>
        <th scope="col">Metric</th>
        ${headerCells}
        <th scope="col">Capacity</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <th scope="row">Value</th>
        ${valueCells}
        <td></td>
      </tr>
      ${weightRows}
      <tr>
        <th scope="row">Selected</th>
        ${selectedCells}
        <td>${selectedItems.length} items</td>
      </tr>
    </tbody>
  `;
}

function renderSolution() {
  if (!solutionOutput || !usageOutput) return;
  if (lastProfit === null) {
    solutionOutput.textContent = 'Run the solver to view the solution.';
    usageOutput.innerHTML = '';
    return;
  }

  const usedByDimension = capacities.map((_, dimension) =>
    selectedItems.reduce((sum, item) => sum + weights[dimension][item], 0),
  );
  solutionOutput.innerHTML = `
    <div class="summary-value">${lastProfit}</div>
    <div><strong>Packed items:</strong> ${selectedItems.join(', ') || 'none'}</div>
    <div><strong>Optimal:</strong> ${lastOptimal ? 'yes' : 'not proven'}</div>
  `;
  usageOutput.innerHTML = usedByDimension
    .map((used, dimension) => {
      const capacity = capacities[dimension];
      const percent = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
      return `
        <div class="usage-row">
          <div class="usage-label">
            <span>${resourceName(dimension)}</span>
            <span>${used} / ${capacity}</span>
          </div>
          <div class="usage-track"><div class="usage-fill" style="--usage: ${percent}%"></div></div>
        </div>
      `;
    })
    .join('');
}

async function runKnapsack() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    syncFromInputs();
    selectedItems = [];
    lastProfit = null;
    renderMatrix();
    renderSolution();

    appendStatus('Initializing Knapsack runtime...');
    await initKnapsack();

    const solver = new KnapsackSolver(
      KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
      'KnapsackExample',
    );
    solver.init(values, weights, capacities);

    appendStatus(`Solving with ${executorSelector?.value ?? 'auto'} executor...`);
    lastProfit = await solver.solve();
    selectedItems = values
      .map((_, item) => item)
      .filter((item) => solver.best_solution_contains(item));
    lastOptimal = solver.is_solution_optimal();
    renderMatrix();
    renderSolution();
    appendStatus(`Done. Total value ${lastProfit}.`);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

function addItem() {
  syncFromInputs();
  const nextItem = values.length;
  values.push(100 + nextItem * 25);
  for (const row of weights) {
    row.push(10 + nextItem * 3);
  }
  clearSolution();
}

function removeItem() {
  if (values.length <= 1) return;
  syncFromInputs();
  values = values.slice(0, -1);
  weights = weights.map((row) => row.slice(0, -1));
  clearSolution();
}

function addResource() {
  syncFromInputs();
  const resourceIndex = weights.length;
  weights.push(values.map((_, item) => 5 + ((item + resourceIndex) % 9) * 4));
  capacities.push(200);
  resourceNames.push(`Resource ${resourceIndex + 1}`);
  clearSolution();
}

function removeResource() {
  if (weights.length <= 1) return;
  syncFromInputs();
  weights = weights.slice(0, -1);
  capacities = capacities.slice(0, -1);
  resourceNames = resourceNames.slice(0, -1);
  clearSolution();
}

matrixEl?.addEventListener('input', () => {
  selectedItems = [];
  lastProfit = null;
  lastOptimal = false;
  renderSolution();
});
runButton?.addEventListener('click', () => void runKnapsack());
addItemButton?.addEventListener('click', addItem);
removeItemButton?.addEventListener('click', removeItem);
addResourceButton?.addEventListener('click', addResource);
removeResourceButton?.addEventListener('click', removeResource);

renderMatrix();
renderSolution();
configureSolverExecutorSelector({ setExecutor }, executorSelector);
