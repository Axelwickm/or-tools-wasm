import {
  CpSat,
  type CpModelProto,
  type CpSatModelInstance,
} from 'or-tools-wasm/cp-sat';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { ActiveSolve, formatJson, requiredElement } from './site_support.js';
import { getMaxWorkerCount } from './worker_limits.js';

const statusEl = requiredElement('status', 'pre');
const solutionGrid = requiredElement('solution-grid', 'div');
const sizeInput = requiredElement('size', 'input');
const workerInput = requiredElement('workers', 'input');
const executorSelector = requiredElement('cp-sat-executor', 'select');
const runButton = requiredElement('run', 'button');
const stopButton = requiredElement('stop', 'button');
const maxWorkerCount = getMaxWorkerCount();
const selectedExecutor = configureSolverExecutorSelector(executorSelector);

const activeSolve = new ActiveSolve('Magic square solve');

workerInput.max = String(maxWorkerCount);
workerInput.min = '1';
workerInput.value = String(maxWorkerCount);

function append(text: string) {
  statusEl.textContent += `${text}\n`;
}

function setRunning(running: boolean) {
  runButton.disabled = running;
  stopButton.disabled = !running;
}

function showSolutionMessage(message: string) {
  solutionGrid.textContent = message;
  solutionGrid.style.removeProperty('gridTemplateColumns');
}

function renderSolution(size: number, values: Array<number | string>) {
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
  if (activeSolve.running) return;

  const size = Math.max(1, Number.parseInt(sizeInput.value, 10) || 1);
  const requestedWorkers = Number.parseInt(workerInput.value, 10) || 1;
  const numWorkers = Math.min(Math.max(1, requestedWorkers), maxWorkerCount);
  workerInput.value = String(numWorkers);
  const signal = activeSolve.start();
  setRunning(true);
  statusEl.textContent = '';
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
      signal,
    });
    const response = result.response;
    if (!response) {
      append('Solver returned no response.');
      showSolutionMessage('Solver returned no response.');
      return;
    }
    statusEl.textContent += `${formatJson(response)}\n`;
    if (!Array.isArray(response.solution)) {
      showSolutionMessage('No solution entries returned.');
      return;
    }
    renderSolution(size, response.solution as Array<number | string>);
  } catch (error) {
    if (signal.aborted) {
      append('Solve cancelled.');
      showSolutionMessage('Solve cancelled.');
    } else {
      const message = error instanceof Error ? error.message : String(error);
      append(`Solve failed: ${message}`);
      showSolutionMessage('Solve failed.');
    }
  } finally {
    activeSolve.finish(signal);
    setRunning(false);
  }
}

runButton.addEventListener('click', () => {
  void runMagicSquare();
});

stopButton.disabled = true;
stopButton.addEventListener('click', () => {
  activeSolve.cancel('Cancelled by the user.');
});
