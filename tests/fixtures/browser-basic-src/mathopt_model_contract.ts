import type { MathOptApi, MathOptCaseResult } from './mathopt_runner.ts';

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
      await api.initMathOpt();
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
      await api.initMathOpt();
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
      await api.initMathOpt();
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
      assert(model.get_variable?.(1).id === v2.id, 'expected get_variable(1) to return v2');
      return apiOnly({ v1: v1.id, v2: v2.id });
    },
  },
  {
    name: 'ModelTest/test_add_integer_variable',
    source: MODEL_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_integer_variable?.({ lowerBound: -1, upperBound: 2.5, name: 'x' }) ?? model.addVariable({ lowerBound: -1, upperBound: 2.5, integer: true, name: 'x' });
      assertNear(x.lowerBound, -1, 'integer variable lowerBound');
      assertNear(x.upperBound, 2.5, 'integer variable upperBound');
      assert(x.integer === true, 'integer variable integer flag');
      assert(x.name === 'x', 'integer variable name');
      assert(x.id === 0, 'integer variable id');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelTest/test_add_binary_variable',
    source: MODEL_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
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
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      model.delete_variable?.(x);
      assertThrows(() => x.lowerBound, 'reading deleted variable lowerBound should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_update_deleted_variable',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      model.delete_variable?.(x);
      assertThrows(() => {
        x.upperBound = 2;
      }, 'updating deleted variable upperBound should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_add_and_read_linear_constraints',
    source: MODEL_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
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
      assertIds(model.linear_constraints?.(), [0, 1], 'linear_constraints()');
      assert(model.get_linear_constraint?.(0).id === c.id, 'get_linear_constraint(0)');
      assert(model.get_linear_constraint?.(1).id === d.id, 'get_linear_constraint(1)');
      return apiOnly({ c: c.id, d: d.id });
    },
  },
  {
    name: 'ModelElementTest/test_no_elements',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      assert(model.has_variable?.(0) === false, 'expected has_variable(0) false');
      assert(model.has_linear_constraint?.(0) === false, 'expected has_linear_constraint(0) false');
      assert(model.get_next_variable_id?.() === 0, 'expected next variable id 0');
      assert(model.get_next_linear_constraint_id?.() === 0, 'expected next linear constraint id 0');
      assert(model.get_num_variables?.() === 0, 'expected no variables');
      assert(model.get_num_linear_constraints?.() === 0, 'expected no linear constraints');
      assert(model.variables?.().length === 0, 'expected variables() empty');
      assert(model.linear_constraints?.().length === 0, 'expected linear_constraints() empty');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_add_element',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const v0 = model.add_variable?.();
      const v1 = model.add_variable?.();
      const v2 = model.add_variable?.();
      const c0 = model.add_linear_constraint?.();
      const c1 = model.add_linear_constraint?.();
      const c2 = model.add_linear_constraint?.();
      assert(v0 && v1 && v2 && c0 && c1 && c2, 'expected elements');
      assert(model.has_variable?.(0) === true && model.has_variable?.(3) === false, 'variable has checks');
      assert(model.has_linear_constraint?.(0) === true && model.has_linear_constraint?.(3) === false, 'constraint has checks');
      assert(model.get_next_variable_id?.() === 3, 'variable next id');
      assert(model.get_next_linear_constraint_id?.() === 3, 'constraint next id');
      assert(model.get_num_variables?.() === 3, 'variable count');
      assert(model.get_num_linear_constraints?.() === 3, 'constraint count');
      assertIds(model.variables?.(), [0, 1, 2], 'variables order');
      assertIds(model.linear_constraints?.(), [0, 1, 2], 'constraints order');
      assert(model.get_variable?.(1).id === v1.id, 'get variable 1');
      assert(model.get_linear_constraint?.(1).id === c1.id, 'get constraint 1');
      return apiOnly({ v0: v0.id, v1: v1.id, v2: v2.id, c0: c0.id, c1: c1.id, c2: c2.id });
    },
  },
  {
    name: 'ModelElementTest/test_delete_element',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const v0 = model.add_variable?.();
      const v1 = model.add_variable?.();
      const v2 = model.add_variable?.();
      const c0 = model.add_linear_constraint?.();
      const c1 = model.add_linear_constraint?.();
      const c2 = model.add_linear_constraint?.();
      assert(v0 && v1 && v2 && c0 && c1 && c2, 'expected elements');
      model.delete_variable?.(v1);
      model.delete_linear_constraint?.(c1);
      assert(model.has_variable?.(0) === true && model.has_variable?.(1) === false && model.has_variable?.(2) === true, 'variable has after delete');
      assert(model.has_linear_constraint?.(0) === true && model.has_linear_constraint?.(1) === false && model.has_linear_constraint?.(2) === true, 'constraint has after delete');
      assert(model.get_next_variable_id?.() === 3, 'variable next id after delete');
      assert(model.get_next_linear_constraint_id?.() === 3, 'constraint next id after delete');
      assert(model.get_num_variables?.() === 2, 'variable count after delete');
      assert(model.get_num_linear_constraints?.() === 2, 'constraint count after delete');
      assertIds(model.variables?.(), [0, 2], 'variables after delete');
      assertIds(model.linear_constraints?.(), [0, 2], 'constraints after delete');
      assert(model.get_variable?.(2).id === v2.id, 'get variable 2');
      assert(model.get_linear_constraint?.(2).id === c2.id, 'get constraint 2');
      return apiOnly({ v0: v0.id, v2: v2.id, c0: c0.id, c2: c2.id });
    },
  },
  {
    name: 'ModelElementTest/test_get_invalid_element',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      assertThrows(() => model.get_variable?.(0), 'get_variable(0) should throw');
      assertThrows(() => model.get_linear_constraint?.(0), 'get_linear_constraint(0) should throw');
      const badVariable = model.get_variable?.(0, { validate: false });
      const badConstraint = model.get_linear_constraint?.(0, { validate: false });
      assert(badVariable?.id === 0, 'validate=false variable id');
      assert(badConstraint?.id === 0, 'validate=false linear constraint id');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_delete_invalid_element_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const badVariable = model.get_variable?.(0, { validate: false });
      const badConstraint = model.get_linear_constraint?.(0, { validate: false });
      assert(badVariable && badConstraint, 'expected validate=false elements');
      assertThrows(() => model.delete_variable?.(badVariable), 'delete invalid variable should throw');
      assertThrows(() => model.delete_linear_constraint?.(badConstraint), 'delete invalid linear constraint should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_delete_element_twice_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const variable = model.add_variable?.();
      const constraint = model.add_linear_constraint?.();
      assert(variable && constraint, 'expected elements');
      model.delete_variable?.(variable);
      model.delete_linear_constraint?.(constraint);
      assertThrows(() => model.delete_variable?.(variable), 'delete variable twice should throw');
      assertThrows(() => model.delete_linear_constraint?.(constraint), 'delete linear constraint twice should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_delete_element_wrong_model_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model1 = api.MathOpt.Model();
      const model2 = api.MathOpt.Model();
      model1.add_variable?.();
      model1.add_linear_constraint?.();
      const variable2 = model2.add_variable?.();
      const constraint2 = model2.add_linear_constraint?.();
      assert(variable2 && constraint2, 'expected model2 elements');
      assertThrows(() => model1.delete_variable?.(variable2), 'delete wrong-model variable should throw');
      assertThrows(() => model1.delete_linear_constraint?.(constraint2), 'delete wrong-model linear constraint should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_get_deleted_element_error',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const variable = model.add_variable?.();
      const constraint = model.add_linear_constraint?.();
      assert(variable && constraint, 'expected elements');
      model.delete_variable?.(variable);
      model.delete_linear_constraint?.(constraint);
      assertThrows(() => model.get_variable?.(0), 'get deleted variable should throw');
      assertThrows(() => model.get_linear_constraint?.(0), 'get deleted linear constraint should throw');
      assert(model.get_variable?.(0, { validate: false }).id === 0, 'validate=false deleted variable');
      assert(model.get_linear_constraint?.(0, { validate: false }).id === 0, 'validate=false deleted linear constraint');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_ensure_next_id_with_effect',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      model.ensure_next_variable_id_at_least?.(6);
      model.ensure_next_linear_constraint_id_at_least?.(6);
      assert(model.get_next_variable_id?.() === 6, 'variable next id should be 6');
      assert(model.get_next_linear_constraint_id?.() === 6, 'linear constraint next id should be 6');
      assert(model.has_variable?.(0) === false && model.has_variable?.(6) === false, 'placeholder variable ids should not exist');
      assert(model.has_linear_constraint?.(0) === false && model.has_linear_constraint?.(6) === false, 'placeholder constraint ids should not exist');
      assert(model.get_num_variables?.() === 0, 'variable count should remain 0');
      assert(model.get_num_linear_constraints?.() === 0, 'constraint count should remain 0');
      const v6 = model.add_variable?.();
      const v7 = model.add_variable?.();
      const c6 = model.add_linear_constraint?.();
      const c7 = model.add_linear_constraint?.();
      assert(v6 && v7 && c6 && c7, 'expected elements after ensure');
      assertIds(model.variables?.(), [6, 7], 'variables after ensure');
      assertIds(model.linear_constraints?.(), [6, 7], 'constraints after ensure');
      assert(model.get_next_variable_id?.() === 8, 'variable next id should be 8');
      assert(model.get_next_linear_constraint_id?.() === 8, 'constraint next id should be 8');
      assert(model.get_variable?.(6).id === v6.id && model.get_variable?.(7).id === v7.id, 'get variables after ensure');
      assert(model.get_linear_constraint?.(6).id === c6.id && model.get_linear_constraint?.(7).id === c7.id, 'get constraints after ensure');
      return apiOnly({ v6: v6.id, v7: v7.id, c6: c6.id, c7: c7.id });
    },
  },
  {
    name: 'ModelElementTest/test_ensure_next_id_no_effect',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const v0 = model.add_variable?.();
      const v1 = model.add_variable?.();
      const v2 = model.add_variable?.();
      const c0 = model.add_linear_constraint?.();
      const c1 = model.add_linear_constraint?.();
      const c2 = model.add_linear_constraint?.();
      assert(v0 && v1 && v2 && c0 && c1 && c2, 'expected initial elements');
      model.ensure_next_variable_id_at_least?.(1);
      model.ensure_next_linear_constraint_id_at_least?.(1);
      assert(model.get_next_variable_id?.() === 3, 'variable next id should remain 3');
      assert(model.get_next_linear_constraint_id?.() === 3, 'constraint next id should remain 3');
      assertIds(model.variables?.(), [0, 1, 2], 'variables after no-effect ensure');
      assertIds(model.linear_constraints?.(), [0, 1, 2], 'constraints after no-effect ensure');
      return apiOnly({ v0: v0.id, v1: v1.id, v2: v2.id, c0: c0.id, c1: c1.id, c2: c2.id });
    },
  },
  {
    name: 'ModelElementTest/test_no_elements_variables',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      assert(model.has_variable?.(0) === false, 'expected has_variable(0) false');
      assert(model.get_next_variable_id?.() === 0, 'expected next variable id 0');
      assert(model.get_num_variables?.() === 0, 'expected no variables');
      assert(model.variables?.().length === 0, 'expected variables() empty');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_add_element_variables',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const e0 = model.add_variable?.();
      const e1 = model.add_variable?.();
      const e2 = model.add_variable?.();
      assert(e0 && e1 && e2, 'expected add_variable alias to exist');
      assert(model.has_variable?.(0) === true, 'expected variable 0');
      assert(model.has_variable?.(1) === true, 'expected variable 1');
      assert(model.has_variable?.(2) === true, 'expected variable 2');
      assert(model.has_variable?.(3) === false, 'expected no variable 3');
      assert(model.get_next_variable_id?.() === 3, 'expected next variable id 3');
      assert(model.get_num_variables?.() === 3, 'expected three variables');
      assert(model.variables?.().map((variable) => variable.id).join(',') === '0,1,2', 'expected variables in id order');
      assert(model.get_variable?.(1).id === e1.id, 'expected get_variable(1)');
      return apiOnly({ e0: e0.id, e1: e1.id, e2: e2.id });
    },
  },
  {
    name: 'ModelElementTest/test_delete_element_variables',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const e0 = model.add_variable?.();
      const e1 = model.add_variable?.();
      const e2 = model.add_variable?.();
      assert(e0 && e1 && e2 && model.delete_variable, 'expected variable element APIs');
      model.delete_variable(e1);
      assert(model.has_variable?.(0) === true, 'expected variable 0');
      assert(model.has_variable?.(1) === false, 'expected deleted variable 1');
      assert(model.has_variable?.(2) === true, 'expected variable 2');
      assert(model.get_next_variable_id?.() === 3, 'expected next id remains 3');
      assert(model.get_num_variables?.() === 2, 'expected two live variables');
      assert(model.variables?.().map((variable) => variable.id).join(',') === '0,2', 'expected live variables 0,2');
      return apiOnly({ e0: e0.id, e2: e2.id });
    },
  },
  {
    name: 'ModelElementTest/test_no_elements_linear_constraints',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      assert(model.has_linear_constraint?.(0) === false, 'expected has_linear_constraint(0) false');
      assert(model.get_next_linear_constraint_id?.() === 0, 'expected next linear constraint id 0');
      assert(model.get_num_linear_constraints?.() === 0, 'expected no linear constraints');
      assert(model.linear_constraints?.().length === 0, 'expected linear_constraints() empty');
      return apiOnly();
    },
  },
  {
    name: 'ModelElementTest/test_add_delete_linear_constraints',
    source: 'ortools/math_opt/python/model_element_test.py',
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const c0 = model.add_linear_constraint?.();
      const c1 = model.add_linear_constraint?.();
      const c2 = model.add_linear_constraint?.();
      assert(c0 && c1 && c2 && model.delete_linear_constraint, 'expected linear constraint element APIs');
      assert(model.has_linear_constraint?.(1) === true, 'expected linear constraint 1');
      assert(model.get_next_linear_constraint_id?.() === 3, 'expected next linear constraint id 3');
      assert(model.get_num_linear_constraints?.() === 3, 'expected three constraints');
      model.delete_linear_constraint(c1);
      assert(model.has_linear_constraint?.(1) === false, 'expected deleted linear constraint 1');
      assert(model.linear_constraints?.().map((constraint) => constraint.id).join(',') === '0,2', 'expected live constraints 0,2');
      return apiOnly({ c0: c0.id, c2: c2.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_as_bounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const c = model.add_linear_constraint?.({
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
      const bounded = c.as_bounded_linear_expression?.();
      assert(bounded !== undefined, 'expected as_bounded_linear_expression');
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
    name: 'ModelTest/test_read_deleted_linear_constraint',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const c = model.add_linear_constraint?.({ lowerBound: -1, upperBound: 2.5, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: -1, upperBound: 2.5, name: 'c' });
      model.delete_linear_constraint?.(c);
      assertThrows(() => c.name, 'reading deleted linear constraint name should throw');
      return apiOnly();
    },
  },
  {
    name: 'ModelTest/test_update_deleted_linear_constraint',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const c = model.add_linear_constraint?.({ lowerBound: -1, upperBound: 2.5, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: -1, upperBound: 2.5, name: 'c' });
      model.delete_linear_constraint?.(c);
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
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
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
    name: 'ModelTest/test_update_linear_constraint',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const c = model.add_linear_constraint?.({ lowerBound: -1, upperBound: 2.5, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: -1, upperBound: 2.5, name: 'c' });
      c.lowerBound = Number.NEGATIVE_INFINITY;
      c.upperBound = -3.0;
      assert(c.lowerBound === Number.NEGATIVE_INFINITY, 'expected updated lower bound');
      assert(c.upperBound === -3.0, 'expected updated upper bound');
      return apiOnly({ c: c.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_matrix',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const c = model.add_linear_constraint?.({ lowerBound: 0, upperBound: 1, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      const d = model.add_linear_constraint?.({ upperBound: 1, name: 'd' }) ?? model.addLinearConstraint({ upperBound: 1, name: 'd' });
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
      assertIds(model.column_nonzeros?.(x), [c.id, d.id], 'column_nonzeros(x)');
      assertIds(model.column_nonzeros?.(y), [], 'column_nonzeros(y)');
      assertIds(model.column_nonzeros?.(z), [d.id], 'column_nonzeros(z)');
      assertIds(model.row_nonzeros?.(c), [x.id], 'row_nonzeros(c)');
      assertIds(model.row_nonzeros?.(d), [x.id, z.id], 'row_nonzeros(d)');
      assert(c.terms?.().length === 1, 'expected zero coefficient removed from c terms');
      assert(d.terms?.().length === 2, 'expected two d terms');
      const entries = model.linear_constraint_matrix_entries?.() ?? [];
      const entryKeys = entries
        .map((entry) => `${(entry.linear_constraint ?? entry.linearConstraint)?.id}:${entry.variable.id}:${entry.coefficient}`)
        .sort()
        .join(',');
      assert(entryKeys === '0:0:1,1:0:2,1:2:-1', `unexpected matrix entries ${entryKeys}`);
      return apiOnly({ c: c.id, d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_expression',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const c = model.add_linear_constraint?.({ lowerBound: 0, expression: api.MathOpt.asFlatLinearExpression(x).add(1), upperBound: 1, name: 'c' })
        ?? model.addLinearConstraint({ lowerBound: 0, expression: api.MathOpt.asFlatLinearExpression(x).add(1), upperBound: 1, name: 'c' });
      assertNear(c.getCoefficient?.(x), 1, 'c x coefficient');
      assertNear(c.getCoefficient?.(y), 0, 'c y coefficient');
      assertNear(c.getCoefficient?.(z), 0, 'c z coefficient');
      assertNear(c.lowerBound, -1, 'c lowerBound');
      assertNear(c.upperBound, 0, 'c upperBound');
      const dExpr = api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).subtract(z);
      const d = model.add_linear_constraint?.({ upperBound: 1, expression: dExpr, name: 'd' })
        ?? model.addLinearConstraint({ upperBound: 1, expression: dExpr, name: 'd' });
      assertNear(d.getCoefficient?.(x), 2, 'd x coefficient');
      assertNear(d.getCoefficient?.(y), 0, 'd y coefficient');
      assertNear(d.getCoefficient?.(z), -1, 'd z coefficient');
      assertNear(d.lowerBound, Number.NEGATIVE_INFINITY, 'd lowerBound');
      assertNear(d.upperBound, 1, 'd upperBound');
      const e = model.add_linear_constraint?.({ lowerBound: 0 }) ?? model.addLinearConstraint({ lowerBound: 0 });
      assertNear(e.getCoefficient?.(x), 0, 'e x coefficient');
      assertNear(e.lowerBound, 0, 'e lowerBound');
      assertNear(e.upperBound, Number.POSITIVE_INFINITY, 'e upperBound');
      const f = model.add_linear_constraint?.({ expression: 1, upperBound: 2 }) ?? model.addLinearConstraint({ expression: 1, upperBound: 2 });
      assertNear(f.upperBound, 1, 'f upperBound');
      return apiOnly({ c: c.id, d: d.id, e: e.id, f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_bounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const bounded = api.MathOpt.completeUpperBound(api.MathOpt.le(0, api.MathOpt.asFlatLinearExpression(x).add(1)) as never, 1);
      const c = model.add_linear_constraint?.(bounded) ?? model.addLinearConstraint(bounded);
      assertNear(c.getCoefficient?.(x), 1, 'c x coefficient');
      assertNear(c.getCoefficient?.(y), 0, 'c y coefficient');
      assertNear(c.getCoefficient?.(z), 0, 'c z coefficient');
      assertNear(c.lowerBound, -1, 'c lowerBound');
      assertNear(c.upperBound, 0, 'c upperBound');
      return apiOnly({ c: c.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_upper_bounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expr = api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).subtract(z).add(2);
      const d = model.add_linear_constraint?.(api.MathOpt.le(expr, 1) as never) ?? model.addLinearConstraint(api.MathOpt.le(expr, 1) as never);
      assertNear(d.getCoefficient?.(x), 2, 'd x coefficient');
      assertNear(d.getCoefficient?.(y), 0, 'd y coefficient');
      assertNear(d.getCoefficient?.(z), -1, 'd z coefficient');
      assertNear(d.lowerBound, Number.NEGATIVE_INFINITY, 'd lowerBound');
      assertNear(d.upperBound, -1, 'd upperBound');
      return apiOnly({ d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_lower_bounded_expression',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expr = api.MathOpt.asFlatLinearExpression(x).add(y).add(2);
      const e = model.add_linear_constraint?.(api.MathOpt.ge(expr, 1) as never) ?? model.addLinearConstraint(api.MathOpt.ge(expr, 1) as never);
      assertNear(e.getCoefficient?.(x), 1, 'e x coefficient');
      assertNear(e.getCoefficient?.(y), 1, 'e y coefficient');
      assertNear(e.getCoefficient?.(z), 0, 'e z coefficient');
      assertNear(e.lowerBound, -1, 'e lowerBound');
      assertNear(e.upperBound, Number.POSITIVE_INFINITY, 'e upperBound');
      return apiOnly({ e: e.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_number_eq_expression',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const expr = api.MathOpt.asFlatLinearExpression(x).add(y).add(2);
      const f = model.add_linear_constraint?.(api.MathOpt.eq(1, expr) as never) ?? model.addLinearConstraint(api.MathOpt.eq(1, expr) as never);
      assertNear(f.getCoefficient?.(x), 1, 'f x coefficient');
      assertNear(f.getCoefficient?.(y), 1, 'f y coefficient');
      assertNear(f.getCoefficient?.(z), 0, 'f z coefficient');
      assertNear(f.lowerBound, -1, 'f lowerBound');
      assertNear(f.upperBound, -1, 'f upperBound');
      return apiOnly({ f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_expression_eq_expression',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const lhs = api.MathOpt.asFlatLinearExpression(1).subtract(x);
      const rhs = api.MathOpt.asFlatLinearExpression(y).add(2);
      const f = model.add_linear_constraint?.(api.MathOpt.eq(lhs, rhs) as never) ?? model.addLinearConstraint(api.MathOpt.eq(lhs, rhs) as never);
      assertNear(f.getCoefficient?.(x), -1, 'f x coefficient');
      assertNear(f.getCoefficient?.(y), -1, 'f y coefficient');
      assertNear(f.getCoefficient?.(z), 0, 'f z coefficient');
      assertNear(f.lowerBound, 1, 'f lowerBound');
      assertNear(f.upperBound, 1, 'f upperBound');
      return apiOnly({ f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_variable_eq_variable',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const z = model.add_binary_variable?.({ name: 'z' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'z' });
      const f = model.add_linear_constraint?.(api.MathOpt.eq(x, y) as never) ?? model.addLinearConstraint(api.MathOpt.eq(x, y) as never);
      assertNear(f.getCoefficient?.(x), 1, 'f x coefficient');
      assertNear(f.getCoefficient?.(y), -1, 'f y coefficient');
      assertNear(f.getCoefficient?.(z), 0, 'f z coefficient');
      assertNear(f.lowerBound, 0, 'f lowerBound');
      assertNear(f.upperBound, 0, 'f upperBound');
      return apiOnly({ f: f.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_errors_direct_api',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const addLinearConstraint = (input: unknown) => {
        return model.add_linear_constraint?.(input as never) ?? model.addLinearConstraint(input as never);
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
    name: 'ModelTest/test_linear_constraint_matrix_with_variable_deletion',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const c = model.add_linear_constraint?.({ lb: 0, ub: 1, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      const d = model.add_linear_constraint?.({ lb: 0, ub: 1, name: 'd' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'd' });
      c.set_coefficient?.(x, 1);
      c.set_coefficient?.(y, 2);
      d.set_coefficient?.(x, 1);
      model.delete_variable?.(x);
      const entries = model.linear_constraint_matrix_entries?.() ?? [];
      assert(entries.length === 1, `expected one matrix entry, got ${entries.length}`);
      const entry = entries[0];
      assert((entry.linear_constraint ?? entry.linearConstraint)?.id === c.id, 'matrix entry constraint should be c');
      assert(entry.variable.id === y.id, 'matrix entry variable should be y');
      assertNear(entry.coefficient, 2, 'matrix entry coefficient');
      assertIds(model.column_nonzeros?.(y), [c.id], 'column_nonzeros(y) after variable delete');
      assertIds(model.row_nonzeros?.(c), [y.id], 'row_nonzeros(c) after variable delete');
      assertIds(model.row_nonzeros?.(d), [], 'row_nonzeros(d) after variable delete');
      const cTerms = c.terms?.() ?? [];
      assert(cTerms.length === 1, `expected one c term, got ${cTerms.length}`);
      assert(cTerms[0].variable.id === y.id, 'c term variable should be y');
      assertNear(cTerms[0].coefficient, 2, 'c term coefficient');
      assert((d.terms?.() ?? []).length === 0, 'd terms should be empty');
      assertThrows(() => c.get_coefficient?.(x), 'get_coefficient(deleted x) should throw');
      return apiOnly({ c: c.id, d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_matrix_with_linear_constraint_deletion',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.add_binary_variable?.({ name: 'x' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const y = model.add_binary_variable?.({ name: 'y' }) ?? model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'y' });
      const c = model.add_linear_constraint?.({ lb: 0, ub: 1, name: 'c' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      const d = model.add_linear_constraint?.({ lb: 0, ub: 1, name: 'd' }) ?? model.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'd' });
      c.set_coefficient?.(x, 1);
      c.set_coefficient?.(y, 2);
      d.set_coefficient?.(x, 1);
      model.delete_linear_constraint?.(c);
      const entries = model.linear_constraint_matrix_entries?.() ?? [];
      assert(entries.length === 1, `expected one matrix entry, got ${entries.length}`);
      const entry = entries[0];
      assert((entry.linear_constraint ?? entry.linearConstraint)?.id === d.id, 'matrix entry constraint should be d');
      assert(entry.variable.id === x.id, 'matrix entry variable should be x');
      assertNear(entry.coefficient, 1, 'matrix entry coefficient');
      assertIds(model.column_nonzeros?.(x), [d.id], 'column_nonzeros(x) after constraint delete');
      assertIds(model.column_nonzeros?.(y), [], 'column_nonzeros(y) after constraint delete');
      const dTerms = d.terms?.() ?? [];
      assert(dTerms.length === 1, `expected one d term, got ${dTerms.length}`);
      assert(dTerms[0].variable.id === x.id, 'd term variable should be x');
      assertNear(dTerms[0].coefficient, 1, 'd term coefficient');
      return apiOnly({ d: d.id });
    },
  },
  {
    name: 'ModelTest/test_linear_constraint_matrix_wrong_model',
    source: MODEL_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model1 = api.MathOpt.Model('test_model1');
      const x1 = model1.add_binary_variable?.({ name: 'x' }) ?? model1.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const model2 = api.MathOpt.Model('test_model2');
      model2.add_binary_variable?.({ name: 'x' }) ?? model2.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      const c2 = model2.add_linear_constraint?.({ lb: 0, ub: 1, name: 'c' }) ?? model2.addLinearConstraint({ lowerBound: 0, upperBound: 1, name: 'c' });
      assertThrows(() => c2.set_coefficient?.(x1, 1), 'wrong-model set_coefficient should throw');
      return apiOnly({ c: c2.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.maximize(expr);
      assert(model.objective?.is_maximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.get_quadratic_coefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      model.maximize_linear_objective?.(api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).add(1));
      assert(model.objective?.is_maximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective y coefficient removed');
      assert((model.objective?.quadratic_terms() ?? []).length === 0, 'quadratic terms should be empty');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize_linear_obj_type_error_quadratic',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      assertThrows(() => model.maximize_linear_objective?.(api.MathOpt.multiplyLinearExpressions(x, x)), 'quadratic expression should fail for maximize_linear_objective');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize_quadratic_objective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.set_quadratic_objective?.(expr, true);
      assert(model.objective?.is_maximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.get_quadratic_coefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      if (model.objective) model.objective.is_maximize = true;
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.minimize(expr);
      assert(model.objective?.is_maximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.get_quadratic_coefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      if (model.objective) model.objective.is_maximize = true;
      model.minimize_linear_objective?.(api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).add(1));
      assert(model.objective?.is_maximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective y coefficient removed');
      assert((model.objective?.quadratic_terms() ?? []).length === 0, 'quadratic terms should be empty');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize_linear_obj_type_error_quadratic',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      assertThrows(() => model.minimize_linear_objective?.(api.MathOpt.multiplyLinearExpressions(x, x)), 'quadratic expression should fail for minimize_linear_objective');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize_quadratic_objective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      if (model.objective) model.objective.is_maximize = true;
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.set_quadratic_objective?.(expr, false);
      assert(model.objective?.is_maximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.get_quadratic_coefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_set_objective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.set_objective?.(expr, true);
      assert(model.objective?.is_maximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.get_quadratic_coefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_set_objective_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      if (model.objective) model.objective.is_maximize = true;
      model.set_linear_objective?.(api.MathOpt.asFlatLinearExpression(api.MathOpt.linearTerm(x, 2)).add(1), false);
      assert(model.objective?.is_maximize === false, 'objective should minimize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective y coefficient removed');
      assert((model.objective?.quadratic_terms() ?? []).length === 0, 'quadratic terms should be empty');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_set_objective_linear_obj_type_error_quadratic',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      assertThrows(() => model.set_linear_objective?.(api.MathOpt.multiplyLinearExpressions(x, x), true), 'quadratic expression should fail for set_linear_objective');
      return apiOnly({ x: x.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_set_objective_quadratic_objective',
    source: OBJECTIVE_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.add_variable?.() ?? model.addVariable();
      const y = model.add_variable?.() ?? model.addVariable();
      model.objective?.set_linear_coefficient(x, 10);
      model.objective?.set_linear_coefficient(y, 11);
      const expr = api.MathOpt.multiplyLinearExpressions(x, x).multiply(3).add(api.MathOpt.linearTerm(x, 2)).add(1);
      model.set_quadratic_objective?.(expr, true);
      assert(model.objective?.is_maximize === true, 'objective should maximize');
      assertNear(model.objective?.offset, 1, 'objective offset');
      assertNear(model.objective?.get_linear_coefficient(x), 2, 'objective x linear coefficient');
      assertNear(model.objective?.get_linear_coefficient(y), 0, 'objective old y coefficient removed');
      assertNear(model.objective?.get_quadratic_coefficient(x, x), 3, 'objective x*x quadratic coefficient');
      return apiOnly({ x: x.id, y: y.id });
    },
  },
  {
    name: 'LinearObjectiveTest/test_name',
    source: OBJECTIVES_SOURCE,
    async run(api) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_objective');
      assert(model.objective?.name === '', 'primary objective default name should be empty');
      return apiOnly();
    },
  },
];

export async function runMathOptModelContractCases(
  api: MathOptApi,
  mode: 'direct' | 'worker' = 'direct',
  threads = 1,
): Promise<MathOptModelCaseResult[]> {
  await api.initMathOpt();
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
