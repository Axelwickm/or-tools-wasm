import { initMathOpt, MathOpt, setExecutor, type MathOptVariable } from 'or-tools-wasm/mathopt';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { getMaxWorkerCount } from './worker_limits.js';

type Grid = number[];

const size = 9;
const cells = size * size;
const digits = 9;

const boardEl = document.getElementById('sudoku-board') as HTMLElement | null;
const statusEl = document.getElementById('status') as HTMLPreElement | null;
const targetInput = document.getElementById('target-clues') as HTMLInputElement | null;
const seedInput = document.getElementById('seed') as HTMLInputElement | null;
const solverSelect = document.getElementById('solver') as HTMLSelectElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const generateButton = document.getElementById('generate') as HTMLButtonElement | null;
const solveButton = document.getElementById('solve') as HTMLButtonElement | null;
const clearButton = document.getElementById('clear') as HTMLButtonElement | null;
const stopButton = document.getElementById('stop') as HTMLButtonElement | null;

let cancelled = false;
let givens = new Set<number>();
let activeInterrupter: InstanceType<typeof MathOpt.SolveInterrupter> | null = null;
const maxWorkerCount = getMaxWorkerCount();

type SudokuBackend = 'CP_SAT' | 'GSCIP' | 'GLPK';

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

function selectedBackend(): SudokuBackend {
  const value = solverSelect?.value;
  if (value === 'GSCIP' || value === 'GLPK') return value;
  return 'CP_SAT';
}

function backendLabel(backend: SudokuBackend) {
  if (backend === 'CP_SAT') return 'CP-SAT';
  return backend;
}

function updateBackendControls() {
  if (!workerInput) return;
  const glpk = selectedBackend() === 'GLPK';
  workerInput.disabled = glpk;
  if (glpk) workerInput.value = '1';
}

function configureMathOpt() {
  const backend = selectedBackend();
  const workers = Math.min(
    maxWorkerCount,
    Math.max(1, Number.parseInt(workerInput?.value ?? '1', 10) || 1),
  );
  if (workerInput) {
    workerInput.min = '1';
    workerInput.max = String(maxWorkerCount);
    workerInput.value = String(workers);
  }
  return { backend, workers: backend === 'GLPK' ? 1 : workers };
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

function addExactlyOneConstraint(model: ReturnType<typeof MathOpt.Model>, vars: MathOptVariable[]) {
  model.addLinearConstraint({
    lowerBound: 1,
    upperBound: 1,
    terms: vars.map((variable) => ({ variable, coefficient: 1 })),
  });
}

function buildSudokuModel(clues: Grid, blockedSolution?: Grid) {
  const model = MathOpt.Model('sudoku_generator');
  const variables = Array.from({ length: cells * digits }, (_, index) =>
    model.addBinaryVariable({
      name: `r${Math.floor(index / 81) + 1}c${Math.floor((index % 81) / 9) + 1}_${(index % 9) + 1}`,
    }),
  );
  const sudokuVar = (row: number, col: number, digit: number) => variables[varIndex(row, col, digit)];

  for (let row = 0; row < size; ++row) {
    for (let col = 0; col < size; ++col) {
      addExactlyOneConstraint(
        model,
        Array.from({ length: digits }, (_, digit) => sudokuVar(row, col, digit + 1)),
      );
    }
  }

  for (let row = 0; row < size; ++row) {
    for (let digit = 1; digit <= digits; ++digit) {
      addExactlyOneConstraint(
        model,
        Array.from({ length: size }, (_, col) => sudokuVar(row, col, digit)),
      );
    }
  }

  for (let col = 0; col < size; ++col) {
    for (let digit = 1; digit <= digits; ++digit) {
      addExactlyOneConstraint(
        model,
        Array.from({ length: size }, (_, row) => sudokuVar(row, col, digit)),
      );
    }
  }

  for (let boxRow = 0; boxRow < 3; ++boxRow) {
    for (let boxCol = 0; boxCol < 3; ++boxCol) {
      for (let digit = 1; digit <= digits; ++digit) {
        const vars: MathOptVariable[] = [];
        for (let rowOffset = 0; rowOffset < 3; ++rowOffset) {
          for (let colOffset = 0; colOffset < 3; ++colOffset) {
            vars.push(sudokuVar(boxRow * 3 + rowOffset, boxCol * 3 + colOffset, digit));
          }
        }
        addExactlyOneConstraint(model, vars);
      }
    }
  }

  clues.forEach((digit, index) => {
    if (digit === 0) return;
    model.addLinearConstraint({
      lowerBound: 1,
      upperBound: 1,
      terms: [{ variable: sudokuVar(rowOf(index), colOf(index), digit), coefficient: 1 }],
    });
  });

  if (blockedSolution) {
    model.addLinearConstraint({
      upperBound: cells - 1,
      terms: blockedSolution.map((digit, index) => ({
        variable: sudokuVar(rowOf(index), colOf(index), digit),
        coefficient: 1,
      })),
    });
  }
  model.minimize([]);

  return { model, variables };
}

function parseSolution(result: Awaited<ReturnType<typeof MathOpt.solve>>, variables: MathOptVariable[]): Grid | null {
  const grid = Array(cells).fill(0);
  for (let row = 0; row < size; ++row) {
    for (let col = 0; col < size; ++col) {
      for (let digit = 1; digit <= digits; ++digit) {
        if (result.variable_values(variables[varIndex(row, col, digit)]) > 0.5) {
          grid[cellIndex(row, col)] = digit;
          break;
        }
      }
    }
  }
  return grid;
}

function isFeasibleStatus(status: unknown) {
  return status === 'OPTIMAL'
    || status === 'FEASIBLE'
    || status === 'TERMINATION_REASON_OPTIMAL'
    || status === 'TERMINATION_REASON_FEASIBLE';
}

function isInfeasibleStatus(status: unknown) {
  return status === 'INFEASIBLE' || status === 'TERMINATION_REASON_INFEASIBLE';
}

async function solveSudoku(
  clues: Grid,
  options: {
    backend: SudokuBackend;
    workers: number;
    timeLimitSeconds: number;
    seed?: number;
    randomizeSearch?: boolean;
  },
  blockedSolution?: Grid,
) {
  await initMathOpt();
  const { model, variables } = buildSudokuModel(clues, blockedSolution);
  activeInterrupter = new MathOpt.SolveInterrupter();
  try {
    const result = await MathOpt.solve(model, {
      solverType: MathOpt.SolverType[options.backend],
      threads: options.backend === 'GLPK' ? 1 : options.workers,
      timeLimitSeconds: options.timeLimitSeconds,
      solutionLimit: options.backend === 'GLPK' ? undefined : 1,
      interrupter: activeInterrupter,
      cpSat: options.backend === 'CP_SAT'
        ? {
          numWorkers: options.workers,
          maxTimeInSeconds: options.timeLimitSeconds,
          randomSeed: options.seed,
          randomizeSearch: options.randomizeSearch,
          stopAfterFirstSolution: true,
        }
        : undefined,
      gscip: options.backend === 'GSCIP'
        ? new MathOpt.GScipParameters({
          silenceOutput: true,
          presolve: MathOpt.GScipMetaParamValue.FAST,
        })
        : undefined,
      glpk: options.backend === 'GLPK'
        ? new MathOpt.GlpkParameters({ computeUnboundRaysIfPossible: false })
        : undefined,
    });
    return {
      status: result.terminationReason,
      grid: result.has_primal_feasible_solution() ? parseSolution(result, variables) : null,
    };
  } finally {
    activeInterrupter = null;
  }
}

async function hasUniqueSolution(clues: Grid, backend: SudokuBackend, workers: number) {
  const first = await solveSudoku(clues, { backend, timeLimitSeconds: 3, workers });
  if (!isFeasibleStatus(first.status) || !first.grid) {
    return { unique: false, solution: null, status: String(first.status ?? 'NO_RESPONSE') };
  }
  const second = await solveSudoku(clues, { backend, timeLimitSeconds: 3, workers: 1 }, first.grid);
  return {
    unique: isInfeasibleStatus(second.status),
    solution: first.grid,
    status: String(second.status ?? 'NO_RESPONSE'),
  };
}

async function generateFullGrid(seed: number, backend: SudokuBackend, workers: number) {
  const result = await solveSudoku(Array(cells).fill(0), {
    backend,
    timeLimitSeconds: 5,
    workers,
    seed,
    randomizeSearch: true,
  });
  if (!isFeasibleStatus(result.status) || !result.grid) {
    throw new Error(`Unable to generate a complete grid, status=${String(result.status)}`);
  }
  return result.grid;
}

async function generatePuzzle() {
  cancelled = false;
  const { backend, workers } = configureMathOpt();
  const target = Math.min(81, Math.max(0, Number.parseInt(targetInput?.value ?? '0', 10) || 0));
  const seed = Math.max(1, Number.parseInt(seedInput?.value ?? '1', 10) || 1);
  if (targetInput) targetInput.value = String(target);
  if (seedInput) seedInput.value = String(seed);

  setRunning(true);
  setStatus(`Initializing MathOpt Sudoku generator with ${backendLabel(backend)} backend (target=${target}, seed=${seed})...`);
  try {
    appendStatus('Solving an empty Sudoku model to get a complete grid.');
    const full = await generateFullGrid(seed, backend, workers);
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

      const check = await hasUniqueSolution(puzzle, backend, workers);
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
  const { backend, workers } = configureMathOpt();
  setRunning(true);
  setStatus(`Solving current board with MathOpt ${backendLabel(backend)} backend...`);
  try {
    const clues = readGrid();
    givens = new Set(clues.flatMap((value, index) => (value === 0 ? [] : [index])));
    renderGrid(clues);
    const result = await solveSudoku(clues, { backend, timeLimitSeconds: 5, workers });
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
solverSelect?.addEventListener('change', updateBackendControls);
updateBackendControls();
configureSolverExecutorSelector({ setExecutor }, executorSelector);

generateButton?.addEventListener('click', () => {
  void generatePuzzle();
});
solveButton?.addEventListener('click', () => {
  void solveBoard();
});
clearButton?.addEventListener('click', clearBoard);
stopButton?.addEventListener('click', () => {
  cancelled = true;
  appendStatus('Stopping after the active MathOpt solve returns...');
  activeInterrupter?.interrupt();
});
