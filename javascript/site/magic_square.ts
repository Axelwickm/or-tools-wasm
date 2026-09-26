import {
  CpSat,
  CpModel,
  type IntVar,
  sum,
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

function buildMagicSquareModel(size: number): { model: CpModel; cells: IntVar[] } {
  const numCells = size * size;
  const model = new CpModel();
  model.name = `magic_square_${size}`;
  const cells = Array.from(
    { length: numCells },
    (_, index) => model.newIntVar(1, numCells,
      `cell_${Math.floor(index / size)}_${index % size}`),
  );
  model.addAllDifferent(cells);
  const target = (size * (numCells + 1)) / 2;
  const addSum = (vars: number[]) => model.addEquality(sum(vars.map((index) => cells[index])), target);

  for (let row = 0; row < size; row += 1) {
    addSum(Array.from(
      { length: size },
      (_, column) => row * size + column,
    ));
  }
  for (let column = 0; column < size; column += 1) {
    addSum(Array.from(
      { length: size },
      (_, row) => row * size + column,
    ));
  }
  addSum(Array.from(
    { length: size },
    (_, index) => index * size + index,
  ));
  addSum(Array.from(
    { length: size },
    (_, index) => index * size + size - index - 1,
  ));
  return { model, cells };
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
  append(`Building magic square model (size=${size})…`);
  showSolutionMessage('Solving…');

  try {
    const { model, cells } = buildMagicSquareModel(size);

    const validation = await CpSat.validate(await CpSat.createModel(model.modelProto));
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
    if (!result.hasSolution) {
      showSolutionMessage('No solution entries returned.');
      return;
    }
    renderSolution(size, cells.map((cell) => result.value(cell).toString()));
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
