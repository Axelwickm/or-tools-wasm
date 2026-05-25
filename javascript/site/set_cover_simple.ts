import {
  GreedySolutionGenerator,
  initSetCover,
  isWorkerBridgeEnabled,
  SetCoverInvariant,
  SetCoverModel,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm/set-cover';

type ElementPoint = {
  id: number;
  x: number;
  y: number;
};

type CoverRegion = {
  id: number;
  name: string;
  cost: number;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  radius: string;
  elements: number[];
};

const elements: ElementPoint[] = [
  { id: 0, x: 12, y: 22 },
  { id: 1, x: 23, y: 16 },
  { id: 2, x: 35, y: 27 },
  { id: 3, x: 51, y: 18 },
  { id: 4, x: 68, y: 24 },
  { id: 5, x: 82, y: 18 },
  { id: 6, x: 18, y: 48 },
  { id: 7, x: 35, y: 54 },
  { id: 8, x: 50, y: 46 },
  { id: 9, x: 66, y: 54 },
  { id: 10, x: 83, y: 48 },
  { id: 11, x: 28, y: 78 },
  { id: 12, x: 52, y: 76 },
  { id: 13, x: 76, y: 78 },
];

const regions: CoverRegion[] = [
  {
    id: 0,
    name: 'Northwest route',
    cost: 5,
    color: '#0969da',
    x: 8,
    y: 12,
    width: 31,
    height: 46,
    rotation: 0,
    radius: '2rem 3rem 2.2rem 2.8rem',
    elements: [0, 1, 2, 6, 7],
  },
  {
    id: 1,
    name: 'North ridge',
    cost: 6,
    color: '#8250df',
    x: 31,
    y: 14,
    width: 41,
    height: 45,
    rotation: 0,
    radius: '2.6rem 2rem 3rem 2.1rem',
    elements: [2, 3, 4, 8, 9],
  },
  {
    id: 2,
    name: 'East loop',
    cost: 5,
    color: '#cf222e',
    x: 62,
    y: 14,
    width: 26,
    height: 69,
    rotation: 0,
    radius: '2rem 2.8rem 2.4rem 3rem',
    elements: [4, 5, 9, 10, 13],
  },
  {
    id: 3,
    name: 'Southwest sweep',
    cost: 4,
    color: '#1a7f37',
    x: 14,
    y: 44,
    width: 43,
    height: 39,
    rotation: 0,
    radius: '2.4rem 2rem 3rem 2.2rem',
    elements: [6, 7, 11, 12],
  },
  {
    id: 4,
    name: 'South belt',
    cost: 6,
    color: '#bf8700',
    x: 46,
    y: 42,
    width: 42,
    height: 41,
    rotation: 0,
    radius: '3rem 2rem 2.5rem 2.2rem',
    elements: [8, 9, 10, 12, 13],
  },
  {
    id: 5,
    name: 'Central express',
    cost: 7,
    color: '#d1248f',
    x: 19,
    y: 12,
    width: 52,
    height: 47,
    rotation: 0,
    radius: '2rem 3rem 2rem 3rem',
    elements: [1, 2, 3, 7, 8, 9],
  },
];

const coverageMap = document.getElementById('coverage-map');
const coverageLegend = document.getElementById('coverage-legend');
const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const clearButton = document.getElementById('clear') as HTMLButtonElement | null;

let selectedSubsets: number[] = [];
let coveredElements = new Set<number>();
let lastCost: number | null = null;
let lastUncovered = elements.length;
let hoveredRegionId: number | null = null;

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Set Cover';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function buildModel() {
  const model = new SetCoverModel();
  for (const region of regions) {
    model.add_empty_subset(region.cost);
    for (const element of region.elements) {
      model.add_element_to_last_subset(element);
    }
  }
  return model;
}

function parseHexColor(color: string) {
  const value = color.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function averagedColorForElement(elementId: number, selected: Set<number>) {
  const coveringRegions = regions.filter((region) => selected.has(region.id) && region.elements.includes(elementId));
  if (coveringRegions.length === 0) return '#1a7f37';
  const total = coveringRegions.reduce(
    (sum, region) => {
      const color = parseHexColor(region.color);
      return {
        r: sum.r + color.r,
        g: sum.g + color.g,
        b: sum.b + color.b,
      };
    },
    { r: 0, g: 0, b: 0 },
  );
  const toHex = (value: number) => Math.round(value / coveringRegions.length).toString(16).padStart(2, '0');
  return `#${toHex(total.r)}${toHex(total.g)}${toHex(total.b)}`;
}

function renderMap() {
  if (!coverageMap || !coverageLegend) return;
  const selected = new Set(selectedSubsets);
  const hasSolution = lastCost !== null;
  const hoveredRegion = hoveredRegionId === null ? null : regions[hoveredRegionId] ?? null;
  const hoveredElements = new Set(hoveredRegion?.elements ?? []);
  coverageMap.innerHTML = `
    ${regions.map((region) => `
      <div
        class="coverage-region${selected.has(region.id) ? ' selected-region' : ''}${hasSolution && !selected.has(region.id) ? ' dimmed-region' : ''}${hoveredRegionId === region.id ? ' hovered-region' : ''}"
        data-region="${region.id}"
        style="--x: ${region.x}%; --y: ${region.y}%; --w: ${region.width}%; --h: ${region.height}%; --rotation: ${region.rotation}deg; --radius: ${region.radius}; --color: ${region.color};"
      >
        <span class="coverage-region-label">${region.id}</span>
      </div>
    `).join('')}
    ${elements.map((element) => {
      const stateClass = lastCost === null ? '' : coveredElements.has(element.id) ? ' covered' : ' missing';
      const hoverClass = hoveredElements.has(element.id) ? ' hovered-point' : '';
      const coverColor = coveredElements.has(element.id) ? averagedColorForElement(element.id, selected) : '#1a7f37';
      return `
        <span class="coverage-point${stateClass}${hoverClass}" style="--x: ${element.x}%; --y: ${element.y}%; --cover-color: ${coverColor}; --hover-color: ${hoveredRegion?.color ?? '#8250df'};">
          ${element.id}
        </span>
      `;
    }).join('')}
  `;
  coverageLegend.innerHTML = regions.map((region) => `
    <div
      class="legend-row${selected.has(region.id) ? ' selected-region' : ''}${hasSolution && !selected.has(region.id) ? ' dimmed-region' : ''}${hoveredRegionId === region.id ? ' hovered-region' : ''}"
      data-region="${region.id}"
      style="--color: ${region.color};"
    >
      <div class="legend-title">${region.id}. ${region.name}</div>
      <div>Cost ${region.cost}</div>
      <div class="legend-elements">Elements ${region.elements.join(', ')}</div>
    </div>
  `).join('');
}

function clearSolution() {
  selectedSubsets = [];
  coveredElements = new Set();
  lastCost = null;
  lastUncovered = elements.length;
  renderMap();
  renderSolution();
  if (statusEl) statusEl.textContent = '';
}

function setHoveredRegion(regionId: number | null) {
  if (hoveredRegionId === regionId) return;
  hoveredRegionId = regionId;
  renderMap();
}

function renderSolution() {
  if (!solutionOutput) return;
  if (lastCost === null) {
    solutionOutput.textContent = 'Run the solver to view the solution.';
    return;
  }
  solutionOutput.innerHTML = `
    <div class="summary-value">${lastCost}</div>
    <div><strong>Chosen regions:</strong> ${selectedSubsets.join(', ') || 'none'}</div>
    <div><strong>Covered elements:</strong> ${Array.from(coveredElements).sort((a, b) => a - b).join(', ') || 'none'}</div>
    <div><strong>Uncovered count:</strong> ${lastUncovered}</div>
  `;
}

async function runSetCover() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    selectedSubsets = [];
    coveredElements = new Set();
    lastCost = null;
    renderMap();
    renderSolution();

    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus('Initializing Set Cover runtime...');
    await initSetCover();

    const model = buildModel();
    const inv = new SetCoverInvariant(model);
    const greedy = new GreedySolutionGenerator(inv);

    appendStatus(`Solving with worker bridge ${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
    const hasFound = await greedy.next_solution();
    if (!hasFound) {
      appendStatus('No solution found by the greedy heuristic.');
      return;
    }

    const solution = inv.export_solution_as_proto();
    selectedSubsets = solution.subset;
    coveredElements = new Set();
    for (const subsetIndex of selectedSubsets) {
      for (const element of regions[subsetIndex]?.elements ?? []) {
        coveredElements.add(element);
      }
    }
    lastCost = solution.cost;
    lastUncovered = inv.num_uncovered_elements();
    renderMap();
    renderSolution();
    appendStatus(`Done. Cost ${inv.cost()}.`);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runSetCover());
clearButton?.addEventListener('click', clearSolution);
coverageMap?.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const regionEl = target.closest<HTMLElement>('[data-region]');
  if (!regionEl) return;
  setHoveredRegion(Number(regionEl.dataset.region));
});
coverageMap?.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && coverageMap.contains(relatedTarget)) return;
  setHoveredRegion(null);
});
coverageLegend?.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const regionEl = target.closest<HTMLElement>('[data-region]');
  if (!regionEl) return;
  setHoveredRegion(Number(regionEl.dataset.region));
});
coverageLegend?.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && coverageLegend.contains(relatedTarget)) return;
  setHoveredRegion(null);
});

renderMap();
renderSolution();
