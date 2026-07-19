import { initMPSolver, MPSolver, setExecutor, type MPVariable } from 'or-tools-wasm/mp-solver';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

type VariableKind = 'continuous' | 'integer';

export type SimpleMpConfig = {
  solverId: 'GLOP' | 'CLP' | 'GLPK_LP' | 'GLPK' | 'SAT' | 'SCIP' | 'CBC' | 'BOP' | 'KNAPSACK';
  variableKind: VariableKind;
  expectedObjective: number;
  workerCount?: number;
  solverThreads?: number;
};

type SimpleMpResult = {
  status: number | string;
  objective: number;
  x: number;
  y: number;
  variables: number;
  constraints: number;
  wallTime: number;
  iterations: number;
  nodes: number;
  executor: 'direct' | 'worker' | 'server';
  workerCount?: number;
  solverThreads?: number;
  solverThreadsAccepted?: boolean;
  activeSolverThreads?: number;
};

export function setRunning(button: HTMLButtonElement | null, running: boolean): void {
  if (!button) return;
  button.disabled = running;
  button.textContent = running ? 'Solving...' : button.dataset.idleLabel ?? 'Solve';
}

export function appendStatus(element: HTMLElement | null, message: string): void {
  if (!element) return;
  element.textContent += `${message}\n`;
}

export function configureMPSolverExecutor(selector: HTMLSelectElement | null): void {
  configureSolverExecutorSelector({ setExecutor }, selector);
}

export function currentMPSolverExecutor(): 'direct' | 'worker' | 'server' {
  const selector = document.getElementById('solver-executor') as HTMLSelectElement | null;
  return (selector?.value as 'direct' | 'worker' | 'server' | undefined) ?? 'worker';
}

export function configureSolverThreadsInput(input: HTMLInputElement | null, maxThreads = 8): void {
  if (!input) return;
  input.min = '1';
  input.max = String(Math.max(1, maxThreads));
  if (!input.value || input.disabled) {
    input.value = String(Math.max(1, Math.min(4, maxThreads)));
  }
  input.disabled = false;
}

export function getSelectedSolverThreads(input: HTMLInputElement | null, maxThreads = 8): number {
  const requested = Number.parseInt(input?.value ?? '1', 10) || 1;
  const threads = Math.min(Math.max(1, requested), Math.max(1, maxThreads));
  if (input) input.value = String(threads);
  return threads;
}

export function applySolverThreads(solver: MPSolver, threads: number): {
  requested: number;
  accepted: boolean;
  active: number;
} {
  const requested = Math.max(1, Math.trunc(threads));
  const accepted = solver.SetNumThreads(requested);
  return {
    requested,
    accepted,
    active: solver.GetNumThreads(),
  };
}

export async function solveSimpleMpProgram(config: SimpleMpConfig): Promise<SimpleMpResult> {
  await initMPSolver();

  const solver = MPSolver.CreateSolver(config.solverId);
  if (!solver) {
    throw new Error(`${config.solverId} is not available in this build.`);
  }

  try {
    const infinity = solver.infinity();
    const makeVariable = config.variableKind === 'integer'
      ? (name: string): MPVariable => solver.IntVar(0, 1, name)
      : (name: string): MPVariable => solver.NumVar(0, 1, name);

    const x = makeVariable('x');
    const y = makeVariable('y');

    const c0 = solver.Constraint(-infinity, 1, 'c0');
    c0.SetCoefficient(x, 1);
    c0.SetCoefficient(y, 1);

    const objective = solver.Objective();
    objective.SetCoefficient(x, 2);
    objective.SetCoefficient(y, 1);
    objective.SetMaximization();

    const solverThreads = config.solverThreads ?? config.workerCount;
    const threadConfig = solverThreads ? applySolverThreads(solver, solverThreads) : undefined;
    const workerCount = solverThreads && solverThreads > 1
      ? Math.floor(solverThreads)
      : undefined;
    let status: number | string = MPSolver.OPTIMAL;
    if (config.solverId === 'SAT') {
      const protoResult = await solver.SolveWithProto({
        solverSpecificParameters: workerCount ? `num_workers: ${workerCount}` : undefined,
      });
      if (!protoResult.loaded) {
        throw new Error('Solver returned a solution response that could not be loaded.');
      }
      status = protoResult.response.status ?? MPSolver.OPTIMAL;
    } else {
      status = await solver.Solve();
      if (status !== MPSolver.OPTIMAL) throw new Error(`expected OPTIMAL, got ${status}`);
    }
    const result = {
      status,
      objective: objective.Value(),
      x: x.solution_value(),
      y: y.solution_value(),
      variables: solver.NumVariables(),
      constraints: solver.NumConstraints(),
      wallTime: solver.WallTime(),
      iterations: solver.Iterations(),
      nodes: solver.nodes(),
      executor: currentMPSolverExecutor(),
      workerCount,
      solverThreads: threadConfig?.requested,
      solverThreadsAccepted: threadConfig?.accepted,
      activeSolverThreads: threadConfig?.active,
    };
    assertExpectedObjective(result, config.expectedObjective);
    return result;
  } finally {
    solver.delete();
  }
}

export function renderSimpleMpResult(element: HTMLElement | null, result: SimpleMpResult): void {
  if (!element) return;
  const status = result.status === MPSolver.OPTIMAL || result.status === 'MPSOLVER_OPTIMAL'
    ? 'OPTIMAL'
    : `status ${result.status}`;
  element.innerHTML = `
    <table>
      <tbody>
        <tr><th>Status</th><td>${status}</td></tr>
        <tr><th>Executor</th><td>${result.executor}</td></tr>
        ${result.solverThreads ? `<tr><th>Requested solver threads</th><td>${result.solverThreads}</td></tr>` : ''}
        ${result.solverThreads ? `<tr><th>Thread request accepted</th><td>${result.solverThreadsAccepted ? 'yes' : 'no'}</td></tr>` : ''}
        ${result.activeSolverThreads ? `<tr><th>Active solver threads</th><td>${result.activeSolverThreads}</td></tr>` : ''}
        <tr><th>Objective</th><td>${formatNumber(result.objective)}</td></tr>
        <tr><th>x</th><td>${formatNumber(result.x)}</td></tr>
        <tr><th>y</th><td>${formatNumber(result.y)}</td></tr>
        <tr><th>Variables</th><td>${result.variables}</td></tr>
        <tr><th>Constraints</th><td>${result.constraints}</td></tr>
        <tr><th>Wall time</th><td>${result.wallTime} ms</td></tr>
        <tr><th>Iterations</th><td>${result.iterations}</td></tr>
        <tr><th>Branch-and-bound nodes</th><td>${result.nodes}</td></tr>
      </tbody>
    </table>
  `;
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function assertExpectedObjective(result: SimpleMpResult, expectedObjective: number): void {
  if (Math.abs(result.objective - expectedObjective) > 1e-6) {
    throw new Error(`Expected objective ${expectedObjective}, got ${formatNumber(result.objective)}.`);
  }
}
