import type { ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  serverExecutorConfiguration,
} from '../../../harness/shared_case.ts';

type MPSolverExecutor = Exclude<ExecutorFixtureMode, 'server'>
  | ReturnType<typeof serverExecutorConfiguration>;

export type MpSolverCaseResult = {
  id?: string;
  name: string;
  solver?: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: ExecutorFixtureMode;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status: number;
  objective: number;
  values: Record<string, number>;
};

function mpSolverCaseId(name: string): string {
  return `mp_solver.${name
    .replace(/^MPSolver:\s*/, '')
    .replaceAll(/[().:,/-]+/g, '_')
    .replaceAll(/\s+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .toLowerCase()}`;
}

function decorateMpSolverResult(result: MpSolverCaseResult): MpSolverCaseResult {
  return {
    id: result.id ?? mpSolverCaseId(result.name),
    solver: result.solver ?? 'mp-solver',
    source: result.source,
    upstream: result.upstream ?? result.name.replace(/^MPSolver:\s*/, ''),
    tags: result.tags ?? ['python-parity'],
    ...result,
  };
}

type MPVariableLike = {
  lowerBound(): number;
  upperBound(): number;
  isInteger(): boolean;
  setBounds(lb: number, ub: number): void;
  setLowerBound(lb: number): void;
  setUpperBound(ub: number): void;
  reducedCost(): number;
  index(): number;
  name(): string;
  solutionValue(): number;
  unroundedSolutionValue(): number;
  basisStatus(): number;
  branchingPriority(): number;
  setBranchingPriority(priority: number): void;
};

type MPConstraintLike = {
  clear(): void;
  setCoefficient(variable: MPVariableLike, coefficient: number): void;
  getCoefficient(variable: MPVariableLike): number;
  lowerBound(): number;
  upperBound(): number;
  setBounds(lb: number, ub: number): void;
  setLowerBound(lb: number): void;
  setUpperBound(ub: number): void;
  dualValue(): number;
  index(): number;
  name(): string;
  basisStatus(): number;
  isLazy(): boolean;
  setIsLazy(laziness: boolean): void;
};

type MPObjectiveLike = {
  clear(): void;
  setCoefficient(variable: MPVariableLike, coefficient: number): void;
  getCoefficient(variable: MPVariableLike): number;
  setOffset(offset: number): void;
  addOffset(offset: number): void;
  offset(): number;
  setMinimization(): void;
  setMaximization(): void;
  setOptimizationDirection(maximize: boolean): void;
  value(): number;
  bestBound(): number;
  isMaximization(): boolean;
  isMinimization(): boolean;
};

type MPSolverParametersLike = {
  setDoubleParam(param: number, value: number): void;
  getDoubleParam(param: number): number;
  resetDoubleParam(param: number): void;
  setIntegerParam(param: number, value: number): void;
  getIntegerParam(param: number): number;
  resetIntegerParam(param: number): void;
  reset(): void;
};

type MPSolverLike = {
  name(): string;
  isMip(): boolean;
  clear(): void;
  infinity(): number;
  variable(index: number): MPVariableLike;
  variables(): MPVariableLike[];
  lookupVariable(name: string): MPVariableLike | null;
  addVariable(lb: number, ub: number, integer: boolean, name: string): MPVariableLike;
  addNumVariable(lb: number, ub: number, name: string): MPVariableLike;
  addIntVariable(lb: number, ub: number, name: string): MPVariableLike;
  addBoolVariable(name: string): MPVariableLike;
  constraint(index: number): MPConstraintLike;
  constraints(): MPConstraintLike[];
  lookupConstraint(name: string): MPConstraintLike | null;
  addConstraint(): MPConstraintLike;
  addConstraint(name: string): MPConstraintLike;
  addConstraint(lb: number, ub: number, name?: string): MPConstraintLike;
  objective(): MPObjectiveLike;
  solve(options?: {
    parameters?: MPSolverParametersLike;
    executor?: MPSolverExecutor;
  }): Promise<number>;
  solveWithProto(options?: {
    executor?: MPSolverExecutor;
    solverSpecificParameters?: string;
    loadSolution?: boolean;
  }): Promise<{
    response: Record<string, unknown>;
    loaded: boolean;
  }>;
  loadSolutionFromProto?(response?: Uint8Array | Record<string, unknown>, tolerance?: number): Promise<boolean>;
  verifySolution(tolerance: number, logErrors: boolean): boolean;
  enableOutput(): void;
  suppressOutput(): void;
  outputIsEnabled(): boolean;
  setTimeLimit(milliseconds: number): void;
  timeLimit(): number;
  setNumThreads(numThreads: number): boolean;
  getNumThreads(): number;
  solverVersion(): string;
  computeConstraintActivities(): number[];
  computeExactConditionNumber(): number;
  setHint(variables: MPVariableLike[], values: number[]): void;
  nextSolution(): boolean;
  exportModelAsLpFormat(obfuscate: boolean): string;
  exportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean): string;
  numVariables(): number;
  numConstraints(): number;
  wallTime(): number;
  iterations(): number;
  nodes(): number;
};

export type MPSolverApi = {
  MPSolver: {
    new(name: string, problemType: number): MPSolverLike;
    GLOP_LINEAR_PROGRAMMING: number;
    CLP_LINEAR_PROGRAMMING: number;
    GLPK_LINEAR_PROGRAMMING: number;
    GLPK_MIXED_INTEGER_PROGRAMMING: number;
    SCIP_MIXED_INTEGER_PROGRAMMING: number;
    CBC_MIXED_INTEGER_PROGRAMMING: number;
    BOP_INTEGER_PROGRAMMING: number;
    KNAPSACK_MIXED_INTEGER_PROGRAMMING: number;
    SAT_INTEGER_PROGRAMMING: number;
    OPTIMAL: number;
    INFEASIBLE: number;
    BASIC: number;
    AT_LOWER_BOUND: number;
    supportsProblemType(problemType: number): boolean;
    parseSolverType(solverId: string): number | null;
    parseAndCheckSupportForProblemType(solverId: string): number | null;
    createSolver(solverId: string): MPSolverLike | null;
    createModelRequest(request: Record<string, unknown>): Promise<Uint8Array>;
    solveModelRequest(
      request: Uint8Array | Record<string, unknown>,
      options?: {
        executor?: MPSolverExecutor;
      },
    ): Promise<{
      bytes: Uint8Array;
      response: Record<string, unknown>;
    }>;
  };
  MPSolverParameters: {
    new(): MPSolverParametersLike;
    RELATIVE_MIP_GAP: number;
    PRIMAL_TOLERANCE: number;
    DUAL_TOLERANCE: number;
    PRESOLVE: number;
    LP_ALGORITHM: number;
    INCREMENTALITY: number;
    SCALING: number;
    PRESOLVE_OFF: number;
    PRESOLVE_ON: number;
    DUAL: number;
    PRIMAL: number;
    BARRIER: number;
    INCREMENTALITY_OFF: number;
    INCREMENTALITY_ON: number;
    SCALING_OFF: number;
    SCALING_ON: number;
  };
};

export type MPSolverRunOptions = {
  modes?: readonly ExecutorFixtureMode[];
  onProgress?: (caseName: string, context?: Record<string, unknown>) => void;
};

let mpSolverMode: ExecutorFixtureMode = 'direct';

function setMPSolverMode(_api: MPSolverApi, mode: ExecutorFixtureMode) {
  mpSolverMode = mode;
}

function mpSolverExecutionOptions() {
  return {
    executor: mpSolverMode === 'server'
      ? serverExecutorConfiguration()
      : mpSolverMode,
  };
}

type LpBackend = {
  solverId: 'GLOP' | 'CLP' | 'GLPK_LP';
  problemType: number;
  supportsExactConditionNumber: boolean;
  x3ReducedCost: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function near(actual: number, expected: number, tolerance = 1e-7) {
  return Math.abs(actual - expected) <= tolerance;
}

function lpBackends(api: MPSolverApi): LpBackend[] {
  const results: LpBackend[] = [
    {
      solverId: 'GLOP',
      problemType: api.MPSolver.GLOP_LINEAR_PROGRAMMING,
      supportsExactConditionNumber: false,
      x3ReducedCost: -2.666666666666667,
    },
    {
      solverId: 'CLP',
      problemType: api.MPSolver.CLP_LINEAR_PROGRAMMING,
      supportsExactConditionNumber: false,
      x3ReducedCost: -2.666666666666667,
    },
    {
      solverId: 'GLPK_LP',
      problemType: api.MPSolver.GLPK_LINEAR_PROGRAMMING,
      supportsExactConditionNumber: true,
      x3ReducedCost: -2.666666666666667,
    },
  ];
  return results;
}

function createSolver(api: MPSolverApi, solverId: string, name: string): MPSolverLike {
  const solver = api.MPSolver.createSolver(solverId);
  assert(solver !== null, `${name}: createSolver(${solverId}) failed`);
  return solver;
}

function skipped(name: string, reason: string): MpSolverCaseResult {
  return { name, ok: true, skipped: true, reason, status: -1, objective: 0, values: {} };
}

async function runSimpleProgram(
  api: MPSolverApi,
  name: string,
  solverId: string,
  createX: (solver: MPSolverLike, infinity: number) => MPVariableLike,
  createY: (solver: MPSolverLike, infinity: number) => MPVariableLike,
  expected: { objective: number; x: number; y: number },
  numThreads = 1,
): Promise<MpSolverCaseResult> {
  const solver = createSolver(api, solverId, name);
  {
    if (numThreads > 1) {
      assert(solver.setNumThreads(numThreads), `${name}: setNumThreads(${numThreads}) failed`);
      assert(solver.getNumThreads() === numThreads, `${name}: expected ${numThreads} configured threads`);
    }
    const infinity = solver.infinity();
    const x = createX(solver, infinity);
    const y = createY(solver, infinity);
    assert(solver.numVariables() === 2, `${name}: expected 2 variables`);

    const c0 = solver.addConstraint(-infinity, 17.5, 'c0');
    c0.setCoefficient(x, 1);
    c0.setCoefficient(y, 7);

    const c1 = solver.addConstraint(-infinity, 3.5, 'c1');
    c1.setCoefficient(x, 1);
    c1.setCoefficient(y, 0);
    assert(solver.numConstraints() === 2, `${name}: expected 2 constraints`);

    const objective = solver.objective();
    objective.setCoefficient(x, 1);
    objective.setCoefficient(y, 10);
    objective.setMaximization();

    const status = await solver.solve(mpSolverExecutionOptions());
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    const values = {
      x: x.solutionValue(),
      y: y.solutionValue(),
    };
    assert(near(objective.value(), expected.objective), `${name}: objective mismatch ${objective.value()}`);
    assert(near(values.x, expected.x), `${name}: x mismatch ${values.x}`);
    assert(near(values.y, expected.y), `${name}: y mismatch ${values.y}`);
    return {
      name,
      ok: true,
      status,
      objective: objective.value(),
      values,
    };
  }
}

async function runSimpleProgramBridgeMatrix(
  api: MPSolverApi,
  mode: ExecutorFixtureMode,
  name: string,
  solverId: string,
  createX: (solver: MPSolverLike, infinity: number) => MPVariableLike,
  createY: (solver: MPSolverLike, infinity: number) => MPVariableLike,
  expected: { objective: number; x: number; y: number },
): Promise<MpSolverCaseResult[]> {
  return [await runSimpleProgram(
    api,
    `${name} (${mode})`,
    solverId,
    createX,
    createY,
    expected,
  )];
}

async function runMixedIntegerCppStyleCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  return runMixedIntegerCppStyleBackendCase(api, 'SAT', 'MPSolver: lp_test.py RunMixedIntegerExampleCppStyleAPI');
}

async function runMixedIntegerCppStyleBackendCase(
  api: MPSolverApi,
  solverId: 'SAT' | 'GLPK' | 'SCIP' | 'CBC',
  name: string,
): Promise<MpSolverCaseResult> {
  const solver = createSolver(api, solverId, name);
  {
    const infinity = solver.infinity();
    const x1 = solver.addIntVariable(0.0, infinity, 'x1');
    const x2 = solver.addIntVariable(0.0, infinity, 'x2');

    const objective = solver.objective();
    objective.setCoefficient(x1, 1);
    objective.setCoefficient(x2, 10);
    objective.setMaximization();

    const c0 = solver.addConstraint(-infinity, 17.5, 'c0');
    c0.setCoefficient(x1, 1);
    c0.setCoefficient(x2, 7);

    const c1 = solver.addConstraint(-infinity, 3.5, 'c1');
    c1.setCoefficient(x1, 1);
    c1.setCoefficient(x2, 0);

    assert(solver.numVariables() === 2, `${name}: expected 2 variables`);
    assert(solver.numConstraints() === 2, `${name}: expected 2 constraints`);
    const status = await solver.solve(mpSolverExecutionOptions());
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(solver.verifySolution(1e-7, true), `${name}: verifySolution failed`);
    assert(near(objective.value(), 23), `${name}: objective mismatch ${objective.value()}`);
    assert(near(x1.solutionValue(), 3), `${name}: x1 mismatch`);
    assert(near(x2.solutionValue(), 2), `${name}: x2 mismatch`);

    return { name, ok: true, status, objective: objective.value(), values: { x1: x1.solutionValue(), x2: x2.solutionValue() } };
  }
}

async function runGlpkMixedIntegerCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  assert(api.MPSolver.supportsProblemType(api.MPSolver.GLPK_MIXED_INTEGER_PROGRAMMING), 'MPSolver: GLPK MIP not supported');
  return runMixedIntegerCppStyleBackendCase(api, 'GLPK', 'MPSolver: GLPK_MIXED_INTEGER_PROGRAMMING');
}

async function runScipMixedIntegerCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  // TEMP: parity - matches ortools/linear_solver/python/lp_test.py testApi for
  // SCIP_MIXED_INTEGER_PROGRAMMING, which reaches RunMixedIntegerExampleCppStyleAPI.
  assert(api.MPSolver.supportsProblemType(api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING), 'MPSolver: SCIP MIP not supported');
  assert(api.MPSolver.parseSolverType('SCIP') === api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING, 'MPSolver: SCIP parseSolverType mismatch');
  assert(
    api.MPSolver.parseAndCheckSupportForProblemType('SCIP') === api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING,
    'MPSolver: SCIP parseAndCheckSupportForProblemType mismatch',
  );
  return runMixedIntegerCppStyleBackendCase(api, 'SCIP', 'MPSolver: SCIP_MIXED_INTEGER_PROGRAMMING');
}

async function runCbcMixedIntegerCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  // TEMP: parity - covers CBC_MIXED_INTEGER_PROGRAMMING backend availability
  // and integer solve behavior through the public MPSolver API.
  assert(api.MPSolver.supportsProblemType(api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING), 'MPSolver: CBC MIP not supported');
  assert(api.MPSolver.parseSolverType('CBC') === api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING, 'MPSolver: CBC parseSolverType mismatch');
  assert(
    api.MPSolver.parseAndCheckSupportForProblemType('CBC') === api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING,
    'MPSolver: CBC parseAndCheckSupportForProblemType mismatch',
  );
  return runMixedIntegerCppStyleBackendCase(api, 'CBC', 'MPSolver: CBC_MIXED_INTEGER_PROGRAMMING');
}

async function runCbcExecutorCase(api: MPSolverApi, mode: ExecutorFixtureMode): Promise<MpSolverCaseResult[]> {
  return [await runSimpleProgram(
    api,
    `MPSolver: CBC threaded execution (${mode})`,
    'CBC',
    (solver, infinity) => solver.addIntVariable(0, infinity, 'x'),
    (solver, infinity) => solver.addIntVariable(0, infinity, 'y'),
    { objective: 23, x: 3, y: 2 },
    4,
  )];
}

function bopBinaryRequest(api: MPSolverApi) {
  return {
    solverType: api.MPSolver.BOP_INTEGER_PROGRAMMING,
    model: {
      name: 'bop_binary_project_selection',
      maximize: true,
      variable: [
        { lowerBound: 0, upperBound: 1, isInteger: true, objectiveCoefficient: 8, name: 'analytics' },
        { lowerBound: 0, upperBound: 1, isInteger: true, objectiveCoefficient: 6, name: 'dashboard' },
        { lowerBound: 0, upperBound: 1, isInteger: true, objectiveCoefficient: 5, name: 'alerts' },
      ],
      constraint: [
        {
          lowerBound: Number.NEGATIVE_INFINITY,
          upperBound: 9,
          varIndex: [0, 1, 2],
          coefficient: [6, 4, 3],
          name: 'budget',
        },
        {
          lowerBound: Number.NEGATIVE_INFINITY,
          upperBound: 1,
          varIndex: [1, 2],
          coefficient: [1, 1],
          name: 'shared_design_team',
        },
      ],
    },
  };
}

function bopIntegerRequest(api: MPSolverApi) {
  return {
    solverType: api.MPSolver.BOP_INTEGER_PROGRAMMING,
    model: {
      name: 'bop_integer_production',
      maximize: true,
      variable: [
        { lowerBound: 0, upperBound: 4, isInteger: true, objectiveCoefficient: 3, name: 'x' },
        { lowerBound: 0, upperBound: 3, isInteger: true, objectiveCoefficient: 5, name: 'y' },
      ],
      constraint: [
        {
          lowerBound: Number.NEGATIVE_INFINITY,
          upperBound: 7,
          varIndex: [0, 1],
          coefficient: [1, 2],
          name: 'capacity',
        },
      ],
    },
  };
}

async function runBopBinaryCase(api: MPSolverApi, mode: ExecutorFixtureMode): Promise<MpSolverCaseResult> {
  const name = `MPSolver: BOP binary project selection (${mode})`;
  setMPSolverMode(api, mode);
  try {
    assert(api.MPSolver.supportsProblemType(api.MPSolver.BOP_INTEGER_PROGRAMMING), `${name}: backend not supported`);
    assert(api.MPSolver.parseSolverType('BOP') === api.MPSolver.BOP_INTEGER_PROGRAMMING, `${name}: parseSolverType mismatch`);
    assert(
      api.MPSolver.parseAndCheckSupportForProblemType('BOP') === api.MPSolver.BOP_INTEGER_PROGRAMMING,
      `${name}: parseAndCheckSupportForProblemType mismatch`,
    );

    if (mode !== 'direct') {
      const result = await api.MPSolver.solveModelRequest(
        bopBinaryRequest(api),
        mpSolverExecutionOptions(),
      );
      const response = result.response;
      assert(response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(response.status)}`);
      assert(near(Number(response.objectiveValue), 13), `${name}: objective mismatch ${String(response.objectiveValue)}`);
      const variableValues = response.variableValue as number[];
      assert(Array.isArray(variableValues), `${name}: expected variableValue array`);
      assert(near(variableValues[0], 1), `${name}: analytics mismatch`);
      assert(near(variableValues[1], 0), `${name}: dashboard mismatch`);
      assert(near(variableValues[2], 1), `${name}: alerts mismatch`);
      return {
        name,
        ok: true,
        status: api.MPSolver.OPTIMAL,
        objective: Number(response.objectiveValue),
        values: { analytics: variableValues[0], dashboard: variableValues[1], alerts: variableValues[2] },
      };
    }

    const solver = createSolver(api, 'BOP', name);
    {
      assert(solver.isMip(), `${name}: BOP should be MIP`);
      assert(solver.solverVersion().length > 0, `${name}: missing solver version`);
      const analytics = solver.addBoolVariable('analytics');
      const dashboard = solver.addBoolVariable('dashboard');
      const alerts = solver.addBoolVariable('alerts');
      const budget = solver.addConstraint(-solver.infinity(), 9, 'budget');
      budget.setCoefficient(analytics, 6);
      budget.setCoefficient(dashboard, 4);
      budget.setCoefficient(alerts, 3);
      const team = solver.addConstraint(-solver.infinity(), 1, 'shared_design_team');
      team.setCoefficient(dashboard, 1);
      team.setCoefficient(alerts, 1);
      const objective = solver.objective();
      objective.setCoefficient(analytics, 8);
      objective.setCoefficient(dashboard, 6);
      objective.setCoefficient(alerts, 5);
      objective.setMaximization();

      const status = await solver.solve(mpSolverExecutionOptions());
      assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
      assert(near(objective.value(), 13), `${name}: objective mismatch ${objective.value()}`);
      assert(near(analytics.solutionValue(), 1), `${name}: analytics mismatch`);
      assert(near(dashboard.solutionValue(), 0), `${name}: dashboard mismatch`);
      assert(near(alerts.solutionValue(), 1), `${name}: alerts mismatch`);
      assert(solver.verifySolution(1e-7, true), `${name}: verifySolution failed`);
      return {
        name,
        ok: true,
        status,
        objective: objective.value(),
        values: {
          analytics: analytics.solutionValue(),
          dashboard: dashboard.solutionValue(),
          alerts: alerts.solutionValue(),
        },
      };
    }
  } finally {
    setMPSolverMode(api, mode);
  }
}

async function runBopIntegerCase(api: MPSolverApi, mode: ExecutorFixtureMode): Promise<MpSolverCaseResult> {
  const name = `MPSolver: BOP integer production (${mode})`;
  setMPSolverMode(api, mode);
  try {
    assert(api.MPSolver.supportsProblemType(api.MPSolver.BOP_INTEGER_PROGRAMMING), `${name}: backend not supported`);

    if (mode !== 'direct') {
      const result = await api.MPSolver.solveModelRequest(
        bopIntegerRequest(api),
        mpSolverExecutionOptions(),
      );
      const response = result.response;
      assert(response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(response.status)}`);
      assert(near(Number(response.objectiveValue), 19), `${name}: objective mismatch ${String(response.objectiveValue)}`);
      const variableValues = response.variableValue as number[];
      assert(Array.isArray(variableValues), `${name}: expected variableValue array`);
      assert(near(variableValues[0], 3), `${name}: x mismatch`);
      assert(near(variableValues[1], 2), `${name}: y mismatch`);
      return {
        name,
        ok: true,
        status: api.MPSolver.OPTIMAL,
        objective: Number(response.objectiveValue),
        values: { x: variableValues[0], y: variableValues[1] },
      };
    }

    const solver = createSolver(api, 'BOP', name);
    {
      const x = solver.addIntVariable(0, 4, 'x');
      const y = solver.addIntVariable(0, 3, 'y');
      const capacity = solver.addConstraint(-solver.infinity(), 7, 'capacity');
      capacity.setCoefficient(x, 1);
      capacity.setCoefficient(y, 2);
      const objective = solver.objective();
      objective.setCoefficient(x, 3);
      objective.setCoefficient(y, 5);
      objective.setMaximization();

      const status = await solver.solve(mpSolverExecutionOptions());
      assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
      assert(near(objective.value(), 19), `${name}: objective mismatch ${objective.value()}`);
      assert(near(x.solutionValue(), 3), `${name}: x mismatch`);
      assert(near(y.solutionValue(), 2), `${name}: y mismatch`);
      assert(solver.verifySolution(1e-7, true), `${name}: verifySolution failed`);
      return {
        name,
        ok: true,
        status,
        objective: objective.value(),
        values: { x: x.solutionValue(), y: y.solutionValue() },
      };
    }
  } finally {
    setMPSolverMode(api, mode);
  }
}

async function runBopInfeasibleCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  // TEMP: parity - mirrors ortools/linear_solver/python/lp_test.py
  // testBopInfeasible construction through the public BOP MPSolver backend.
  // Upstream prints status 0 instead of asserting it, so this case preserves
  // that observed backend behavior while still exercising the same construction.
  const name = 'MPSolver: lp_test.py testBopInfeasible';
  const solver = new api.MPSolver('test', api.MPSolver.BOP_INTEGER_PROGRAMMING);
  {
    solver.enableOutput();
    const x = solver.addIntVariable(0, 10, 'x');
    const impossible = solver.addConstraint(20, solver.infinity(), 'impossible');
    impossible.setCoefficient(x, 1);
    const status = await solver.solve(mpSolverExecutionOptions());
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected upstream-observed status 0, got ${status}`);
    return { name, ok: true, status, objective: 0, values: {} };
  }
}

async function runKnapsackBackendCase(api: MPSolverApi, mode: ExecutorFixtureMode): Promise<MpSolverCaseResult> {
  // TEMP: parity - covers the dedicated MPSolver KNAPSACK backend with the
  // same one-dimensional data as knapsack_solver_test.py testSolveOneDimension.
  const name = `MPSolver: KNAPSACK_MIXED_INTEGER_PROGRAMMING (${mode})`;
  setMPSolverMode(api, mode);
  try {
    assert(api.MPSolver.supportsProblemType(api.MPSolver.KNAPSACK_MIXED_INTEGER_PROGRAMMING), `${name}: backend not supported`);
    assert(api.MPSolver.parseSolverType('KNAPSACK') === api.MPSolver.KNAPSACK_MIXED_INTEGER_PROGRAMMING, `${name}: parseSolverType mismatch`);
    assert(
      api.MPSolver.parseAndCheckSupportForProblemType('KNAPSACK') === api.MPSolver.KNAPSACK_MIXED_INTEGER_PROGRAMMING,
      `${name}: parseAndCheckSupportForProblemType mismatch`,
    );
    if (mode !== 'direct') {
      const result = await api.MPSolver.solveModelRequest(
        {
          solverType: api.MPSolver.KNAPSACK_MIXED_INTEGER_PROGRAMMING,
          model: {
            maximize: true,
            variable: Array.from({ length: 9 }, (_, item) => ({
              lowerBound: 0,
              upperBound: 1,
              isInteger: true,
              objectiveCoefficient: item + 1,
              name: `x_${item}`,
            })),
            constraint: [{
              lowerBound: Number.NEGATIVE_INFINITY,
              upperBound: 34,
              varIndex: Array.from({ length: 9 }, (_, item) => item),
              coefficient: Array.from({ length: 9 }, (_, item) => item + 1),
              name: 'capacity',
            }],
          },
        },
        mpSolverExecutionOptions(),
      );
      const response = result.response;
      assert(response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(response.status)}`);
      assert(near(Number(response.objectiveValue), 34), `${name}: objective mismatch ${String(response.objectiveValue)}`);
      const variableValues = response.variableValue as number[];
      assert(Array.isArray(variableValues), `${name}: expected variableValue array`);
      return {
        name,
        ok: true,
        status: api.MPSolver.OPTIMAL,
        objective: Number(response.objectiveValue),
        values: Object.fromEntries(variableValues.map((value, item) => [`x_${item}`, value])),
      };
    }

    const solver = createSolver(api, 'KNAPSACK', name);
    {
      const profits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const weights = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const variables = profits.map((_, item) => solver.addBoolVariable(`x_${item}`));
      const capacity = solver.addConstraint(-solver.infinity(), 34, 'capacity');
      for (const [item, variable] of variables.entries()) {
        capacity.setCoefficient(variable, weights[item]);
        solver.objective().setCoefficient(variable, profits[item]);
      }
      solver.objective().setMaximization();
      const status = await solver.solve(mpSolverExecutionOptions());
      assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
      assert(near(solver.objective().value(), 34), `${name}: objective mismatch ${solver.objective().value()}`);
      assert(solver.verifySolution(1e-7, true), `${name}: verifySolution failed`);
      return {
        name,
        ok: true,
        status,
        objective: solver.objective().value(),
        values: Object.fromEntries(variables.map((variable, item) => [`x_${item}`, variable.solutionValue()])),
      };
    }
  } finally {
    setMPSolverMode(api, mode);
  }
}

async function runSetHintCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver: lp_test.py testSetHint';
  const solver = new api.MPSolver('RunBooleanExampleCppStyle', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
  {
    const x1 = solver.addBoolVariable('x1');
    const x2 = solver.addBoolVariable('x2');
    const objective = solver.objective();
    objective.setCoefficient(x1, 2);
    objective.setCoefficient(x2, 1);
    objective.setMinimization();

    const c0 = solver.addConstraint(1, 3, 'c0');
    c0.setCoefficient(x1, 1);
    c0.setCoefficient(x2, 2);

    solver.setHint([x1, x2], [1.0, 0.0]);
    assert(solver.variables().length === 2, `${name}: expected 2 variables`);
    assert(solver.constraints().length === 1, `${name}: expected 1 constraint`);

    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  }
}

async function runExternalApiCase(api: MPSolverApi, backend: LpBackend): Promise<MpSolverCaseResult> {
  const name = `MPSolver: pywraplp_test.py test_external_api (${backend.solverId})`;
  const solver = createSolver(api, backend.solverId, name);
  {
    const infinity = solver.infinity();
    assert(api.MPSolver.supportsProblemType(backend.problemType), `${name}: ${backend.solverId} not supported`);
    assert(!api.MPSolver.supportsProblemType(10_000), `${name}: bogus solver type reported supported`);
    assert(api.MPSolver.parseSolverType(backend.solverId) === backend.problemType, `${name}: parseSolverType mismatch`);
    assert(api.MPSolver.parseAndCheckSupportForProblemType(backend.solverId) === backend.problemType, `${name}: parseAndCheckSupportForProblemType mismatch`);
    assert(!solver.isMip(), `${name}: ${backend.solverId} should not be MIP`);

    const x1 = solver.addVariable(0.0, infinity, false, 'x1');
    const x2 = solver.addNumVariable(0.0, infinity, 'x2');
    const x3 = solver.addNumVariable(0.0, infinity, 'x3');
    assert(x1.lowerBound() === 0, `${name}: x1 lower bound mismatch`);
    assert(x1.upperBound() === infinity, `${name}: x1 upper bound mismatch`);
    assert(!x1.isInteger(), `${name}: x1 should be continuous`);
    assert(x1.index() === 0 && x1.name() === 'x1', `${name}: x1 identity mismatch`);
    assert(solver.variable(1).name() === 'x2', `${name}: variable(index) mismatch`);
    assert(solver.lookupVariable('x3')?.index() === 2, `${name}: lookupVariable mismatch`);
    assert(solver.lookupVariable('x2')?.index() === 1, `${name}: lookupVariable mismatch`);
    assert(solver.lookupVariable('missing') === null, `${name}: missing variable lookup should be null`);
    x3.setBranchingPriority(17);
    assert(x3.branchingPriority() === 17, `${name}: branching priority mismatch`);

    const objective = solver.objective();
    objective.setCoefficient(x1, 10);
    objective.setCoefficient(x2, 6);
    objective.setCoefficient(x3, 4);
    objective.setOffset(5);
    objective.addOffset(2);
    objective.setMaximization();
    assert(objective.getCoefficient(x1) === 10, `${name}: objective coefficient mismatch`);
    assert(objective.offset() === 7, `${name}: objective offset mismatch`);
    assert(objective.isMaximization(), `${name}: objective should maximize`);

    const c0 = solver.addConstraint(-infinity, 600, 'ConstraintName0');
    c0.setCoefficient(x1, 10);
    c0.setCoefficient(x2, 4);
    c0.setCoefficient(x3, 5);
    const c1 = solver.addConstraint(-infinity, 300, 'c1');
    c1.setCoefficient(x1, 2);
    c1.setCoefficient(x2, 2);
    c1.setCoefficient(x3, 6);
    const c2 = solver.addConstraint(-infinity, 100, 'OtherConstraintName');
    c2.setCoefficient(x1, 1);
    c2.setCoefficient(x2, 1);
    c2.setCoefficient(x3, 1);
    const freeConstraint = solver.addConstraint('free');
    assert(freeConstraint.lowerBound() === -infinity && freeConstraint.upperBound() === infinity, `${name}: unbounded named constraint mismatch`);
    const anonymousConstraint = solver.addConstraint();
    assert(anonymousConstraint.lowerBound() === -infinity && anonymousConstraint.upperBound() === infinity, `${name}: unbounded anonymous constraint mismatch`);

    assert(c0.getCoefficient(x3) === 5, `${name}: constraint coefficient mismatch`);
    assert(c1.lowerBound() === -infinity && c1.upperBound() === 300, `${name}: constraint bounds mismatch`);
    c1.setLowerBound(-100000);
    c1.setUpperBound(301);
    assert(c1.lowerBound() === -100000 && c1.upperBound() === 301, `${name}: setLowerBound/setUpperBound mismatch`);
    c1.setBounds(-infinity, 300);
    assert(c0.index() === 0 && c0.name() === 'ConstraintName0', `${name}: constraint identity mismatch`);
    assert(solver.constraint(2).name() === 'OtherConstraintName', `${name}: constraint(index) mismatch`);
    assert(solver.lookupConstraint('ConstraintName0')?.index() === 0, `${name}: lookupConstraint mismatch`);
    assert(solver.lookupConstraint('c1')?.index() === 1, `${name}: lookupConstraint mismatch`);
    freeConstraint.clear();

    solver.setTimeLimit(10000);
    assert(solver.timeLimit() === 10000, `${name}: time limit mismatch`);
    solver.suppressOutput();
    assert(!solver.outputIsEnabled(), `${name}: output should be suppressed`);
    solver.enableOutput();
    assert(solver.outputIsEnabled(), `${name}: output should be enabled`);
    solver.suppressOutput();
    solver.setNumThreads(1);
    assert(solver.getNumThreads() >= 1, `${name}: getNumThreads mismatch`);

    const params = new api.MPSolverParameters();
    let status = -1;
    {
      assert(near(params.getDoubleParam(api.MPSolverParameters.RELATIVE_MIP_GAP), 1e-4), `${name}: default relative MIP gap mismatch`);
      params.setDoubleParam(api.MPSolverParameters.PRIMAL_TOLERANCE, 1e-8);
      assert(near(params.getDoubleParam(api.MPSolverParameters.PRIMAL_TOLERANCE), 1e-8), `${name}: primal tolerance mismatch`);
      params.resetDoubleParam(api.MPSolverParameters.PRIMAL_TOLERANCE);
      params.setIntegerParam(api.MPSolverParameters.PRESOLVE, api.MPSolverParameters.PRESOLVE_ON);
      assert(params.getIntegerParam(api.MPSolverParameters.PRESOLVE) === api.MPSolverParameters.PRESOLVE_ON, `${name}: presolve mismatch`);
      params.setIntegerParam(api.MPSolverParameters.SCALING, api.MPSolverParameters.SCALING_ON);
      params.resetIntegerParam(api.MPSolverParameters.SCALING);
      params.setIntegerParam(api.MPSolverParameters.INCREMENTALITY, api.MPSolverParameters.INCREMENTALITY_ON);
      params.setIntegerParam(api.MPSolverParameters.LP_ALGORITHM, api.MPSolverParameters.PRIMAL);
      params.reset();
      status = await solver.solve({ ...mpSolverExecutionOptions(), parameters: params });
    }
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(solver.verifySolution(1e-7, true), `${name}: verifySolution failed`);
    assert(near(x1.reducedCost(), 0.0), `${name}: reduced cost mismatch`);
    assert(near(c0.dualValue(), 2 / 3), `${name}: dual value mismatch ${c0.dualValue()}`);
    assert(solver.computeConstraintActivities().length === solver.numConstraints(), `${name}: activity count mismatch`);
    if (backend.supportsExactConditionNumber) {
      assert(Number.isFinite(solver.computeExactConditionNumber()), `${name}: condition number should be finite`);
    }
    assert(!solver.nextSolution(), `${name}: ${backend.solverId} should not produce a next solution`);
    assert(solver.solverVersion().length > 0, `${name}: missing solver version`);

    return {
      name,
      ok: true,
      status,
      objective: objective.value(),
      values: {
        x1: x1.solutionValue(),
        x2: x2.solutionValue(),
        x3: x3.solutionValue(),
      },
    };
  }
}

async function runLinearCppStyleCase(api: MPSolverApi, backend: LpBackend): Promise<MpSolverCaseResult> {
  const name = `MPSolver: lp_test.py RunLinearExampleCppStyleAPI (${backend.solverId})`;
  const solver = createSolver(api, backend.solverId, name);
  {
    const infinity = solver.infinity();
    const x1 = solver.addNumVariable(0.0, infinity, 'x1');
    const x2 = solver.addNumVariable(0.0, infinity, 'x2');
    const x3 = solver.addNumVariable(0.0, infinity, 'x3');

    const objective = solver.objective();
    objective.setCoefficient(x1, 10);
    objective.setCoefficient(x2, 6);
    objective.setCoefficient(x3, 4);
    objective.setMaximization();

    const c0 = solver.addConstraint(-infinity, 100, 'c0');
    c0.setCoefficient(x1, 1);
    c0.setCoefficient(x2, 1);
    c0.setCoefficient(x3, 1);
    const c1 = solver.addConstraint(-infinity, 600, 'c1');
    c1.setCoefficient(x1, 10);
    c1.setCoefficient(x2, 4);
    c1.setCoefficient(x3, 5);
    const c2 = solver.addConstraint(-infinity, 300, 'c2');
    c2.setCoefficient(x1, 2);
    c2.setCoefficient(x2, 2);
    c2.setCoefficient(x3, 6);

    assert(solver.numVariables() === 3, `${name}: expected 3 variables`);
    assert(solver.numConstraints() === 3, `${name}: expected 3 constraints`);
    const status = await solver.solve(mpSolverExecutionOptions());
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(solver.verifySolution(1e-7, true), `${name}: verifySolution failed`);
    assert(near(objective.value(), 733.3333333333333, 1e-5), `${name}: objective mismatch ${objective.value()}`);
    assert(near(x1.solutionValue(), 33.3333333333333, 1e-5), `${name}: x1 mismatch`);
    assert(near(x2.solutionValue(), 66.6666666666667, 1e-5), `${name}: x2 mismatch`);
    assert(near(x3.solutionValue(), 0, 1e-7), `${name}: x3 mismatch`);
    assert(near(x1.reducedCost(), 0, 1e-7), `${name}: x1 reduced cost mismatch`);
    assert(near(x3.reducedCost(), backend.x3ReducedCost, 1e-5), `${name}: x3 reduced cost mismatch ${x3.reducedCost()}`);
    const activities = solver.computeConstraintActivities();
    assert(near(activities[c0.index()], 100, 1e-5), `${name}: c0 activity mismatch`);
    assert(near(activities[c1.index()], 600, 1e-5), `${name}: c1 activity mismatch`);
    assert(near(activities[c2.index()], 200, 1e-5), `${name}: c2 activity mismatch`);
    assert(x1.basisStatus() === api.MPSolver.BASIC, `${name}: x1 basis mismatch`);
    assert(x3.basisStatus() === api.MPSolver.AT_LOWER_BOUND, `${name}: x3 basis mismatch`);

    return {
      name,
      ok: true,
      status,
      objective: objective.value(),
      values: { x1: x1.solutionValue(), x2: x2.solutionValue(), x3: x3.solutionValue() },
    };
  }
}

async function runBooleanCppStyleCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver: lp_test.py RunBooleanExampleCppStyleAPI';
  const solver = createSolver(api, 'SAT', name);
  {
    const x1 = solver.addBoolVariable('x1');
    const x2 = solver.addBoolVariable('x2');
    assert(solver.isMip(), `${name}: SAT should be MIP`);
    assert(x1.isInteger() && x2.isInteger(), `${name}: addBoolVariable should be integer`);

    const objective = solver.objective();
    objective.setCoefficient(x1, 2);
    objective.setCoefficient(x2, 1);
    objective.setMinimization();
    assert(objective.isMinimization(), `${name}: objective should minimize`);

    const c0 = solver.addConstraint(1, 3, 'c0');
    c0.setCoefficient(x1, 1);
    c0.setCoefficient(x2, 2);
    c0.setIsLazy(true);
    assert(c0.isLazy(), `${name}: laziness mismatch`);
    solver.setHint([x1, x2], [1, 0]);

    const status = await solver.solve(mpSolverExecutionOptions());
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(near(objective.value(), 1), `${name}: objective mismatch`);
    assert(near(x1.solutionValue(), 0), `${name}: x1 mismatch`);
    assert(near(x2.solutionValue(), 1), `${name}: x2 mismatch`);

    return {
      name,
      ok: true,
      status,
      objective: objective.value(),
      values: { x1: x1.solutionValue(), x2: x2.solutionValue() },
    };
  }
}

async function runExportToMpsCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver: lp_test.py testExportToMps';
  const solver = new api.MPSolver('ExportMps', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
  {
    const infinity = solver.infinity();
    const x1 = solver.addNumVariable(0.0, infinity, 'x1');
    const x2 = solver.addNumVariable(0.0, infinity, 'x2');
    const x3 = solver.addNumVariable(0.0, infinity, 'x3');
    const objective = solver.objective();
    objective.setCoefficient(x1, 10);
    objective.setCoefficient(x2, 6);
    objective.setCoefficient(x3, 4);
    objective.setMaximization();

    const c0 = solver.addConstraint(-infinity, 600, 'ConstraintName0');
    c0.setCoefficient(x1, 10);
    c0.setCoefficient(x2, 4);
    c0.setCoefficient(x3, 5);
    const c1 = solver.addConstraint(-infinity, 300, 'c1');
    c1.setCoefficient(x1, 2);
    c1.setCoefficient(x2, 2);
    c1.setCoefficient(x3, 6);
    const c2 = solver.addConstraint(-infinity, 100, 'OtherConstraintName');
    c2.setCoefficient(x1, 1);
    c2.setCoefficient(x2, 1);
    c2.setCoefficient(x3, 1);

    const mps = solver.exportModelAsMpsFormat(false, false);
    assert(mps.includes('ExportMps'), `${name}: MPS export missing model name`);

    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  }
}

async function runClearSupportCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver support: clear';
  const solver = createSolver(api, 'GLOP', name);
  {
    const infinity = solver.infinity();
    const x = solver.addNumVariable(0, infinity, 'x');
    const y = solver.addNumVariable(0, infinity, 'y');
    const objective = solver.objective();
    objective.setCoefficient(x, 1);
    objective.setCoefficient(y, 2);
    objective.setMaximization();
    const c = solver.addConstraint(-infinity, 4, 'limit');
    c.setCoefficient(x, 1);
    c.setCoefficient(y, 1);

    const lp = solver.exportModelAsLpFormat(false);
    assert(lp.includes('Maximize'), `${name}: LP export missing Maximize`);
    solver.clear();
    assert(solver.numVariables() === 0, `${name}: clear did not remove variables`);
    assert(solver.numConstraints() === 0, `${name}: clear did not remove constraints`);

    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  }
}

function mpProtoRequest(api: MPSolverApi, numWorkers: number) {
  return {
    solverType: api.MPSolver.SAT_INTEGER_PROGRAMMING,
    solverSpecificParameters: `num_workers: ${numWorkers}`,
    model: {
      name: `MPSolver proto ${numWorkers} workers`,
      maximize: true,
      variable: [
        { lowerBound: 0, upperBound: Number.POSITIVE_INFINITY, objectiveCoefficient: 1, isInteger: true, name: 'x' },
        { lowerBound: 0, upperBound: Number.POSITIVE_INFINITY, objectiveCoefficient: 10, isInteger: true, name: 'y' },
      ],
      constraint: [
        { lowerBound: Number.NEGATIVE_INFINITY, upperBound: 17.5, varIndex: [0, 1], coefficient: [1, 7], name: 'c0' },
        { lowerBound: Number.NEGATIVE_INFINITY, upperBound: 3.5, varIndex: [0], coefficient: [1], name: 'c1' },
      ],
    },
  };
}

function lpApiTestProtoRequest(solverType: number) {
  return {
    solverType,
    model: {
      maximize: true,
      variable: [
        { lowerBound: 1, upperBound: 10, objectiveCoefficient: 2 },
        { lowerBound: 1, upperBound: 10, objectiveCoefficient: 1 },
      ],
      constraint: [
        {
          lowerBound: -10000,
          upperBound: 4,
          varIndex: [0, 1],
          coefficient: [1, 2],
        },
      ],
    },
  };
}

function pywrapLpTestCbcProtoRequest(api: MPSolverApi) {
  return {
    solverType: api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING,
    model: {
      variable: [
        { lowerBound: 1, upperBound: 10, objectiveCoefficient: 2 },
        { lowerBound: 1, upperBound: 10, objectiveCoefficient: 1 },
      ],
      constraint: [
        {
          lowerBound: -10000,
          upperBound: 4,
          varIndex: [0, 1],
          coefficient: [1, 2],
        },
      ],
    },
  };
}

function lpTestSolveFromProtoRequest(solverType: number) {
  return {
    solverType,
    solverTimeLimitSeconds: 1.0,
    solverSpecificParameters: '',
    model: {
      maximize: false,
      objectiveOffset: 0,
      name: 'NAME_LONGER_THAN_8_CHARACTERS',
      variable: [
        { lowerBound: 0, upperBound: 4, objectiveCoefficient: 1, isInteger: false, name: 'XONE' },
        { lowerBound: -1, upperBound: 1, objectiveCoefficient: 4, isInteger: false, name: 'YTWO' },
        { lowerBound: 0, upperBound: Number.POSITIVE_INFINITY, objectiveCoefficient: 9, isInteger: false, name: 'ZTHREE' },
      ],
      constraint: [
        {
          lowerBound: Number.NEGATIVE_INFINITY,
          upperBound: 5,
          name: 'LIM1',
          varIndex: [0, 1],
          coefficient: [1, 1],
        },
        {
          lowerBound: 10,
          upperBound: Number.POSITIVE_INFINITY,
          name: 'LIM2',
          varIndex: [0, 2],
          coefficient: [1, 1],
        },
        {
          lowerBound: 7,
          upperBound: 7,
          name: 'MYEQN',
          varIndex: [1, 2],
          coefficient: [-1, 1],
        },
      ],
    },
  };
}

async function runProtoSolveCase(
  api: MPSolverApi,
  mode: ExecutorFixtureMode,
  numWorkers: number,
  displayName?: string,
): Promise<MpSolverCaseResult> {
  const name = displayName ?? `MPSolver: MPModelRequest solve (${mode}, ${numWorkers} worker${numWorkers === 1 ? '' : 's'})`;
  const result = await api.MPSolver.solveModelRequest(
    mpProtoRequest(api, numWorkers),
    mpSolverExecutionOptions(),
  );
  const response = result.response;
  assert(response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(response.status)}`);
  assert(near(Number(response.objectiveValue), 23), `${name}: objective mismatch ${String(response.objectiveValue)}`);
  const variableValues = response.variableValue as number[];
  assert(Array.isArray(variableValues), `${name}: expected variableValue array`);
  assert(near(variableValues[0], 3), `${name}: x mismatch ${variableValues[0]}`);
  assert(near(variableValues[1], 2), `${name}: y mismatch ${variableValues[1]}`);
  return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: Number(response.objectiveValue), values: { x: variableValues[0], y: variableValues[1] } };
}

async function runLpApiTestProtoCase(api: MPSolverApi, backend: LpBackend): Promise<MpSolverCaseResult> {
  const name = `MPSolver: lp_api_test.py test_proto (${backend.solverId})`;
  const result = await api.MPSolver.solveModelRequest(
    lpApiTestProtoRequest(backend.problemType),
    mpSolverExecutionOptions(),
  );
  const response = result.response;
  assert(response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(response.status)}`);
  assert(near(Number(response.objectiveValue), 5), `${name}: objective mismatch ${String(response.objectiveValue)}`);
  const variableValues = response.variableValue as number[];
  assert(Array.isArray(variableValues), `${name}: expected variableValue array`);
  assert(near(variableValues[0], 2), `${name}: x mismatch ${variableValues[0]}`);
  assert(near(variableValues[1], 1), `${name}: y mismatch ${variableValues[1]}`);
  return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: Number(response.objectiveValue), values: { x: variableValues[0], y: variableValues[1] } };
}

async function runPywrapLpTestCbcProtoCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  // TEMP: parity - mirrors ortools/linear_solver/python/pywraplp_test.py
  // PyWrapLp.test_proto with the same CBC MPModelProto, objective, variable
  // values, and best-objective-bound assertions.
  const name = 'MPSolver: pywraplp_test.py test_proto (CBC)';
  const result = await api.MPSolver.solveModelRequest(
    pywrapLpTestCbcProtoRequest(api),
    mpSolverExecutionOptions(),
  );
  const response = result.response;
  assert(response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(response.status)}`);
  assert(near(Number(response.objectiveValue), 3), `${name}: objective mismatch ${String(response.objectiveValue)}`);
  const variableValues = response.variableValue as number[];
  assert(Array.isArray(variableValues), `${name}: expected variableValue array`);
  assert(near(variableValues[0], 1), `${name}: x mismatch ${variableValues[0]}`);
  assert(near(variableValues[1], 1), `${name}: y mismatch ${variableValues[1]}`);
  assert(near(Number(response.bestObjectiveBound), 3), `${name}: best objective bound mismatch ${String(response.bestObjectiveBound)}`);
  return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: Number(response.objectiveValue), values: { x: variableValues[0], y: variableValues[1] } };
}

async function runLpTestLoadSolutionFromProtoCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver: lp_test.py testLoadSolutionFromProto';
  const solver = new api.MPSolver('', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
  {
    assert(typeof solver.loadSolutionFromProto === 'function', `${name}: loadSolutionFromProto is not exposed`);
    await solver.loadSolutionFromProto({});
    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  }
}

async function runLpTestSolveFromProtoCase(api: MPSolverApi, backend: LpBackend): Promise<MpSolverCaseResult> {
  const name = `MPSolver: lp_test.py testSolveFromProto (${backend.solverId})`;
  const request = lpTestSolveFromProtoRequest(backend.problemType);
  assert((request.model.variable as unknown[]).length === 3, `${name}: expected 3 variables`);
  const result = await api.MPSolver.solveModelRequest(
    request,
    mpSolverExecutionOptions(),
  );
  assert(result.response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(result.response.status)}`);
  return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: Number(result.response.objectiveValue), values: {} };
}

async function runStatefulProtoSolveCase(api: MPSolverApi, displayName?: string): Promise<MpSolverCaseResult> {
  const name = displayName ?? 'MPSolver: solveWithProto loads solution';
  const solver = createSolver(api, 'SAT', name);
  {
    const infinity = solver.infinity();
    const x = solver.addIntVariable(0, infinity, 'x');
    const y = solver.addIntVariable(0, infinity, 'y');
    const c0 = solver.addConstraint(-infinity, 17.5, 'c0');
    c0.setCoefficient(x, 1);
    c0.setCoefficient(y, 7);
    const c1 = solver.addConstraint(-infinity, 3.5, 'c1');
    c1.setCoefficient(x, 1);
    const objective = solver.objective();
    objective.setCoefficient(x, 1);
    objective.setCoefficient(y, 10);
    objective.setMaximization();

    const result = await solver.solveWithProto({
      ...mpSolverExecutionOptions(),
      solverSpecificParameters: 'num_workers: 4',
    });
    assert(result.loaded, `${name}: solution was not loaded back into the solver`);
    assert(result.response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL`);
    assert(near(objective.value(), 23), `${name}: loaded objective mismatch ${objective.value()}`);
    assert(near(x.solutionValue(), 3), `${name}: loaded x mismatch ${x.solutionValue()}`);
    assert(near(y.solutionValue(), 2), `${name}: loaded y mismatch ${y.solutionValue()}`);
    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: objective.value(), values: { x: x.solutionValue(), y: y.solutionValue() } };
  }
}

async function runProtoSolveMatrix(
  api: MPSolverApi,
  options: MPSolverRunOptions,
  mode: ExecutorFixtureMode,
): Promise<MpSolverCaseResult[]> {
  const results: MpSolverCaseResult[] = [];
  for (const numWorkers of [1, 4]) {
    options.onProgress?.('MPSolver: MPModelRequest solve', { mode, numWorkers });
    results.push(await runProtoSolveCase(api, mode, numWorkers));
  }
  return results;
}

async function runMPSolverModeMatrix(
  api: MPSolverApi,
  options: MPSolverRunOptions,
  label: string,
  mode: ExecutorFixtureMode,
  run: (mode: ExecutorFixtureMode) => Promise<MpSolverCaseResult>,
): Promise<MpSolverCaseResult[]> {
  options.onProgress?.(label, { mode });
  return [await run(mode)];
}

async function runMPSolverContractCasesForMode(
  api: MPSolverApi,
  options: MPSolverRunOptions,
  mode: ExecutorFixtureMode,
): Promise<MpSolverCaseResult[]> {
  setMPSolverMode(api, mode);
  const protoResults = await runProtoSolveMatrix(api, options, mode);
  const linearBackends = lpBackends(api);
  const externalApiResults = [];
  const lpApiProtoResults = [];
  const linearCppStyleResults = [];
  const solveFromProtoResults = [];
  for (const backend of linearBackends) {
    options.onProgress?.('MPSolver: pywraplp_test.py/test_external_api', { backend: backend.solverId });
    externalApiResults.push(await runExternalApiCase(api, backend));
    options.onProgress?.('MPSolver: lp_api_test.py/test_proto', { backend: backend.solverId });
    lpApiProtoResults.push(await runLpApiTestProtoCase(api, backend));
    options.onProgress?.('MPSolver: lp_test.py/RunLinearExampleCppStyleAPI', { backend: backend.solverId });
    linearCppStyleResults.push(await runLinearCppStyleCase(api, backend));
    options.onProgress?.('MPSolver: lp_test.py/testSolveFromProto', { backend: backend.solverId });
    solveFromProtoResults.push(await runLpTestSolveFromProtoCase(api, backend));
  }
  options.onProgress?.('MPSolver: MPModelRequest stateful solve');
  const statefulProtoSolve = await runStatefulProtoSolveCase(api);
  options.onProgress?.('MPSolver: pywraplp_test.py/test_proto CBC');
  const cbcProto = await runPywrapLpTestCbcProtoCase(api);
  options.onProgress?.('MPSolver: lp_test.py/RunMixedIntegerExampleCppStyleAPI');
  const mixedIntegerCppStyle = await runMixedIntegerCppStyleCase(api);
  options.onProgress?.('MPSolver: GLPK simple_mip_program.py');
  const glpkMixedInteger = await runGlpkMixedIntegerCase(api);
  options.onProgress?.('MPSolver: SCIP simple_mip_program.py');
  const scipMixedInteger = await runScipMixedIntegerCase(api);
  options.onProgress?.('MPSolver: CBC simple_mip_program.py');
  const cbcMixedInteger = await runCbcMixedIntegerCase(api);
  const bopBinaryResults = await runMPSolverModeMatrix(
    api,
    options,
    'MPSolver: BOP binary project selection',
    mode,
    (mode) => runBopBinaryCase(api, mode),
  );
  const bopIntegerResults = await runMPSolverModeMatrix(
    api,
    options,
    'MPSolver: BOP integer production',
    mode,
    (mode) => runBopIntegerCase(api, mode),
  );
  const knapsackBackendResults = await runMPSolverModeMatrix(
    api,
    options,
    'MPSolver: Knapsack backend',
    mode,
    (mode) => runKnapsackBackendCase(api, mode),
  );
  options.onProgress?.('MPSolver: lp_test.py/RunBooleanExampleCppStyleAPI');
  const booleanCppStyle = await runBooleanCppStyleCase(api);
  const results = [
    statefulProtoSolve,
    ...protoResults,
    ...externalApiResults,
    skipped(
      'MPSolver: lp_api_test.py test_sum_no_brackets',
      'Not applicable: this tests Python generator/list summation helper behavior, not OR-Tools solver API.',
    ),
    cbcProto,
    ...lpApiProtoResults,
    skipped(
      'MPSolver: lp_test.py RunLinearExampleNaturalLanguageAPI',
      'Blocked: Python operator-overloaded natural expression API is not exposed in TypeScript.',
    ),
    ...linearCppStyleResults,
    mixedIntegerCppStyle,
    glpkMixedInteger,
    scipMixedInteger,
    cbcMixedInteger,
    ...bopBinaryResults,
    ...bopIntegerResults,
    ...knapsackBackendResults,
    booleanCppStyle,
    skipped(
      'MPSolver: lp_test.py testApi',
      'Partially mirrored by backend-specific C++ style cases; upstream also exercises Python-only natural expression helpers.',
    ),
    await runSetHintCase(api),
    await runBopInfeasibleCase(api),
    await runLpTestLoadSolutionFromProtoCase(api),
    ...solveFromProtoResults,
    await runExportToMpsCase(api),
    await runClearSupportCase(api),
    ...(await runSimpleProgramBridgeMatrix(
      api,
      mode,
      'MPSolver: simple_lp_program.py',
      'GLOP',
      (solver, infinity) => solver.addNumVariable(0, infinity, 'x'),
      (solver, infinity) => solver.addNumVariable(0, infinity, 'y'),
      { objective: 25, x: 0, y: 2.5 },
    )),
    ...(await runSimpleProgramBridgeMatrix(
      api,
      mode,
      'MPSolver: CLP simple_lp_program.py',
      'CLP',
      (solver, infinity) => solver.addNumVariable(0, infinity, 'x'),
      (solver, infinity) => solver.addNumVariable(0, infinity, 'y'),
      { objective: 25, x: 0, y: 2.5 },
    )),
    ...(await runSimpleProgramBridgeMatrix(
      api,
      mode,
      'MPSolver: GLPK_LP simple_lp_program.py',
      'GLPK_LP',
      (solver, infinity) => solver.addNumVariable(0, infinity, 'x'),
      (solver, infinity) => solver.addNumVariable(0, infinity, 'y'),
      { objective: 25, x: 0, y: 2.5 },
    )),
    ...(await runSimpleProgramBridgeMatrix(
      api,
      mode,
      'MPSolver: simple_mip_program.py',
      'SAT',
      (solver, infinity) => solver.addIntVariable(0, infinity, 'x'),
      (solver, infinity) => solver.addIntVariable(0, infinity, 'y'),
      { objective: 23, x: 3, y: 2 },
    )),
    ...(await runSimpleProgramBridgeMatrix(
      api,
      mode,
      'MPSolver: GLPK simple_mip_program.py',
      'GLPK',
      (solver, infinity) => solver.addIntVariable(0, infinity, 'x'),
      (solver, infinity) => solver.addIntVariable(0, infinity, 'y'),
      { objective: 23, x: 3, y: 2 },
    )),
    ...(await runSimpleProgramBridgeMatrix(
      api,
      mode,
      'MPSolver: SCIP simple_mip_program.py',
      'SCIP',
      (solver, infinity) => solver.addIntVariable(0, infinity, 'x'),
      (solver, infinity) => solver.addIntVariable(0, infinity, 'y'),
      { objective: 23, x: 3, y: 2 },
    )),
    ...(await runCbcExecutorCase(api, mode)),
  ];
  return results.map((result) => ({ ...decorateMpSolverResult(result), mode }));
}

export async function runMPSolverContractCases(
  api: MPSolverApi,
  options: MPSolverRunOptions = {},
): Promise<MpSolverCaseResult[]> {
  const modes = options.modes ?? executorFixtureModes;
  if (modes.includes('server')) await assertServerExecutorIsRunning();
  const results: MpSolverCaseResult[] = [];
  for (const mode of modes) {
    results.push(...await runMPSolverContractCasesForMode(api, options, mode));
  }
  return results;
}
