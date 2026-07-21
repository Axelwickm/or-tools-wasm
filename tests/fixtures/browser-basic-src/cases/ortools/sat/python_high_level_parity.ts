import type { SharedCaseMetadata } from '../../../shared_case.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from '../../../shared_case.ts';

type HighLevelApi = {
  CpModel: new () => any;
  CpSolver: new () => any;
  CpSolverSolutionCallback: new () => any;
  Domain: (new (lower: unknown, upper?: unknown) => unknown) & {
    fromIntervals(intervals: Iterable<Iterable<unknown>>): unknown;
    fromValues(values: Iterable<number>): unknown;
    fromFlatIntervals(intervals: Iterable<unknown>): unknown;
  };
  LinearExpr: {
    sum(values: Iterable<unknown> | unknown, ...rest: unknown[]): any;
    weightedSum(values: Iterable<unknown>, coeffs: Iterable<number>): any;
    weighted_sum(values: Iterable<unknown>, coeffs: Iterable<number>): any;
    WeightedSum(values: Iterable<unknown>, coeffs: Iterable<number>): any;
    affine(expression: unknown, coeff: number, offset: number): any;
    term(variable: unknown, coeff: number): any;
  };
  BoundedLinearExpression: new (expression: unknown, domain: unknown) => unknown;
  FlatIntExpr: new (expression: unknown) => {
    vars: IntVarLike[];
    coeffs: number[];
    offset: number;
    plus(value: unknown): LinearExprLike;
    minus(value: unknown): LinearExprLike;
    repr(): string;
  };
  FlatFloatExpr: new (expression: unknown) => {
    vars: IntVarLike[];
    coeffs: number[];
    offset: number;
    plus(value: unknown): LinearExprLike;
    minus(value: unknown): LinearExprLike;
    repr(): string;
  };
  ValueError: new (message: string) => Error;
  RuntimeError: new (message: string) => Error;
  ArithmeticError: new (message: string) => Error;
  NotImplementedError: new (message: string) => Error;
  object_is_a_true_literal(literal: unknown): boolean;
  object_is_a_false_literal(literal: unknown): boolean;
  sum(values: Iterable<unknown> | unknown, ...rest: unknown[]): any;
  weightedSum(values: Iterable<unknown>, coeffs: Iterable<number>): any;
  rebuild_from_linear_expression_proto: (proto: LinearExpressionProtoLike, modelProto: unknown) => LinearExprLike | number;
  rebuildFromLinearExpressionProto?: (proto: LinearExpressionProtoLike, modelProto: unknown) => LinearExprLike | number;
  setExecutor(configuration:
    | { type: 'auto' | 'direct' | 'worker' }
    | { type: 'server'; url: string | URL; authToken?: string; statusIntervalMs?: number }
  ): void;
  DecisionStrategyProto_VariableSelectionStrategy: {
    CHOOSE_MIN_DOMAIN_SIZE: unknown;
  };
  DecisionStrategyProto_DomainReductionStrategy: {
    SELECT_MIN_VALUE: unknown;
    SELECT_MAX_VALUE: unknown;
  };
};

type LinearExpressionProtoLike = {
  vars?: number[];
  coeffs?: any[];
  offset?: any;
};

type CpModelLike = {
  name: string;
  newIntVar(lb: unknown, ub: unknown, name?: string): IntVarLike;
  new_int_var(lb: unknown, ub: unknown, name?: string): IntVarLike;
  NewIntVar(lb: unknown, ub: unknown, name?: string): IntVarLike;
  newIntVarFromDomain(domain: unknown, name?: string): IntVarLike;
  NewIntVarFromDomain(domain: unknown, name?: string): IntVarLike;
  newBoolVar(name?: string): BoolVarLike;
  new_bool_var(name?: string): BoolVarLike;
  NewBoolVar(name?: string): BoolVarLike;
  newConstant(value: number, name?: string): IntVarLike;
  NewConstant(value: number, name?: string): IntVarLike;
  add(bound: unknown): unknown;
  Add(bound: unknown): unknown;
  addAllDifferent(expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  AddAllDifferent(expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  addElement(index: unknown, expressions: Iterable<unknown>, target: unknown): unknown;
  addCircuit(arcs: Iterable<readonly [number, number, unknown]>): unknown;
  addMultipleCircuit(arcs: Iterable<readonly [number, number, unknown]>): unknown;
  addAllowedAssignments(expressions: Iterable<unknown>, tuples: Iterable<Iterable<number>>): unknown;
  addForbiddenAssignments(expressions: Iterable<unknown>, tuples: Iterable<Iterable<number>>): unknown;
  addAutomaton(expressions: Iterable<unknown>, startingState: number, finalStates: Iterable<number>, transitions: Iterable<readonly [number, number, number]>): unknown;
  addInverse(direct: Iterable<IntVarLike>, inverse: Iterable<IntVarLike>): unknown;
  addMaxEquality(target: unknown, expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  add_max_equality(target: unknown, expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  addMinEquality(target: unknown, expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  add_min_equality(target: unknown, expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  addAbsEquality(target: unknown, expression: unknown): unknown;
  add_abs_equality(target: unknown, expression: unknown): unknown;
  addDivisionEquality(target: unknown, numerator: unknown, denominator: unknown): unknown;
  add_division_equality(target: unknown, numerator: unknown, denominator: unknown): unknown;
  add_modulo_equality(target: unknown, expression: unknown, modulo: unknown): unknown;
  addMultiplicationEquality(target: unknown, expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  add_multiplication_equality(target: unknown, expressions: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  addImplication(left: unknown, right: unknown): unknown;
  add_implication(left: unknown, right: unknown): unknown;
  addBoolOr(literals: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  add_bool_or(literals: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  AddBoolOr(literals: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  addAtLeastOne(literals: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  add_at_least_one(literals: Iterable<unknown> | unknown, ...rest: unknown[]): unknown;
  addAtMostOne(literals: Iterable<unknown>): unknown;
  add_at_most_one(literals: Iterable<unknown>): unknown;
  addExactlyOne(literals: Iterable<unknown>): unknown;
  add_exactly_one(literals: Iterable<unknown>): unknown;
  addBoolAnd(literals: Iterable<unknown>): unknown;
  add_bool_and(literals: Iterable<unknown>): unknown;
  AddBoolAnd(literals: Iterable<unknown>): unknown;
  addBoolXor(literals: Iterable<unknown>): unknown;
  add_bool_xor(literals: Iterable<unknown>): unknown;
  AddBoolXOr(literals: Iterable<unknown>): unknown;
  addMapDomain(variable: IntVarLike, booleanVariables: Iterable<BoolVarLike>, offset?: number): unknown;
  add_map_domain(variable: IntVarLike, booleanVariables: Iterable<BoolVarLike>, offset?: number): unknown;
  newIntervalVar(start: unknown, size: unknown, end: unknown, name?: string): IntervalVarLike;
  new_interval_var(start: unknown, size: unknown, end: unknown, name?: string): IntervalVarLike;
  newFixedSizeIntervalVar(start: unknown, size: number, name?: string): IntervalVarLike;
  new_fixed_size_interval_var(start: unknown, size: number, name?: string): IntervalVarLike;
  newOptionalIntervalVar(start: unknown, size: unknown, end: unknown, isPresent: unknown, name?: string): IntervalVarLike;
  new_optional_interval_var(start: unknown, size: unknown, end: unknown, isPresent: unknown, name?: string): IntervalVarLike;
  newOptionalFixedSizeIntervalVar(start: unknown, size: number, isPresent: unknown, name?: string): IntervalVarLike;
  new_optional_fixed_size_interval_var(start: unknown, size: number, isPresent: unknown, name?: string): IntervalVarLike;
  addNoOverlap(intervals: Iterable<IntervalVarLike>): ConstraintLike;
  add_no_overlap(intervals: Iterable<IntervalVarLike>): ConstraintLike;
  AddNoOverlap(intervals: Iterable<IntervalVarLike>): ConstraintLike;
  addNoOverlap2D(xIntervals: Iterable<IntervalVarLike>, yIntervals: Iterable<IntervalVarLike>): ConstraintLike;
  add_no_overlap_2d(xIntervals: Iterable<IntervalVarLike>, yIntervals: Iterable<IntervalVarLike>): ConstraintLike;
  AddNoOverlap2D(xIntervals: Iterable<IntervalVarLike>, yIntervals: Iterable<IntervalVarLike>): ConstraintLike;
  addCumulative(intervals: Iterable<IntervalVarLike>, demands: Iterable<unknown>, capacity: unknown): ConstraintLike;
  add_cumulative(intervals: Iterable<IntervalVarLike>, demands: Iterable<unknown>, capacity: unknown): ConstraintLike;
  addLinearConstraint(expression: unknown, lb: number, ub: number): unknown;
  addHint(variable: unknown, value: number | boolean): unknown;
  get_or_make_index_from_constant(value: number): number;
  get_int_var_from_proto_index(index: number): IntVarLike;
  get_bool_var_from_proto_index(index: number): BoolVarLike;
  get_interval_var_from_proto_index(index: number): IntervalVarLike;
  get_or_make_variable_index(variable: unknown): number;
  is_boolean_value(value: unknown): boolean;
  isBooleanValue(value: unknown): boolean;
  addAssumption(literal: unknown): unknown;
  addAssumptions(literals: Iterable<unknown>): unknown;
  clearAssumptions(): void;
  addDecisionStrategy(expressions: Iterable<unknown>, variableSelectionStrategy: unknown, domainReductionStrategy: unknown): unknown;
  getOrMakeVariableIndex(variable: unknown): number;
  minimize(expression: unknown): unknown;
  Minimize(expression: unknown): unknown;
  maximize(expression: unknown): unknown;
  Maximize(expression: unknown): unknown;
  hasObjective(): boolean;
  modelStats(): string;
  validate(): Promise<string>;
  remove_all_names(): void;
  proto(): Record<string, unknown>;
  Proto(): Record<string, unknown>;
  clone(): CpModelLike;
};

type CpSolverLike = {
  solve(model: CpModelLike, params?: Record<string, unknown>): Promise<unknown>;
  statusName(status?: unknown): string;
  value(expression: unknown): number;
  floatValue(expression: unknown): number;
  booleanValue(expression: unknown): boolean;
  responseStats(): string;
  solutionInfo(): string;
  readonly numBooleans: number;
  readonly numConflicts: number;
  readonly numBranches: number;
  readonly numBinaryPropagations: number;
  readonly numIntegerPropagations: number;
  readonly wallTime: number;
  objectiveValue(): number;
  readonly best_objective_bound: number;
  readonly deterministic_time: number;
  readonly num_binary_propagations: number;
  readonly num_integer_propagations: number;
  readonly num_booleans: number;
  readonly num_conflicts: number;
  readonly num_branches: number;
  readonly user_time: number;
  readonly wall_time: number;
  readonly objective_value: number;
  readonly response_proto: Record<string, unknown>;
  readonly solve_log: string | undefined;
  best_bound_callback: ((bound: number) => void) | null;
  log_callback: ((message: string) => void) | null;
  bestBoundCallback: ((bound: number) => void) | null;
  logCallback: ((message: string) => void) | null;
};

type CpSolverSolutionCallbackLike = {
  value(expression: unknown): number;
  floatValue(expression: unknown): number;
  booleanValue(literal: unknown): boolean;
  readonly objectiveValue: number;
};

type IntVarLike = {
  index: number;
  readonly name: string;
  readonly model_proto: unknown;
  readonly is_boolean: boolean;
  repr(): string;
  negated(): NotBoolVarLike;
  plus(value: unknown): LinearExprLike;
  __add__(value: unknown): LinearExprLike;
  minus(value: unknown): LinearExprLike;
  times(coeff: number): LinearExprLike;
  __mul__(coeff: number): LinearExprLike;
  abs(): never;
  __abs__(): never;
  div(value: unknown): never;
  __div__(value: unknown): never;
  truediv(value: unknown): never;
  __truediv__(value: unknown): never;
  mod(value: unknown): never;
  __mod__(value: unknown): never;
  __pow__(value: unknown): never;
  __lshift__(value: unknown): never;
  __rshift__(value: unknown): never;
  __and__(value: unknown): never;
  __or__(value: unknown): never;
  __xor__(value: unknown): never;
  isInteger?(): boolean;
  is_integer?(): boolean;
  eq(value: unknown): unknown;
  ne(value: unknown): unknown;
  ge(value: unknown): unknown;
  gt(value: unknown): unknown;
  __gt__(value: unknown): unknown;
  le(value: unknown): unknown;
  lt(value: unknown): unknown;
  __lt__(value: unknown): unknown;
};

type BoolVarLike = IntVarLike & {
  negated(): NotBoolVarLike;
};

type NotBoolVarLike = {
  index: number;
  readonly model_proto: unknown;
  repr(): string;
  negated(): IntVarLike;
  plus(value: unknown): LinearExprLike;
  __add__(value: unknown): LinearExprLike;
  minus(value: unknown): LinearExprLike;
  times(coeff: number): LinearExprLike;
  __mul__(coeff: number): LinearExprLike;
  neg(): LinearExprLike;
  abs(): never;
  __abs__(): never;
  div(value: unknown): never;
  __div__(value: unknown): never;
  truediv(value: unknown): never;
  __truediv__(value: unknown): never;
  mod(value: unknown): never;
  __mod__(value: unknown): never;
  __pow__(value: unknown): never;
  __lshift__(value: unknown): never;
  __rshift__(value: unknown): never;
  __and__(value: unknown): never;
  __or__(value: unknown): never;
  __xor__(value: unknown): never;
};

type LinearExprLike = {
  plus(value: unknown): LinearExprLike;
  minus(value: unknown): LinearExprLike;
  times(coeff: number): LinearExprLike;
  abs(): never;
  __abs__(): never;
  div(value: unknown): never;
  __div__(value: unknown): never;
  truediv(value: unknown): never;
  __truediv__(value: unknown): never;
  mod(value: unknown): never;
  __mod__(value: unknown): never;
  __pow__(value: unknown): never;
  __lshift__(value: unknown): never;
  __rshift__(value: unknown): never;
  __and__(value: unknown): never;
  __or__(value: unknown): never;
  __xor__(value: unknown): never;
  isInteger?(): boolean;
  is_integer?(): boolean;
  repr?(): string;
  eq(value: unknown): unknown;
  ne(value: unknown): unknown;
  ge(value: unknown): unknown;
  gt(value: unknown): unknown;
  le(value: unknown): unknown;
  lt(value: unknown): unknown;
};

type IntervalVarLike = {
  index: number;
  readonly model_proto: unknown;
  repr(): string;
  startExpr(): IntVarLike | LinearExprLike | number;
  sizeExpr(): IntVarLike | LinearExprLike | number;
  endExpr(): IntVarLike | LinearExprLike | number;
  presenceLiterals(): unknown[];
};

type ConstraintLike = {
  index: number;
  readonly name: string;
  with_name(name: string): ConstraintLike;
  onlyEnforceIf(literals: unknown, ...rest: unknown[]): ConstraintLike;
};

export type CpSatHighLevelParityCase = {
  name: string;
  source: 'ortools/sat/python/cp_model_test.py';
  run(api: HighLevelApi): Promise<void> | void;
} & Partial<SharedCaseMetadata>;

type CpSatHighLevelParityResult = {
  id: string;
  name: string;
  solver: string;
  source: string;
  upstream: string;
  tags: string[];
  mode: ExecutorFixtureMode;
  workerProfile: string;
  params: { numWorkers: number };
  ok: true;
};

function cpSatHighLevelCaseId(name: string) {
  return `cp_sat_high_level.${name
    .replaceAll('.', '.')
    .replaceAll(/[^a-zA-Z0-9_.]+/g, '_')
    .toLowerCase()}`;
}

async function withCpSatExecutorMode<T>(
  api: HighLevelApi,
  mode: ExecutorFixtureMode,
  run: () => Promise<T>,
): Promise<T> {
  if (mode === 'server') {
    await assertServerExecutorIsRunning();
    api.setExecutor(serverExecutorConfiguration());
  } else {
    api.setExecutor({ type: mode });
  }
  try {
    return await run();
  } finally {
    api.setExecutor({ type: 'auto' });
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertLength(values: { length: number } | undefined, expected: number, message: string) {
  assertEqual(values?.length ?? 0, expected, message);
}

function assertArrayEqual<T>(actual: readonly T[], expected: readonly T[], message: string) {
  assertLength(actual, expected.length, `${message} length`);
  for (let index = 0; index < expected.length; index += 1) {
    assertEqual(actual[index], expected[index], `${message} ${index}`);
  }
}

function assertPresent<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

const PY_INT_MIN = '-9223372036854775808';
const PY_INT_MAX = '9223372036854775807';
const PY_INT_MAX_PROTO = { low: -1, high: 2147483647 };

function int64String(value: unknown) {
  if (typeof value === 'object' && value !== null && 'low' in value && 'high' in value) {
    const int64 = value as { low: number; high: number };
    return String(BigInt(int64.high) * 0x100000000n + BigInt(int64.low >>> 0));
  }
  return String(value);
}

type FlatIntExprLike = {
  vars: IntVarLike[];
  coeffs: number[];
  offset: number;
};

function asFlatIntExpr(expression: number | LinearExprLike, variableByIndex: Map<number, IntVarLike>): FlatIntExprLike {
  if (typeof expression === 'number') {
    return { vars: [], coeffs: [], offset: expression };
  }
  if ('index' in expression && typeof expression.index === 'number') {
    const variable = variableByIndex.get(expression.index);
    return { vars: [assertPresent(variable, `${String(expression)} variable index ${expression.index} is not available`)], coeffs: [1], offset: 0 };
  }
  const expressionData = expression as unknown as { terms: ReadonlyMap<number, number>; offset: number };
  const terms = Array.from(expressionData.terms);
  const vars: IntVarLike[] = [];
  const coeffs: number[] = [];
  for (const [index, coeff] of terms) {
    const variable = variableByIndex.get(index);
    vars.push(assertPresent(variable, `${String(expression)} variable index ${index} is not available`));
    coeffs.push(coeff);
  }
  return { vars, coeffs, offset: expressionData.offset };
}

function assertFlatExpr(
  expression: LinearExprLike,
  expectedTerms: Array<readonly [IntVarLike, number]>,
  expectedOffset: number,
  message: string,
) {
  const variableByIndex = new Map(expectedTerms.map(([variable]) => [variable.index, variable]));
  const flat = asFlatIntExpr(expression, variableByIndex);
  assertLength(flat.vars, expectedTerms.length, `${message} variable count`);
  for (let index = 0; index < expectedTerms.length; index += 1) {
    assertEqual(flat.vars[index].index, expectedTerms[index][0].index, `${message} variable ${index}`);
    assertEqual(flat.coeffs[index], expectedTerms[index][1], `${message} coeff ${index}`);
  }
  assertEqual(flat.offset, expectedOffset, `${message} offset`);
}

function flatExprSignature(expression: LinearExprLike, variables: IntVarLike[]) {
  const variableByIndex = new Map(variables.map((variable) => [variable.index, variable]));
  const flat = asFlatIntExpr(expression, variableByIndex);
  return JSON.stringify({
    vars: flat.vars.map((variable) => variable.index),
    coeffs: flat.coeffs,
    offset: flat.offset,
  });
}

function expressionIsInteger(expression: unknown) {
  return typeof expression === 'number' ? Number.isInteger(expression) : Boolean((expression as LinearExprLike).is_integer?.());
}

function assertThrows(errorCtor: new (...args: never[]) => Error, fn: () => void, message: string) {
  try {
    fn();
  } catch (error) {
    if (error instanceof errorCtor) {
      return;
    }
    throw new Error(`${message}: expected ${errorCtor.name}, got ${error instanceof Error ? error.name : typeof error}`);
  }
  throw new Error(`${message}: expected ${errorCtor.name}`);
}

function assertThrowsWithMessage(errorCtor: new (...args: never[]) => Error, expectedMessage: string, fn: () => void, message: string) {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof errorCtor)) {
      throw new Error(`${message}: expected ${errorCtor.name}, got ${error instanceof Error ? error.name : typeof error}`);
    }
    assertEqual(error.message, expectedMessage, `${message} message`);
    return;
  }
  throw new Error(`${message}: expected ${errorCtor.name}`);
}

async function assertRejects(errorCtor: new (...args: never[]) => Error, promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof errorCtor) {
      return;
    }
    throw new Error(`${message}: expected ${errorCtor.name}, got ${error instanceof Error ? error.name : typeof error}`);
  }
  throw new Error(`${message}: expected ${errorCtor.name}`);
}

function variables(model: CpModelLike) {
  return model.proto().variables as unknown[] | undefined;
}

function constraints(model: CpModelLike) {
  return model.proto().constraints as Array<Record<string, any>> | undefined;
}

function newLinMaxVars(CpModel: HighLevelApi['CpModel']) {
  const model = new CpModel();
  const x = model.newIntVar(0, 4, 'x');
  const y = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `y${index}`));
  return { model, x, y };
}

function assertMaxEqualityProto(model: CpModelLike, exprCount: number, targetCoeff: number, caseName: string) {
  assertLength(variables(model), 6, `${caseName} variable count`);
  assertLength(constraints(model)?.[0]?.linMax?.exprs, exprCount, `${caseName} lin_max expression count`);
  assertEqual(constraints(model)?.[0]?.linMax?.target?.vars?.[0], 0, `${caseName} target var`);
  assertEqual(constraints(model)?.[0]?.linMax?.target?.coeffs?.[0], targetCoeff, `${caseName} target coeff`);
}

export const cpSatHighLevelParityCases: CpSatHighLevelParityCase[] = [
  {
    // TEMP: parity - CpModelTest.test_create_integer_variable matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_create_integer_variable',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, Domain }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      assertEqual(String(x), 'x', `${this.name} int variable string`);
      assertEqual(x.repr(), 'x(-10..10)', `${this.name} int variable repr`);
      const y = model.newIntVarFromDomain(Domain.fromIntervals([[2, 4], [7]]), 'y');
      assertEqual(String(y), 'y', `${this.name} interval-domain variable string`);
      assertEqual(y.repr(), 'y(2..4, 7)', `${this.name} interval-domain variable repr`);
      const z = model.newIntVarFromDomain(Domain.fromValues([2, 3, 4, 7]), 'z');
      assertEqual(String(z), 'z', `${this.name} values-domain variable string`);
      assertEqual(z.repr(), 'z(2..4, 7)', `${this.name} values-domain variable repr`);
      const t = model.newIntVarFromDomain(Domain.fromFlatIntervals([2, 4, 7, 7]), 't');
      assertEqual(String(t), 't', `${this.name} flat-domain variable string`);
      assertEqual(t.repr(), 't(2..4, 7)', `${this.name} flat-domain variable repr`);
      const cst = model.newConstant(5);
      assertEqual(String(cst), '5', `${this.name} constant string`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_all_different matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_all_different',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addAllDifferent(x);
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.allDiff?.exprs, 5, `${this.name} all_diff expression count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_hash_int_var matches upstream same-index variable key behavior using the high-level CP-SAT API.
    name: 'CpModelTest.test_hash_int_var',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const varA = model.newIntVar(0, 2, 'a');
      const variables = new Set<IntVarLike>();
      variables.add(varA);
      if (!variables.has(varA)) {
        throw new Error(`${this.name} set should contain var_a`);
      }

      const accumulator = new Map<IntVarLike, number>();
      accumulator.set(varA, (accumulator.get(varA) ?? 0) + 1);
      assertEqual(accumulator.get(varA), 1, `${this.name} initial accumulator`);
      const sameVarA = model.get_int_var_from_proto_index(varA.index);
      accumulator.set(sameVarA, (accumulator.get(sameVarA) ?? 0) + 3);
      assertEqual(accumulator.get(varA), 4, `${this.name} same-index accumulator`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_all_different_gen matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_all_different_gen',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      model.addAllDifferent((function* expressions() {
        for (let index = 0; index < 5; index += 1) {
          yield model.newIntVar(0, 4, `x${index}`);
        }
      })());
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.allDiff?.exprs, 5, `${this.name} all_diff expression count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_all_different_list matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_all_different_list',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addAllDifferent(x[0], x[1], x[2], x[3], x[4]);
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.allDiff?.exprs, 5, `${this.name} all_diff expression count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_empty_linear_constraint matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_empty_linear_constraint',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      model.addLinearConstraint(5, 0, 10);
      model.addLinearConstraint(-1, 0, 10);
      assertLength(constraints(model), 2, `${this.name} constraint count`);
      assertPresent(constraints(model)?.[0]?.boolAnd, `${this.name} first constraint should be bool_and`);
      assertLength(constraints(model)?.[0]?.boolAnd?.literals, 0, `${this.name} true literal count`);
      assertPresent(constraints(model)?.[1]?.boolOr, `${this.name} second constraint should be bool_or`);
      assertLength(constraints(model)?.[1]?.boolOr?.literals, 0, `${this.name} false literal count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_literal matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_literal',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newBoolVar('x');
      assertEqual(String(x), 'x', `${this.name} bool variable string`);
      assertEqual(String(x.negated()), 'not(x)', `${this.name} negated bool string`);
      assertEqual(String(x.negated()), 'not(x)', `${this.name} explicit negated bool string`);
      assertEqual(x.negated().negated().index, x.index, `${this.name} double negated bool`);
      assertEqual(x.negated().negated().index, x.index, `${this.name} double negated bool index`);
      const y = model.newIntVar(0, 1, 'y');
      assertEqual(String(y), 'y', `${this.name} Boolean-domain int string`);
      assertEqual(String(y.negated()), 'not(y)', `${this.name} Boolean-domain int negated string`);
      const zero = model.newConstant(0);
      assertEqual(String(zero), '0', `${this.name} zero constant string`);
      assertEqual(String(zero.negated()), 'not(0)', `${this.name} zero constant negated string`);
      const one = model.newConstant(1);
      assertEqual(String(one), '1', `${this.name} one constant string`);
      assertEqual(String(one.negated()), 'not(1)', `${this.name} one constant negated string`);
      const noName = model.newBoolVar('');
      assertEqual(String(noName), 'b4', `${this.name} unnamed bool string`);
      assertEqual(String(noName.negated()), 'not(b4)', `${this.name} unnamed bool negated string`);
      const z = model.newIntVar(0, 2, 'z');
      assertThrows(TypeError, () => z.negated(), `${this.name} rejects non-Boolean negated`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_negation matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_negation',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const b = model.newBoolVar('b');
      const nb = b.negated();
      assertEqual(b.negated().index, nb.index, `${this.name} repeated negated literal`);
      assertEqual(b.negated().negated().index, b.index, `${this.name} double negation`);
      assertEqual(nb.index, -b.index - 1, `${this.name} negated literal index`);
      assertThrows(TypeError, () => x.negated(), `${this.name} rejects integer negated`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_issue4654 matches upstream expression string assertion using the high-level CP-SAT API.
    name: 'CpModelTest.test_issue4654',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.NewIntVar(0, 1, 'x');
      const y = model.NewIntVar(0, 2, 'y');
      const z = model.NewIntVar(0, 3, 'z');
      const expr = x.minus(y).minus(z.times(2));
      assertEqual(String(expr), '(x + (-y) + (-2 * z))', `${this.name} expression string`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_equality_overload matches upstream variable equality assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_equality_overload',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(0, 5, 'y');
      assertEqual(x, x, `${this.name} same variable`);
      if (x === y) {
        throw new Error(`${this.name} different variables should not compare equal`);
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_large_constants matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_large_constants',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const ct = model.add(x.times(50000000000).eq(1234567890));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 1, `${this.name} variable count`);
      assertLength(linear?.coeffs, 1, `${this.name} coeff count`);
      assertEqual(linear?.coeffs?.[0], 50000000000, `${this.name} coeff`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(linear?.domain?.[0], 1234567890, `${this.name} lower domain`);
      assertEqual(linear?.domain?.[1], 1234567890, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_eq matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_eq',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const ct = model.add(x.eq(2));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 1, `${this.name} variable count`);
      assertLength(linear?.coeffs, 1, `${this.name} coeff count`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(linear?.domain?.[0], 2, `${this.name} lower domain`);
      assertEqual(linear?.domain?.[1], 2, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_eq_var matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_eq_var',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.add(x.eq(y.plus(2)));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 2, `${this.name} variable count`);
      assertEqual((linear?.vars?.[0] ?? 0) + (linear?.vars?.[1] ?? 0), 1, `${this.name} variable index sum`);
      assertLength(linear?.coeffs, 2, `${this.name} coeff count`);
      assertEqual((linear?.coeffs?.[0] ?? 0) + (linear?.coeffs?.[1] ?? 0), 0, `${this.name} coeff sum`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(linear?.domain?.[0], 2, `${this.name} lower domain`);
      assertEqual(linear?.domain?.[1], 2, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_linear_non_equal matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_linear_non_equal',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.add(x.times(-1).plus(y).ne(3));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.domain, 4, `${this.name} domain count`);
      assertEqual(int64String(linear?.domain?.[0]), PY_INT_MIN, `${this.name} first domain`);
      assertEqual(linear?.domain?.[1], 2, `${this.name} second domain`);
      assertEqual(linear?.domain?.[2], 4, `${this.name} third domain`);
      assertEqual(int64String(linear?.domain?.[3]), PY_INT_MAX, `${this.name} fourth domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.testGe matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.testGe',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const ct = model.add(x.ge(2));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 1, `${this.name} variable count`);
      assertLength(linear?.coeffs, 1, `${this.name} coeff count`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(linear?.domain?.[0], 2, `${this.name} lower domain`);
      assertEqual(int64String(linear?.domain?.[1]), PY_INT_MAX, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_gt matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_gt',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const ct = model.add(x.gt(2));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 1, `${this.name} variable count`);
      assertLength(linear?.coeffs, 1, `${this.name} coeff count`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(linear?.domain?.[0], 3, `${this.name} lower domain`);
      assertEqual(int64String(linear?.domain?.[1]), PY_INT_MAX, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_le matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_le',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const ct = model.add(x.le(2));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 1, `${this.name} variable count`);
      assertLength(linear?.coeffs, 1, `${this.name} coeff count`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(int64String(linear?.domain?.[0]), PY_INT_MIN, `${this.name} lower domain`);
      assertEqual(linear?.domain?.[1], 2, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_lt matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_lt',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const ct = model.add(x.lt(2));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 1, `${this.name} variable count`);
      assertLength(linear?.coeffs, 1, `${this.name} coeff count`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(int64String(linear?.domain?.[0]), PY_INT_MIN, `${this.name} lower domain`);
      assertEqual(linear?.domain?.[1], 1, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_ge_var matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_ge_var',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.add(x.plus(y).ge(1));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 2, `${this.name} variable count`);
      assertEqual((linear?.vars?.[0] ?? 0) + (linear?.vars?.[1] ?? 0), 1, `${this.name} variable index sum`);
      assertLength(linear?.coeffs, 2, `${this.name} coeff count`);
      assertEqual(linear?.coeffs?.[0], 1, `${this.name} first coeff`);
      assertEqual(linear?.coeffs?.[1], 1, `${this.name} second coeff`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(linear?.domain?.[0], 1, `${this.name} lower domain`);
      assertEqual(int64String(linear?.domain?.[1]), PY_INT_MAX, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_gt_var matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_gt_var',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.add(x.plus(y).gt(1));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 2, `${this.name} variable count`);
      assertEqual((linear?.vars?.[0] ?? 0) + (linear?.vars?.[1] ?? 0), 1, `${this.name} variable index sum`);
      assertLength(linear?.coeffs, 2, `${this.name} coeff count`);
      assertEqual(linear?.coeffs?.[0], 1, `${this.name} first coeff`);
      assertEqual(linear?.coeffs?.[1], 1, `${this.name} second coeff`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(linear?.domain?.[0], 2, `${this.name} lower domain`);
      assertEqual(int64String(linear?.domain?.[1]), PY_INT_MAX, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_le_var matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_le_var',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.add(x.plus(y).le(1));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 2, `${this.name} variable count`);
      assertEqual((linear?.vars?.[0] ?? 0) + (linear?.vars?.[1] ?? 0), 1, `${this.name} variable index sum`);
      assertLength(linear?.coeffs, 2, `${this.name} coeff count`);
      assertEqual(linear?.coeffs?.[0], 1, `${this.name} first coeff`);
      assertEqual(linear?.coeffs?.[1], 1, `${this.name} second coeff`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(int64String(linear?.domain?.[0]), PY_INT_MIN, `${this.name} lower domain`);
      assertEqual(linear?.domain?.[1], 1, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_lt_var matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_lt_var',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.add(x.plus(y).lt(1));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.vars, 2, `${this.name} variable count`);
      assertEqual((linear?.vars?.[0] ?? 0) + (linear?.vars?.[1] ?? 0), 1, `${this.name} variable index sum`);
      assertLength(linear?.coeffs, 2, `${this.name} coeff count`);
      assertEqual(linear?.coeffs?.[0], 1, `${this.name} first coeff`);
      assertEqual(linear?.coeffs?.[1], 1, `${this.name} second coeff`);
      assertLength(linear?.domain, 2, `${this.name} domain count`);
      assertEqual(int64String(linear?.domain?.[0]), PY_INT_MIN, `${this.name} lower domain`);
      assertEqual(linear?.domain?.[1], 0, `${this.name} upper domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_linear_non_equal_with_constant matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_linear_non_equal_with_constant',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.add(x.plus(y).plus(5).ne(3));
      const linear = constraints(model)?.[ct.index]?.linear;
      assertLength(linear?.domain, 4, `${this.name} domain count`);
      assertEqual(int64String(linear?.domain?.[0]), PY_INT_MIN, `${this.name} first domain`);
      assertEqual(linear?.domain?.[1], -3, `${this.name} second domain`);
      assertEqual(linear?.domain?.[2], -1, `${this.name} third domain`);
      assertEqual(int64String(linear?.domain?.[3]), PY_INT_MAX, `${this.name} fourth domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_linear matches upstream solve assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_linear',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, RuntimeError }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10);
      model.minimize(y);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), 10, `${this.name} x value`);
      assertEqual(solver.value(y), -5, `${this.name} y value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_none_argument matches upstream solve and TypeError assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_none_argument',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, RuntimeError }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10);
      model.minimize(y);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertThrows(TypeError, () => solver.value(null as never), `${this.name} value rejects null`);
      assertThrows(TypeError, () => solver.floatValue(null as never), `${this.name} floatValue rejects null`);
      assertThrows(TypeError, () => solver.booleanValue(null as never), `${this.name} booleanValue rejects null`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_linear_with_enforcement matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_linear_with_enforcement',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const b = model.newBoolVar('b');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10).onlyEnforceIf(b.negated());
      model.minimize(y);
      assertLength(constraints(model), 1, `${this.name} first constraint count`);
      assertEqual(constraints(model)?.[0]?.enforcementLiteral?.[0], -3, `${this.name} first enforcement literal`);
      const c = model.newBoolVar('c');
      model.addLinearConstraint(x.plus(y.times(4)), 0, 10).onlyEnforceIf([b, c]);
      assertLength(constraints(model), 2, `${this.name} second constraint count`);
      assertEqual(constraints(model)?.[1]?.enforcementLiteral?.[0], 2, `${this.name} second first enforcement literal`);
      assertEqual(constraints(model)?.[1]?.enforcementLiteral?.[1], 3, `${this.name} second second enforcement literal`);
      model.addLinearConstraint(x.plus(y.times(5)), 0, 10).onlyEnforceIf(c.negated(), b);
      assertLength(constraints(model), 3, `${this.name} third constraint count`);
      assertEqual(constraints(model)?.[2]?.enforcementLiteral?.[0], -4, `${this.name} third first enforcement literal`);
      assertEqual(constraints(model)?.[2]?.enforcementLiteral?.[1], 2, `${this.name} third second enforcement literal`);
      model.addLinearConstraint(x.plus(y.times(4)), 0, 10).onlyEnforceIf([b, c, false]);
      assertLength(constraints(model), 4, `${this.name} fourth constraint count`);
      assertEqual(constraints(model)?.[3]?.enforcementLiteral?.[0], 2, `${this.name} fourth first enforcement literal`);
      assertEqual(constraints(model)?.[3]?.enforcementLiteral?.[1], 3, `${this.name} fourth second enforcement literal`);
      assertEqual(constraints(model)?.[3]?.enforcementLiteral?.[2], 4, `${this.name} fourth third enforcement literal`);
      model.addLinearConstraint(x.plus(y.times(5)), 0, 10).onlyEnforceIf(c.negated(), b, true);
      assertLength(constraints(model), 5, `${this.name} fifth constraint count`);
      assertEqual(constraints(model)?.[4]?.enforcementLiteral?.[0], -4, `${this.name} fifth first enforcement literal`);
      assertEqual(constraints(model)?.[4]?.enforcementLiteral?.[1], 2, `${this.name} fifth second enforcement literal`);
      assertEqual(constraints(model)?.[4]?.enforcementLiteral?.[2], 5, `${this.name} fifth third enforcement literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_names matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_names',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      model.name = 'test_model';
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const ct = model.addLinearConstraint(x.plus(y.times(2)), 0, 10).with_name('test_constraint');
      assertEqual(model.name, 'test_model', `${this.name} model name`);
      assertEqual(x.name, 'x', `${this.name} variable name`);
      assertEqual(ct.name, 'test_constraint', `${this.name} constraint name`);
      model.remove_all_names();
      assertEqual(model.name, '', `${this.name} cleared model name`);
      assertEqual(x.name, '', `${this.name} cleared variable name`);
      assertEqual(ct.name, '', `${this.name} cleared constraint name`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_natural_api_minimize matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_natural_api_minimize',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.add(x.times(2).minus(y).eq(1));
      model.minimize(x.minus(y.times(2)).plus(3));
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), 5, `${this.name} x value`);
      assertEqual(solver.value(x.times(3)), 15, `${this.name} x*3 value`);
      assertEqual(solver.value(x.plus(1)), 6, `${this.name} x+1 value`);
      assertEqual(solver.objectiveValue(), -10, `${this.name} objective value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_natural_api_maximize matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_natural_api_maximize',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.add(x.times(2).minus(y).eq(1));
      model.maximize(x.minus(y.times(2)).plus(3));
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), -4, `${this.name} x value`);
      assertEqual(solver.value(y), -9, `${this.name} y value`);
      assertEqual(solver.objectiveValue(), 17, `${this.name} objective value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_natural_api_maximize_float matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_natural_api_maximize_float',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newBoolVar('x');
      const y = model.newIntVar(0, 10, 'y');
      model.maximize(
        x.negated().times(3.5)
          .plus(x.negated())
          .minus(y)
          .plus(y.times(2))
          .plus(1.6),
      );
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.booleanValue(x), false, `${this.name} boolean_value(x)`);
      assertEqual(solver.booleanValue(x.negated()), true, `${this.name} boolean_value(x.negated())`);
      assertEqual(solver.value(y.times(-1)), -10, `${this.name} value(-y)`);
      assertEqual(solver.objectiveValue(), 16.1, `${this.name} objective value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_natural_api_maximize_complex matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_natural_api_maximize_complex',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, sum, weightedSum }) {
      const model = new CpModel();
      const x1 = model.newBoolVar('x1');
      const x2 = model.newBoolVar('x1');
      const x3 = model.newBoolVar('x1');
      const x4 = model.newBoolVar('x1');
      model.maximize(
        sum([x1, x2]).plus(
          weightedSum([x3, x4.negated()], [2, 4]),
        ),
      );
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x1.times(2).plus(3)), 5, `${this.name} value(3 + 2 * x1)`);
      assertEqual(solver.value(x1.plus(x2).plus(x3)), 3, `${this.name} value(x1 + x2 + x3)`);
      assertEqual(solver.value(sum([x1, x2, x3, 0, -2])), 1, `${this.name} value(sum([x1, x2, x3, 0, -2]))`);
      assertEqual(solver.value(weightedSum([x1, x2, x4, 3], [2, 2, 2, 1])), 7, `${this.name} value(weighted_sum([x1, x2, x4, 3], [2, 2, 2, 1])`);
      assertEqual(solver.value(x4.negated().times(5)), 5, `${this.name} value(5 * x4.negated())`);
      assertEqual(solver.objectiveValue(), 8, `${this.name} objective value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_minimize_constant matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_minimize_constant',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      model.add(x.ge(-1));
      model.minimize(10);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.objectiveValue(), 10, `${this.name} objective value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_maximize_constant matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_maximize_constant',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      model.add(x.ge(-1));
      model.maximize(5);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.objectiveValue(), 5, `${this.name} objective value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_add_true matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_add_true',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      model.add(3 >= -1);
      model.minimize(x);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), -10, `${this.name} x value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_add_false matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_add_false',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      model.add(3 <= -1);
      model.minimize(x);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'INFEASIBLE', `${this.name} status`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_sum matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_sum',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, sum }) {
      const model = new CpModel();
      const x = Array.from({ length: 100 }, (_, index) => model.newIntVar(0, 2, `x${index}`));
      model.add(sum(x).le(1));
      model.maximize(x[99]);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.objectiveValue(), 1, `${this.name} objective value`);
      for (let index = 0; index < 100; index += 1) {
        assertEqual(solver.value(x[index]), index === 99 ? 1 : 0, `${this.name} x${index} value`);
      }
    },
  },
  {
    name: 'CpModelTest.test_sum_parsing.partial',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, LinearExpr, FlatIntExpr, FlatFloatExpr }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 2, `x${index}`));

      const s1 = LinearExpr.sum(x);
      assertEqual(expressionIsInteger(s1), true, `${this.name} s1 is integer`);
      const flatS1 = new FlatIntExpr(s1);
      assertLength(flatS1.vars, 5, `${this.name} s1 variable count`);
      assertEqual(flatS1.offset, 0, `${this.name} s1 offset`);

      const s2 = LinearExpr.sum(x[0], x[2], x[4]);
      assertEqual(expressionIsInteger(s2), true, `${this.name} s2 is integer`);
      const flatS2 = new FlatIntExpr(s2);
      assertLength(flatS2.vars, 3, `${this.name} s2 variable count`);
      assertEqual(flatS2.offset, 0, `${this.name} s2 offset`);

      const s3 = LinearExpr.sum(x[0], x[2], 2, x[4], -4);
      assertEqual(expressionIsInteger(s3), true, `${this.name} s3 is integer`);
      const flatS3 = new FlatIntExpr(s3);
      assertLength(flatS3.vars, 3, `${this.name} s3 variable count`);
      assertEqual(flatS3.offset, -2, `${this.name} s3 offset`);

      const s4 = LinearExpr.sum(x[0], x[2], 2.5);
      assertEqual(expressionIsInteger(s4), false, `${this.name} s4 is not integer`);
      const flatS4 = new FlatFloatExpr(s4);
      assertLength(flatS4.vars, 2, `${this.name} s4 variable count`);
      assertEqual(flatS4.offset, 2.5, `${this.name} s4 offset`);

      const s5 = LinearExpr.sum(x[0], x[2], 2, 1.5);
      assertEqual(expressionIsInteger(s5), false, `${this.name} s5 is not integer`);
      const flatS5 = new FlatFloatExpr(s5);
      assertLength(flatS5.vars, 2, `${this.name} s5 variable count`);
      assertEqual(flatS5.offset, 3.5, `${this.name} s5 offset`);
      assertEqual(String(s5), '(x0 + x2 + 3.5)', `${this.name} s5 string`);

      const s5b = LinearExpr.sum(x[0], x[2], 2, -2.5);
      assertEqual(expressionIsInteger(s5b), false, `${this.name} s5b is not integer`);
      assertEqual(String(s5b), '(x0 + x2 - 0.5)', `${this.name} s5b string`);
      const flatS5b = new FlatFloatExpr(s5b);
      assertLength(flatS5b.vars, 2, `${this.name} s5b variable count`);
      assertEqual(flatS5b.offset, -0.5, `${this.name} s5b offset`);

      const s6 = LinearExpr.sum(x[0], x[2], -1, -4);
      assertEqual(expressionIsInteger(s6), true, `${this.name} s6 is integer`);
      const flatS6 = new FlatIntExpr(s6);
      assertLength(flatS6.vars, 2, `${this.name} s6 variable count`);
      assertEqual(flatS6.offset, -5, `${this.name} s6 offset`);

      const s7 = LinearExpr.sum(x[0], x[2], 2.0, 1.5);
      assertEqual(expressionIsInteger(s7), false, `${this.name} s7 is not integer`);
      const flatS7 = new FlatFloatExpr(s7);
      assertLength(flatS7.vars, 2, `${this.name} s7 variable count`);
      assertEqual(flatS7.offset, 3.5, `${this.name} s7 offset`);

      const s8 = LinearExpr.sum(x[0], 3);
      assertEqual(expressionIsInteger(s8), true, `${this.name} s8 is integer`);
      assertFlatExpr(s8, [[x[0], 1]], 3, `${this.name} s8`);
      assertEqual(s8.repr?.(), 'IntAffine(expr=x0(0..2), coeff=1, offset=3)', `${this.name} s8 repr`);

      const s9 = LinearExpr.sum(x[0], -2.1);
      assertEqual(expressionIsInteger(s9), false, `${this.name} s9 is not integer`);
      assertFlatExpr(s9, [[x[0], 1]], -2.1, `${this.name} s9`);
      assertEqual(s9.repr?.(), 'FloatAffine(expr=x0(0..2), coeff=1, offset=-2.1)', `${this.name} s9 repr`);
      assertEqual(String(s9), '(x0 - 2.1)', `${this.name} s9 string`);

      const s10 = LinearExpr.sum(x[0], 1, -1);
      assertEqual(expressionIsInteger(s10), true, `${this.name} s10 is integer`);
      assertFlatExpr(s10, [[x[0], 1]], 0, `${this.name} s10`);
      assertEqual(s10, x[0], `${this.name} s10 returns variable`);

      const s11 = LinearExpr.sum(x[0]);
      assertEqual(expressionIsInteger(s11), true, `${this.name} s11 is integer`);
      assertEqual(s11, x[0], `${this.name} s11 returns variable`);

      const s12 = LinearExpr.sum(x[0], x[2].neg(), -3);
      assertEqual(String(s12), '(x0 + (-x2) - 3)', `${this.name} s12 string`);
      assertEqual(
        s12.repr?.(),
        'SumArray(x0(0..2), IntAffine(expr=x2(0..2), coeff=-1, offset=0), int_offset=-3)',
        `${this.name} s12 repr`,
      );
      const flatS12 = new FlatIntExpr(s12);
      assertEqual(String(flatS12), '(x0 - x2 - 3)', `${this.name} s12 flat string`);
      assertEqual(flatS12.repr(), 'FlatIntExpr([x0(0..2), x2(0..2)], [1, -1], -3)', `${this.name} s12 flat repr`);
      const flatFloatS12 = new FlatFloatExpr(s12);
      assertEqual(String(flatFloatS12), '(x0 - x2 - 3)', `${this.name} s12 flat float string`);
      assertEqual(flatFloatS12.repr(), 'FlatFloatExpr([x0(0..2), x2(0..2)], [1, -1], -3)', `${this.name} s12 flat float repr`);

      const s13 = LinearExpr.sum(2);
      assertEqual(String(s13), '2', `${this.name} s13 string`);
      assertEqual(s13.repr?.(), 'IntConstant(2)', `${this.name} s13 repr`);

      const s14 = LinearExpr.sum(2.5);
      assertEqual(String(s14), '2.5', `${this.name} s14 string`);
      assertEqual(s14.repr?.(), 'FloatConstant(2.5)', `${this.name} s14 repr`);

      assertThrows(TypeError, () => LinearExpr.sum(x[0], x[2], 'foo' as never), `${this.name} rejects string operand`);
      assertThrows(TypeError, () => LinearExpr.sum(x[0], x[2], { dtype: 2 } as never), `${this.name} rejects fake dtype operand`);
      assertThrows(TypeError, () => LinearExpr.sum(x[0], x[2], { is_integer: false } as never), `${this.name} rejects fake is_integer operand`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_sum_with_api matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_sum_with_api',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, LinearExpr }) {
      const model = new CpModel();
      const x = Array.from({ length: 100 }, (_, index) => model.newIntVar(0, 2, `x${index}`));
      assertEqual(LinearExpr.sum([x[0]]), x[0], `${this.name} singleton sum`);
      assertEqual(LinearExpr.sum([x[0], 0]), x[0], `${this.name} singleton sum with zero`);
      assertEqual(LinearExpr.sum([x[0], 0.0]), x[0], `${this.name} singleton sum with zero float`);
      assertEqual(
        String(LinearExpr.sum([x[0], 2])),
        String(LinearExpr.affine(x[0], 1, 2)),
        `${this.name} affine representation`,
      );
      model.add((LinearExpr.sum(x) as LinearExprLike).le(1));
      model.maximize(x[99]);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.objectiveValue(), 1, `${this.name} objective value`);
      for (let index = 0; index < 100; index += 1) {
        assertEqual(solver.value(x[index]), index === 99 ? 1 : 0, `${this.name} x${index} value`);
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_weighted_sum matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_weighted_sum',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, LinearExpr, ValueError, weightedSum }) {
      const model = new CpModel();
      const x = Array.from({ length: 100 }, (_, index) => model.newIntVar(0, 2, `x${index}`));
      const c = Array.from({ length: 100 }, () => 2);
      model.add(weightedSum(x, c).le(3));
      model.maximize(x[99]);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.objectiveValue(), 1, `${this.name} objective value`);
      for (let index = 0; index < 100; index += 1) {
        assertEqual(solver.value(x[index]), index === 99 ? 1 : 0, `${this.name} x${index} value`);
      }
      assertThrows(ValueError, () => weightedSum([x[0]], [1, 2]), `${this.name} rejects length mismatch`);
      assertThrows(ValueError, () => weightedSum([x[0]], [1.1, 2.2]), `${this.name} rejects float coefficient mismatch`);
      assertThrows(ValueError, () => weightedSum([x[0], 3, 5], [1, 2]), `${this.name} rejects constant length mismatch`);
      assertThrows(ValueError, () => weightedSum([x[0], 2.2, 3], [1.1, 2.2]), `${this.name} rejects float constant mismatch`);
      assertThrows(ValueError, () => LinearExpr.WeightedSum([x[0]], [1, 2]), `${this.name} rejects alias length mismatch`);
      assertThrows(ValueError, () => LinearExpr.WeightedSum([x[0]], [1.1, 2.2]), `${this.name} rejects alias float coefficient mismatch`);
    },
  },
  {
    name: 'CpModelTest.test_weighted_sum_parsing.partial',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, LinearExpr, FlatIntExpr, FlatFloatExpr }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 2, `x${index}`));
      const c = [1, -2, 2, 3, 0];
      const floatC = [1, -1.0, 2, 3, 0.0];

      const s1 = LinearExpr.weighted_sum(x, c);
      assertEqual(expressionIsInteger(s1), true, `${this.name} s1 is integer`);
      const flatS1 = new FlatIntExpr(s1);
      assertLength(flatS1.vars, 4, `${this.name} s1 variable count`);
      assertEqual(flatS1.offset, 0, `${this.name} s1 offset`);

      const s2 = LinearExpr.weighted_sum(x, floatC);
      const flatS2 = new FlatFloatExpr(s2);
      assertLength(flatS2.vars, 4, `${this.name} s2 variable count`);
      assertEqual(flatS2.offset, 0, `${this.name} s2 offset`);

      const s3 = LinearExpr.weighted_sum([...x, 2], [...c, -1]);
      assertEqual(expressionIsInteger(s3), true, `${this.name} s3 is integer`);
      const flatS3 = new FlatIntExpr(s3);
      assertLength(flatS3.vars, 4, `${this.name} s3 variable count`);
      assertEqual(flatS3.offset, -2, `${this.name} s3 offset`);

      const s4 = LinearExpr.weighted_sum([...x, 2], [...floatC, -1.0]);
      const flatS4 = new FlatFloatExpr(s4);
      assertLength(flatS4.vars, 4, `${this.name} s4 variable count`);
      assertEqual(flatS4.offset, -2, `${this.name} s4 offset`);

      const s5 = LinearExpr.weighted_sum([...x, 2], [...c, -1]);
      assertEqual(expressionIsInteger(s5), true, `${this.name} s5 is integer`);
      const flatS5 = new FlatIntExpr(s5);
      assertLength(flatS5.vars, 4, `${this.name} s5 variable count`);
      assertEqual(flatS5.offset, -2, `${this.name} s5 offset`);

      const s6 = LinearExpr.weighted_sum([2], [1]);
      assertEqual(s6.repr?.(), 'IntConstant(2)', `${this.name} s6 repr`);
      assertEqual(new FlatIntExpr(s6).repr(), 'FlatIntExpr([], [], 2)', `${this.name} s6 flat repr`);

      const s7 = LinearExpr.weighted_sum([2], [1.25]);
      assertEqual(s7.repr?.(), 'FloatConstant(2.5)', `${this.name} s7 repr`);
      assertEqual(new FlatFloatExpr(s7).repr(), 'FlatFloatExpr([], [], 2.5)', `${this.name} s7 flat repr`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_element matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_element',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addElement(x[0], [x[1], 2, 4, x[2]], x[4]);
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.element?.exprs, 4, `${this.name} element expression count`);
      assertEqual(constraints(model)?.[0]?.element?.linearIndex?.vars?.[0], 0, `${this.name} index var`);
      assertEqual(constraints(model)?.[0]?.element?.linearTarget?.vars?.[0], 4, `${this.name} target var`);
      assertThrows(ValueError, () => model.addElement(x[0], [], x[4]), `${this.name} rejects empty expressions`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_fixed_element matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_fixed_element',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 4 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addElement(1, [x[0], 2, 4, x[2]], x[3]);
      assertLength(variables(model), 4, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.linear?.vars, 1, `${this.name} linear variable count`);
      assertEqual(constraints(model)?.[0]?.linear?.vars?.[0], x[3].index, `${this.name} target var`);
      assertEqual(constraints(model)?.[0]?.linear?.coeffs?.[0], 1, `${this.name} target coeff`);
      assertEqual(JSON.stringify(constraints(model)?.[0]?.linear?.domain), JSON.stringify([2, 2]), `${this.name} domain`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_affine_element matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_affine_element',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addElement(x[0].plus(1), [x[1].times(2).minus(2), 2, 4, x[2]], x[4].minus(1));
      const element = constraints(model)?.[0]?.element;
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(element?.exprs, 4, `${this.name} expression count`);
      assertEqual(element?.linearIndex?.vars?.[0], 0, `${this.name} index var`);
      assertEqual(element?.linearIndex?.coeffs?.[0], 1, `${this.name} index coeff`);
      assertEqual(element?.linearIndex?.offset, 1, `${this.name} index offset`);
      assertEqual(element?.linearTarget?.vars?.[0], 4, `${this.name} target var`);
      assertEqual(element?.linearTarget?.coeffs?.[0], 1, `${this.name} target coeff`);
      assertEqual(element?.linearTarget?.offset, -1, `${this.name} target offset`);
      assertEqual(element?.linearTarget?.vars?.[0], 4, `${this.name} target var repeated`);
      assertEqual(element?.exprs?.[0]?.vars?.[0], 1, `${this.name} first expr var`);
      assertEqual(element?.exprs?.[0]?.coeffs?.[0], 2, `${this.name} first expr coeff`);
      assertEqual(element?.exprs?.[0]?.offset, -2, `${this.name} first expr offset`);
    },
  },
  {
    // TEMP: parity - CpModelTest.testCircuit matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.testCircuit',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.addCircuit(x.map((literal, index) => [index, index + 1, literal]));
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.circuit?.heads, 5, `${this.name} head count`);
      assertLength(constraints(model)?.[0]?.circuit?.tails, 5, `${this.name} tail count`);
      assertLength(constraints(model)?.[0]?.circuit?.literals, 5, `${this.name} literal count`);
      assertThrows(ValueError, () => model.addCircuit([]), `${this.name} rejects empty arcs`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_multiple_circuit matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_multiple_circuit',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.addMultipleCircuit(x.map((literal, index) => [index, index + 1, literal]));
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.routes?.heads, 5, `${this.name} head count`);
      assertLength(constraints(model)?.[0]?.routes?.tails, 5, `${this.name} tail count`);
      assertLength(constraints(model)?.[0]?.routes?.literals, 5, `${this.name} literal count`);
      assertThrows(ValueError, () => model.addMultipleCircuit([]), `${this.name} rejects empty arcs`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_allowed_assignments matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_allowed_assignments',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addAllowedAssignments(x, [
        [0, 1, 2, 3, 4],
        [4, 3, 2, 1, 1],
        [0, 0, 0, 0, 0],
      ]);
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.table?.exprs, 5, `${this.name} expression count`);
      assertLength(constraints(model)?.[0]?.table?.values, 15, `${this.name} value count`);
      assertEqual(constraints(model)?.[0]?.table?.negated ?? false, false, `${this.name} negated flag`);
      assertThrows(
        ValueError,
        () => model.addAllowedAssignments(x, [
          [0, 1, 2, 3, 4],
          [4, 3, 2, 1, 1],
          [0, 0, 0, 0],
        ]),
        `${this.name} rejects wrong tuple arity`,
      );
      assertThrows(
        ValueError,
        () => model.addAllowedAssignments([], [
          [0, 1, 2, 3, 4],
          [4, 3, 2, 1, 1],
          [0, 0, 0, 0],
        ]),
        `${this.name} rejects empty expressions`,
      );
    },
  },
  {
    // TEMP: parity - CpModelTest.test_forbidden_assignments matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_forbidden_assignments',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addForbiddenAssignments(x, [
        [0, 1, 2, 3, 4],
        [4, 3, 2, 1, 1],
        [0, 0, 0, 0, 0],
      ]);
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.table?.exprs, 5, `${this.name} expression count`);
      assertLength(constraints(model)?.[0]?.table?.values, 15, `${this.name} value count`);
      assertEqual(constraints(model)?.[0]?.table?.negated, true, `${this.name} negated flag`);
      assertThrows(
        ValueError,
        () => model.addForbiddenAssignments(x, [
          [0, 1, 2, 3, 4],
          [4, 3, 2, 1, 1],
          [0, 0, 0, 0],
        ]),
        `${this.name} rejects wrong tuple arity`,
      );
      assertThrows(
        ValueError,
        () => model.addForbiddenAssignments([], [
          [0, 1, 2, 3, 4],
          [4, 3, 2, 1, 1],
          [0, 0, 0, 0],
        ]),
        `${this.name} rejects empty expressions`,
      );
    },
  },
  {
    // TEMP: parity - CpModelTest.test_automaton matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_automaton',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      model.addAutomaton(x, 0, [2, 3], [
        [0, 0, 0],
        [0, 1, 1],
        [1, 2, 2],
        [2, 3, 3],
      ]);
      const automaton = constraints(model)?.[0]?.automaton;
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(automaton?.exprs, 5, `${this.name} expression count`);
      assertLength(automaton?.transitionTail, 4, `${this.name} transition tail count`);
      assertLength(automaton?.transitionHead, 4, `${this.name} transition head count`);
      assertLength(automaton?.transitionLabel, 4, `${this.name} transition label count`);
      assertLength(automaton?.finalStates, 2, `${this.name} final state count`);
      assertEqual(automaton?.startingState, 0, `${this.name} starting state`);
      assertThrows(
        ValueError,
        () => model.addAutomaton(x, 0, [2, 3], [
          [0, 0, 0],
          [0, 1, 1],
          [2, 2] as never,
          [2, 3, 3],
        ]),
        `${this.name} rejects malformed transitions`,
      );
      assertThrows(
        ValueError,
        () => model.addAutomaton([], 0, [2, 3], [
          [0, 0, 0],
          [0, 1, 1],
          [2, 3, 3],
        ]),
        `${this.name} rejects empty expressions`,
      );
      assertThrows(
        ValueError,
        () => model.addAutomaton(x, 0, [], [
          [0, 0, 0],
          [0, 1, 1],
          [2, 3, 3],
        ]),
        `${this.name} rejects empty final states`,
      );
      assertThrows(ValueError, () => model.addAutomaton(x, 0, [2, 3], []), `${this.name} rejects empty transitions`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_inverse matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_inverse',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `x${index}`));
      const y = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `y${index}`));
      model.addInverse(x, y);
      assertLength(variables(model), 10, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.inverse?.fDirect, 5, `${this.name} direct count`);
      assertLength(constraints(model)?.[0]?.inverse?.fInverse, 5, `${this.name} inverse count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_max_equality matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_max_equality',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_max_equality(x, y);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertMaxEqualityProto(model, 5, 1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_max_equality_list matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_max_equality_list',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_max_equality(x, [y[0], y[2], y[1], y[3]]);
      assertMaxEqualityProto(model, 4, 1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_max_equality_tuple matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_max_equality_tuple',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_max_equality(x, [y[0], y[2], y[1], y[3]]);
      assertMaxEqualityProto(model, 4, 1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_max_equality_generator matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_max_equality_generator',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_max_equality(x, (function* expressions() {
        yield* y;
      })());
      assertMaxEqualityProto(model, 5, 1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_max_equality_args matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_max_equality_args',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_max_equality(x, y[2], y[4]);
      assertMaxEqualityProto(model, 2, 1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_max_equality_with_constant matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_max_equality_with_constant',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 4, 'x');
      const y = model.newIntVar(0, 4, 'y');
      model.add_max_equality(x, [y, 3]);
      const linMax = constraints(model)?.[0]?.linMax;
      assertLength(variables(model), 2, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(linMax?.exprs, 2, `${this.name} expression count`);
      assertLength(linMax?.exprs?.[0]?.vars, 1, `${this.name} first expr variable count`);
      assertEqual(linMax?.exprs?.[0]?.vars?.[0], 1, `${this.name} first expr var`);
      assertEqual(linMax?.exprs?.[0]?.coeffs?.[0], 1, `${this.name} first expr coeff`);
      assertEqual(linMax?.exprs?.[0]?.offset ?? 0, 0, `${this.name} first expr offset`);
      assertLength(linMax?.exprs?.[1]?.vars, 0, `${this.name} constant expr variable count`);
      assertEqual(linMax?.exprs?.[1]?.offset, 3, `${this.name} constant expr offset`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_min_equality matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_min_equality',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_min_equality(x, y);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertMaxEqualityProto(model, 5, -1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_min_equality_list matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_min_equality_list',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_min_equality(x, [y[0], y[2], y[1], y[3]]);
      assertMaxEqualityProto(model, 4, -1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_min_equality_tuple matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_min_equality_tuple',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_min_equality(x, [y[0], y[2], y[1], y[3]]);
      assertMaxEqualityProto(model, 4, -1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_min_equality_generator matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_min_equality_generator',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_min_equality(x, (function* expressions() {
        yield* y;
      })());
      assertMaxEqualityProto(model, 5, -1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_min_equality_args matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_min_equality_args',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const { model, x, y } = newLinMaxVars(CpModel);
      model.add_min_equality(x, y[2], y[4]);
      assertMaxEqualityProto(model, 2, -1, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_min_equality_with_constant matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_min_equality_with_constant',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 4, 'x');
      const y = model.newIntVar(0, 4, 'y');
      model.add_min_equality(x, [y, 3]);
      const linMax = constraints(model)?.[0]?.linMax;
      assertLength(variables(model), 2, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(linMax?.exprs, 2, `${this.name} expression count`);
      assertLength(linMax?.exprs?.[0]?.vars, 1, `${this.name} first expr variable count`);
      assertEqual(linMax?.exprs?.[0]?.vars?.[0], 1, `${this.name} first expr var`);
      assertEqual(linMax?.exprs?.[0]?.coeffs?.[0], -1, `${this.name} first expr coeff`);
      assertEqual(linMax?.exprs?.[0]?.offset ?? 0, 0, `${this.name} first expr offset`);
      assertLength(linMax?.exprs?.[1]?.vars, 0, `${this.name} constant expr variable count`);
      assertEqual(linMax?.exprs?.[1]?.offset, -3, `${this.name} constant expr offset`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_abs matches upstream proto assertions and unsupported-operation guidance using the high-level CP-SAT API.
    name: 'CpModelTest.test_abs',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, NotImplementedError }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 4, 'x');
      const y = model.new_int_var(-5, 5, 'y');
      model.add_abs_equality(x, y);
      const linMax = constraints(model)?.[0]?.linMax;
      assertLength(variables(model), 2, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(linMax?.exprs, 2, `${this.name} lin_max expression count`);
      assertEqual(linMax?.exprs?.[0]?.vars?.[0], 1, `${this.name} first expr var`);
      assertEqual(linMax?.exprs?.[0]?.coeffs?.[0], 1, `${this.name} first expr coeff`);
      assertEqual(linMax?.exprs?.[1]?.vars?.[0], 1, `${this.name} second expr var`);
      assertEqual(linMax?.exprs?.[1]?.coeffs?.[0], -1, `${this.name} second expr coeff`);
      assertThrowsWithMessage(
        NotImplementedError,
        'calling abs() on a linear expression is not supported, please use CpModel.add_abs_equality',
        () => x.__abs__(),
        `${this.name} unsupported abs`,
      );
    },
  },
  {
    // TEMP: parity - CpModelTest.test_division matches upstream proto assertions and unsupported-operation guidance using the high-level CP-SAT API.
    name: 'CpModelTest.test_division',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, NotImplementedError }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 10, 'x');
      const y = model.new_int_var(0, 50, 'y');
      model.add_division_equality(x, y, 6);
      const intDiv = constraints(model)?.[0]?.intDiv;
      assertLength(variables(model), 2, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(intDiv?.exprs, 2, `${this.name} int_div expression count`);
      assertEqual(intDiv?.exprs?.[0]?.vars?.[0], 1, `${this.name} numerator var`);
      assertEqual(intDiv?.exprs?.[0]?.coeffs?.[0], 1, `${this.name} numerator coeff`);
      assertLength(intDiv?.exprs?.[1]?.vars, 0, `${this.name} denominator var count`);
      assertEqual(intDiv?.exprs?.[1]?.offset, 6, `${this.name} denominator offset`);
      assertThrowsWithMessage(
        NotImplementedError,
        'calling // on a linear expression is not supported, please use CpModel.add_division_equality',
        () => x.__truediv__(3),
        `${this.name} unsupported division`,
      );
    },
  },
  {
    // TEMP: parity - CpModelTest.test_issue4568 matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_issue4568',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const target = 11;
      const value = model.new_int_var(0, 10, '');
      const defect = model.new_int_var(0, 2147483647, '');
      model.add_abs_equality(defect, value.minus(target));
      model.minimize(defect);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.objectiveValue(), 1, `${this.name} objective value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_multiplication_equality matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_multiplication_equality',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 4, 'x');
      const y = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `y${index}`));
      model.add_multiplication_equality(x, y);
      assertLength(variables(model), 6, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.intProd?.exprs, 5, `${this.name} expression count`);
      assertEqual(constraints(model)?.[0]?.intProd?.target?.vars?.[0], 0, `${this.name} target var`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_multiplication_equality_generator matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_multiplication_equality_generator',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 4, 'x');
      const y = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 4, `y${index}`));
      model.add_multiplication_equality(x, y[2], y[3]);
      assertLength(variables(model), 6, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.intProd?.exprs, 2, `${this.name} expression count`);
      assertEqual(constraints(model)?.[0]?.intProd?.target?.vars?.[0], 0, `${this.name} target var`);
    },
  },
  {
    // TEMP: parity - CpModelTest.testModulo matches upstream proto assertions and unsupported-operation guidance using the high-level CP-SAT API.
    name: 'CpModelTest.testModulo',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, NotImplementedError }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 10, 'x');
      const y = model.new_int_var(0, 50, 'y');
      model.add_modulo_equality(x, y, 6);
      const intMod = constraints(model)?.[0]?.intMod;
      assertLength(variables(model), 2, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(intMod?.exprs, 2, `${this.name} int_mod expression count`);
      assertEqual(intMod?.exprs?.[0]?.vars?.[0], 1, `${this.name} numerator var`);
      assertEqual(intMod?.exprs?.[0]?.coeffs?.[0], 1, `${this.name} numerator coeff`);
      assertLength(intMod?.exprs?.[1]?.vars, 0, `${this.name} modulo var count`);
      assertEqual(intMod?.exprs?.[1]?.offset, 6, `${this.name} modulo offset`);
      assertThrowsWithMessage(
        NotImplementedError,
        'calling %% on a linear expression is not supported, please use CpModel.add_modulo_equality',
        () => x.__mod__(3),
        `${this.name} unsupported modulo`,
      );
    },
  },
  {
    // TEMP: parity - CpModelTest.test_implication matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_implication',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newBoolVar('x');
      const y = model.newBoolVar('y');
      model.add_implication(x, y);
      assertLength(variables(model), 2, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.boolAnd?.literals, 1, `${this.name} bool_and literal count`);
      assertLength(constraints(model)?.[0]?.enforcementLiteral, 1, `${this.name} enforcement literal count`);
      assertEqual(constraints(model)?.[0]?.enforcementLiteral?.[0], x.index, `${this.name} enforcement literal`);
      assertEqual(constraints(model)?.[0]?.boolAnd?.literals?.[0], y.index, `${this.name} implied literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_bool_or matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_bool_or',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.add_bool_or(x);
      assertLength(variables(model), 5, `${this.name} initial variable count`);
      assertLength(constraints(model), 1, `${this.name} initial constraint count`);
      assertLength(constraints(model)?.[0]?.boolOr?.literals, 5, `${this.name} initial literal count`);
      model.add_bool_or([x[0], x[1], false]);
      assertLength(variables(model), 6, `${this.name} variable count after false literal`);
      assertThrows(TypeError, () => model.add_bool_or([x[2], 2]), `${this.name} rejects numeric literal 2`);
      const y = model.newIntVar(0, 4, 'y');
      assertThrows(TypeError, () => model.add_bool_or([y, false]), `${this.name} rejects integer variable literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_bool_or_list_or_get matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_bool_or_list_or_get',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.add_bool_or(x);
      model.add_bool_or(true, x[0], x[2]);
      model.add_bool_or(false, x[0]);
      model.add_bool_or((function* literals() {
        for (const index of [0, 2, 3, 4]) {
          yield x[index];
        }
      })());
      model.add_bool_or(x[3]);
      assertLength(variables(model), 7, `${this.name} variable count`);
      assertLength(constraints(model), 5, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.boolOr?.literals, 5, `${this.name} first bool_or literal count`);
      assertLength(constraints(model)?.[1]?.boolOr?.literals, 3, `${this.name} second bool_or literal count`);
      assertLength(constraints(model)?.[2]?.boolOr?.literals, 2, `${this.name} third bool_or literal count`);
      assertLength(constraints(model)?.[3]?.boolOr?.literals, 4, `${this.name} fourth bool_or literal count`);
      assertLength(constraints(model)?.[4]?.boolOr?.literals, 1, `${this.name} fifth bool_or literal count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_at_least_one matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_at_least_one',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.add_at_least_one(x);
      assertLength(variables(model), 5, `${this.name} initial variable count`);
      assertLength(constraints(model), 1, `${this.name} initial constraint count`);
      assertLength(constraints(model)?.[0]?.boolOr?.literals, 5, `${this.name} initial literal count`);
      model.add_at_least_one([x[0], x[1], false]);
      assertLength(variables(model), 6, `${this.name} variable count after false literal`);
      assertThrows(TypeError, () => model.add_at_least_one([x[2], 2]), `${this.name} rejects numeric literal 2`);
      const y = model.newIntVar(0, 4, 'y');
      assertThrows(TypeError, () => model.add_at_least_one([y, false]), `${this.name} rejects integer variable literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_at_most_one matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_at_most_one',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.add_at_most_one(x);
      assertLength(variables(model), 5, `${this.name} initial variable count`);
      assertLength(constraints(model), 1, `${this.name} initial constraint count`);
      assertLength(constraints(model)?.[0]?.atMostOne?.literals, 5, `${this.name} initial literal count`);
      model.add_at_most_one([x[0], x[1], false]);
      assertLength(variables(model), 6, `${this.name} variable count after false literal`);
      assertThrows(TypeError, () => model.add_at_most_one([x[2], 2]), `${this.name} rejects numeric literal 2`);
      const y = model.newIntVar(0, 4, 'y');
      assertThrows(TypeError, () => model.add_at_most_one([y, false]), `${this.name} rejects integer variable literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_exactly_one matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_exactly_one',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.add_exactly_one(x);
      assertLength(variables(model), 5, `${this.name} initial variable count`);
      assertLength(constraints(model), 1, `${this.name} initial constraint count`);
      assertLength(constraints(model)?.[0]?.exactlyOne?.literals, 5, `${this.name} initial literal count`);
      model.add_exactly_one([x[0], x[1], false]);
      assertLength(variables(model), 6, `${this.name} variable count after false literal`);
      assertThrows(TypeError, () => model.add_exactly_one([x[2], 2]), `${this.name} rejects numeric literal 2`);
      const y = model.newIntVar(0, 4, 'y');
      assertThrows(TypeError, () => model.add_exactly_one([y, false]), `${this.name} rejects integer variable literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_bool_and matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_bool_and',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.add_bool_and(x);
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.boolAnd?.literals, 5, `${this.name} literal count`);
      model.add_bool_and([x[1], x[2].negated(), true]);
      assertEqual(constraints(model)?.[1]?.boolAnd?.literals?.[0], 1, `${this.name} second constraint first literal`);
      assertEqual(constraints(model)?.[1]?.boolAnd?.literals?.[1], -3, `${this.name} second constraint second literal`);
      assertEqual(constraints(model)?.[1]?.boolAnd?.literals?.[2], 5, `${this.name} second constraint true literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_bool_x_or matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_bool_x_or',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      model.add_bool_xor(x);
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.boolXor?.literals, 5, `${this.name} literal count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_map_domain matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_map_domain',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newBoolVar(`x${index}`));
      const y = model.newIntVar(0, 10, 'y');
      model.add_map_domain(y, x, 2);
      assertLength(variables(model), 6, `${this.name} variable count`);
      assertLength(constraints(model), 10, `${this.name} constraint count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_interval matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_interval',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 4, 'x');
      const y = model.new_int_var(0, 3, 'y');
      const i = model.new_interval_var(x, 3, y, 'i');
      assertEqual(i.index, 0, `${this.name} interval index`);
      assertLength(i.presenceLiterals(), 0, `${this.name} presence literal count`);
      const j = model.new_fixed_size_interval_var(x, 2, 'j');
      assertEqual(j.index, 1, `${this.name} fixed interval index`);
      assertEqual((j.startExpr() as IntVarLike).index, x.index, `${this.name} fixed start expr index`);
      assertEqual(j.sizeExpr(), 2, `${this.name} fixed size expr`);
      assertEqual(String(j.endExpr()), '(x + 2)', `${this.name} fixed end expr`);
      const b = model.new_bool_var('b');
      const k = model.new_optional_fixed_size_interval_var(x, 2, b, 'k');
      assertEqual(k.index, 2, `${this.name} optional fixed interval index`);
      assertEqual((k.startExpr() as IntVarLike).index, x.index, `${this.name} optional fixed start expr index`);
      assertEqual(k.sizeExpr(), 2, `${this.name} optional fixed size expr`);
      assertEqual(String(k.endExpr()), '(x + 2)', `${this.name} optional fixed end expr`);
      assertArrayEqual(k.presenceLiterals(), [b], `${this.name} optional fixed presence literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_rebuild_from_linear_expression_proto matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_rebuild_from_linear_expression_proto',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, rebuild_from_linear_expression_proto }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 4, 'x');
      const y = model.new_int_var(0, 1, 'y');
      const z = model.new_int_var(0, 5, 'z');
      const i = model.new_interval_var(x, y, z, 'i');
      assertEqual(i.startExpr(), x, `${this.name} start expr`);
      assertEqual(i.sizeExpr(), y, `${this.name} size expr`);
      assertEqual(i.endExpr(), z, `${this.name} end expr`);
      assertEqual((i.sizeExpr() as IntVarLike).negated().index, y.negated().index, `${this.name} negated size expr`);
      assertThrows(TypeError, () => (i.startExpr() as IntVarLike).negated(), `${this.name} rejects start expr negated`);

      const variableByIndex = new Map<number, IntVarLike>([
        [x.index, x],
        [y.index, y],
      ]);
      const proto = {
        vars: [x.index, y.index],
        coeffs: [1, 2],
      };
      const expr1 = rebuild_from_linear_expression_proto(proto, model.proto());
      const canonicalExpr1 = asFlatIntExpr(expr1, variableByIndex);
      assertEqual(canonicalExpr1.vars[0], x, `${this.name} first canonical variable`);
      assertEqual(canonicalExpr1.vars[1], y, `${this.name} second canonical variable`);
      assertEqual(canonicalExpr1.coeffs[0], 1, `${this.name} first canonical coefficient`);
      assertEqual(canonicalExpr1.coeffs[1], 2, `${this.name} second canonical coefficient`);
      assertEqual(canonicalExpr1.offset, 0, `${this.name} canonical offset`);
      assertEqual(canonicalExpr1.vars[1].negated().index, y.negated().index, `${this.name} negated canonical var`);
      assertThrows(TypeError, () => (canonicalExpr1.vars[0] as any).negated(), `${this.name} rejects canonical var negated`);

      const expr2 = rebuild_from_linear_expression_proto(
        {
          ...proto,
          offset: 2,
        },
        model.proto(),
      );
      const canonicalExpr2 = asFlatIntExpr(expr2, variableByIndex);
      assertEqual(canonicalExpr2.vars[0], x, `${this.name} second pass first canonical variable`);
      assertEqual(canonicalExpr2.vars[1], y, `${this.name} second pass second canonical variable`);
      assertEqual(canonicalExpr2.coeffs[0], 1, `${this.name} second pass first canonical coefficient`);
      assertEqual(canonicalExpr2.coeffs[1], 2, `${this.name} second pass second canonical coefficient`);
      assertEqual(canonicalExpr2.offset, 2, `${this.name} second pass canonical offset`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_absent_interval matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_absent_interval',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const i = model.new_optional_interval_var(1, 0, 1, false, '');
      assertEqual(i.index, 0, `${this.name} interval index`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_optional_interval matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_optional_interval',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const b = model.new_bool_var('b');
      const x = model.new_int_var(0, 4, 'x');
      const y = model.new_int_var(0, 3, 'y');
      const i = model.new_optional_interval_var(x, 3, y, b, 'i');
      const j = model.new_optional_interval_var(x, y, 10, b, 'j');
      const k = model.new_optional_interval_var(x, y.neg(), 10, b, 'k');
      const l = model.new_optional_interval_var(x, 10, y.neg(), b.negated(), 'l');
      assertEqual(i.index, 0, `${this.name} first interval index`);
      assertEqual(j.index, 1, `${this.name} second interval index`);
      assertEqual(k.index, 2, `${this.name} third interval index`);
      assertEqual(l.index, 3, `${this.name} fourth interval index`);
      const iPresence = i.presenceLiterals();
      const lPresence = l.presenceLiterals();
      assertLength(iPresence, 1, `${this.name} first presence literal count`);
      assertEqual((iPresence[0] as BoolVarLike).index, b.index, `${this.name} first presence literal`);
      assertLength(lPresence, 1, `${this.name} negated presence literal count`);
      assertEqual((lPresence[0] as NotBoolVarLike).index, b.negated().index, `${this.name} negated presence literal`);
      assertThrows(TypeError, () => model.new_optional_interval_var(1, 2, 3, x, 'x'), `${this.name} rejects integer presence literal`);
      assertThrows(TypeError, () => model.new_optional_interval_var(b.plus(x), 2, 3, b, 'x'), `${this.name} rejects Boolean start expression`);
      assertThrows(TypeError, () => model.new_optional_interval_var(1, 2, 3, b.plus(1), 'x'), `${this.name} rejects non-literal presence expression`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_no_overlap matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_no_overlap',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 4, 'x');
      const y = model.new_int_var(0, 3, 'y');
      const z = model.new_int_var(0, 3, 'y');
      const i = model.new_interval_var(x, 3, y, 'i');
      const j = model.new_interval_var(x, 5, z, 'j');
      const ct = model.add_no_overlap([i, j]);
      assertEqual(ct.index, 2, `${this.name} constraint index`);
      assertLength(constraints(model)?.[ct.index]?.noOverlap?.intervals, 2, `${this.name} interval count`);
      assertEqual(constraints(model)?.[ct.index]?.noOverlap?.intervals?.[0], 0, `${this.name} first interval`);
      assertEqual(constraints(model)?.[ct.index]?.noOverlap?.intervals?.[1], 1, `${this.name} second interval`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_no_overlap2d matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_no_overlap2d',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 4, 'x');
      const y = model.new_int_var(0, 3, 'y');
      const z = model.new_int_var(0, 3, 'y');
      const i = model.new_interval_var(x, 3, y, 'i');
      const j = model.new_interval_var(x, 5, z, 'j');
      const ct = model.add_no_overlap_2d([i, j], [j, i]);
      const noOverlap = constraints(model)?.[ct.index]?.noOverlap2d;
      assertEqual(ct.index, 2, `${this.name} constraint index`);
      assertLength(noOverlap?.xIntervals, 2, `${this.name} x interval count`);
      assertEqual(noOverlap?.xIntervals?.[0], 0, `${this.name} first x interval`);
      assertEqual(noOverlap?.xIntervals?.[1], 1, `${this.name} second x interval`);
      assertLength(noOverlap?.yIntervals, 2, `${this.name} y interval count`);
      assertEqual(noOverlap?.yIntervals?.[0], 1, `${this.name} first y interval`);
      assertEqual(noOverlap?.yIntervals?.[1], 0, `${this.name} second y interval`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_cumulative matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_cumulative',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const intervals = Array.from({ length: 10 }, (_, index) =>
        model.new_interval_var(
          model.new_int_var(0, 10, `s_${index}`),
          5,
          model.new_int_var(5, 15, `e_${index}`),
          `interval[${index}]`,
        ),
      );
      const demands = [1, 3, 5, 2, 4, 5, 3, 4, 2, 3];
      const ct = model.add_cumulative(intervals, demands, 4);
      assertEqual(ct.index, 10, `${this.name} constraint index`);
      assertLength(constraints(model)?.[ct.index]?.cumulative?.intervals, 10, `${this.name} interval count`);
      assertThrows(TypeError, () => model.add_cumulative([intervals[0], 3 as never], [2, 3], 3), `${this.name} rejects non-interval`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_get_or_make_index_from_constant matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_get_or_make_index_from_constant',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      assertEqual(model.get_or_make_index_from_constant(3), 0, `${this.name} first constant index`);
      assertEqual(model.get_or_make_index_from_constant(3), 0, `${this.name} repeated constant index`);
      assertEqual(model.get_or_make_index_from_constant(5), 1, `${this.name} second constant index`);
      const modelVariable = variables(model)?.[0] as { domain?: number[] } | undefined;
      assertLength(modelVariable?.domain, 2, `${this.name} constant domain length`);
      assertEqual(modelVariable?.domain?.[0], 3, `${this.name} constant domain lower`);
      assertEqual(modelVariable?.domain?.[1], 3, `${this.name} constant domain upper`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_has_objective_minimize matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_has_objective_minimize',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 1, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10);
      assertEqual(model.hasObjective(), false, `${this.name} starts without objective`);
      model.minimize(y);
      assertEqual(model.hasObjective(), true, `${this.name} has objective after minimize`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_has_objective_maximize matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_has_objective_maximize',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 1, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10);
      assertEqual(model.hasObjective(), false, `${this.name} starts without objective`);
      model.maximize(y);
      assertEqual(model.hasObjective(), true, `${this.name} has objective after maximize`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_search_for_all_solutions matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_search_for_all_solutions',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, CpSolverSolutionCallback }) {
      class SolutionCounter extends CpSolverSolutionCallback {
        solutionCount = 0;

        onSolutionCallback() {
          this.solutionCount++;
        }
      }

      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 6, 6);
      const solver = new CpSolver();
      solver.parameters.enumerateAllSolutions = true;
      solver.parameters.numWorkers = 1;
      const solutionCounter = new SolutionCounter();
      const status = await solver.solve(model, solutionCounter);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solutionCounter.solutionCount, 5, `${this.name} solution count`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_solve_with_solution_callback matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_solve_with_solution_callback',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, CpSolverSolutionCallback, RuntimeError }) {
      class SolutionSum extends CpSolverSolutionCallback {
        sum = 0;
        readonly vars: unknown[];

        constructor(vars: unknown[]) {
          super();
          this.vars = vars;
        }

        onSolutionCallback() {
          const callback = this as unknown as CpSolverSolutionCallbackLike;
          this.sum = this.vars.reduce((total: number, variable) => total + callback.value(variable), 0);
        }
      }

      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 6, 6);
      const solver = new CpSolver();
      const solutionSum = new SolutionSum([x, y]);
      assertThrows(RuntimeError, () => solutionSum.value(x), `${this.name} value before solve`);
      const status = await solver.solve(model, solutionSum);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solutionSum.sum, 6, `${this.name} callback sum`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_solve_with_float_value_in_callback matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_solve_with_float_value_in_callback',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, CpSolverSolutionCallback }) {
      class SolutionFloatValue extends CpSolverSolutionCallback {
        value = 0;
        readonly expr: unknown;

        constructor(expr: unknown) {
          super();
          this.expr = expr;
        }

        onSolutionCallback() {
          this.value = (this as unknown as CpSolverSolutionCallbackLike).floatValue(this.expr);
        }
      }

      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 6, 6);
      const solver = new CpSolver();
      const solutionFloatValue = new SolutionFloatValue(x.plus(y).times(0.5));
      const status = await solver.solve(model, solutionFloatValue);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solutionFloatValue.value, 3, `${this.name} callback float value`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_value matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_value',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 10, 'x');
      const y = model.newIntVar(0, 10, 'y');
      model.add(x.plus(y.times(2)).eq(29));
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), 9, `${this.name} value(x)`);
      assertEqual(solver.value(y), 10, `${this.name} value(y)`);
      assertEqual(solver.value(2), 2, `${this.name} value(2)`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_float_value matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_float_value',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 10, 'x');
      const y = model.newIntVar(0, 10, 'y');
      model.add(x.plus(y.times(2)).eq(29));
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.floatValue(x.times(1.5).plus(0.25)), 13.75, `${this.name} float_value(x * 1.5 + 0.25)`);
      assertEqual(solver.floatValue(2.25), 2.25, `${this.name} float_value(2.25)`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_boolean_value matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_boolean_value',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newBoolVar('x');
      const y = model.newBoolVar('y');
      const z = model.newBoolVar('z');
      model.addBoolOr([x, z.negated()]);
      model.addBoolOr([x, z]);
      model.addBoolOr([x.negated(), y.negated()]);
      const solver = new CpSolver();
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.booleanValue(x), true, `${this.name} boolean_value(x)`);
      assertEqual(solver.value(x), 1 - solver.value(x.negated()), `${this.name} value(x)`);
      assertEqual(solver.value(y), 1 - solver.value(y.negated()), `${this.name} value(y)`);
      assertEqual(solver.value(z), 1 - solver.value(z.negated()), `${this.name} value(z)`);
      assertEqual(solver.booleanValue(y), false, `${this.name} boolean_value(y)`);
      assertEqual(solver.booleanValue(true), true, `${this.name} boolean_value(True)`);
      assertEqual(solver.booleanValue(false), false, `${this.name} boolean_value(False)`);
      assertEqual(solver.booleanValue(2), true, `${this.name} boolean_value(2)`);
      assertEqual(solver.booleanValue(0), false, `${this.name} boolean_value(0)`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_unsupported_operators matches upstream native-operator rejection assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_unsupported_operators',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, NotImplementedError }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 10, 'x');
      const y = model.newIntVar(0, 10, 'y');
      const z = model.newIntVar(0, 10, 'z');
      assertThrows(
        NotImplementedError,
        () => model.add((x as unknown as number) === Math.min(y as unknown as number, z as unknown as number)),
        `${this.name} rejects Math.min over variables`,
      );
      assertThrows(
        NotImplementedError,
        () => {
          if ((x as unknown as number) > (y as unknown as number)) {
            throw new Error(`${this.name} native greater-than should not evaluate`);
          }
        },
        `${this.name} rejects native greater-than`,
      );
      assertThrows(
        NotImplementedError,
        () => {
          if ((x as unknown as number) == 2) {
            throw new Error(`${this.name} native equality should not evaluate`);
          }
        },
        `${this.name} rejects native equality`,
      );
    },
  },
  {
    name: 'CpModelTest.test_is_literal_true_false.partial',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, object_is_a_true_literal, object_is_a_false_literal }) {
      const model = new CpModel();
      const x = model.newConstant(0);
      assertEqual(object_is_a_true_literal(x), false, `${this.name} constant zero is not true`);
      assertEqual(object_is_a_false_literal(x), true, `${this.name} constant zero is false`);
      assertEqual(object_is_a_true_literal(x.negated()), true, `${this.name} negated zero is true`);
      assertEqual(object_is_a_false_literal(x.negated()), false, `${this.name} negated zero is not false`);
      assertEqual(object_is_a_true_literal(true), true, `${this.name} true is true literal`);
      assertEqual(object_is_a_false_literal(false), true, `${this.name} false is false literal`);
      assertEqual(object_is_a_true_literal(false), false, `${this.name} false is not true literal`);
      assertEqual(object_is_a_false_literal(true), false, `${this.name} true is not false literal`);
      assertEqual(object_is_a_true_literal(~Number(true)), false, `${this.name} bitwise not true is not true literal`);
      assertEqual(object_is_a_false_literal(~Number(false)), false, `${this.name} bitwise not false is not false literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_solve_minimize_with_solution_callback matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_solve_minimize_with_solution_callback',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, CpSolverSolutionCallback }) {
      class SolutionObjective extends CpSolverSolutionCallback {
        obj = 0;

        onSolutionCallback() {
          this.obj = (this as unknown as CpSolverSolutionCallbackLike).objectiveValue;
        }
      }

      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 6, 6);
      model.maximize(x.plus(y.times(2)));
      const solver = new CpSolver();
      const solutionObj = new SolutionObjective();
      const status = await solver.solve(model, solutionObj);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solutionObj.obj, 11, `${this.name} callback objective`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_solution_value matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_solution_value',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, CpSolverSolutionCallback, DecisionStrategyProto_VariableSelectionStrategy, DecisionStrategyProto_DomainReductionStrategy }) {
      class RecordSolution extends CpSolverSolutionCallback {
        intVarValues: number[] = [];
        boolVarValues: boolean[] = [];
        readonly intVars: unknown[];
        readonly boolVars: unknown[];

        constructor(intVars: unknown[], boolVars: unknown[]) {
          super();
          this.intVars = intVars;
          this.boolVars = boolVars;
        }

        onSolutionCallback() {
          const callback = this as unknown as CpSolverSolutionCallbackLike;
          for (const intVar of this.intVars) {
            this.intVarValues.push(callback.value(intVar));
          }
          for (const boolVar of this.boolVars) {
            this.boolVarValues.push(callback.booleanValue(boolVar));
          }
        }
      }

      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const b = model.newBoolVar('b');
      model.addDecisionStrategy(
        [x],
        DecisionStrategyProto_VariableSelectionStrategy.CHOOSE_MIN_DOMAIN_SIZE,
        DecisionStrategyProto_DomainReductionStrategy.SELECT_MAX_VALUE,
      );
      model.addDecisionStrategy(
        [b],
        DecisionStrategyProto_VariableSelectionStrategy.CHOOSE_MIN_DOMAIN_SIZE,
        DecisionStrategyProto_DomainReductionStrategy.SELECT_MIN_VALUE,
      );
      const solver = new CpSolver();
      solver.parameters.keepAllFeasibleSolutionsInPresolve = true;
      solver.parameters.numWorkers = 1;
      const solutionRecorder = new RecordSolution([3, x, x.times(-1).plus(1)], [1, false, b.negated()]);
      const status = await solver.solve(model, solutionRecorder);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(JSON.stringify(solutionRecorder.intVarValues), JSON.stringify([3, 5, -4]), `${this.name} int var values`);
      assertEqual(JSON.stringify(solutionRecorder.boolVarValues), JSON.stringify([true, false, true]), `${this.name} bool var values`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_solution_hinting matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_solution_hinting',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 6, 6);
      model.addHint(x, 2);
      model.addHint(y, 4);
      const solver = new CpSolver();
      solver.parameters.cpModelPresolve = false;
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), 2, `${this.name} value(x)`);
      assertEqual(solver.value(y), 4, `${this.name} value(y)`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_solution_hinting_with_booleans matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_solution_hinting_with_booleans',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newBoolVar('x');
      const y = model.newBoolVar('y');
      model.addLinearConstraint(x.plus(y), 1, 1);
      model.addHint(x, true);
      model.addHint(y.negated(), true);
      const solver = new CpSolver();
      solver.parameters.cpModelPresolve = false;
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.booleanValue(x), true, `${this.name} boolean_value(x)`);
      assertEqual(solver.booleanValue(y), false, `${this.name} boolean_value(y)`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_assumptions matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_assumptions',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newBoolVar('x');
      const y = model.newBoolVar('y');
      const z = model.newBoolVar('z');
      model.addAssumption(x);
      model.addAssumptions([y.negated(), z]);
      const assumptions = model.proto().assumptions as number[] | undefined;
      assertLength(assumptions, 3, `${this.name} assumption count`);
      assertEqual(assumptions?.[0], x.index, `${this.name} first assumption`);
      assertEqual(assumptions?.[1], y.negated().index, `${this.name} second assumption`);
      assertEqual(assumptions?.[2], z.index, `${this.name} third assumption`);
      model.clearAssumptions();
      assertLength(model.proto().assumptions as number[] | undefined, 0, `${this.name} assumptions after clear`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_search_strategy matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_search_strategy',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, DecisionStrategyProto_VariableSelectionStrategy, DecisionStrategyProto_DomainReductionStrategy }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      const z = model.newBoolVar('z');
      model.addDecisionStrategy(
        [y, x, z.negated()],
        DecisionStrategyProto_VariableSelectionStrategy.CHOOSE_MIN_DOMAIN_SIZE,
        DecisionStrategyProto_DomainReductionStrategy.SELECT_MAX_VALUE,
      );
      const strategy = (model.proto().searchStrategy as Array<Record<string, any>> | undefined)?.[0];
      assertLength(model.proto().searchStrategy as unknown[] | undefined, 1, `${this.name} strategy count`);
      assertLength(strategy?.exprs, 3, `${this.name} expr count`);
      assertEqual(strategy?.exprs?.[0]?.vars?.[0], y.index, `${this.name} first expr var`);
      assertEqual(strategy?.exprs?.[0]?.coeffs?.[0], 1, `${this.name} first expr coeff`);
      assertEqual(strategy?.exprs?.[1]?.vars?.[0], x.index, `${this.name} second expr var`);
      assertEqual(strategy?.exprs?.[1]?.coeffs?.[0], 1, `${this.name} second expr coeff`);
      assertEqual(strategy?.exprs?.[2]?.vars?.[0], z.index, `${this.name} third expr var`);
      assertEqual(strategy?.exprs?.[2]?.coeffs?.[0], -1, `${this.name} third expr coeff`);
      assertEqual(strategy?.exprs?.[2]?.offset, 1, `${this.name} third expr offset`);
      assertEqual(strategy?.variableSelectionStrategy, DecisionStrategyProto_VariableSelectionStrategy.CHOOSE_MIN_DOMAIN_SIZE, `${this.name} variable strategy`);
      assertEqual(strategy?.domainReductionStrategy, DecisionStrategyProto_DomainReductionStrategy.SELECT_MAX_VALUE, `${this.name} domain strategy`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_stats matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_stats',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 4, 6);
      model.addLinearConstraint(x.times(2).plus(y), 0, 10);
      model.maximize(x.plus(y.times(2)));
      const solver = new CpSolver();
      solver.parameters.numWorkers = 1;
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.numBooleans, 0, `${this.name} num_booleans`);
      assertEqual(solver.numConflicts, 0, `${this.name} num_conflicts`);
      assertEqual(solver.numBranches, 0, `${this.name} num_branches`);
      if (solver.wallTime < 0) {
        throw new Error(`${this.name} expected wall_time >= 0.0, got ${solver.wallTime}`);
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_model_and_response_stats matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_model_and_response_stats',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 6, 6);
      model.maximize(x.plus(y.times(2)));
      if (!model.modelStats()) {
        throw new Error(`${this.name} expected model_stats() to be truthy`);
      }
      const solver = new CpSolver();
      await solver.solve(model);
      if (!solver.responseStats()) {
        throw new Error(`${this.name} expected response_stats() to be truthy`);
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_validate_model matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_validate_model',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 5, 'x');
      const y = model.newIntVar(0, 5, 'y');
      model.addLinearConstraint(x.plus(y), 6, 6);
      model.maximize(x.plus(y.times(2)));
      assertEqual(await model.validate(), '', `${this.name} validate`);
    },
  },
  {
    name: 'CpModelTest.test_copy_model.partial',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ValueError }) {
      const model = new CpModel();
      const b = model.newBoolVar('b');
      const x = model.newIntVar(0, 4, 'x');
      const y = model.newIntVar(0, 3, 'y');
      const i = model.newOptionalIntervalVar(x, 12, y, b, 'i');
      const lin = model.add(x.plus(y).le(10)) as ConstraintLike;

      const newModel = model.clone();
      const cloneB = newModel.get_bool_var_from_proto_index(b.index);
      const cloneX = newModel.get_int_var_from_proto_index(x.index);
      const cloneY = newModel.get_int_var_from_proto_index(y.index);
      const cloneI = newModel.get_interval_var_from_proto_index(i.index);
      assertEqual(cloneB.index, b.index, `${this.name} cloned bool index`);
      assertEqual(cloneX.index, x.index, `${this.name} cloned x index`);
      assertEqual(cloneY.index, y.index, `${this.name} cloned y index`);
      assertEqual(cloneI.index, i.index, `${this.name} cloned interval index`);
      assertEqual(cloneB.is_boolean, b.is_boolean, `${this.name} cloned bool is_boolean`);
      assertEqual(cloneX.is_boolean, x.is_boolean, `${this.name} cloned x is_boolean`);
      assertEqual(cloneY.is_boolean, y.is_boolean, `${this.name} cloned y is_boolean`);
      if (cloneB.model_proto === b.model_proto) {
        throw new Error(`${this.name} expected clone bool model_proto to be distinct from original`);
      }
      if (cloneX.model_proto === x.model_proto) {
        throw new Error(`${this.name} expected clone x model_proto to be distinct from original`);
      }
      if (cloneY.model_proto === y.model_proto) {
        throw new Error(`${this.name} expected clone y model_proto to be distinct from original`);
      }
      if (cloneI.model_proto === i.model_proto) {
        throw new Error(`${this.name} expected clone interval model_proto to be distinct from original`);
      }
      assertEqual(cloneB.model_proto, cloneX.model_proto, `${this.name} cloned bool/x share model_proto`);
      assertEqual(cloneB.model_proto, cloneY.model_proto, `${this.name} cloned bool/y share model_proto`);
      assertEqual(cloneB.model_proto, cloneI.model_proto, `${this.name} cloned bool/interval share model_proto`);
      assertThrows(ValueError, () => newModel.get_bool_var_from_proto_index(-1), `${this.name} rejects negative bool index`);
      assertThrows(ValueError, () => newModel.get_int_var_from_proto_index(-1), `${this.name} rejects negative int index`);
      assertThrows(ValueError, () => newModel.get_interval_var_from_proto_index(-1), `${this.name} rejects negative interval index`);
      assertThrows(TypeError, () => newModel.get_bool_var_from_proto_index(x.index), `${this.name} rejects integer as bool`);
      assertThrows(ValueError, () => newModel.get_interval_var_from_proto_index(lin.index), `${this.name} rejects non-interval constraint`);
      assertEqual((newModel.proto().constraints as any[])?.[cloneI.index]?.interval?.size?.offset, 12, `${this.name} interval size`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_custom_log matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_custom_log',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10);
      model.minimize(y);
      const solver = new CpSolver();
      solver.parameters.logSearchProgress = true;
      solver.parameters.logToStdout = false;
      let log = '';
      solver.logCallback = (message: string) => {
        log += message;
        log += '\n';
      };
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), 10, `${this.name} value(x)`);
      assertEqual(solver.value(y), -5, `${this.name} value(y)`);
      if (!log.includes('Starting CP-SAT solver')) {
        throw new Error(`${this.name} expected custom log callback to capture startup line`);
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_issue2762 matches upstream native boolean-or rejection using the high-level CP-SAT API.
    name: 'CpModelTest.test_issue2762',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, NotImplementedError }) {
      const model = new CpModel();
      const x = [model.newBoolVar('a'), model.newBoolVar('b')];
      assertThrows(
        NotImplementedError,
        () => model.add(((x[0] as unknown as number) != 0) || ((x[1] as unknown as number) != 0)),
        `${this.name} rejects native boolean-or over comparisons`,
      );
    },
  },
  {
    // TEMP: parity - CpModelTest.test_model_error matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_model_error',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = Array.from({ length: 100 }, (_, index) => model.newIntVar(0, -2, `x${index}`));
      model.add(x.slice(1).reduce((expr, variable) => expr.plus(variable), x[0]).le(1));
      const solver = new CpSolver();
      solver.parameters.logSearchProgress = true;
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'MODEL_INVALID', `${this.name} status`);
      assertEqual(solver.solutionInfo(), 'var #0 has no domain(): name: "x0"', `${this.name} solution_info`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_validate_model_with_overflow matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_validate_model_with_overflow',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, PY_INT_MAX_PROTO, 'x');
      const y = model.newIntVar(0, 10, 'y');
      model.addLinearConstraint(x.plus(y), 6, PY_INT_MAX_PROTO as never);
      model.maximize(x.plus(y.times(2)));
      const validation = await model.validate();
      if (!validation) {
        throw new Error(`${this.name} expected validate() to return a non-empty message`);
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_model_errors matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_model_errors',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel }) {
      const model = new CpModel();
      assertThrows(TypeError, () => model.add('dummy' as never), `${this.name} rejects invalid add argument`);
      assertThrows(TypeError, () => model.get_or_make_variable_index('dummy' as never), `${this.name} rejects invalid get_or_make_variable_index`);
      assertThrows(TypeError, () => model.minimize('dummy' as never), `${this.name} rejects invalid minimize argument`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_solver_errors matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_solver_errors',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, RuntimeError }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 1, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      const b = model.newBoolVar('b');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10);
      model.minimize(y);
      const solver = new CpSolver();
      assertThrows(RuntimeError, () => solver.value(x), `${this.name} value before solve`);
      assertThrows(RuntimeError, () => solver.booleanValue(b), `${this.name} booleanValue before solve`);
      assertThrows(RuntimeError, () => solver.best_objective_bound, `${this.name} best bound before solve`);
      assertThrows(RuntimeError, () => solver.deterministic_time, `${this.name} deterministic time before solve`);
      assertThrows(RuntimeError, () => solver.num_binary_propagations, `${this.name} num binary propagations before solve`);
      assertThrows(RuntimeError, () => solver.num_booleans, `${this.name} num booleans before solve`);
      assertThrows(RuntimeError, () => solver.num_branches, `${this.name} num branches before solve`);
      assertThrows(RuntimeError, () => solver.num_conflicts, `${this.name} num conflicts before solve`);
      assertThrows(RuntimeError, () => solver.num_integer_propagations, `${this.name} num integer propagations before solve`);
      assertThrows(RuntimeError, () => solver.objective_value, `${this.name} objective value before solve`);
      assertThrows(RuntimeError, () => solver.response_proto, `${this.name} response proto before solve`);
      assertThrows(RuntimeError, () => solver.user_time, `${this.name} user time before solve`);
      assertThrows(RuntimeError, () => solver.wall_time, `${this.name} wall time before solve`);
      await solver.solve(model);
      assertThrows(TypeError, () => solver.value('not_a_variable' as never), `${this.name} rejects invalid expression`);
      assertThrows(TypeError, () => model.addBoolOr([x, y]), `${this.name} rejects integer literal`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_large_sum matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_large_sum',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, sum }) {
      const model = new CpModel();
      const x = Array.from({ length: 100000 }, (_, index) => model.newIntVar(0, 10, `x${index}`));
      model.add(sum(x).eq(10));
    },
  },
  {
    // TEMP: parity - CpModelTest.test_issue4759 matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_issue4759',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, sum }) {
      const model = new CpModel();
      const a = model.newBoolVar('a');
      const expressionText = String(a.times(0).plus(sum([a.times(1), a.times(2)])));
      if (expressionText.length === 0) {
        throw new Error(`${this.name} expected non-empty expression string`);
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_pre_pep8 matches upstream legacy alias assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_pre_pep8',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, sum }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.NewBoolVar(`x${index}`));
      model.AddBoolOr(x);
      model.Maximize(sum(x));
      assertLength(variables(model), 5, `${this.name} variable count`);
      assertLength(constraints(model), 1, `${this.name} constraint count`);
      assertLength(constraints(model)?.[0]?.boolOr?.literals, 5, `${this.name} bool_or literal count`);
      if (typeof model.Proto !== 'function') {
        throw new Error(`${this.name} expected Proto alias`);
      }
      const modelCopy = model;
      const modelDeepcopy = model.clone();
      for (const [label, copiedModel] of [['copy', modelCopy], ['deepcopy', modelDeepcopy]] as const) {
        if (
          typeof copiedModel.AddBoolOr !== 'function'
          || typeof copiedModel.AddBoolXOr !== 'function'
          || typeof copiedModel.AddNoOverlap2D !== 'function'
        ) {
          throw new Error(`${this.name} expected ${label} model to keep pre-PEP8 aliases`);
        }
      }
    },
  },
  {
    // TEMP: parity - CpModelTest.test_issue4434 matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_issue4434',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const i = model.NewIntVar(0, 10, 'i');
      const j = model.NewIntVar(0, 10, 'j');
      const exprEq = i.plus(j).eq(5);
      const exprNe = i.plus(j).ne(5);
      const exprGe = i.plus(j).ge(5);
      assertPresent(exprEq, `${this.name} equality expression`);
      assertPresent(exprNe, `${this.name} inequality expression`);
      assertPresent(exprGe, `${this.name} greater-equal expression`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_compare_with_none matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_compare_with_none',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 10, 'x');
      assertThrows(TypeError, () => x.eq(null as never), `${this.name} rejects eq(null)`);
      assertThrows(TypeError, () => x.ne(null as never), `${this.name} rejects ne(null)`);
      assertThrows(TypeError, () => x.lt(null as never), `${this.name} rejects lt(null)`);
      assertThrows(TypeError, () => x.le(null as never), `${this.name} rejects le(null)`);
      assertThrows(TypeError, () => x.gt(null as never), `${this.name} rejects gt(null)`);
      assertThrows(TypeError, () => x.ge(null as never), `${this.name} rejects ge(null)`);
    },
  },
  {
    name: 'CpModelTest.test_in_place_sum_modifications.partial',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, sum }) {
      const model = new CpModel();
      const x = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 10, `x${index}`));
      const y = Array.from({ length: 5 }, (_, index) => model.newIntVar(0, 10, `y${index}`));

      const e1 = sum(x) as LinearExprLike;
      assertFlatExpr(e1, x.map((variable) => [variable, 1] as const), 0, `${this.name} e1`);
      const e1String = String(e1);
      e1.plus(y[0]);
      (sum(y) as LinearExprLike).plus(e1);
      assertEqual(String(e1), e1String, `${this.name} e1 remains unchanged`);

      const e2 = (sum(x) as LinearExprLike).minus(2).minus(y[0]).minus(0.1);
      const e2String = String(e2);
      assertFlatExpr(e2, [...x.map((variable) => [variable, 1] as const), [y[0], -1] as const], -2.1, `${this.name} e2`);
      e2.plus(2.5);
      assertEqual(String(e2), e2String, `${this.name} e2 remains unchanged`);

      const e3 = (sum(x) as LinearExprLike).plus(1.2).plus(0.3);
      assertFlatExpr(e3, x.map((variable) => [variable, 1] as const), 1.5, `${this.name} e3`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_complex_iadd matches upstream accumulated expression equivalence using the high-level CP-SAT API.
    name: 'CpModelTest.test_complex_iadd',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const deltaDown0 = model.newBoolVar('Delta_down_0');
      const acFlow010 = model.newBoolVar('ac_flow_0_10');
      const acFlow011 = model.newBoolVar('ac_flow_0_11');

      let expr1 = deltaDown0.times(-3);
      expr1 = expr1.plus(acFlow010);
      expr1 = expr1.plus(acFlow011);

      const expr2 = deltaDown0.times(-3).plus(acFlow010).plus(acFlow011);
      const vars = [deltaDown0, acFlow010, acFlow011];
      assertEqual(flatExprSignature(expr1, vars), flatExprSignature(expr2, vars), `${this.name} flat expression`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_complex_isub matches upstream accumulated expression equivalence using the high-level CP-SAT API.
    name: 'CpModelTest.test_complex_isub',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const deltaDown0 = model.newBoolVar('Delta_down_0');
      const acFlow010 = model.newBoolVar('ac_flow_0_10');
      const acFlow011 = model.newBoolVar('ac_flow_0_11');

      let expr1 = deltaDown0.times(-3);
      expr1 = expr1.minus(acFlow010);
      expr1 = expr1.minus(acFlow011);

      const expr2 = deltaDown0.times(-3).minus(acFlow010).minus(acFlow011);
      const vars = [deltaDown0, acFlow010, acFlow011];
      assertEqual(flatExprSignature(expr1, vars), flatExprSignature(expr2, vars), `${this.name} flat expression`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_radd matches upstream string assertion using the high-level CP-SAT API.
    name: 'CpModelTest.test_radd',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, sum }) {
      const model = new CpModel();
      const x = Array.from({ length: 10 }, (_, index) => model.newIntVar(0, 10, `x${index}`));
      const expr = (sum(x) as LinearExprLike).plus(1);
      assertEqual(String(expr), '(x0 + x1 + x2 + x3 + x4 + x5 + x6 + x7 + x8 + x9 + 1)', `${this.name} expression string`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification1 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification1',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.times(2).times(2);
      assertFlatExpr(prod, [[x, 4]], 0, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification2 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification2',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.times(2).times(2);
      assertFlatExpr(prod, [[x, 4]], 0, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification3 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification3',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.times(2).times(2);
      assertFlatExpr(prod, [[x, 4]], 0, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification4 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification4',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.times(2).times(2);
      assertFlatExpr(prod, [[x, 4]], 0, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification5 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification5',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.plus(1).times(2);
      assertFlatExpr(prod, [[x, 2]], 2, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification6 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification6',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.plus(1).times(2);
      assertFlatExpr(prod, [[x, 2]], 2, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification7 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification7',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.minus(1).times(2);
      assertFlatExpr(prod, [[x, 2]], -2, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification8 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification8',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.minus(1).times(2);
      assertFlatExpr(prod, [[x, 2]], -2, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification9 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification9',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.neg().plus(1).times(2);
      assertFlatExpr(prod, [[x, -2]], 2, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_simplification10 matches upstream normalized expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_simplification10',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const prod = x.neg().plus(1).times(2);
      assertFlatExpr(prod, [[x, -2]], 2, this.name);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_str matches upstream string and flat-expression assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_str',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, Domain, LinearExpr, BoundedLinearExpression, FlatIntExpr, FlatFloatExpr }) {
      const model = new CpModel();
      const x = model.new_int_var(0, 4, 'x');
      assertEqual(String(x.eq(2)), 'x == 2', `${this.name} equality string`);
      assertEqual(String(x.ge(2)), 'x >= 2', `${this.name} greater-equal string`);
      assertEqual(String(x.le(2)), 'x <= 2', `${this.name} less-equal string`);
      assertEqual(String(x.gt(2)), 'x >= 3', `${this.name} greater-than string`);
      assertEqual(String(x.lt(2)), 'x <= 1', `${this.name} less-than string`);
      assertEqual(String(x.ne(2)), 'x != 2', `${this.name} not-equal string`);
      assertEqual(String(x.times(3)), '(3 * x)', `${this.name} term string`);
      assertEqual(String(x.neg()), '(-x)', `${this.name} negated expression string`);
      assertEqual(String(x.plus(3)), '(x + 3)', `${this.name} plus offset string`);
      assertEqual(String(x.le(PY_INT_MAX as never)), 'True (unbounded expr x)', `${this.name} upper int64 string`);
      assertEqual(String(x.ne(PY_INT_MAX as never)), 'x <= 9223372036854775806', `${this.name} not int64 max string`);
      assertEqual(String(x.ne(PY_INT_MIN as never)), 'x >= -9223372036854775807', `${this.name} not int64 min string`);
      const y = model.new_int_var(0, 4, 'y');
      assertEqual(
        String(LinearExpr.weighted_sum([x, y.plus(1), 2], [1, -2, 3])),
        '(x - 2 * (y + 1) + 6)',
        `${this.name} weighted sum string`,
      );
      assertEqual(String(x.ne(y)), '(x - y) != 0', `${this.name} var not-equal string`);
      assertEqual(String(LinearExpr.term(x, 3)), '(3 * x)', `${this.name} LinearExpr.term string`);
      assertEqual(String(new BoundedLinearExpression(x, new Domain(0, 10))), '0 <= x <= 10', `${this.name} bounded expression string`);
      const e1 = LinearExpr.sum([x, y]).times(2);
      const flatE1 = new FlatIntExpr(e1);
      assertEqual(String(e1), '(2 * (x + y))', `${this.name} sum scaling string`);
      assertArrayEqual(flatE1.vars, [x, y], `${this.name} flat int vars`);
      assertArrayEqual(flatE1.coeffs, [2, 2], `${this.name} flat int coeffs`);
      assertEqual(flatE1.offset, 0, `${this.name} flat int offset`);
      const repeatFlatE1 = new FlatIntExpr(flatE1.plus(3));
      assertArrayEqual(repeatFlatE1.vars, [x, y], `${this.name} repeated flat int vars`);
      assertArrayEqual(repeatFlatE1.coeffs, [2, 2], `${this.name} repeated flat int coeffs`);
      assertEqual(repeatFlatE1.offset, 3, `${this.name} repeated flat int offset`);
      const floatFlatE1 = new FlatFloatExpr(flatE1);
      assertArrayEqual(floatFlatE1.vars, [x, y], `${this.name} flat float vars`);
      assertArrayEqual(floatFlatE1.coeffs, [2, 2], `${this.name} flat float coeffs`);
      assertEqual(floatFlatE1.offset, 0, `${this.name} flat float offset`);
      const repeatFloatFlatE1 = new FlatFloatExpr(floatFlatE1.minus(2.5));
      assertArrayEqual(repeatFloatFlatE1.vars, [x, y], `${this.name} repeated flat float vars`);
      assertArrayEqual(repeatFloatFlatE1.coeffs, [2, 2], `${this.name} repeated flat float coeffs`);
      assertEqual(repeatFloatFlatE1.offset, -2.5, `${this.name} repeated flat float offset`);
      const b = model.new_bool_var('b');
      assertEqual(String(LinearExpr.term(b.negated(), 3)), '(3 * not(b))', `${this.name} negated literal term string`);
      const i = model.new_interval_var(x, 2, y, 'i');
      assertEqual(String(i), 'i', `${this.name} interval string`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_repr matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_repr',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, LinearExpr }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 4, 'x');
      const y = model.newIntVar(0, 3, 'y');
      const z = model.newIntVar(0, 3, 'z');
      assertEqual(x.repr(), 'x(0..4)', `${this.name} int var repr`);
      assertEqual(x.plus(0).repr?.(), 'x(0..4)', `${this.name} plus zero repr`);
      assertEqual(x.plus(0.0).repr?.(), 'x(0..4)', `${this.name} plus zero float repr`);
      assertEqual(x.minus(0).repr?.(), 'x(0..4)', `${this.name} minus zero repr`);
      assertEqual(x.minus(0.0).repr?.(), 'x(0..4)', `${this.name} minus zero float repr`);
      assertEqual(x.times(1).repr?.(), 'x(0..4)', `${this.name} times one repr`);
      assertEqual(x.times(1.0).repr?.(), 'x(0..4)', `${this.name} times one float repr`);
      assertEqual(x.times(0).repr?.(), 'IntConstant(0)', `${this.name} times zero repr`);
      assertEqual(x.times(0.0).repr?.(), 'IntConstant(0)', `${this.name} times zero float repr`);
      assertEqual(x.times(2).repr?.(), 'IntAffine(expr=x(0..4), coeff=2, offset=0)', `${this.name} times two repr`);
      assertEqual(x.plus(1.5).repr?.(), 'FloatAffine(expr=x(0..4), coeff=1, offset=1.5)', `${this.name} plus float repr`);
      assertEqual(x.plus(y).repr?.(), 'SumArray(x(0..4), y(0..3))', `${this.name} sum repr`);
      assertEqual(LinearExpr.sum([x, y, z]).repr?.(), 'SumArray(x(0..4), y(0..3), z(0..3))', `${this.name} linear sum repr`);
      assertEqual(
        LinearExpr.weightedSum([x, y, 2], [1, 2, 3]).repr?.(),
        'IntWeightedSum([x(0..4), y(0..3)], [1, 2], 6)',
        `${this.name} weighted sum repr`,
      );
      const i = model.newIntervalVar(x, 2, y, 'i');
      assertEqual(i.repr(), 'i(start = x, size = 2, end = y)', `${this.name} interval repr`);
      const b = model.newBoolVar('b');
      assertEqual(b.repr(), 'b(0..1)', `${this.name} bool repr`);
      assertEqual(b.negated().repr(), 'NotBooleanVariable(var_index=3)', `${this.name} negated bool repr`);
      const x1 = model.newIntVar(0, 4, 'x1');
      const y1 = model.newIntVar(0, 3, 'y1');
      const j = model.newOptionalIntervalVar(x1, 2, y1, b, 'j');
      assertEqual(j.repr(), 'j(start = x1, size = 2, end = y1, is_present = b)', `${this.name} optional interval repr`);
      const x2 = model.newIntVar(0, 4, 'x2');
      const y2 = model.newIntVar(0, 3, 'y2');
      const k = model.newOptionalIntervalVar(x2, 2, y2, b.negated(), 'k');
      assertEqual(k.repr(), 'k(start = x2, size = 2, end = y2, is_present = not(b))', `${this.name} negated optional interval repr`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_integer_expression_errors matches upstream error assertions using Python-compatible dunder operator aliases.
    name: 'CpModelTest.test_integer_expression_errors',
    source: 'ortools/sat/python/cp_model_test.py',
    run({ CpModel, ArithmeticError, NotImplementedError }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 1, 'x');
      const y = model.newIntVar(0, 3, 'y');
      assertThrows(TypeError, () => x.__mul__(y as never), `${this.name} rejects variable multiplication`);
      assertThrows(NotImplementedError, () => x.__div__(y), `${this.name} rejects div`);
      assertThrows(NotImplementedError, () => x.__truediv__(y), `${this.name} rejects true div`);
      assertThrows(NotImplementedError, () => x.__mod__(y), `${this.name} rejects mod`);
      assertThrows(NotImplementedError, () => x.__pow__(y), `${this.name} rejects pow`);
      assertThrows(NotImplementedError, () => x.__lshift__(y), `${this.name} rejects left shift`);
      assertThrows(NotImplementedError, () => x.__rshift__(y), `${this.name} rejects right shift`);
      assertThrows(NotImplementedError, () => x.__and__(y), `${this.name} rejects bitwise and`);
      assertThrows(NotImplementedError, () => x.__or__(y), `${this.name} rejects bitwise or`);
      assertThrows(NotImplementedError, () => x.__xor__(y), `${this.name} rejects bitwise xor`);
      assertThrows(ArithmeticError, () => x.__lt__(PY_INT_MIN as never), `${this.name} rejects less than INT_MIN`);
      assertThrows(ArithmeticError, () => x.__gt__(PY_INT_MAX as never), `${this.name} rejects greater than INT_MAX`);
      assertThrows(TypeError, () => x.__add__('dummy' as never), `${this.name} rejects string addition`);
      assertThrows(TypeError, () => x.__mul__('dummy' as never), `${this.name} rejects string multiplication`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_raise_python_exception_in_callback matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_raise_python_exception_in_callback',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver, CpSolverSolutionCallback, ValueError }) {
      const model = new CpModel();
      const jobs = [
        [3, 3],
        [2, 5],
        [1, 3],
        [3, 7],
        [7, 3],
        [2, 2],
        [2, 2],
        [5, 5],
        [10, 2],
        [4, 3],
        [2, 6],
        [1, 2],
        [6, 8],
        [4, 5],
        [3, 7],
      ] as const;
      const maxWidth = 10;
      const horizon = jobs.reduce((total, [duration]) => total + duration, 0);

      const intervals = [];
      const intervals0 = [];
      const intervals1 = [];
      const performed = [];
      const ends = [];
      const demands = [];

      for (const [index, [duration, width]] of jobs.entries()) {
        const start = model.new_int_var(0, horizon, `start_${index}`);
        const end = model.new_int_var(0, horizon, `end_${index}`);
        intervals.push(model.new_interval_var(start, duration, end, `interval_${index}`));
        ends.push(end);
        demands.push(width);

        const performedOnM0 = model.new_bool_var(`perform_${index}_on_m0`);
        performed.push(performedOnM0);
        const start0 = model.new_int_var(0, horizon, `start_${index}_on_m0`);
        const end0 = model.new_int_var(0, horizon, `end_${index}_on_m0`);
        intervals0.push(model.new_optional_interval_var(start0, duration, end0, performedOnM0, `interval_${index}_on_m0`));

        const start1 = model.new_int_var(0, horizon, `start_${index}_on_m1`);
        const end1 = model.new_int_var(0, horizon, `end_${index}_on_m1`);
        intervals1.push(model.new_optional_interval_var(start1, duration, end1, performedOnM0.negated(), `interval_${index}_on_m1`));

        model.add(start0.eq(start)).onlyEnforceIf(performedOnM0);
        model.add(start1.eq(start)).onlyEnforceIf(performedOnM0.negated());
      }

      model.add_cumulative(intervals, demands, maxWidth);
      model.add_no_overlap(intervals0);
      model.add_no_overlap(intervals1);
      const makespan = model.new_int_var(0, horizon, 'makespan');
      model.add_max_equality(makespan, ends);
      model.minimize(makespan);
      model.add(performed[0].eq(0));

      const message = 'this is my test message';
      class RaiseException extends CpSolverSolutionCallback {
        onSolutionCallback() {
          throw new ValueError(message);
        }
      }

      const solver = new CpSolver();
      solver.parameters.logSearchProgress = true;
      solver.parameters.numWorkers = 1;
      await assertRejects(ValueError, solver.solve(model, new RaiseException()), `${this.name} callback exception`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_best_bound_callback matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_best_bound_callback',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x0 = model.newBoolVar('x0');
      const x1 = model.newBoolVar('x1');
      const x2 = model.newBoolVar('x2');
      const x3 = model.newBoolVar('x3');
      model.addBoolOr(x0, x1, x2, x3);
      model.minimize(
        x0.times(3)
          .plus(x1.times(2))
          .plus(x2.times(4))
          .plus(x3.times(5))
          .plus(0.6),
      );
      const solver = new CpSolver();
      let bestBound = 0;
      solver.best_bound_callback = (bound: number) => {
        bestBound = bound;
      };
      solver.parameters.numWorkers = 1;
      solver.parameters.linearizationLevel = 2;
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(bestBound, 2.6, `${this.name} best bound`);
    },
  },
  {
    // TEMP: parity - CpModelTest.test_log_to_response matches upstream assertions using the high-level CP-SAT API.
    name: 'CpModelTest.test_log_to_response',
    source: 'ortools/sat/python/cp_model_test.py',
    async run({ CpModel, CpSolver }) {
      const model = new CpModel();
      const x = model.newIntVar(-10, 10, 'x');
      const y = model.newIntVar(-10, 10, 'y');
      model.addLinearConstraint(x.plus(y.times(2)), 0, 10);
      model.minimize(y);
      const solver = new CpSolver();
      solver.parameters.logSearchProgress = true;
      solver.parameters.logToStdout = false;
      solver.parameters.logToResponse = true;
      const status = await solver.solve(model);
      assertEqual(solver.statusName(status), 'OPTIMAL', `${this.name} status`);
      assertEqual(solver.value(x), 10, `${this.name} value(x)`);
      assertEqual(solver.value(y), -5, `${this.name} value(y)`);
      if (!solver.solve_log || !solver.solve_log.includes('Starting CP-SAT solver')) {
        throw new Error(`${this.name} expected solve_log to include solver startup`);
      }
    },
  },
];

export async function runCpSatHighLevelParityCases(api: HighLevelApi) {
  const results: CpSatHighLevelParityResult[] = [];
  for (const mode of executorFixtureModes) {
    await withCpSatExecutorMode(api, mode, async () => {
      for (const profile of [
        { label: '1 worker', numWorkers: 1 },
        { label: '4 workers', numWorkers: 4 },
      ]) {
        class MatrixCpSolver extends api.CpSolver {
          constructor() {
            super();
            this.parameters.numWorkers = profile.numWorkers;
          }
        }
        const matrixApi = {
          ...api,
          CpSolver: MatrixCpSolver,
        };
        for (const testCase of cpSatHighLevelParityCases) {
          try {
            await testCase.run(matrixApi);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${testCase.name} (${mode}, ${profile.label}) failed: ${message}`);
          }
          results.push({
            id: testCase.id ?? cpSatHighLevelCaseId(testCase.name),
            name: `${testCase.name} (${mode}, ${profile.label})`,
            solver: testCase.solver ?? 'cp-sat',
            source: testCase.source,
            upstream: testCase.upstream ?? testCase.name,
            tags: [...(testCase.tags ?? ['python-parity', 'high-level']), mode, `${profile.numWorkers}-workers`],
            mode,
            workerProfile: profile.label,
            params: { numWorkers: profile.numWorkers },
            ok: true,
          });
        }
      }
    });
  }
  return results;
}
