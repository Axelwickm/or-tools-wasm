import {
  type ExecutorConfiguration,
  SimpleLinearSumAssignment,
} from 'or-tools-wasm/network-flow';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { requiredElement } from './site_support.js';

const solutionOutput = requiredElement('solution-output', 'div');
const statusEl = requiredElement('status', 'pre');
const graphEl = requiredElement('assignment-graph', 'svg');
const executorSelector = requiredElement('solver-executor', 'select');
const sizeInput = requiredElement('assignment-size', 'input');
const randomizeButton = requiredElement('randomize', 'button');
const runButton = requiredElement('run', 'button');
let readNetworkFlowExecutor: () => ExecutorConfiguration = () => ({ type: 'worker' });

let costs: number[][] = [
  [90, 76, 75, 70],
  [35, 85, 55, 65],
  [125, 95, 90, 105],
  [45, 110, 95, 115],
];

function setRunning(running: boolean) {
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Assignment';
  randomizeButton.disabled = running;
  sizeInput.disabled = running;
}

function appendStatus(message: string) {
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
  return Math.max(2, Number.parseInt(sizeInput.value, 10) || 4);
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
  statusEl.textContent = '';
  solutionOutput.textContent = 'Run the solver to view the assignment.';
  renderGraph();
}

function renderSolution(assignment: SimpleLinearSumAssignment) {
  const rows = Array.from({ length: assignment.numNodes() }, (_, worker) =>
    `<tr><td>${worker}</td><td>${assignment.rightMate(worker)}</td><td>${assignment.assignmentCost(worker)}</td></tr>`,
  ).join('');
  solutionOutput.innerHTML = `
    <strong>Optimal cost:</strong> ${assignment.optimalCost()}
    <table>
      <thead><tr><th>Worker</th><th>Task</th><th>Cost</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderGraph(matches: Array<{ worker: number; task: number }> = []) {
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
  statusEl.textContent = '';
  try {
    const { leftNodes, rightNodes, arcCosts } = buildAssignmentData();
    const assignment = new SimpleLinearSumAssignment();
    assignment.addArcsWithCost(leftNodes, rightNodes, arcCosts);

    appendStatus(`Solving with ${executorSelector.value} executor...`);
    const status = await assignment.solve({ executor: readNetworkFlowExecutor() });
    appendStatus(`Done. Status ${status}.`);
    renderSolution(assignment);
    renderGraph(Array.from({ length: assignment.numNodes() }, (_, worker) => ({
      worker,
      task: assignment.rightMate(worker),
    })));
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton.addEventListener('click', () => void runAssignment());
randomizeButton.addEventListener('click', () => {
  generateCosts();
  resetView();
});
sizeInput.addEventListener('change', () => {
  sizeInput.value = String(assignmentSize());
  generateCosts();
  resetView();
});
resetView();
readNetworkFlowExecutor = configureSolverExecutorSelector(executorSelector);
