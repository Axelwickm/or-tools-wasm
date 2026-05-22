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
  timeLimitSeconds?: number;
  iterationLimit?: number;
  nodeLimit?: number;
  cutoffLimit?: number;
  objectiveLimit?: number;
  bestBoundLimit?: number;
  solutionLimit?: number;
  enableOutput?: boolean;
  randomSeed?: number;
  absoluteGapTolerance?: number;
  relativeGapTolerance?: number;
  solutionPoolSize?: number;
  lpAlgorithm?: number | string;
  presolve?: number | string;
  cuts?: number | string;
  heuristics?: number | string;
  scaling?: number | string;
  gscip?: unknown;
  glop?: unknown;
  cpSat?: unknown;
  pdlp?: unknown;
  glpk?: unknown;
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
    LPAlgorithm: Record<string, string | number>;
    Emphasis: Record<string, string | number>;
    GScipEmphasis: Record<string, string | number>;
    GScipMetaParamValue: Record<string, string | number>;
    PdlpRestartStrategy: Record<string, string | number>;
    PdlpSchedulerType: Record<string, string | number>;
    GScipParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    GlopParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    PdlpParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    GlpkParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    Model(name?: string): MathOptModelLike;
    solve(model: MathOptModelLike, options?: MathOptSolveOptions): Promise<MathOptSolveResult>;
    encodeSolveRequest(model: MathOptModelLike, options?: MathOptSolveOptions): Uint8Array;
    setWorkerBridgeEnabled: (enabled: boolean) => void;
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

type ProtoField = { field: number; wireType: number; value: bigint | number | Uint8Array };

function readVarint(bytes: Uint8Array, start: number): { value: bigint; offset: number } {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  throw new Error('unexpected end of varint');
}

function readProtoFields(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const wireType = Number(key.value & 7n);
    const field = Number(key.value >> 3n);
    if (wireType === 0) {
      const value = readVarint(bytes, offset);
      offset = value.offset;
      fields.push({ field, wireType, value: value.value });
    } else if (wireType === 1) {
      const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true);
      offset += 8;
      fields.push({ field, wireType, value });
    } else if (wireType === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const end = offset + Number(length.value);
      fields.push({ field, wireType, value: bytes.slice(offset, end) });
      offset = end;
    } else {
      throw new Error(`unsupported wire type ${wireType}`);
    }
  }
  return fields;
}

function fieldValue(fields: ProtoField[], field: number): ProtoField {
  const found = fields.find((entry) => entry.field === field);
  assert(found, `expected proto field ${field}`);
  return found;
}

function nestedFields(fields: ProtoField[], field: number): ProtoField[] {
  const value = fieldValue(fields, field).value;
  assert(value instanceof Uint8Array, `expected field ${field} to be length-delimited`);
  return readProtoFields(value);
}

function assertVarint(fields: ProtoField[], field: number, expected: number | bigint) {
  const value = fieldValue(fields, field).value;
  assert(typeof value === 'bigint', `expected field ${field} to be varint`);
  assert(value === BigInt(expected), `expected field ${field} to be ${String(expected)}, got ${String(value)}`);
}

function assertDouble(fields: ProtoField[], field: number, expected: number, tolerance = 1e-9) {
  const value = fieldValue(fields, field).value;
  assert(typeof value === 'number', `expected field ${field} to be double`);
  assert(Math.abs(value - expected) <= tolerance, `expected field ${field} to be ${expected}, got ${value}`);
}

function assertMessageField(fields: ProtoField[], field: number) {
  const value = fieldValue(fields, field).value;
  assert(value instanceof Uint8Array && value.length > 0, `expected field ${field} to contain message bytes`);
}

function enumNumber(value: string | number): number {
  assert(typeof value === 'number', `expected numeric enum value, got ${String(value)}`);
  return value;
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

// API-surface parity for ortools/math_opt/python/parameters.py SolveParameters.
async function testSolveParametersProtoEncoding(api: MathOptApi): Promise<string> {
  const name = 'parameters_test.py/SolveParameters common proto mappings';
  const model = api.MathOpt.Model('solve_parameter_encoding');
  model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
  const request = api.MathOpt.encodeSolveRequest(model, {
    solverType: 'GSCIP',
    timeLimitSeconds: 1.25,
    iterationLimit: 12,
    nodeLimit: 13,
    cutoffLimit: 14.5,
    objectiveLimit: 15.5,
    bestBoundLimit: 16.5,
    solutionLimit: 2,
    enableOutput: true,
    threads: 4,
    randomSeed: 7,
    absoluteGapTolerance: 1e-5,
    relativeGapTolerance: 1e-4,
    solutionPoolSize: 3,
    lpAlgorithm: api.MathOpt.LPAlgorithm.DUAL_SIMPLEX,
    presolve: api.MathOpt.Emphasis.HIGH,
    cuts: api.MathOpt.Emphasis.LOW,
    heuristics: api.MathOpt.Emphasis.MEDIUM,
    scaling: api.MathOpt.Emphasis.OFF,
  });
  const requestFields = readProtoFields(request);
  assertVarint(requestFields, 1, api.MathOpt.SolverType.GSCIP ?? 1);
  const parameters = nestedFields(requestFields, 4);
  const timeLimit = nestedFields(parameters, 1);
  assertVarint(timeLimit, 1, 1);
  assertVarint(timeLimit, 2, 250_000_000);
  assertVarint(parameters, 2, 12);
  assertVarint(parameters, 3, 1);
  assertVarint(parameters, 4, 4);
  assertVarint(parameters, 5, 7);
  assertVarint(parameters, 6, enumNumber(api.MathOpt.LPAlgorithm.DUAL_SIMPLEX));
  assertVarint(parameters, 7, enumNumber(api.MathOpt.Emphasis.HIGH));
  assertVarint(parameters, 8, enumNumber(api.MathOpt.Emphasis.LOW));
  assertVarint(parameters, 9, enumNumber(api.MathOpt.Emphasis.MEDIUM));
  assertVarint(parameters, 10, enumNumber(api.MathOpt.Emphasis.OFF));
  assertDouble(parameters, 17, 1e-4);
  assertDouble(parameters, 18, 1e-5);
  assertDouble(parameters, 20, 14.5);
  assertDouble(parameters, 21, 15.5);
  assertDouble(parameters, 22, 16.5);
  assertVarint(parameters, 23, 2);
  assertVarint(parameters, 24, 13);
  assertVarint(parameters, 25, 3);
  return `${name} PASS`;
}

async function testBackendParameterProtoEncoding(api: MathOptApi): Promise<string> {
  const name = 'parameters_test.py/backend-specific solve parameter proto mappings';
  const model = api.MathOpt.Model('backend_parameter_encoding');
  model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
  const request = api.MathOpt.encodeSolveRequest(model, {
    solverType: 'GSCIP',
    gscip: new api.MathOpt.GScipParameters({
      emphasis: api.MathOpt.GScipEmphasis.OPTIMALITY,
      heuristics: api.MathOpt.GScipMetaParamValue.FAST,
      presolve: api.MathOpt.GScipMetaParamValue.AGGRESSIVE,
      separating: api.MathOpt.GScipMetaParamValue.OFF,
      boolParams: { 'branching/relpscost/propagate': true },
      intParams: { 'display/verblevel': 0 },
      realParams: { 'limits/gap': 0.01 },
      stringParams: { 'visual/vbcfilename': 'none' },
      silenceOutput: true,
      numSolutions: 2,
      objectiveLimit: 10,
    }),
    glop: { usePreprocessing: false, useScaling: false, useDualSimplex: true, maxTimeInSeconds: 2 },
    cpSat: { numWorkers: 4, maxTimeInSeconds: 3, logSearchProgress: true },
    pdlp: {
      numThreads: 2,
      terminationCriteria: {
        iterationLimit: 20,
        simpleOptimalityCriteria: { epsOptimalAbsolute: 1e-6, epsOptimalRelative: 1e-5 },
      },
      restartStrategy: api.MathOpt.PdlpRestartStrategy.NO_RESTARTS,
      schedulerType: api.MathOpt.PdlpSchedulerType.GOOGLE_THREADPOOL,
      lInfRuizIterations: 10,
      l2NormRescaling: false,
    },
    glpk: new api.MathOpt.GlpkParameters({ computeUnboundRaysIfPossible: true }),
  });
  const parameters = nestedFields(readProtoFields(request), 4);
  const gscip = nestedFields(parameters, 12);
  assertVarint(gscip, 1, enumNumber(api.MathOpt.GScipEmphasis.OPTIMALITY));
  assertVarint(gscip, 2, enumNumber(api.MathOpt.GScipMetaParamValue.FAST));
  assertVarint(gscip, 3, enumNumber(api.MathOpt.GScipMetaParamValue.AGGRESSIVE));
  assertVarint(gscip, 4, enumNumber(api.MathOpt.GScipMetaParamValue.OFF));
  assertMessageField(gscip, 5);
  assertMessageField(gscip, 6);
  assertMessageField(gscip, 8);
  assertMessageField(gscip, 10);
  assertVarint(gscip, 11, 1);
  assertVarint(gscip, 17, 2);
  assertDouble(gscip, 18, 10);
  const glop = nestedFields(parameters, 14);
  assertVarint(glop, 16, 0);
  assertDouble(glop, 26, 2);
  assertVarint(glop, 31, 1);
  assertVarint(glop, 34, 0);
  const cpSat = nestedFields(parameters, 15);
  assertDouble(cpSat, 36, 3);
  assertVarint(cpSat, 41, 1);
  assertVarint(cpSat, 206, 4);
  const pdlp = nestedFields(parameters, 16);
  assertVarint(pdlp, 2, 2);
  assertVarint(pdlp, 6, enumNumber(api.MathOpt.PdlpRestartStrategy.NO_RESTARTS));
  assertVarint(pdlp, 9, 10);
  assertVarint(pdlp, 10, 0);
  assertVarint(pdlp, 32, enumNumber(api.MathOpt.PdlpSchedulerType.GOOGLE_THREADPOOL));
  const pdlpTermination = nestedFields(pdlp, 1);
  assertVarint(pdlpTermination, 7, 20);
  assertMessageField(pdlpTermination, 9);
  const glpk = nestedFields(parameters, 26);
  assertVarint(glpk, 1, 1);
  return `${name} PASS`;
}

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
    name: 'parameters_test.py/SolveParameters common proto mappings',
    source: 'ortools/math_opt/python/parameters_test.py',
    run: testSolveParametersProtoEncoding,
  },
  {
    name: 'parameters_test.py/backend-specific solve parameter proto mappings',
    source: 'ortools/math_opt/python/parameters_test.py',
    run: testBackendParameterProtoEncoding,
  },
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
