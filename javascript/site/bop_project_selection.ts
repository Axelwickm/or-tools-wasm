import { initMPSolver, MPSolver, type MPVariable } from 'or-tools-wasm/mp-solver';
import {
  appendStatus,
  applySolverThreads,
  configureSolverThreadsInput,
  configureMPSolverExecutor,
  currentMPSolverExecutor,
  formatNumber,
  getSelectedSolverThreads,
  setRunning,
} from './mp_solver_helpers.js';
import { getMaxWorkerCount } from './worker_limits.js';

type Project = {
  key: string;
  label: string;
  category: string;
  value: number;
  budget: number;
  engineering: number;
  design: number;
};

type Capacity = {
  budget: number;
  engineering: number;
  design: number;
};

const projects: Project[] = [
  { key: 'analytics', label: 'Analytics Core', category: 'Data', value: 82, budget: 36, engineering: 28, design: 8 },
  { key: 'mobile', label: 'Mobile Refresh', category: 'Growth', value: 76, budget: 30, engineering: 18, design: 24 },
  { key: 'alerts', label: 'Alerting', category: 'Ops', value: 58, budget: 18, engineering: 16, design: 6 },
  { key: 'billing', label: 'Billing Upgrade', category: 'Revenue', value: 91, budget: 42, engineering: 34, design: 10 },
  { key: 'search', label: 'Search Tuning', category: 'Product', value: 64, budget: 24, engineering: 22, design: 8 },
  { key: 'onboarding', label: 'Onboarding Flow', category: 'Growth', value: 69, budget: 22, engineering: 12, design: 22 },
  { key: 'security', label: 'Security Hardening', category: 'Risk', value: 72, budget: 28, engineering: 30, design: 4 },
  { key: 'exports', label: 'Bulk Exports', category: 'Data', value: 47, budget: 16, engineering: 14, design: 5 },
];

let capacities: Capacity = { budget: 105, engineering: 92, design: 48 };
let manualSelection = new Set<string>(['analytics', 'alerts', 'onboarding']);
let optimalSelection = new Set<string>();
let hoveredProject: string | null = null;

const appEl = document.getElementById('portfolio-app');
const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const maxWorkerCount = getMaxWorkerCount();

configureMPSolverExecutor(executorSelector);
configureSolverThreadsInput(workerInput, maxWorkerCount);

function selectionTotals(selection: Set<string>) {
  return projects.reduce((totals, project) => {
    if (!selection.has(project.key)) return totals;
    totals.value += project.value;
    totals.budget += project.budget;
    totals.engineering += project.engineering;
    totals.design += project.design;
    return totals;
  }, { value: 0, budget: 0, engineering: 0, design: 0 });
}

function isFeasible(totals: ReturnType<typeof selectionTotals>) {
  return totals.budget <= capacities.budget &&
    totals.engineering <= capacities.engineering &&
    totals.design <= capacities.design;
}

function valueDensity(project: Project) {
  return project.value / Math.max(1, project.budget + project.engineering + project.design);
}

function updateProject(key: string, field: keyof Pick<Project, 'value' | 'budget' | 'engineering' | 'design'>, value: number) {
  const project = projects.find((candidate) => candidate.key === key);
  if (!project) return;
  project[field] = Math.max(0, value);
  optimalSelection = new Set();
  render();
}

function updateCapacity(field: keyof Capacity, value: number) {
  capacities = { ...capacities, [field]: Math.max(1, value) };
  optimalSelection = new Set();
  render();
}

function toggleManualSelection(key: string) {
  const next = new Set(manualSelection);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  manualSelection = next;
  render();
}

function meter(label: string, used: number, capacity: number) {
  const over = used > capacity;
  const pct = Math.min(100, (used / Math.max(1, capacity)) * 100);
  return `
    <div class="portfolio-meter ${over ? 'over' : ''}">
      <div class="meter-row"><span>${label}</span><strong>${used} / ${capacity}</strong></div>
      <div class="meter-track"><span style="width: ${pct}%"></span></div>
    </div>
  `;
}

function renderScatter(selection: Set<string>) {
  const maxBudget = Math.max(...projects.map((project) => project.budget), 1);
  const maxValue = Math.max(...projects.map((project) => project.value), 1);
  const maxTeam = Math.max(...projects.map((project) => project.engineering + project.design), 1);
  const points = projects.map((project) => {
    const x = 70 + (project.budget / maxBudget) * 650;
    const y = 330 - (project.value / maxValue) * 260;
    const radius = 8 + ((project.engineering + project.design) / maxTeam) * 15;
    const selected = selection.has(project.key);
    const optimal = optimalSelection.has(project.key);
    const hovered = hoveredProject === project.key;
    return `
      <g class="scatter-point ${selected ? 'manual' : ''} ${optimal ? 'optimal' : ''} ${hovered ? 'hovered' : ''}" data-project="${project.key}">
        <title>${project.label}: value ${project.value}, budget ${project.budget}, team ${project.engineering + project.design}</title>
        <circle cx="${x}" cy="${y}" r="${radius}"></circle>
        <text x="${x}" y="${y + 4}" text-anchor="middle">${project.label.slice(0, 2)}</text>
      </g>
    `;
  }).join('');

  return `
    <svg class="portfolio-scatter" viewBox="0 0 760 380" role="img" aria-label="Project value versus budget">
      <line x1="64" y1="335" x2="730" y2="335"></line>
      <line x1="64" y1="335" x2="64" y2="54"></line>
      <text x="386" y="368" text-anchor="middle">Budget required</text>
      <text x="18" y="190" transform="rotate(-90 18 190)" text-anchor="middle">Value</text>
      <text x="70" y="36">Bubble size = team load</text>
      ${points}
    </svg>
  `;
}

function renderProjectCard(project: Project, selection: Set<string>) {
  const manuallySelected = manualSelection.has(project.key);
  const optimal = optimalSelection.has(project.key);
  const hovered = hoveredProject === project.key;
  return `
    <article class="portfolio-project ${manuallySelected ? 'manual' : ''} ${optimal ? 'optimal' : ''} ${hovered ? 'hovered' : ''}" data-project="${project.key}">
      <button class="project-select" type="button" data-toggle="${project.key}" aria-pressed="${manuallySelected}">
        ${manuallySelected ? 'Selected' : 'Select'}
      </button>
      <div>
        <strong>${project.label}</strong>
        <span>${project.category}</span>
      </div>
      <div class="project-fields">
        <label>Value <input type="number" min="0" data-project="${project.key}" data-field="value" value="${project.value}"></label>
        <label>Budget <input type="number" min="0" data-project="${project.key}" data-field="budget" value="${project.budget}"></label>
        <label>Eng <input type="number" min="0" data-project="${project.key}" data-field="engineering" value="${project.engineering}"></label>
        <label>Design <input type="number" min="0" data-project="${project.key}" data-field="design" value="${project.design}"></label>
      </div>
      <div class="project-density">Value density ${formatNumber(valueDensity(project))}</div>
      <div class="project-state">${optimal ? 'Chosen by solver' : selection.has(project.key) ? 'In manual draft' : 'Available'}</div>
    </article>
  `;
}

function render() {
  if (!appEl || !solutionOutput) return;
  const manualTotals = selectionTotals(manualSelection);
  const optimalTotals = selectionTotals(optimalSelection);
  const activeSelection = optimalSelection.size ? optimalSelection : manualSelection;
  const activeTotals = optimalSelection.size ? optimalTotals : manualTotals;
  const feasible = isFeasible(activeTotals);

  appEl.innerHTML = `
    <section class="portfolio-layout">
      <div class="portfolio-main">
        <div class="portfolio-board">
          <div class="portfolio-header">
            <div>
              <h2>Project slate</h2>
              <p>Toggle a manual draft, edit the numbers, then solve for the best binary portfolio.</p>
            </div>
            <div class="portfolio-status ${feasible ? 'ok' : 'bad'}">${feasible ? 'Feasible' : 'Over capacity'}</div>
          </div>
          <div class="project-grid">
            ${projects.map((project) => renderProjectCard(project, activeSelection)).join('')}
          </div>
        </div>
        <div class="portfolio-map">
          ${renderScatter(activeSelection)}
        </div>
      </div>
      <aside class="portfolio-side">
        <div class="capacity-editor">
          <h2>Capacity</h2>
          <label>Budget <input type="number" min="1" data-capacity="budget" value="${capacities.budget}"></label>
          <label>Engineering <input type="number" min="1" data-capacity="engineering" value="${capacities.engineering}"></label>
          <label>Design <input type="number" min="1" data-capacity="design" value="${capacities.design}"></label>
        </div>
        <div class="portfolio-meters">
          <h2>${optimalSelection.size ? 'Solved portfolio' : 'Manual draft'}</h2>
          ${meter('Budget', activeTotals.budget, capacities.budget)}
          ${meter('Engineering', activeTotals.engineering, capacities.engineering)}
          ${meter('Design', activeTotals.design, capacities.design)}
          <div class="portfolio-value">
            <span>Total value</span>
            <strong>${activeTotals.value}</strong>
          </div>
        </div>
      </aside>
    </section>
  `;

  if (!optimalSelection.size) {
    solutionOutput.textContent = 'Solve the BOP model to replace the manual draft with the optimal binary project set.';
  }
}

function renderResult(result: {
  objective: number;
  selected: Set<string>;
  executor: 'direct' | 'worker' | 'server';
  solverThreads: number;
  solverThreadsAccepted: boolean;
  activeSolverThreads: number;
  wallTime: number;
  nodes: number;
}) {
  if (!solutionOutput) return;
  const totals = selectionTotals(result.selected);
  solutionOutput.innerHTML = `
    <table>
      <tbody>
        <tr><th>Status</th><td>OPTIMAL</td></tr>
        <tr><th>Executor</th><td>${result.executor}</td></tr>
        <tr><th>Requested solver threads</th><td>${result.solverThreads}</td></tr>
        <tr><th>Thread request accepted</th><td>${result.solverThreadsAccepted ? 'yes' : 'no'}</td></tr>
        <tr><th>Active solver threads</th><td>${result.activeSolverThreads}</td></tr>
        <tr><th>Objective value</th><td>${formatNumber(result.objective)}</td></tr>
        <tr><th>Chosen projects</th><td>${projects.filter((project) => result.selected.has(project.key)).map((project) => project.label).join(', ')}</td></tr>
        <tr><th>Budget used</th><td>${totals.budget} / ${capacities.budget}</td></tr>
        <tr><th>Engineering used</th><td>${totals.engineering} / ${capacities.engineering}</td></tr>
        <tr><th>Design used</th><td>${totals.design} / ${capacities.design}</td></tr>
        <tr><th>Wall time</th><td>${result.wallTime} ms</td></tr>
        <tr><th>Branch-and-bound nodes</th><td>${result.nodes}</td></tr>
      </tbody>
    </table>
  `;
}

async function runBopProjectSelection() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    await initMPSolver();
    const solver = MPSolver.CreateSolver('BOP');
    if (!solver) throw new Error('BOP backend is unavailable in this build.');

    try {
      const solverThreads = getSelectedSolverThreads(workerInput, maxWorkerCount);
      const threadConfig = applySolverThreads(solver, solverThreads);
      const variables = Object.fromEntries(projects.map((project) => [
        project.key,
        solver.BoolVar(project.key),
      ])) as Record<string, MPVariable>;

      const budget = solver.Constraint(-solver.infinity(), capacities.budget, 'budget');
      const engineering = solver.Constraint(-solver.infinity(), capacities.engineering, 'engineering_team');
      const design = solver.Constraint(-solver.infinity(), capacities.design, 'design_team');
      for (const project of projects) {
        budget.SetCoefficient(variables[project.key], project.budget);
        engineering.SetCoefficient(variables[project.key], project.engineering);
        design.SetCoefficient(variables[project.key], project.design);
      }

      const objective = solver.Objective();
      for (const project of projects) {
        objective.SetCoefficient(variables[project.key], project.value);
      }
      objective.SetMaximization();

      appendStatus(statusEl, `Solving with BOP via ${currentMPSolverExecutor()}, requested solver threads=${solverThreads}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);
      if (!solver.VerifySolution(1e-7, true)) throw new Error('solution verification failed');

      optimalSelection = new Set(projects
        .filter((project) => variables[project.key].solution_value() > 0.5)
        .map((project) => project.key));

      render();
      renderResult({
        objective: objective.Value(),
        selected: optimalSelection,
        executor: currentMPSolverExecutor(),
        solverThreads: threadConfig.requested,
        solverThreadsAccepted: threadConfig.accepted,
        activeSolverThreads: threadConfig.active,
        wallTime: solver.WallTime(),
        nodes: solver.nodes(),
      });

      appendStatus(statusEl, `Objective: ${formatNumber(objective.Value())}`);
      for (const project of projects) {
        appendStatus(statusEl, `${project.key} = ${optimalSelection.has(project.key) ? 1 : 0}`);
      }
    } finally {
      solver.delete();
    }
  } catch (error) {
    appendStatus(statusEl, `Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(runButton, false);
  }
}

appEl?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const toggle = target.closest<HTMLButtonElement>('[data-toggle]');
  if (!toggle?.dataset.toggle) return;
  optimalSelection = new Set();
  toggleManualSelection(toggle.dataset.toggle);
});

appEl?.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement;
  if (target.dataset.capacity) {
    updateCapacity(target.dataset.capacity as keyof Capacity, Number.parseInt(target.value, 10) || 1);
    return;
  }
  if (target.dataset.project && target.dataset.field) {
    updateProject(
      target.dataset.project,
      target.dataset.field as keyof Pick<Project, 'value' | 'budget' | 'engineering' | 'design'>,
      Number.parseInt(target.value, 10) || 0,
    );
  }
});

appEl?.addEventListener('mouseover', (event) => {
  const target = event.target as HTMLElement;
  const projectEl = target.closest<HTMLElement>('[data-project]');
  if (!projectEl?.dataset.project || hoveredProject === projectEl.dataset.project) return;
  hoveredProject = projectEl.dataset.project;
  render();
});

appEl?.addEventListener('mouseleave', () => {
  if (hoveredProject === null) return;
  hoveredProject = null;
  render();
});

runButton?.addEventListener('click', () => {
  void runBopProjectSelection();
});

render();
