import { CpSat, initMPSolver, MPSolver, type MPVariable } from 'or-tools-wasm';

type VariableKind = 'continuous' | 'integer';

export type SimpleMpConfig = {
  solverId: 'GLOP' | 'CLP' | 'SAT';
  variableKind: VariableKind;
  expectedObjective: number;
  workerCount?: number;
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
  usedWorkerBridge: boolean;
  workerCount?: number;
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

export function configureWorkerBridge(toggle: HTMLInputElement | null): void {
  if (!toggle) return;
  toggle.checked = true;
  CpSat.setWorkerBridgeEnabled(true);
  toggle.addEventListener('change', () => {
    CpSat.setWorkerBridgeEnabled(toggle.checked);
  });
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

    const workerCount = config.workerCount && config.workerCount > 1
      ? Math.floor(config.workerCount)
      : undefined;
    const protoResult = await solver.SolveWithProto({
      solverSpecificParameters: config.solverId === 'SAT' && workerCount
        ? `num_workers: ${workerCount}`
        : undefined,
    });
    if (!protoResult.loaded) {
      throw new Error('Solver returned a solution response that could not be loaded.');
    }
    const result = {
      status: protoResult.response.status ?? MPSolver.OPTIMAL,
      objective: objective.Value(),
      x: x.solution_value(),
      y: y.solution_value(),
      variables: solver.NumVariables(),
      constraints: solver.NumConstraints(),
      wallTime: solver.WallTime(),
      iterations: solver.Iterations(),
      nodes: solver.nodes(),
      usedWorkerBridge: typeof CpSat.isWorkerBridgeEnabled === 'function'
        ? CpSat.isWorkerBridgeEnabled()
        : true,
      workerCount,
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
        <tr><th>Worker bridge</th><td>${result.usedWorkerBridge ? 'enabled' : 'disabled'}</td></tr>
        ${result.workerCount ? `<tr><th>Solver workers</th><td>${result.workerCount}</td></tr>` : ''}
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
