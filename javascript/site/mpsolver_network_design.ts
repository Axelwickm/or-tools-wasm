import { initMPSolver, isWorkerBridgeEnabled, MPSolver, setWorkerBridgeEnabled, type MPVariable } from 'or-tools-wasm/mp-solver';
import {
  appendStatus,
  applySolverThreads,
  configureSolverThreadsInput,
  configureWorkerBridge,
  formatNumber,
  getSelectedSolverThreads,
  setRunning,
} from './mp_solver_helpers.js';
import { getMaxWorkerCount } from './worker_limits.js';

type NodeType = 'source' | 'hub' | 'sink';
type NetworkNode = { id: string; label: string; type: NodeType; x: number; y: number };
type Arc = { id: string; from: string; to: string; capacity: number; fixedCost: number; unitCost: number };
type Demand = { id: string; label: string; from: string; to: string; amount: number; color: string };
type ArcSolution = { arc: Arc; open: boolean; totalFlow: number; demandFlows: number[] };
type Solution = {
  status: string;
  objective: number;
  openedLanes: number;
  shipped: number;
  saturated: number;
  solverThreads: number;
  solverThreadsAccepted: boolean;
  activeSolverThreads: number;
  wallTime: number;
  nodes: number;
  arcSolutions: ArcSolution[];
};

const nodes: NetworkNode[] = [
  { id: 'supplier-a', label: 'Supplier A', type: 'source', x: 75, y: 115 },
  { id: 'supplier-b', label: 'Supplier B', type: 'source', x: 75, y: 320 },
  { id: 'supplier-c', label: 'Supplier C', type: 'source', x: 75, y: 525 },
  { id: 'port', label: 'Port Gate', type: 'hub', x: 265, y: 85 },
  { id: 'rail-yard', label: 'Rail Yard', type: 'hub', x: 265, y: 235 },
  { id: 'cold-storage', label: 'Cold Storage', type: 'hub', x: 265, y: 390 },
  { id: 'overflow', label: 'Overflow Yard', type: 'hub', x: 265, y: 550 },
  { id: 'north-hub', label: 'North Hub', type: 'hub', x: 520, y: 95 },
  { id: 'metro-hub', label: 'Metro Hub', type: 'hub', x: 520, y: 260 },
  { id: 'south-hub', label: 'South Hub', type: 'hub', x: 520, y: 430 },
  { id: 'reserve-hub', label: 'Reserve Hub', type: 'hub', x: 520, y: 570 },
  { id: 'north-store', label: 'North Store', type: 'sink', x: 825, y: 65 },
  { id: 'airport', label: 'Airport DC', type: 'sink', x: 825, y: 180 },
  { id: 'downtown', label: 'Downtown', type: 'sink', x: 825, y: 315 },
  { id: 'clinic', label: 'Clinic Net', type: 'sink', x: 825, y: 455 },
  { id: 'south-store', label: 'South Store', type: 'sink', x: 825, y: 585 },
];

const arcs: Arc[] = [
  { id: 'a-port', from: 'supplier-a', to: 'port', capacity: 85, fixedCost: 85, unitCost: 3 },
  { id: 'a-rail', from: 'supplier-a', to: 'rail-yard', capacity: 75, fixedCost: 80, unitCost: 4 },
  { id: 'a-north', from: 'supplier-a', to: 'north-hub', capacity: 45, fixedCost: 130, unitCost: 5 },
  { id: 'b-rail', from: 'supplier-b', to: 'rail-yard', capacity: 105, fixedCost: 90, unitCost: 3 },
  { id: 'b-cold', from: 'supplier-b', to: 'cold-storage', capacity: 80, fixedCost: 90, unitCost: 4 },
  { id: 'b-metro', from: 'supplier-b', to: 'metro-hub', capacity: 55, fixedCost: 125, unitCost: 5 },
  { id: 'c-cold', from: 'supplier-c', to: 'cold-storage', capacity: 100, fixedCost: 90, unitCost: 3 },
  { id: 'c-overflow', from: 'supplier-c', to: 'overflow', capacity: 75, fixedCost: 70, unitCost: 4 },
  { id: 'c-south', from: 'supplier-c', to: 'south-hub', capacity: 55, fixedCost: 130, unitCost: 5 },
  { id: 'port-north', from: 'port', to: 'north-hub', capacity: 75, fixedCost: 65, unitCost: 2 },
  { id: 'port-metro', from: 'port', to: 'metro-hub', capacity: 50, fixedCost: 75, unitCost: 3 },
  { id: 'rail-north', from: 'rail-yard', to: 'north-hub', capacity: 70, fixedCost: 80, unitCost: 3 },
  { id: 'rail-metro', from: 'rail-yard', to: 'metro-hub', capacity: 105, fixedCost: 60, unitCost: 2 },
  { id: 'rail-south', from: 'rail-yard', to: 'south-hub', capacity: 55, fixedCost: 90, unitCost: 4 },
  { id: 'cold-metro', from: 'cold-storage', to: 'metro-hub', capacity: 70, fixedCost: 70, unitCost: 3 },
  { id: 'cold-south', from: 'cold-storage', to: 'south-hub', capacity: 105, fixedCost: 60, unitCost: 2 },
  { id: 'cold-reserve', from: 'cold-storage', to: 'reserve-hub', capacity: 45, fixedCost: 80, unitCost: 4 },
  { id: 'overflow-south', from: 'overflow', to: 'south-hub', capacity: 80, fixedCost: 65, unitCost: 3 },
  { id: 'overflow-reserve', from: 'overflow', to: 'reserve-hub', capacity: 75, fixedCost: 55, unitCost: 2 },
  { id: 'north-airport', from: 'north-hub', to: 'airport', capacity: 45, fixedCost: 60, unitCost: 3 },
  { id: 'north-store', from: 'north-hub', to: 'north-store', capacity: 75, fixedCost: 60, unitCost: 2 },
  { id: 'north-downtown', from: 'north-hub', to: 'downtown', capacity: 45, fixedCost: 70, unitCost: 4 },
  { id: 'metro-airport', from: 'metro-hub', to: 'airport', capacity: 50, fixedCost: 55, unitCost: 2 },
  { id: 'metro-downtown', from: 'metro-hub', to: 'downtown', capacity: 90, fixedCost: 55, unitCost: 2 },
  { id: 'metro-clinic', from: 'metro-hub', to: 'clinic', capacity: 45, fixedCost: 75, unitCost: 4 },
  { id: 'south-downtown', from: 'south-hub', to: 'downtown', capacity: 50, fixedCost: 80, unitCost: 4 },
  { id: 'south-clinic', from: 'south-hub', to: 'clinic', capacity: 70, fixedCost: 55, unitCost: 2 },
  { id: 'south-store', from: 'south-hub', to: 'south-store', capacity: 85, fixedCost: 60, unitCost: 2 },
  { id: 'reserve-clinic', from: 'reserve-hub', to: 'clinic', capacity: 55, fixedCost: 65, unitCost: 3 },
  { id: 'reserve-store', from: 'reserve-hub', to: 'south-store', capacity: 70, fixedCost: 60, unitCost: 2 },
];

const demands: Demand[] = [
  { id: 'north-restock', label: 'A to North Store', from: 'supplier-a', to: 'north-store', amount: 50, color: '#0969da' },
  { id: 'airport-a', label: 'A to Airport DC', from: 'supplier-a', to: 'airport', amount: 35, color: '#1a7f37' },
  { id: 'downtown-b', label: 'B to Downtown', from: 'supplier-b', to: 'downtown', amount: 60, color: '#cf222e' },
  { id: 'clinic-b', label: 'B to Clinic Net', from: 'supplier-b', to: 'clinic', amount: 30, color: '#8250df' },
  { id: 'south-restock', label: 'C to South Store', from: 'supplier-c', to: 'south-store', amount: 55, color: '#bf8700' },
  { id: 'downtown-c', label: 'C to Downtown', from: 'supplier-c', to: 'downtown', amount: 25, color: '#0a7f8f' },
];

const nodeById = new Map(nodes.map((node) => [node.id, node]));
const svg = document.getElementById('network-map') as SVGSVGElement | null;
const summaryEl = document.getElementById('summary');
const demandList = document.getElementById('demand-list');
const laneList = document.getElementById('lane-list');
const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const clearSolutionButton = document.getElementById('clear-solution') as HTMLButtonElement | null;
const solverSelect = document.getElementById('solver-id') as HTMLSelectElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const maxWorkerCount = getMaxWorkerCount();

configureWorkerBridge(workerBridgeToggle);
configureSolverThreadsInput(workerInput, maxWorkerCount);

let currentSolution: Solution | null = null;
let activeDemand: number | null = null;
let activeArc: number | null = null;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const pathForArc = (arc: Arc) => {
  const from = nodeById.get(arc.from);
  const to = nodeById.get(arc.to);
  if (!from || !to) throw new Error(`unknown arc node for ${arc.id}`);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const curve = Math.max(-70, Math.min(70, dy * 0.22));
  return `M ${from.x} ${from.y} C ${from.x + dx * 0.42} ${from.y - curve}, ${from.x + dx * 0.58} ${to.y + curve}, ${to.x} ${to.y}`;
};

const pathForDemand = (demand: Demand, index: number) => {
  const from = nodeById.get(demand.from);
  const to = nodeById.get(demand.to);
  if (!from || !to) throw new Error(`unknown demand node for ${demand.id}`);
  const midY = Math.min(from.y, to.y) - 70 - index * 20;
  return `M ${from.x} ${from.y} C ${from.x + 220} ${midY}, ${to.x - 220} ${midY}, ${to.x} ${to.y}`;
};

const hasActiveFilter = () => activeDemand !== null || activeArc !== null;

function arcMatchesFilter(arcIndex: number) {
  if (activeArc !== null) return activeArc === arcIndex;
  if (!currentSolution || !hasActiveFilter()) return true;
  const arcSolution = currentSolution.arcSolutions[arcIndex];
  if (activeDemand !== null) return arcSolution.demandFlows[activeDemand] > 1e-8;
  return true;
}

function renderSummary() {
  if (!summaryEl) return;
  const totalDemand = demands.reduce((sum, demand) => sum + demand.amount, 0);
  summaryEl.innerHTML = `
    <div class="metric-card"><strong>${currentSolution ? `$${formatNumber(currentSolution.objective)}` : '--'}</strong><span>total cost</span></div>
    <div class="metric-card"><strong>${currentSolution ? currentSolution.openedLanes : '--'}</strong><span>opened lanes</span></div>
    <div class="metric-card"><strong>${currentSolution ? `${formatNumber(currentSolution.shipped)} / ${totalDemand}` : `0 / ${totalDemand}`}</strong><span>units shipped</span></div>
    <div class="metric-card"><strong>${currentSolution ? currentSolution.saturated : '--'}</strong><span>saturated lanes</span></div>
  `;
}

function renderDemandList() {
  if (!demandList) return;
  demandList.innerHTML = demands.map((demand, index) => {
    const active = activeDemand === index;
    const routeCount = currentSolution
      ? currentSolution.arcSolutions.filter((arcSolution) => arcSolution.demandFlows[index] > 1e-8).length
      : 0;
    return `
      <section class="demand-card ${active ? 'active' : ''}" style="--card-color: ${demand.color}" data-demand-index="${index}" title="${escapeHtml(demand.label)}: ${demand.amount} units">
        <h3>${escapeHtml(demand.label)}</h3>
        <small>${demand.amount} units${currentSolution ? ` across ${routeCount} lanes` : ''}</small>
      </section>
    `;
  }).join('');
}

function renderLaneList() {
  if (!laneList) return;
  if (!currentSolution) {
    laneList.innerHTML = '<p><small>Run the solver to see opened lanes.</small></p>';
    return;
  }
  const opened = currentSolution.arcSolutions
    .map((arcSolution, index) => ({ ...arcSolution, index }))
    .filter((arcSolution) => arcSolution.open);
  laneList.innerHTML = opened.map((arcSolution) => {
    const { arc, totalFlow, demandFlows, index } = arcSolution;
    const topDemandIndex = demandFlows.reduce((best, value, demandIndex) => value > demandFlows[best] ? demandIndex : best, 0);
    const color = demands[topDemandIndex]?.color ?? '#57606a';
    const active = activeArc === index;
    const dimmed = hasActiveFilter() && !arcMatchesFilter(index);
    return `
      <section class="lane-card ${active ? 'active' : ''} ${dimmed ? 'dimmed' : ''}" style="--card-color: ${color}" data-arc-index="${index}" title="${escapeHtml(arc.from)} to ${escapeHtml(arc.to)}">
        <h3>${escapeHtml(nodeById.get(arc.from)?.label ?? arc.from)} → ${escapeHtml(nodeById.get(arc.to)?.label ?? arc.to)}</h3>
        <small>${formatNumber(totalFlow)} / ${arc.capacity} units · fixed $${arc.fixedCost} · unit $${arc.unitCost}</small>
      </section>
    `;
  }).join('');
}

function renderMap() {
  if (!svg) return;
  const solvedClass = currentSolution ? 'solved' : '';
  const laneMarkup = arcs.map((arc, index) => {
    const arcSolution = currentSolution?.arcSolutions[index];
    const open = arcSolution?.open ?? false;
    const unusedSolved = Boolean(currentSolution && !open);
    const highlighted = hasActiveFilter() && arcMatchesFilter(index);
    const dimmed = hasActiveFilter() && !arcMatchesFilter(index);
    const width = open ? 3 + Math.min(10, (arcSolution?.totalFlow ?? 0) / arc.capacity * 10) : 2;
    const labelNode = nodeById.get(arc.to);
    return `
      <path id="arc-path-${index}" class="candidate-lane ${open ? 'open' : ''} ${unusedSolved ? 'unused-solved' : ''} ${highlighted ? 'highlighted' : ''}" data-arc-index="${index}" d="${pathForArc(arc)}" marker-end="url(#arrow)" style="stroke-width: ${dimmed ? 1 : width}"></path>
      ${open && labelNode ? `<text class="map-label" x="${labelNode.x - 62}" y="${labelNode.y - 12}">${formatNumber(arcSolution?.totalFlow ?? 0)}/${arc.capacity}</text>` : ''}
    `;
  }).join('');
  const flowMarkup = currentSolution ? currentSolution.arcSolutions.flatMap((arcSolution, arcIndex) =>
    arcSolution.demandFlows.flatMap((flow, demandIndex) => {
      if (flow <= 1e-8) return [];
      const demand = demands[demandIndex];
      const filteredOut = hasActiveFilter() && !arcMatchesFilter(arcIndex);
      return Array.from({ length: Math.max(1, Math.min(3, Math.round(flow / 25))) }, (_, dotIndex) => `
        <circle class="flow-dot" r="${filteredOut ? 0 : 4}" fill="${demand.color}" style="offset-path: path('${pathForArc(arcSolution.arc)}'); animation-delay: ${dotIndex * -0.75}s"></circle>
      `);
    })
  ).join('') : '';
  const demandMarkup = demands.map((demand, index) => `
    <path class="demand-arc" data-demand-index="${index}" d="${pathForDemand(demand, index)}" stroke="${demand.color}" style="opacity: ${activeDemand === index || !hasActiveFilter() ? 0.42 : 0.08}"></path>
  `).join('');
  const nodeMarkup = nodes.map((node) => `
    <g class="node ${node.type}" transform="translate(${node.x} ${node.y})">
      <circle r="33"></circle>
      <text y="-2">${escapeHtml(node.label.split(' ')[0])}</text>
      <text y="13">${escapeHtml(node.label.split(' ').slice(1).join(' '))}</text>
    </g>
  `).join('');
  svg.innerHTML = `
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#57606a"></path>
      </marker>
    </defs>
    <g class="${solvedClass}">
      ${demandMarkup}
      ${laneMarkup}
      ${flowMarkup}
      ${nodeMarkup}
    </g>
  `;
}

function renderSolutionText(solution: Solution | null) {
  if (!solutionOutput) return;
  if (!solution) {
    solutionOutput.textContent = 'Run the solver to choose lanes and route shipments.';
    return;
  }
  solutionOutput.innerHTML = `
    <table>
      <tbody>
        <tr><th>Status</th><td>${solution.status}</td></tr>
        <tr><th>Worker bridge</th><td>${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}</td></tr>
        <tr><th>Requested solver threads</th><td>${solution.solverThreads}</td></tr>
        <tr><th>Thread request accepted</th><td>${solution.solverThreadsAccepted ? 'yes' : 'no'}</td></tr>
        <tr><th>Active solver threads</th><td>${solution.activeSolverThreads}</td></tr>
        <tr><th>Total cost</th><td>$${formatNumber(solution.objective)}</td></tr>
        <tr><th>Opened lanes</th><td>${solution.openedLanes}</td></tr>
        <tr><th>Total shipped</th><td>${formatNumber(solution.shipped)}</td></tr>
        <tr><th>Branch-and-bound nodes</th><td>${solution.nodes}</td></tr>
        <tr><th>Wall time</th><td>${solution.wallTime} ms</td></tr>
      </tbody>
    </table>
  `;
}

function renderAll() {
  renderSummary();
  renderDemandList();
  renderLaneList();
  renderMap();
  renderSolutionText(currentSolution);
}

function clearSolution() {
  currentSolution = null;
  activeDemand = null;
  activeArc = null;
  if (statusEl) statusEl.textContent = '';
  renderAll();
}

async function solveNetworkDesign() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    await initMPSolver();
    const solverId = solverSelect?.value || 'SCIP';
    const solver = MPSolver.CreateSolver(solverId);
    if (!solver) throw new Error(`${solverId} backend is unavailable`);

    try {
      const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
      const threadConfig = applySolverThreads(solver, solverThreads);
      const open: MPVariable[] = arcs.map((arc) => solver.BoolVar(`open_${arc.id}`));
      const flow: MPVariable[][] = arcs.map((arc) =>
        demands.map((demand) => solver.NumVar(0, solver.infinity(), `flow_${arc.id}_${demand.id}`)));

      for (const [arcIndex, arc] of arcs.entries()) {
        const capacity = solver.Constraint(-solver.infinity(), 0, `capacity_${arc.id}`);
        capacity.SetCoefficient(open[arcIndex], -arc.capacity);
        for (const demandIndex of demands.keys()) {
          capacity.SetCoefficient(flow[arcIndex][demandIndex], 1);
        }

        for (const [demandIndex, demand] of demands.entries()) {
          const useOpenLane = solver.Constraint(-solver.infinity(), 0, `open_bound_${arc.id}_${demand.id}`);
          useOpenLane.SetCoefficient(flow[arcIndex][demandIndex], 1);
          useOpenLane.SetCoefficient(open[arcIndex], -Math.min(arc.capacity, demand.amount));
        }
      }

      for (const [demandIndex, demand] of demands.entries()) {
        for (const node of nodes) {
          const balance = node.id === demand.from ? demand.amount : node.id === demand.to ? -demand.amount : 0;
          const conservation = solver.Constraint(balance, balance, `flow_${demand.id}_${node.id}`);
          for (const [arcIndex, arc] of arcs.entries()) {
            if (arc.from === node.id) conservation.SetCoefficient(flow[arcIndex][demandIndex], 1);
            if (arc.to === node.id) conservation.SetCoefficient(flow[arcIndex][demandIndex], -1);
          }
        }
      }

      const objective = solver.Objective();
      for (const [arcIndex, arc] of arcs.entries()) {
        objective.SetCoefficient(open[arcIndex], arc.fixedCost);
        for (const demandIndex of demands.keys()) {
          objective.SetCoefficient(flow[arcIndex][demandIndex], arc.unitCost);
        }
      }
      objective.SetMinimization();

      appendStatus(statusEl, `Solving fixed-charge network design with ${solver.SolverVersion()}, requested solver threads=${solverThreads}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL && status !== MPSolver.FEASIBLE) {
        throw new Error(`expected OPTIMAL or FEASIBLE, got ${status}`);
      }

      const arcSolutions = arcs.map((arc, arcIndex) => {
        const demandFlows = demands.map((_, demandIndex) => flow[arcIndex][demandIndex].solution_value());
        const totalFlow = demandFlows.reduce((sum, value) => sum + value, 0);
        return { arc, open: open[arcIndex].solution_value() > 0.5, totalFlow, demandFlows };
      });
      currentSolution = {
        status: status === MPSolver.OPTIMAL ? 'OPTIMAL' : 'FEASIBLE',
        objective: objective.Value(),
        openedLanes: arcSolutions.filter((arcSolution) => arcSolution.open).length,
        shipped: demands.reduce((sum, demand) => sum + demand.amount, 0),
        saturated: arcSolutions.filter((arcSolution) => arcSolution.open && arcSolution.totalFlow >= arcSolution.arc.capacity - 1e-8).length,
        solverThreads: threadConfig.requested,
        solverThreadsAccepted: threadConfig.accepted,
        activeSolverThreads: threadConfig.active,
        wallTime: solver.WallTime(),
        nodes: solver.nodes(),
        arcSolutions,
      };
      activeDemand = null;
      activeArc = null;
      renderAll();
      appendStatus(statusEl, `Total cost: $${formatNumber(objective.Value())}`);
      appendStatus(statusEl, `Opened lanes: ${currentSolution.openedLanes}`);
    } finally {
      solver.delete();
    }
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
  }
}

runButton?.addEventListener('click', () => {
  void solveNetworkDesign();
});

clearSolutionButton?.addEventListener('click', clearSolution);

demandList?.addEventListener('pointerenter', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest<HTMLElement>('[data-demand-index]');
  if (!card) return;
  activeDemand = Number(card.getAttribute('data-demand-index'));
  activeArc = null;
  renderAll();
}, true);

demandList?.addEventListener('pointerleave', () => {
  activeDemand = null;
  renderAll();
});

laneList?.addEventListener('pointerenter', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest<HTMLElement>('[data-arc-index]');
  if (!card) return;
  activeArc = Number(card.getAttribute('data-arc-index'));
  activeDemand = null;
  renderAll();
}, true);

laneList?.addEventListener('pointerleave', () => {
  activeArc = null;
  renderAll();
});

svg?.addEventListener('pointermove', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const demandPath = target.closest<SVGElement>('[data-demand-index]');
  const arcPath = target.closest<SVGElement>('[data-arc-index]');
  const nextDemand = demandPath ? Number(demandPath.getAttribute('data-demand-index')) : null;
  const nextArc = arcPath ? Number(arcPath.getAttribute('data-arc-index')) : null;
  if (nextDemand === activeDemand && nextArc === activeArc) return;
  activeDemand = nextDemand;
  activeArc = nextDemand === null ? nextArc : null;
  renderAll();
});

svg?.addEventListener('pointerleave', () => {
  activeDemand = null;
  activeArc = null;
  renderAll();
});

renderAll();
