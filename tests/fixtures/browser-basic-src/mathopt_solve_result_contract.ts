type MathOptVariableLike = {
  readonly id: number;
  readonly name: string;
  upperBound?: number;
  upper_bound?: number;
};

type MathOptLinearConstraintLike = {
  readonly id: number;
  readonly name: string;
  upperBound?: number;
  upper_bound?: number;
};

type MathOptModelLike = {
  readonly name: string;
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
  addIndicatorConstraint?(options: {
    indicator?: MathOptVariableLike;
    activateOnZero?: boolean;
    impliedConstraint?: unknown;
    lowerBound?: number;
    upperBound?: number;
    terms?: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    name?: string;
  }): unknown;
  maximize(terms: Array<{ variable: MathOptVariableLike; coefficient: number }>, offset?: number): void;
  minimize(terms: Array<{ variable: MathOptVariableLike; coefficient: number }>, offset?: number): void;
};

type MathOptSolveResult = {
  terminationReason: string;
  terminationLimit: string | null;
  primalBound: number | null;
  dualBound: number | null;
  solveTimeSeconds: number | null;
  primalStatus?: string | null;
  dualStatus?: string | null;
  primalOrDualInfeasible?: boolean;
  objectiveValue: number | null;
  variableValues: Record<string, number>;
  variableValuesById: Record<number, number>;
  solutions: Array<{
    primalSolution: {
      objectiveValue: number | null;
      variableValues: Record<string, number>;
      variableValuesById: Record<number, number>;
      feasibilityStatus?: string;
    } | null;
    dualSolution: {
      objectiveValue: number | null;
      dualValues: Record<string, number>;
      dualValuesById: Record<number, number>;
      reducedCosts: Record<string, number>;
      reducedCostsById: Record<number, number>;
      feasibilityStatus?: string;
    } | null;
    basis?: {
      variableStatus: Record<string, string>;
      variableStatusById: Record<number, string>;
      constraintStatus: Record<string, string>;
      constraintStatusById: Record<number, string>;
    } | null;
  }>;
  primalRays?: Array<{
    variableValues: Record<string, number>;
    variableValuesById: Record<number, number>;
  }>;
  dualRays?: Array<{
    dualValues: Record<string, number>;
    dualValuesById: Record<number, number>;
    reducedCosts: Record<string, number>;
    reducedCostsById: Record<number, number>;
  }>;
  messages: string[];
  rawResponse: Uint8Array;
  solve_time(): number | null;
  best_objective_bound(): number | null;
  has_primal_feasible_solution(): boolean;
  has_dual_feasible_solution(): boolean;
  has_ray(): boolean;
  has_dual_ray(): boolean;
  has_basis(): boolean;
  bounded(): boolean;
  objective_value(): number;
  variable_values(): Record<string, number>;
  variable_values(variable: MathOptVariableLike): number;
  variable_values(variables: MathOptVariableLike[]): number[];
  reduced_costs(): Record<string, number>;
  reduced_costs(variable: MathOptVariableLike): number;
  reduced_costs(variables: MathOptVariableLike[]): number[];
  dual_values(): Record<string, number>;
  dual_values(linearConstraint: MathOptLinearConstraintLike): number;
  dual_values(linearConstraints: MathOptLinearConstraintLike[]): number[];
  ray_variable_values(): Record<string, number>;
  ray_variable_values(variable: MathOptVariableLike): number;
  ray_variable_values(variables: MathOptVariableLike[]): number[];
  ray_reduced_costs(): Record<string, number>;
  ray_reduced_costs(variable: MathOptVariableLike): number;
  ray_reduced_costs(variables: MathOptVariableLike[]): number[];
  ray_dual_values(): Record<string, number>;
  ray_dual_values(linearConstraint: MathOptLinearConstraintLike): number;
  ray_dual_values(linearConstraints: MathOptLinearConstraintLike[]): number[];
  variable_status(): Record<string, string>;
  variable_status(variable: MathOptVariableLike): string;
  variable_status(variables: MathOptVariableLike[]): string[];
  constraint_status(): Record<string, string>;
  constraint_status(linearConstraint: MathOptLinearConstraintLike): string;
  constraint_status(linearConstraints: MathOptLinearConstraintLike[]): string[];
};

type MathOptSolveOptions = {
  solverType?: number | keyof MathOptSolverTypeLike;
  removeNames?: boolean;
  remove_names?: boolean;
  interrupter?: MathOptSolveInterrupterLike;
  solveInterrupter?: MathOptSolveInterrupterLike;
  solve_interrupter?: MathOptSolveInterrupterLike;
  messageCallback?: (messages: string[]) => void;
  message_callback?: (messages: string[]) => void;
  msgCb?: (messages: string[]) => void;
  msg_cb?: (messages: string[]) => void;
  parameters?: unknown;
  solveParameters?: unknown;
  modelParameters?: unknown;
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
  GLPK?: number;
};

type MathOptSolveInterrupterLike = {
  readonly interrupted: boolean;
  interrupt(): void;
  isInterrupted?(): boolean;
  is_interrupted?(): boolean;
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
    SolveInterrupter: new () => MathOptSolveInterrupterLike;
    SolveParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    ModelSolveParameters: {
      new (options?: Record<string, unknown>): { toProtoBytes(): Uint8Array };
      onlySomePrimalVariables?(variables: MathOptVariableLike[]): { toProtoBytes(): Uint8Array };
      only_some_primal_variables?(variables: MathOptVariableLike[]): { toProtoBytes(): Uint8Array };
    };
    SparseVectorFilter: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    SolutionHint: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    IncrementalSolver: new (...args: any[]) => {
      solve(options?: MathOptSolveOptions): Promise<MathOptSolveResult>;
      close(): Promise<void>;
    };
    Model(name?: string): MathOptModelLike;
    solve(model: MathOptModelLike, options?: MathOptSolveOptions): Promise<MathOptSolveResult>;
    encodeSolveRequest(model: MathOptModelLike, options?: MathOptSolveOptions): Uint8Array;
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

function packedVarints(fields: ProtoField[], field: number): bigint[] {
  const value = fieldValue(fields, field).value;
  assert(value instanceof Uint8Array, `expected field ${field} to be packed varints`);
  const result: bigint[] = [];
  let offset = 0;
  while (offset < value.length) {
    const parsed = readVarint(value, offset);
    result.push(parsed.value);
    offset = parsed.offset;
  }
  return result;
}

function assertPackedVarints(fields: ProtoField[], field: number, expected: Array<number | bigint>) {
  const actual = packedVarints(fields, field);
  assert(actual.length === expected.length, `expected field ${field} length ${expected.length}, got ${actual.length}`);
  expected.forEach((value, index) => {
    assert(actual[index] === BigInt(value), `expected field ${field}[${index}] to be ${String(value)}, got ${String(actual[index])}`);
  });
}

function packedDoubles(fields: ProtoField[], field: number): number[] {
  const value = fieldValue(fields, field).value;
  assert(value instanceof Uint8Array, `expected field ${field} to be packed doubles`);
  assert(value.length % 8 === 0, `expected field ${field} packed double byte length to be divisible by 8`);
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  return Array.from({ length: value.length / 8 }, (_, index) => view.getFloat64(index * 8, true));
}

function assertPackedDoubles(fields: ProtoField[], field: number, expected: number[], tolerance = 1e-9) {
  const actual = packedDoubles(fields, field);
  assert(actual.length === expected.length, `expected field ${field} length ${expected.length}, got ${actual.length}`);
  expected.forEach((value, index) => {
    assert(Math.abs(actual[index] - value) <= tolerance, `expected field ${field}[${index}] to be ${value}, got ${actual[index]}`);
  });
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

async function assertRejects(action: () => Promise<unknown>, pattern: RegExp, message: string) {
  try {
    await action();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    assert(pattern.test(text), `${message}: expected ${pattern}, got ${text}`);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

function assertThrows(action: () => unknown, pattern: RegExp, message: string) {
  try {
    action();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    assert(pattern.test(text), `${message}: expected ${pattern}, got ${text}`);
    return;
  }
  throw new Error(`${message}: expected exception`);
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
async function testIndicator(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_indicator';
  const model = api.MathOpt.Model('test_indicator');
  const x = model.addVariable({ lowerBound: 0, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, name: 'y' });
  const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
  assert(model.addIndicatorConstraint, `${name}: expected addIndicatorConstraint API`);
  model.addIndicatorConstraint({
    indicator: z,
    activateOnZero: true,
    lowerBound: 6,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
  });
  model.minimize([
    { variable: x, coefficient: 2 },
    { variable: y, coefficient: 1 },
    { variable: z, coefficient: 10 },
  ]);

  const result = await api.MathOpt.solve(model, { solverType: 'GSCIP', threads: 1 });
  assert(
    result.terminationReason === 'TERMINATION_REASON_OPTIMAL',
    `${name}: expected termination OPTIMAL, got ${result.terminationReason}`,
  );
  near(result.objectiveValue, 6, 1e-5);
  near(result.variableValuesById[x.id], 0, 1e-5);
  near(result.variableValuesById[y.id], 6, 1e-5);
  near(result.variableValuesById[z.id], 0, 1e-5);
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:162-216 (test_filters)
async function testFilters(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_filters';
  const model = api.MathOpt.Model('test_filters');
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
  const z = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'z' });
  const c = model.addLinearConstraint({
    upperBound: 1,
    name: 'c',
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
  });
  const d = model.addLinearConstraint({
    upperBound: 1,
    name: 'd',
    terms: [
      { variable: y, coefficient: 1 },
      { variable: z, coefficient: 1 },
    ],
  });
  model.maximize([
    { variable: x, coefficient: 1 },
    { variable: y, coefficient: 1 },
    { variable: z, coefficient: 1 },
  ]);

  const result = await api.MathOpt.solve(model, {
    solverType: api.MathOpt.SolverType.GLOP,
    modelParameters: new api.MathOpt.ModelSolveParameters({
      variableValuesFilter: { skipZeroValues: true },
      dualValuesFilter: { elements: [d], filterByIds: true },
      reducedCostsFilter: { elements: [y, z], filterByIds: true },
    }),
  });

  assert(
    result.terminationReason === 'TERMINATION_REASON_OPTIMAL',
    `${name}: expected termination OPTIMAL, got ${result.terminationReason}`,
  );
  near(result.primalBound, 2);
  assert(result.solutions.length >= 1, `${name}: expected at least one solution`);
  const solution = result.solutions[0];
  assert(solution.primalSolution !== null, `${name}: expected primal solution`);
  assert(solution.dualSolution !== null, `${name}: expected dual solution`);
  near(solution.primalSolution.objectiveValue, 2);
  assert(!('y' in solution.primalSolution.variableValues), `${name}: expected zero y value to be filtered`);
  near(solution.primalSolution.variableValues.x, 1);
  near(solution.primalSolution.variableValues.z, 1);
  const dual = solution.dualSolution;
  near(dual.objectiveValue, 2);
  assert(Object.keys(dual.dualValues).join(',') === 'd', `${name}: expected dual values filtered to d`);
  assert(Object.keys(dual.reducedCosts).sort().join(',') === 'y,z', `${name}: expected reduced costs filtered to y,z`);
  assert(!('c' in dual.dualValues), `${name}: expected c dual value to be filtered`);
  assert(!('x' in dual.reducedCosts), `${name}: expected x reduced cost to be filtered`);
  assert(typeof c.id === 'number', `${name}: expected c id to exist for filter comparison`);
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:217-236 (test_message_callback)
async function testMessageCallback(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_message_callback';
  // TEMP: parity - SolveTest.test_message_callback matches upstream GSCIP optimal termination and verifies solver log messages reach the public callback.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  model.maximize([{ variable: x, coefficient: 2 }]);
  const logs: string[] = [];
  const result = await api.MathOpt.solve(model, {
    solverType: 'GSCIP',
    msg_cb(messages) {
      logs.push(...messages);
    },
  });
  assert(
    result.terminationReason === 'TERMINATION_REASON_OPTIMAL',
    `${name}: expected termination OPTIMAL, got ${result.terminationReason}`,
  );
  const text = logs.join('\n');
  assert(text.includes('problem is solved'), `${name}: expected solver log to include "problem is solved"`);
  assert(result.messages.join('\n').includes('problem is solved'), `${name}: expected messages on solve result`);
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:237-259 (test_solve_interrupter)
async function testSolveInterrupter(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_solve_interrupter';
  // TEMP: parity - SolveTest.test_solve_interrupter matches upstream pre-interrupted GSCIP termination reason and limit assertions.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  model.maximize([{ variable: x, coefficient: 2 }]);
  const interrupter = new api.MathOpt.SolveInterrupter();
  interrupter.interrupt();
  assert(interrupter.interrupted, `${name}: interrupter should report interrupted`);
  const result = await api.MathOpt.solve(model, {
    solverType: 'GSCIP',
    interrupter,
  });
  assert(
    result.terminationReason === 'TERMINATION_REASON_NO_SOLUTION_FOUND',
    `${name}: expected NO_SOLUTION_FOUND, got ${result.terminationReason}`,
  );
  assert(
    result.terminationLimit === 'LIMIT_INTERRUPTED',
    `${name}: expected LIMIT_INTERRUPTED, got ${String(result.terminationLimit)}`,
  );
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:262-283 (test_solve_duplicated_names, test_solve_remove_names)
async function testDuplicatedNames(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_solve_duplicated_names_and_remove_names';
  // TEMP: parity - SolveTest.test_solve_duplicated_names and test_solve_remove_names match upstream duplicate-name rejection and remove_names success assertions.
  const duplicateModel = api.MathOpt.Model();
  duplicateModel.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  duplicateModel.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  await assertRejects(
    () => api.MathOpt.solve(duplicateModel, { solverType: 'GSCIP' }),
    /duplicate name/i,
    `${name}: duplicate names should be rejected`,
  );

  const removedNamesModel = api.MathOpt.Model();
  removedNamesModel.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  removedNamesModel.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  const result = await api.MathOpt.solve(removedNamesModel, {
    solverType: 'GSCIP',
    removeNames: true,
  });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: expected optimal solve with removeNames`);
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:286-294 (test_incremental_solve_remove_names)
async function testIncrementalSolveRemoveNames(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_solve_remove_names';
  // TEMP: parity - constructor accepts removeNames and duplicate names do not fail initialization.
  const model = api.MathOpt.Model('test_model');
  model.addVariable({ lowerBound: 1, upperBound: 1, name: 'x1' });
  model.addVariable({ lowerBound: 1, upperBound: 1, name: 'x1' });
  const solver = new api.MathOpt.IncrementalSolver(model, 'GLOP', { removeNames: true });
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:298-302 (test_incremental_solve_init_error)
async function testIncrementalSolveInitError(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_solve_init_error';
  // TEMP: parity - duplicate names are rejected by IncrementalSolver initialization when removeNames is not set.
  const model = api.MathOpt.Model('test_model');
  model.addVariable({ lowerBound: 1, upperBound: 1, name: 'x1' });
  model.addVariable({ lowerBound: 1, upperBound: 1, name: 'x1' });
  assertThrows(
    () => new api.MathOpt.IncrementalSolver(model, 'GLOP'),
    /duplicate name/i,
    `${name}: duplicate names should be rejected during initialization`,
  );
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:305-310 (test_incremental_solve_error)
async function testIncrementalSolveError(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_solve_error';
  // TEMP: parity - invalid initial model is surfaced on incremental solve.
  const model = api.MathOpt.Model('test_model');
  model.addVariable({ lowerBound: 1, upperBound: -1, name: 'x1' });
  const solver = new api.MathOpt.IncrementalSolver(model, 'GLOP');
  await assertRejects(
    () => solver.solve(),
    /lower_bound > upper_bound|lower bound.*upper bound/i,
    `${name}: invalid variable bounds should be rejected`,
  );
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:342-373 (test_incremental_lp)
async function testIncrementalLp(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_lp';
  // TEMP: parity - GLOP incremental solver updates a variable upper bound and resolves with updated objective/value assertions.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
  model.maximize([{ variable: x, coefficient: 2 }]);
  const solver = new api.MathOpt.IncrementalSolver(model, 'GLOP');

  const result = await solver.solve({ parameters: new api.MathOpt.SolveParameters({ enableOutput: true }) });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: first solve termination ${result.terminationReason}`);
  near(result.objectiveValue, 2);
  near(result.variableValues.x, 1);

  x.upperBound = 3;
  const result2 = await solver.solve({ parameters: new api.MathOpt.SolveParameters({ enableOutput: true }) });
  assert(result2.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: second solve termination ${result2.terminationReason}`);
  near(result2.objectiveValue, 6);
  near(result2.variableValues.x, 3);
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:376-413 (test_incremental_mip)
async function testIncrementalMip(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_mip';
  // TEMP: parity - GSCIP incremental solver updates a linear constraint upper bound and resolves with upstream objective/value assertions.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
  const c = model.addLinearConstraint({
    upperBound: 1,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
    name: 'c',
  });
  model.maximize([
    { variable: x, coefficient: 2 },
    { variable: y, coefficient: 3 },
  ]);
  const solver = new api.MathOpt.IncrementalSolver(model, 'GSCIP');
  const params = new api.MathOpt.SolveParameters({ enableOutput: true });

  const result = await solver.solve({ parameters: params });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: first solve termination ${result.terminationReason}`);
  near(result.objectiveValue, 3);
  near(result.variableValues.x, 0);
  near(result.variableValues.y, 1);

  c.upperBound = 2;
  const result2 = await solver.solve({ parameters: params });
  assert(result2.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: second solve termination ${result2.terminationReason}`);
  near(result2.objectiveValue, 5);
  near(result2.variableValues.x, 1);
  near(result2.variableValues.y, 1);
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:416-467 (test_incremental_mip_with_message_cb)
async function testIncrementalMipWithMessageCallback(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_mip_with_message_cb';
  // TEMP: parity - GSCIP incremental MIP solve captures solver logs and checks the upstream incremental-solve marker only after the model update.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
  const c = model.addLinearConstraint({
    upperBound: 1,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
    name: 'c',
  });
  model.maximize([
    { variable: x, coefficient: 2 },
    { variable: y, coefficient: 3 },
  ]);
  const solver = new api.MathOpt.IncrementalSolver(model, 'GSCIP');
  const params = new api.MathOpt.SolveParameters({ enableOutput: true });
  const incrementalMarker = 'feasible solutions given by solution candidate storage';

  const firstLogs: string[] = [];
  const result = await solver.solve({
    parameters: params,
    msg_cb(messages) {
      firstLogs.push(...messages);
    },
  });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: first solve termination ${result.terminationReason}`);
  near(result.objectiveValue, 3);
  near(result.variableValues.x, 0);
  near(result.variableValues.y, 1);
  assert(!firstLogs.join('\n').includes(incrementalMarker), `${name}: first solve should not include incremental marker`);

  c.upperBound = 2;
  const secondLogs: string[] = [];
  const result2 = await solver.solve({
    parameters: params,
    msg_cb(messages) {
      secondLogs.push(...messages);
    },
  });
  assert(result2.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: second solve termination ${result2.terminationReason}`);
  near(result2.objectiveValue, 5);
  near(result2.variableValues.x, 1);
  near(result2.variableValues.y, 1);
  assert(secondLogs.join('\n').includes(incrementalMarker), `${name}: second solve should include incremental marker`);
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:470-494 (test_incremental_solve_interrupter)
async function testIncrementalSolveInterrupter(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_solve_interrupter';
  // TEMP: parity - IncrementalSolver accepts a pre-interrupted SolveInterrupter and returns interrupted termination.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
  model.addLinearConstraint({
    upperBound: 1,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
    name: 'c',
  });
  model.maximize([
    { variable: x, coefficient: 2 },
    { variable: y, coefficient: 3 },
  ]);
  const solver = new api.MathOpt.IncrementalSolver(model, 'GSCIP');
  const interrupter = new api.MathOpt.SolveInterrupter();
  interrupter.interrupt();
  const result = await solver.solve({ interrupter });
  assert(result.terminationReason === 'TERMINATION_REASON_NO_SOLUTION_FOUND', `${name}: termination ${result.terminationReason}`);
  assert(result.terminationLimit === 'LIMIT_INTERRUPTED', `${name}: limit ${String(result.terminationLimit)}`);
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:312-339 (test_incremental_solve_error_on_reject)
async function testIncrementalSolveErrorOnReject(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_solve_error_on_reject';
  // TEMP: parity - CP-SAT rejects model updates, falls back to full recreation, and duplicate names are then rejected.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  model.maximize([{ variable: x, coefficient: 2 }]);
  const solver = new api.MathOpt.IncrementalSolver(model, 'CP_SAT');

  const result = await solver.solve({
    msg_cb() {},
  });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: first solve termination ${result.terminationReason}`);
  near(result.objectiveValue, 2);
  near(result.variableValues.x, 1);

  model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  await assertRejects(
    () => solver.solve({ msg_cb() {} }),
    /duplicate name/i,
    `${name}: duplicate name after rejected update should be rejected`,
  );
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:497-539 (test_incremental_solve_rejected)
async function testIncrementalSolveRejected(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_solve_rejected';
  // TEMP: parity - CP-SAT rejected update falls back to solving the recreated full model with the updated upper bound.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
  model.maximize([{ variable: x, coefficient: 2 }]);
  const solver = new api.MathOpt.IncrementalSolver(model, 'CP_SAT');

  const result = await solver.solve({ msg_cb() {} });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: first solve termination ${result.terminationReason}`);
  near(result.objectiveValue, 2);
  near(result.variableValues.x, 1);

  x.upperBound = 3;
  const result2 = await solver.solve({ msg_cb() {} });
  assert(result2.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: second solve termination ${result2.terminationReason}`);
  near(result2.objectiveValue, 6);
  near(result2.variableValues.x, 3);
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:542-565 (test_multiple_incremental_lps)
async function testMultipleIncrementalLps(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_multiple_incremental_lps';
  // TEMP: parity - repeated GLOP incremental upper-bound updates match upstream objective/value assertions.
  const model = api.MathOpt.Model();
  const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
  model.maximize([{ variable: x, coefficient: 2 }]);
  const solver = new api.MathOpt.IncrementalSolver(model, 'GLOP');
  const params = new api.MathOpt.SolveParameters({
    presolve: api.MathOpt.Emphasis.OFF,
    enableOutput: true,
  });

  for (const ub of [2, 3, 4, 5]) {
    x.upperBound = ub;
    const result = await solver.solve({ parameters: params });
    assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: solve for ub=${ub} terminated ${result.terminationReason}`);
    near(result.objectiveValue, 2 * ub);
    near(result.variableValues.x, ub);
  }
  await solver.close();
  return `${name} PASS`;
}

// Ported from ortools/math_opt/python/solve_test.py:576-593 (close/close twice)
async function testIncrementalSolverClose(api: MathOptApi): Promise<string> {
  const name = 'SolveTest/test_incremental_solver_close';
  // TEMP: parity - close releases the native handle, is idempotent, and future solve calls reject as closed.
  const model = api.MathOpt.Model();
  const solver = new api.MathOpt.IncrementalSolver(model, 'GLOP');
  await solver.close();
  await solver.close();
  await assertRejects(
    () => solver.solve(),
    /closed/i,
    `${name}: solve after close should reject`,
  );
  return `${name} PASS`;
}

async function testPrimalRayHelpers(api: MathOptApi): Promise<string> {
  const name = 'SolveResultAuxiliaryFunctionsTest/test_primal_ray_has_ray';
  // TEMP: parity - a GLPK unbounded LP with ray computation enabled exposes the first primal ray through Python-style helpers.
  const model = api.MathOpt.Model('primal_ray_helpers');
  const x = model.addVariable({ lowerBound: 0, name: 'x' });
  model.maximize([{ variable: x, coefficient: 1 }]);
  const result = await api.MathOpt.solve(model, {
    solverType: 'GLPK',
    glpk: new api.MathOpt.GlpkParameters({ computeUnboundRaysIfPossible: true }),
  });
  const otherModel = api.MathOpt.Model('primal_ray_helpers_other');
  const otherX = otherModel.addVariable({ name: 'other_x' });

  assert(result.terminationReason === 'TERMINATION_REASON_UNBOUNDED', `${name}: termination ${result.terminationReason}`);
  assert(!result.has_primal_feasible_solution(), `${name}: unbounded LP should not expose a feasible primal solution`);
  assert(result.has_ray(), `${name}: expected a primal ray`);
  assert(!result.has_dual_ray(), `${name}: expected no dual ray`);
  assert(result.primalRays?.length === 1, `${name}: expected one primal ray`);
  near(result.ray_variable_values(x), 1);
  const rayValuesByName = result.ray_variable_values();
  near(rayValuesByName.x, 1);
  const rayValues = result.ray_variable_values([x]);
  near(rayValues[0], 1);
  assert(result.ray_variable_values([]).length === 0, `${name}: ray_variable_values([]) should return []`);
  assertThrows(() => result.ray_variable_values(otherX), /different MathOpt model/i, `${name}: wrong-model ray variable should throw`);
  assertThrows(() => result.objective_value(), /no primal feasible solution/i, `${name}: objective_value() should require feasible solution`);
  assertThrows(() => result.variable_values(), /no primal feasible solution/i, `${name}: variable_values() should require feasible solution`);
  return `${name} PASS`;
}

async function testDualRayHelpers(api: MathOptApi): Promise<string> {
  const name = 'SolveResultAuxiliaryFunctionsTest/test_dual_ray_has_ray';
  // TEMP: parity - GLOP dual simplex exposes a dual infeasibility certificate through Python-style ray helpers.
  const model = api.MathOpt.Model('dual_ray_helpers');
  const x1 = model.addVariable({ lowerBound: 0, upperBound: 3, name: 'x_1' });
  const x2 = model.addVariable({ lowerBound: 0, upperBound: 3, name: 'x_2' });
  const y = model.addLinearConstraint({
    lowerBound: -2,
    upperBound: -1,
    terms: [
      { variable: x1, coefficient: 1 },
      { variable: x2, coefficient: 1 },
    ],
    name: 'y',
  });
  model.minimize([
    { variable: x1, coefficient: 2 },
    { variable: x2, coefficient: 1 },
  ]);
  const result = await api.MathOpt.solve(model, {
    solverType: 'GLOP',
    presolve: 'OFF',
    scaling: 'OFF',
    lpAlgorithm: 'DUAL_SIMPLEX',
    enableOutput: true,
  });
  const otherModel = api.MathOpt.Model('dual_ray_helpers_other');
  const otherX = otherModel.addVariable({ name: 'other_x' });
  const otherC = otherModel.addLinearConstraint({ upperBound: 1, terms: [], name: 'other_c' });
  const missingC = model.addLinearConstraint({ upperBound: 1, terms: [], name: 'missing_c' });

  assert(result.terminationReason === 'TERMINATION_REASON_INFEASIBLE', `${name}: termination ${result.terminationReason}`);
  assert(!result.has_ray(), `${name}: expected no primal ray`);
  assert(result.has_dual_ray(), `${name}: expected a dual ray`);
  assert(result.dualRays?.length === 1, `${name}: expected one dual ray`);
  const reducedCostsByName = result.ray_reduced_costs();
  near(reducedCostsByName.x_1, 1);
  near(reducedCostsByName.x_2, 1);
  near(result.ray_reduced_costs(x1), 1);
  near(result.ray_reduced_costs(x2), 1);
  const reducedCosts = result.ray_reduced_costs([x2, x1]);
  near(reducedCosts[0], 1);
  near(reducedCosts[1], 1);
  assert(result.ray_reduced_costs([]).length === 0, `${name}: ray_reduced_costs([]) should return []`);
  assertThrows(() => result.ray_reduced_costs(otherX), /different MathOpt model/i, `${name}: wrong-model ray reduced cost should throw`);

  const dualValuesByName = result.ray_dual_values();
  near(dualValuesByName.y, -1);
  near(result.ray_dual_values(y), -1);
  const dualValues = result.ray_dual_values([y]);
  near(dualValues[0], -1);
  assert(result.ray_dual_values([]).length === 0, `${name}: ray_dual_values([]) should return []`);
  assertThrows(() => result.ray_dual_values(otherC), /different MathOpt model/i, `${name}: wrong-model ray dual value should throw`);
  assertThrows(() => result.ray_dual_values(missingC), /not present/i, `${name}: missing same-model ray dual value should throw`);
  return `${name} PASS`;
}

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

async function testModelSolveParametersProtoEncoding(api: MathOptApi): Promise<string> {
  const name = 'parameters_test.py/ModelSolveParameters proto mappings';
  const model = api.MathOpt.Model('model_parameter_encoding');
  const x = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'y' });
  const demand = model.addLinearConstraint({
    lowerBound: 1,
    upperBound: 10,
    terms: [{ variable: x, coefficient: 1 }, { variable: y, coefficient: 1 }],
    name: 'demand',
  });
  const cap = model.addLinearConstraint({
    upperBound: 4,
    terms: [{ variable: y, coefficient: 1 }],
    name: 'cap',
  });
  model.maximize([{ variable: x, coefficient: 1 }, { variable: y, coefficient: 2 }]);

  const request = api.MathOpt.encodeSolveRequest(model, {
    solverType: 'GLOP',
    parameters: new api.MathOpt.SolveParameters({ timeLimitSeconds: 2, threads: 1 }),
    modelParameters: new api.MathOpt.ModelSolveParameters({
      variableValuesFilter: new api.MathOpt.SparseVectorFilter({ elements: [x], filterByIds: true }),
      dualValuesFilter: { elements: [demand], filterByIds: true, skipZeroValues: true },
      reducedCostsFilter: { elements: [y], filterByIds: true },
      solutionHints: [
        new api.MathOpt.SolutionHint({
          variableValues: [{ variable: x, coefficient: 1.5 }, { variable: y, coefficient: 2.5 }],
          dualValues: [{ linearConstraint: demand, value: 0.75 }],
        }),
      ],
      branchingPriorities: [{ variable: y, priority: 7 }],
      lazyLinearConstraints: [cap],
    }),
  });

  const requestFields = readProtoFields(request);
  const parameters = nestedFields(requestFields, 4);
  const timeLimit = nestedFields(parameters, 1);
  assertVarint(timeLimit, 1, 2);
  assertVarint(parameters, 4, 1);

  const modelParameters = nestedFields(requestFields, 5);
  const variableFilter = nestedFields(modelParameters, 1);
  assertVarint(variableFilter, 2, 1);
  assertPackedVarints(variableFilter, 3, [x.id]);
  const dualFilter = nestedFields(modelParameters, 2);
  assertVarint(dualFilter, 1, 1);
  assertVarint(dualFilter, 2, 1);
  assertPackedVarints(dualFilter, 3, [demand.id]);
  const reducedCostsFilter = nestedFields(modelParameters, 3);
  assertVarint(reducedCostsFilter, 2, 1);
  assertPackedVarints(reducedCostsFilter, 3, [y.id]);
  const hint = nestedFields(modelParameters, 5);
  const hintVariables = nestedFields(hint, 1);
  assertPackedVarints(hintVariables, 1, [x.id, y.id]);
  assertPackedDoubles(hintVariables, 2, [1.5, 2.5]);
  const hintDuals = nestedFields(hint, 2);
  assertPackedVarints(hintDuals, 1, [demand.id]);
  assertPackedDoubles(hintDuals, 2, [0.75]);
  const branching = nestedFields(modelParameters, 6);
  assertPackedVarints(branching, 1, [y.id]);
  assertPackedVarints(branching, 2, [7]);
  assertPackedVarints(modelParameters, 9, [cap.id]);
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
  {
    name: 'SolveTest/test_indicator',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIndicator,
  },
  {
    name: 'SolveTest/test_filters',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testFilters,
  },
  {
    name: 'SolveTest/test_solve_duplicated_names_and_remove_names',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testDuplicatedNames,
  },
  {
    name: 'SolveTest/test_message_callback',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testMessageCallback,
  },
  {
    name: 'SolveTest/test_solve_interrupter',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testSolveInterrupter,
  },
  {
    name: 'SolveTest/test_incremental_solve_remove_names',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalSolveRemoveNames,
  },
  {
    name: 'SolveTest/test_incremental_solve_init_error',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalSolveInitError,
  },
  {
    name: 'SolveTest/test_incremental_solve_error',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalSolveError,
  },
  {
    name: 'SolveTest/test_incremental_lp',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalLp,
  },
  {
    name: 'SolveTest/test_incremental_mip',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalMip,
  },
  {
    name: 'SolveTest/test_incremental_mip_with_message_cb',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalMipWithMessageCallback,
  },
  {
    name: 'SolveTest/test_incremental_solve_interrupter',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalSolveInterrupter,
  },
  {
    name: 'SolveTest/test_incremental_solve_error_on_reject',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalSolveErrorOnReject,
  },
  {
    name: 'SolveTest/test_incremental_solve_rejected',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalSolveRejected,
  },
  {
    name: 'SolveTest/test_multiple_incremental_lps',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testMultipleIncrementalLps,
  },
  {
    name: 'SolveTest/test_incremental_solver_close',
    source: 'ortools/math_opt/python/solve_test.py',
    run: testIncrementalSolverClose,
  },
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
    name: 'parameters_test.py/ModelSolveParameters proto mappings',
    source: 'ortools/math_opt/python/parameters_test.py',
    run: testModelSolveParametersProtoEncoding,
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
    name: 'result_test.py/SolveResult helper methods',
    source: 'ortools/math_opt/python/result_test.py',
    run: async function (api) {
      const name = 'result_test.py/SolveResult helper methods';
      const model = api.MathOpt.Model('result_support_check');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const c = model.addLinearConstraint({
        upperBound: 1,
        terms: [{ variable: x, coefficient: 1 }, { variable: y, coefficient: 1 }],
        name: 'c',
      });
      model.maximize([{ variable: x, coefficient: 2 }, { variable: y, coefficient: 1 }]);
      const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GLOP });
      const otherModel = api.MathOpt.Model('result_support_check_other');
      const otherX = otherModel.addVariable({ name: 'other_x' });
      const otherC = otherModel.addLinearConstraint({ upperBound: 1, terms: [], name: 'other_c' });

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
      assert(result.has_primal_feasible_solution(), `${name}: expected primal feasible solution`);
      assert(result.has_dual_feasible_solution(), `${name}: expected dual feasible solution`);
      assert(!result.has_ray(), `${name}: bounded LP should not have a primal ray`);
      assert(!result.has_dual_ray(), `${name}: bounded LP should not have a dual ray`);
      assert(result.has_basis(), `${name}: GLOP LP result should expose a basis`);
      assert(result.bounded(), `${name}: optimal LP should be bounded`);
      const solveTime = result.solve_time();
      assert(typeof solveTime === 'number' && solveTime >= 0, `${name}: solve_time() should return nonnegative seconds`);
      assert(result.solveTimeSeconds === solveTime, `${name}: solveTimeSeconds should match solve_time()`);
      assert(result.primalStatus === 'FEASIBILITY_STATUS_FEASIBLE', `${name}: primal status should be feasible`);
      assert(result.dualStatus === 'FEASIBILITY_STATUS_FEASIBLE', `${name}: dual status should be feasible`);
      assert(result.primalOrDualInfeasible === false, `${name}: primal_or_dual_infeasible should be false`);
      near(result.objective_value(), 2);
      near(result.best_objective_bound(), 2);
      near(result.variable_values(x), 1);
      near(result.variable_values(y), 0);
      const values = result.variable_values([y, x]);
      near(values[0], 0);
      near(values[1], 1);
      const valuesByName = result.variable_values();
      near(valuesByName.x, 1);
      near(valuesByName.y, 0);
      assertThrows(() => result.variable_values(otherX), /different MathOpt model/i, `${name}: wrong-model variable value should throw`);

      const reducedCostsByName = result.reduced_costs();
      assert(typeof reducedCostsByName.x === 'number', `${name}: reduced_costs() should include x`);
      assert(typeof reducedCostsByName.y === 'number', `${name}: reduced_costs() should include y`);
      near(result.reduced_costs(x), reducedCostsByName.x);
      near(result.reduced_costs(y), reducedCostsByName.y);
      const reducedCosts = result.reduced_costs([y, x]);
      near(reducedCosts[0], reducedCostsByName.y);
      near(reducedCosts[1], reducedCostsByName.x);
      assert(result.reduced_costs([]).length === 0, `${name}: reduced_costs([]) should return []`);
      assertThrows(() => result.reduced_costs(otherX), /different MathOpt model/i, `${name}: wrong-model reduced cost should throw`);

      const dualValuesByName = result.dual_values();
      assert(typeof dualValuesByName.c === 'number', `${name}: dual_values() should include c`);
      near(result.dual_values(c), dualValuesByName.c);
      const dualValues = result.dual_values([c]);
      near(dualValues[0], dualValuesByName.c);
      assert(result.dual_values([]).length === 0, `${name}: dual_values([]) should return []`);
      assertThrows(() => result.dual_values(otherC), /different MathOpt model/i, `${name}: wrong-model dual value should throw`);

      assertThrows(() => result.ray_variable_values(), /no primal ray/i, `${name}: missing primal ray values should throw`);
      assertThrows(() => result.ray_variable_values(x), /no primal ray/i, `${name}: missing primal ray variable should throw`);
      assertThrows(() => result.ray_reduced_costs(), /no dual ray/i, `${name}: missing dual ray reduced costs should throw`);
      assertThrows(() => result.ray_dual_values(), /no dual ray/i, `${name}: missing dual ray dual values should throw`);

      const variableStatusByName = result.variable_status();
      assert(variableStatusByName.x?.startsWith('BASIS_STATUS_'), `${name}: variable_status() should include x basis status`);
      assert(variableStatusByName.y?.startsWith('BASIS_STATUS_'), `${name}: variable_status() should include y basis status`);
      assert(result.variable_status(x) === variableStatusByName.x, `${name}: variable_status(x) should match record`);
      assert(result.variable_status(y) === variableStatusByName.y, `${name}: variable_status(y) should match record`);
      const variableStatuses = result.variable_status([y, x]);
      assert(variableStatuses[0] === variableStatusByName.y, `${name}: variable_status([y, x])[0] should match y`);
      assert(variableStatuses[1] === variableStatusByName.x, `${name}: variable_status([y, x])[1] should match x`);
      assert(result.variable_status([]).length === 0, `${name}: variable_status([]) should return []`);
      assertThrows(() => result.variable_status(otherX), /different MathOpt model/i, `${name}: wrong-model variable status should throw`);

      const constraintStatusByName = result.constraint_status();
      assert(constraintStatusByName.c?.startsWith('BASIS_STATUS_'), `${name}: constraint_status() should include c basis status`);
      assert(result.constraint_status(c) === constraintStatusByName.c, `${name}: constraint_status(c) should match record`);
      assert(result.constraint_status([c])[0] === constraintStatusByName.c, `${name}: constraint_status([c]) should match record`);
      assert(result.constraint_status([]).length === 0, `${name}: constraint_status([]) should return []`);
      assertThrows(() => result.constraint_status(otherC), /different MathOpt model/i, `${name}: wrong-model constraint status should throw`);
      return `${name} PASS`;
    },
  },
  {
    name: 'SolveResultAuxiliaryFunctionsTest/test_primal_ray_has_ray',
    source: 'ortools/math_opt/python/result_test.py',
    run: testPrimalRayHelpers,
  },
  {
    name: 'SolveResultAuxiliaryFunctionsTest/test_dual_ray_has_ray',
    source: 'ortools/math_opt/python/result_test.py',
    run: testDualRayHelpers,
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
