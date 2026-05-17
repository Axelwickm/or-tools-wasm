import type { MathOptApi, MathOptCaseResult } from './mathopt_runner.ts';

const MODEL_SOURCE = 'ortools/math_opt/python/model_test.py';
const OBJECTIVE_SOURCE = 'ortools/math_opt/python/model_objective_test.py';
const OBJECTIVES_SOURCE = 'ortools/math_opt/python/objectives_test.py';

// TODO (API gaps):
// - Missing variable-level methods used by upstream tests:
//   add_integer_variable(), add_binary_variable(), get_variable(), variables(),
//   get_num_variables(), has_variable(), delete_variable(),
//   ensure_next_variable_id_at_least(), get_next_variable_id() etc. (model.py, model_element_test.py)
// - Missing linear-constraint-level methods:
//   get_linear_constraint(), linear_constraints(), get_num_linear_constraints(),
//   has_linear_constraint(), delete_linear_constraint(),
//   get_next_linear_constraint_id(), ensure_next_linear_constraint_id_at_least(),
//   set_coefficient(), get_coefficient(), terms(), as_bounded_linear_expression(),
//   row/column nonzeros, matrix entries.
//   (model.py, model_element_test.py, linear constraints section of model_test.py)
// - Missing objective-level APIs:
//   objective.clear(), objective.get/set_linear_coefficient(),
//   objective.get/set_quadratic_coefficient(), set_linear_objective(),
//   set_quadratic_objective(), set_to_expression(), etc.
//   (model_objective_test.py, objectives_test.py, linear objective API)

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

function failResult(name: string, source: string, mode: 'direct' | 'worker', threads: number, error: unknown): MathOptModelCaseResult {
  return {
    name,
    source,
    mode,
    threads,
    ok: false,
    terminationReason: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
    objectiveValue: null,
    values: {},
  };
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
      assert(v1.id === 0, `v1.id expected 0, got ${v1.id}`);
      assert(v2.id === 1, `v2.id expected 1, got ${v2.id}`);
      assert(v1.name === 'x', `v1.name expected "x", got ${v1.name}`);
      assert(v2.name === '', `v2.name expected default "", got ${v2.name}`);

      assert(v2.toString() === 'variable_1', `v2 string expected "variable_1", got ${String(v2)}`);
      assert(model.variables?.().length === 2, 'expected variables() to return two variables');
      assert(model.getVariable?.(0)?.id === v1.id, 'expected getVariable(0) to return v1');

      model.addLinearConstraint({
        upperBound: 2.5,
        terms: [{ variable: v1, coefficient: 1 }],
      });
      model.maximize([{ variable: v1, coefficient: 1 }]);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.CP_SAT, threads);
      assert(near(result.objectiveValue, 2), `ModelTest/test_add_and_read_variables expected objective 2, got ${result.objectiveValue}`);
      assert(near(result.variableValues.x, 2), `ModelTest/test_add_and_read_variables expected x=2, got ${result.variableValues.x}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
  {
    name: 'ModelTest/test_add_integer_variable',
    source: MODEL_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.addVariable({ lowerBound: -1, upperBound: 2.5, integer: true, name: 'x' });
      model.maximize([{ variable: x, coefficient: 1 }]);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.CP_SAT, threads);
      assert(near(result.variableValues.x, 2), `ModelTest/test_add_integer_variable expected x=2, got ${result.variableValues.x}`);
      assert(near(result.objectiveValue, 2), `ModelTest/test_add_integer_variable expected objective 2, got ${result.objectiveValue}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
  {
    name: 'ModelTest/test_add_binary_variable',
    source: MODEL_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
      model.maximize([{ variable: x, coefficient: 1 }]);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.CP_SAT, threads);
      assert(near(result.variableValues.x, 1), `ModelTest/test_add_binary_variable expected x=1, got ${result.variableValues.x}`);
      assert(near(result.objectiveValue, 1), `ModelTest/test_add_binary_variable expected objective 1, got ${result.objectiveValue}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
  {
    name: 'ModelTest/test_add_and_read_linear_constraints',
    source: MODEL_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_model');
      const x = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' });
      const y = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'y' });
      model.addLinearConstraint({ upperBound: 1, terms: [{ variable: x, coefficient: 1 }], name: 'c' });
      model.addLinearConstraint({ upperBound: 2, terms: [{ variable: y, coefficient: 1 }] });
      model.maximize([
        { variable: x, coefficient: 3 },
        { variable: y, coefficient: 2 },
      ]);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.GLOP, threads);
      assert(near(result.variableValues.x, 1), `ModelTest/test_add_and_read_linear_constraints expected x=1, got ${result.variableValues.x}`);
      assert(near(result.variableValues.y, 2), `ModelTest/test_add_and_read_linear_constraints expected y=2, got ${result.variableValues.y}`);
      assert(near(result.objectiveValue, 7), `ModelTest/test_add_and_read_linear_constraints expected objective 7, got ${result.objectiveValue}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
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
      assert(c.terms?.().length === 1, 'expected zero coefficient removed from c terms');
      assert(d.terms?.().length === 2, 'expected two d terms');
      return apiOnly({ c: c.id, d: d.id });
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_maximize_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
      // TODO: JS API does not expose objective.set_linear_coefficient() or explicit objective helpers.
      model.maximize([{ variable: x, coefficient: 2 }], 1);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.GLOP, threads);
      assert(near(result.objectiveValue, 3), `ModelSetObjectiveTest/test_maximize_linear_obj expected objective 3, got ${result.objectiveValue}`);
      assert(near(result.variableValues.x, 1), `ModelSetObjectiveTest/test_maximize_linear_obj expected x=1, got ${result.variableValues.x}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
  {
    name: 'ModelSetObjectiveTest/test_minimize_linear_obj',
    source: OBJECTIVE_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' });
      // TODO: JS API does not expose objective.set_to_expression() and objective offset accessors.
      model.minimize([{ variable: x, coefficient: 1 }], 5);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.GLOP, threads);
      assert(near(result.objectiveValue, 5), `ModelSetObjectiveTest/test_minimize_linear_obj expected objective 5, got ${result.objectiveValue}`);
      assert(near(result.variableValues.x, 0), `ModelSetObjectiveTest/test_minimize_linear_obj expected x=0, got ${result.variableValues.x}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
  {
    name: 'LinearObjectiveTest/test_name',
    source: OBJECTIVES_SOURCE,
    async run(api, threads) {
      await api.initMathOpt();
      const model = api.MathOpt.Model('test_objective');
      const x = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' });
      model.maximize([{ variable: x, coefficient: 1 }]);
      const result = await solveAndAssert(api, model, api.MathOpt.SolverType.GLOP, threads);
      assert(near(result.objectiveValue, 10), `LinearObjectiveTest/test_name expected objective 10, got ${result.objectiveValue}`);
      assert(near(result.variableValues.x, 10), `LinearObjectiveTest/test_name expected x=10, got ${result.variableValues.x}`);
      return {
        terminationReason: result.terminationReason,
        objectiveValue: result.objectiveValue,
        values: result.variableValues,
      };
    },
  },
];

export async function runMathOptModelContractCases(
  api: MathOptApi,
  mode: 'direct' | 'worker' = 'direct',
  threads = 1,
): Promise<MathOptModelCaseResult[]> {
  if (api.MathOpt.setWorkerBridgeEnabled) {
    api.MathOpt.setWorkerBridgeEnabled(mode === 'worker');
  }
  await api.initMathOpt();
  const results: MathOptModelCaseResult[] = [];
  for (const testCase of mathOptModelContractCases) {
    try {
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
    } catch (error) {
      results.push(failResult(testCase.name, testCase.source, mode, threads, error));
    }
  }
  return results;
}
