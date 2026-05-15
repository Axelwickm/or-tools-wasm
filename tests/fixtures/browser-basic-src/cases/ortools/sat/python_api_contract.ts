import type { CpSatCase, CpSatLike, SolverResponse } from '../../../cpsat_types.ts';
import {
  DecisionStrategyProto_DomainReductionStrategy,
  DecisionStrategyProto_VariableSelectionStrategy,
} from 'or-tools-wasm';

const INT64_MAX = { low: -1, high: 2147483647, unsigned: false };
const INT64_MIN = { low: 0, high: -2147483648, unsigned: false };
const LARGE_NEGATIVE_OBJECTIVE_BOUND = { low: -1717986918, high: -107374183, unsigned: false };
const LARGE_POSITIVE_OBJECTIVE_BOUND = { low: 1717986918, high: 107374182, unsigned: false };

const DEFAULT_SOLVE_PARAMS: Record<string, unknown> = {
  numSearchWorkers: 1,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertStatus(response: SolverResponse, expected: string, caseName: string) {
  assert(response?.status === expected, `${caseName} expected ${expected}, got ${String(response?.status)}`);
}

function assertSolutionCallbackStatus(response: SolverResponse, caseName: string) {
  assert(
    response?.status === 'FEASIBLE' || response?.status === 'OPTIMAL',
    `${caseName} expected FEASIBLE or OPTIMAL, got ${String(response?.status)}`,
  );
}

function assertNumber(value: unknown, expected: number, message: string) {
  assert(typeof value === 'number', `${message}: missing numeric value`);
  assert(value === expected, `${message}: expected ${expected}, got ${value}`);
}

function solutionValue(response: SolverResponse, index: number) {
  const value = response?.solution?.[index];
  assert(typeof value === 'number', `missing numeric solution value at index ${index}`);
  return value;
}

async function solveModel(CpSat: CpSatLike, testCase: CpSatCase, params: Record<string, unknown> = DEFAULT_SOLVE_PARAMS) {
  const modelBytes = await CpSat.createModel(testCase.model);
  const validation = await CpSat.validate(modelBytes);
  assert(validation.ok, `${testCase.name} validation failed: ${validation.message}`);
  const result = await CpSat.solve(modelBytes, params);
  assert(result.response, `${testCase.name} returned no solver response`);
  return result.response;
}

function helperSimpleSolveModel() {
  return {
    variables: [
      { domain: [-10, 10] },
      { domain: [-10, 10] },
      { domain: [LARGE_NEGATIVE_OBJECTIVE_BOUND, LARGE_POSITIVE_OBJECTIVE_BOUND] },
    ],
    constraints: [
      {
        linear: {
          vars: [0, 1],
          coeffs: [1, 1],
          domain: [INT64_MIN, INT64_MAX],
        },
      },
      {
        linear: {
          vars: [0, 1, 2],
          coeffs: [1, 2, -1],
          domain: [0, INT64_MAX],
        },
      },
    ],
    objective: {
      vars: [2],
      coeffs: [-1],
      scalingFactor: -1,
    },
  };
}

export const pythonApiContractCases: CpSatCase[] = [
  {
    name: 'CpModelHelperTest/test_simple_solve',
    source: 'ortools/sat/python/cp_model_helper_test.py',
    model: helperSimpleSolveModel(),
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assertNumber(response.objectiveValue, 30, `${this.name} objectiveValue`);
      return response.status;
    },
  },
  {
    name: 'CpModelHelperTest/test_simple_solve_with_core',
    source: 'ortools/sat/python/cp_model_helper_test.py',
    model: helperSimpleSolveModel(),
    async run(CpSat) {
      const response = await solveModel(CpSat, this, {
        ...DEFAULT_SOLVE_PARAMS,
        optimizeWithCore: true,
      });
      assertStatus(response, 'OPTIMAL', this.name);
      assertNumber(response.objectiveValue, 30, `${this.name} objectiveValue`);
      return response.status;
    },
  },
  {
    name: 'CpModelHelperTest/test_simple_solve_with_proto_api',
    source: 'ortools/sat/python/cp_model_helper_test.py',
    model: {
      variables: [
        { domain: [-10, 10] },
        { domain: [-10, 10] },
        { domain: [LARGE_NEGATIVE_OBJECTIVE_BOUND, LARGE_POSITIVE_OBJECTIVE_BOUND] },
      ],
      constraints: [
        {
          linear: {
            vars: [0, 1, 2],
            coeffs: [1, 2, -1],
            domain: [0, 0],
          },
        },
      ],
      objective: {
        vars: [2],
        coeffs: [-1],
        scalingFactor: -1,
      },
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assertNumber(response.objectiveValue, 30, `${this.name} objectiveValue`);
      assertNumber(response.bestObjectiveBound, 30, `${this.name} bestObjectiveBound`);
      return response.status;
    },
  },
  {
    name: 'CpModelHelperTest/test_solution_callback',
    source: 'ortools/sat/python/cp_model_helper_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 5] },
        { name: 'y', domain: [0, 5] },
      ],
      constraints: [
        {
          linear: {
            vars: [0, 1],
            coeffs: [1, 1],
            domain: [6, 6],
          },
        },
      ],
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      const caseName = this.name;
      let solutionCount = 0;
      const result = await CpSat.solve(
        modelBytes,
        {
          ...DEFAULT_SOLVE_PARAMS,
          enumerateAllSolutions: true,
        },
        {
          onSolution(response) {
            assertSolutionCallbackStatus(response, `${caseName} callback`);
            solutionCount++;
          },
        },
      );
      assert(result.response, `${this.name} returned no solver response`);
      assertStatus(result.response, 'OPTIMAL', this.name);
      assert(solutionCount === 5, `${this.name} expected 5 solution callbacks, got ${solutionCount}`);
      return result.response.status;
    },
  },
  {
    name: 'CpModelHelperTest/test_best_bound_callback',
    source: 'ortools/sat/python/cp_model_helper_test.py',
    model: {
      variables: [
        { domain: [0, 1] },
        { domain: [0, 1] },
        { domain: [0, 1] },
        { domain: [0, 1] },
      ],
      constraints: [{ boolOr: { literals: [0, 1, 2, 3] } }],
      objective: {
        vars: [0, 1, 2, 3],
        coeffs: [3, 2, 4, 5],
        offset: 0.6,
      },
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      let bestBound = 0;
      const result = await CpSat.solve(
        modelBytes,
        {
          ...DEFAULT_SOLVE_PARAMS,
          linearizationLevel: 2,
          logSearchProgress: true,
        },
        {
          onBestBound(bound) {
            bestBound = bound;
          },
        },
      );
      assert(result.response, `${this.name} returned no solver response`);
      assertStatus(result.response, 'OPTIMAL', this.name);
      assertNumber(bestBound, 2.6, `${this.name} callback bestBound`);
      return result.response.status;
    },
  },
  {
    name: 'CpModelTest/test_no_overlap_2d',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      name: 'test_no_overlap_2d',
      variables: [
        { domain: [0, 20] },
        { domain: [0, 20] },
        { domain: [5, 5] },
        { domain: [0, 20] },
        { domain: [0, 20] },
        { domain: [0, 20] },
        { domain: [0, 20] },
        { domain: [0, 20] },
        { domain: [0, 20] },
      ],
      constraints: [
        { interval: { start: { vars: [0], coeffs: [1] }, end: { vars: [1], coeffs: [1] }, size: { vars: [2], coeffs: [1] } } },
        { interval: { start: { vars: [3], coeffs: [1] }, end: { vars: [4], coeffs: [1] }, size: { vars: [2], coeffs: [1] } } },
        { interval: { start: { vars: [5], coeffs: [1] }, end: { vars: [6], coeffs: [1] }, size: { vars: [2], coeffs: [1] } } },
        { interval: { start: { vars: [7], coeffs: [1] }, end: { vars: [8], coeffs: [1] }, size: { vars: [2], coeffs: [1] } } },
        {
          noOverlap2d: {
            xIntervals: [0, 2],
            yIntervals: [1, 3],
          },
        },
      ],
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      assert(modelBytes.length > 0, `${this.name} expected encoded model bytes`);
      return 'MODEL_BUILT';
    },
  },
  {
    name: 'CpModelTest/test_all_different',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [0, 2] },
        { name: 'x1', domain: [0, 2] },
        { name: 'x2', domain: [0, 2] },
      ],
      constraints: [
        {
          allDiff: {
            exprs: [
              { vars: [0], coeffs: [1] },
              { vars: [1], coeffs: [1] },
              { vars: [2], coeffs: [1] },
            ],
          },
        },
        { linear: { vars: [0], coeffs: [1], domain: [0, 0] } },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      const values = [solutionValue(response, 0), solutionValue(response, 1), solutionValue(response, 2)];
      assert(new Set(values).size === 3, `${this.name} expected all values to be different`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_element',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'index', domain: [1, 1] },
        { name: 'target', domain: [0, 10] },
      ],
      constraints: [
        {
          element: {
            linearIndex: { vars: [0], coeffs: [1] },
            exprs: [{ offset: 4 }, { offset: 7 }, { offset: 9 }],
            linearTarget: { vars: [1], coeffs: [1] },
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 1) === 7, `${this.name} expected target = 7`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_allowed_assignments',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 2] },
        { name: 'y', domain: [0, 2] },
      ],
      constraints: [
        {
          table: {
            exprs: [
              { vars: [0], coeffs: [1] },
              { vars: [1], coeffs: [1] },
            ],
            values: [0, 1, 2, 2],
          },
        },
        { linear: { vars: [0], coeffs: [1], domain: [0, 0] } },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 1) === 1, `${this.name} expected y = 1`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_forbidden_assignments',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 1] },
        { name: 'y', domain: [0, 1] },
      ],
      constraints: [
        {
          table: {
            exprs: [
              { vars: [0], coeffs: [1] },
              { vars: [1], coeffs: [1] },
            ],
            values: [0, 0, 1, 1],
            negated: true,
          },
        },
        { linear: { vars: [0], coeffs: [1], domain: [0, 0] } },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 1) === 1, `${this.name} expected y = 1`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_automaton',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [0, 0] },
        { name: 'x1', domain: [1, 1] },
        { name: 'x2', domain: [2, 2] },
      ],
      constraints: [
        {
          automaton: {
            exprs: [
              { vars: [0], coeffs: [1] },
              { vars: [1], coeffs: [1] },
              { vars: [2], coeffs: [1] },
            ],
            startingState: 0,
            finalStates: [3],
            transitionTail: [0, 1, 2],
            transitionLabel: [0, 1, 2],
            transitionHead: [1, 2, 3],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_inverse',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'f0', domain: [2, 2] },
        { name: 'f1', domain: [0, 0] },
        { name: 'f2', domain: [1, 1] },
        { name: 'g0', domain: [0, 2] },
        { name: 'g1', domain: [0, 2] },
        { name: 'g2', domain: [0, 2] },
      ],
      constraints: [
        {
          inverse: {
            fDirect: [0, 1, 2],
            fInverse: [3, 4, 5],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 3) === 1, `${this.name} expected g0 = 1`);
      assert(solutionValue(response, 4) === 2, `${this.name} expected g1 = 2`);
      assert(solutionValue(response, 5) === 0, `${this.name} expected g2 = 0`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_circuit',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'arc_0_1', domain: [1, 1] },
        { name: 'arc_1_2', domain: [1, 1] },
        { name: 'arc_2_0', domain: [1, 1] },
      ],
      constraints: [
        {
          circuit: {
            tails: [0, 1, 2],
            heads: [1, 2, 0],
            literals: [0, 1, 2],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_multiple_circuit',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'arc_0_1', domain: [1, 1] },
        { name: 'arc_1_2', domain: [1, 1] },
        { name: 'arc_2_0', domain: [1, 1] },
      ],
      constraints: [
        {
          routes: {
            tails: [0, 1, 2],
            heads: [1, 2, 0],
            literals: [0, 1, 2],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_implication',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [1, 1] },
        { name: 'y', domain: [0, 1] },
      ],
      constraints: [
        {
          enforcementLiteral: [0],
          boolAnd: {
            literals: [1],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 1) === 1, `${this.name} expected y = 1`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_bool_or',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [0, 0] },
        { name: 'x1', domain: [0, 0] },
        { name: 'x2', domain: [0, 1] },
      ],
      constraints: [{ boolOr: { literals: [0, 1, 2] } }],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 2) === 1, `${this.name} expected x2 = 1`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_at_most_one',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [1, 1] },
        { name: 'x1', domain: [0, 1] },
        { name: 'x2', domain: [0, 1] },
      ],
      constraints: [{ atMostOne: { literals: [0, 1, 2] } }],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 1) === 0, `${this.name} expected x1 = 0`);
      assert(solutionValue(response, 2) === 0, `${this.name} expected x2 = 0`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_exactly_one',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [0, 1] },
        { name: 'x1', domain: [0, 1] },
        { name: 'x2', domain: [0, 1] },
      ],
      constraints: [{ exactlyOne: { literals: [0, 1, 2] } }],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      const total = solutionValue(response, 0) + solutionValue(response, 1) + solutionValue(response, 2);
      assert(total === 1, `${this.name} expected exactly one true literal`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_bool_and',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [0, 1] },
        { name: 'x1', domain: [0, 1] },
      ],
      constraints: [{ boolAnd: { literals: [0, 1] } }],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 1, `${this.name} expected x0 = 1`);
      assert(solutionValue(response, 1) === 1, `${this.name} expected x1 = 1`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_bool_x_or',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [1, 1] },
        { name: 'x1', domain: [0, 0] },
        { name: 'x2', domain: [0, 1] },
      ],
      constraints: [{ boolXor: { literals: [0, 1, 2] } }],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 2) === 0, `${this.name} expected x2 = 0`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_max_equality',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 10] },
        { name: 'y', domain: [2, 2] },
        { name: 'z', domain: [5, 5] },
      ],
      constraints: [
        {
          linMax: {
            target: { vars: [0], coeffs: [1] },
            exprs: [{ vars: [1], coeffs: [1] }, { vars: [2], coeffs: [1] }],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 5, `${this.name} expected x = 5`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_min_equality',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 10] },
        { name: 'y', domain: [2, 2] },
        { name: 'z', domain: [5, 5] },
      ],
      constraints: [
        {
          linMax: {
            target: { vars: [0], coeffs: [-1] },
            exprs: [{ vars: [1], coeffs: [-1] }, { vars: [2], coeffs: [-1] }],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 2, `${this.name} expected x = 2`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_abs',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 10] },
        { name: 'y', domain: [-3, -3] },
      ],
      constraints: [
        {
          linMax: {
            target: { vars: [0], coeffs: [1] },
            exprs: [{ vars: [1], coeffs: [1] }, { vars: [1], coeffs: [-1] }],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 3, `${this.name} expected x = 3`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_division',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 10] },
        { name: 'y', domain: [14, 14] },
      ],
      constraints: [
        {
          intDiv: {
            target: { vars: [0], coeffs: [1] },
            exprs: [{ vars: [1], coeffs: [1] }, { offset: 6 }],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 2, `${this.name} expected x = 2`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_multiplication_equality',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 20] },
        { name: 'y', domain: [3, 3] },
        { name: 'z', domain: [4, 4] },
      ],
      constraints: [
        {
          intProd: {
            target: { vars: [0], coeffs: [1] },
            exprs: [{ vars: [1], coeffs: [1] }, { vars: [2], coeffs: [1] }],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 12, `${this.name} expected x = 12`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_interval',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'start', domain: [0, 0] },
        { name: 'end', domain: [3, 3] },
      ],
      constraints: [
        { interval: { start: { vars: [0], coeffs: [1] }, size: { offset: 3 }, end: { vars: [1], coeffs: [1] } } },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_optional_interval',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'present', domain: [0, 0] },
        { name: 'start', domain: [0, 0] },
        { name: 'end', domain: [1, 1] },
      ],
      constraints: [
        {
          enforcementLiteral: [0],
          interval: { start: { vars: [1], coeffs: [1] }, size: { offset: 3 }, end: { vars: [2], coeffs: [1] } },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_no_overlap',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'start_a', domain: [0, 0] },
        { name: 'end_a', domain: [2, 2] },
        { name: 'start_b', domain: [2, 2] },
        { name: 'end_b', domain: [4, 4] },
      ],
      constraints: [
        { interval: { start: { vars: [0], coeffs: [1] }, size: { offset: 2 }, end: { vars: [1], coeffs: [1] } } },
        { interval: { start: { vars: [2], coeffs: [1] }, size: { offset: 2 }, end: { vars: [3], coeffs: [1] } } },
        { noOverlap: { intervals: [0, 1] } },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_cumulative',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'start_a', domain: [0, 0] },
        { name: 'end_a', domain: [5, 5] },
        { name: 'start_b', domain: [0, 0] },
        { name: 'end_b', domain: [5, 5] },
      ],
      constraints: [
        { interval: { start: { vars: [0], coeffs: [1] }, size: { offset: 5 }, end: { vars: [1], coeffs: [1] } } },
        { interval: { start: { vars: [2], coeffs: [1] }, size: { offset: 5 }, end: { vars: [3], coeffs: [1] } } },
        {
          cumulative: {
            intervals: [0, 1],
            demands: [{ offset: 1 }, { offset: 1 }],
            capacity: { offset: 2 },
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_assumptions',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 1] },
        { name: 'y', domain: [0, 1] },
        { name: 'z', domain: [0, 1] },
      ],
      assumptions: [0, -2, 2],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 1, `${this.name} expected x = true`);
      assert(solutionValue(response, 1) === 0, `${this.name} expected y = false`);
      assert(solutionValue(response, 2) === 1, `${this.name} expected z = true`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_has_objective_minimize',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 1] },
        { name: 'y', domain: [-10, 10] },
      ],
      constraints: [{ linear: { vars: [0, 1], coeffs: [1, 2], domain: [0, 10] } }],
      objective: { vars: [1], coeffs: [1] },
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assertNumber(response.objectiveValue, 0, `${this.name} objectiveValue`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_has_objective_maximize',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 1] },
        { name: 'y', domain: [-10, 10] },
      ],
      constraints: [{ linear: { vars: [0, 1], coeffs: [1, 2], domain: [0, 10] } }],
      objective: { vars: [1], coeffs: [-1], scalingFactor: -1 },
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assertNumber(response.objectiveValue, 5, `${this.name} objectiveValue`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_boolean_value',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 1] },
        { name: 'y', domain: [0, 1] },
        { name: 'z', domain: [0, 1] },
      ],
      constraints: [
        { boolOr: { literals: [0, -3] } },
        { boolOr: { literals: [0, 2] } },
        { boolOr: { literals: [-1, -2] } },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 1, `${this.name} expected x = true`);
      assert(solutionValue(response, 1) === 0, `${this.name} expected y = false`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_solution_hinting',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 5] },
        { name: 'y', domain: [0, 5] },
      ],
      constraints: [{ linear: { vars: [0, 1], coeffs: [1, 1], domain: [6, 6] } }],
      solutionHint: {
        vars: [0, 1],
        values: [2, 4],
      },
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this, {
        ...DEFAULT_SOLVE_PARAMS,
        cpModelPresolve: false,
      });
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 2, `${this.name} expected x = 2`);
      assert(solutionValue(response, 1) === 4, `${this.name} expected y = 4`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_stats',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {},
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(typeof response.wallTime === 'number' && response.wallTime >= 0, `${this.name} expected wallTime`);
      assert(response.numBooleans === 0, `${this.name} expected numBooleans = 0`);
      assert(response.numConflicts === 0, `${this.name} expected numConflicts = 0`);
      assert(response.numBranches === 0, `${this.name} expected numBranches = 0`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_search_strategy',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 5] },
        { name: 'y', domain: [0, 5] },
        { name: 'z', domain: [0, 1] },
      ],
      searchStrategy: [
        {
          exprs: [
            { vars: [1], coeffs: [1] },
            { vars: [0], coeffs: [1] },
            { vars: [2], coeffs: [-1], offset: 1 },
          ],
          variableSelectionStrategy: DecisionStrategyProto_VariableSelectionStrategy.CHOOSE_MIN_DOMAIN_SIZE,
          domainReductionStrategy: DecisionStrategyProto_DomainReductionStrategy.SELECT_MAX_VALUE,
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_log_to_response',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [-10, 10] },
        { name: 'y', domain: [-10, 10] },
      ],
      constraints: [{ linear: { vars: [0, 1], coeffs: [1, 2], domain: [0, 10] } }],
      objective: { vars: [1], coeffs: [1] },
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      const logLines: string[] = [];
      const result = await CpSat.solve(
        modelBytes,
        {
          ...DEFAULT_SOLVE_PARAMS,
          logSearchProgress: true,
          logToStdout: false,
          logToResponse: true,
        },
        {
          onLog(message) {
            logLines.push(message);
          },
        },
      );
      assert(result.response, `${this.name} returned no solver response`);
      const response = result.response;
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 10, `${this.name} expected x = 10`);
      assert(solutionValue(response, 1) === -5, `${this.name} expected y = -5`);
      assert(typeof response.solveLog === 'string', `${this.name} expected solveLog`);
      assert(response.solveLog.includes('Starting CP-SAT solver'), `${this.name} expected solveLog to contain startup line`);
      assert(logLines.some((line) => line.includes('Starting CP-SAT solver')), `${this.name} expected log callback`);
      return response.status;
    },
  },
  {
    name: 'CpModelTest/test_solve_with_solution_callback',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, 5] },
        { name: 'y', domain: [0, 5] },
      ],
      constraints: [{ linear: { vars: [0, 1], coeffs: [1, 1], domain: [6, 6] } }],
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      const seen: number[] = [];
      const result = await CpSat.solve(
        modelBytes,
        {
          ...DEFAULT_SOLVE_PARAMS,
          enumerateAllSolutions: true,
        },
        {
          onSolution(response) {
            seen.push(solutionValue(response, 0));
          },
        },
      );
      assert(result.response, `${this.name} returned no solver response`);
      assertStatus(result.response, 'OPTIMAL', this.name);
      assert(seen.length === 5, `${this.name} expected 5 solution callbacks, got ${seen.length}`);
      return result.response.status;
    },
  },
  {
    name: 'CpModelTest/test_best_bound_callback',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { domain: [0, 1] },
        { domain: [0, 1] },
        { domain: [0, 1] },
        { domain: [0, 1] },
      ],
      constraints: [{ boolOr: { literals: [0, 1, 2, 3] } }],
      objective: {
        vars: [0, 1, 2, 3],
        coeffs: [3, 2, 4, 5],
        offset: 0.6,
      },
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      let bestBound = 0;
      const result = await CpSat.solve(
        modelBytes,
        {
          ...DEFAULT_SOLVE_PARAMS,
          linearizationLevel: 2,
          logSearchProgress: true,
        },
        {
          onBestBound(bound) {
            bestBound = bound;
          },
        },
      );
      assert(result.response, `${this.name} returned no solver response`);
      assertStatus(result.response, 'OPTIMAL', this.name);
      assertNumber(bestBound, 2.6, `${this.name} callback bestBound`);
      return result.response.status;
    },
  },
  {
    name: 'CpModelTest/test_model_error',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x0', domain: [0, -2] },
      ],
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      const result = await CpSat.solve(modelBytes, {
        ...DEFAULT_SOLVE_PARAMS,
        logSearchProgress: true,
      });
      assert(result.response, `${this.name} returned no solver response`);
      assertStatus(result.response, 'MODEL_INVALID', this.name);
      return result.response.status;
    },
  },
  {
    name: 'CpModelTest/test_validate_model_with_overflow',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [0, INT64_MAX] },
        { name: 'y', domain: [0, 10] },
      ],
      constraints: [
        {
          linear: {
            vars: [0, 1],
            coeffs: [1, 1],
            domain: [6, INT64_MAX],
          },
        },
      ],
      objective: {
        vars: [0, 1],
        coeffs: [1, 2],
      },
    },
    async run(CpSat) {
      const modelBytes = await CpSat.createModel(this.model);
      const validation = await CpSat.validate(modelBytes);
      assert(!validation.ok, `${this.name} expected validation to reject the overflowing model`);
      return 'MODEL_INVALID';
    },
  },
  {
    name: 'CpModelTest/test_value',
    source: 'ortools/sat/python/cp_model_test.py',
    model: {
      variables: [
        { name: 'x', domain: [2, 2] },
        { name: 'y', domain: [3, 3] },
      ],
      constraints: [
        {
          linear: {
            vars: [0, 1],
            coeffs: [1, 1],
            domain: [5, 5],
          },
        },
      ],
    },
    async run(CpSat) {
      const response = await solveModel(CpSat, this);
      assertStatus(response, 'OPTIMAL', this.name);
      assert(solutionValue(response, 0) === 2, `${this.name} expected x = 2`);
      assert(solutionValue(response, 1) === 3, `${this.name} expected y = 3`);
      return response.status;
    },
  },
];
