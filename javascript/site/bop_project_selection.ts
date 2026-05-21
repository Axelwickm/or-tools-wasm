import { initMPSolver, isWorkerBridgeEnabled, MPSolver, type MPVariable } from 'or-tools-wasm/mp-solver';
import { appendStatus, configureWorkerBridge, formatNumber, setRunning } from './mp_solver_helpers.js';

type Project = {
  key: 'analytics' | 'dashboard' | 'alerts';
  label: string;
  value: number;
  budget: number;
};

const projects: Project[] = [
  { key: 'analytics', label: 'Analytics', value: 8, budget: 6 },
  { key: 'dashboard', label: 'Dashboard', value: 6, budget: 4 },
  { key: 'alerts', label: 'Alerts', value: 5, budget: 3 },
];

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

configureWorkerBridge(workerBridgeToggle);

async function runBopProjectSelection() {
  setRunning(runButton, true);
  if (statusEl) statusEl.textContent = '';
  try {
    appendStatus(statusEl, 'Initializing MPSolver runtime...');
    await initMPSolver();
    const solver = MPSolver.CreateSolver('BOP');
    if (!solver) throw new Error('BOP backend is unavailable in this build.');

    try {
      const variables = Object.fromEntries(projects.map((project) => [
        project.key,
        solver.BoolVar(project.key),
      ])) as Record<Project['key'], MPVariable>;

      const budget = solver.Constraint(-solver.infinity(), 9, 'budget');
      for (const project of projects) {
        budget.SetCoefficient(variables[project.key], project.budget);
      }

      const sharedTeam = solver.Constraint(-solver.infinity(), 1, 'shared_design_team');
      sharedTeam.SetCoefficient(variables.dashboard, 1);
      sharedTeam.SetCoefficient(variables.alerts, 1);

      const objective = solver.Objective();
      for (const project of projects) {
        objective.SetCoefficient(variables[project.key], project.value);
      }
      objective.SetMaximization();

      appendStatus(statusEl, `Solving with BOP, worker bridge=${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
      const status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);
      if (!solver.VerifySolution(1e-7, true)) throw new Error('solution verification failed');

      const selected = Object.fromEntries(projects.map((project) => [
        project.key,
        variables[project.key].solution_value() > 0.5,
      ])) as Record<Project['key'], boolean>;
      const totalBudget = projects.reduce((sum, project) => sum + (selected[project.key] ? project.budget : 0), 0);
      renderResult({
        objective: objective.Value(),
        selected,
        totalBudget,
        usedWorkerBridge: isWorkerBridgeEnabled(),
        wallTime: solver.WallTime(),
        nodes: solver.nodes(),
      });

      appendStatus(statusEl, `Objective: ${formatNumber(objective.Value())}`);
      for (const project of projects) {
        appendStatus(statusEl, `${project.key} = ${selected[project.key] ? 1 : 0}`);
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

function renderResult(result: {
  objective: number;
  selected: Record<Project['key'], boolean>;
  totalBudget: number;
  usedWorkerBridge: boolean;
  wallTime: number;
  nodes: number;
}) {
  if (!solutionOutput) return;
  const budgetPercent = Math.min(100, (result.totalBudget / 9) * 100);
  solutionOutput.innerHTML = `
    <table>
      <tbody>
        <tr><th>Status</th><td>OPTIMAL</td></tr>
        <tr><th>Worker bridge</th><td>${result.usedWorkerBridge ? 'enabled' : 'disabled'}</td></tr>
        <tr><th>Objective value</th><td>${formatNumber(result.objective)}</td></tr>
        <tr><th>Budget used</th><td>${result.totalBudget} / 9</td></tr>
        <tr><th>Wall time</th><td>${result.wallTime} ms</td></tr>
        <tr><th>Branch-and-bound nodes</th><td>${result.nodes}</td></tr>
      </tbody>
    </table>
    <div class="budget-meter" aria-label="Budget used"><span style="width: ${budgetPercent}%"></span></div>
    <div class="project-grid">
      ${projects.map((project) => `
        <div class="project-card ${result.selected[project.key] ? 'selected' : ''}">
          <strong>${project.label}</strong>
          <div>Selected: ${result.selected[project.key] ? 'yes' : 'no'}</div>
          <div>Value: ${project.value}</div>
          <div>Budget: ${project.budget}</div>
        </div>
      `).join('')}
    </div>
  `;
}

runButton?.addEventListener('click', () => {
  void runBopProjectSelection();
});
