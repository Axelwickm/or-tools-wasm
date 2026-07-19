import {
  initNetworkFlow,
  setExecutor,
  SimpleLinearSumAssignment,
} from 'or-tools-wasm/network-flow';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const graphEl = document.getElementById('assignment-graph') as SVGSVGElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const sizeInput = document.getElementById('assignment-size') as HTMLInputElement | null;
const randomizeButton = document.getElementById('randomize') as HTMLButtonElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

let costs: number[][] = [
  [90, 76, 75, 70],
  [35, 85, 55, 65],
  [125, 95, 90, 105],
  [45, 110, 95, 115],
];

function setRunning(running: boolean) {
  if (runButton) {
    runButton.disabled = running;
    runButton.textContent = running ? 'Solving...' : 'Solve Assignment';
  }
  if (randomizeButton) randomizeButton.disabled = running;
  if (sizeInput) sizeInput.disabled = running;
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function buildAssignmentData() {
  const leftNodes: number[] = [];
  const rightNodes: number[] = [];
  const arcCosts: number[] = [];
  for (let worker = 0; worker < costs.length; ++worker) {
    for (let task = 0; task < costs[worker].length; ++task) {
      leftNodes.push(worker);
      rightNodes.push(task);
      arcCosts.push(costs[worker][task]);
    }
  }
  return { leftNodes, rightNodes, arcCosts };
}

function assignmentSize() {
  return Math.max(2, Number.parseInt(sizeInput?.value ?? '4', 10) || 4);
}

function randomCost() {
  return 25 + Math.floor(Math.random() * 126);
}

function generateCosts(size = assignmentSize()) {
  costs = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => randomCost()),
  );
}

function resetView() {
  if (statusEl) statusEl.textContent = '';
  if (solutionOutput) solutionOutput.textContent = 'Run the solver to view the assignment.';
  renderGraph();
}

function renderSolution(assignment: SimpleLinearSumAssignment) {
  if (!solutionOutput) return;
  const rows = Array.from({ length: assignment.num_nodes() }, (_, worker) =>
    `<tr><td>${worker}</td><td>${assignment.right_mate(worker)}</td><td>${assignment.assignment_cost(worker)}</td></tr>`,
  ).join('');
  solutionOutput.innerHTML = `
    <strong>Optimal cost:</strong> ${assignment.optimal_cost()}
    <table>
      <thead><tr><th>Worker</th><th>Task</th><th>Cost</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderGraph(matches: Array<{ worker: number; task: number; cost: number }> = []) {
  if (!graphEl) return;
  const allCosts = costs.reduce<number[]>((values, row) => values.concat(row), []);
  const minCost = Math.min(...allCosts);
  const maxCost = Math.max(...allCosts);
  const selected = new Set(matches.map((match) => `${match.worker}-${match.task}`));
  const cellSize = Math.max(42, Math.min(72, Math.floor(320 / costs.length)));
  const cellInner = cellSize - 6;
  const gridWidth = costs.length * cellSize;
  const gridX = Math.round((960 - gridWidth) / 2);
  const gridY = 98;
  const colorForCost = (cost: number) => {
    const t = (cost - minCost) / Math.max(1, maxCost - minCost);
    const red = Math.round(235 + t * 16);
    const green = Math.round(248 - t * 120);
    const blue = Math.round(235 - t * 145);
    return `rgb(${red}, ${green}, ${blue})`;
  };
  const matrix = costs.map((row, worker) =>
    row.map((cost, task) => {
      const chosen = selected.has(`${worker}-${task}`);
      const x = gridX + task * cellSize;
      const y = gridY + worker * cellSize;
      const centerX = x + cellInner / 2;
      const centerY = y + cellInner / 2;
      return `
        <g>
          <title>Worker ${worker} -> Task ${task}: cost ${cost}</title>
          <rect x="${x}" y="${y}" width="${cellInner}" height="${cellInner}" rx="6" fill="${colorForCost(cost)}" stroke="${chosen ? '#24292f' : '#d0d7de'}" stroke-width="${chosen ? 3 : 1.5}"></rect>
          <text x="${centerX}" y="${centerY + 5}" text-anchor="middle" font-size="15" fill="#24292f" font-weight="${chosen ? 700 : 500}">${cost}</text>
        </g>
      `;
    }),
  ).join('');
  const rowLabels = costs.map((_, worker) => `
      <g>
        <circle cx="${gridX - 36}" cy="${gridY + worker * cellSize + cellInner / 2}" r="18" fill="#1a7f37" stroke="#24292f" stroke-width="2"></circle>
      <text x="${gridX - 36}" y="${gridY + worker * cellSize + cellInner / 2 + 5}" text-anchor="middle" font-size="13" fill="#fff" font-weight="700">W${worker}</text>
    </g>
  `).join('');
  const columnLabels = costs[0].map((_, task) => `
      <g>
        <circle cx="${gridX + task * cellSize + cellInner / 2}" cy="${gridY - 34}" r="18" fill="#cf222e" stroke="#24292f" stroke-width="2"></circle>
      <text x="${gridX + task * cellSize + cellInner / 2}" y="${gridY - 29}" text-anchor="middle" font-size="13" fill="#fff" font-weight="700">T${task}</text>
    </g>
  `).join('');
  graphEl.innerHTML = `
    <rect width="960" height="520" fill="#f6f8fa"></rect>
    <text x="24" y="34" font-size="16" fill="#24292f" font-weight="700">${matches.length ? 'Solved assignment' : 'Unsolved assignment graph'}</text>
    <text x="24" y="56" font-size="12" fill="#57606a">${matches.length ? 'Chosen worker-task matches use a dark border and bolder cost text.' : 'Lower-cost cells are greener; higher-cost cells are warmer.'}</text>
    ${matrix}
    ${rowLabels}
    ${columnLabels}
  `;
}

async function runAssignment() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus('Initializing Network Flow runtime...');
    await initNetworkFlow();

    const { leftNodes, rightNodes, arcCosts } = buildAssignmentData();
    const assignment = new SimpleLinearSumAssignment();
    assignment.add_arcs_with_cost(leftNodes, rightNodes, arcCosts);

    appendStatus(`Solving with ${executorSelector?.value ?? 'worker'} executor...`);
    const status = await assignment.solve();
    appendStatus(`Done. Status ${status}.`);
    renderSolution(assignment);
    renderGraph(Array.from({ length: assignment.num_nodes() }, (_, worker) => ({
      worker,
      task: assignment.right_mate(worker),
      cost: assignment.assignment_cost(worker),
    })));
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runAssignment());
randomizeButton?.addEventListener('click', () => {
  generateCosts();
  resetView();
});
sizeInput?.addEventListener('change', () => {
  if (sizeInput) sizeInput.value = String(assignmentSize());
  generateCosts();
  resetView();
});
resetView();
configureSolverExecutorSelector({ setExecutor }, executorSelector);
