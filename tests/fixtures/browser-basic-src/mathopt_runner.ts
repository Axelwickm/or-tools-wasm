import { mathOptExpressionContractCases } from './mathopt_expression_contract.ts';
import { runMathOptModelContractCases } from './mathopt_model_contract.ts';
import { mathoptSolveResultContractCases } from './mathopt_solve_result_contract.ts';
import { fixtureModes, withWorkerBridgeMode } from './shared_case.ts';

export type MathOptCaseResult = {
  id?: string;
  name: string;
  solver?: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode: 'direct' | 'worker';
  threads: number;
  ok: boolean;
  terminationReason: string;
  objectiveValue: number | null;
  values: Record<string, number>;
};

type MathOptRunOptions = {
  onProgress?: (name: string, mode: 'direct' | 'worker', threads: number) => void;
};

type MathOptVariableLike = {
  readonly id: number;
  readonly name: string;
  lowerBound?: number;
  upperBound?: number;
  integer?: boolean;
  lower_bound?: number;
  upper_bound?: number;
  is_integer?: boolean;
  equals?(other: MathOptVariableLike): boolean;
  toString(): string;
};

type MathOptLinearConstraintLike = {
  readonly id: number;
  readonly name: string;
  lowerBound?: number;
  upperBound?: number;
  lower_bound?: number;
  upper_bound?: number;
  setCoefficient?(variable: MathOptVariableLike, coefficient: number): void;
  set_coefficient?(variable: MathOptVariableLike, coefficient: number): void;
  getCoefficient?(variable: MathOptVariableLike): number;
  get_coefficient?(variable: MathOptVariableLike): number;
  terms?(): Array<{ variable: MathOptVariableLike; coefficient: number }>;
  as_bounded_linear_expression?(): MathOptBoundedExpressionLike<MathOptLinearExpressionLike>;
  equals?(other: MathOptLinearConstraintLike): boolean;
  toString(): string;
};

type MathOptLinearTermLike = {
  variable: MathOptVariableLike;
  coefficient: number;
};

type MathOptQuadraticTermLike = {
  firstVariable: MathOptVariableLike;
  secondVariable: MathOptVariableLike;
  coefficient: number;
};

type MathOptQuadraticTermKeyLike = {
  firstVariable: MathOptVariableLike;
  secondVariable: MathOptVariableLike;
  equals(other: MathOptQuadraticTermKeyLike): boolean;
};

type MathOptLinearExpressionLike = {
  offset: number;
  terms: ReadonlyMap<MathOptVariableLike, number>;
  add(input: unknown): MathOptLinearExpressionLike;
  subtract(input: unknown): MathOptLinearExpressionLike;
  multiply(coefficient: number): MathOptLinearExpressionLike;
  evaluate(values: Map<MathOptVariableLike, number> | Record<string | number, number>): number;
};

type MathOptQuadraticExpressionLike = {
  offset: number;
  linearTerms: ReadonlyMap<MathOptVariableLike, number>;
  quadraticTerms: ReadonlyMap<unknown, number>;
  add(input: unknown): MathOptQuadraticExpressionLike;
  subtract(input: unknown): MathOptQuadraticExpressionLike;
  multiply(coefficient: number): MathOptQuadraticExpressionLike;
  evaluate(values: Map<MathOptVariableLike, number> | Record<string | number, number>): number;
};

type MathOptVarEqVarLike = {
  firstVariable: MathOptVariableLike;
  first_variable: MathOptVariableLike;
  secondVariable: MathOptVariableLike;
  second_variable: MathOptVariableLike;
  assertNotBoolean(): never;
};

type MathOptExpressionInput =
  | number
  | MathOptVariableLike
  | MathOptLinearTermLike
  | MathOptQuadraticTermLike
  | MathOptLinearExpressionLike
  | MathOptQuadraticExpressionLike;

type MathOptBoundedExpressionLike<T> = {
  lowerBound: number;
  lower_bound: number;
  expression: T;
  upperBound: number;
  upper_bound: number;
  assertNotBoolean(): never;
  toString(): string;
};

type MathOptLowerBoundedExpressionLike<T> = {
  lowerBound: number;
  lower_bound: number;
  expression: T;
  upperBound: number;
  upper_bound: number;
  toBoundedExpression(upperBound: number): MathOptBoundedExpressionLike<T>;
  assertNotBoolean(): never;
  toString(): string;
};

type MathOptUpperBoundedExpressionLike<T> = {
  lowerBound: number;
  lower_bound: number;
  expression: T;
  upperBound: number;
  upper_bound: number;
  toBoundedExpression(lowerBound: number): MathOptBoundedExpressionLike<T>;
  assertNotBoolean(): never;
  toString(): string;
};

type MathOptModelLike = {
  readonly name: string;
  readonly objective?: MathOptObjectiveLike;
  addVariable(options?: {
    lb?: number;
    ub?: number;
    isInteger?: boolean;
    is_integer?: boolean;
    lowerBound?: number;
    upperBound?: number;
    integer?: boolean;
    name?: string;
  }): MathOptVariableLike;
  addIntegerVariable?(options?: {
    lowerBound?: number;
    upperBound?: number;
    name?: string;
  }): MathOptVariableLike;
  addBinaryVariable?(options?: {
    name?: string;
  }): MathOptVariableLike;
  add_variable?(options?: {
    lowerBound?: number;
    upperBound?: number;
    integer?: boolean;
    name?: string;
  }): MathOptVariableLike;
  add_integer_variable?(options?: {
    lowerBound?: number;
    upperBound?: number;
    name?: string;
  }): MathOptVariableLike;
  add_binary_variable?(options?: {
    name?: string;
  }): MathOptVariableLike;
  addLinearConstraint(options?: {
    lb?: number;
    ub?: number;
    expr?: unknown;
    lowerBound?: number;
    upperBound?: number;
    terms?: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    expression?: unknown;
    name?: string;
  } | MathOptBoundedExpressionLike<MathOptLinearExpressionLike> | MathOptLowerBoundedExpressionLike<MathOptLinearExpressionLike> | MathOptUpperBoundedExpressionLike<MathOptLinearExpressionLike>): MathOptLinearConstraintLike;
  addIndicatorConstraint?(options?: {
    indicator?: MathOptVariableLike;
    activateOnZero?: boolean;
    activate_on_zero?: boolean;
    impliedConstraint?: unknown;
    implied_constraint?: unknown;
    lowerBound?: number;
    upperBound?: number;
    terms?: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    expression?: unknown;
    name?: string;
  }): unknown;
  add_indicator_constraint?(options?: {
    indicator?: MathOptVariableLike;
    activate_on_zero?: boolean;
    implied_constraint?: unknown;
    lower_bound?: number;
    upper_bound?: number;
    terms?: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    expression?: unknown;
    name?: string;
  }): unknown;
  add_linear_constraint?(options?: {
    lb?: number;
    ub?: number;
    expr?: unknown;
    lowerBound?: number;
    upperBound?: number;
    terms?: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    expression?: unknown;
    name?: string;
  } | MathOptBoundedExpressionLike<MathOptLinearExpressionLike> | MathOptLowerBoundedExpressionLike<MathOptLinearExpressionLike> | MathOptUpperBoundedExpressionLike<MathOptLinearExpressionLike>): MathOptLinearConstraintLike;
  variables?(): MathOptVariableLike[];
  getVariable?(id: number): MathOptVariableLike | undefined;
  get_variable?(id: number, options?: { validate?: boolean }): MathOptVariableLike;
  hasVariable?(id: number): boolean;
  has_variable?(id: number): boolean;
  getNumVariables?(): number;
  get_num_variables?(): number;
  getNextVariableId?(): number;
  get_next_variable_id?(): number;
  ensureNextVariableIdAtLeast?(id: number): void;
  ensure_next_variable_id_at_least?(id: number): void;
  linearConstraints?(): MathOptLinearConstraintLike[];
  linear_constraints?(): MathOptLinearConstraintLike[];
  getLinearConstraint?(id: number): MathOptLinearConstraintLike | undefined;
  get_linear_constraint?(id: number, options?: { validate?: boolean }): MathOptLinearConstraintLike;
  hasLinearConstraint?(id: number): boolean;
  has_linear_constraint?(id: number): boolean;
  getNumLinearConstraints?(): number;
  get_num_linear_constraints?(): number;
  getNextLinearConstraintId?(): number;
  get_next_linear_constraint_id?(): number;
  ensureNextLinearConstraintIdAtLeast?(id: number): void;
  ensure_next_linear_constraint_id_at_least?(id: number): void;
  deleteVariable?(variable: MathOptVariableLike): void;
  delete_variable?(variable: MathOptVariableLike): void;
  deleteLinearConstraint?(constraint: MathOptLinearConstraintLike): void;
  delete_linear_constraint?(constraint: MathOptLinearConstraintLike): void;
  column_nonzeros?(variable: MathOptVariableLike): MathOptLinearConstraintLike[];
  row_nonzeros?(constraint: MathOptLinearConstraintLike): MathOptVariableLike[];
  linear_constraint_matrix_entries?(): Array<{
    linearConstraint?: MathOptLinearConstraintLike;
    linear_constraint?: MathOptLinearConstraintLike;
    variable: MathOptVariableLike;
    coefficient: number;
  }>;
  maximize_linear_objective?(terms: unknown, offset?: number): void;
  minimize_linear_objective?(terms: unknown, offset?: number): void;
  set_linear_objective?(terms: unknown, isMaximize: boolean, offset?: number): void;
  set_objective?(terms: unknown, isMaximize: boolean, offset?: number): void;
  set_quadratic_objective?(terms: unknown, isMaximize: boolean, offset?: number): void;
  maximize(terms: unknown, offset?: number): void;
  minimize(terms: unknown, offset?: number): void;
};

type MathOptObjectiveLike = {
  isMaximize?: boolean;
  is_maximize?: boolean;
  offset: number;
  name: string;
  clear(): void;
  set_linear_coefficient(variable: MathOptVariableLike, coefficient: number): void;
  get_linear_coefficient(variable: MathOptVariableLike): number;
  linear_terms(): MathOptLinearTermLike[];
  set_quadratic_coefficient(firstVariable: MathOptVariableLike, secondVariable: MathOptVariableLike, coefficient: number): void;
  get_quadratic_coefficient(firstVariable: MathOptVariableLike, secondVariable: MathOptVariableLike): number;
  quadratic_terms(): MathOptQuadraticTermLike[];
};

export type MathOptApi = {
  initMathOpt(): Promise<void>;
  MathOpt: {
    SolverType: {
      GLOP: number;
      GSCIP: number;
      CP_SAT: number;
      GLPK: number;
    };
    LPAlgorithm: Record<string, string | number>;
    Emphasis: Record<string, string | number>;
    GScipEmphasis: Record<string, string | number>;
    GScipMetaParamValue: Record<string, string | number>;
    PdlpRestartStrategy: Record<string, string | number>;
    PdlpSchedulerType: Record<string, string | number>;
    GScipParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    GlopParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    PdlpParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    GlpkParameters: new (options?: {
      computeUnboundRaysIfPossible?: boolean;
      compute_unbound_rays_if_possible?: boolean;
    }) => { toProtoBytes(): Uint8Array };
    SolveInterrupter: new () => {
      readonly interrupted: boolean;
      interrupt(): void;
      isInterrupted?(): boolean;
      is_interrupted?(): boolean;
    };
    SolveParameters: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    ModelSolveParameters: {
      new (options?: Record<string, unknown>): { toProtoBytes(): Uint8Array };
      onlySomePrimalVariables?(variables: MathOptVariableLike[]): { toProtoBytes(): Uint8Array };
      only_some_primal_variables?(variables: MathOptVariableLike[]): { toProtoBytes(): Uint8Array };
    };
    SparseVectorFilter: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    SolutionHint: new (options?: Record<string, unknown>) => { toProtoBytes(): Uint8Array };
    IncrementalSolver: new (...args: any[]) => {
      solve(options?: Record<string, unknown>): Promise<any>;
      close(): Promise<void>;
    };
    LinearExpression: abstract new (...args: never[]) => MathOptLinearExpressionLike;
    QuadraticExpression: abstract new (...args: never[]) => MathOptQuadraticExpressionLike;
    QuadraticTermKey: abstract new (...args: never[]) => MathOptQuadraticTermKeyLike;
    VarEqVar: abstract new (...args: never[]) => MathOptVarEqVarLike;
    BoundedExpression: abstract new (...args: never[]) => MathOptBoundedExpressionLike<unknown>;
    LowerBoundedExpression: abstract new (...args: never[]) => MathOptLowerBoundedExpressionLike<unknown>;
    UpperBoundedExpression: abstract new (...args: never[]) => MathOptUpperBoundedExpressionLike<unknown>;
    Model(name?: string): MathOptModelLike;
    linearTerm(variable: unknown, coefficient?: number): MathOptLinearTermLike;
    quadraticTerm(firstVariable: unknown, secondVariable: unknown, coefficient?: number): MathOptQuadraticTermLike;
    fastSum(inputs: Iterable<unknown>): MathOptLinearExpressionLike | MathOptQuadraticExpressionLike;
    asFlatLinearExpression(input: unknown): MathOptLinearExpressionLike;
    asFlatQuadraticExpression(input: unknown): MathOptQuadraticExpressionLike;
    multiplyLinearExpressions(lhs: unknown, rhs: unknown): MathOptQuadraticExpressionLike;
    evaluateExpression(input: unknown, values: Map<unknown, number> | Record<string | number, number>): number;
    boundedExpression<T>(lowerBound: number, expression: T, upperBound: number): MathOptBoundedExpressionLike<T>;
    lowerBoundedExpression<T>(lowerBound: number, expression: T): MathOptLowerBoundedExpressionLike<T>;
    upperBoundedExpression<T>(expression: T, upperBound: number): MathOptUpperBoundedExpressionLike<T>;
    eq(lhs: unknown, rhs: unknown): MathOptBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike>;
    ne(lhs: unknown, rhs: unknown): never;
    variableEq(lhs: MathOptVariableLike, rhs: MathOptVariableLike): boolean | MathOptVarEqVarLike;
    variableNe(lhs: MathOptVariableLike, rhs: MathOptVariableLike): boolean;
    le(lhs: unknown, rhs: unknown): MathOptUpperBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike> | MathOptLowerBoundedExpressionLike<MathOptQuadraticExpressionLike> | MathOptBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike>;
    ge(lhs: unknown, rhs: unknown): MathOptLowerBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike> | MathOptUpperBoundedExpressionLike<MathOptQuadraticExpressionLike> | MathOptBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike>;
    completeUpperBound<T>(lowerBounded: MathOptLowerBoundedExpressionLike<T>, upperBound: number): MathOptBoundedExpressionLike<T>;
    completeLowerBound<T>(lowerBound: number, upperBounded: MathOptUpperBoundedExpressionLike<T>): MathOptBoundedExpressionLike<T>;
    solve(model: MathOptModelLike, options?: {
      solverType?: number | string;
      threads?: number;
      iterationLimit?: number;
      interrupter?: { readonly interrupted?: boolean; isInterrupted?(): boolean; is_interrupted?(): boolean };
      solveInterrupter?: { readonly interrupted?: boolean; isInterrupted?(): boolean; is_interrupted?(): boolean };
      solve_interrupter?: { readonly interrupted?: boolean; isInterrupted?(): boolean; is_interrupted?(): boolean };
      messageCallback?: (messages: string[]) => void;
      message_callback?: (messages: string[]) => void;
      msgCb?: (messages: string[]) => void;
      msg_cb?: (messages: string[]) => void;
      [key: string]: unknown;
    }): Promise<{
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
    }>;
    encodeSolveRequest(model: MathOptModelLike, options?: {
      solverType?: number | string;
      threads?: number;
      iterationLimit?: number;
      [key: string]: unknown;
    }): Uint8Array;
    setWorkerBridgeEnabled: (enabled: boolean) => void;
    isWorkerBridgeEnabled: () => boolean;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function near(actual: number | null, expected: number, tolerance = 1e-7) {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}

function assertOptimal(name: string, result: { terminationReason: string }) {
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name}: expected OPTIMAL, got ${result.terminationReason}`);
}

async function assertRejectsContaining(action: () => Promise<unknown>, messagePart: string, label: string) {
  try {
    await action();
  } catch (error) {
    assert(error instanceof Error, `${label}: expected Error, got ${typeof error}`);
    assert(error.message.includes(messagePart), `${label}: expected message containing ${JSON.stringify(messagePart)}, got ${JSON.stringify(error.message)}`);
    return;
  }
  throw new Error(`${label}: expected rejection`);
}

function mathOptCaseId(name: string) {
  return `mathopt.${name
    .replace(/^MathOpt\./, '')
    .replaceAll('/', '.')
    .replaceAll(/[^a-zA-Z0-9_.]+/g, '_')
    .toLowerCase()}`;
}

function withMathOptMetadata(
  result: MathOptCaseResult,
  metadata: {
    id?: string;
    source?: string;
    upstream?: string;
    tags?: string[];
  } = {},
): MathOptCaseResult {
  return {
    id: metadata.id ?? mathOptCaseId(result.name),
    solver: 'mathopt',
    source: metadata.source,
    upstream: metadata.upstream ?? result.name,
    tags: metadata.tags ?? ['contract', result.mode, `${result.threads}-threads`],
    ...result,
  };
}

const activeSolveResultContractNames = new Set([
  'SolveTest/test_solve_error',
  'SolveTest/test_lp_solve',
  'SolveTest/test_cp_sat_mip_like',
  'SolveTest/test_indicator',
  'SolveTest/test_filters',
  'SolveTest/test_message_callback',
  'SolveTest/test_solve_interrupter',
  'SolveTest/test_solve_duplicated_names_and_remove_names',
  'SolveTest/test_incremental_solve_remove_names',
  'SolveTest/test_incremental_solve_init_error',
  'SolveTest/test_incremental_solve_error',
  'SolveTest/test_incremental_lp',
  'SolveTest/test_incremental_mip',
  'SolveTest/test_incremental_mip_with_message_cb',
  'SolveTest/test_incremental_solve_interrupter',
  'SolveTest/test_incremental_solve_error_on_reject',
  'SolveTest/test_incremental_solve_rejected',
  'SolveTest/test_multiple_incremental_lps',
  'SolveTest/test_incremental_solver_close',
  'parameters_test.py/SolveParameters common proto mappings',
  'parameters_test.py/backend-specific solve parameter proto mappings',
  'parameters_test.py/ModelSolveParameters proto mappings',
  'MathOpt API/solve_options_support_check',
  'result_test.py/SolveResult helper methods',
]);

async function runGlopLp(api: MathOptApi, mode: 'direct' | 'worker', threads: number): Promise<MathOptCaseResult> {
  const model = api.MathOpt.Model('mathopt_lp');
  const x = model.addVariable({ lowerBound: 0, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, name: 'y' });
  model.addLinearConstraint({
    upperBound: 14,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
    name: 'demand',
  });
  model.addLinearConstraint({
    upperBound: 20,
    terms: [
      { variable: x, coefficient: 2 },
      { variable: y, coefficient: 1 },
    ],
    name: 'capacity',
  });
  model.maximize([
    { variable: x, coefficient: 3 },
    { variable: y, coefficient: 4 },
  ]);

  const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GLOP, threads });
  assertOptimal('MathOpt GLOP LP', result);
  assert(near(result.objectiveValue, 56), `MathOpt GLOP LP: expected objective 56, got ${result.objectiveValue}`);
  assert(near(result.variableValues.x, 0), `MathOpt GLOP LP: expected x=0, got ${result.variableValues.x}`);
  assert(near(result.variableValues.y, 14), `MathOpt GLOP LP: expected y=14, got ${result.variableValues.y}`);
  return withMathOptMetadata({
    name: 'MathOpt.testGlopLinearProgram',
    mode,
    threads,
    ok: true,
    terminationReason: result.terminationReason,
    objectiveValue: result.objectiveValue,
    values: result.variableValues,
  }, {
    id: 'mathopt.backend.glop_linear_program',
    tags: ['backend', 'glop', mode, `${threads}-threads`],
  });
}

async function runCpSatMip(api: MathOptApi, mode: 'direct' | 'worker', threads: number): Promise<MathOptCaseResult> {
  const model = api.MathOpt.Model('mathopt_mip');
  const x = model.addVariable({ lowerBound: 0, upperBound: 10, integer: true, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, upperBound: 10, integer: true, name: 'y' });
  model.addLinearConstraint({
    upperBound: 4,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
    name: 'budget',
  });
  model.addLinearConstraint({
    upperBound: 2,
    terms: [{ variable: x, coefficient: 1 }],
    name: 'x_cap',
  });
  model.maximize([
    { variable: x, coefficient: 1 },
    { variable: y, coefficient: 2 },
  ]);

  const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.CP_SAT, threads });
  assertOptimal('MathOpt CP-SAT MIP', result);
  assert(near(result.objectiveValue, 8), `MathOpt CP-SAT MIP: expected objective 8, got ${result.objectiveValue}`);
  assert(near(result.variableValues.x, 0), `MathOpt CP-SAT MIP: expected x=0, got ${result.variableValues.x}`);
  assert(near(result.variableValues.y, 4), `MathOpt CP-SAT MIP: expected y=4, got ${result.variableValues.y}`);
  return withMathOptMetadata({
    name: 'MathOpt.testCpSatIntegerProgram',
    mode,
    threads,
    ok: true,
    terminationReason: result.terminationReason,
    objectiveValue: result.objectiveValue,
    values: result.variableValues,
  }, {
    id: 'mathopt.backend.cp_sat_integer_program',
    tags: ['backend', 'cp-sat', mode, `${threads}-threads`],
  });
}

async function runGScipMip(api: MathOptApi, mode: 'direct' | 'worker', threads: number): Promise<MathOptCaseResult> {
  const model = api.MathOpt.Model('mathopt_gscip_mip');
  const x = model.addVariable({ lowerBound: 0, upperBound: 10, integer: true, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, upperBound: 10, integer: true, name: 'y' });
  model.addLinearConstraint({
    upperBound: 4,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
    name: 'budget',
  });
  model.addLinearConstraint({
    upperBound: 2,
    terms: [{ variable: x, coefficient: 1 }],
    name: 'x_cap',
  });
  model.maximize([
    { variable: x, coefficient: 1 },
    { variable: y, coefficient: 2 },
  ]);

  const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GSCIP, threads });
  assertOptimal('MathOpt GSCIP MIP', result);
  assert(near(result.objectiveValue, 8), `MathOpt GSCIP MIP: expected objective 8, got ${result.objectiveValue}`);
  assert(near(result.variableValues.x, 0), `MathOpt GSCIP MIP: expected x=0, got ${result.variableValues.x}`);
  assert(near(result.variableValues.y, 4), `MathOpt GSCIP MIP: expected y=4, got ${result.variableValues.y}`);
  return withMathOptMetadata({
    name: 'MathOpt.testGScipIntegerProgram',
    mode,
    threads,
    ok: true,
    terminationReason: result.terminationReason,
    objectiveValue: result.objectiveValue,
    values: result.variableValues,
  }, {
    id: 'mathopt.backend.gscip_integer_program',
    tags: ['backend', 'gscip', mode, `${threads}-threads`],
  });
}

async function runGlpkLp(api: MathOptApi, mode: 'direct' | 'worker'): Promise<MathOptCaseResult> {
  const model = api.MathOpt.Model('mathopt_glpk_lp');
  const x = model.addVariable({ lowerBound: 0, name: 'x' });
  const y = model.addVariable({ lowerBound: 0, name: 'y' });
  model.addLinearConstraint({
    upperBound: 14,
    terms: [
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 1 },
    ],
    name: 'demand',
  });
  model.addLinearConstraint({
    upperBound: 20,
    terms: [
      { variable: x, coefficient: 2 },
      { variable: y, coefficient: 1 },
    ],
    name: 'capacity',
  });
  model.maximize([
    { variable: x, coefficient: 3 },
    { variable: y, coefficient: 4 },
  ]);

  const glpk = api.MathOpt.GlpkParameters
    ? new api.MathOpt.GlpkParameters({ computeUnboundRaysIfPossible: false })
    : undefined;
  const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GLPK, threads: 1, glpk });
  assertOptimal('MathOpt GLPK LP', result);
  assert(near(result.objectiveValue, 56), `MathOpt GLPK LP: expected objective 56, got ${result.objectiveValue}`);
  assert(near(result.variableValues.x, 0), `MathOpt GLPK LP: expected x=0, got ${result.variableValues.x}`);
  assert(near(result.variableValues.y, 14), `MathOpt GLPK LP: expected y=14, got ${result.variableValues.y}`);

  await assertRejectsContaining(
    () => api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GLPK, threads: 4 }),
    'GLPK',
    'MathOpt GLPK LP threads > 1',
  );

  return withMathOptMetadata({
    name: 'MathOpt.testGlpkLinearProgram',
    mode,
    threads: 1,
    ok: true,
    terminationReason: result.terminationReason,
    objectiveValue: result.objectiveValue,
    values: result.variableValues,
  }, {
    id: 'mathopt.backend.glpk_linear_program',
    tags: ['backend', 'glpk', mode, '1-threads'],
  });
}

export async function runMathOptCases(api: MathOptApi, options: MathOptRunOptions = {}): Promise<MathOptCaseResult[]> {
  await api.initMathOpt();
  const results: MathOptCaseResult[] = [];
  for (const mode of fixtureModes) {
    await withWorkerBridgeMode(api.MathOpt, mode, 'MathOpt', async () => {
      for (const threads of [1, 4]) {
        options.onProgress?.('MathOpt.testGlopLinearProgram', mode, threads);
        results.push(await runGlopLp(api, mode, threads));
        options.onProgress?.('MathOpt.testCpSatIntegerProgram', mode, threads);
        results.push(await runCpSatMip(api, mode, threads));
        options.onProgress?.('MathOpt.testGScipIntegerProgram', mode, threads);
        results.push(await runGScipMip(api, mode, threads));
        if (threads === 1) {
          options.onProgress?.('MathOpt.testGlpkLinearProgram', mode, threads);
          results.push(await runGlpkLp(api, mode));
        }
        for (const testCase of mathoptSolveResultContractCases) {
          if (!activeSolveResultContractNames.has(testCase.name)) continue;
          options.onProgress?.(`MathOpt.${testCase.name}`, mode, threads);
          const output = await testCase.run(api);
          results.push(withMathOptMetadata({
            name: `MathOpt.${testCase.name}`,
            mode,
            threads,
            ok: !output.startsWith('TODO:'),
            terminationReason: output.startsWith('TODO:') ? output : 'API_ONLY',
            objectiveValue: null,
            values: {},
          }, {
            source: 'ortools/math_opt/python',
            upstream: testCase.name,
            tags: ['python-parity', 'solve-result', mode, `${threads}-threads`],
          }));
        }
      }
      for (const testCase of mathOptExpressionContractCases) {
        options.onProgress?.(`MathOpt.${testCase.name}`, mode, 1);
        const output = await testCase.run(api);
        results.push(withMathOptMetadata({
          name: `MathOpt.${testCase.name}`,
          mode,
          threads: 1,
          ok: !output.startsWith('TODO:'),
          terminationReason: output.startsWith('TODO:') ? output : 'API_ONLY',
          objectiveValue: null,
          values: {},
        }, {
          source: 'ortools/math_opt/python',
          upstream: testCase.name,
          tags: ['python-parity', 'expression-api', mode],
        }));
      }
      options.onProgress?.('MathOpt.modelContract', mode, 1);
      results.push(...(await runMathOptModelContractCases(api, mode, 1)).map((result) =>
        withMathOptMetadata(result, {
          source: 'ortools/math_opt/python',
          upstream: result.name.replace(/^MathOpt\./, ''),
          tags: ['python-parity', 'model-api', mode],
        })
      ));
    });
  }
  return results;
}
