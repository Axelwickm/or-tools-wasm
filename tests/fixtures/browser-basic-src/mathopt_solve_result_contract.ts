type MathOptVariableLike = {
  readonly id: number;
  readonly name: string;
};

type MathOptLinearConstraintLike = {
  readonly id: number;
  readonly name: string;
};

type MathOptModelLike = {
  addVariable(options?: {
    lowerBound?: number;
    upperBound?: number;
    integer?: boolean;
    name?: string;
  }): MathOptVariableLike;
  addLinearConstraint(options: {
    lowerBound?: number;
    upperBound?: number;
    terms: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    name?: string;
  }): MathOptLinearConstraintLike;
  maximize(terms: Array<{ variable: MathOptVariableLike; coefficient: number }>, offset?: number): void;
  minimize(terms: Array<{ variable: MathOptVariableLike; coefficient: number }>, offset?: number): void;
};

type MathOptSolveResult = {
  terminationReason: string;
  primalBound: number | null;
  dualBound: number | null;
  objectiveValue: number | null;
  variableValues: Record<string, number>;
  variableValuesById: Record<number, number>;
  solutions: Array<{
    primalSolution: {
      objectiveValue: number | null;
      variableValues: Record<string, number>;
      variableValuesById: Record<number, number>;
    } | null;
    dualSolution: {
      objectiveValue: number | null;
      dualValues: Record<string, number>;
      dualValuesById: Record<number, number>;
      reducedCosts: Record<string, number>;
      reducedCostsById: Record<number, number>;
    } | null;
  }>;
  rawResponse: Uint8Array;
};

type MathOptSolveOptions = {
  solverType?: number | keyof MathOptSolverTypeLike;
  threads?: number;
};

type MathOptSolverTypeLike = {
  GLOP: number;
  GSCIP?: number;
  CP_SAT: number;
};

type MathOptApi = {
  initMathOpt(): Promise<void>;
  MathOpt: {
    SolverType: MathOptSolverTypeLike;
    Model(name?: string): MathOptModelLike;
    solve(model: MathOptModelLike, options?: MathOptSolveOptions): Promise<MathOptSolveResult>;
    setWorkerBridgeEnabled?: (enabled: boolean) => void;
  };
};

type MathOptContractCase = {
  name: string;
  source: string;
  run(api: MathOptApi): Promise<string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function near(actual: number | null | undefined, expected: number, tolerance = 1e-7) {
  assert(typeof actual === 'number', `expected numeric value, got ${String(actual)}`);
  assert(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

function listIsNear(actual: number[], expected: number[], tolerance = 1e-5) {
  return actual.length === expected.length
    && actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
}

function assertOptional(result: { rawResponse: Uint8Array }, message = 'expected rawResponse to be present') {
  assert(
    result.rawResponse instanceof Uint8Array && result.rawResponse.length > 0,
    message,
  );
}

function todoUnavailable(name: string, missing: string): MathOptContractCase {
  return {
    name,
    source: 'ortools/math_opt/python',
    async run() {
      return `TODO: ${name} is not yet supported by the TS MathOpt API (${missing})`;
    },
  };
}

async function runSolveWithErrorBoundary<T>(runner: () => Promise<T>) {
  try {
    await runner();
    return false;
  } catch {
    return true;
  }
}

// Ported from ortools/math_opt/python/solve_test.py:72-77 (test_solve_error)
async function testSolveError(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_solve_error';
  const mod = api.MathOpt.Model('test_solve_error');
  mod.addVariable({ lowerBound: 1.0, upperBound: -1.0, name: 'x1' });
  const failed = await runSolveWithErrorBoundary(async () => {
    await api.MathOpt.solve(mod, { solverType: api.MathOpt.SolverType.GLOP });
  });
  assert(failed, `${name}: expected solve to fail on invalid bounds`);
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:78-137 (test_lp_solve)
async function testLinearSolve(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_lp_solve';
  const model = api.MathOpt.Model('test_lp_solve');
  const x1 = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x1' });
  const x2 = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x2' });
  const c = model.addLinearConstraint({
    upperBound: 1,
    name: 'c',
    terms: [
      { variable: x1, coefficient: 1 },
      { variable: x2, coefficient: 1 },
    ],
  });
  model.maximize([
    { variable: x1, coefficient: 1 },
    { variable: x2, coefficient: 2 },
  ]);

  const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GLOP });
  assert(
    result.terminationReason === 'TERMINATION_REASON_OPTIMAL',
    `${name}: expected termination OPTIMAL, got ${result.terminationReason}`,
  );
  near(result.primalBound, 2);
  assert(result.solutions.length >= 1, `${name}: expected at least one solution`);
  const solution = result.solutions[0];
  assert(solution.primalSolution !== null, `${name}: expected primal solution`);
  assert(solution.dualSolution !== null, `${name}: expected dual solution`);
  near(result.objectiveValue, 2);
  near(solution.primalSolution.objectiveValue, 2);
  near(result.variableValues.x1, 0);
  near(result.variableValues.x2, 1);
  near(result.variableValuesById[x1.id], 0);
  near(result.variableValuesById[x2.id], 1);
  near(solution.primalSolution.variableValues.x1, 0);
  near(solution.primalSolution.variableValues.x2, 1);
  const dual = solution.dualSolution;
  near(dual.objectiveValue, 2);
  assert(Object.keys(dual.dualValues).join(',') === 'c', `${name}: expected dual value only for c`);
  assert(Object.keys(dual.reducedCosts).sort().join(',') === 'x1,x2', `${name}: expected reduced costs for x1,x2`);
  const dualVec = [
    dual.dualValues.c,
    dual.reducedCosts.x1,
    dual.reducedCosts.x2,
  ];
  assert(
    listIsNear(dualVec, [1, 0, 1]) || listIsNear(dualVec, [2, -1, 0]),
    `${name}: dual_vec is ${dualVec.join(',')}; expected 1,0,1 or 2,-1,0`,
  );
  assert(typeof dual.dualValuesById[c.id] === 'number', `${name}: expected dualValuesById for c`);
  assert(typeof dual.reducedCostsById[x1.id] === 'number', `${name}: expected reducedCostsById for x1`);
  assert(typeof dual.reducedCostsById[x2.id] === 'number', `${name}: expected reducedCostsById for x2`);
  assertOptional(result, `${name}: solve should include non-empty rawResponse`);
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:139-161 (test_indicator)
const testIndicator = todoUnavailable(
  'SolveTest/test_indicator',
  'Model.add_indicator_constraint is missing from JS MathOpt model API',
);

// Ported from ortools/math_opt/python/solve_test.py:162-216 (test_filters)
const testFilters = todoUnavailable(
  'SolveTest/test_filters',
  'Model.solve does not expose model/solve parameters or sparse vector filters',
);

// Ported from ortools/math_opt/python/solve_test.py:217-236 (test_message_callback)
const testMessageCallback = todoUnavailable(
  'SolveTest/test_message_callback',
  'solve(msg_cb=...) callback channel is not exposed in TS API',
);

// Ported from ortools/math_opt/python/solve_test.py:237-259 (test_solve_interrupter)
const testSolveInterrupter = todoUnavailable(
  'SolveTest/test_solve_interrupter',
  'solve(interrupter=...) is not exposed in TS API',
);

// Ported from ortools/math_opt/python/solve_test.py:262-271 (test_solve_duplicated_names)
const testDuplicatedNames = todoUnavailable(
  'SolveTest/test_solve_duplicated_names',
  'duplicate-name validation and remove_names controls are not exposed',
);

// Ported from ortools/math_opt/python/solve_test.py:286-615 (incremental solve family)
const testIncrementalSolve = todoUnavailable(
  'SolveTest.incremental*',
  'IncrementalSolver API is not available in TS MathOpt bindings',
);

// Ported from ortools/math_opt/python/result_test.py and related modules.
const testResultParsing = todoUnavailable(
  'SolveResult/termination/solution parse & proto round-trip',
  'Python-level result proto objects and parser APIs are not exposed in TS',
);

const testSolutionParsing = todoUnavailable(
  'Solution parse/round-trip and ray/basis helpers',
  'Python-level solution object/proto APIs are not exposed in TS',
);

const testParametersParsing = todoUnavailable(
  'parameters_test.py: solve/model parameter proto mappings',
  'parameters.py model/solve-specific parameter classes are not exposed in TS',
);

const testSparseContainers = todoUnavailable(
  'sparse_containers_test.py: sparse vector proto conversion/parsing',
  'sparse_containers serialization/parsing APIs are not exposed in TS',
);

// Porting the existing JS/TS-capable solve path for MIP with CP-SAT
// (related to solve_test coverage, and aligned with current MathOpt bridge capabilities).
async function testCpSatMip(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_cp_sat_mip_like';
  const model = api.MathOpt.Model('mathopt_mip');
  const x = model.addVariable({
    lowerBound: 0,
    upperBound: 10,
    integer: true,
    name: 'x',
  });
  const y = model.addVariable({
    lowerBound: 0,
    upperBound: 10,
    integer: true,
    name: 'y',
  });
  model.addLinearConstraint({
    upperBound: 4,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
  });
  model.addLinearConstraint({
    upperBound: 2,
    terms: [{ variable: x, coefficient: 1 }],
  });
  model.maximize([
    { variable: x, coefficient: 1 },
    { variable: y, coefficient: 2 },
  ]);

  const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.CP_SAT });
  assert(
    result.terminationReason === 'TERMINATION_REASON_OPTIMAL',
    `${name}: expected termination OPTIMAL, got ${result.terminationReason}`,
  );
  near(result.objectiveValue, 8);
  assert(result.variableValues.x === 0 || result.variableValues.x === 0.0, `${name}: expected x=0`);
  near(result.variableValues.y, 4);
  return `${name} PASS`;
}

export const mathoptSolveResultContractCases: MathOptContractCase[] = [
  {
    name: 'SolveTest/test_solve_error',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testSolveError,
  },
  {
    name: 'SolveTest/test_lp_solve',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testLinearSolve,
  },
  {
    name: 'SolveTest/test_cp_sat_mip_like',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testCpSatMip,
  },
  testIndicator,
  testFilters,
  testMessageCallback,
  testSolveInterrupter,
  testDuplicatedNames,
  testIncrementalSolve,
  {
    name: 'MathOpt API/solve_options_support_check',
    source: 'ortools/math_opt/python/solve_test.py',
    run: async function (api) {
      const name = 'MathOpt API/solve_options_support_check';
      const model = api.MathOpt.Model('solve_options_check');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      model.maximize([{ variable: x, coefficient: 1 }]);
      const direct = await api.MathOpt.solve(model, {
        solverType: 'GLOP',
        threads: 2,
      });
      near(direct.objectiveValue, 1);
      assert(direct.rawResponse instanceof Uint8Array, `${name}: expected rawResponse bytes`);
      assert(direct.rawResponse.length > 0, `${name}: expected non-empty rawResponse`);
      return `${name} PASS`;
    },
  },
  {
    name: 'MathOpt API/duplicate_objective_access',
    source: 'ortools/math_opt/python/result_test.py',
    run: async function (api) {
      const name = 'MathOpt API/duplicate_objective_access';
      const model = api.MathOpt.Model('result_support_check');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      model.maximize([{ variable: x, coefficient: 1 }]);
      const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GLOP });
      assert(
        typeof result.objectiveValue === 'number',
        `${name}: objectiveValue should be available on result`,
      );
      assert(
        typeof result.variableValues.x === 'number',
        `${name}: named variableValues should be available`,
      );
      assert(
        typeof result.variableValuesById[x.id] === 'number',
        `${name}: variableValuesById should be available`,
      );
      return `${name} PASS`;
    },
  },
  testResultParsing,
  testSolutionParsing,
  testParametersParsing,
  testSparseContainers,
];

export async function runMathOptSolveResultContractCases(api: MathOptApi): Promise<string[]> {
  await api.initMathOpt();
  const results: string[] = [];
  for (const testCase of mathoptSolveResultContractCases) {
    results.push(await testCase.run(api));
  }
  return results;
}
