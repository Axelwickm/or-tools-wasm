import {
  type ExecutorConfiguration,
  SimpleMinCostFlow,
} from 'or-tools-wasm/network-flow';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { requiredElement } from './site_support.js';

type Node = { id: number; label: string; x: number; y: number; supply: number };
type Arc = { from: number; to: number; capacity: number; unitCost: number; flow?: number };

const solutionOutput = requiredElement('solution-output', 'div');
const statusEl = requiredElement('status', 'pre');
const graphEl = requiredElement('flow-graph', 'svg');
const executorSelector = requiredElement('solver-executor', 'select');
const supplyCountInput = requiredElement('supply-count', 'input');
const transitCountInput = requiredElement('transit-count', 'input');
const demandCountInput = requiredElement('demand-count', 'input');
const randomizeButton = requiredElement('randomize', 'button');
const runButton = requiredElement('run', 'button');
let readNetworkFlowExecutor: () => ExecutorConfiguration = () => ({ type: 'worker' });

let nodes: Node[] = [];
let arcs: Arc[] = [];

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const supplyCount = () => Math.max(1, Number.parseInt(supplyCountInput.value, 10) || 2);
const transitCount = () => Math.max(1, Number.parseInt(transitCountInput.value, 10) || 6);
const demandCount = () => Math.max(1, Number.parseInt(demandCountInput.value, 10) || 3);

function setRunning(running: boolean) {
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Min-Cost Flow';
  randomizeButton.disabled = running;
  supplyCountInput.disabled = running;
  transitCountInput.disabled = running;
  demandCountInput.disabled = running;
}

function appendStatus(message: string) {
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function distribute(total: number, parts: number) {
  const values = Array(parts).fill(1);
  for (let remaining = total - parts; remaining > 0; remaining--) {
    values[randomInt(0, parts - 1)]++;
  }
  return values;
}

function generateGraph() {
  const supplies = distribute(randomInt(24, 48), supplyCount());
  const demands = distribute(supplies.reduce((sum, value) => sum + value, 0), demandCount());
  const transitTotal = transitCount();
  let id = 0;
  const supplyNodes = supplies.map((supply, index) => ({
    id: id++,
    label: `S${index + 1}`,
    x: 80,
    y: 110 + index * (400 / Math.max(1, supplies.length - 1)),
    supply,
  }));
  const transitNodes = Array.from({ length: transitTotal }, (_, index) => ({
    id: id++,
    label: String(index + 1),
    x: randomInt(285, 665),
    y: randomInt(80, 540),
    supply: 0,
  }));
  const demandNodes = demands.map((demand, index) => ({
    id: id++,
    label: `D${index + 1}`,
    x: 880,
    y: 110 + index * (400 / Math.max(1, demands.length - 1)),
    supply: -demand,
  }));
  nodes = [...supplyNodes, ...transitNodes, ...demandNodes];
  const generated: Arc[] = [];
  const addArc = (from: number, to: number, capacity = randomInt(6, 24), unitCost = randomInt(1, 9)) => {
    if (from === to || generated.some((arc) => arc.from === from && arc.to === to)) return;
    generated.push({ from, to, capacity, unitCost });
  };
  const totalSupply = supplies.reduce((sum, value) => sum + value, 0);
  const hub = transitNodes[0];
  for (const supply of supplyNodes) {
    addArc(supply.id, hub.id, supply.supply + randomInt(3, 10), randomInt(2, 5));
  }
  for (const demand of demandNodes) {
    addArc(hub.id, demand.id, -demand.supply + randomInt(3, 10), randomInt(2, 5));
  }
  if (transitNodes.length > 1) {
    for (let index = 0; index < transitNodes.length - 1; index++) {
      addArc(transitNodes[index].id, transitNodes[index + 1].id, totalSupply, randomInt(1, 4));
    }
  }
  for (const supply of supplyNodes) {
    const shuffled = [...transitNodes].sort(() => Math.random() - 0.5);
    shuffled.slice(0, Math.min(3, shuffled.length)).forEach((node) => addArc(supply.id, node.id));
  }
  for (const transit of transitNodes) {
    const targets = [...transitNodes, ...demandNodes].filter((node) => node.x > transit.x);
    targets.sort(() => Math.random() - 0.5).slice(0, Math.min(3, targets.length)).forEach((node) => addArc(transit.id, node.id));
  }
  for (const demand of demandNodes) {
    if (!generated.some((arc) => arc.to === demand.id)) {
      const nearest = transitNodes.reduce((best, node) =>
        Math.abs(node.x - demand.x) < Math.abs(best.x - demand.x) ? node : best,
      transitNodes[0]);
      addArc(nearest.id, demand.id);
    }
  }
  for (const supply of supplyNodes) {
    if (!generated.some((arc) => arc.from === supply.id)) addArc(supply.id, transitNodes[0].id);
  }
  arcs = generated;
}

function renderSolution(minCostFlow: SimpleMinCostFlow, allArcs: number[]) {
  const rows = allArcs.map((arc) =>
    `<tr><td>${minCostFlow.tail(arc)}</td><td>${minCostFlow.head(arc)}</td><td>${minCostFlow.capacity(arc)}</td><td>${minCostFlow.unitCost(arc)}</td><td>${minCostFlow.flow(arc)}</td></tr>`,
  ).join('');
  solutionOutput.innerHTML = `
    <strong>Optimal cost:</strong> ${minCostFlow.optimalCost()}<br>
    <strong>Maximum flow:</strong> ${minCostFlow.maximumFlow()}
    <table>
      <thead><tr><th>Tail</th><th>Head</th><th>Capacity</th><th>Unit cost</th><th>Flow</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderGraph(solved = false) {
  const maxFlow = Math.max(...arcs.map((arc) => arc.flow ?? 0), 1);
  const arcSvg = arcs.map((arc) => {
    const a = nodes[arc.from];
    const b = nodes[arc.to];
    const flow = arc.flow ?? 0;
    const width = solved && flow > 0 ? 2 + (flow / maxFlow) * 7 : 2;
    const stroke = solved ? (flow > 0 ? '#0969da' : '#d0d7de') : '#8c959f';
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    return `
      <g>
        <title>${a.label} -> ${b.label}: capacity ${arc.capacity}, cost ${arc.unitCost}${solved ? `, flow ${flow}` : ''}</title>
        <line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${width}" marker-end="url(#flow-arrow)" />
        <text x="${midX}" y="${midY - 6}" text-anchor="middle" font-size="11" fill="#57606a">${solved ? `${flow}/` : ''}${arc.capacity} | c${arc.unitCost}</text>
      </g>
    `;
  }).join('');
  const nodeSvg = nodes.map((node) => {
    const fill = node.supply > 0 ? '#1a7f37' : node.supply < 0 ? '#cf222e' : '#fff';
    const textFill = node.supply === 0 ? '#24292f' : '#fff';
    const title = node.supply > 0 ? `supply ${node.supply}` : node.supply < 0 ? `demand ${-node.supply}` : 'transit';
    return `
      <g>
        <title>${node.label}: ${title}</title>
        <circle cx="${node.x}" cy="${node.y}" r="18" fill="${fill}" stroke="#24292f" stroke-width="2"></circle>
        <text x="${node.x}" y="${node.y + 5}" text-anchor="middle" font-size="13" fill="${textFill}" font-weight="700">${node.label}</text>
      </g>
    `;
  }).join('');
  graphEl.innerHTML = `
    <defs><marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L8,3 z" fill="#57606a"></path></marker></defs>
    <rect width="960" height="620" fill="#f6f8fa"></rect>
    <text x="24" y="34" font-size="16" fill="#24292f" font-weight="700">${solved ? 'Solved min-cost flow' : 'Unsolved min-cost flow'}</text>
    <text x="24" y="56" font-size="12" fill="#57606a">${solved ? 'Blue arc thickness shows shipped flow. Labels show flow/capacity and unit cost.' : 'Green nodes supply flow; red nodes demand flow. Labels show capacity and unit cost.'}</text>
    ${arcSvg}
    ${nodeSvg}
  `;
}

function resetView() {
  statusEl.textContent = '';
  solutionOutput.textContent = 'Run the solver to view the min-cost flow solution.';
  renderGraph(false);
}

async function runMinCostFlow() {
  setRunning(true);
  statusEl.textContent = '';
  try {
    const minCostFlow = new SimpleMinCostFlow();
    const allArcs = minCostFlow.addArcsWithCapacityAndUnitCost(
      arcs.map((arc) => arc.from),
      arcs.map((arc) => arc.to),
      arcs.map((arc) => arc.capacity),
      arcs.map((arc) => arc.unitCost),
    );
    minCostFlow.setNodesSupplies(nodes.map((node) => node.id), nodes.map((node) => node.supply));

    appendStatus(`Solving with ${executorSelector.value} executor...`);
    const status = await minCostFlow.solve({ executor: readNetworkFlowExecutor() });
    appendStatus(`Done. Status ${status}.`);
    arcs = allArcs.map((arc) => ({
      from: minCostFlow.tail(arc),
      to: minCostFlow.head(arc),
      capacity: Number(minCostFlow.capacity(arc)),
      unitCost: Number(minCostFlow.unitCost(arc)),
      flow: Number(minCostFlow.flow(arc)),
    }));
    renderSolution(minCostFlow, allArcs);
    renderGraph(true);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton.addEventListener('click', () => void runMinCostFlow());
randomizeButton.addEventListener('click', () => {
  generateGraph();
  resetView();
});
supplyCountInput.addEventListener('change', () => {
  supplyCountInput.value = String(supplyCount());
  generateGraph();
  resetView();
});
transitCountInput.addEventListener('change', () => {
  transitCountInput.value = String(transitCount());
  generateGraph();
  resetView();
});
demandCountInput.addEventListener('change', () => {
  demandCountInput.value = String(demandCount());
  generateGraph();
  resetView();
});

generateGraph();
resetView();
readNetworkFlowExecutor = configureSolverExecutorSelector(executorSelector);
