import * as protobufModule from 'protobufjs';

const protobuf = (
  (protobufModule as unknown as { default?: typeof protobufModule }).default ??
  protobufModule
);

type PdlpApi = {
  initPdlp(): Promise<void>;
  Pdlp: {
    QuadraticProgram: new (input?: Record<string, unknown>) => QuadraticProgramLike;
    PrimalAndDualSolution: new (input?: Record<string, unknown>) => PrimalAndDualSolutionLike;
    validate_quadratic_program_dimensions(qp: QuadraticProgramLike): Promise<void>;
    is_linear_program(qp: QuadraticProgramLike): Promise<boolean>;
    qp_from_mpmodel_proto(proto: Uint8Array, relaxIntegerVariables?: boolean, includeNames?: boolean): Promise<QuadraticProgramLike>;
    qp_to_mpmodel_proto(qp: QuadraticProgramLike): Promise<Uint8Array>;
    primal_dual_hybrid_gradient(qp: QuadraticProgramLike, params?: PdlpParams, initialSolution?: PrimalAndDualSolutionLike): Promise<PdlpResultLike>;
  };
  MPSolver: {
    getLinearSolverSchemas(): Promise<{ linear_solver: string; optional_boolean: string }>;
  };
  setWorkerBridgeEnabled?: (enabled: boolean) => void;
};

type QuadraticProgramLike = {
  resize_and_initialize(numVariables: number, numConstraints: number): void;
  set_objective_matrix_diagonal(values: number[]): void;
  objective_vector: number[];
  constraint_matrix: { dense?: number[][]; entries?: Array<{ row: number; column: number; value: number }> } | number[][];
  constraint_lower_bounds: number[];
  constraint_upper_bounds: number[];
  variable_lower_bounds: number[];
  variable_upper_bounds: number[];
  variable_names: string[];
  objective_offset: number;
};

type PrimalAndDualSolutionLike = {
  primal_solution: number[];
  dual_solution: number[];
};

type PdlpParams = {
  termination_criteria?: {
    iteration_limit?: number;
    simple_optimality_criteria?: {
      eps_optimal_relative?: number;
      eps_optimal_absolute?: number;
    };
  };
  termination_check_frequency?: number;
  l_inf_ruiz_iterations?: number;
  l2_norm_rescaling?: boolean;
};

type PdlpResultLike = {
  primal_solution: number[];
  dual_solution: number[];
  reduced_costs: number[];
  solve_log: {
    termination_reason: string;
    iteration_count: number;
  };
};

export type PdlpCaseResult = {
  name: string;
  mode: 'direct' | 'worker';
  ok: boolean;
};

type ProtobufRoot = import('protobufjs').Root;

let linearSolverRootPromise: Promise<ProtobufRoot> | null = null;

async function resolveLinearSolverRoot(api: PdlpApi): Promise<ProtobufRoot> {
  linearSolverRootPromise ??= (async () => {
    const schemas = await api.MPSolver.getLinearSolverSchemas();
    const optionalRoot = protobuf.parse(schemas.optional_boolean).root;
    const linearSolverSource = schemas.linear_solver.replace(/^import "ortools\/util\/optional_boolean\.proto";\s*$/m, '');
    return protobuf.parse(linearSolverSource, optionalRoot).root;
  })();
  return linearSolverRootPromise;
}

async function encodeMPModelProto(api: PdlpApi, value: Record<string, unknown>): Promise<Uint8Array> {
  const root = await resolveLinearSolverRoot(api);
  const type = root.lookupType('operations_research.MPModelProto');
  const message = type.create(value);
  return type.encode(message).finish();
}

async function decodeMPModelProto(api: PdlpApi, bytes: Uint8Array): Promise<Record<string, unknown>> {
  const root = await resolveLinearSolverRoot(api);
  const type = root.lookupType('operations_research.MPModelProto');
  return type.toObject(type.decode(bytes), {
    defaults: true,
    arrays: true,
    longs: Number,
    enums: String,
  }) as Record<string, unknown>;
}

function smallProtoLp(): Record<string, unknown> {
  return {
    maximize: false,
    objectiveOffset: 0,
    variable: [
      { lowerBound: 0, upperBound: Infinity, objectiveCoefficient: 0, name: 'x' },
      { lowerBound: 0, upperBound: Infinity, objectiveCoefficient: -2, name: 'y' },
    ],
    constraint: [
      { varIndex: [0, 1], coefficient: [1, 1], lowerBound: -Infinity, upperBound: 1 },
    ],
  };
}

function smallProtoQp(): Record<string, unknown> {
  return {
    maximize: false,
    objectiveOffset: 0,
    variable: [
      { lowerBound: 0, upperBound: Infinity, objectiveCoefficient: 0, name: 'x' },
      { lowerBound: 0, upperBound: Infinity, objectiveCoefficient: 0, name: 'y' },
    ],
    constraint: [
      { varIndex: [0, 1], coefficient: [1, 1], lowerBound: -Infinity, upperBound: 1 },
    ],
    quadraticObjective: {
      qvar1Index: [0],
      qvar2Index: [0],
      coefficient: [2],
    },
  };
}

function tinyLp(api: PdlpApi): QuadraticProgramLike {
  const qp = new api.Pdlp.QuadraticProgram();
  qp.objective_offset = -14;
  qp.objective_vector = [5, 2, 1, 1];
  qp.constraint_lower_bounds = [12, 7, 1];
  qp.constraint_upper_bounds = [12, Infinity, Infinity];
  qp.variable_lower_bounds = [0, 0, 0, 0];
  qp.variable_upper_bounds = [2, 4, 6, 3];
  qp.constraint_matrix = {
    dense: [
      [2, 1, 1, 2],
      [1, 0, 1, 0],
      [0, 0, 1, -1],
    ],
  };
  return qp;
}

function smallLp(api: PdlpApi): QuadraticProgramLike {
  const qp = new api.Pdlp.QuadraticProgram();
  qp.objective_offset = -14;
  qp.objective_vector = [5.5, -2, -1, 1];
  qp.constraint_lower_bounds = [12, -Infinity, -4, -1];
  qp.constraint_upper_bounds = [12, 7, Infinity, 1];
  qp.variable_lower_bounds = [-Infinity, -2, -Infinity, 2.5];
  qp.variable_upper_bounds = [Infinity, Infinity, 6, 3.5];
  qp.constraint_matrix = {
    dense: [
      [2, 1, 1, 2],
      [1, 0, 1, 0],
      [4, 0, 0, 0],
      [0, 0, 1.5, -1],
    ],
  };
  return qp;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertSameElements(actual: number[], expected: number[], message: string): void {
  assert(actual.length === expected.length, `${message}: length ${actual.length} !== ${expected.length}`);
  for (const value of expected) {
    assert(actual.some((candidate) => Object.is(candidate, value) || Math.abs(candidate - value) <= 1e-9), `${message}: missing ${value} in ${actual}`);
  }
}

function assertSequenceAlmostEqual(actual: number[], expected: number[], message: string): void {
  assert(actual.length === expected.length, `${message}: length ${actual.length} !== ${expected.length}`);
  actual.forEach((value, index) => {
    assert(Math.abs(value - expected[index]) <= 1e-6, `${message}[${index}]: ${value} !== ${expected[index]}`);
  });
}

function assertProtoLp(proto: Record<string, unknown>, objectiveCoefficients = [0, -2]): void {
  const variables = proto.variable as Array<Record<string, unknown>>;
  const constraints = proto.constraint as Array<Record<string, unknown>>;
  assert(variables.length === 2, 'small_proto_lp: expected 2 variables');
  assert(constraints.length === 1, 'small_proto_lp: expected 1 constraint');
  assert(variables[0].name === 'x', 'small_proto_lp: expected variable x');
  assert(variables[1].name === 'y', 'small_proto_lp: expected variable y');
  assert(variables[0].objectiveCoefficient === objectiveCoefficients[0], `small_proto_lp: expected objective coefficient ${objectiveCoefficients[0]}`);
  assert(variables[1].objectiveCoefficient === objectiveCoefficients[1], `small_proto_lp: expected objective coefficient ${objectiveCoefficients[1]}`);
  assert((constraints[0].coefficient as number[]).join(',') === '1,1', 'small_proto_lp: expected coefficients [1, 1]');
}

function assertProtoQp(proto: Record<string, unknown>): void {
  assertProtoLp(
    {
      ...proto,
      variable: (proto.variable as unknown[]).map((variable) => ({
        ...(variable as Record<string, unknown>),
        objectiveCoefficient: (variable as Record<string, unknown>).objectiveCoefficient ?? 0,
      })),
    },
    [0, 0],
  );
  const quadraticObjective = proto.quadraticObjective as Record<string, unknown>;
  assert((quadraticObjective.qvar1Index as number[]).join(',') === '0', 'small_proto_qp: qvar1Index');
  assert((quadraticObjective.qvar2Index as number[]).join(',') === '0', 'small_proto_qp: qvar2Index');
  assert((quadraticObjective.coefficient as number[]).join(',') === '2', 'small_proto_qp: coefficient');
}

type PdlpCase = {
  name: string;
  run(api: PdlpApi): Promise<void>;
};

const pdlpCases: PdlpCase[] = [
  {
    name: 'QuadraticProgramTest.test_validate_quadratic_program_dimensions_for_empty_qp',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.resize_and_initialize(3, 2);
      await api.Pdlp.validate_quadratic_program_dimensions(qp);
      assert(await api.Pdlp.is_linear_program(qp), 'expected empty QP to be linear');
    },
  },
  {
    name: 'QuadraticProgramTest.test_converts_from_tiny_mpmodel_lp',
    async run(api) {
      const qp = await api.Pdlp.qp_from_mpmodel_proto(await encodeMPModelProto(api, smallProtoLp()), false);
      await api.Pdlp.validate_quadratic_program_dimensions(qp);
      assert(await api.Pdlp.is_linear_program(qp), 'expected LP to be linear');
      assertSameElements(qp.objective_vector, [0, -2], 'objective_vector');
    },
  },
  {
    name: 'QuadraticProgramTest.test_converts_from_tiny_mpmodel_qp',
    async run(api) {
      const qp = await api.Pdlp.qp_from_mpmodel_proto(await encodeMPModelProto(api, smallProtoQp()), false);
      await api.Pdlp.validate_quadratic_program_dimensions(qp);
      assert(!(await api.Pdlp.is_linear_program(qp)), 'expected QP not to be linear');
      assertSameElements(qp.objective_vector, [0, 0], 'objective_vector');
    },
  },
  {
    name: 'QuadraticProgramTest.test_build_lp',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.objective_vector = [0, -2];
      qp.constraint_matrix = { dense: [[1, 1]] };
      qp.constraint_lower_bounds = [-Infinity];
      qp.constraint_upper_bounds = [1];
      qp.variable_lower_bounds = [0, 0];
      qp.variable_upper_bounds = [Infinity, Infinity];
      qp.variable_names = ['x', 'y'];
      assertProtoLp(await decodeMPModelProto(api, await api.Pdlp.qp_to_mpmodel_proto(qp)));
    },
  },
  {
    name: 'QuadraticProgramTest.test_build_qp',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.objective_vector = [0, 0];
      qp.constraint_matrix = { dense: [[1, 1]] };
      qp.set_objective_matrix_diagonal([4]);
      qp.constraint_lower_bounds = [-Infinity];
      qp.constraint_upper_bounds = [1];
      qp.variable_lower_bounds = [0, 0];
      qp.variable_upper_bounds = [Infinity, Infinity];
      qp.variable_names = ['x', 'y'];
      assertProtoQp(await decodeMPModelProto(api, await api.Pdlp.qp_to_mpmodel_proto(qp)));
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_iteration_limit',
    async run(api) {
      const result = await api.Pdlp.primal_dual_hybrid_gradient(tinyLp(api), {
        termination_criteria: { iteration_limit: 1 },
        termination_check_frequency: 1,
      });
      assert(result.solve_log.iteration_count <= 1, 'expected iteration_count <= 1');
      assert(result.solve_log.termination_reason === 'TERMINATION_REASON_ITERATION_LIMIT', `unexpected termination ${result.solve_log.termination_reason}`);
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_solution',
    async run(api) {
      const result = await api.Pdlp.primal_dual_hybrid_gradient(tinyLp(api), {
        termination_criteria: {
          simple_optimality_criteria: {
            eps_optimal_relative: 0,
            eps_optimal_absolute: 1e-10,
          },
        },
      });
      assert(result.solve_log.termination_reason === 'TERMINATION_REASON_OPTIMAL', `unexpected termination ${result.solve_log.termination_reason}`);
      assertSequenceAlmostEqual(result.primal_solution, [1, 0, 6, 2], 'primal_solution');
      assertSequenceAlmostEqual(result.dual_solution, [0.5, 4, 0], 'dual_solution');
      assertSequenceAlmostEqual(result.reduced_costs, [0, 1.5, -3.5, 0], 'reduced_costs');
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_solution_2',
    async run(api) {
      const result = await api.Pdlp.primal_dual_hybrid_gradient(smallLp(api), {
        termination_criteria: {
          simple_optimality_criteria: {
            eps_optimal_relative: 0,
            eps_optimal_absolute: 1e-10,
          },
        },
      });
      assert(result.solve_log.termination_reason === 'TERMINATION_REASON_OPTIMAL', `unexpected termination ${result.solve_log.termination_reason}`);
      assertSequenceAlmostEqual(result.primal_solution, [-1, 8, 1, 2.5], 'primal_solution');
      assertSequenceAlmostEqual(result.dual_solution, [-2, 0, 2.375, 2 / 3], 'dual_solution');
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_starting_point',
    async run(api) {
      const start = new api.Pdlp.PrimalAndDualSolution();
      start.primal_solution = [1, 0, 6, 2];
      start.dual_solution = [0.5, 4, 0];
      const result = await api.Pdlp.primal_dual_hybrid_gradient(tinyLp(api), {
        termination_criteria: {
          simple_optimality_criteria: {
            eps_optimal_relative: 0,
            eps_optimal_absolute: 1e-10,
          },
        },
        l_inf_ruiz_iterations: 0,
        l2_norm_rescaling: false,
      }, start);
      assert(result.solve_log.termination_reason === 'TERMINATION_REASON_OPTIMAL', `unexpected termination ${result.solve_log.termination_reason}`);
      assert(result.solve_log.iteration_count === 0, `expected iteration_count 0, got ${result.solve_log.iteration_count}`);
    },
  },
];

export async function runPdlpCases(api: PdlpApi): Promise<PdlpCaseResult[]> {
  await api.initPdlp();
  const results: PdlpCaseResult[] = [];
  for (const mode of ['direct', 'worker'] as const) {
    api.setWorkerBridgeEnabled?.(mode === 'worker');
    for (const testCase of pdlpCases) {
      await testCase.run(api);
      results.push({ name: testCase.name, mode, ok: true });
    }
  }
  api.setWorkerBridgeEnabled?.(false);
  return results;
}

export { pdlpCases };
