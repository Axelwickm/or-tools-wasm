import {
  initNetworkFlow,
  setExecutor,
  SimpleMaxFlow,
} from 'or-tools-wasm/network-flow';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

type Node = { id: number; label: string; x: number; y: number; kind: 'source' | 'middle' | 'sink' };
type Arc = { from: number; to: number; capacity: number; flow?: number };

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const graphEl = document.getElementById('flow-graph') as SVGSVGElement | null;
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const middleCountInput = document.getElementById('middle-count') as HTMLInputElement | null;
const randomizeButton = document.getElementById('randomize') as HTMLButtonElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

let nodes: Node[] = [];
let arcs: Arc[] = [];

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const middleCount = () => Math.max(3, Number.parseInt(middleCountInput?.value ?? '8', 10) || 8);

function setRunning(running: boolean) {
  if (runButton) {
    runButton.disabled = running;
    runButton.textContent = running ? 'Solving...' : 'Solve Max Flow';
  }
  if (randomizeButton) randomizeButton.disabled = running;
  if (middleCountInput) middleCountInput.disabled = running;
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function generateGraph() {
  const count = middleCount();
  nodes = [
    { id: 0, label: 'S', x: 70, y: 310, kind: 'source' as const },
    ...Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      label: String(index + 1),
      x: randomInt(240, 690),
      y: randomInt(80, 540),
      kind: 'middle' as const,
    })),
    { id: count + 1, label: 'T', x: 890, y: 310, kind: 'sink' as const },
  ];
  const sink = count + 1;
  const generated: Arc[] = [];
  for (let node = 1; node <= count; node++) {
    if (Math.random() < 0.65) generated.push({ from: 0, to: node, capacity: randomInt(8, 32) });
    if (Math.random() < 0.65) generated.push({ from: node, to: sink, capacity: randomInt(8, 32) });
  }
  for (let from = 1; from <= count; from++) {
    for (let to = 1; to <= count; to++) {
      if (nodes[from].x < nodes[to].x && Math.random() < 0.24) {
        generated.push({ from, to, capacity: randomInt(4, 24) });
      }
    }
  }
  for (let node = 1; node < count; node++) {
    generated.push({ from: node, to: node + 1, capacity: randomInt(6, 18) });
  }
  if (!generated.some((arc) => arc.from === 0)) generated.push({ from: 0, to: 1, capacity: 20 });
  if (!generated.some((arc) => arc.to === sink)) generated.push({ from: count, to: sink, capacity: 20 });
  arcs = generated;
}

function renderGraph(solved = false) {
  if (!graphEl) return;
  const maxFlow = Math.max(...arcs.map((arc) => arc.flow ?? 0), 1);
  const arcSvg = arcs.map((arc) => {
    const from = nodes[arc.from];
    const to = nodes[arc.to];
    const flow = arc.flow ?? 0;
    const utilization = flow / Math.max(arc.capacity, 1);
    const strokeWidth = solved && flow > 0 ? 2 + (flow / maxFlow) * 7 : 2;
    const stroke = solved ? (flow > 0 ? `rgba(9, 105, 218, ${0.35 + utilization * 0.55})` : '#d0d7de') : '#8c959f';
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    return `
      <g>
        <title>${from.label} -> ${to.label}: ${solved ? `${flow} / ` : ''}${arc.capacity}</title>
        <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${stroke}" stroke-width="${strokeWidth}" marker-end="url(#flow-arrow)" />
        <text x="${midX}" y="${midY - 5}" text-anchor="middle" font-size="11" fill="#57606a">${solved ? `${flow}/` : ''}${arc.capacity}</text>
      </g>
    `;
  }).join('');
  const nodeSvg = nodes.map((node) => {
    const fill = node.kind === 'source' ? '#1a7f37' : node.kind === 'sink' ? '#cf222e' : '#fff';
    const textFill = node.kind === 'middle' ? '#24292f' : '#fff';
    return `
      <g>
        <title>${node.kind === 'source' ? 'Source' : node.kind === 'sink' ? 'Sink' : `Transit node ${node.id}`}</title>
        <circle cx="${node.x}" cy="${node.y}" r="18" fill="${fill}" stroke="#24292f" stroke-width="2"></circle>
        <text x="${node.x}" y="${node.y + 5}" text-anchor="middle" font-size="13" fill="${textFill}" font-weight="700">${node.label}</text>
      </g>
    `;
  }).join('');
  graphEl.innerHTML = `
    <defs>
      <marker id="flow-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L8,3 z" fill="#57606a"></path>
      </marker>
    </defs>
    <rect width="960" height="620" fill="#f6f8fa"></rect>
    <text x="24" y="34" font-size="16" fill="#24292f" font-weight="700">${solved ? 'Solved max flow' : 'Unsolved network'}</text>
    <text x="24" y="56" font-size="12" fill="#57606a">${solved ? 'Thicker blue arcs carry more flow; labels show flow/capacity.' : 'Arc labels show capacity. The solver will maximize flow from S to T.'}</text>
    ${arcSvg}
    ${nodeSvg}
  `;
}

function resetView() {
  if (statusEl) statusEl.textContent = '';
  if (solutionOutput) solutionOutput.textContent = 'Run the solver to view the max-flow solution.';
  renderGraph(false);
}

async function runMaxFlow() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus('Initializing Network Flow runtime...');
    await initNetworkFlow();

    const maxFlow = new SimpleMaxFlow();
    const allArcs = maxFlow.add_arcs_with_capacity(
      arcs.map((arc) => arc.from),
      arcs.map((arc) => arc.to),
      arcs.map((arc) => arc.capacity),
    );

    appendStatus(`Solving with ${executorSelector?.value ?? 'worker'} executor...`);
    const status = await maxFlow.solve(0, nodes.length - 1);
    appendStatus(`Done. Status ${status}.`);

    arcs = allArcs.map((arc) => ({
      from: maxFlow.tail(arc),
      to: maxFlow.head(arc),
      capacity: maxFlow.capacity(arc),
      flow: maxFlow.flow(arc),
    }));
    renderGraph(true);
    if (solutionOutput) {
      solutionOutput.innerHTML = `
        <strong>Optimal flow:</strong> ${maxFlow.optimal_flow()}<br>
        <strong>Source-side min cut:</strong> ${maxFlow.get_source_side_min_cut().join(', ')}<br>
        <strong>Sink-side min cut:</strong> ${maxFlow.get_sink_side_min_cut().join(', ')}
      `;
    }
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runMaxFlow());
randomizeButton?.addEventListener('click', () => {
  generateGraph();
  resetView();
});
middleCountInput?.addEventListener('change', () => {
  if (middleCountInput) middleCountInput.value = String(middleCount());
  generateGraph();
  resetView();
});

generateGraph();
resetView();
configureSolverExecutorSelector({ setExecutor }, executorSelector);
