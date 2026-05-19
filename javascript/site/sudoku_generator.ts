import { CpSat, type CpModelProto, type CpSolverResponse, type SatParameters } from 'or-tools-wasm';
import { getMaxWorkerCount } from './worker_limits.js';

type Grid = number[];

const size = 9;
const cells = size * size;
const digits = 9;

const boardEl = document.getElementById('sudoku-board') as HTMLElement | null;
const statusEl = document.getElementById('status') as HTMLPreElement | null;
const targetInput = document.getElementById('target-clues') as HTMLInputElement | null;
const seedInput = document.getElementById('seed') as HTMLInputElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const generateButton = document.getElementById('generate') as HTMLButtonElement | null;
const solveButton = document.getElementById('solve') as HTMLButtonElement | null;
const clearButton = document.getElementById('clear') as HTMLButtonElement | null;
const stopButton = document.getElementById('stop') as HTMLButtonElement | null;

let cancelled = false;
let givens = new Set<number>();
const maxWorkerCount = getMaxWorkerCount();

function varIndex(row: number, col: number, digit: number) {
  return (row * size + col) * digits + (digit - 1);
}

function cellIndex(row: number, col: number) {
  return row * size + col;
}

function rowOf(index: number) {
  return Math.floor(index / size);
}

function colOf(index: number) {
  return index % size;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; --i) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent += `${message}\n`;
  statusEl.scrollTop = statusEl.scrollHeight;
}

function setStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = `${message}\n`;
}

function setRunning(running: boolean) {
  if (generateButton) generateButton.disabled = running;
  if (solveButton) solveButton.disabled = running;
  if (clearButton) clearButton.disabled = running;
  if (stopButton) stopButton.disabled = !running;
}

function configureCpSat() {
  const workers = Math.min(
    maxWorkerCount,
    Math.max(1, Number.parseInt(workerInput?.value ?? '1', 10) || 1),
  );
  if (workerInput) {
    workerInput.min = '1';
    workerInput.max = String(maxWorkerCount);
    workerInput.value = String(workers);
  }
  CpSat.setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
  return workers;
}

function createBoard() {
  if (!boardEl) return;
  boardEl.innerHTML = '';
  for (let index = 0; index < cells; ++index) {
    const input = document.createElement('input');
    input.className = 'sudoku-cell';
    input.inputMode = 'numeric';
    input.maxLength = 1;
    input.dataset.index = String(index);
    input.setAttribute('aria-label', `Row ${rowOf(index) + 1}, column ${colOf(index) + 1}`);
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^1-9]/g, '').slice(0, 1);
      givens.delete(index);
      input.classList.remove('given', 'removed', 'testing', 'solved');
    });
    boardEl.appendChild(input);
  }
}

function boardInputs() {
  return Array.from(boardEl?.querySelectorAll<HTMLInputElement>('.sudoku-cell') ?? []);
}

function renderGrid(grid: Grid, options: { testing?: number; solved?: boolean } = {}) {
  const inputs = boardInputs();
  for (let index = 0; index < cells; ++index) {
    const input = inputs[index];
    if (!input) continue;
    const value = grid[index] ?? 0;
    input.value = value === 0 ? '' : String(value);
    input.classList.toggle('given', value !== 0 && givens.has(index));
    input.classList.toggle('removed', value === 0);
    input.classList.toggle('testing', options.testing === index);
    input.classList.toggle('solved', options.solved === true && value !== 0 && !givens.has(index));
  }
}

function readGrid() {
  return boardInputs().map((input) => {
    const value = Number.parseInt(input.value, 10);
    return value >= 1 && value <= 9 ? value : 0;
  });
}

function clueCount(grid: Grid) {
  return grid.filter((value) => value !== 0).length;
}

function addExactlyOneConstraint(constraints: NonNullable<CpModelProto['constraints']>, vars: number[]) {
  constraints.push({
    linear: {
      vars,
      coeffs: vars.map(() => 1),
      domain: [1, 1],
    },
  });
}

function buildSudokuModel(clues: Grid, blockedSolution?: Grid): CpModelProto {
  const variables = Array.from({ length: cells * digits }, (_, index) => ({
    name: `r${Math.floor(index / 81) + 1}c${Math.floor((index % 81) / 9) + 1}_${(index % 9) + 1}`,
    domain: [0, 1],
  }));
  const constraints: NonNullable<CpModelProto['constraints']> = [];

  for (let row = 0; row < size; ++row) {
    for (let col = 0; col < size; ++col) {
      addExactlyOneConstraint(
        constraints,
        Array.from({ length: digits }, (_, digit) => varIndex(row, col, digit + 1)),
      );
    }
  }

  for (let row = 0; row < size; ++row) {
    for (let digit = 1; digit <= digits; ++digit) {
      addExactlyOneConstraint(
        constraints,
        Array.from({ length: size }, (_, col) => varIndex(row, col, digit)),
      );
    }
  }

  for (let col = 0; col < size; ++col) {
    for (let digit = 1; digit <= digits; ++digit) {
      addExactlyOneConstraint(
        constraints,
        Array.from({ length: size }, (_, row) => varIndex(row, col, digit)),
      );
    }
  }

  for (let boxRow = 0; boxRow < 3; ++boxRow) {
    for (let boxCol = 0; boxCol < 3; ++boxCol) {
      for (let digit = 1; digit <= digits; ++digit) {
        const vars: number[] = [];
        for (let rowOffset = 0; rowOffset < 3; ++rowOffset) {
          for (let colOffset = 0; colOffset < 3; ++colOffset) {
            vars.push(varIndex(boxRow * 3 + rowOffset, boxCol * 3 + colOffset, digit));
          }
        }
        addExactlyOneConstraint(constraints, vars);
      }
    }
  }

  clues.forEach((digit, index) => {
    if (digit === 0) return;
    constraints.push({
      linear: {
        vars: [varIndex(rowOf(index), colOf(index), digit)],
        coeffs: [1],
        domain: [1, 1],
      },
    });
  });

  if (blockedSolution) {
    constraints.push({
      linear: {
        vars: blockedSolution.map((digit, index) => varIndex(rowOf(index), colOf(index), digit)),
        coeffs: Array(cells).fill(1),
        domain: [0, cells - 1],
      },
    });
  }

  return {
    name: 'sudoku_generator',
    variables,
    constraints,
  };
}

function parseSolution(response: CpSolverResponse | null): Grid | null {
  const solution = response?.solution;
  if (!Array.isArray(solution) || solution.length < cells * digits) return null;
  const grid = Array(cells).fill(0);
  for (let row = 0; row < size; ++row) {
    for (let col = 0; col < size; ++col) {
      for (let digit = 1; digit <= digits; ++digit) {
        if (Number(solution[varIndex(row, col, digit)]) === 1) {
          grid[cellIndex(row, col)] = digit;
          break;
        }
      }
    }
  }
  return grid;
}

function isFeasibleStatus(status: unknown) {
  return status === 'OPTIMAL' || status === 'FEASIBLE';
}

async function solveSudoku(clues: Grid, params: SatParameters, blockedSolution?: Grid) {
  const model = await CpSat.createModel(buildSudokuModel(clues, blockedSolution));
  const validation = await CpSat.validate(model);
  if (!validation.ok) {
    throw new Error(validation.message);
  }
  const result = await CpSat.solve(model, params);
  return {
    status: result.response?.status,
    grid: parseSolution(result.response),
  };
}

async function hasUniqueSolution(clues: Grid, workers: number) {
  const first = await solveSudoku(clues, {
    maxTimeInSeconds: 3,
    numWorkers: workers,
    stopAfterFirstSolution: true,
  });
  if (!isFeasibleStatus(first.status) || !first.grid) {
    return { unique: false, solution: null, status: String(first.status ?? 'NO_RESPONSE') };
  }
  const second = await solveSudoku(clues, {
    maxTimeInSeconds: 3,
    numWorkers: 1,
    stopAfterFirstSolution: true,
  }, first.grid);
  return {
    unique: second.status === 'INFEASIBLE',
    solution: first.grid,
    status: String(second.status ?? 'NO_RESPONSE'),
  };
}

async function generateFullGrid(seed: number, workers: number) {
  const result = await solveSudoku(Array(cells).fill(0), {
    maxTimeInSeconds: 5,
    numWorkers: workers,
    randomSeed: seed,
    randomizeSearch: true,
    stopAfterFirstSolution: true,
  });
  if (!isFeasibleStatus(result.status) || !result.grid) {
    throw new Error(`Unable to generate a complete grid, status=${String(result.status)}`);
  }
  return result.grid;
}

async function generatePuzzle() {
  cancelled = false;
  const workers = configureCpSat();
  const target = Math.min(81, Math.max(0, Number.parseInt(targetInput?.value ?? '0', 10) || 0));
  const seed = Math.max(1, Number.parseInt(seedInput?.value ?? '1', 10) || 1);
  if (targetInput) targetInput.value = String(target);
  if (seedInput) seedInput.value = String(seed);

  setRunning(true);
  setStatus(`Initializing CP-SAT Sudoku generator (target=${target}, seed=${seed})...`);
  try {
    appendStatus('Solving an empty Sudoku model to get a complete grid.');
    const full = await generateFullGrid(seed, workers);
    let puzzle = [...full];
    givens = new Set(Array.from({ length: cells }, (_, index) => index));
    renderGrid(puzzle);
    appendStatus('Complete grid found. Removing clues with uniqueness checks.');
    if (target < 17) {
      appendStatus('Note: no uniquely-solvable standard Sudoku is known below 17 clues; target 0 means remove every clue that can be removed while uniqueness is preserved.');
    }

    const random = mulberry32(seed);
    const order = shuffled(Array.from({ length: cells }, (_, index) => index), random);
    let attempted = 0;
    let removed = 0;
    for (const index of order) {
      if (cancelled || clueCount(puzzle) <= target) break;
      attempted++;
      const previous = puzzle[index];
      puzzle[index] = 0;
      givens.delete(index);
      renderGrid(puzzle, { testing: index });
      appendStatus(`Testing removal ${attempted}: r${rowOf(index) + 1}c${colOf(index) + 1} (${clueCount(puzzle)} clues)...`);
      await sleep(20);

      const check = await hasUniqueSolution(puzzle, workers);
      if (cancelled) break;
      if (check.unique) {
        removed++;
        appendStatus(`  kept empty; puzzle remains unique (${removed} removed).`);
      } else {
        puzzle[index] = previous;
        givens.add(index);
        appendStatus(`  restored; uniqueness check returned ${check.status}.`);
      }
      renderGrid(puzzle);
      await sleep(20);
    }

    renderGrid(puzzle);
    appendStatus(cancelled
      ? `Stopped with ${clueCount(puzzle)} clues.`
      : `Done. Generated puzzle has ${clueCount(puzzle)} clues.`);
  } catch (error) {
    appendStatus(`Generator failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setRunning(false);
    cancelled = false;
  }
}

async function solveBoard() {
  cancelled = false;
  const workers = configureCpSat();
  setRunning(true);
  setStatus('Solving current board with CP-SAT...');
  try {
    const clues = readGrid();
    givens = new Set(clues.flatMap((value, index) => (value === 0 ? [] : [index])));
    renderGrid(clues);
    const result = await solveSudoku(clues, {
      maxTimeInSeconds: 5,
      numWorkers: workers,
      stopAfterFirstSolution: true,
    });
    if (!isFeasibleStatus(result.status) || !result.grid) {
      appendStatus(`No solution found, status=${String(result.status)}`);
      return;
    }
    renderGrid(result.grid, { solved: true });
    appendStatus(`Solved, status=${String(result.status)}.`);
  } catch (error) {
    appendStatus(`Solve failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    setRunning(false);
  }
}

function clearBoard() {
  givens = new Set();
  renderGrid(Array(cells).fill(0));
  setStatus('Board cleared.');
}

createBoard();
clearBoard();
if (workerInput) workerInput.value = String(Math.min(maxWorkerCount, 4));
if (workerBridgeToggle) {
  workerBridgeToggle.checked = true;
  workerBridgeToggle.addEventListener('change', () => {
    CpSat.setWorkerBridgeEnabled(workerBridgeToggle.checked);
  });
}

generateButton?.addEventListener('click', () => {
  void generatePuzzle();
});
solveButton?.addEventListener('click', () => {
  void solveBoard();
});
clearButton?.addEventListener('click', clearBoard);
stopButton?.addEventListener('click', () => {
  cancelled = true;
  appendStatus('Stopping after the active CP-SAT solve returns...');
  void CpSat.cancelSolve().catch((error) => {
    appendStatus(`Cancel request failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});
