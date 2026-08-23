import {
  CpSat,
  type CpModelProto,
  type CpSatModelInstance,
} from 'or-tools-wasm/cp-sat';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { getMaxWorkerCount } from './worker_limits.js';

const statusEl = document.getElementById('status') as HTMLPreElement | null;
const solutionGrid = document.getElementById('solution-grid') as HTMLElement | null;
const sizeInput = document.getElementById('size') as HTMLInputElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const executorSelector = document.getElementById('cp-sat-executor') as HTMLSelectElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const stopButton = document.getElementById('stop') as HTMLButtonElement | null;
const maxWorkerCount = getMaxWorkerCount();
const selectedExecutor = configureSolverExecutorSelector(null, executorSelector);

let activeSolve: AbortController | null = null;

if (workerInput) {
  workerInput.max = String(maxWorkerCount);
  workerInput.min = '1';
  workerInput.value = String(maxWorkerCount);
}

function append(text: string) {
  if (statusEl) statusEl.textContent += `${text}\n`;
}

function setRunning(running: boolean) {
  if (runButton) runButton.disabled = running;
  if (stopButton) stopButton.disabled = !running;
}

function showSolutionMessage(message: string) {
  if (!solutionGrid) return;
  solutionGrid.textContent = message;
  solutionGrid.style.removeProperty('gridTemplateColumns');
}

function renderSolution(size: number, values: Array<number | string>) {
  if (!solutionGrid) return;
  solutionGrid.innerHTML = '';
  solutionGrid.style.gridTemplateColumns = `repeat(${size}, minmax(2.5rem, auto))`;
  for (const value of values) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.textContent = String(value);
    solutionGrid.appendChild(cell);
  }
}

function buildMagicSquareModel(size: number): CpModelProto {
  const numCells = size * size;
  const variables: NonNullable<CpModelProto['variables']> = Array.from(
    { length: numCells },
    (_, index) => ({
      name: `cell_${Math.floor(index / size)}_${index % size}`,
      domain: [1, numCells],
    }),
  );
  const constraints: NonNullable<CpModelProto['constraints']> = [{
    name: 'all_diff',
    allDiff: {
      exprs: Array.from({ length: numCells }, (_, index) => ({
        vars: [index],
        coeffs: [1],
        offset: 0,
      })),
    },
  }];
  const target = (size * (numCells + 1)) / 2;
  const addSum = (name: string, vars: number[]) => {
    constraints.push({
      name,
      linear: {
        vars,
        coeffs: Array(vars.length).fill(1),
        domain: [target, target],
      },
    });
  };

  for (let row = 0; row < size; row += 1) {
    addSum(`row_${row}`, Array.from(
      { length: size },
      (_, column) => row * size + column,
    ));
  }
  for (let column = 0; column < size; column += 1) {
    addSum(`col_${column}`, Array.from(
      { length: size },
      (_, row) => row * size + column,
    ));
  }
  addSum('diag_main', Array.from(
    { length: size },
    (_, index) => index * size + index,
  ));
  addSum('diag_anti', Array.from(
    { length: size },
    (_, index) => index * size + size - index - 1,
  ));
  return { name: `magic_square_${size}`, variables, constraints };
}

async function runMagicSquare() {
  if (!sizeInput || !workerInput || activeSolve) return;

  const size = Math.max(1, Number.parseInt(sizeInput.value, 10) || 1);
  const requestedWorkers = Number.parseInt(workerInput.value, 10) || 1;
  const numWorkers = Math.min(Math.max(1, requestedWorkers), maxWorkerCount);
  workerInput.value = String(numWorkers);
  const controller = new AbortController();
  activeSolve = controller;
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  append(`Building raw model proto (size=${size})…`);
  showSolutionMessage('Solving…');

  try {
    const model: CpSatModelInstance = await CpSat.createModel(buildMagicSquareModel(size));

    const validation = await CpSat.validate(model);
    if (!validation.ok) {
      append(`Model invalid: ${validation.message}`);
      showSolutionMessage('Model invalid.');
      return;
    }

    append(`Solving with ${numWorkers} worker${numWorkers === 1 ? '' : 's'}…`);
    const result = await CpSat.solve(model, {
      executor: selectedExecutor(),
      numWorkers,
      logSearchProgress: true,
      signal: controller.signal,
    });
    const response = result.response;
    if (!response) {
      append('Solver returned no response.');
      showSolutionMessage('Solver returned no response.');
      return;
    }
    if (statusEl) statusEl.textContent += `${JSON.stringify(response, null, 2)}\n`;
    if (!Array.isArray(response.solution)) {
      showSolutionMessage('No solution entries returned.');
      return;
    }
    renderSolution(size, response.solution as Array<number | string>);
  } catch (error) {
    if (controller.signal.aborted) {
      append('Solve cancelled.');
      showSolutionMessage('Solve cancelled.');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      append(`Solve failed: ${message}`);
      showSolutionMessage('Solve failed.');
    }
  } finally {
    if (activeSolve === controller) activeSolve = null;
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => {
  void runMagicSquare();
});

if (stopButton) {
  stopButton.disabled = true;
  stopButton.addEventListener('click', () => {
    activeSolve?.abort('Cancelled by the user.');
  });
}
