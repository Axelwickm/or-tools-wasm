type MathOptApi = {
  initMathOpt(): Promise<void>;
  MathOpt: {
    SolverType: {
      GLOP: number;
      CP_SAT: number;
    };
    LinearExpression: abstract new (...args: never[]) => MathOptLinearExpressionLike;
    QuadraticExpression: abstract new (...args: never[]) => MathOptQuadraticExpressionLike;
    QuadraticTermKey: abstract new (...args: never[]) => MathOptQuadraticTermKeyLike;
    BoundedExpression: abstract new (...args: never[]) => MathOptBoundedExpressionLike<unknown>;
    LowerBoundedExpression: abstract new (...args: never[]) => MathOptLowerBoundedExpressionLike<unknown>;
    UpperBoundedExpression: abstract new (...args: never[]) => MathOptUpperBoundedExpressionLike<unknown>;
    VarEqVar: abstract new (...args: never[]) => MathOptVarEqVarLike;
    Model(name?: string): MathOptModelLike;
    solve(model: MathOptModelLike, options?: { solverType?: number; threads?: number }): Promise<{
      terminationReason: string;
      objectiveValue: number | null;
      variableValues: Record<string, number>;
    }>;
    linearTerm(variable: MathOptVariableLike, coefficient?: number): MathOptLinearTermLike;
    quadraticTerm(firstVariable: MathOptVariableLike, secondVariable: MathOptVariableLike, coefficient?: number): MathOptQuadraticTermLike;
    fastSum(inputs: MathOptExpressionInput[]): MathOptLinearExpressionLike | MathOptQuadraticExpressionLike;
    asFlatLinearExpression(input: MathOptExpressionInput): MathOptLinearExpressionLike;
    asFlatQuadraticExpression(input: MathOptExpressionInput): MathOptQuadraticExpressionLike;
    multiplyLinearExpressions(lhs: MathOptExpressionInput, rhs: MathOptExpressionInput): MathOptQuadraticExpressionLike;
    evaluateExpression(input: MathOptExpressionInput, values: Map<MathOptVariableLike, number> | Record<string | number, number>): number;
    boundedExpression<T>(lowerBound: number, expression: T, upperBound: number): MathOptBoundedExpressionLike<T>;
    lowerBoundedExpression<T>(lowerBound: number, expression: T): MathOptLowerBoundedExpressionLike<T>;
    upperBoundedExpression<T>(expression: T, upperBound: number): MathOptUpperBoundedExpressionLike<T>;
    eq(lhs: MathOptExpressionInput, rhs: MathOptExpressionInput): MathOptBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike>;
    ne(lhs: MathOptExpressionInput, rhs: MathOptExpressionInput): never;
    variableEq(lhs: MathOptVariableLike, rhs: MathOptVariableLike): boolean | MathOptVarEqVarLike;
    variableNe(lhs: MathOptVariableLike, rhs: MathOptVariableLike): boolean;
    le(lhs: MathOptExpressionInput, rhs: MathOptExpressionInput): MathOptUpperBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike> | MathOptLowerBoundedExpressionLike<MathOptQuadraticExpressionLike> | MathOptBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike>;
    ge(lhs: MathOptExpressionInput, rhs: MathOptExpressionInput): MathOptLowerBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike> | MathOptUpperBoundedExpressionLike<MathOptQuadraticExpressionLike> | MathOptBoundedExpressionLike<MathOptLinearExpressionLike | MathOptQuadraticExpressionLike>;
    completeUpperBound<T>(lowerBounded: MathOptLowerBoundedExpressionLike<T>, upperBound: number): MathOptBoundedExpressionLike<T>;
    completeLowerBound<T>(lowerBound: number, upperBounded: MathOptUpperBoundedExpressionLike<T>): MathOptBoundedExpressionLike<T>;
  };
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
  }): void;
  maximize(terms: Array<{ variable: MathOptVariableLike; coefficient: number }>, offset?: number): void;
};

type MathOptVariableLike = {
  readonly id: number;
  readonly name: string;
};

type MathOptVarEqVarLike = {
  firstVariable: MathOptVariableLike;
  first_variable: MathOptVariableLike;
  secondVariable: MathOptVariableLike;
  second_variable: MathOptVariableLike;
  assertNotBoolean(): never;
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
  add(input: MathOptExpressionInput): MathOptLinearExpressionLike;
  subtract(input: MathOptExpressionInput): MathOptLinearExpressionLike;
  multiply(coefficient: number): MathOptLinearExpressionLike;
  evaluate(values: Map<MathOptVariableLike, number> | Record<string | number, number>): number;
};

type MathOptQuadraticExpressionLike = {
  offset: number;
  linearTerms: ReadonlyMap<MathOptVariableLike, number>;
  quadraticTerms: ReadonlyMap<unknown, number>;
  add(input: MathOptExpressionInput): MathOptQuadraticExpressionLike;
  subtract(input: MathOptExpressionInput): MathOptQuadraticExpressionLike;
  multiply(coefficient: number): MathOptQuadraticExpressionLike;
  evaluate(values: Map<MathOptVariableLike, number> | Record<string | number, number>): number;
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

type MathOptExpressionContractCase = {
  name: string;
  source: string;
  run(api: MathOptApi): Promise<string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrowsWithMessage(action: () => unknown, errorType: abstract new (...args: never[]) => Error, message: string, label: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof errorType, `${label} expected ${errorType.name}, got ${error instanceof Error ? error.name : typeof error}`);
    assert(error.message === message, `${label} expected ${JSON.stringify(message)}, got ${JSON.stringify(error.message)}`);
    return;
  }
  throw new Error(`${label} expected exception`);
}

function assertThrowsContaining(action: () => unknown, errorType: abstract new (...args: never[]) => Error, messagePart: string, label: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof errorType, `${label} expected ${errorType.name}, got ${error instanceof Error ? error.name : typeof error}`);
    assert(error.message.includes(messagePart), `${label} expected message containing ${JSON.stringify(messagePart)}, got ${JSON.stringify(error.message)}`);
    return;
  }
  throw new Error(`${label} expected exception`);
}

function near(actual: number | null, expected: number, tolerance = 1e-9): boolean {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}

function assertOptimal(name: string, result: { terminationReason: string }) {
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `${name} expected OPTIMAL, got ${result.terminationReason}`);
}

function coefficient(terms: ReadonlyMap<MathOptVariableLike, number>, variable: MathOptVariableLike): number {
  for (const [candidate, value] of terms) {
    if (candidate.id === variable.id) return value;
  }
  return 0;
}

function quadraticCoefficient(
  terms: ReadonlyMap<unknown, number>,
  firstVariable: MathOptVariableLike,
  secondVariable: MathOptVariableLike,
): number {
  for (const [key, value] of terms) {
    const maybeKey = key as { firstVariable?: MathOptVariableLike; secondVariable?: MathOptVariableLike };
    const first = maybeKey.firstVariable;
    const second = maybeKey.secondVariable;
    if (!first || !second) continue;
    if (
      (first.id === firstVariable.id && second.id === secondVariable.id)
      || (first.id === secondVariable.id && second.id === firstVariable.id)
    ) {
      return value;
    }
  }
  return 0;
}

function assertFlatLinearExpression(
  rawExpression: unknown,
  expectedOffset: number,
  expectedTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>,
  label: string,
) {
  const expression = rawExpression as MathOptLinearExpressionLike;
  assert(expression.offset === expectedOffset, `${label} expected offset ${expectedOffset}, got ${expression.offset}`);
  assert(expression.terms.size === expectedTerms.length, `${label} expected ${expectedTerms.length} terms, got ${expression.terms.size}`);
  for (const term of expectedTerms) {
    assert(
      coefficient(expression.terms, term.variable) === term.coefficient,
      `${label} expected variable ${term.variable.id} coefficient ${term.coefficient}, got ${coefficient(expression.terms, term.variable)}`,
    );
  }
}

function assertFlatLinearExpressionWithZeroDefault(
  rawExpression: unknown,
  expectedOffset: number,
  expectedTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>,
  label: string,
) {
  const expression = rawExpression as MathOptLinearExpressionLike;
  assert(expression.offset === expectedOffset, `${label} expected offset ${expectedOffset}, got ${expression.offset}`);
  for (const term of expectedTerms) {
    assert(
      coefficient(expression.terms, term.variable) === term.coefficient,
      `${label} expected variable ${term.variable.id} coefficient ${term.coefficient}, got ${coefficient(expression.terms, term.variable)}`,
    );
  }
  for (const [variable, value] of expression.terms) {
    assert(
      expectedTerms.some((term) => term.variable.id === variable.id && term.coefficient === value),
      `${label} found unexpected variable ${variable.id} coefficient ${value}`,
    );
  }
}

function assertFlatQuadraticExpression(
  rawExpression: unknown,
  expectedOffset: number,
  expectedLinearTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>,
  expectedQuadraticTerms: Array<{ firstVariable: MathOptVariableLike; secondVariable: MathOptVariableLike; coefficient: number }>,
  label: string,
) {
  const expression = rawExpression as MathOptQuadraticExpressionLike;
  assert(expression.offset === expectedOffset, `${label} expected offset ${expectedOffset}, got ${expression.offset}`);
  assert(expression.linearTerms.size === expectedLinearTerms.length, `${label} expected ${expectedLinearTerms.length} linear terms, got ${expression.linearTerms.size}`);
  for (const term of expectedLinearTerms) {
    assert(
      coefficient(expression.linearTerms, term.variable) === term.coefficient,
      `${label} expected variable ${term.variable.id} coefficient ${term.coefficient}, got ${coefficient(expression.linearTerms, term.variable)}`,
    );
  }
  assert(expression.quadraticTerms.size === expectedQuadraticTerms.length, `${label} expected ${expectedQuadraticTerms.length} quadratic terms, got ${expression.quadraticTerms.size}`);
  for (const term of expectedQuadraticTerms) {
    assert(
      quadraticCoefficient(expression.quadraticTerms, term.firstVariable, term.secondVariable) === term.coefficient,
      `${label} expected quadratic coefficient ${term.coefficient}, got ${quadraticCoefficient(expression.quadraticTerms, term.firstVariable, term.secondVariable)}`,
    );
  }
}

function assertFlatQuadraticExpressionWithZeroDefault(
  rawExpression: unknown,
  expectedOffset: number,
  expectedLinearTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>,
  expectedQuadraticTerms: Array<{ firstVariable: MathOptVariableLike; secondVariable: MathOptVariableLike; coefficient: number }>,
  label: string,
) {
  const expression = rawExpression as MathOptQuadraticExpressionLike;
  assert(expression.offset === expectedOffset, `${label} expected offset ${expectedOffset}, got ${expression.offset}`);
  for (const term of expectedLinearTerms) {
    assert(
      coefficient(expression.linearTerms, term.variable) === term.coefficient,
      `${label} expected variable ${term.variable.id} coefficient ${term.coefficient}, got ${coefficient(expression.linearTerms, term.variable)}`,
    );
  }
  for (const [variable, value] of expression.linearTerms) {
    assert(
      expectedLinearTerms.some((term) => term.variable.id === variable.id && term.coefficient === value),
      `${label} found unexpected linear variable ${variable.id} coefficient ${value}`,
    );
  }
  for (const term of expectedQuadraticTerms) {
    assert(
      quadraticCoefficient(expression.quadraticTerms, term.firstVariable, term.secondVariable) === term.coefficient,
      `${label} expected quadratic coefficient ${term.coefficient}, got ${quadraticCoefficient(expression.quadraticTerms, term.firstVariable, term.secondVariable)}`,
    );
  }
  for (const [key, value] of expression.quadraticTerms) {
    const maybeKey = key as { firstVariable?: MathOptVariableLike; secondVariable?: MathOptVariableLike };
    assert(maybeKey.firstVariable && maybeKey.secondVariable, `${label} found malformed quadratic key`);
    assert(
      expectedQuadraticTerms.some((term) => (
        ((term.firstVariable.id === maybeKey.firstVariable?.id && term.secondVariable.id === maybeKey.secondVariable?.id)
          || (term.firstVariable.id === maybeKey.secondVariable?.id && term.secondVariable.id === maybeKey.firstVariable?.id))
        && term.coefficient === value
      )),
      `${label} found unexpected quadratic coefficient ${value}`,
    );
  }
}

async function solveLinearCase(
  api: MathOptApi,
  model: MathOptModelLike,
  name: string,
  objective: Array<{ variable: MathOptVariableLike; coefficient: number }>,
  objectiveOffset = 0,
) {
  model.maximize(objective, objectiveOffset);
  const result = await api.MathOpt.solve(model, { solverType: api.MathOpt.SolverType.GLOP });
  assertOptimal(name, result);
  return result;
}

function linearBaseExpression(api: MathOptApi, x: MathOptVariableLike, y: MathOptVariableLike) {
  return api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]);
}

function newLinearExpression(api: MathOptApi, input?: MathOptExpressionInput | Iterable<MathOptLinearTermLike>): MathOptLinearExpressionLike {
  const LinearExpression = api.MathOpt.LinearExpression as unknown as new (
    input?: MathOptExpressionInput | Iterable<MathOptLinearTermLike>,
  ) => MathOptLinearExpressionLike;
  return new LinearExpression(input);
}

function newQuadraticExpression(
  api: MathOptApi,
  input?: MathOptExpressionInput | Iterable<MathOptLinearTermLike>,
): MathOptQuadraticExpressionLike {
  const QuadraticExpression = api.MathOpt.QuadraticExpression as unknown as new (
    input?: MathOptExpressionInput | Iterable<MathOptLinearTermLike>,
  ) => MathOptQuadraticExpressionLike;
  return new QuadraticExpression(input);
}

function assertLinearProduct(
  api: MathOptApi,
  lhs: MathOptExpressionInput,
  rhs: MathOptExpressionInput,
  expectedOffset: number,
  expectedLinearTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>,
  expectedQuadraticTerms: Array<{ firstVariable: MathOptVariableLike; secondVariable: MathOptVariableLike; coefficient: number }>,
  label: string,
) {
  assertFlatQuadraticExpressionWithZeroDefault(
    api.MathOpt.multiplyLinearExpressions(lhs, rhs),
    expectedOffset,
    expectedLinearTerms,
    expectedQuadraticTerms,
    label,
  );
}

const LINEAR_SOURCE = 'ortools/math_opt/python/linear_expression_test.py';
const EXPRESSIONS_SOURCE = 'ortools/math_opt/python/expressions_test.py';
const BOUNDED_SOURCE = 'ortools/math_opt/python/bounded_expressions_test.py';

export const mathOptExpressionContractCases: MathOptExpressionContractCase[] = [
  {
    name: 'BoundedLinearExprTest.test_eq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_eq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const expression = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]);
      const boundedExpression = api.MathOpt.eq(expression, 2.0);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_eq_float expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_eq_float');
      assert(boundedExpression.lower_bound === 2.0, `test_eq_float expected lower bound 2, got ${boundedExpression.lower_bound}`);
      assert(boundedExpression.upper_bound === 2.0, `test_eq_float expected upper bound 2, got ${boundedExpression.upper_bound}`);
      return 'BoundedLinearExprTest.test_eq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_eq_float_explicit',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_eq_float_explicit');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const expression = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]);
      const boundedExpression = api.MathOpt.eq(expression, 2.0);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_eq_float_explicit expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_eq_float_explicit');
      assert(boundedExpression.lower_bound === 2.0, `test_eq_float_explicit expected lower bound 2, got ${boundedExpression.lower_bound}`);
      assert(boundedExpression.upper_bound === 2.0, `test_eq_float_explicit expected upper bound 2, got ${boundedExpression.upper_bound}`);
      return 'BoundedLinearExprTest.test_eq_float_explicit PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_eq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_eq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const lhs = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]);
      const rhs = api.MathOpt.fastSum([api.MathOpt.linearTerm(y, 3), -2.0]);
      const boundedExpression = api.MathOpt.eq(lhs, rhs);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_eq_expr expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 3.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: -1.0 },
      ], 'test_eq_expr');
      assert(boundedExpression.lower_bound === 0.0, `test_eq_expr expected lower bound 0, got ${boundedExpression.lower_bound}`);
      assert(boundedExpression.upper_bound === 0.0, `test_eq_expr expected upper bound 0, got ${boundedExpression.upper_bound}`);

      const varOnLhs = api.MathOpt.eq(x, rhs);
      assertFlatLinearExpression(varOnLhs.expression, 2.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: -3.0 },
      ], 'test_eq_expr var lhs');

      const varOnRhs = api.MathOpt.eq(rhs, x);
      assertFlatLinearExpression(varOnRhs.expression, -2.0, [
        { variable: x, coefficient: -1.0 },
        { variable: y, coefficient: 3.0 },
      ], 'test_eq_expr var rhs');
      return 'BoundedLinearExprTest.test_eq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_eq_expr_explicit',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_eq_expr_explicit');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const lhs = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]);
      const rhs = api.MathOpt.fastSum([api.MathOpt.linearTerm(y, 3), -2.0]);
      const boundedExpression = api.MathOpt.eq(lhs, rhs);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_eq_expr_explicit expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 3.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: -1.0 },
      ], 'test_eq_expr_explicit');
      assert(boundedExpression.lower_bound === 0.0, `test_eq_expr_explicit expected lower bound 0, got ${boundedExpression.lower_bound}`);
      assert(boundedExpression.upper_bound === 0.0, `test_eq_expr_explicit expected upper bound 0, got ${boundedExpression.upper_bound}`);

      const varOnLhs = api.MathOpt.eq(x, rhs);
      assertFlatLinearExpression(varOnLhs.expression, 2.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: -3.0 },
      ], 'test_eq_expr_explicit var lhs');

      const varOnRhs = api.MathOpt.eq(rhs, x);
      assertFlatLinearExpression(varOnRhs.expression, -2.0, [
        { variable: x, coefficient: -1.0 },
        { variable: y, coefficient: 3.0 },
      ], 'test_eq_expr_explicit var rhs');
      return 'BoundedLinearExprTest.test_eq_expr_explicit PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_leq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_leq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const boundedExpression = api.MathOpt.le(linearBaseExpression(api, x, y), 2.0);
      assert(boundedExpression instanceof api.MathOpt.UpperBoundedExpression, 'test_leq_float expected UpperBoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_leq_float');
      assert(boundedExpression.upper_bound === 2.0, `test_leq_float expected upper bound 2, got ${boundedExpression.upper_bound}`);
      return 'BoundedLinearExprTest.test_leq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_leq_float_rev',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_leq_float_rev');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const boundedExpression = api.MathOpt.le(linearBaseExpression(api, x, y), 2.0);
      assert(boundedExpression instanceof api.MathOpt.UpperBoundedExpression, 'test_leq_float_rev expected UpperBoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_leq_float_rev');
      assert(boundedExpression.upper_bound === 2.0, `test_leq_float_rev expected upper bound 2, got ${boundedExpression.upper_bound}`);
      return 'BoundedLinearExprTest.test_leq_float_rev PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_geq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_geq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const boundedExpression = api.MathOpt.ge(linearBaseExpression(api, x, y), 2.0);
      assert(boundedExpression instanceof api.MathOpt.LowerBoundedExpression, 'test_geq_float expected LowerBoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_geq_float');
      assert(boundedExpression.lower_bound === 2.0, `test_geq_float expected lower bound 2, got ${boundedExpression.lower_bound}`);
      return 'BoundedLinearExprTest.test_geq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_geq_float_rev',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_geq_float_rev');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const boundedExpression = api.MathOpt.ge(linearBaseExpression(api, x, y), 2.0);
      assert(boundedExpression instanceof api.MathOpt.LowerBoundedExpression, 'test_geq_float_rev expected LowerBoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_geq_float_rev');
      assert(boundedExpression.lower_bound === 2.0, `test_geq_float_rev expected lower bound 2, got ${boundedExpression.lower_bound}`);
      return 'BoundedLinearExprTest.test_geq_float_rev PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_geq_leq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_ranged_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const lower = api.MathOpt.ge(linearBaseExpression(api, x, y), 0.0);
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_geq_leq_float expected intermediate LowerBoundedExpression');
      const boundedExpression = api.MathOpt.completeUpperBound(lower, 2.0);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_geq_leq_float expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_geq_leq_float');
      assert(boundedExpression.upper_bound === 2.0, `test_geq_leq_float expected upper bound 2, got ${boundedExpression.upper_bound}`);
      assert(boundedExpression.lower_bound === 0.0, `test_geq_leq_float expected lower bound 0, got ${boundedExpression.lower_bound}`);
      return 'BoundedLinearExprTest.test_geq_leq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_geq_leq_float_rev',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_geq_leq_float_rev');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const lower = api.MathOpt.ge(linearBaseExpression(api, x, y), 0.0);
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_geq_leq_float_rev expected intermediate LowerBoundedExpression');
      const boundedExpression = api.MathOpt.completeUpperBound(lower, 2.0);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_geq_leq_float_rev expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_geq_leq_float_rev');
      assert(boundedExpression.upper_bound === 2.0, `test_geq_leq_float_rev expected upper bound 2, got ${boundedExpression.upper_bound}`);
      assert(boundedExpression.lower_bound === 0.0, `test_geq_leq_float_rev expected lower bound 0, got ${boundedExpression.lower_bound}`);
      return 'BoundedLinearExprTest.test_geq_leq_float_rev PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_leq_geq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_leq_geq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const upper = api.MathOpt.le(linearBaseExpression(api, x, y), 2.0);
      assert(upper instanceof api.MathOpt.UpperBoundedExpression, 'test_leq_geq_float expected intermediate UpperBoundedExpression');
      const boundedExpression = api.MathOpt.completeLowerBound(0.0, upper);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_leq_geq_float expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_leq_geq_float');
      assert(boundedExpression.upper_bound === 2.0, `test_leq_geq_float expected upper bound 2, got ${boundedExpression.upper_bound}`);
      assert(boundedExpression.lower_bound === 0.0, `test_leq_geq_float expected lower bound 0, got ${boundedExpression.lower_bound}`);
      return 'BoundedLinearExprTest.test_leq_geq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_leq_geq_float_rev',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_leq_geq_float_rev');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const upper = api.MathOpt.le(linearBaseExpression(api, x, y), 2.0);
      assert(upper instanceof api.MathOpt.UpperBoundedExpression, 'test_leq_geq_float_rev expected intermediate UpperBoundedExpression');
      const boundedExpression = api.MathOpt.completeLowerBound(0.0, upper);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_leq_geq_float_rev expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
      ], 'test_leq_geq_float_rev');
      assert(boundedExpression.upper_bound === 2.0, `test_leq_geq_float_rev expected upper bound 2, got ${boundedExpression.upper_bound}`);
      assert(boundedExpression.lower_bound === 0.0, `test_leq_geq_float_rev expected lower bound 0, got ${boundedExpression.lower_bound}`);
      return 'BoundedLinearExprTest.test_leq_geq_float_rev PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_leq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_leq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'z' });
      const lhs = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 3), 2.0]);
      const rhs = api.MathOpt.fastSum([y, api.MathOpt.linearTerm(z, -4), 1.0]);
      const boundedExpression = api.MathOpt.le(lhs, rhs);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_leq_expr expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
        { variable: z, coefficient: 4.0 },
      ], 'test_leq_expr');
      assert(boundedExpression.lower_bound === Number.NEGATIVE_INFINITY, `test_leq_expr expected lower -inf, got ${boundedExpression.lower_bound}`);
      assert(boundedExpression.upper_bound === 0.0, `test_leq_expr expected upper 0, got ${boundedExpression.upper_bound}`);
      return 'BoundedLinearExprTest.test_leq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_geq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_geq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'z' });
      const lhs = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 3), 2.0]);
      const rhs = api.MathOpt.fastSum([y, api.MathOpt.linearTerm(z, -4), 1.0]);
      const boundedExpression = api.MathOpt.ge(lhs, rhs);
      assert(boundedExpression instanceof api.MathOpt.BoundedExpression, 'test_geq_expr expected BoundedExpression');
      assertFlatLinearExpression(boundedExpression.expression, 1.0, [
        { variable: x, coefficient: 1.0 },
        { variable: y, coefficient: 2.0 },
        { variable: z, coefficient: 4.0 },
      ], 'test_geq_expr');
      assert(boundedExpression.lower_bound === 0.0, `test_geq_expr expected lower 0, got ${boundedExpression.lower_bound}`);
      assert(boundedExpression.upper_bound === Number.POSITIVE_INFINITY, `test_geq_expr expected upper inf, got ${boundedExpression.upper_bound}`);
      return 'BoundedLinearExprTest.test_geq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_var_eq_var',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_var_eq_var');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const alsoX = x;
      const boundedExpression = api.MathOpt.variableEq(x, y);
      assert(boundedExpression instanceof api.MathOpt.VarEqVar, 'test_var_eq_var expected VarEqVar');
      assert(boundedExpression.first_variable === x, 'test_var_eq_var expected first variable x');
      assert(boundedExpression.second_variable === y, 'test_var_eq_var expected second variable y');

      const secondModel = api.MathOpt.Model('mathopt_expression_var_eq_var_second');
      const secondX = secondModel.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      assert(api.MathOpt.variableEq(x, alsoX) === true, 'test_var_eq_var expected x equal to also_x');
      assert(api.MathOpt.variableEq(x, y) !== true, 'test_var_eq_var expected x not bool-equal to y');
      assert(x.id === secondX.id, `test_var_eq_var expected matching ids, got ${x.id} and ${secondX.id}`);
      assert(api.MathOpt.variableEq(x, secondX) === false, 'test_var_eq_var expected x not equal to second model x');
      return 'BoundedLinearExprTest.test_var_eq_var PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_var_eq_var_explicit',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_var_eq_var_explicit');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const alsoX = x;
      const boundedExpression = api.MathOpt.variableEq(x, y);
      assert(boundedExpression instanceof api.MathOpt.VarEqVar, 'test_var_eq_var_explicit expected VarEqVar');
      assert(boundedExpression.first_variable === x, 'test_var_eq_var_explicit expected first variable x');
      assert(boundedExpression.second_variable === y, 'test_var_eq_var_explicit expected second variable y');

      const secondModel = api.MathOpt.Model('mathopt_expression_var_eq_var_explicit_second');
      const secondX = secondModel.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      assert(api.MathOpt.variableEq(x, alsoX) === true, 'test_var_eq_var_explicit expected x equal to also_x');
      assert(api.MathOpt.variableEq(x, y) !== true, 'test_var_eq_var_explicit expected x not bool-equal to y');
      assert(x.id === secondX.id, `test_var_eq_var_explicit expected matching ids, got ${x.id} and ${secondX.id}`);
      assert(api.MathOpt.variableEq(x, secondX) === false, 'test_var_eq_var_explicit expected x not equal to second model x');
      return 'BoundedLinearExprTest.test_var_eq_var_explicit PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_var_neq_var',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_var_neq_var');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const alsoX = x;
      const secondModel = api.MathOpt.Model('mathopt_expression_var_neq_var_second');
      const secondX = secondModel.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      assert(api.MathOpt.variableNe(x, alsoX) === false, 'test_var_neq_var expected x not unequal to also_x');
      assert(api.MathOpt.variableNe(x, y) === true, 'test_var_neq_var expected x unequal to y');
      assert(x.id === secondX.id, `test_var_neq_var expected matching ids, got ${x.id} and ${secondX.id}`);
      assert(api.MathOpt.variableNe(x, secondX) === true, 'test_var_neq_var expected x unequal to second model x');
      return 'BoundedLinearExprTest.test_var_neq_var PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_var_neq_var_explicit',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_var_neq_var_explicit');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const alsoX = x;
      const secondModel = api.MathOpt.Model('mathopt_expression_var_neq_var_explicit_second');
      const secondX = secondModel.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      assert(api.MathOpt.variableNe(x, alsoX) === false, 'test_var_neq_var_explicit expected x not unequal to also_x');
      assert(api.MathOpt.variableNe(x, y) === true, 'test_var_neq_var_explicit expected x unequal to y');
      assert(x.id === secondX.id, `test_var_neq_var_explicit expected matching ids, got ${x.id} and ${secondX.id}`);
      assert(api.MathOpt.variableNe(x, secondX) === true, 'test_var_neq_var_explicit expected x unequal to second model x');
      return 'BoundedLinearExprTest.test_var_neq_var_explicit PASS';
    },
  },
  {
    name: 'BoundedLinearExprTest.test_var_dict',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_var_dict');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const varDict = new Map<MathOptVariableLike, number>([[x, 1.0], [y, 2.0]]);
      assert(varDict.get(x) === 1.0, 'test_var_dict expected x lookup to return 1');
      assert(varDict.get(y) === 2.0, 'test_var_dict expected y lookup to return 2');
      assert(api.MathOpt.variableEq(x, y) !== true, 'test_var_dict expected x and y not to compare equal');
      return 'BoundedLinearExprTest.test_var_dict PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_ne',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_error_ne');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const yMinusX = api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -1)]);
      const xPlusY = api.MathOpt.fastSum([x, y]);
      const message = '!= constraints are not supported';
      assertThrowsWithMessage(() => api.MathOpt.ne(x, yMinusX), TypeError, message, 'test_ne x != y - x');
      assertThrowsWithMessage(() => api.MathOpt.ne(x, yMinusX), TypeError, message, 'test_ne x.__ne__(y - x)');
      assertThrowsWithMessage(() => api.MathOpt.ne(yMinusX, x), TypeError, message, 'test_ne y - x != x');
      assertThrowsWithMessage(() => api.MathOpt.ne(yMinusX, x), TypeError, message, 'test_ne (y - x).__ne__(x)');
      assertThrowsWithMessage(() => api.MathOpt.ne(yMinusX, xPlusY), TypeError, message, 'test_ne y - x != x + y');
      assertThrowsWithMessage(() => api.MathOpt.ne(yMinusX, xPlusY), TypeError, message, 'test_ne (y - x).__ne__(x + y)');
      return 'BoundedLinearExprErrorTest.test_ne PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_eq',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expression_error_eq');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const invalid = 'x' as unknown as MathOptExpressionInput;
      const message = "unsupported operand type(s) for ==: 'Variable' and 'str'";
      assertThrowsWithMessage(() => api.MathOpt.eq(x, invalid), TypeError, message, 'test_eq x == "x"');
      assertThrowsWithMessage(() => api.MathOpt.eq(x, invalid), TypeError, message, 'test_eq x.__eq__("x")');
      return 'BoundedLinearExprErrorTest.test_eq PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_float_le_expr_le_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_float_le_expr_le_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_float_le_expr_le_float expected LowerBoundedExpression');
      assertThrowsWithMessage(
        () => lower.assertNotBoolean(),
        TypeError,
        '__bool__ is unsupported for two-sided or ranged linear inequality.',
        'test_float_le_expr_le_float',
      );
      return 'BoundedLinearExprErrorTest.test_float_le_expr_le_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_float_ge_expr_ge_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_float_ge_expr_ge_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const upper = api.MathOpt.ge(2.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(upper instanceof api.MathOpt.UpperBoundedExpression, 'test_float_ge_expr_ge_float expected UpperBoundedExpression');
      assertThrowsWithMessage(
        () => upper.assertNotBoolean(),
        TypeError,
        '__bool__ is unsupported for two-sided or ranged linear inequality.',
        'test_float_ge_expr_ge_float',
      );
      return 'BoundedLinearExprErrorTest.test_float_ge_expr_ge_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_expr_le_expr_le_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expr_le_expr_le_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const bounded = api.MathOpt.le(x, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_expr_le_expr_le_float expected BoundedExpression');
      assertThrowsWithMessage(
        () => bounded.assertNotBoolean(),
        TypeError,
        '__bool__ is unsupported for two-sided or ranged linear inequality.',
        'test_expr_le_expr_le_float',
      );
      return 'BoundedLinearExprErrorTest.test_expr_le_expr_le_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_expr_ge_expr_ge_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_expr_ge_expr_ge_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const bounded = api.MathOpt.ge(x, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_expr_ge_expr_ge_float expected BoundedExpression');
      assertThrowsWithMessage(
        () => bounded.assertNotBoolean(),
        TypeError,
        '__bool__ is unsupported for two-sided or ranged linear inequality.',
        'test_expr_ge_expr_ge_float',
      );
      return 'BoundedLinearExprErrorTest.test_expr_ge_expr_ge_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_lower_bounded_expr_leq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_lower_bounded_expr_leq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      const rhs = api.MathOpt.fastSum([2.0, x]);
      assertThrowsWithMessage(
        () => api.MathOpt.le(lower as unknown as MathOptExpressionInput, rhs),
        TypeError,
        "unsupported operand type(s) for <=: 'LowerBoundedExpression' and 'LinearExpression'",
        'test_lower_bounded_expr_leq_expr',
      );
      return 'BoundedLinearExprErrorTest.test_lower_bounded_expr_leq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_lower_bounded_expr_geq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      const rhs = api.MathOpt.fastSum([2.0, x]);
      assertThrowsWithMessage(
        () => api.MathOpt.ge(lower as unknown as MathOptExpressionInput, rhs),
        TypeError,
        "unsupported operand type(s) for >=: 'LowerBoundedExpression' and 'LinearExpression'",
        'test_lower_bounded_expr_geq_expr',
      );
      return 'BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_lower_bounded_expr_geq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assertThrowsWithMessage(
        () => api.MathOpt.ge(lower as unknown as MathOptExpressionInput, 2.0),
        TypeError,
        "unsupported operand type(s) for >=: 'LowerBoundedExpression' and 'number'",
        'test_lower_bounded_expr_geq_float',
      );
      return 'BoundedLinearExprErrorTest.test_lower_bounded_expr_geq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_upper_bounded_expr_geq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_upper_bounded_expr_geq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const upper = api.MathOpt.ge(2.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      const rhs = api.MathOpt.fastSum([1.0, x]);
      assertThrowsWithMessage(
        () => api.MathOpt.ge(upper as unknown as MathOptExpressionInput, rhs),
        TypeError,
        "unsupported operand type(s) for >=: 'UpperBoundedExpression' and 'LinearExpression'",
        'test_upper_bounded_expr_geq_expr',
      );
      return 'BoundedLinearExprErrorTest.test_upper_bounded_expr_geq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_upper_bounded_expr_leq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const upper = api.MathOpt.ge(2.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      const rhs = api.MathOpt.fastSum([1.0, x]);
      assertThrowsWithMessage(
        () => api.MathOpt.le(upper as unknown as MathOptExpressionInput, rhs),
        TypeError,
        "unsupported operand type(s) for <=: 'UpperBoundedExpression' and 'LinearExpression'",
        'test_upper_bounded_expr_leq_expr',
      );
      return 'BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_upper_bounded_expr_leq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const upper = api.MathOpt.ge(2.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assertThrowsWithMessage(
        () => api.MathOpt.le(upper as unknown as MathOptExpressionInput, 2.0),
        TypeError,
        "unsupported operand type(s) for <=: 'UpperBoundedExpression' and 'number'",
        'test_upper_bounded_expr_leq_float',
      );
      return 'BoundedLinearExprErrorTest.test_upper_bounded_expr_leq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_bounded_expr_leq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_bounded_expr_leq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_bounded_expr_leq_expr expected LowerBoundedExpression');
      const bounded = api.MathOpt.completeUpperBound(lower, 2.0);
      const rhs = api.MathOpt.fastSum([1.0, x]);
      assertThrowsWithMessage(
        () => api.MathOpt.le(bounded as unknown as MathOptExpressionInput, rhs),
        TypeError,
        'Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.',
        'test_bounded_expr_leq_expr',
      );
      return 'BoundedLinearExprErrorTest.test_bounded_expr_leq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_bounded_expr_leq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_bounded_expr_leq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_bounded_expr_leq_float expected LowerBoundedExpression');
      const bounded = api.MathOpt.completeUpperBound(lower, 2.0);
      assertThrowsWithMessage(
        () => api.MathOpt.le(bounded as unknown as MathOptExpressionInput, 2.0),
        TypeError,
        'Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.',
        'test_bounded_expr_leq_float',
      );
      return 'BoundedLinearExprErrorTest.test_bounded_expr_leq_float PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_bounded_expr_geq_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_bounded_expr_geq_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_bounded_expr_geq_expr expected LowerBoundedExpression');
      const bounded = api.MathOpt.completeUpperBound(lower, 2.0);
      const rhs = api.MathOpt.fastSum([1.0, x]);
      assertThrowsWithMessage(
        () => api.MathOpt.ge(bounded as unknown as MathOptExpressionInput, rhs),
        TypeError,
        'Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.',
        'test_bounded_expr_geq_expr',
      );
      return 'BoundedLinearExprErrorTest.test_bounded_expr_geq_expr PASS';
    },
  },
  {
    name: 'BoundedLinearExprErrorTest.test_bounded_expr_geq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_bounded_expr_geq_float');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const lower = api.MathOpt.le(0.0, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2), 1.0]));
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_bounded_expr_geq_float expected LowerBoundedExpression');
      const bounded = api.MathOpt.completeUpperBound(lower, 2.0);
      assertThrowsWithMessage(
        () => api.MathOpt.ge(bounded as unknown as MathOptExpressionInput, 2.0),
        TypeError,
        'Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.',
        'test_bounded_expr_geq_float',
      );
      return 'BoundedLinearExprErrorTest.test_bounded_expr_geq_float PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_eq_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_eq_float');
      const x = model.addVariable();
      const bounded = api.MathOpt.eq(api.MathOpt.quadraticTerm(x, x, 5.0), 3.0);
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_quad_eq_float expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_quad_eq_float');
      assert(bounded.lower_bound === 3.0 && bounded.upper_bound === 3.0, 'test_quad_eq_float expected bounds [3, 3]');
      return 'BoundedQuadraticExpressionTest.test_quad_eq_float PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_float_eq_quad',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_float_eq_quad');
      const x = model.addVariable();
      const bounded = api.MathOpt.eq(3.0, api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_float_eq_quad expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_float_eq_quad');
      assert(bounded.lower_bound === 3.0 && bounded.upper_bound === 3.0, 'test_float_eq_quad expected bounds [3, 3]');
      return 'BoundedQuadraticExpressionTest.test_float_eq_quad PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_eq_lin',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_eq_lin');
      const x = model.addVariable();
      const bounded = api.MathOpt.eq(api.MathOpt.quadraticTerm(x, x, 5.0), x);
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_quad_eq_lin expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [{ variable: x, coefficient: -1.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_quad_eq_lin');
      assert(bounded.lower_bound === 0.0 && bounded.upper_bound === 0.0, 'test_quad_eq_lin expected bounds [0, 0]');
      return 'BoundedQuadraticExpressionTest.test_quad_eq_lin PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_lin_eq_quad',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_lin_eq_quad');
      const x = model.addVariable();
      const bounded = api.MathOpt.eq(x, api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_lin_eq_quad expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [{ variable: x, coefficient: -1.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_lin_eq_quad');
      assert(bounded.lower_bound === 0.0 && bounded.upper_bound === 0.0, 'test_lin_eq_quad expected bounds [0, 0]');
      return 'BoundedQuadraticExpressionTest.test_lin_eq_quad PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_eq_str_raises_error',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_eq_str');
      const x = model.addVariable();
      assertThrowsWithMessage(
        () => api.MathOpt.eq(api.MathOpt.quadraticTerm(x, x, 5.0), 'hello' as unknown as MathOptExpressionInput),
        TypeError,
        "unsupported operand type(s) for ==: 'QuadraticTerm' and 'str'",
        'test_quad_eq_str_raises_error',
      );
      return 'BoundedQuadraticExpressionTest.test_quad_eq_str_raises_error PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_ne_raises_error',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_ne');
      const x = model.addVariable();
      assertThrowsWithMessage(
        () => api.MathOpt.ne(api.MathOpt.quadraticTerm(x, x), 1.0),
        TypeError,
        '!= constraints are not supported',
        'test_quad_ne_raises_error',
      );
      return 'BoundedQuadraticExpressionTest.test_quad_ne_raises_error PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_le_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_le_float');
      const x = model.addVariable();
      const bounded = api.MathOpt.le(api.MathOpt.quadraticTerm(x, x, 5.0), 3.0);
      assert(bounded instanceof api.MathOpt.UpperBoundedExpression, 'test_quad_le_float expected UpperBoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_quad_le_float');
      assert(bounded.upper_bound === 3.0, 'test_quad_le_float expected upper bound 3');
      return 'BoundedQuadraticExpressionTest.test_quad_le_float PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_float_ge_quad',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_float_ge_quad');
      const x = model.addVariable();
      const bounded = api.MathOpt.ge(3.0, api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(bounded instanceof api.MathOpt.UpperBoundedExpression, 'test_float_ge_quad expected UpperBoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_float_ge_quad');
      assert(bounded.upper_bound === 3.0, 'test_float_ge_quad expected upper bound 3');
      return 'BoundedQuadraticExpressionTest.test_float_ge_quad PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_le_lin',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_le_lin');
      const x = model.addVariable();
      const bounded = api.MathOpt.le(api.MathOpt.quadraticTerm(x, x, 5.0), api.MathOpt.fastSum([x, 2.0]));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_quad_le_lin expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, -2.0, [{ variable: x, coefficient: -1.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_quad_le_lin');
      assert(bounded.upper_bound === 0.0, 'test_quad_le_lin expected upper bound 0');
      return 'BoundedQuadraticExpressionTest.test_quad_le_lin PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_lin_ge_quad',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_lin_ge_quad');
      const x = model.addVariable();
      const bounded = api.MathOpt.ge(api.MathOpt.fastSum([x, 2.0]), api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_lin_ge_quad expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, -2.0, [{ variable: x, coefficient: -1.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_lin_ge_quad');
      assert(bounded.upper_bound === 0.0, 'test_lin_ge_quad expected upper bound 0');
      return 'BoundedQuadraticExpressionTest.test_lin_ge_quad PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_ge_float',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_ge_float');
      const x = model.addVariable();
      const bounded = api.MathOpt.ge(api.MathOpt.quadraticTerm(x, x, 5.0), 3.0);
      assert(bounded instanceof api.MathOpt.LowerBoundedExpression, 'test_quad_ge_float expected LowerBoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_quad_ge_float');
      assert(bounded.lower_bound === 3.0, 'test_quad_ge_float expected lower bound 3');
      return 'BoundedQuadraticExpressionTest.test_quad_ge_float PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_float_le_quad',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_float_le_quad');
      const x = model.addVariable();
      const bounded = api.MathOpt.le(3.0, api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(bounded instanceof api.MathOpt.LowerBoundedExpression, 'test_float_le_quad expected LowerBoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_float_le_quad');
      assert(bounded.lower_bound === 3.0, 'test_float_le_quad expected lower bound 3');
      return 'BoundedQuadraticExpressionTest.test_float_le_quad PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_ge_lin',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_ge_lin');
      const x = model.addVariable();
      const bounded = api.MathOpt.ge(api.MathOpt.quadraticTerm(x, x, 5.0), api.MathOpt.fastSum([x, 2.0]));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_quad_ge_lin expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, -2.0, [{ variable: x, coefficient: -1.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_quad_ge_lin');
      assert(bounded.lower_bound === 0.0, 'test_quad_ge_lin expected lower bound 0');
      return 'BoundedQuadraticExpressionTest.test_quad_ge_lin PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_lin_le_quad',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_lin_le_quad');
      const x = model.addVariable();
      const bounded = api.MathOpt.le(api.MathOpt.fastSum([x, 2.0]), api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_lin_le_quad expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, -2.0, [{ variable: x, coefficient: -1.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_lin_le_quad');
      assert(bounded.lower_bound === 0.0, 'test_lin_le_quad expected lower bound 0');
      return 'BoundedQuadraticExpressionTest.test_lin_le_quad PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_le_str_raises_error',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_le_str');
      const x = model.addVariable();
      assertThrowsWithMessage(
        () => api.MathOpt.le(api.MathOpt.quadraticTerm(x, x, 5.0), 'test' as unknown as MathOptExpressionInput),
        TypeError,
        "unsupported operand type(s) for <=: 'QuadraticTerm' and 'str'",
        'test_quad_le_str_raises_error',
      );
      return 'BoundedQuadraticExpressionTest.test_quad_le_str_raises_error PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_quad_ge_str_raises_error',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_ge_str');
      const x = model.addVariable();
      assertThrowsWithMessage(
        () => api.MathOpt.ge(api.MathOpt.quadraticTerm(x, x, 5.0), 'test' as unknown as MathOptExpressionInput),
        TypeError,
        "unsupported operand type(s) for >=: 'QuadraticTerm' and 'str'",
        'test_quad_ge_str_raises_error',
      );
      return 'BoundedQuadraticExpressionTest.test_quad_ge_str_raises_error PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_ge_twice',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_ge_twice');
      const x = model.addVariable();
      const lower = api.MathOpt.le(1.0, api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(lower instanceof api.MathOpt.LowerBoundedExpression, 'test_ge_twice expected intermediate LowerBoundedExpression');
      const bounded = api.MathOpt.completeUpperBound(lower, 2.0);
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_ge_twice expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_ge_twice');
      assert(bounded.lower_bound === 1.0 && bounded.upper_bound === 2.0, 'test_ge_twice expected bounds [1, 2]');
      return 'BoundedQuadraticExpressionTest.test_ge_twice PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_ge_twice_fails_when_ambiguous',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_ge_twice_fails_when_ambiguous');
      const x = model.addVariable();
      const ambiguous = api.MathOpt.le(x, api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(ambiguous instanceof api.MathOpt.BoundedExpression, 'test_ge_twice_fails_when_ambiguous expected ambiguous BoundedExpression');
      assertThrowsWithMessage(
        () => api.MathOpt.completeUpperBound(ambiguous as unknown as MathOptLowerBoundedExpressionLike<MathOptQuadraticExpressionLike>, 2.0),
        TypeError,
        "unsupported operand type(s) for <=: 'BoundedExpression' and 'float'",
        'test_ge_twice_fails_when_ambiguous',
      );
      return 'BoundedQuadraticExpressionTest.test_ge_twice_fails_when_ambiguous PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_no_quad_ge_bounded_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_no_quad_ge_bounded_expr');
      const x = model.addVariable();
      const bounded = api.MathOpt.eq(x, 5.0);
      assertThrowsWithMessage(
        () => api.MathOpt.ge(api.MathOpt.quadraticTerm(x, x), bounded as unknown as MathOptExpressionInput),
        TypeError,
        'Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.',
        'test_no_quad_ge_bounded_expr',
      );
      return 'BoundedQuadraticExpressionTest.test_no_quad_ge_bounded_expr PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_le_twice',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_le_twice');
      const x = model.addVariable();
      const upper = api.MathOpt.le(api.MathOpt.quadraticTerm(x, x, 5.0), 2.0);
      assert(upper instanceof api.MathOpt.UpperBoundedExpression, 'test_le_twice expected intermediate UpperBoundedExpression');
      const bounded = api.MathOpt.completeLowerBound(1.0, upper);
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'test_le_twice expected BoundedExpression');
      assertFlatQuadraticExpression(bounded.expression, 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: 5.0 },
      ], 'test_le_twice');
      assert(bounded.lower_bound === 1.0 && bounded.upper_bound === 2.0, 'test_le_twice expected bounds [1, 2]');
      return 'BoundedQuadraticExpressionTest.test_le_twice PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_le_twice_fails_when_ambiguous',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quad_le_twice_fails_when_ambiguous');
      const x = model.addVariable();
      const ambiguous = api.MathOpt.ge(x, api.MathOpt.quadraticTerm(x, x, 5.0));
      assert(ambiguous instanceof api.MathOpt.BoundedExpression, 'test_le_twice_fails_when_ambiguous expected ambiguous BoundedExpression');
      assertThrowsWithMessage(
        () => api.MathOpt.completeLowerBound(2.0, ambiguous as unknown as MathOptUpperBoundedExpressionLike<MathOptQuadraticExpressionLike>),
        TypeError,
        "unsupported operand type(s) for >=: 'BoundedExpression' and 'float'",
        'test_le_twice_fails_when_ambiguous',
      );
      return 'BoundedQuadraticExpressionTest.test_le_twice_fails_when_ambiguous PASS';
    },
  },
  {
    name: 'BoundedQuadraticExpressionTest.test_no_quad_le_bounded_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_no_quad_le_bounded_expr');
      const x = model.addVariable();
      const bounded = api.MathOpt.eq(x, 5.0);
      assertThrowsWithMessage(
        () => api.MathOpt.le(api.MathOpt.quadraticTerm(x, x), bounded as unknown as MathOptExpressionInput),
        TypeError,
        'Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.',
        'test_no_quad_le_bounded_expr',
      );
      return 'BoundedQuadraticExpressionTest.test_no_quad_le_bounded_expr PASS';
    },
  },
  {
    name: 'FastSumTest.test_variables',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const result = api.MathOpt.fastSum([x, y, 4]);
      assert(result instanceof api.MathOpt.LinearExpression, 'FastSumTest.test_variables expected LinearExpression');
      const flat = api.MathOpt.asFlatLinearExpression(result);
      assert(flat.offset === 4, `FastSumTest.test_variables expected offset 4, got ${flat.offset}`);
      assert(coefficient(flat.terms, x) === 1, 'FastSumTest.test_variables expected x coefficient 1');
      assert(coefficient(flat.terms, y) === 1, 'FastSumTest.test_variables expected y coefficient 1');
      return 'FastSumTest.test_variables PASS';
    },
  },
  {
    name: 'FastSumTest.test_numbers',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const result = api.MathOpt.fastSum([2.0, 4.0]);
      assert(result instanceof api.MathOpt.LinearExpression, 'FastSumTest.test_numbers expected LinearExpression');
      const flat = api.MathOpt.asFlatLinearExpression(result);
      assert(flat.offset === 6.0, `FastSumTest.test_numbers expected offset 6, got ${flat.offset}`);
      assert(flat.terms.size === 0, `FastSumTest.test_numbers expected no terms, got ${flat.terms.size}`);
      return 'FastSumTest.test_numbers PASS';
    },
  },
  {
    name: 'FastSumTest.test_heterogeneous_linear',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const result = api.MathOpt.fastSum([2.0, api.MathOpt.linearTerm(x, 3.0)]);
      assert(result instanceof api.MathOpt.LinearExpression, 'FastSumTest.test_heterogeneous_linear expected LinearExpression');
      const flat = api.MathOpt.asFlatLinearExpression(result);
      assert(flat.offset === 2.0, `FastSumTest.test_heterogeneous_linear expected offset 2, got ${flat.offset}`);
      assert(coefficient(flat.terms, x) === 3.0, 'FastSumTest.test_heterogeneous_linear expected x coefficient 3');
      return 'FastSumTest.test_heterogeneous_linear PASS';
    },
  },
  {
    name: 'FastSumTest.test_heterogeneous_quad',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const result = api.MathOpt.fastSum([2.0, api.MathOpt.quadraticTerm(x, x, 3.0), x]);
      assert(result instanceof api.MathOpt.QuadraticExpression, 'FastSumTest.test_heterogeneous_quad expected QuadraticExpression');
      const flat = api.MathOpt.asFlatQuadraticExpression(result);
      assert(flat.offset === 2.0, `FastSumTest.test_heterogeneous_quad expected offset 2, got ${flat.offset}`);
      assert(coefficient(flat.linearTerms, x) === 1.0, 'FastSumTest.test_heterogeneous_quad expected linear x coefficient 1');
      assert(quadraticCoefficient(flat.quadraticTerms, x, x) === 3.0, 'FastSumTest.test_heterogeneous_quad expected x*x coefficient 3');
      return 'FastSumTest.test_heterogeneous_quad PASS';
    },
  },
  {
    name: 'FastSumTest.test_all_quad',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const result = api.MathOpt.fastSum([
        api.MathOpt.quadraticTerm(x, x, 3.0),
        api.MathOpt.quadraticTerm(x, x, 1.0),
      ]);
      assert(result instanceof api.MathOpt.QuadraticExpression, 'FastSumTest.test_all_quad expected QuadraticExpression');
      const flat = api.MathOpt.asFlatQuadraticExpression(result);
      assert(flat.offset === 0.0, `FastSumTest.test_all_quad expected offset 0, got ${flat.offset}`);
      assert(flat.linearTerms.size === 0, `FastSumTest.test_all_quad expected no linear terms, got ${flat.linearTerms.size}`);
      assert(quadraticCoefficient(flat.quadraticTerms, x, x) === 4.0, 'FastSumTest.test_all_quad expected x*x coefficient 4');
      return 'FastSumTest.test_all_quad PASS';
    },
  },
  {
    name: 'EvaluateExpressionTest.test_scalar_expression',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const value = api.MathOpt.evaluateExpression(4.0, new Map([[x, 1.0]]));
      assert(value === 4.0, `EvaluateExpressionTest.test_scalar_expression expected 4, got ${value}`);
      return 'EvaluateExpressionTest.test_scalar_expression PASS';
    },
  },
  {
    name: 'EvaluateExpressionTest.test_linear',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const y = model.addVariable();
      const expr = api.MathOpt.fastSum([api.MathOpt.linearTerm(x, 3), y, 2.0]);
      const value = api.MathOpt.evaluateExpression(expr, new Map([[x, 1.0], [y, 4.0]]));
      assert(Math.abs(value - 9.0) <= 1e-10, `EvaluateExpressionTest.test_linear expected 9, got ${value}`);
      return 'EvaluateExpressionTest.test_linear PASS';
    },
  },
  {
    name: 'EvaluateExpressionTest.test_quadratic',
    source: EXPRESSIONS_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
      const y = model.addVariable();
      const expr = api.MathOpt.fastSum([
        api.MathOpt.quadraticTerm(x, y, 3),
        api.MathOpt.quadraticTerm(y, y, 1),
        api.MathOpt.linearTerm(x, 2),
        2.0,
      ]);
      const value = api.MathOpt.evaluateExpression(expr, new Map([[x, 1.0], [y, 4.0]]));
      assert(Math.abs(value - 32.0) <= 1e-10, `EvaluateExpressionTest.test_quadratic expected 32, got ${value}`);
      return 'EvaluateExpressionTest.test_quadratic PASS';
    },
  },
  {
    name: 'BoundedExpressionTest.test_bounded_expression_read',
    source: BOUNDED_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const bounded = api.MathOpt.boundedExpression(-3.0, 'e123', 4.5);
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'expected BoundedExpression');
      assert(bounded.lowerBound === -3.0, `expected lower bound -3, got ${bounded.lowerBound}`);
      assert(bounded.lower_bound === -3.0, `expected lower_bound -3, got ${bounded.lower_bound}`);
      assert(bounded.upperBound === 4.5, `expected upper bound 4.5, got ${bounded.upperBound}`);
      assert(bounded.upper_bound === 4.5, `expected upper_bound 4.5, got ${bounded.upper_bound}`);
      assert(bounded.expression === 'e123', `expected expression e123, got ${bounded.expression}`);
      assert(String(bounded) === '-3.0 <= e123 <= 4.5', `unexpected bounded string ${String(bounded)}`);
      try {
        bounded.assertNotBoolean();
        throw new Error('expected assertNotBoolean to throw');
      } catch (error) {
        assert(error instanceof TypeError && /two-sided or ranged/.test(error.message), `unexpected bool error ${String(error)}`);
      }
      return 'BoundedExpressionTest.test_bounded_expression_read PASS';
    },
  },
  {
    name: 'BoundedExpressionTest.test_lower_bounded_expression_read',
    source: BOUNDED_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const bounded = api.MathOpt.lowerBoundedExpression(-3.0, 'e123');
      assert(bounded instanceof api.MathOpt.LowerBoundedExpression, 'expected LowerBoundedExpression');
      assert(bounded.lowerBound === -3.0, `expected lower bound -3, got ${bounded.lowerBound}`);
      assert(bounded.upperBound === Number.POSITIVE_INFINITY, `expected upper bound inf, got ${bounded.upperBound}`);
      assert(bounded.expression === 'e123', `expected expression e123, got ${bounded.expression}`);
      assert(String(bounded) === 'e123 >= -3.0', `unexpected lower bounded string ${String(bounded)}`);
      try {
        bounded.assertNotBoolean();
        throw new Error('expected assertNotBoolean to throw');
      } catch (error) {
        assert(error instanceof TypeError && /two-sided or ranged/.test(error.message), `unexpected bool error ${String(error)}`);
      }
      return 'BoundedExpressionTest.test_lower_bounded_expression_read PASS';
    },
  },
  {
    name: 'BoundedExpressionTest.test_upper_bounded_expression_read',
    source: BOUNDED_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const bounded = api.MathOpt.upperBoundedExpression('e123', 4.5);
      assert(bounded instanceof api.MathOpt.UpperBoundedExpression, 'expected UpperBoundedExpression');
      assert(bounded.lowerBound === Number.NEGATIVE_INFINITY, `expected lower bound -inf, got ${bounded.lowerBound}`);
      assert(bounded.upperBound === 4.5, `expected upper bound 4.5, got ${bounded.upperBound}`);
      assert(bounded.expression === 'e123', `expected expression e123, got ${bounded.expression}`);
      assert(String(bounded) === 'e123 <= 4.5', `unexpected upper bounded string ${String(bounded)}`);
      try {
        bounded.assertNotBoolean();
        throw new Error('expected assertNotBoolean to throw');
      } catch (error) {
        assert(error instanceof TypeError && /two-sided or ranged/.test(error.message), `unexpected bool error ${String(error)}`);
      }
      return 'BoundedExpressionTest.test_upper_bounded_expression_read PASS';
    },
  },
  {
    name: 'BoundedExpressionTest.test_lower_bounded_to_bounded',
    source: BOUNDED_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const lowerBounded = api.MathOpt.lowerBoundedExpression(-3.0, 'e123');
      const bounded = lowerBounded.toBoundedExpression(4.5);
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'expected BoundedExpression');
      assert(bounded.lowerBound === -3.0, `expected lower bound -3, got ${bounded.lowerBound}`);
      assert(bounded.upperBound === 4.5, `expected upper bound 4.5, got ${bounded.upperBound}`);
      assert(bounded.expression === 'e123', `expected expression e123, got ${bounded.expression}`);
      return 'BoundedExpressionTest.test_lower_bounded_to_bounded PASS';
    },
  },
  {
    name: 'BoundedExpressionTest.test_upper_bounded_to_bounded',
    source: BOUNDED_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const upperBounded = api.MathOpt.upperBoundedExpression('e123', 4.5);
      const bounded = upperBounded.toBoundedExpression(-3.0);
      assert(bounded instanceof api.MathOpt.BoundedExpression, 'expected BoundedExpression');
      assert(bounded.lowerBound === -3.0, `expected lower bound -3, got ${bounded.lowerBound}`);
      assert(bounded.upperBound === 4.5, `expected upper bound 4.5, got ${bounded.upperBound}`);
      assert(bounded.expression === 'e123', `expected expression e123, got ${bounded.expression}`);
      return 'BoundedExpressionTest.test_upper_bounded_to_bounded PASS';
    },
  },
  {
    name: 'SumTest.test_sum_vars',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_sum_vars');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([x, z, x, x, y, 8.0]);
      assertFlatLinearExpression(expression, 8.0, [
        { variable: x, coefficient: 3.0 },
        { variable: y, coefficient: 1.0 },
        { variable: z, coefficient: 1.0 },
      ], 'SumTest.test_sum_vars');
      return 'SumTest.test_sum_vars PASS';
    },
  },
  {
    name: 'SumTest.test_sum_linear_terms',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_sum_linear_terms');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x, 1.25),
        z,
        x,
        x,
        y,
        api.MathOpt.linearTerm(y, -0.5),
        1.0,
        8.0,
      ]);
      assertFlatLinearExpression(expression, 9.0, [
        { variable: x, coefficient: 3.25 },
        { variable: y, coefficient: 0.5 },
        { variable: z, coefficient: 1.0 },
      ], 'SumTest.test_sum_linear_terms');
      return 'SumTest.test_sum_linear_terms PASS';
    },
  },
  {
    name: 'SumTest.test_sum_quadratic_terms',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_sum_quadratic_terms');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x, 1.25),
        z,
        x,
        x,
        y,
        api.MathOpt.linearTerm(y, -0.5),
        1.0,
        api.MathOpt.quadraticTerm(x, x, 2.5),
        api.MathOpt.quadraticTerm(x, y, -1.0),
        8.0,
      ]);
      assertFlatQuadraticExpression(expression, 9.0, [
        { variable: x, coefficient: 3.25 },
        { variable: y, coefficient: 0.5 },
        { variable: z, coefficient: 1.0 },
      ], [
        { firstVariable: x, secondVariable: x, coefficient: 2.5 },
        { firstVariable: x, secondVariable: y, coefficient: -1.0 },
      ], 'SumTest.test_sum_quadratic_terms');
      return 'SumTest.test_sum_quadratic_terms PASS';
    },
  },
  {
    name: 'SumTest.test_sum_linear_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_sum_linear_expression');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        api.MathOpt.fastSum([api.MathOpt.linearTerm(x, 1.25), z]),
        x,
        api.MathOpt.fastSum([x, y]),
        api.MathOpt.fastSum([api.MathOpt.linearTerm(y, -0.5), 1.0]),
        8.0,
      ]);
      assertFlatLinearExpression(expression, 9.0, [
        { variable: x, coefficient: 3.25 },
        { variable: y, coefficient: 0.5 },
        { variable: z, coefficient: 1.0 },
      ], 'SumTest.test_sum_linear_expression');
      return 'SumTest.test_sum_linear_expression PASS';
    },
  },
  {
    name: 'SumTest.test_sum_quadratic_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_sum_quadratic_expression');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        api.MathOpt.fastSum([api.MathOpt.linearTerm(x, 1.25), z]),
        x,
        api.MathOpt.fastSum([x, y]),
        api.MathOpt.fastSum([api.MathOpt.linearTerm(y, -0.5), 1.0]),
        api.MathOpt.fastSum([
          api.MathOpt.quadraticTerm(x, x, 2.5),
          api.MathOpt.quadraticTerm(x, y, -1.0),
        ]),
        api.MathOpt.fastSum([
          api.MathOpt.quadraticTerm(x, z),
          api.MathOpt.quadraticTerm(y, z),
        ]),
        8.0,
      ]);
      assertFlatQuadraticExpression(expression, 9.0, [
        { variable: x, coefficient: 3.25 },
        { variable: y, coefficient: 0.5 },
        { variable: z, coefficient: 1.0 },
      ], [
        { firstVariable: x, secondVariable: x, coefficient: 2.5 },
        { firstVariable: x, secondVariable: y, coefficient: -1.0 },
        { firstVariable: x, secondVariable: z, coefficient: 1.0 },
        { firstVariable: y, secondVariable: z, coefficient: 1.0 },
      ], 'SumTest.test_sum_quadratic_expression');
      return 'SumTest.test_sum_quadratic_expression PASS';
    },
  },
  {
    name: 'SumTest.test_generator_sum_vars',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_generator_sum_vars');
      const x = Array.from({ length: 3 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x[${i}]` }));
      const expression = api.MathOpt.fastSum([...x, 8.0]);
      assertFlatLinearExpression(expression, 8.0, [
        { variable: x[0], coefficient: 1.0 },
        { variable: x[1], coefficient: 1.0 },
        { variable: x[2], coefficient: 1.0 },
      ], 'SumTest.test_generator_sum_vars');
      return 'SumTest.test_generator_sum_vars PASS';
    },
  },
  {
    name: 'SumTest.test_generator_sum_terms',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_generator_sum_terms');
      const x = Array.from({ length: 3 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x[${i}]` }));
      const expression = api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x[0], 0.0),
        api.MathOpt.linearTerm(x[1], 1.0),
        api.MathOpt.linearTerm(x[2], 2.0),
        8.0,
      ]);
      assertFlatLinearExpressionWithZeroDefault(expression, 8.0, [
        { variable: x[0], coefficient: 0.0 },
        { variable: x[1], coefficient: 1.0 },
        { variable: x[2], coefficient: 2.0 },
      ], 'SumTest.test_generator_sum_terms');
      return 'SumTest.test_generator_sum_terms PASS';
    },
  },
  {
    name: 'SumTest.test_generator_sum_quadratic_terms',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_generator_sum_quadratic_terms');
      const x = Array.from({ length: 4 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x[${i}]` }));
      const expression = api.MathOpt.fastSum([
        api.MathOpt.quadraticTerm(x[0], x[1], 0.0),
        api.MathOpt.quadraticTerm(x[1], x[2], 1.0),
        api.MathOpt.quadraticTerm(x[2], x[3], 2.0),
        8.0,
      ]);
      assertFlatQuadraticExpressionWithZeroDefault(expression, 8.0, [], [
        { firstVariable: x[0], secondVariable: x[1], coefficient: 0.0 },
        { firstVariable: x[1], secondVariable: x[2], coefficient: 1.0 },
        { firstVariable: x[2], secondVariable: x[3], coefficient: 2.0 },
      ], 'SumTest.test_generator_sum_quadratic_terms');
      return 'SumTest.test_generator_sum_quadratic_terms PASS';
    },
  },
  {
    name: 'SumTest.test_generator_sum_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_generator_sum_expression');
      const x = Array.from({ length: 3 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x[${i}]` }));
      const pieces = Array.from({ length: 2 }, (_, i) => api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x[i], 2.0),
        api.MathOpt.linearTerm(x[i + 1], -1.0),
        1.5,
      ]));
      const expression = api.MathOpt.fastSum([...pieces, 8.0]);
      assertFlatLinearExpression(expression, 11.0, [
        { variable: x[0], coefficient: 2.0 },
        { variable: x[1], coefficient: 1.0 },
        { variable: x[2], coefficient: -1.0 },
      ], 'SumTest.test_generator_sum_expression');
      return 'SumTest.test_generator_sum_expression PASS';
    },
  },
  {
    name: 'SumTest.test_generator_quadratic_sum_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_generator_quadratic_sum_expression');
      const x = Array.from({ length: 3 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x[${i}]` }));
      const pieces = Array.from({ length: 2 }, (_, i) => api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x[i], 2.0),
        api.MathOpt.linearTerm(x[i + 1], -1.0),
        1.5,
        api.MathOpt.quadraticTerm(x[i], x[i + 1]),
      ]));
      const expression = api.MathOpt.fastSum([...pieces, 8.0]);
      assertFlatQuadraticExpression(expression, 11.0, [
        { variable: x[0], coefficient: 2.0 },
        { variable: x[1], coefficient: 1.0 },
        { variable: x[2], coefficient: -1.0 },
      ], [
        { firstVariable: x[0], secondVariable: x[1], coefficient: 1.0 },
        { firstVariable: x[1], secondVariable: x[2], coefficient: 1.0 },
      ], 'SumTest.test_generator_quadratic_sum_expression');
      return 'SumTest.test_generator_quadratic_sum_expression PASS';
    },
  },
  {
    name: 'AstTest.test_simple_linear_ast',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_simple_linear_ast');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x, 8.0),
        api.MathOpt.linearTerm(y, 5.0),
        api.MathOpt.linearTerm(z, -1.0),
        17.0,
      ]);
      assertFlatLinearExpressionWithZeroDefault(expression, 17.0, [
        { variable: x, coefficient: 8.0 },
        { variable: y, coefficient: 5.0 },
        { variable: z, coefficient: -1.0 },
      ], 'AstTest.test_simple_linear_ast');
      return 'AstTest.test_simple_linear_ast PASS';
    },
  },
  {
    name: 'AstTest.test_simple_quadratic_ast',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_simple_quadratic_ast');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x, 6.0),
        api.MathOpt.linearTerm(z, -1.0),
        api.MathOpt.quadraticTerm(x, x, 8.0),
        api.MathOpt.quadraticTerm(x, y, 2.0),
        api.MathOpt.quadraticTerm(y, y, -1.0),
        11.0,
      ]);
      assertFlatQuadraticExpressionWithZeroDefault(expression, 11.0, [
        { variable: x, coefficient: 6.0 },
        { variable: z, coefficient: -1.0 },
      ], [
        { firstVariable: x, secondVariable: x, coefficient: 8.0 },
        { firstVariable: x, secondVariable: y, coefficient: 2.0 },
        { firstVariable: y, secondVariable: y, coefficient: -1.0 },
      ], 'AstTest.test_simple_quadratic_ast');
      return 'AstTest.test_simple_quadratic_ast PASS';
    },
  },
  {
    name: 'AstTest.test_linear_sum_ast',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_sum_ast');
      const x = Array.from({ length: 5 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x[${i}]` }));
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        api.MathOpt.linearTerm(x[0], -2.0),
        api.MathOpt.linearTerm(x[1], 7.0),
        api.MathOpt.linearTerm(x[2], 4.0),
        api.MathOpt.linearTerm(x[3], -1.0),
        api.MathOpt.linearTerm(x[4], -1.0),
        api.MathOpt.linearTerm(y, 2.0),
        api.MathOpt.linearTerm(z, 1.0),
        3.0,
      ]);
      assertFlatLinearExpressionWithZeroDefault(expression, 3.0, [
        { variable: x[0], coefficient: -2.0 },
        { variable: x[1], coefficient: 7.0 },
        { variable: x[2], coefficient: 4.0 },
        { variable: x[3], coefficient: -1.0 },
        { variable: x[4], coefficient: -1.0 },
        { variable: y, coefficient: 2.0 },
        { variable: z, coefficient: 1.0 },
      ], 'AstTest.test_linear_sum_ast');
      return 'AstTest.test_linear_sum_ast PASS';
    },
  },
  {
    name: 'AstTest.test_quadratic_sum_ast',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_sum_ast');
      const x = Array.from({ length: 3 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x[${i}]` }));
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expression = api.MathOpt.fastSum([
        1.0,
        z,
        api.MathOpt.linearTerm(y, -1.0),
        x[0],
        x[1],
        x[2],
        api.MathOpt.quadraticTerm(y, y),
        api.MathOpt.quadraticTerm(z, z, -1.0),
        api.MathOpt.quadraticTerm(x[0], y),
        api.MathOpt.quadraticTerm(x[1], y),
        api.MathOpt.quadraticTerm(x[2], y),
        api.MathOpt.quadraticTerm(x[0], z),
        api.MathOpt.quadraticTerm(x[1], z),
        api.MathOpt.quadraticTerm(x[2], z),
      ]);
      assertFlatQuadraticExpressionWithZeroDefault(expression, 1.0, [
        { variable: x[0], coefficient: 1.0 },
        { variable: x[1], coefficient: 1.0 },
        { variable: x[2], coefficient: 1.0 },
        { variable: y, coefficient: -1.0 },
        { variable: z, coefficient: 1.0 },
      ], [
        { firstVariable: y, secondVariable: y, coefficient: 1.0 },
        { firstVariable: z, secondVariable: z, coefficient: -1.0 },
        { firstVariable: x[0], secondVariable: y, coefficient: 1.0 },
        { firstVariable: x[1], secondVariable: y, coefficient: 1.0 },
        { firstVariable: x[2], secondVariable: y, coefficient: 1.0 },
        { firstVariable: x[0], secondVariable: z, coefficient: 1.0 },
        { firstVariable: x[1], secondVariable: z, coefficient: 1.0 },
        { firstVariable: x[2], secondVariable: z, coefficient: 1.0 },
      ], 'AstTest.test_quadratic_sum_ast');
      return 'AstTest.test_quadratic_sum_ast PASS';
    },
  },
  {
    name: 'QuadraticTermKey.test_var_dict',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_term_key_var_dict');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const QuadraticTermKey = api.MathOpt.QuadraticTermKey as unknown as new (
        firstVariable: MathOptVariableLike,
        secondVariable: MathOptVariableLike,
      ) => MathOptQuadraticTermKeyLike;
      const xx = new QuadraticTermKey(x, x);
      const xy = new QuadraticTermKey(x, y);
      const yy = new QuadraticTermKey(y, y);
      const varDict = new Map<MathOptQuadraticTermKeyLike, number>([[xx, 1], [xy, 2], [yy, 3]]);
      assert(varDict.get(xx) === 1, 'QuadraticTermKey.test_var_dict expected xx lookup to return 1');
      assert(varDict.get(xy) === 2, 'QuadraticTermKey.test_var_dict expected xy lookup to return 2');
      assert(varDict.get(yy) === 3, 'QuadraticTermKey.test_var_dict expected yy lookup to return 3');
      assert(xx.equals(new QuadraticTermKey(x, x)), 'QuadraticTermKey.test_var_dict expected xx equality');
      assert(xy.equals(new QuadraticTermKey(y, x)), 'QuadraticTermKey.test_var_dict expected xy symmetry');
      assert(!xx.equals(xy), 'QuadraticTermKey.test_var_dict expected xx and xy to differ');
      assert(!xy.equals(yy), 'QuadraticTermKey.test_var_dict expected xy and yy to differ');
      return 'QuadraticTermKey.test_var_dict PASS';
    },
  },
  {
    name: 'LinearNumberOpTests.test_mult',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_linear_number_mult_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants: Array<{
          label: string;
          linear: MathOptExpressionInput;
          expectedOffset: number;
          expectedTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>;
        }> = [
          { label: 'Variable', linear: x, expectedOffset: 0.0, expectedTerms: [{ variable: x, coefficient: constant }] },
          { label: 'LinearTerm', linear: api.MathOpt.linearTerm(x, 2), expectedOffset: 0.0, expectedTerms: [{ variable: x, coefficient: 2 * constant }] },
          {
            label: 'LinearExpression',
            linear: newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 3])),
            expectedOffset: 3 * constant,
            expectedTerms: [{ variable: x, coefficient: constant }, { variable: y, coefficient: -2 * constant }],
          },
          {
            label: 'LinearSum',
            linear: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 3]),
            expectedOffset: 3 * constant,
            expectedTerms: [{ variable: x, coefficient: constant }, { variable: y, coefficient: -2 * constant }],
          },
          { label: 'LinearProduct', linear: api.MathOpt.asFlatLinearExpression(x).multiply(2), expectedOffset: 0.0, expectedTerms: [{ variable: x, coefficient: 2 * constant }] },
        ];
        for (const variant of variants) {
          const expression = api.MathOpt.asFlatLinearExpression(variant.linear).multiply(constant);
          assertFlatLinearExpression(expression, variant.expectedOffset, variant.expectedTerms, `LinearNumberOpTests.test_mult ${variant.label} ${constant}`);
        }
      }
      return 'LinearNumberOpTests.test_mult PASS';
    },
  },
  {
    name: 'LinearNumberOpTests.test_div',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_linear_number_div_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants: Array<{
          label: string;
          linear: MathOptExpressionInput;
          expectedOffset: number;
          expectedTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>;
        }> = [
          { label: 'Variable', linear: x, expectedOffset: 0.0, expectedTerms: [{ variable: x, coefficient: 1 / constant }] },
          { label: 'LinearTerm', linear: api.MathOpt.linearTerm(x, 2), expectedOffset: 0.0, expectedTerms: [{ variable: x, coefficient: 2 / constant }] },
          {
            label: 'LinearExpression',
            linear: newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 3])),
            expectedOffset: 3 / constant,
            expectedTerms: [{ variable: x, coefficient: 1 / constant }, { variable: y, coefficient: -2 / constant }],
          },
          {
            label: 'LinearSum',
            linear: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 3]),
            expectedOffset: 3 / constant,
            expectedTerms: [{ variable: x, coefficient: 1 / constant }, { variable: y, coefficient: -2 / constant }],
          },
          { label: 'LinearProduct', linear: api.MathOpt.asFlatLinearExpression(x).multiply(2), expectedOffset: 0.0, expectedTerms: [{ variable: x, coefficient: 2 / constant }] },
        ];
        for (const variant of variants) {
          const expression = api.MathOpt.asFlatLinearExpression(variant.linear).multiply(1 / constant);
          assertFlatLinearExpression(expression, variant.expectedOffset, variant.expectedTerms, `LinearNumberOpTests.test_div ${variant.label} ${constant}`);
        }
      }
      return 'LinearNumberOpTests.test_div PASS';
    },
  },
  {
    name: 'LinearNumberOpTests.test_add',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_linear_number_add_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants: Array<{
          label: string;
          linear: MathOptExpressionInput;
          expectedOffset: number;
          expectedTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>;
        }> = [
          { label: 'Variable', linear: x, expectedOffset: constant, expectedTerms: [{ variable: x, coefficient: 1.0 }] },
          { label: 'LinearTerm', linear: api.MathOpt.linearTerm(x, 2), expectedOffset: constant, expectedTerms: [{ variable: x, coefficient: 2.0 }] },
          {
            label: 'LinearExpression',
            linear: newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 1])),
            expectedOffset: constant + 1,
            expectedTerms: [{ variable: x, coefficient: 1.0 }, { variable: y, coefficient: -2.0 }],
          },
          {
            label: 'LinearSum',
            linear: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 1]),
            expectedOffset: constant + 1,
            expectedTerms: [{ variable: x, coefficient: 1.0 }, { variable: y, coefficient: -2.0 }],
          },
          { label: 'LinearProduct', linear: api.MathOpt.asFlatLinearExpression(x).multiply(2), expectedOffset: constant, expectedTerms: [{ variable: x, coefficient: 2.0 }] },
        ];
        for (const variant of variants) {
          const expression = api.MathOpt.asFlatLinearExpression(variant.linear).add(constant);
          assertFlatLinearExpression(expression, variant.expectedOffset, variant.expectedTerms, `LinearNumberOpTests.test_add ${variant.label} ${constant}`);
        }
      }
      return 'LinearNumberOpTests.test_add PASS';
    },
  },
  {
    name: 'LinearNumberOpTests.test_sub',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_linear_number_sub_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants: Array<{
          label: string;
          linear: MathOptExpressionInput;
          baseOffset: number;
          baseTerms: Array<{ variable: MathOptVariableLike; coefficient: number }>;
        }> = [
          { label: 'Variable', linear: x, baseOffset: 0.0, baseTerms: [{ variable: x, coefficient: 1.0 }] },
          { label: 'LinearTerm', linear: api.MathOpt.linearTerm(x, 2), baseOffset: 0.0, baseTerms: [{ variable: x, coefficient: 2.0 }] },
          { label: 'LinearExpression', linear: newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 3])), baseOffset: 3.0, baseTerms: [{ variable: x, coefficient: 1.0 }, { variable: y, coefficient: -2.0 }] },
          { label: 'LinearSum', linear: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2), 3]), baseOffset: 3.0, baseTerms: [{ variable: x, coefficient: 1.0 }, { variable: y, coefficient: -2.0 }] },
          { label: 'LinearProduct', linear: api.MathOpt.asFlatLinearExpression(x).multiply(2), baseOffset: 0.0, baseTerms: [{ variable: x, coefficient: 2.0 }] },
        ];
        for (const variant of variants) {
          const linearFirst = api.MathOpt.asFlatLinearExpression(variant.linear).subtract(constant);
          assertFlatLinearExpression(
            linearFirst,
            variant.baseOffset - constant,
            variant.baseTerms,
            `LinearNumberOpTests.test_sub linear_first ${variant.label} ${constant}`,
          );
          const numberFirst = api.MathOpt.asFlatLinearExpression(variant.linear).multiply(-1).add(constant);
          assertFlatLinearExpression(
            numberFirst,
            constant - variant.baseOffset,
            variant.baseTerms.map((term) => ({ variable: term.variable, coefficient: -term.coefficient })),
            `LinearNumberOpTests.test_sub number_first ${variant.label} ${constant}`,
          );
        }
      }
      return 'LinearNumberOpTests.test_sub PASS';
    },
  },
  {
    name: 'QuadraticNumberOpTests.test_mult',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_quadratic_number_mult_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants = [
          {
            label: 'QuadraticTerm',
            quadratic: api.MathOpt.quadraticTerm(x, y, 2.0),
            expectedOffset: 0.0,
            expectedLinearTerms: [],
            expectedQuadraticTerms: [{ firstVariable: x, secondVariable: y, coefficient: 2.0 * constant }],
          },
          {
            label: 'QuadraticExpression',
            quadratic: newQuadraticExpression(api, api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y, -2.0),
              api.MathOpt.linearTerm(x, -1.0),
              3.0,
            ])),
            expectedOffset: 3.0 * constant,
            expectedLinearTerms: [{ variable: x, coefficient: -constant }],
            expectedQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: constant },
              { firstVariable: x, secondVariable: y, coefficient: -2.0 * constant },
            ],
          },
          {
            label: 'QuadraticSum',
            quadratic: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0, api.MathOpt.quadraticTerm(y, y)]),
            expectedOffset: 3.0 * constant,
            expectedLinearTerms: [{ variable: x, coefficient: constant }, { variable: y, coefficient: -2.0 * constant }],
            expectedQuadraticTerms: [{ firstVariable: y, secondVariable: y, coefficient: constant }],
          },
          {
            label: 'LinearLinearProduct',
            quadratic: api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y),
              api.MathOpt.linearTerm(x, 2.0),
              y,
              1.0,
            ]),
            expectedOffset: constant,
            expectedLinearTerms: [{ variable: x, coefficient: 2.0 * constant }, { variable: y, coefficient: constant }],
            expectedQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: constant },
              { firstVariable: x, secondVariable: y, coefficient: constant },
            ],
          },
          {
            label: 'QuadraticProduct',
            quadratic: api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x)).multiply(2.0),
            expectedOffset: 0.0,
            expectedLinearTerms: [],
            expectedQuadraticTerms: [{ firstVariable: x, secondVariable: x, coefficient: 2.0 * constant }],
          },
        ];
        for (const variant of variants) {
          const expression = api.MathOpt.asFlatQuadraticExpression(variant.quadratic).multiply(constant);
          assertFlatQuadraticExpression(expression, variant.expectedOffset, variant.expectedLinearTerms, variant.expectedQuadraticTerms, `QuadraticNumberOpTests.test_mult ${variant.label} ${constant}`);
        }
      }
      return 'QuadraticNumberOpTests.test_mult PASS';
    },
  },
  {
    name: 'QuadraticNumberOpTests.test_div',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_quadratic_number_div_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants = [
          {
            label: 'QuadraticTerm',
            quadratic: api.MathOpt.quadraticTerm(x, y, 2.0),
            expectedOffset: 0.0,
            expectedLinearTerms: [],
            expectedQuadraticTerms: [{ firstVariable: x, secondVariable: y, coefficient: 2.0 / constant }],
          },
          {
            label: 'QuadraticExpression',
            quadratic: newQuadraticExpression(api, api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y, -2.0),
              api.MathOpt.linearTerm(x, -1.0),
              3.0,
            ])),
            expectedOffset: 3.0 / constant,
            expectedLinearTerms: [{ variable: x, coefficient: -1.0 / constant }],
            expectedQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: 1.0 / constant },
              { firstVariable: x, secondVariable: y, coefficient: -2.0 / constant },
            ],
          },
          {
            label: 'QuadraticSum',
            quadratic: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0, api.MathOpt.quadraticTerm(y, y)]),
            expectedOffset: 3.0 / constant,
            expectedLinearTerms: [{ variable: x, coefficient: 1.0 / constant }, { variable: y, coefficient: -2.0 / constant }],
            expectedQuadraticTerms: [{ firstVariable: y, secondVariable: y, coefficient: 1.0 / constant }],
          },
          {
            label: 'LinearLinearProduct',
            quadratic: api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y),
              api.MathOpt.linearTerm(x, 2.0),
              y,
              1.0,
            ]),
            expectedOffset: 1.0 / constant,
            expectedLinearTerms: [{ variable: x, coefficient: 2.0 / constant }, { variable: y, coefficient: 1.0 / constant }],
            expectedQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: 1.0 / constant },
              { firstVariable: x, secondVariable: y, coefficient: 1.0 / constant },
            ],
          },
          {
            label: 'QuadraticProduct',
            quadratic: api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x)).multiply(2.0),
            expectedOffset: 0.0,
            expectedLinearTerms: [],
            expectedQuadraticTerms: [{ firstVariable: x, secondVariable: x, coefficient: 2.0 / constant }],
          },
        ];
        for (const variant of variants) {
          const expression = api.MathOpt.asFlatQuadraticExpression(variant.quadratic).multiply(1.0 / constant);
          assertFlatQuadraticExpression(expression, variant.expectedOffset, variant.expectedLinearTerms, variant.expectedQuadraticTerms, `QuadraticNumberOpTests.test_div ${variant.label} ${constant}`);
        }
      }
      return 'QuadraticNumberOpTests.test_div PASS';
    },
  },
  {
    name: 'QuadraticNumberOpTests.test_add',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_quadratic_number_add_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants = [
          {
            label: 'QuadraticTerm',
            quadratic: api.MathOpt.quadraticTerm(x, y, 2.0),
            expectedOffset: constant,
            expectedLinearTerms: [],
            expectedQuadraticTerms: [{ firstVariable: x, secondVariable: y, coefficient: 2.0 }],
          },
          {
            label: 'QuadraticExpression',
            quadratic: newQuadraticExpression(api, api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y, -2.0),
              api.MathOpt.linearTerm(x, -1.0),
              3.0,
            ])),
            expectedOffset: 3.0 + constant,
            expectedLinearTerms: [{ variable: x, coefficient: -1.0 }],
            expectedQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: 1.0 },
              { firstVariable: x, secondVariable: y, coefficient: -2.0 },
            ],
          },
          {
            label: 'QuadraticSum',
            quadratic: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0, api.MathOpt.quadraticTerm(y, y)]),
            expectedOffset: 3.0 + constant,
            expectedLinearTerms: [{ variable: x, coefficient: 1.0 }, { variable: y, coefficient: -2.0 }],
            expectedQuadraticTerms: [{ firstVariable: y, secondVariable: y, coefficient: 1.0 }],
          },
          {
            label: 'LinearLinearProduct',
            quadratic: api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y),
              api.MathOpt.linearTerm(x, 2.0),
              y,
              1.0,
            ]),
            expectedOffset: 1.0 + constant,
            expectedLinearTerms: [{ variable: x, coefficient: 2.0 }, { variable: y, coefficient: 1.0 }],
            expectedQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: 1.0 },
              { firstVariable: x, secondVariable: y, coefficient: 1.0 },
            ],
          },
          {
            label: 'QuadraticProduct',
            quadratic: api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x)).multiply(2.0),
            expectedOffset: constant,
            expectedLinearTerms: [],
            expectedQuadraticTerms: [{ firstVariable: x, secondVariable: x, coefficient: 2.0 }],
          },
        ];
        for (const variant of variants) {
          const expression = api.MathOpt.asFlatQuadraticExpression(variant.quadratic).add(constant);
          assertFlatQuadraticExpression(expression, variant.expectedOffset, variant.expectedLinearTerms, variant.expectedQuadraticTerms, `QuadraticNumberOpTests.test_add ${variant.label} ${constant}`);
        }
      }
      return 'QuadraticNumberOpTests.test_add PASS';
    },
  },
  {
    name: 'QuadraticNumberOpTests.test_sub',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      for (const constant of [2.0, 0.25]) {
        const model = api.MathOpt.Model(`mathopt_quadratic_number_sub_${constant}`);
        const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
        const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
        const variants = [
          {
            label: 'QuadraticTerm',
            quadratic: api.MathOpt.quadraticTerm(x, y, 2.0),
            baseOffset: 0.0,
            baseLinearTerms: [],
            baseQuadraticTerms: [{ firstVariable: x, secondVariable: y, coefficient: 2.0 }],
          },
          {
            label: 'QuadraticExpression',
            quadratic: newQuadraticExpression(api, api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y, -2.0),
              api.MathOpt.linearTerm(x, -1.0),
              3.0,
            ])),
            baseOffset: 3.0,
            baseLinearTerms: [{ variable: x, coefficient: -1.0 }],
            baseQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: 1.0 },
              { firstVariable: x, secondVariable: y, coefficient: -2.0 },
            ],
          },
          {
            label: 'QuadraticSum',
            quadratic: api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0, api.MathOpt.quadraticTerm(y, y)]),
            baseOffset: 3.0,
            baseLinearTerms: [{ variable: x, coefficient: 1.0 }, { variable: y, coefficient: -2.0 }],
            baseQuadraticTerms: [{ firstVariable: y, secondVariable: y, coefficient: 1.0 }],
          },
          {
            label: 'LinearLinearProduct',
            quadratic: api.MathOpt.fastSum([
              api.MathOpt.quadraticTerm(x, x),
              api.MathOpt.quadraticTerm(x, y),
              api.MathOpt.linearTerm(x, 2.0),
              y,
              1.0,
            ]),
            baseOffset: 1.0,
            baseLinearTerms: [{ variable: x, coefficient: 2.0 }, { variable: y, coefficient: 1.0 }],
            baseQuadraticTerms: [
              { firstVariable: x, secondVariable: x, coefficient: 1.0 },
              { firstVariable: x, secondVariable: y, coefficient: 1.0 },
            ],
          },
          {
            label: 'QuadraticProduct',
            quadratic: api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x)).multiply(2.0),
            baseOffset: 0.0,
            baseLinearTerms: [],
            baseQuadraticTerms: [{ firstVariable: x, secondVariable: x, coefficient: 2.0 }],
          },
        ];
        for (const variant of variants) {
          const linearFirst = api.MathOpt.asFlatQuadraticExpression(variant.quadratic).subtract(constant);
          assertFlatQuadraticExpression(linearFirst, variant.baseOffset - constant, variant.baseLinearTerms, variant.baseQuadraticTerms, `QuadraticNumberOpTests.test_sub quadratic_first ${variant.label} ${constant}`);
          const numberFirst = api.MathOpt.asFlatQuadraticExpression(variant.quadratic).multiply(-1).add(constant);
          assertFlatQuadraticExpression(
            numberFirst,
            constant - variant.baseOffset,
            variant.baseLinearTerms.map((term) => ({ variable: term.variable, coefficient: -term.coefficient })),
            variant.baseQuadraticTerms.map((term) => ({ firstVariable: term.firstVariable, secondVariable: term.secondVariable, coefficient: -term.coefficient })),
            `QuadraticNumberOpTests.test_sub number_first ${variant.label} ${constant}`,
          );
        }
      }
      return 'QuadraticNumberOpTests.test_sub PASS';
    },
  },
  {
    name: 'LinearLinearAddSubTest.test_add_and_sub',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const linearVariant = (
        api: MathOptApi,
        kind: string,
        primary: MathOptVariableLike,
        secondary: MathOptVariableLike,
      ): { expression: MathOptExpressionInput; offset: number; primaryCoefficient: number; secondaryCoefficient: number } => {
        if (kind === 'Variable') return { expression: primary, offset: 0.0, primaryCoefficient: 1.0, secondaryCoefficient: 0.0 };
        if (kind === 'LinearTerm') return { expression: api.MathOpt.linearTerm(primary, 2.0), offset: 0.0, primaryCoefficient: 2.0, secondaryCoefficient: 0.0 };
        if (kind === 'LinearExpression') {
          return {
            expression: newLinearExpression(api, api.MathOpt.fastSum([primary, api.MathOpt.linearTerm(secondary, -2.0), 1.0])),
            offset: 1.0,
            primaryCoefficient: 1.0,
            secondaryCoefficient: -2.0,
          };
        }
        if (kind === 'LinearSum') {
          return {
            expression: api.MathOpt.fastSum([primary, api.MathOpt.linearTerm(secondary, -2.0), 1.0]),
            offset: 1.0,
            primaryCoefficient: 1.0,
            secondaryCoefficient: -2.0,
          };
        }
        if (kind === 'LinearProduct') {
          return {
            expression: api.MathOpt.asFlatLinearExpression(primary).multiply(2.0),
            offset: 0.0,
            primaryCoefficient: 2.0,
            secondaryCoefficient: 0.0,
          };
        }
        throw new Error(`unknown linear kind ${kind}`);
      };

      for (const lhsType of ['Variable', 'LinearTerm', 'LinearExpression', 'LinearSum', 'LinearProduct']) {
        for (const rhsType of ['Variable', 'LinearTerm', 'LinearExpression', 'LinearSum', 'LinearProduct']) {
          for (const subtract of [false, true]) {
            const model = api.MathOpt.Model(`mathopt_linear_linear_${lhsType}_${rhsType}_${subtract ? 'sub' : 'add'}`);
            const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
            const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
            const lhs = linearVariant(api, lhsType, x, y);
            const rhs = linearVariant(api, rhsType, y, x);
            const sign = subtract ? -1.0 : 1.0;
            const expression = subtract
              ? api.MathOpt.asFlatLinearExpression(lhs.expression).subtract(rhs.expression)
              : api.MathOpt.asFlatLinearExpression(lhs.expression).add(rhs.expression);
            assertFlatLinearExpressionWithZeroDefault(expression, lhs.offset + sign * rhs.offset, [
              { variable: x, coefficient: lhs.primaryCoefficient + sign * rhs.secondaryCoefficient },
              { variable: y, coefficient: lhs.secondaryCoefficient + sign * rhs.primaryCoefficient },
            ], `LinearLinearAddSubTest.test_add_and_sub ${lhsType} ${rhsType} ${subtract ? 'subtract' : 'add'}`);
          }
        }
      }
      return 'LinearLinearAddSubTest.test_add_and_sub PASS';
    },
  },
  {
    name: 'LinearQuadraticAddSubTest.test_add_and_sub',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const kinds = [
        'Variable',
        'LinearTerm',
        'LinearExpression',
        'LinearSum',
        'LinearProduct',
        'QuadraticTerm',
        'QuadraticExpression',
        'QuadraticSum',
        'LinearLinearProduct',
        'QuadraticProduct',
      ];
      for (const lhsType of kinds) {
        for (const rhsType of kinds) {
          for (const subtract of [false, true]) {
            const model = api.MathOpt.Model(`mathopt_linear_quadratic_${lhsType}_${rhsType}_${subtract ? 'sub' : 'add'}`);
            const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
            const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
            let xCoefficient = 0.0;
            let yCoefficient = 0.0;
            let xxCoefficient = 0.0;
            let xyCoefficient = 0.0;
            let yyCoefficient = 0.0;
            let expectedOffset = 0.0;
            const sign = subtract ? -1.0 : 1.0;

            const lhs = (() => {
              if (lhsType === 'Variable') {
                xCoefficient += 1.0;
                return x;
              }
              if (lhsType === 'LinearTerm') {
                xCoefficient += 2.0;
                return api.MathOpt.linearTerm(x, 2.0);
              }
              if (lhsType === 'LinearExpression') {
                xCoefficient += 1.0;
                yCoefficient += -2.0;
                expectedOffset += 1.0;
                return newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 1.0]));
              }
              if (lhsType === 'LinearSum') {
                xCoefficient += 1.0;
                yCoefficient += -2.0;
                expectedOffset += 1.0;
                return api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 1.0]);
              }
              if (lhsType === 'LinearProduct') {
                xCoefficient += 2.0;
                return api.MathOpt.asFlatLinearExpression(x).multiply(2.0);
              }
              if (lhsType === 'QuadraticTerm') {
                xxCoefficient += 2.0;
                return api.MathOpt.quadraticTerm(x, x, 2.0);
              }
              if (lhsType === 'QuadraticExpression') {
                xCoefficient += 1.0;
                yCoefficient += -2.0;
                expectedOffset += 1.0;
                xxCoefficient += 3.0;
                xyCoefficient += -4.0;
                return newQuadraticExpression(api, api.MathOpt.fastSum([
                  x,
                  api.MathOpt.linearTerm(y, -2.0),
                  1.0,
                  api.MathOpt.quadraticTerm(x, x, 3.0),
                  api.MathOpt.quadraticTerm(x, y, -4.0),
                ]));
              }
              if (lhsType === 'QuadraticSum') {
                xCoefficient += 1.0;
                yCoefficient += -2.0;
                expectedOffset += 1.0;
                yyCoefficient += 1.0;
                xyCoefficient += -2.0;
                return api.MathOpt.fastSum([
                  x,
                  api.MathOpt.linearTerm(y, -2.0),
                  1.0,
                  api.MathOpt.quadraticTerm(y, y),
                  api.MathOpt.quadraticTerm(x, y, -2.0),
                ]);
              }
              if (lhsType === 'LinearLinearProduct') {
                yyCoefficient += 1.0;
                xyCoefficient += 1.0;
                return api.MathOpt.multiplyLinearExpressions(y, api.MathOpt.fastSum([x, y]));
              }
              if (lhsType === 'QuadraticProduct') {
                yyCoefficient += 2.0;
                xyCoefficient += 2.0;
                return api.MathOpt.multiplyLinearExpressions(y, api.MathOpt.fastSum([x, y])).multiply(2.0);
              }
              throw new Error(`unknown lhs type ${lhsType}`);
            })();

            const rhs = (() => {
              if (rhsType === 'Variable') {
                yCoefficient += 1.0 * sign;
                return y;
              }
              if (rhsType === 'LinearTerm') {
                yCoefficient += 2.0 * sign;
                return api.MathOpt.linearTerm(y, 2.0);
              }
              if (rhsType === 'LinearExpression') {
                xCoefficient += -2.0 * sign;
                yCoefficient += 1.0 * sign;
                expectedOffset += 1.0 * sign;
                return newLinearExpression(api, api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -2.0), 1.0]));
              }
              if (rhsType === 'LinearSum') {
                xCoefficient += -2.0 * sign;
                yCoefficient += 1.0 * sign;
                expectedOffset += 1.0 * sign;
                return api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -2.0), 1.0]);
              }
              if (rhsType === 'LinearProduct') {
                yCoefficient += 2.0 * sign;
                return api.MathOpt.asFlatLinearExpression(y).multiply(2.0);
              }
              if (rhsType === 'QuadraticTerm') {
                xyCoefficient += 5.0 * sign;
                return api.MathOpt.quadraticTerm(x, y, 5.0);
              }
              if (rhsType === 'QuadraticExpression') {
                xCoefficient += 1.0 * sign;
                yCoefficient += -2.0 * sign;
                expectedOffset += 1.0 * sign;
                xyCoefficient += 3.0 * sign;
                yyCoefficient += -4.0 * sign;
                return newQuadraticExpression(api, api.MathOpt.fastSum([
                  x,
                  api.MathOpt.linearTerm(y, -2.0),
                  1.0,
                  api.MathOpt.quadraticTerm(x, y, 3.0),
                  api.MathOpt.quadraticTerm(y, y, -4.0),
                ]));
              }
              if (rhsType === 'QuadraticSum') {
                xCoefficient += 1.0 * sign;
                yCoefficient += -2.0 * sign;
                expectedOffset += 1.0 * sign;
                xyCoefficient += 1.0 * sign;
                xxCoefficient += -2.0 * sign;
                return api.MathOpt.fastSum([
                  x,
                  api.MathOpt.linearTerm(y, -2.0),
                  1.0,
                  api.MathOpt.quadraticTerm(y, x),
                  api.MathOpt.quadraticTerm(x, x, -2.0),
                ]);
              }
              if (rhsType === 'LinearLinearProduct') {
                xxCoefficient += 1.0 * sign;
                xyCoefficient += 1.0 * sign;
                return api.MathOpt.multiplyLinearExpressions(x, api.MathOpt.fastSum([x, y]));
              }
              if (rhsType === 'QuadraticProduct') {
                xxCoefficient += 2.0 * sign;
                xyCoefficient += 2.0 * sign;
                return api.MathOpt.multiplyLinearExpressions(x, api.MathOpt.fastSum([x, y])).multiply(2.0);
              }
              throw new Error(`unknown rhs type ${rhsType}`);
            })();

            const expression = subtract
              ? api.MathOpt.asFlatQuadraticExpression(lhs).subtract(rhs)
              : api.MathOpt.asFlatQuadraticExpression(lhs).add(rhs);
            assertFlatQuadraticExpressionWithZeroDefault(expression, expectedOffset, [
              { variable: x, coefficient: xCoefficient },
              { variable: y, coefficient: yCoefficient },
            ], [
              { firstVariable: x, secondVariable: x, coefficient: xxCoefficient },
              { firstVariable: x, secondVariable: y, coefficient: xyCoefficient },
              { firstVariable: y, secondVariable: y, coefficient: yyCoefficient },
            ], `LinearQuadraticAddSubTest.test_add_and_sub ${lhsType} ${rhsType} ${subtract ? 'subtract' : 'add'}`);
          }
        }
      }
      return 'LinearQuadraticAddSubTest.test_add_and_sub PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_var_var',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_var_var');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      assertLinearProduct(api, x, y, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 1.0 }], 'var_var x_first');
      assertLinearProduct(api, y, x, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 1.0 }], 'var_var y_first');
      return 'LinearLinearMulTest.test_var_var PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_term_term',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_term_term');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      assertLinearProduct(api, api.MathOpt.linearTerm(x, 2.0), api.MathOpt.linearTerm(y, 3.0), 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 6.0 }], 'term_term var_first');
      assertLinearProduct(api, api.MathOpt.linearTerm(x, 3.0), api.MathOpt.linearTerm(y, 2.0), 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 6.0 }], 'term_term term_first');
      return 'LinearLinearMulTest.test_term_term PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_expr_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_expr_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expr1 = newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0]));
      const expr2 = newLinearExpression(api, api.MathOpt.fastSum([api.MathOpt.linearTerm(x, -1.0), y, 1.0]));
      for (const [lhs, rhs, label] of [[expr1, expr2, 'expr1_first'], [expr2, expr1, 'expr2_first']] as const) {
        assertLinearProduct(api, lhs, rhs, 3.0, [
          { variable: x, coefficient: -2.0 },
          { variable: y, coefficient: 1.0 },
        ], [
          { firstVariable: x, secondVariable: x, coefficient: -1.0 },
          { firstVariable: x, secondVariable: y, coefficient: 3.0 },
          { firstVariable: y, secondVariable: y, coefficient: -2.0 },
        ], `expr_expr ${label}`);
      }
      return 'LinearLinearMulTest.test_expr_expr PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_sum_sum',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_sum_sum');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const sum1 = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0]);
      const sum2 = api.MathOpt.fastSum([api.MathOpt.linearTerm(x, -1.0), y, 1.0]);
      for (const [lhs, rhs, label] of [[sum1, sum2, 'sum1_first'], [sum2, sum1, 'sum2_first']] as const) {
        assertLinearProduct(api, lhs, rhs, 3.0, [
          { variable: x, coefficient: -2.0 },
          { variable: y, coefficient: 1.0 },
        ], [
          { firstVariable: x, secondVariable: x, coefficient: -1.0 },
          { firstVariable: x, secondVariable: y, coefficient: 3.0 },
          { firstVariable: y, secondVariable: y, coefficient: -2.0 },
        ], `sum_sum ${label}`);
      }
      return 'LinearLinearMulTest.test_sum_sum PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_prod_prod',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_prod_prod');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const prod1 = api.MathOpt.asFlatLinearExpression(x).multiply(2.0);
      const prod2 = api.MathOpt.asFlatLinearExpression(api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2.0), -1.0])).multiply(3.0);
      for (const [lhs, rhs, label] of [[prod1, prod2, 'prod1_first'], [prod2, prod1, 'prod2_first']] as const) {
        assertLinearProduct(api, lhs, rhs, 0.0, [{ variable: x, coefficient: -6.0 }], [
          { firstVariable: x, secondVariable: x, coefficient: 6.0 },
          { firstVariable: x, secondVariable: y, coefficient: 12.0 },
        ], `prod_prod ${label}`);
      }
      return 'LinearLinearMulTest.test_prod_prod PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_var_term',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_var_term');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const term = api.MathOpt.linearTerm(y, 2.0);
      assertLinearProduct(api, x, term, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 2.0 }], 'var_term var_first');
      assertLinearProduct(api, term, x, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 2.0 }], 'var_term term_first');
      return 'LinearLinearMulTest.test_var_term PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_var_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_var_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expr = newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0]));
      assertLinearProduct(api, x, expr, 0.0, [{ variable: x, coefficient: 3.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 1.0 },
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
      ], 'var_expr var_first');
      assertLinearProduct(api, expr, x, 0.0, [{ variable: x, coefficient: 3.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 1.0 },
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
      ], 'var_expr expr_first');
      return 'LinearLinearMulTest.test_var_expr PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_var_sum',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_var_sum');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const sum = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0]);
      assertLinearProduct(api, x, sum, 0.0, [{ variable: x, coefficient: 3.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 1.0 },
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
      ], 'var_sum var_first');
      assertLinearProduct(api, sum, x, 0.0, [{ variable: x, coefficient: 3.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 1.0 },
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
      ], 'var_sum sum_first');
      return 'LinearLinearMulTest.test_var_sum PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_var_prod',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_var_prod');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const prod = api.MathOpt.asFlatLinearExpression(y).multiply(2.0);
      assertLinearProduct(api, x, prod, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 2.0 }], 'var_prod var_first');
      assertLinearProduct(api, prod, x, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 2.0 }], 'var_prod prod_first');
      return 'LinearLinearMulTest.test_var_prod PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_term_expr',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_term_expr');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const term = api.MathOpt.linearTerm(x, 2.0);
      const expr = newLinearExpression(api, api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0]));
      assertLinearProduct(api, term, expr, 0.0, [{ variable: x, coefficient: 6.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 2.0 },
        { firstVariable: x, secondVariable: y, coefficient: -4.0 },
      ], 'term_expr term_first');
      assertLinearProduct(api, expr, term, 0.0, [{ variable: x, coefficient: 6.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 2.0 },
        { firstVariable: x, secondVariable: y, coefficient: -4.0 },
      ], 'term_expr expr_first');
      return 'LinearLinearMulTest.test_term_expr PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_term_sum',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_term_sum');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const term = api.MathOpt.linearTerm(x, 2.0);
      const sum = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0]);
      assertLinearProduct(api, term, sum, 0.0, [{ variable: x, coefficient: 6.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 2.0 },
        { firstVariable: x, secondVariable: y, coefficient: -4.0 },
      ], 'term_sum term_first');
      assertLinearProduct(api, sum, term, 0.0, [{ variable: x, coefficient: 6.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: 2.0 },
        { firstVariable: x, secondVariable: y, coefficient: -4.0 },
      ], 'term_sum sum_first');
      return 'LinearLinearMulTest.test_term_sum PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_term_prod',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_term_prod');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const term = api.MathOpt.linearTerm(x, 2.0);
      const prod = api.MathOpt.asFlatLinearExpression(y).multiply(2.0);
      assertLinearProduct(api, term, prod, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 4.0 }], 'term_prod term_first');
      assertLinearProduct(api, prod, term, 0.0, [], [{ firstVariable: x, secondVariable: y, coefficient: 4.0 }], 'term_prod prod_first');
      return 'LinearLinearMulTest.test_term_prod PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_expr_sum',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_expr_sum');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expr = newLinearExpression(api, api.MathOpt.fastSum([api.MathOpt.linearTerm(x, -1.0), y, 1.0]));
      const sum = api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -2.0), 3.0]);
      for (const [lhs, rhs, label] of [[expr, sum, 'expr_first'], [sum, expr, 'sum_first']] as const) {
        assertLinearProduct(api, lhs, rhs, 3.0, [
          { variable: x, coefficient: -2.0 },
          { variable: y, coefficient: 1.0 },
        ], [
          { firstVariable: x, secondVariable: x, coefficient: -1.0 },
          { firstVariable: x, secondVariable: y, coefficient: 3.0 },
          { firstVariable: y, secondVariable: y, coefficient: -2.0 },
        ], `expr_sum ${label}`);
      }
      return 'LinearLinearMulTest.test_expr_sum PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_expr_prod',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_expr_prod');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expr = newLinearExpression(api, api.MathOpt.fastSum([api.MathOpt.linearTerm(x, -1.0), y, 1.0]));
      const prod = api.MathOpt.asFlatLinearExpression(y).multiply(2.0);
      assertLinearProduct(api, expr, prod, 0.0, [{ variable: y, coefficient: 2.0 }], [
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
        { firstVariable: y, secondVariable: y, coefficient: 2.0 },
      ], 'expr_prod expr_first');
      assertLinearProduct(api, prod, expr, 0.0, [{ variable: y, coefficient: 2.0 }], [
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
        { firstVariable: y, secondVariable: y, coefficient: 2.0 },
      ], 'expr_prod prod_first');
      return 'LinearLinearMulTest.test_expr_prod PASS';
    },
  },
  {
    name: 'LinearLinearMulTest.test_sum_prod',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_mul_sum_prod');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const sum = api.MathOpt.fastSum([api.MathOpt.linearTerm(x, -1.0), y, 1.0]);
      const prod = api.MathOpt.asFlatLinearExpression(y).multiply(2.0);
      assertLinearProduct(api, sum, prod, 0.0, [{ variable: y, coefficient: 2.0 }], [
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
        { firstVariable: y, secondVariable: y, coefficient: 2.0 },
      ], 'sum_prod sum_first');
      assertLinearProduct(api, prod, sum, 0.0, [{ variable: y, coefficient: 2.0 }], [
        { firstVariable: x, secondVariable: y, coefficient: -2.0 },
        { firstVariable: y, secondVariable: y, coefficient: 2.0 },
      ], 'sum_prod prod_first');
      return 'LinearLinearMulTest.test_sum_prod PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_var',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_var');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertFlatLinearExpression(api.MathOpt.asFlatLinearExpression(x).multiply(-1.0), 0.0, [{ variable: x, coefficient: -1.0 }], 'negate_var');
      return 'NegateTest.test_negate_var PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_linear_term',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_linear_term');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertFlatLinearExpression(api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 0.5)).multiply(-1.0), 0.0, [{ variable: x, coefficient: -0.5 }], 'negate_linear_term');
      return 'NegateTest.test_negate_linear_term PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_linear_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_linear_expression');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expression = newLinearExpression(api, api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -2.0), 1.0]));
      assertFlatLinearExpression(expression.multiply(-1.0), -1.0, [{ variable: x, coefficient: 2.0 }, { variable: y, coefficient: -1.0 }], 'negate_linear_expression');
      return 'NegateTest.test_negate_linear_expression PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_linear_sum',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_linear_sum');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expression = api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -2.0), 1.0]);
      assertFlatLinearExpression(api.MathOpt.asFlatLinearExpression(expression).multiply(-1.0), -1.0, [{ variable: x, coefficient: 2.0 }, { variable: y, coefficient: -1.0 }], 'negate_linear_sum');
      return 'NegateTest.test_negate_linear_sum PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_ast_product',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_ast_product');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const product = api.MathOpt.asFlatLinearExpression(x).multiply(0.5);
      assertFlatLinearExpression(product.multiply(-1.0), 0.0, [{ variable: x, coefficient: -0.5 }], 'negate_ast_product');
      return 'NegateTest.test_negate_ast_product PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_quadratic_term',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_quadratic_term');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertFlatQuadraticExpression(api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x, 0.5)).multiply(-1.0), 0.0, [], [
        { firstVariable: x, secondVariable: x, coefficient: -0.5 },
      ], 'negate_quadratic_term');
      return 'NegateTest.test_negate_quadratic_term PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_quadratic_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_quadratic_expression');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expression = newQuadraticExpression(api, api.MathOpt.fastSum([
        y,
        api.MathOpt.linearTerm(x, -2.0),
        1.0,
        api.MathOpt.quadraticTerm(x, y),
      ]));
      assertFlatQuadraticExpression(expression.multiply(-1.0), -1.0, [
        { variable: x, coefficient: 2.0 },
        { variable: y, coefficient: -1.0 },
      ], [
        { firstVariable: x, secondVariable: y, coefficient: -1.0 },
      ], 'negate_quadratic_expression');
      return 'NegateTest.test_negate_quadratic_expression PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_quadratic_sum',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_quadratic_sum');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expression = api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -2.0), 1.0, api.MathOpt.quadraticTerm(y, y, -1.0)]);
      assertFlatQuadraticExpression(api.MathOpt.asFlatQuadraticExpression(expression).multiply(-1.0), -1.0, [
        { variable: x, coefficient: 2.0 },
        { variable: y, coefficient: -1.0 },
      ], [
        { firstVariable: y, secondVariable: y, coefficient: 1.0 },
      ], 'negate_quadratic_sum');
      return 'NegateTest.test_negate_quadratic_sum PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_linear_linear_product',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_linear_linear_product');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const product = api.MathOpt.multiplyLinearExpressions(x, api.MathOpt.fastSum([x, 1.0]));
      assertFlatQuadraticExpression(product.multiply(-1.0), 0.0, [{ variable: x, coefficient: -1.0 }], [
        { firstVariable: x, secondVariable: x, coefficient: -1.0 },
      ], 'negate_linear_linear_product');
      return 'NegateTest.test_negate_linear_linear_product PASS';
    },
  },
  {
    name: 'NegateTest.test_negate_quadratic_product',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_negate_quadratic_product');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const product = api.MathOpt.asFlatQuadraticExpression(api.MathOpt.fastSum([x, api.MathOpt.quadraticTerm(x, x)])).multiply(0.5);
      assertFlatQuadraticExpression(product.multiply(-1.0), 0.0, [{ variable: x, coefficient: -0.5 }], [
        { firstVariable: x, secondVariable: x, coefficient: -0.5 },
      ], 'negate_quadratic_product');
      return 'NegateTest.test_negate_quadratic_product PASS';
    },
  },
  {
    name: 'LinearStrAndReprTest.test_sorting_ok',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_str_sorting');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expression = api.MathOpt.fastSum([0.0, x, api.MathOpt.linearTerm(y, 2.0)]);
      assert(String(expression) === '0.0 + 1.0 * x + 2.0 * y', `unexpected linear sorting string ${String(expression)}`);
      return 'LinearStrAndReprTest.test_sorting_ok PASS';
    },
  },
  {
    name: 'LinearStrAndReprTest.test_simple_expressions',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_str_simple');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      assert(String(api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, 2.0)])) === '0.0 + 1.0 * x + 2.0 * y', 'linear var_plus_pos_term string mismatch');
      assert(String(api.MathOpt.fastSum([x, api.MathOpt.linearTerm(y, -3.0)])) === '0.0 + 1.0 * x - 3.0 * y', 'linear var_plus_neg_term string mismatch');
      assert(String(api.MathOpt.fastSum([x, 1.0])) === '1.0 + 1.0 * x', 'linear var_plus_num string mismatch');
      const scaled = api.MathOpt.asFlatLinearExpression(api.MathOpt.fastSum([x, y, 3.0])).multiply(2.0);
      assert(String(scaled) === '6.0 + 2.0 * x + 2.0 * y', `linear scaled string mismatch ${String(scaled)}`);
      return 'LinearStrAndReprTest.test_simple_expressions PASS';
    },
  },
  {
    name: 'LinearStrAndReprTest.test_sum_expressions',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_str_sum');
      const x = Array.from({ length: 3 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x${i}` }));
      const expression = api.MathOpt.fastSum(x.map((variable, i) => api.MathOpt.linearTerm(variable, i)));
      assert(String(expression) === '0.0 + 1.0 * x1 + 2.0 * x2', `linear sum string mismatch ${String(expression)}`);
      return 'LinearStrAndReprTest.test_sum_expressions PASS';
    },
  },
  {
    name: 'QuadraticStrAndReprTest.test_sorting_ok',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_str_sorting');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const expression = api.MathOpt.fastSum([0.0, x, api.MathOpt.linearTerm(y, 2.0), api.MathOpt.quadraticTerm(x, x)]);
      assert(String(expression) === '0.0 + 1.0 * x + 2.0 * y + 1.0 * x * x', `quadratic sorting string mismatch ${String(expression)}`);
      return 'QuadraticStrAndReprTest.test_sorting_ok PASS';
    },
  },
  {
    name: 'QuadraticStrAndReprTest.test_simple_expressions',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_str_simple');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      assert(String(api.MathOpt.fastSum([x, api.MathOpt.quadraticTerm(y, y, 2.0)])) === '0.0 + 1.0 * x + 2.0 * y * y', 'quadratic var_plus_pos_term string mismatch');
      assert(String(api.MathOpt.fastSum([x, api.MathOpt.quadraticTerm(y, y, -3.0)])) === '0.0 + 1.0 * x - 3.0 * y * y', 'quadratic var_plus_neg_term string mismatch');
      const scaled = api.MathOpt.asFlatQuadraticExpression(api.MathOpt.fastSum([api.MathOpt.quadraticTerm(x, x), y, 3.0])).multiply(2.0);
      assert(String(scaled) === '6.0 + 2.0 * y + 2.0 * x * x', `quadratic scaled string mismatch ${String(scaled)}`);
      const linearProduct = api.MathOpt.multiplyLinearExpressions(api.MathOpt.linearTerm(x, 2.0), api.MathOpt.fastSum([1.0, y]));
      assert(String(linearProduct) === '0.0 + 2.0 * x + 2.0 * x * y', `linear product string mismatch ${String(linearProduct)}`);
      return 'QuadraticStrAndReprTest.test_simple_expressions PASS';
    },
  },
  {
    name: 'QuadraticStrAndReprTest.test_sum_expressions',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_str_sum');
      const x = Array.from({ length: 3 }, (_, i) => model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: `x${i}` }));
      const expression = api.MathOpt.fastSum(x.map((variable, i) => api.MathOpt.quadraticTerm(variable, variable, i)));
      assert(String(expression) === '0.0 + 1.0 * x1 * x1 + 2.0 * x2 * x2', `quadratic sum string mismatch ${String(expression)}`);
      return 'QuadraticStrAndReprTest.test_sum_expressions PASS';
    },
  },
  {
    name: 'LinearNumberOpTestsParameters.test_suffix',
    source: LINEAR_SOURCE,
    async run() {
      const suffix = (linearType: string, constantType: string, linearFirst: boolean) => linearFirst ? `_${linearType}_${constantType}` : `_${constantType}_${linearType}`;
      assert(suffix('Variable', 'float', true) === '_Variable_float', 'linear suffix linear-first mismatch');
      assert(suffix('LinearTerm', 'int', false) === '_int_LinearTerm', 'linear suffix scalar-first mismatch');
      return 'LinearNumberOpTestsParameters.test_suffix PASS';
    },
  },
  {
    name: 'QuadraticNumberOpTestsParameters.test_suffix',
    source: LINEAR_SOURCE,
    async run() {
      const suffix = (quadraticType: string, constantType: string, quadraticFirst: boolean) => quadraticFirst ? `_${quadraticType}_${constantType}` : `_${constantType}_${quadraticType}`;
      assert(suffix('QuadraticTerm', 'float', true) === '_QuadraticTerm_float', 'quadratic suffix quadratic-first mismatch');
      assert(suffix('QuadraticExpression', 'int', false) === '_int_QuadraticExpression', 'quadratic suffix scalar-first mismatch');
      return 'QuadraticNumberOpTestsParameters.test_suffix PASS';
    },
  },
  {
    name: 'LinearLinearAddSubTestParams.test_suffix',
    source: LINEAR_SOURCE,
    async run() {
      const suffix = (lhsType: string, rhsType: string, subtract: boolean) => `_${lhsType}_${rhsType}_${subtract ? 'subtract' : 'add'}`;
      assert(suffix('Variable', 'LinearTerm', false) === '_Variable_LinearTerm_add', 'linear-linear add suffix mismatch');
      assert(suffix('LinearSum', 'LinearProduct', true) === '_LinearSum_LinearProduct_subtract', 'linear-linear subtract suffix mismatch');
      return 'LinearLinearAddSubTestParams.test_suffix PASS';
    },
  },
  {
    name: 'LinearQuadraticAddSubTestParams.test_suffix',
    source: LINEAR_SOURCE,
    async run() {
      const suffix = (lhsType: string, rhsType: string, subtract: boolean) => `_${lhsType}_${rhsType}_${subtract ? 'subtract' : 'add'}`;
      assert(suffix('Variable', 'QuadraticTerm', false) === '_Variable_QuadraticTerm_add', 'linear-quadratic add suffix mismatch');
      assert(suffix('QuadraticSum', 'LinearProduct', true) === '_QuadraticSum_LinearProduct_subtract', 'linear-quadratic subtract suffix mismatch');
      return 'LinearQuadraticAddSubTestParams.test_suffix PASS';
    },
  },
  {
    name: 'UnsupportedProductOperandTestParams.test_suffix',
    source: LINEAR_SOURCE,
    async run() {
      const suffix = (lhsType: string, rhsType: string) => `_${lhsType}_${rhsType}`;
      assert(suffix('Variable', 'complex') === '_Variable_complex', 'unsupported product suffix linear mismatch');
      assert(suffix('QuadraticExpression', 'QuadraticTerm') === '_QuadraticExpression_QuadraticTerm', 'unsupported product suffix quadratic mismatch');
      return 'UnsupportedProductOperandTestParams.test_suffix PASS';
    },
  },
  {
    name: 'UnsupportedProductOperandTest.test_mult',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_unsupported_mult');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      assertThrowsContaining(
        () => api.MathOpt.multiplyLinearExpressions(x, { real: 0, imag: 6 } as unknown as MathOptExpressionInput),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'unsupported linear * complex',
      );
      assertThrowsContaining(
        () => api.MathOpt.multiplyLinearExpressions(api.MathOpt.quadraticTerm(x, y), api.MathOpt.quadraticTerm(x, y)),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'unsupported quadratic * quadratic',
      );
      return 'UnsupportedProductOperandTest.test_mult PASS';
    },
  },
  {
    name: 'UnsupportedProductOperandTest.test_div',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_unsupported_div');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      assertThrowsContaining(
        () => api.MathOpt.asFlatLinearExpression(api.MathOpt.quadraticTerm(x, y) as unknown as MathOptExpressionInput),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'division by linear term is represented as an unsupported expression input in TypeScript',
      );
      assertThrowsContaining(
        () => api.MathOpt.asFlatQuadraticExpression({ real: 0, imag: 6 } as unknown as MathOptExpressionInput),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'division by complex is represented as an unsupported expression input in TypeScript',
      );
      return 'UnsupportedProductOperandTest.test_div PASS';
    },
  },
  {
    name: 'UnsupportedAdditionOperandTestParams.test_suffix',
    source: LINEAR_SOURCE,
    async run() {
      const suffix = (type: string, first: boolean) => first ? `_${type}_str` : `_str_${type}`;
      assert(suffix('Variable', true) === '_Variable_str', 'unsupported addition suffix expression-first mismatch');
      assert(suffix('QuadraticTerm', false) === '_str_QuadraticTerm', 'unsupported addition suffix string-first mismatch');
      return 'UnsupportedAdditionOperandTestParams.test_suffix PASS';
    },
  },
  {
    name: 'UnsupportedAdditionOperandTest.test_add',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_unsupported_add');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertThrowsContaining(
        () => api.MathOpt.asFlatLinearExpression(x).add('bad' as unknown as MathOptExpressionInput),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'unsupported linear add string',
      );
      assertThrowsContaining(
        () => api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x)).add('bad' as unknown as MathOptExpressionInput),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'unsupported quadratic add string',
      );
      return 'UnsupportedAdditionOperandTest.test_add PASS';
    },
  },
  {
    name: 'UnsupportedAdditionOperandTest.test_sub',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_unsupported_sub');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertThrowsContaining(
        () => api.MathOpt.asFlatLinearExpression(x).subtract('bad' as unknown as MathOptExpressionInput),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'unsupported linear subtract string',
      );
      assertThrowsContaining(
        () => api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x)).subtract('bad' as unknown as MathOptExpressionInput),
        TypeError,
        'Unsupported MathOpt linear expression input',
        'unsupported quadratic subtract string',
      );
      return 'UnsupportedAdditionOperandTest.test_sub PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_linear_sum_not_tuple',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      assertThrowsContaining(() => newLinearExpression(api, true as unknown as Iterable<MathOptLinearTermLike>), TypeError, 'not iterable', 'linear expression non-iterable');
      return 'UnsupportedInitializationTest.test_linear_sum_not_tuple PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_linear_sum_not_linear_in_tuple',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_sum_not_linear');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertThrowsContaining(
        () => newLinearExpression(api, [api.MathOpt.quadraticTerm(x, x)] as unknown as Iterable<MathOptLinearTermLike>),
        TypeError,
        'unsupported type in iterable argument',
        'linear expression invalid iterable entry',
      );
      return 'UnsupportedInitializationTest.test_linear_sum_not_linear_in_tuple PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_quadratic_sum_not_tuple',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      assertThrowsContaining(() => newQuadraticExpression(api, true as unknown as Iterable<MathOptLinearTermLike>), TypeError, 'not iterable', 'quadratic expression non-iterable');
      return 'UnsupportedInitializationTest.test_quadratic_sum_not_tuple PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_quadratic_sum_not_linear_in_tuple',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      assertThrowsContaining(
        () => newQuadraticExpression(api, ['string' as unknown as MathOptLinearTermLike]),
        TypeError,
        'unsupported type in iterable argument',
        'quadratic expression invalid iterable entry',
      );
      return 'UnsupportedInitializationTest.test_quadratic_sum_not_linear_in_tuple PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_linear_product_not_scalar',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_product_not_scalar');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assert(Number.isNaN(api.MathOpt.asFlatLinearExpression(x).multiply(x as unknown as number).offset), 'linear product invalid scalar should propagate NaN');
      return 'UnsupportedInitializationTest.test_linear_product_not_scalar PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_linear_product_not_linear',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      assertThrowsContaining(() => api.MathOpt.asFlatLinearExpression('string' as unknown as MathOptExpressionInput), TypeError, 'Unsupported MathOpt linear expression input', 'linear product invalid linear input');
      return 'UnsupportedInitializationTest.test_linear_product_not_linear PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_quadratic_product_not_scalar',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_product_not_scalar');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assert(Number.isNaN(api.MathOpt.asFlatQuadraticExpression(api.MathOpt.quadraticTerm(x, x)).multiply(x as unknown as number).offset), 'quadratic product invalid scalar should propagate NaN');
      return 'UnsupportedInitializationTest.test_quadratic_product_not_scalar PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_quadratic_product_not_quadratic',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      assertThrowsContaining(() => api.MathOpt.asFlatQuadraticExpression('string' as unknown as MathOptExpressionInput), TypeError, 'Unsupported MathOpt linear expression input', 'quadratic product invalid quadratic input');
      return 'UnsupportedInitializationTest.test_quadratic_product_not_quadratic PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_linear_linear_product_first_not_linear',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_linear_product_first_not_linear');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertThrowsContaining(() => api.MathOpt.multiplyLinearExpressions('string' as unknown as MathOptExpressionInput, x), TypeError, 'Unsupported MathOpt linear expression input', 'linear linear product invalid first input');
      return 'UnsupportedInitializationTest.test_linear_linear_product_first_not_linear PASS';
    },
  },
  {
    name: 'UnsupportedInitializationTest.test_linear_linear_product_second_not_linear',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_linear_product_second_not_linear');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertThrowsContaining(() => api.MathOpt.multiplyLinearExpressions(x, 'string' as unknown as MathOptExpressionInput), TypeError, 'Unsupported MathOpt linear expression input', 'linear linear product invalid second input');
      return 'UnsupportedInitializationTest.test_linear_linear_product_second_not_linear PASS';
    },
  },
  {
    name: 'LinearExpressionTest.test_init_to_zero',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const expression = newLinearExpression(api);
      assert(expression.offset === 0.0, `LinearExpressionTest.test_init_to_zero expected offset 0, got ${expression.offset}`);
      assert(expression.terms.size === 0, `LinearExpressionTest.test_init_to_zero expected no terms, got ${expression.terms.size}`);
      return 'LinearExpressionTest.test_init_to_zero PASS';
    },
  },
  {
    name: 'LinearExpressionTest.test_terms_read_only',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_terms_read_only');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const expression = newLinearExpression(api, api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -2), 1]));
      assertThrowsWithMessage(
        () => (expression.terms as Map<MathOptVariableLike, number>).set(x, (expression.terms.get(x) ?? 0) + 1),
        TypeError,
        'ReadonlyMap does not support item assignment',
        'LinearExpressionTest.test_terms_read_only',
      );
      return 'LinearExpressionTest.test_terms_read_only PASS';
    },
  },
  {
    name: 'LinearExpressionTest.test_no_copy_of_linear_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_no_copy_linear_expression');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const expression = newLinearExpression(api, api.MathOpt.fastSum([y, api.MathOpt.linearTerm(x, -2), 1]));
      assert(api.MathOpt.asFlatLinearExpression(expression) === expression, 'LinearExpressionTest.test_no_copy_of_linear_expression expected same object');
      return 'LinearExpressionTest.test_no_copy_of_linear_expression PASS';
    },
  },
  {
    name: 'LinearExpressionTest.test_number_as_flat_linear_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const expression = newLinearExpression(api, 2.0);
      assert(expression.terms.size === 0, `LinearExpressionTest.test_number_as_flat_linear_expression expected no terms, got ${expression.terms.size}`);
      assert(expression.offset === 2.0, `LinearExpressionTest.test_number_as_flat_linear_expression expected offset 2, got ${expression.offset}`);
      return 'LinearExpressionTest.test_number_as_flat_linear_expression PASS';
    },
  },
  {
    name: 'LinearExpressionTest.test_evaluate',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_linear_expression_evaluate');
      const x = model.addVariable();
      const y = model.addVariable();
      const expression = newLinearExpression(api, api.MathOpt.fastSum([api.MathOpt.linearTerm(x, 3), y, 2.0]));
      const value = expression.evaluate(new Map([[x, 4.0], [y, 3.0]]));
      assert(value === 17.0, `LinearExpressionTest.test_evaluate expected 17, got ${value}`);
      return 'LinearExpressionTest.test_evaluate PASS';
    },
  },
  {
    name: 'QuadraticExpressionTest.test_terms_read_only',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_terms_read_only');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const expression = newQuadraticExpression(api, api.MathOpt.fastSum([api.MathOpt.quadraticTerm(y, y), api.MathOpt.linearTerm(x, -2), 1]));
      assertThrowsWithMessage(
        () => (expression.linearTerms as Map<MathOptVariableLike, number>).set(x, (expression.linearTerms.get(x) ?? 0) + 1),
        TypeError,
        'ReadonlyMap does not support item assignment',
        'QuadraticExpressionTest.test_terms_read_only linear',
      );
      const quadraticKey = [...expression.quadraticTerms.keys()][0];
      assertThrowsWithMessage(
        () => (expression.quadraticTerms as Map<unknown, number>).set(quadraticKey, (expression.quadraticTerms.get(quadraticKey) ?? 0) + 1),
        TypeError,
        'ReadonlyMap does not support item assignment',
        'QuadraticExpressionTest.test_terms_read_only quadratic',
      );
      return 'QuadraticExpressionTest.test_terms_read_only PASS';
    },
  },
  {
    name: 'QuadraticExpressionTest.test_no_copy_of_quadratic_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_no_copy_quadratic_expression');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'y' });
      const expression = newQuadraticExpression(api, api.MathOpt.fastSum([api.MathOpt.quadraticTerm(y, y), api.MathOpt.linearTerm(x, -2), 1]));
      assert(api.MathOpt.asFlatQuadraticExpression(expression) === expression, 'QuadraticExpressionTest.test_no_copy_of_quadratic_expression expected same object');
      return 'QuadraticExpressionTest.test_no_copy_of_quadratic_expression PASS';
    },
  },
  {
    name: 'QuadraticExpressionTest.test_number_as_flat_quadratic_expression',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const expression = newQuadraticExpression(api, 2.0);
      assert(expression.linearTerms.size === 0, `QuadraticExpressionTest.test_number_as_flat_quadratic_expression expected no linear terms, got ${expression.linearTerms.size}`);
      assert(expression.quadraticTerms.size === 0, `QuadraticExpressionTest.test_number_as_flat_quadratic_expression expected no quadratic terms, got ${expression.quadraticTerms.size}`);
      assert(expression.offset === 2.0, `QuadraticExpressionTest.test_number_as_flat_quadratic_expression expected offset 2, got ${expression.offset}`);
      return 'QuadraticExpressionTest.test_number_as_flat_quadratic_expression PASS';
    },
  },
  {
    name: 'QuadraticExpressionTest.test_evaluate',
    source: LINEAR_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('mathopt_quadratic_expression_evaluate');
      const x = model.addVariable();
      const y = model.addVariable();
      const expression = newQuadraticExpression(api, api.MathOpt.fastSum([
        api.MathOpt.quadraticTerm(x, x),
        api.MathOpt.quadraticTerm(x, y, 2),
        api.MathOpt.linearTerm(y, 4),
        2.0,
      ]));
      const value = expression.evaluate(new Map([[x, 4.0], [y, 3.0]]));
      assert(value === 54.0, `QuadraticExpressionTest.test_evaluate expected 54, got ${value}`);
      return 'QuadraticExpressionTest.test_evaluate PASS';
    },
  },
];
