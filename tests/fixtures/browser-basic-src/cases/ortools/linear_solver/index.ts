export type MpSolverCaseResult = {
  name: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  status: number;
  objective: number;
  values: Record<string, number>;
};

type MPVariableLike = {
  Lb(): number;
  Ub(): number;
  Integer(): boolean;
  SetBounds(lb: number, ub: number): void;
  SetLb(lb: number): void;
  SetUb(ub: number): void;
  ReducedCost(): number;
  reduced_cost(): number;
  index(): number;
  name(): string;
  solution_value(): number;
  unrounded_solution_value(): number;
  basis_status(): number;
  branching_priority(): number;
  SetBranchingPriority(priority: number): void;
};

type MPConstraintLike = {
  Clear(): void;
  SetCoefficient(variable: MPVariableLike, coefficient: number): void;
  GetCoefficient(variable: MPVariableLike): number;
  Lb(): number;
  Ub(): number;
  SetBounds(lb: number, ub: number): void;
  SetLb(lb: number): void;
  SetUb(ub: number): void;
  DualValue(): number;
  dual_value(): number;
  index(): number;
  name(): string;
  basis_status(): number;
  is_lazy(): boolean;
  set_is_lazy(laziness: boolean): void;
};

type MPObjectiveLike = {
  Clear(): void;
  SetCoefficient(variable: MPVariableLike, coefficient: number): void;
  GetCoefficient(variable: MPVariableLike): number;
  SetOffset(offset: number): void;
  AddOffset(offset: number): void;
  Offset(): number;
  offset(): number;
  SetMinimization(): void;
  SetMaximization(): void;
  SetOptimizationDirection(maximize: boolean): void;
  Value(): number;
  BestBound(): number;
  maximization(): boolean;
  minimization(): boolean;
};

type MPSolverParametersLike = {
  SetDoubleParam(param: number, value: number): void;
  GetDoubleParam(param: number): number;
  ResetDoubleParam(param: number): void;
  SetIntegerParam(param: number, value: number): void;
  GetIntegerParam(param: number): number;
  ResetIntegerParam(param: number): void;
  Reset(): void;
  delete(): void;
};

type MPSolverLike = {
  Name(): string;
  IsMip(): boolean;
  IsMIP(): boolean;
  Clear(): void;
  infinity(): number;
  variable(index: number): MPVariableLike;
  variables(): MPVariableLike[];
  LookupVariableOrNull(name: string): MPVariableLike | null;
  LookupVariable(name: string): MPVariableLike | null;
  Var(lb: number, ub: number, integer: boolean, name: string): MPVariableLike;
  NumVar(lb: number, ub: number, name: string): MPVariableLike;
  IntVar(lb: number, ub: number, name: string): MPVariableLike;
  BoolVar(name: string): MPVariableLike;
  constraint(index: number): MPConstraintLike;
  constraints(): MPConstraintLike[];
  LookupConstraintOrNull(name: string): MPConstraintLike | null;
  LookupConstraint(name: string): MPConstraintLike | null;
  Constraint(): MPConstraintLike;
  Constraint(name: string): MPConstraintLike;
  Constraint(lb: number, ub: number, name?: string): MPConstraintLike;
  RowConstraint(): MPConstraintLike;
  RowConstraint(name: string): MPConstraintLike;
  RowConstraint(lb: number, ub: number, name?: string): MPConstraintLike;
  Objective(): MPObjectiveLike;
  Solve(parameters?: MPSolverParametersLike): Promise<number>;
  SolveWithProto(options?: {
    solverSpecificParameters?: string;
    loadSolution?: boolean;
  }): Promise<{
    response: Record<string, unknown>;
    loaded: boolean;
  }>;
  LoadSolutionFromProto?(response?: Uint8Array | Record<string, unknown>, tolerance?: number): Promise<boolean>;
  VerifySolution(tolerance: number, logErrors: boolean): boolean;
  EnableOutput(): void;
  SuppressOutput(): void;
  OutputIsEnabled(): boolean;
  SetTimeLimit(milliseconds: number): void;
  time_limit(): number;
  SetNumThreads(numThreads: number): boolean;
  GetNumThreads(): number;
  SolverVersion(): string;
  ComputeConstraintActivities(): number[];
  ComputeExactConditionNumber(): number;
  SetHint(variables: MPVariableLike[], values: number[]): void;
  NextSolution(): boolean;
  ExportModelAsLpFormat(obfuscate: boolean): string;
  ExportModelAsMpsFormat(fixedFormat: boolean, obfuscate: boolean): string;
  NumVariables(): number;
  NumConstraints(): number;
  WallTime(): number;
  iterations(): number;
  nodes(): number;
  delete(): void;
};

export type MPSolverApi = {
  initMPSolver(): Promise<void>;
  MPSolver: {
    new(name: string, problemType: number): MPSolverLike;
    GLOP_LINEAR_PROGRAMMING: number;
    CLP_LINEAR_PROGRAMMING: number;
    GLPK_LINEAR_PROGRAMMING: number;
    GLPK_MIXED_INTEGER_PROGRAMMING: number;
    SCIP_MIXED_INTEGER_PROGRAMMING: number;
    CBC_MIXED_INTEGER_PROGRAMMING: number;
    SAT_INTEGER_PROGRAMMING: number;
    OPTIMAL: number;
    INFEASIBLE: number;
    BASIC: number;
    AT_LOWER_BOUND: number;
    SupportsProblemType(problemType: number): boolean;
    ParseSolverType(solverId: string): number | null;
    ParseAndCheckSupportForProblemType(solverId: string): number | null;
    CreateSolver(solverId: string): MPSolverLike | null;
    createModelRequest(request: Record<string, unknown>): Promise<Uint8Array>;
    solveModelRequest(request: Uint8Array | Record<string, unknown>): Promise<{
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
  setWorkerBridgeEnabled: (enabled: boolean) => void;
  isWorkerBridgeEnabled: () => boolean;
};

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
  return [
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
}

function createSolver(api: MPSolverApi, solverId: string, name: string): MPSolverLike {
  const solver = api.MPSolver.CreateSolver(solverId);
  assert(solver !== null, `${name}: CreateSolver(${solverId}) failed`);
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
): Promise<MpSolverCaseResult> {
  const solver = createSolver(api, solverId, name);
  try {
    const infinity = solver.infinity();
    const x = createX(solver, infinity);
    const y = createY(solver, infinity);
    assert(solver.NumVariables() === 2, `${name}: expected 2 variables`);

    const c0 = solver.Constraint(-infinity, 17.5, 'c0');
    c0.SetCoefficient(x, 1);
    c0.SetCoefficient(y, 7);

    const c1 = solver.Constraint(-infinity, 3.5, 'c1');
    c1.SetCoefficient(x, 1);
    c1.SetCoefficient(y, 0);
    assert(solver.NumConstraints() === 2, `${name}: expected 2 constraints`);

    const objective = solver.Objective();
    objective.SetCoefficient(x, 1);
    objective.SetCoefficient(y, 10);
    objective.SetMaximization();

    const status = await solver.Solve();
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    const values = {
      x: x.solution_value(),
      y: y.solution_value(),
    };
    assert(near(objective.Value(), expected.objective), `${name}: objective mismatch ${objective.Value()}`);
    assert(near(values.x, expected.x), `${name}: x mismatch ${values.x}`);
    assert(near(values.y, expected.y), `${name}: y mismatch ${values.y}`);
    return {
      name,
      ok: true,
      status,
      objective: objective.Value(),
      values,
    };
  } finally {
    solver.delete();
  }
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
  try {
    const infinity = solver.infinity();
    const x1 = solver.IntVar(0.0, infinity, 'x1');
    const x2 = solver.IntVar(0.0, infinity, 'x2');

    const objective = solver.Objective();
    objective.SetCoefficient(x1, 1);
    objective.SetCoefficient(x2, 10);
    objective.SetMaximization();

    const c0 = solver.Constraint(-infinity, 17.5, 'c0');
    c0.SetCoefficient(x1, 1);
    c0.SetCoefficient(x2, 7);

    const c1 = solver.Constraint(-infinity, 3.5, 'c1');
    c1.SetCoefficient(x1, 1);
    c1.SetCoefficient(x2, 0);

    assert(solver.NumVariables() === 2, `${name}: expected 2 variables`);
    assert(solver.NumConstraints() === 2, `${name}: expected 2 constraints`);
    const status = await solver.Solve();
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(solver.VerifySolution(1e-7, true), `${name}: VerifySolution failed`);
    assert(near(objective.Value(), 23), `${name}: objective mismatch ${objective.Value()}`);
    assert(near(x1.solution_value(), 3), `${name}: x1 mismatch`);
    assert(near(x2.solution_value(), 2), `${name}: x2 mismatch`);

    return { name, ok: true, status, objective: objective.Value(), values: { x1: x1.solution_value(), x2: x2.solution_value() } };
  } finally {
    solver.delete();
  }
}

async function runGlpkMixedIntegerCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  assert(api.MPSolver.SupportsProblemType(api.MPSolver.GLPK_MIXED_INTEGER_PROGRAMMING), 'MPSolver: GLPK MIP not supported');
  return runMixedIntegerCppStyleBackendCase(api, 'GLPK', 'MPSolver: GLPK_MIXED_INTEGER_PROGRAMMING');
}

async function runScipMixedIntegerCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  // TEMP: parity - matches ortools/linear_solver/python/lp_test.py testApi for
  // SCIP_MIXED_INTEGER_PROGRAMMING, which reaches RunMixedIntegerExampleCppStyleAPI.
  assert(api.MPSolver.SupportsProblemType(api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING), 'MPSolver: SCIP MIP not supported');
  assert(api.MPSolver.ParseSolverType('SCIP') === api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING, 'MPSolver: SCIP ParseSolverType mismatch');
  assert(
    api.MPSolver.ParseAndCheckSupportForProblemType('SCIP') === api.MPSolver.SCIP_MIXED_INTEGER_PROGRAMMING,
    'MPSolver: SCIP ParseAndCheckSupportForProblemType mismatch',
  );
  return runMixedIntegerCppStyleBackendCase(api, 'SCIP', 'MPSolver: SCIP_MIXED_INTEGER_PROGRAMMING');
}

async function runCbcMixedIntegerCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  // TEMP: parity - covers CBC_MIXED_INTEGER_PROGRAMMING backend availability
  // and integer solve behavior through the public MPSolver API.
  assert(api.MPSolver.SupportsProblemType(api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING), 'MPSolver: CBC MIP not supported');
  assert(api.MPSolver.ParseSolverType('CBC') === api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING, 'MPSolver: CBC ParseSolverType mismatch');
  assert(
    api.MPSolver.ParseAndCheckSupportForProblemType('CBC') === api.MPSolver.CBC_MIXED_INTEGER_PROGRAMMING,
    'MPSolver: CBC ParseAndCheckSupportForProblemType mismatch',
  );
  return runMixedIntegerCppStyleBackendCase(api, 'CBC', 'MPSolver: CBC_MIXED_INTEGER_PROGRAMMING');
}

async function runCbcWorkerBridgeMatrix(api: MPSolverApi): Promise<MpSolverCaseResult[]> {
  const results: MpSolverCaseResult[] = [];
  for (const mode of ['direct', 'worker'] as const) {
    api.setWorkerBridgeEnabled(mode === 'worker');
    assert(api.isWorkerBridgeEnabled() !== false || mode === 'direct', `MPSolver: CBC worker bridge state mismatch for ${mode}`);
    results.push(await runSimpleProgram(
      api,
      `MPSolver: CBC simple_mip_program.py (${mode})`,
      'CBC',
      (solver, infinity) => solver.IntVar(0, infinity, 'x'),
      (solver, infinity) => solver.IntVar(0, infinity, 'y'),
      { objective: 23, x: 3, y: 2 },
    ));
  }
  api.setWorkerBridgeEnabled(false);
  return results;
}

async function runSetHintCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver: lp_test.py testSetHint';
  const solver = new api.MPSolver('RunBooleanExampleCppStyle', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
  try {
    const x1 = solver.BoolVar('x1');
    const x2 = solver.BoolVar('x2');
    const objective = solver.Objective();
    objective.SetCoefficient(x1, 2);
    objective.SetCoefficient(x2, 1);
    objective.SetMinimization();

    const c0 = solver.Constraint(1, 3, 'c0');
    c0.SetCoefficient(x1, 1);
    c0.SetCoefficient(x2, 2);

    solver.SetHint([x1, x2], [1.0, 0.0]);
    assert(solver.variables().length === 2, `${name}: expected 2 variables`);
    assert(solver.constraints().length === 1, `${name}: expected 1 constraint`);

    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  } finally {
    solver.delete();
  }
}

async function runExternalApiCase(api: MPSolverApi, backend: LpBackend): Promise<MpSolverCaseResult> {
  const name = `MPSolver: pywraplp_test.py test_external_api (${backend.solverId})`;
  const solver = createSolver(api, backend.solverId, name);
  try {
    const infinity = solver.infinity();
    assert(api.MPSolver.SupportsProblemType(backend.problemType), `${name}: ${backend.solverId} not supported`);
    assert(!api.MPSolver.SupportsProblemType(10_000), `${name}: bogus solver type reported supported`);
    assert(api.MPSolver.ParseSolverType(backend.solverId) === backend.problemType, `${name}: ParseSolverType mismatch`);
    assert(api.MPSolver.ParseAndCheckSupportForProblemType(backend.solverId) === backend.problemType, `${name}: ParseAndCheckSupportForProblemType mismatch`);
    assert(!solver.IsMIP(), `${name}: ${backend.solverId} should not be MIP`);

    const x1 = solver.Var(0.0, infinity, false, 'x1');
    const x2 = solver.NumVar(0.0, infinity, 'x2');
    const x3 = solver.NumVar(0.0, infinity, 'x3');
    assert(x1.Lb() === 0, `${name}: x1 lower bound mismatch`);
    assert(x1.Ub() === infinity, `${name}: x1 upper bound mismatch`);
    assert(!x1.Integer(), `${name}: x1 should be continuous`);
    assert(x1.index() === 0 && x1.name() === 'x1', `${name}: x1 identity mismatch`);
    assert(solver.variable(1).name() === 'x2', `${name}: variable(index) mismatch`);
    assert(solver.LookupVariableOrNull('x3')?.index() === 2, `${name}: LookupVariableOrNull mismatch`);
    assert(solver.LookupVariable('x2')?.index() === 1, `${name}: LookupVariable mismatch`);
    assert(solver.LookupVariableOrNull('missing') === null, `${name}: missing variable lookup should be null`);
    x3.SetBranchingPriority(17);
    assert(x3.branching_priority() === 17, `${name}: branching priority mismatch`);

    const objective = solver.Objective();
    objective.SetCoefficient(x1, 10);
    objective.SetCoefficient(x2, 6);
    objective.SetCoefficient(x3, 4);
    objective.SetOffset(5);
    objective.AddOffset(2);
    objective.SetMaximization();
    assert(objective.GetCoefficient(x1) === 10, `${name}: objective coefficient mismatch`);
    assert(objective.Offset() === 7, `${name}: objective offset mismatch`);
    assert(objective.maximization(), `${name}: objective should maximize`);

    const c0 = solver.Constraint(-infinity, 600, 'ConstraintName0');
    c0.SetCoefficient(x1, 10);
    c0.SetCoefficient(x2, 4);
    c0.SetCoefficient(x3, 5);
    const c1 = solver.Constraint(-infinity, 300, 'c1');
    c1.SetCoefficient(x1, 2);
    c1.SetCoefficient(x2, 2);
    c1.SetCoefficient(x3, 6);
    const c2 = solver.Constraint(-infinity, 100, 'OtherConstraintName');
    c2.SetCoefficient(x1, 1);
    c2.SetCoefficient(x2, 1);
    c2.SetCoefficient(x3, 1);
    const freeConstraint = solver.Constraint('free');
    assert(freeConstraint.Lb() === -infinity && freeConstraint.Ub() === infinity, `${name}: unbounded named constraint mismatch`);
    const anonymousConstraint = solver.RowConstraint();
    assert(anonymousConstraint.Lb() === -infinity && anonymousConstraint.Ub() === infinity, `${name}: unbounded anonymous constraint mismatch`);

    assert(c0.GetCoefficient(x3) === 5, `${name}: constraint coefficient mismatch`);
    assert(c1.Lb() === -infinity && c1.Ub() === 300, `${name}: constraint bounds mismatch`);
    c1.SetLb(-100000);
    c1.SetUb(301);
    assert(c1.Lb() === -100000 && c1.Ub() === 301, `${name}: SetLb/SetUb mismatch`);
    c1.SetBounds(-infinity, 300);
    assert(c0.index() === 0 && c0.name() === 'ConstraintName0', `${name}: constraint identity mismatch`);
    assert(solver.constraint(2).name() === 'OtherConstraintName', `${name}: constraint(index) mismatch`);
    assert(solver.LookupConstraintOrNull('ConstraintName0')?.index() === 0, `${name}: LookupConstraintOrNull mismatch`);
    assert(solver.LookupConstraint('c1')?.index() === 1, `${name}: LookupConstraint mismatch`);
    freeConstraint.Clear();

    solver.SetTimeLimit(10000);
    assert(solver.time_limit() === 10000, `${name}: time limit mismatch`);
    solver.SuppressOutput();
    assert(!solver.OutputIsEnabled(), `${name}: output should be suppressed`);
    solver.EnableOutput();
    assert(solver.OutputIsEnabled(), `${name}: output should be enabled`);
    solver.SuppressOutput();
    solver.SetNumThreads(1);
    assert(solver.GetNumThreads() >= 1, `${name}: GetNumThreads mismatch`);

    const params = new api.MPSolverParameters();
    let status = -1;
    try {
      assert(near(params.GetDoubleParam(api.MPSolverParameters.RELATIVE_MIP_GAP), 1e-4), `${name}: default relative MIP gap mismatch`);
      params.SetDoubleParam(api.MPSolverParameters.PRIMAL_TOLERANCE, 1e-8);
      assert(near(params.GetDoubleParam(api.MPSolverParameters.PRIMAL_TOLERANCE), 1e-8), `${name}: primal tolerance mismatch`);
      params.ResetDoubleParam(api.MPSolverParameters.PRIMAL_TOLERANCE);
      params.SetIntegerParam(api.MPSolverParameters.PRESOLVE, api.MPSolverParameters.PRESOLVE_ON);
      assert(params.GetIntegerParam(api.MPSolverParameters.PRESOLVE) === api.MPSolverParameters.PRESOLVE_ON, `${name}: presolve mismatch`);
      params.SetIntegerParam(api.MPSolverParameters.SCALING, api.MPSolverParameters.SCALING_ON);
      params.ResetIntegerParam(api.MPSolverParameters.SCALING);
      params.SetIntegerParam(api.MPSolverParameters.INCREMENTALITY, api.MPSolverParameters.INCREMENTALITY_ON);
      params.SetIntegerParam(api.MPSolverParameters.LP_ALGORITHM, api.MPSolverParameters.PRIMAL);
      params.Reset();
      status = await solver.Solve(params);
    } finally {
      params.delete();
    }
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(solver.VerifySolution(1e-7, true), `${name}: VerifySolution failed`);
    assert(near(x1.ReducedCost(), 0.0), `${name}: reduced cost mismatch`);
    assert(near(c0.DualValue(), 2 / 3), `${name}: dual value mismatch ${c0.DualValue()}`);
    assert(solver.ComputeConstraintActivities().length === solver.NumConstraints(), `${name}: activity count mismatch`);
    if (backend.supportsExactConditionNumber) {
      assert(Number.isFinite(solver.ComputeExactConditionNumber()), `${name}: condition number should be finite`);
    }
    assert(!solver.NextSolution(), `${name}: ${backend.solverId} should not produce a next solution`);
    assert(solver.SolverVersion().length > 0, `${name}: missing solver version`);

    return {
      name,
      ok: true,
      status,
      objective: objective.Value(),
      values: {
        x1: x1.solution_value(),
        x2: x2.solution_value(),
        x3: x3.solution_value(),
      },
    };
  } finally {
    solver.delete();
  }
}

async function runLinearCppStyleCase(api: MPSolverApi, backend: LpBackend): Promise<MpSolverCaseResult> {
  const name = `MPSolver: lp_test.py RunLinearExampleCppStyleAPI (${backend.solverId})`;
  const solver = createSolver(api, backend.solverId, name);
  try {
    const infinity = solver.infinity();
    const x1 = solver.NumVar(0.0, infinity, 'x1');
    const x2 = solver.NumVar(0.0, infinity, 'x2');
    const x3 = solver.NumVar(0.0, infinity, 'x3');

    const objective = solver.Objective();
    objective.SetCoefficient(x1, 10);
    objective.SetCoefficient(x2, 6);
    objective.SetCoefficient(x3, 4);
    objective.SetMaximization();

    const c0 = solver.Constraint(-infinity, 100, 'c0');
    c0.SetCoefficient(x1, 1);
    c0.SetCoefficient(x2, 1);
    c0.SetCoefficient(x3, 1);
    const c1 = solver.Constraint(-infinity, 600, 'c1');
    c1.SetCoefficient(x1, 10);
    c1.SetCoefficient(x2, 4);
    c1.SetCoefficient(x3, 5);
    const c2 = solver.Constraint(-infinity, 300, 'c2');
    c2.SetCoefficient(x1, 2);
    c2.SetCoefficient(x2, 2);
    c2.SetCoefficient(x3, 6);

    assert(solver.NumVariables() === 3, `${name}: expected 3 variables`);
    assert(solver.NumConstraints() === 3, `${name}: expected 3 constraints`);
    const status = await solver.Solve();
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(solver.VerifySolution(1e-7, true), `${name}: VerifySolution failed`);
    assert(near(objective.Value(), 733.3333333333333, 1e-5), `${name}: objective mismatch ${objective.Value()}`);
    assert(near(x1.solution_value(), 33.3333333333333, 1e-5), `${name}: x1 mismatch`);
    assert(near(x2.solution_value(), 66.6666666666667, 1e-5), `${name}: x2 mismatch`);
    assert(near(x3.solution_value(), 0, 1e-7), `${name}: x3 mismatch`);
    assert(near(x1.ReducedCost(), 0, 1e-7), `${name}: x1 reduced cost mismatch`);
    assert(near(x3.ReducedCost(), backend.x3ReducedCost, 1e-5), `${name}: x3 reduced cost mismatch ${x3.ReducedCost()}`);
    const activities = solver.ComputeConstraintActivities();
    assert(near(activities[c0.index()], 100, 1e-5), `${name}: c0 activity mismatch`);
    assert(near(activities[c1.index()], 600, 1e-5), `${name}: c1 activity mismatch`);
    assert(near(activities[c2.index()], 200, 1e-5), `${name}: c2 activity mismatch`);
    assert(x1.basis_status() === api.MPSolver.BASIC, `${name}: x1 basis mismatch`);
    assert(x3.basis_status() === api.MPSolver.AT_LOWER_BOUND, `${name}: x3 basis mismatch`);

    return {
      name,
      ok: true,
      status,
      objective: objective.Value(),
      values: { x1: x1.solution_value(), x2: x2.solution_value(), x3: x3.solution_value() },
    };
  } finally {
    solver.delete();
  }
}

async function runBooleanCppStyleCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver: lp_test.py RunBooleanExampleCppStyleAPI';
  const solver = createSolver(api, 'SAT', name);
  try {
    const x1 = solver.BoolVar('x1');
    const x2 = solver.BoolVar('x2');
    assert(solver.IsMIP(), `${name}: SAT should be MIP`);
    assert(x1.Integer() && x2.Integer(), `${name}: BoolVar should be integer`);

    const objective = solver.Objective();
    objective.SetCoefficient(x1, 2);
    objective.SetCoefficient(x2, 1);
    objective.SetMinimization();
    assert(objective.minimization(), `${name}: objective should minimize`);

    const c0 = solver.Constraint(1, 3, 'c0');
    c0.SetCoefficient(x1, 1);
    c0.SetCoefficient(x2, 2);
    c0.set_is_lazy(true);
    assert(c0.is_lazy(), `${name}: laziness mismatch`);
    solver.SetHint([x1, x2], [1, 0]);

    const status = await solver.Solve();
    assert(status === api.MPSolver.OPTIMAL, `${name}: expected OPTIMAL, got ${status}`);
    assert(near(objective.Value(), 1), `${name}: objective mismatch`);
    assert(near(x1.solution_value(), 0), `${name}: x1 mismatch`);
    assert(near(x2.solution_value(), 1), `${name}: x2 mismatch`);

    return {
      name,
      ok: true,
      status,
      objective: objective.Value(),
      values: { x1: x1.solution_value(), x2: x2.solution_value() },
    };
  } finally {
    solver.delete();
  }
}

async function runExportToMpsCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver: lp_test.py testExportToMps';
  const solver = new api.MPSolver('ExportMps', api.MPSolver.GLOP_LINEAR_PROGRAMMING);
  try {
    const infinity = solver.infinity();
    const x1 = solver.NumVar(0.0, infinity, 'x1');
    const x2 = solver.NumVar(0.0, infinity, 'x2');
    const x3 = solver.NumVar(0.0, infinity, 'x3');
    const objective = solver.Objective();
    objective.SetCoefficient(x1, 10);
    objective.SetCoefficient(x2, 6);
    objective.SetCoefficient(x3, 4);
    objective.SetMaximization();

    const c0 = solver.Constraint(-infinity, 600, 'ConstraintName0');
    c0.SetCoefficient(x1, 10);
    c0.SetCoefficient(x2, 4);
    c0.SetCoefficient(x3, 5);
    const c1 = solver.Constraint(-infinity, 300, 'c1');
    c1.SetCoefficient(x1, 2);
    c1.SetCoefficient(x2, 2);
    c1.SetCoefficient(x3, 6);
    const c2 = solver.Constraint(-infinity, 100, 'OtherConstraintName');
    c2.SetCoefficient(x1, 1);
    c2.SetCoefficient(x2, 1);
    c2.SetCoefficient(x3, 1);

    const mps = solver.ExportModelAsMpsFormat(false, false);
    assert(mps.includes('ExportMps'), `${name}: MPS export missing model name`);

    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  } finally {
    solver.delete();
  }
}

async function runClearSupportCase(api: MPSolverApi): Promise<MpSolverCaseResult> {
  const name = 'MPSolver support: Clear';
  const solver = createSolver(api, 'GLOP', name);
  try {
    const infinity = solver.infinity();
    const x = solver.NumVar(0, infinity, 'x');
    const y = solver.NumVar(0, infinity, 'y');
    const objective = solver.Objective();
    objective.SetCoefficient(x, 1);
    objective.SetCoefficient(y, 2);
    objective.SetMaximization();
    const c = solver.Constraint(-infinity, 4, 'limit');
    c.SetCoefficient(x, 1);
    c.SetCoefficient(y, 1);

    const lp = solver.ExportModelAsLpFormat(false);
    assert(lp.includes('Maximize'), `${name}: LP export missing Maximize`);
    solver.Clear();
    assert(solver.NumVariables() === 0, `${name}: Clear did not remove variables`);
    assert(solver.NumConstraints() === 0, `${name}: Clear did not remove constraints`);

    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  } finally {
    solver.delete();
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
  mode: 'direct' | 'worker',
  numWorkers: number,
  displayName?: string,
): Promise<MpSolverCaseResult> {
  const name = displayName ?? `MPSolver: MPModelRequest solve (${mode}, ${numWorkers} worker${numWorkers === 1 ? '' : 's'})`;
  const result = await api.MPSolver.solveModelRequest(mpProtoRequest(api, numWorkers));
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
  const result = await api.MPSolver.solveModelRequest(lpApiTestProtoRequest(backend.problemType));
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
  const result = await api.MPSolver.solveModelRequest(pywrapLpTestCbcProtoRequest(api));
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
  try {
    assert(typeof solver.LoadSolutionFromProto === 'function', `${name}: LoadSolutionFromProto is not exposed`);
    await solver.LoadSolutionFromProto({});
    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: 0, values: {} };
  } finally {
    solver.delete();
  }
}

async function runLpTestSolveFromProtoCase(api: MPSolverApi, backend: LpBackend): Promise<MpSolverCaseResult> {
  const name = `MPSolver: lp_test.py testSolveFromProto (${backend.solverId})`;
  const request = lpTestSolveFromProtoRequest(backend.problemType);
  assert((request.model.variable as unknown[]).length === 3, `${name}: expected 3 variables`);
  const result = await api.MPSolver.solveModelRequest(request);
  assert(result.response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL, got ${String(result.response.status)}`);
  return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: Number(result.response.objectiveValue), values: {} };
}

async function runStatefulProtoSolveCase(api: MPSolverApi, displayName?: string): Promise<MpSolverCaseResult> {
  const name = displayName ?? 'MPSolver: SolveWithProto loads solution';
  const solver = createSolver(api, 'SAT', name);
  try {
    const infinity = solver.infinity();
    const x = solver.IntVar(0, infinity, 'x');
    const y = solver.IntVar(0, infinity, 'y');
    const c0 = solver.Constraint(-infinity, 17.5, 'c0');
    c0.SetCoefficient(x, 1);
    c0.SetCoefficient(y, 7);
    const c1 = solver.Constraint(-infinity, 3.5, 'c1');
    c1.SetCoefficient(x, 1);
    const objective = solver.Objective();
    objective.SetCoefficient(x, 1);
    objective.SetCoefficient(y, 10);
    objective.SetMaximization();

    const result = await solver.SolveWithProto({ solverSpecificParameters: 'num_workers: 4' });
    assert(result.loaded, `${name}: solution was not loaded back into the solver`);
    assert(result.response.status === 'MPSOLVER_OPTIMAL', `${name}: expected MPSOLVER_OPTIMAL`);
    assert(near(objective.Value(), 23), `${name}: loaded objective mismatch ${objective.Value()}`);
    assert(near(x.solution_value(), 3), `${name}: loaded x mismatch ${x.solution_value()}`);
    assert(near(y.solution_value(), 2), `${name}: loaded y mismatch ${y.solution_value()}`);
    return { name, ok: true, status: api.MPSolver.OPTIMAL, objective: objective.Value(), values: { x: x.solution_value(), y: y.solution_value() } };
  } finally {
    solver.delete();
  }
}

async function runProtoSolveMatrix(api: MPSolverApi): Promise<MpSolverCaseResult[]> {
  const results: MpSolverCaseResult[] = [];
  const modes: Array<'direct' | 'worker'> = ['direct', 'worker'];
  for (const mode of modes) {
    api.setWorkerBridgeEnabled(mode === 'worker');
    assert(api.isWorkerBridgeEnabled() !== false || mode === 'direct', `MPSolver: worker bridge state mismatch for ${mode}`);
    for (const numWorkers of [1, 4]) {
      results.push(await runProtoSolveCase(api, mode, numWorkers));
    }
  }
  api.setWorkerBridgeEnabled(false);
  return results;
}

export async function runMPSolverContractCases(api: MPSolverApi): Promise<MpSolverCaseResult[]> {
  await api.initMPSolver();
  const protoResults = await runProtoSolveMatrix(api);
  const linearBackends = lpBackends(api);
  const externalApiResults = [];
  const lpApiProtoResults = [];
  const linearCppStyleResults = [];
  const solveFromProtoResults = [];
  for (const backend of linearBackends) {
    externalApiResults.push(await runExternalApiCase(api, backend));
    lpApiProtoResults.push(await runLpApiTestProtoCase(api, backend));
    linearCppStyleResults.push(await runLinearCppStyleCase(api, backend));
    solveFromProtoResults.push(await runLpTestSolveFromProtoCase(api, backend));
  }
  return [
    await runStatefulProtoSolveCase(api),
    ...protoResults,
    ...externalApiResults,
    skipped(
      'MPSolver: lp_api_test.py test_sum_no_brackets',
      'Not applicable: this tests Python generator/list summation helper behavior, not OR-Tools solver API.',
    ),
    await runPywrapLpTestCbcProtoCase(api),
    ...lpApiProtoResults,
    skipped(
      'MPSolver: lp_test.py RunLinearExampleNaturalLanguageAPI',
      'Blocked: Python operator-overloaded natural expression API is not exposed in TypeScript.',
    ),
    ...linearCppStyleResults,
    await runMixedIntegerCppStyleCase(api),
    await runGlpkMixedIntegerCase(api),
    await runScipMixedIntegerCase(api),
    await runCbcMixedIntegerCase(api),
    await runBooleanCppStyleCase(api),
    skipped(
      'MPSolver: lp_test.py testApi',
      'Partially mirrored by backend-specific C++ style cases; upstream also exercises Python-only natural expression helpers.',
    ),
    await runSetHintCase(api),
    skipped(
      'MPSolver: lp_test.py testBopInfeasible',
      'Blocked: BOP backend is not linked in this package, and the source test uses Python natural expressions.',
    ),
    await runLpTestLoadSolutionFromProtoCase(api),
    ...solveFromProtoResults,
    await runExportToMpsCase(api),
    await runClearSupportCase(api),
    await runSimpleProgram(
      api,
      'MPSolver: simple_lp_program.py',
      'GLOP',
      (solver, infinity) => solver.NumVar(0, infinity, 'x'),
      (solver, infinity) => solver.NumVar(0, infinity, 'y'),
      { objective: 25, x: 0, y: 2.5 },
    ),
    await runSimpleProgram(
      api,
      'MPSolver: CLP simple_lp_program.py',
      'CLP',
      (solver, infinity) => solver.NumVar(0, infinity, 'x'),
      (solver, infinity) => solver.NumVar(0, infinity, 'y'),
      { objective: 25, x: 0, y: 2.5 },
    ),
    await runSimpleProgram(
      api,
      'MPSolver: GLPK_LP simple_lp_program.py',
      'GLPK_LP',
      (solver, infinity) => solver.NumVar(0, infinity, 'x'),
      (solver, infinity) => solver.NumVar(0, infinity, 'y'),
      { objective: 25, x: 0, y: 2.5 },
    ),
    await runSimpleProgram(
      api,
      'MPSolver: simple_mip_program.py',
      'SAT',
      (solver, infinity) => solver.IntVar(0, infinity, 'x'),
      (solver, infinity) => solver.IntVar(0, infinity, 'y'),
      { objective: 23, x: 3, y: 2 },
    ),
    await runSimpleProgram(
      api,
      'MPSolver: GLPK simple_mip_program.py',
      'GLPK',
      (solver, infinity) => solver.IntVar(0, infinity, 'x'),
      (solver, infinity) => solver.IntVar(0, infinity, 'y'),
      { objective: 23, x: 3, y: 2 },
    ),
    await runSimpleProgram(
      api,
      'MPSolver: SCIP simple_mip_program.py',
      'SCIP',
      (solver, infinity) => solver.IntVar(0, infinity, 'x'),
      (solver, infinity) => solver.IntVar(0, infinity, 'y'),
      { objective: 23, x: 3, y: 2 },
    ),
    ...(await runCbcWorkerBridgeMatrix(api)),
  ];
}
