import { mathOptExpressionContractCases } from './mathopt_expression_contract.ts';
import { runMathOptModelContractCases } from './mathopt_model_contract.ts';

export type MathOptCaseResult = {
  name: string;
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
};

type MathOptLinearConstraintLike = {
  readonly id: number;
  readonly name: string;
  lowerBound?: number;
  upperBound?: number;
  setCoefficient?(variable: MathOptVariableLike, coefficient: number): void;
  getCoefficient?(variable: MathOptVariableLike): number;
  terms?(): Array<{ variable: MathOptVariableLike; coefficient: number }>;
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
  addVariable(options?: {
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
    lowerBound?: number;
    upperBound?: number;
    terms?: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    name?: string;
  }): MathOptLinearConstraintLike;
  add_linear_constraint?(options?: {
    lowerBound?: number;
    upperBound?: number;
    terms?: Array<{ variable: MathOptVariableLike; coefficient: number }>;
    name?: string;
  }): MathOptLinearConstraintLike;
  variables?(): MathOptVariableLike[];
  getVariable?(id: number): MathOptVariableLike | undefined;
  get_variable?(id: number): MathOptVariableLike;
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
  get_linear_constraint?(id: number): MathOptLinearConstraintLike;
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
  maximize(terms: unknown, offset?: number): void;
  minimize(terms: unknown, offset?: number): void;
};

export type MathOptApi = {
  initMathOpt(): Promise<void>;
  MathOpt: {
    SolverType: {
      GLOP: number;
      CP_SAT: number;
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
    }): Promise<{
      terminationReason: string;
      objectiveValue: number | null;
      variableValues: Record<string, number>;
      variableValuesById?: Record<number, number>;
      rawResponse?: Uint8Array;
    }>;
    setWorkerBridgeEnabled?: (enabled: boolean) => void;
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
  return {
    name: 'MathOpt.testGlopLinearProgram',
    mode,
    threads,
    ok: true,
    terminationReason: result.terminationReason,
    objectiveValue: result.objectiveValue,
    values: result.variableValues,
  };
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
  return {
    name: 'MathOpt.testCpSatIntegerProgram',
    mode,
    threads,
    ok: true,
    terminationReason: result.terminationReason,
    objectiveValue: result.objectiveValue,
    values: result.variableValues,
  };
}

export async function runMathOptCases(api: MathOptApi, options: MathOptRunOptions = {}): Promise<MathOptCaseResult[]> {
  await api.initMathOpt();
  const results: MathOptCaseResult[] = [];
  const modes: Array<'direct' | 'worker'> = api.MathOpt.setWorkerBridgeEnabled ? ['direct', 'worker'] : ['direct'];
  for (const mode of modes) {
    api.MathOpt.setWorkerBridgeEnabled?.(mode === 'worker');
    for (const threads of [1, 4]) {
      options.onProgress?.('MathOpt.testGlopLinearProgram', mode, threads);
      results.push(await runGlopLp(api, mode, threads));
      options.onProgress?.('MathOpt.testCpSatIntegerProgram', mode, threads);
      results.push(await runCpSatMip(api, mode, threads));
      for (const testCase of mathOptExpressionContractCases) {
        options.onProgress?.(`MathOpt.${testCase.name}`, mode, threads);
        const output = await testCase.run(api);
        results.push({
          name: `MathOpt.${testCase.name}`,
          mode,
          threads,
          ok: !output.startsWith('TODO:'),
          terminationReason: output.startsWith('TODO:') ? output : 'API_ONLY',
          objectiveValue: null,
          values: {},
        });
      }
      options.onProgress?.('MathOpt.modelContract', mode, threads);
      results.push(...await runMathOptModelContractCases(api, mode, threads));
    }
  }
  api.MathOpt.setWorkerBridgeEnabled?.(false);
  return results;
}
