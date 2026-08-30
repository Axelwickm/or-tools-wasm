import type { MathOptApi, MathOptCaseResult } from './runner.ts';

const MODEL_SOURCE = 'ortools/math_opt/python/model_test.py';
const OBJECTIVE_SOURCE = 'ortools/math_opt/python/model_objective_test.py';
const OBJECTIVES_SOURCE = 'ortools/math_opt/python/objectives_test.py';

type MathOptModel = ReturnType<MathOptApi['MathOpt']['Model']>;

type MathOptModelCaseResult = MathOptCaseResult & {
  source: string;
};

type MathOptModelCase = {
  name: string;
  source: string;
  run(
    api: MathOptApi,
    threads: number,
  ): Promise<Pick<MathOptCaseResult, 'terminationReason' | 'objectiveValue' | 'values'>>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function near(actual: number | null, expected: number, tolerance = 1e-9) {
  return actual !== null && Math.abs(actual - expected) <= tolerance;
}

function assertNear(actual: number | undefined | null, expected: number, message: string, tolerance = 1e-9) {
  assert(
    actual !== undefined
      && actual !== null
      && (Object.is(actual, expected) || Math.abs(actual - expected) <= tolerance),
    `${message}: expected ${expected}, got ${String(actual)}`,
  );
}

function assertIds(values: Array<{ id: number }> | undefined, expected: number[], message: string) {
  assert(values !== undefined, `${message}: values missing`);
  const actual = values.map((value) => value.id).join(',');
  assert(actual === expected.join(','), `${message}: expected ${expected.join(',')}, got ${actual}`);
}

function assertThrows(fn: () => unknown, message: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

function assertThrowsContaining(fn: () => unknown, messagePart: string, message: string) {
  try {
    fn();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    assert(text.includes(messagePart), `${message}: expected ${JSON.stringify(messagePart)}, got ${JSON.stringify(text)}`);
    return;
  }
  throw new Error(message);
}

function variableLabel(variable: { id: number; name: string }) {
  return variable.name || `variable_${variable.id}`;
}

function constraintLabel(constraint: { id: number; name: string }) {
  return constraint.name || `linear_constraint_${constraint.id}`;
}

async function solveAndAssert(
  api: MathOptApi,
  model: MathOptModel,
  solverType: number,
  threads: number,
) {
  const result = await api.MathOpt.solve(model, { solverType, threads });
  assert(result.terminationReason === 'TERMINATION_REASON_OPTIMAL', `expected optimal, got ${result.terminationReason}`);
  return result;
}

function apiOnly(values: Record<string, number> = {}) {
  return Promise.resolve({
    terminationReason: 'API_ONLY',
    objectiveValue: null,
    values,
  });
}

export const mathOptModelContractCases: MathOptModelCase[] = [
  {
    name: 'ModelTest/test_name',
    source: MODEL_SOURCE,
    async run(api, threads) {

      const model = api.MathOpt.Model('test_model');
      assert(model.name === 'test_model', 'model.name should be test_model');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      model.maximize([{ variable: x, coefficient: 1 }]);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.GLOP, threads);
      assert(near(result.objectiveValue, 1), `ModelTest/test_name expected objective 1, got ${result.objectiveValue}`);
      assert(near(result.variableValues.x, 1), `ModelTest/test_name expected x=1, got ${result.variableValues.x}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
  {
    name: 'ModelTest/test_name_empty',
    source: MODEL_SOURCE,
    async run(api, threads) {

      const model = api.MathOpt.Model();
      assert(model.name === '', 'default model name should be empty string');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      model.maximize([{ variable: x, coefficient: 1 }]);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.GLOP, threads);
      assert(near(result.objectiveValue, 1), `ModelTest/test_name_empty expected objective 1, got ${result.objectiveValue}`);
      assert(near(result.variableValues.x, 1), `ModelTest/test_name_empty expected x=1, got ${result.variableValues.x}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
  {
    name: 'ModelTest/test_add_and_read_variables',
    source: MODEL_SOURCE,
    async run(api, threads) {

      const model = api.MathOpt.Model('test_model');
      const v1 = model.addVariable({ lowerBound: -1, upperBound: 2.5, integer: true, name: 'x' });
      const v2 = model.addVariable();
      assertNear(v1.lowerBound, -1, 'v1 lowerBound');
      assertNear(v1.upperBound, 2.5, 'v1 upperBound');
      assert(v1.integer === true, 'v1 integer');
      assert(v1.name === 'x', `v1.name expected "x", got ${v1.name}`);
      assert(v1.id === 0, `v1.id expected 0, got ${v1.id}`);
      assert(v1.toString() === 'x', `v1 string expected "x", got ${String(v1)}`);
      assertNear(v2.lowerBound, Number.NEGATIVE_INFINITY, 'v2 lowerBound');
      assertNear(v2.upperBound, Number.POSITIVE_INFINITY, 'v2 upperBound');
      assert(v2.integer === false, 'v2 integer');
      assert(v2.name === '', `v2.name expected default "", got ${v2.name}`);
      assert(v2.id === 1, `v2.id expected 1, got ${v2.id}`);
      assert(v2.toString() === 'variable_1', `v2 string expected "variable_1", got ${String(v2)}`);
      assertIds(model.variables?.(), [0, 1], 'variables()');
      assert(model.getVariable?.(0)?.id === v1.id, 'expected getVariable(0) to return v1');
      assert(model.getVariable?.(1)?.id === v2.id, 'expected getVariable(1) to return v2');
      return apiOnly({ v1: v1.id, v2: v2.id });
    },
  },
  {
    name: 'ModelTest/test_addIntegerVariable',
    source: MODEL_SOURCE,
    async run(api, threads) {

      const model = api.MathOpt.Model('test_model');
      const x = model.addIntegerVariable?.({ lowerBound: -1, upperBound: 2.5, name: 'x' }) ?? model.addVariable({ lowerBound: -1, upperBound: 2.5, integer: true, name: 'x' });
      assertNear(x.lowerBound, -1, 'integer variable lowerBound');
      assertNear(x.upperBound, 2.5, 'integer variable upperBound');
      assert(x.integer === true, 'integer variable integer flag');
      assert(x.name === 'x', 'integer variable name');
      assert(x.id === 0, 'integer variable id');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelTest/test_addBinaryVariable',
    source: MODEL_SOURCE,
    async run(api, threads) {

      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      assertNear(x.lowerBound, 0, 'binary variable lowerBound');
      assertNear(x.upperBound, 1, 'binary variable upperBound');
      assert(x.integer === true, 'binary variable integer flag');
      assert(x.name === 'x', 'binary variable name');
      assert(x.id === 0, 'binary variable id');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelTest/test_read_deleted_variable',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      model.deleteVariable?.(x);
      assertThrows(() => x.lowerBound, 'reading deleted variable lowerBound should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_update_deleted_variable',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      model.deleteVariable?.(x);
      assertThrows(() => {
        x.upperBound = 2;
      }, 'updating deleted variable upperBound should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_add_and_read_linearConstraints',
    source: MODEL_SOURCE,
    async run(api, threads) {

      const model = api.MathOpt.Model('test_model');
      const c = model.addLinearConstraint({ lowerBound: -1, upperBound: 2.5, name: 'c' });
      const d = model.addLinearConstraint();
      assertNear(c.lowerBound, -1, 'c lowerBound');
      assertNear(c.upperBound, 2.5, 'c upperBound');
      assert(c.name === 'c', 'c name');
      assert(c.id === 0, 'c id');
      assert(c.toString() === 'c', 'c string');
      assertNear(d.lowerBound, Number.NEGATIVE_INFINITY, 'd lowerBound');
      assertNear(d.upperBound, Number.POSITIVE_INFINITY, 'd upperBound');
      assert(d.name === '', 'd name');
      assert(d.id === 1, 'd id');
      assert(d.toString() === 'linear_constraint_1', 'd string');
      assertIds(model.linearConstraints?.(), [0, 1], 'linearConstraints()');
      assert(model.getLinearConstraint?.(0)?.id === c.id, 'getLinearConstraint(0)');
      assert(model.getLinearConstraint?.(1)?.id === d.id, 'getLinearConstraint(1)');
      return apiOnly({ c: c.id, d: d.id });
    },
  },
  {
    name: 'ModelElementTest/test_no_elements',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      assert(model.hasVariable?.(0) === false, 'expected hasVariable(0) false');
      assert(model.hasLinearConstraint?.(0) === false, 'expected hasLinearConstraint(0) false');
      assert(model.getNextVariableId?.() === 0, 'expected next variable id 0');
      assert(model.getNextLinearConstraintId?.() === 0, 'expected next linear constraint id 0');
      assert(model.getNumVariables?.() === 0, 'expected no variables');
      assert(model.getNumLinearConstraints?.() === 0, 'expected no linear constraints');
      assert(model.variables?.().length === 0, 'expected variables() empty');
      assert(model.linearConstraints?.().length === 0, 'expected linearConstraints() empty');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_add_element',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const v0 = model.addVariable?.();
      const v1 = model.addVariable?.();
      const v2 = model.addVariable?.();
      const c0 = model.addLinearConstraint?.();
      const c1 = model.addLinearConstraint?.();
      const c2 = model.addLinearConstraint?.();
      assert(v0 && v1 && v2 && c0 && c1 && c2, 'expected elements');
      assert(model.hasVariable?.(0) === true && model.hasVariable?.(3) === false, 'variable has checks');
      assert(model.hasLinearConstraint?.(0) === true && model.hasLinearConstraint?.(3) === false, 'constraint has checks');
      assert(model.getNextVariableId?.() === 3, 'variable next id');
      assert(model.getNextLinearConstraintId?.() === 3, 'constraint next id');
      assert(model.getNumVariables?.() === 3, 'variable count');
      assert(model.getNumLinearConstraints?.() === 3, 'constraint count');
      assertIds(model.variables?.(), [0, 1, 2], 'variables order');
      assertIds(model.linearConstraints?.(), [0, 1, 2], 'constraints order');
      assert(model.getVariable?.(1)?.id === v1.id, 'get variable 1');
      assert(model.getLinearConstraint?.(1)?.id === c1.id, 'get constraint 1');
      return apiOnly({ v0: v0.id, v1: v1.id, v2: v2.id, c0: c0.id, c1: c1.id, c2: c2.id });
    },
  },
  {
    name: 'ModelElementTest/test_delete_element',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const v0 = model.addVariable?.();
      const v1 = model.addVariable?.();
      const v2 = model.addVariable?.();
      const c0 = model.addLinearConstraint?.();
      const c1 = model.addLinearConstraint?.();
      const c2 = model.addLinearConstraint?.();
      assert(v0 && v1 && v2 && c0 && c1 && c2, 'expected elements');
      model.deleteVariable?.(v1);
      model.deleteLinearConstraint?.(c1);
      assert(model.hasVariable?.(0) === true && model.hasVariable?.(1) === false && model.hasVariable?.(2) === true, 'variable has after delete');
      assert(model.hasLinearConstraint?.(0) === true && model.hasLinearConstraint?.(1) === false && model.hasLinearConstraint?.(2) === true, 'constraint has after delete');
      assert(model.getNextVariableId?.() === 3, 'variable next id after delete');
      assert(model.getNextLinearConstraintId?.() === 3, 'constraint next id after delete');
      assert(model.getNumVariables?.() === 2, 'variable count after delete');
      assert(model.getNumLinearConstraints?.() === 2, 'constraint count after delete');
      assertIds(model.variables?.(), [0, 2], 'variables after delete');
      assertIds(model.linearConstraints?.(), [0, 2], 'constraints after delete');
      assert(model.getVariable?.(2)?.id === v2.id, 'get variable 2');
      assert(model.getLinearConstraint?.(2)?.id === c2.id, 'get constraint 2');
      return apiOnly({ v0: v0.id, v2: v2.id, c0: c0.id, c2: c2.id });
    },
  },
  {
    name: 'ModelElementTest/test_get_invalid_element',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      assert(model.getVariable?.(0) === undefined, 'getVariable(0) should return undefined');
      assert(model.getLinearConstraint?.(0) === undefined, 'getLinearConstraint(0) should return undefined');
      const badVariable = model.getVariable?.(0, false);
      const badConstraint = model.getLinearConstraint?.(0, false);
      assert(badVariable?.id === 0, 'validate=false variable id');
      assert(badConstraint?.id === 0, 'validate=false linear constraint id');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_delete_invalid_element_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const badVariable = model.getVariable?.(0, false);
      const badConstraint = model.getLinearConstraint?.(0, false);
      assert(badVariable && badConstraint, 'expected validate=false elements');
      assertThrows(() => model.deleteVariable?.(badVariable), 'delete invalid variable should throw');
      assertThrows(() => model.deleteLinearConstraint?.(badConstraint), 'delete invalid linear constraint should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_delete_element_twice_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const variable = model.addVariable?.();
      const constraint = model.addLinearConstraint?.();
      assert(variable && constraint, 'expected elements');
      model.deleteVariable?.(variable);
      model.deleteLinearConstraint?.(constraint);
      assertThrows(() => model.deleteVariable?.(variable), 'delete variable twice should throw');
      assertThrows(() => model.deleteLinearConstraint?.(constraint), 'delete linear constraint twice should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_delete_element_wrong_model_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model1 = api.MathOpt.Model();
      const model2 = api.MathOpt.Model();
      model1.addVariable?.();
      model1.addLinearConstraint?.();
      const variable2 = model2.addVariable?.();
      const constraint2 = model2.addLinearConstraint?.();
      assert(variable2 && constraint2, 'expected model2 elements');
      assertThrows(() => model1.deleteVariable?.(variable2), 'delete wrong-model variable should throw');
      assertThrows(() => model1.deleteLinearConstraint?.(constraint2), 'delete wrong-model linear constraint should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_get_deleted_element_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const variable = model.addVariable?.();
      const constraint = model.addLinearConstraint?.();
      assert(variable && constraint, 'expected elements');
      model.deleteVariable?.(variable);
      model.deleteLinearConstraint?.(constraint);
      assert(model.getVariable?.(0) === undefined, 'get deleted variable should return undefined');
      assert(model.getLinearConstraint?.(0) === undefined, 'get deleted linear constraint should return undefined');
      assert(model.getVariable?.(0, false)?.id === 0, 'validate=false deleted variable');
      assert(model.getLinearConstraint?.(0, false)?.id === 0, 'validate=false deleted linear constraint');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_ensure_next_id_with_effect',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      model.ensureNextVariableIdAtLeast?.(6);
      model.ensureNextLinearConstraintIdAtLeast?.(6);
      assert(model.getNextVariableId?.() === 6, 'variable next id should be 6');
      assert(model.getNextLinearConstraintId?.() === 6, 'linear constraint next id should be 6');
      assert(model.hasVariable?.(0) === false && model.hasVariable?.(6) === false, 'placeholder variable ids should not exist');
      assert(model.hasLinearConstraint?.(0) === false && model.hasLinearConstraint?.(6) === false, 'placeholder constraint ids should not exist');
      assert(model.getNumVariables?.() === 0, 'variable count should remain 0');
      assert(model.getNumLinearConstraints?.() === 0, 'constraint count should remain 0');
      const v6 = model.addVariable?.();
      const v7 = model.addVariable?.();
      const c6 = model.addLinearConstraint?.();
      const c7 = model.addLinearConstraint?.();
      assert(v6 && v7 && c6 && c7, 'expected elements after ensure');
      assertIds(model.variables?.(), [6, 7], 'variables after ensure');
      assertIds(model.linearConstraints?.(), [6, 7], 'constraints after ensure');
      assert(model.getNextVariableId?.() === 8, 'variable next id should be 8');
      assert(model.getNextLinearConstraintId?.() === 8, 'constraint next id should be 8');
      assert(model.getVariable?.(6)?.id === v6.id && model.getVariable?.(7)?.id === v7.id, 'get variables after ensure');
      assert(model.getLinearConstraint?.(6)?.id === c6.id && model.getLinearConstraint?.(7)?.id === c7.id, 'get constraints after ensure');
      return apiOnly({ v6: v6.id, v7: v7.id, c6: c6.id, c7: c7.id });
    },
  },
  {
    name: 'ModelElementTest/test_ensure_next_id_no_effect',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const v0 = model.addVariable?.();
      const v1 = model.addVariable?.();
      const v2 = model.addVariable?.();
      const c0 = model.addLinearConstraint?.();
      const c1 = model.addLinearConstraint?.();
      const c2 = model.addLinearConstraint?.();
      assert(v0 && v1 && v2 && c0 && c1 && c2, 'expected initial elements');
      model.ensureNextVariableIdAtLeast?.(1);
      model.ensureNextLinearConstraintIdAtLeast?.(1);
      assert(model.getNextVariableId?.() === 3, 'variable next id should remain 3');
      assert(model.getNextLinearConstraintId?.() === 3, 'constraint next id should remain 3');
      assertIds(model.variables?.(), [0, 1, 2], 'variables after no-effect ensure');
      assertIds(model.linearConstraints?.(), [0, 1, 2], 'constraints after no-effect ensure');
      return apiOnly({ v0: v0.id, v1: v1.id, v2: v2.id, c0: c0.id, c1: c1.id, c2: c2.id });
    },
  },
  {
    name: 'ModelElementTest/test_no_elements_variables',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      assert(model.hasVariable?.(0) === false, 'expected hasVariable(0) false');
      assert(model.getNextVariableId?.() === 0, 'expected next variable id 0');
      assert(model.getNumVariables?.() === 0, 'expected no variables');
      assert(model.variables?.().length === 0, 'expected variables() empty');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_add_element_variables',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const e0 = model.addVariable?.();
      const e1 = model.addVariable?.();
      const e2 = model.addVariable?.();
      assert(e0 && e1 && e2, 'expected addVariable alias to exist');
      assert(model.hasVariable?.(0) === true, 'expected variable 0');
      assert(model.hasVariable?.(1) === true, 'expected variable 1');
      assert(model.hasVariable?.(2) === true, 'expected variable 2');
      assert(model.hasVariable?.(3) === false, 'expected no variable 3');
      assert(model.getNextVariableId?.() === 3, 'expected next variable id 3');
      assert(model.getNumVariables?.() === 3, 'expected three variables');
      assert(model.variables?.().map((variable) => variable.id).join(',') === '0,1,2', 'expected variables in id order');
      assert(model.getVariable?.(1)?.id === e1.id, 'expected getVariable(1)');
      return apiOnly({ e0: e0.id, e1: e1.id, e2: e2.id });
    },
  },
  {
    name: 'ModelElementTest/test_delete_element_variables',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const e0 = model.addVariable?.();
      const e1 = model.addVariable?.();
      const e2 = model.addVariable?.();
      assert(e0 && e1 && e2 && model.deleteVariable, 'expected variable element APIs');
      model.deleteVariable(e1);
      assert(model.hasVariable?.(0) === true, 'expected variable 0');
      assert(model.hasVariable?.(1) === false, 'expected deleted variable 1');
      assert(model.hasVariable?.(2) === true, 'expected variable 2');
      assert(model.getNextVariableId?.() === 3, 'expected next id remains 3');
      assert(model.getNumVariables?.() === 2, 'expected two live variables');
      assert(model.variables?.().map((variable) => variable.id).join(',') === '0,2', 'expected live variables 0,2');
      return apiOnly({ e0: e0.id, e2: e2.id });
    },
  },
  {
    name: 'ModelElementTest/test_no_elements_linearConstraints',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      assert(model.hasLinearConstraint?.(0) === false, 'expected hasLinearConstraint(0) false');
      assert(model.getNextLinearConstraintId?.() === 0, 'expected next linear constraint id 0');
      assert(model.getNumLinearConstraints?.() === 0, 'expected no linear constraints');
      assert(model.linearConstraints?.().length === 0, 'expected linearConstraints() empty');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_add_deleteLinearConstraints',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      const model = api.MathOpt.Model();
      const c0 = model.addLinearConstraint?.();
      const c1 = model.addLinearConstraint?.();
      const c2 = model.addLinearConstraint?.();
      assert(c0 && c1 && c2 && model.deleteLinearConstraint, 'expected linear constraint element APIs');
      assert(model.hasLinearConstraint?.(1) === true, 'expected linear constraint 1');
      assert(model.getNextLinearConstraintId?.() === 3, 'expected next linear constraint id 3');
      assert(model.getNumLinearConstraints?.() === 3, 'expected three constraints');
      model.deleteLinearConstraint(c1);
      assert(model.hasLinearConstraint?.(1) === false, 'expected deleted linear constraint 1');
      assert(model.linearConstraints?.().map((constraint) => constraint.id).join(',') === '0,2', 'expected live constraints 0,2');
      return apiOnly({ c0: c0.id, c2: c2.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_as_bounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const c = model.addLinearConstraint?.({
        lowerBound: -1,
        upperBound: 2.5,
        name: 'c',
        terms: [{ variable: x, coefficient: 3 }, { variable: y, coefficient: -2 }],
      }) ?? model.addLinearConstraint({
        lowerBound: -1,
        upperBound: 2.5,
        name: 'c',
        terms: [{ variable: x, coefficient: 3 }, { variable: y, coefficient: -2 }],
      });
      const bounded = c.asBoundedLinearExpression?.();
      assert(bounded !== undefined, 'expected asBoundedLinearExpression');
      assertNear(bounded.lowerBound, -1, 'bounded lowerBound');
      assertNear(bounded.upperBound, 2.5, 'bounded upperBound');
      const expr = api.MathOpt.asFlatLinearExpression(bounded.expression);
      assertNear(expr.offset, 0, 'bounded expression offset');
      assertNear(expr.terms.get(x), 3, 'bounded expression x coefficient');
      assertNear(expr.terms.get(y), -2, 'bounded expression y coefficient');
      return apiOnly({ c: c.id });
    },
  },
  {
    name: 'ModelTest/test_read_deleted_linearConstraint',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const c = model.addLinearConstraint?.({ lowerBound: -1, upperBound: 2.5, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: -1, upperBound: 2.5, name: 'c' });
      model.deleteLinearConstraint?.(c);
      assertThrows(() => c.name, 'reading deleted linear constraint name should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_update_deleted_linearConstraint',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const c = model.addLinearConstraint?.({ lowerBound: -1, upperBound: 2.5, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: -1, upperBound: 2.5, name: 'c' });
      model.deleteLinearConstraint?.(c);
      assertThrows(() => {
        c.lowerBound = -12;
      }, 'updating deleted linear constraint lowerBound should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_update_variable',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      x.lowerBound = Number.NEGATIVE_INFINITY;
      x.upperBound = -3.0;
      x.integer = false;
      assert(x.lowerBound === Number.NEGATIVE_INFINITY, 'expected updated lower bound');
      assert(x.upperBound === -3.0, 'expected updated upper bound');
      assert(x.integer === false, 'expected updated integer flag');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelTest/test_update_linearConstraint',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const c = model.addLinearConstraint?.({ lowerBound: -1, upperBound: 2.5, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: -1, upperBound: 2.5, name: 'c' });
      c.lowerBound = Number.NEGATIVE_INFINITY;
      c.upperBound = -3.0;
      assert(c.lowerBound === Number.NEGATIVE_INFINITY, 'expected updated lower bound');
      assert(c.upperBound === -3.0, 'expected updated upper bound');
      return apiOnly({ c: c.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_matrix',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const c = model.addLinearConstraint?.({ lowerBound: 0, upperBound: 1, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      const d = model.addLinearConstraint?.({ upperBound: 1, name: 'd' }) ?? model.addLinearConstraint({ upperBound: 1, name: 'd' });
      c.setCoefficient?.(x, 1);
      c.setCoefficient?.(y, 0);
      d.setCoefficient?.(x, 2);
      d.setCoefficient?.(z, -1);
      assert(c.getCoefficient?.(x) === 1, 'expected c[x] = 1');
      assert(c.getCoefficient?.(y) === 0, 'expected c[y] = 0');
      assert(c.getCoefficient?.(z) === 0, 'expected c[z] = 0');
      assert(d.getCoefficient?.(x) === 2, 'expected d[x] = 2');
      assert(d.getCoefficient?.(y) === 0, 'expected d[y] = 0');
      assert(d.getCoefficient?.(z) === -1, 'expected d[z] = -1');
      assert(c.name === 'c', 'expected c name');
      assert(d.name === 'd', 'expected d name');
      assertIds(model.columnNonzeros?.(x), [c.id, d.id], 'columnNonzeros(x)');
      assertIds(model.columnNonzeros?.(y), [], 'columnNonzeros(y)');
      assertIds(model.columnNonzeros?.(z), [d.id], 'columnNonzeros(z)');
      assertIds(model.rowNonzeros?.(c), [x.id], 'rowNonzeros(c)');
      assertIds(model.rowNonzeros?.(d), [x.id, z.id], 'rowNonzeros(d)');
      assert(c.terms?.().length === 1, 'expected zero coefficient removed from c terms');
      assert(d.terms?.().length === 2, 'expected two d terms');
      const entries = model.linearConstraintMatrixEntries?.() ?? [];
      const entryKeys = entries
        .map((entry) => `${(entry.linearConstraint ?? entry.linearConstraint)?.id}:${entry.variable.id}:${entry.coefficient}`)
        .sort()
        .join(',');
      assert(entryKeys === '0:0:1,1:0:2,1:2:-1', `unexpected matrix entries ${entryKeys}`);
      return apiOnly({ c: c.id, d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_expression',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const c = model.addLinearConstraint?.({ lowerBound: 0, expression: api.MathOpt.asFlatLinearExpression(x).add(1), upperBound: 1, name: 'c' })
        ?? model.addLinearConstraint({ lowerBound: 0, expression: api.MathOpt.asFlatLinearExpression(x).add(1), upperBound: 1, name: 'c' });
      assertNear(c.getCoefficient?.(x), 1, 'c x coefficient');
      assertNear(c.getCoefficient?.(y), 0, 'c y coefficient');
      assertNear(c.getCoefficient?.(z), 0, 'c z coefficient');
      assertNear(c.lowerBound, -1, 'c lowerBound');
      assertNear(c.upperBound, 0, 'c upperBound');
      const dExpr = api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).subtract(z);
      const d = model.addLinearConstraint?.({ upperBound: 1, expression: dExpr, name: 'd' })
        ?? model.addLinearConstraint({ upperBound: 1, expression: dExpr, name: 'd' });
      assertNear(d.getCoefficient?.(x), 2, 'd x coefficient');
      assertNear(d.getCoefficient?.(y), 0, 'd y coefficient');
      assertNear(d.getCoefficient?.(z), -1, 'd z coefficient');
      assertNear(d.lowerBound, Number.NEGATIVE_INFINITY, 'd lowerBound');
      assertNear(d.upperBound, 1, 'd upperBound');
      const e = model.addLinearConstraint?.({ lowerBound: 0 }) ?? model.addLinearConstraint({ lowerBound: 0 });
      assertNear(e.getCoefficient?.(x), 0, 'e x coefficient');
      assertNear(e.lowerBound, 0, 'e lowerBound');
      assertNear(e.upperBound, Number.POSITIVE_INFINITY, 'e upperBound');
      const f = model.addLinearConstraint?.({ expression: 1, upperBound: 2 }) ?? model.addLinearConstraint({ expression: 1, upperBound: 2 });
      assertNear(f.upperBound, 1, 'f upperBound');
      return apiOnly({ c: c.id, d: d.id, e: e.id, f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_bounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const bounded = api.MathOpt.completeUpperBound(api.MathOpt.le(0, api.MathOpt.asFlatLinearExpression(x).add(1)) as never, 1);
      const c = model.addLinearConstraint?.(bounded) ?? model.addLinearConstraint(bounded);
      assertNear(c.getCoefficient?.(x), 1, 'c x coefficient');
      assertNear(c.getCoefficient?.(y), 0, 'c y coefficient');
      assertNear(c.getCoefficient?.(z), 0, 'c z coefficient');
      assertNear(c.lowerBound, -1, 'c lowerBound');
      assertNear(c.upperBound, 0, 'c upperBound');
      return apiOnly({ c: c.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_upperBounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expr = api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).subtract(z).add(2);
      const d = model.addLinearConstraint?.(api.MathOpt.le(expr, 1) as never) ?? model.addLinearConstraint(api.MathOpt.le(expr, 1) as never);
      assertNear(d.getCoefficient?.(x), 2, 'd x coefficient');
      assertNear(d.getCoefficient?.(y), 0, 'd y coefficient');
      assertNear(d.getCoefficient?.(z), -1, 'd z coefficient');
      assertNear(d.lowerBound, Number.NEGATIVE_INFINITY, 'd lowerBound');
      assertNear(d.upperBound, -1, 'd upperBound');
      return apiOnly({ d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_lowerBounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expr = api.MathOpt.asFlatLinearExpression(x).add(y).add(2);
      const e = model.addLinearConstraint?.(api.MathOpt.ge(expr, 1) as never) ?? model.addLinearConstraint(api.MathOpt.ge(expr, 1) as never);
      assertNear(e.getCoefficient?.(x), 1, 'e x coefficient');
      assertNear(e.getCoefficient?.(y), 1, 'e y coefficient');
      assertNear(e.getCoefficient?.(z), 0, 'e z coefficient');
      assertNear(e.lowerBound, -1, 'e lowerBound');
      assertNear(e.upperBound, Number.POSITIVE_INFINITY, 'e upperBound');
      return apiOnly({ e: e.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_number_eq_expression',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expr = api.MathOpt.asFlatLinearExpression(x).add(y).add(2);
      const f = model.addLinearConstraint?.(api.MathOpt.eq(1, expr) as never) ?? model.addLinearConstraint(api.MathOpt.eq(1, expr) as never);
      assertNear(f.getCoefficient?.(x), 1, 'f x coefficient');
      assertNear(f.getCoefficient?.(y), 1, 'f y coefficient');
      assertNear(f.getCoefficient?.(z), 0, 'f z coefficient');
      assertNear(f.lowerBound, -1, 'f lowerBound');
      assertNear(f.upperBound, -1, 'f upperBound');
      return apiOnly({ f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_expression_eq_expression',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const lhs = api.MathOpt.asFlatLinearExpression(1).subtract(x);
      const rhs = api.MathOpt.asFlatLinearExpression(y).add(2);
      const f = model.addLinearConstraint?.(api.MathOpt.eq(lhs, rhs) as never) ?? model.addLinearConstraint(api.MathOpt.eq(lhs, rhs) as never);
      assertNear(f.getCoefficient?.(x), -1, 'f x coefficient');
      assertNear(f.getCoefficient?.(y), -1, 'f y coefficient');
      assertNear(f.getCoefficient?.(z), 0, 'f z coefficient');
      assertNear(f.lowerBound, 1, 'f lowerBound');
      assertNear(f.upperBound, 1, 'f upperBound');
      return apiOnly({ f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_variable_eq_variable',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.addBinaryVariable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const f = model.addLinearConstraint?.(api.MathOpt.eq(x, y) as never) ?? model.addLinearConstraint(api.MathOpt.eq(x, y) as never);
      assertNear(f.getCoefficient?.(x), 1, 'f x coefficient');
      assertNear(f.getCoefficient?.(y), -1, 'f y coefficient');
      assertNear(f.getCoefficient?.(z), 0, 'f z coefficient');
      assertNear(f.lowerBound, 0, 'f lowerBound');
      assertNear(f.upperBound, 0, 'f upperBound');
      return apiOnly({ f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_errors_direct_api',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const addLinearConstraint = (input: unknown) => {
        return model.addLinearConstraint?.(input as never) ?? model.addLinearConstraint(input as never);
      };
      assertThrowsContaining(
        () => addLinearConstraint(true),
        'Unsupported type for bounded_expr argument',
        'boolean linear constraint input should throw',
      );
      assertThrowsContaining(
        () => addLinearConstraint({ expression: 'string' }),
        'Unsupported MathOpt linear expression input',
        'string linear constraint expression should throw',
      );
      assertThrowsContaining(
        () => addLinearConstraint({ expression: Number.POSITIVE_INFINITY, lowerBound: 0 }),
        'infinite offset',
        'infinite linear constraint expression should throw',
      );
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_matrix_with_variable_deletion',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const c = model.addLinearConstraint?.({ lb: 0, ub: 1, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      const d = model.addLinearConstraint?.({ lb: 0, ub: 1, name: 'd' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'd' });
      c.setCoefficient?.(x, 1);
      c.setCoefficient?.(y, 2);
      d.setCoefficient?.(x, 1);
      model.deleteVariable?.(x);
      const entries = model.linearConstraintMatrixEntries?.() ?? [];
      assert(entries.length === 1, `expected one matrix entry, got ${entries.length}`);
      const entry = entries[0];
      assert((entry.linearConstraint ?? entry.linearConstraint)?.id === c.id, 'matrix entry constraint should be c');
      assert(entry.variable.id === y.id, 'matrix entry variable should be y');
      assertNear(entry.coefficient, 2, 'matrix entry coefficient');
      assertIds(model.columnNonzeros?.(y), [c.id], 'columnNonzeros(y) after variable delete');
      assertIds(model.rowNonzeros?.(c), [y.id], 'rowNonzeros(c) after variable delete');
      assertIds(model.rowNonzeros?.(d), [], 'rowNonzeros(d) after variable delete');
      const cTerms = c.terms?.() ?? [];
      assert(cTerms.length === 1, `expected one c term, got ${cTerms.length}`);
      assert(cTerms[0].variable.id === y.id, 'c term variable should be y');
      assertNear(cTerms[0].coefficient, 2, 'c term coefficient');
      assert((d.terms?.() ?? []).length === 0, 'd terms should be empty');
      assertThrows(() => c.getCoefficient?.(x), 'getCoefficient(deleted x) should throw');
      return apiOnly({ c: c.id, d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_matrix_with_linearConstraint_deletion',
    source: MODEL_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_model');
      const x = model.addBinaryVariable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.addBinaryVariable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const c = model.addLinearConstraint?.({ lb: 0, ub: 1, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      const d = model.addLinearConstraint?.({ lb: 0, ub: 1, name: 'd' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'd' });
      c.setCoefficient?.(x, 1);
      c.setCoefficient?.(y, 2);
      d.setCoefficient?.(x, 1);
      model.deleteLinearConstraint?.(c);
      const entries = model.linearConstraintMatrixEntries?.() ?? [];
      assert(entries.length === 1, `expected one matrix entry, got ${entries.length}`);
      const entry = entries[0];
      assert((entry.linearConstraint ?? entry.linearConstraint)?.id === d.id, 'matrix entry constraint should be d');
      assert(entry.variable.id === x.id, 'matrix entry variable should be x');
      assertNear(entry.coefficient, 1, 'matrix entry coefficient');
      assertIds(model.columnNonzeros?.(x), [d.id], 'columnNonzeros(x) after constraint delete');
      assertIds(model.columnNonzeros?.(y), [], 'columnNonzeros(y) after constraint delete');
      const dTerms = d.terms?.() ?? [];
      assert(dTerms.length === 1, `expected one d term, got ${dTerms.length}`);
      assert(dTerms[0].variable.id === x.id, 'd term variable should be x');
      assertNear(dTerms[0].coefficient, 1, 'd term coefficient');
      return apiOnly({ d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linearConstraint_matrix_wrong_model',
    source: MODEL_SOURCE,
    async run(api) {
      const model1 = api.MathOpt.Model('test_model1');
      const x1 = model1.addBinaryVariable?.({ name: 'x' }) ?? model1.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const model2 = api.MathOpt.Model('test_model2');
      model2.addBinaryVariable?.({ name: 'x' }) ?? model2.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const c2 = model2.addLinearConstraint?.({ lb: 0, ub: 1, name: 'c' }) ?? model2.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      assertThrows(() => c2.setCoefficient?.(x1, 1), 'wrong-model setCoefficient should throw');
      return apiOnly({ c: c2.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.maximize(expr);
      assert(model.objective?.isMaximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.getQuadraticCoefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      model.maximizeLinearObjective?.(api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).add(1));
      assert(model.objective?.isMaximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective y coefficient removed');
      assert((model.objective?.quadraticTerms() ?? []).length === 0, 'quadratic terms should be empty');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize_linear_obj_type_error_quadratic',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      assertThrows(() => model.maximizeLinearObjective?.(api.MathOpt.multiplyLinearExpressions(x, x)), 'quadratic expression should fail for maximizeLinearObjective');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize_quadratic_objective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.setQuadraticObjective?.(expr, true);
      assert(model.objective?.isMaximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.getQuadraticCoefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      if (model.objective) model.objective.isMaximize = true;
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.minimize(expr);
      assert(model.objective?.isMaximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.getQuadraticCoefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      if (model.objective) model.objective.isMaximize = true;
      model.minimizeLinearObjective?.(api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).add(1));
      assert(model.objective?.isMaximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective y coefficient removed');
      assert((model.objective?.quadraticTerms() ?? []).length === 0, 'quadratic terms should be empty');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize_linear_obj_type_error_quadratic',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      assertThrows(() => model.minimizeLinearObjective?.(api.MathOpt.multiplyLinearExpressions(x, x)), 'quadratic expression should fail for minimizeLinearObjective');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize_quadratic_objective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      if (model.objective) model.objective.isMaximize = true;
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.setQuadraticObjective?.(expr, false);
      assert(model.objective?.isMaximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.getQuadraticCoefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_setObjective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.setObjective?.(expr, true);
      assert(model.objective?.isMaximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.getQuadraticCoefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_setObjective_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      if (model.objective) model.objective.isMaximize = true;
      model.setLinearObjective?.(api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).add(1), false);
      assert(model.objective?.isMaximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective y coefficient removed');
      assert((model.objective?.quadraticTerms() ?? []).length === 0, 'quadratic terms should be empty');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_setObjective_linear_obj_type_error_quadratic',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      assertThrows(() => model.setLinearObjective?.(api.MathOpt.multiplyLinearExpressions(x, x), true), 'quadratic expression should fail for setLinearObjective');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_setObjective_quadratic_objective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model();
      const x = model.addVariable?.() ?? model.addVariable();
      const y = model.addVariable?.() ?? model.addVariable();
      model.objective?.setLinearCoefficient(x, 10);
      model.objective?.setLinearCoefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.setQuadraticObjective?.(expr, true);
      assert(model.objective?.isMaximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.getLinearCoefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.getLinearCoefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.getQuadraticCoefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'LinearObjectiveTest/test_name',
    source: OBJECTIVES_SOURCE,
    async run(api) {
      const model = api.MathOpt.Model('test_objective');
      assert(model.objective?.name === '', 'primary objective default name should be empty');
      return apiOnly();
    },
  },
];

export async function runMathOptModelContractCases(
  api: MathOptApi,
  mode: 'direct' | 'worker' | 'server' = 'direct',
  threads = 1,
): Promise<MathOptModelCaseResult[]> {

  const results: MathOptModelCaseResult[] = [];
  for (const testCase of mathOptModelContractCases) {
    const runResult = await testCase.run(api, threads);
    results.push({
      name: testCase.name,
      source: testCase.source,
      mode,
      threads,
      ok: true,
      terminationReason: runResult.terminationReason,
      objectiveValue: runResult.objectiveValue ?? null,
      values: runResult.values,
    });
  }
  return results;
}
