import { elements, regions } from './models/set_cover.js';
import { setControlAvailable } from './example_controls.js';
import {
  type ExecutorConfiguration,
  GreedySolutionGenerator,
  LazySteepestSearch,
  GuidedTabuSearch,
  SetCoverInvariant,
  SetCoverModel,
  SetCover,
  SetCoverMipStatus,
} from 'or-tools-wasm/set-cover';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { requiredElement } from './site_support.js';

const coverageMap = requiredElement('coverage-map', 'div');
const coverageLegend = requiredElement('coverage-legend', 'div');
const solutionOutput = requiredElement('solution-output', 'div');
const statusEl = requiredElement('status', 'pre');
const executorSelector = requiredElement('solver-executor', 'select');
const runButton = requiredElement('run', 'button');
const clearButton = requiredElement('clear', 'button');
const modelFormat = document.getElementById('model-format') as HTMLSelectElement | null;
const modelText = document.getElementById('model-text') as HTMLTextAreaElement | null;
const cftComparisonInput = document.getElementById('cft-comparison') as HTMLInputElement | null;
const mipComparisonInput = document.getElementById('mip-comparison') as HTMLInputElement | null;
const penaltyFactorInput = document.getElementById('penalty-factor') as HTMLInputElement | null;
const epsilonInput = document.getElementById('epsilon') as HTMLInputElement | null;
const tabuSizeInput = document.getElementById('tabu-size') as HTMLInputElement | null;
const searchMethod = document.getElementById('search-method') as HTMLSelectElement | null;
const using = (method: string) => searchMethod?.value === method;
let readSetCoverExecutor: () => ExecutorConfiguration = () => ({ type: 'worker' });

let selectedSubsets: number[] = [];
let coveredElements = new Set<number>();
let lastCost: number | null = null;
let lastUncovered = elements.length;
let hoveredRegionId: number | null = null;

function setRunning(running: boolean) {
  runButton.disabled = running;
  if (modelFormat) modelFormat.disabled = running;
  if (searchMethod) searchMethod.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Set Cover';
}

function appendStatus(message: string) {
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function buildModel() {
  const model = new SetCoverModel();
  for (const region of regions) {
    model.addEmptySubset(region.cost);
    for (const element of region.elements) {
      model.addElementToLastSubset(element);
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
      <div>Cost ${modelFormat?.value === 'fimi' ? 1 : region.cost}</div>
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
  statusEl.textContent = '';
}

function setHoveredRegion(regionId: number | null) {
  if (hoveredRegionId === regionId) return;
  hoveredRegionId = regionId;
  renderMap();
}

function renderSolution() {
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

type ModelTextFormat = 'orlibScp' | 'orlibRail' | 'fimi';
function exportModelText(model: SetCoverModel, format: ModelTextFormat): Promise<string> {
  return format === 'fimi'
    ? Promise.resolve(regions.map(region => region.elements.join(' ')).join('\n'))
    : model.exportText(format, { executor: readSetCoverExecutor() });
}

async function updateModelText() {
  const format = modelFormat?.value ?? 'builder';
  const preview = modelText?.closest('details');
  if (preview) {
    preview.hidden = format === 'builder';
    preview.open = format !== 'builder';
  }
  if (!modelText) return;
  modelText.value = '';
  runButton.disabled = format !== 'builder';
  if (format === 'builder') return;
  if (modelFormat) modelFormat.disabled = true;
  modelText.placeholder = 'Loading model text…';
  try {
    const text = await exportModelText(buildModel(), format as ModelTextFormat);
    modelText.value = text;
  } catch (error) {
    modelText.placeholder = 'Model text could not be loaded.';
    appendStatus(`Model export failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (modelFormat) modelFormat.disabled = false;
    runButton.disabled = false;
  }
}
modelFormat?.addEventListener('change', () => {
  clearSolution();
  void updateModelText();
});

async function runSetCover() {
  setRunning(true);
  statusEl.textContent = '';
  try {
    selectedSubsets = [];
    coveredElements = new Set();
    lastCost = null;
    renderMap();
    renderSolution();

    let model = buildModel();
    const format = (modelFormat?.value ?? 'builder');
    if (format !== 'builder') {
      const selectedFormat = format as ModelTextFormat;
      const text = await exportModelText(model, selectedFormat);
      if (modelText) modelText.value = text;
      model = await SetCoverModel.fromText(text, selectedFormat, { executor: readSetCoverExecutor() });
      appendStatus(`Imported ${model.numSubsets} regions from ${format}.`);
    } else if (modelText) modelText.value = '';
    if (modelFormat) {
      const costStats = await model.computeCostStats({ executor: readSetCoverExecutor() });
      appendStatus(`Subset costs: median ${costStats.median}, standard deviation ${costStats.stddev}, interquartile range ${costStats.iqr}.`);
    }
    const inv = new SetCoverInvariant(model);
    const greedy = new GreedySolutionGenerator(inv);

    appendStatus(`Solving with ${executorSelector.value} executor...`);
    const construction = await greedy.nextSolutionWithStats(undefined, { executor: readSetCoverExecutor() });
    if (construction.statistics) appendStatus(`Native greedy time: ${construction.statistics.runTimeSeconds.toFixed(6)} seconds.`);
    if (await inv.numUncoveredElements({ executor: readSetCoverExecutor() }) !== 0) {
      appendStatus('No solution found by the greedy heuristic.');
      return;
    }

    if (using('restart')) {
      const extra = inv.isSelected().findIndex(selected => !selected);
      if (extra >= 0) {
        const changes = await inv.updateSelection(extra, true, { executor: readSetCoverExecutor() });
        appendStatus(`Added ${regions[extra].name}. Newly removable regions: ${changes.newlyRemovableSubsets.join(', ') || 'none'}.`);
      }
      const focus = await inv.clearMostCoveredElements(1, { executor: readSetCoverExecutor() });
      appendStatus(`Native perturbation cleared ${focus.length} overcovered region.`);
      await greedy.nextSolution(undefined, { executor: readSetCoverExecutor() });
      appendStatus('Greedy reconstruction completed after perturbation.');
    }

    if (using('lazy')) {
      await new LazySteepestSearch(inv).nextSolution(undefined, { executor: readSetCoverExecutor() });
      appendStatus('Lazy steepest search removed redundant regions.');
    }

    if (using('guided')) {
      const search = new GuidedTabuSearch(inv);
      try {
        search.setPenaltyFactor(Number(penaltyFactorInput?.value ?? '0.3'));
        search.setEpsilon(Number(epsilonInput?.value ?? '0.000001'));
        search.setTabuListSize(Number(tabuSizeInput?.value ?? '17'));
        search.setMaxIterations(40);
        await search.initialize({ executor: readSetCoverExecutor() });
        for (let pass = 0; pass < 5; pass++) await search.nextSolution();
        appendStatus('Guided tabu search finished after five continued passes.');
        const statistics = await search.statistics();
        if (statistics) appendStatus(`Native guided search time: ${statistics.runTimeSeconds.toFixed(6)} seconds.`);
      } finally { await search.close(); }
    }

    await inv.compressTrace({ executor: readSetCoverExecutor() });
    appendStatus(`Selected region order: ${inv.trace().map(decision => regions[decision.subset()]?.name).join(', ')}.`);
    const state = await inv.inspect({ executor: readSetCoverExecutor() });
    selectedSubsets = state.selected.flatMap((selected, subset) => selected ? [subset] : []);
    coveredElements = new Set();
    for (const subsetIndex of selectedSubsets) {
      for (const element of regions[subsetIndex]?.elements ?? []) {
        coveredElements.add(element);
      }
    }
    if (modelFormat) {
      const bound = await model.computeLagrangianLowerBound(state.cost, { executor: readSetCoverExecutor() });
      appendStatus(`Native Lagrangian lower bound: ${bound.lowerBound.toFixed(3)}; cover cost: ${state.cost}.`);
    }
    if (mipComparisonInput?.checked) {
      const integer = await SetCover.solveMip(model, { executor: readSetCoverExecutor() });
      appendStatus(`Native MIP subproblem: ${SetCoverMipStatus[integer.subproblemStatus]}; cover ${integer.cover.hasSolution ? integer.cover.cost : 'incomplete'}.`);
      const relaxation = await SetCover.solveLpRelaxation(model, { executor: readSetCoverExecutor() });
      appendStatus(`Native LP subproblem: ${SetCoverMipStatus[relaxation.subproblemStatus]}; objective ${relaxation.objectiveValue ?? 'unavailable'}.`);
    }
    if (cftComparisonInput?.checked) {
      const initialSelectedSubsets = state.numUncoveredElements === 0 ? selectedSubsets : undefined;
      const cft = await SetCover.solveCft(model, { executor: readSetCoverExecutor(), initialSelectedSubsets });
      appendStatus(`Native CFT: cover ${cft.cover.hasSolution ? cft.cover.cost : 'incomplete'}; lower bound ${cft.dual.lowerBound.toFixed(3)}.${initialSelectedSubsets ? ' Seeded from the current cover.' : ''}`);
    }
    lastCost = state.cost;
    lastUncovered = state.numUncoveredElements;
    renderMap();
    renderSolution();
    appendStatus(`Done. Cost ${state.cost}.`);
  } catch (error) {
    const message = `Solve failed: ${error instanceof Error ? error.message : String(error)}`;
    appendStatus(message);
    solutionOutput.textContent = message;
  } finally {
    setRunning(false);
  }
}

runButton.addEventListener('click', () => void runSetCover());
function updateTuningControls() {
  for (const input of [penaltyFactorInput, epsilonInput, tabuSizeInput]) setControlAvailable(input, using('guided'));
}
searchMethod?.addEventListener('change', updateTuningControls);
updateTuningControls();
clearButton.addEventListener('click', clearSolution);
coverageMap.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const regionEl = target.closest<HTMLElement>('[data-region]');
  if (!regionEl) return;
  setHoveredRegion(Number(regionEl.dataset.region));
});
coverageMap.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && coverageMap.contains(relatedTarget)) return;
  setHoveredRegion(null);
});
coverageLegend.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const regionEl = target.closest<HTMLElement>('[data-region]');
  if (!regionEl) return;
  setHoveredRegion(Number(regionEl.dataset.region));
});
coverageLegend.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && coverageLegend.contains(relatedTarget)) return;
  setHoveredRegion(null);
});

renderMap();
renderSolution();
readSetCoverExecutor = configureSolverExecutorSelector(executorSelector);

void updateModelText();
