import type { FixtureMode, SharedCase, SharedCaseResult } from './shared_case.ts';
import { fixtureModes, passedCase, withWorkerBridgeMode } from './shared_case.ts';

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
  setWorkerBridgeEnabled: (enabled: boolean) => void;
  isWorkerBridgeEnabled: () => boolean;
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
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: FixtureMode;
  ok: boolean;
} & SharedCaseResult;

type MPVariableProto = {
  lowerBound?: number;
  upperBound?: number;
  objectiveCoefficient?: number;
  name?: string;
};

type MPConstraintProto = {
  varIndex?: number[];
  coefficient?: number[];
  lowerBound?: number;
  upperBound?: number;
};

type MPQuadraticObjective = {
  qvar1Index?: number[];
  qvar2Index?: number[];
  coefficient?: number[];
};

type MPModelProto = {
  maximize?: boolean;
  objectiveOffset?: number;
  variable?: MPVariableProto[];
  constraint?: MPConstraintProto[];
  quadraticObjective?: MPQuadraticObjective;
};

class ProtoWriter {
  private readonly parts: Uint8Array[] = [];

  field(fieldNumber: number, wireType: number): void {
    this.varint((fieldNumber << 3) | wireType);
  }

  varint(value: number): void {
    const bytes = [];
    let current = value >>> 0;
    while (current > 0x7f) {
      bytes.push((current & 0x7f) | 0x80);
      current >>>= 7;
    }
    bytes.push(current);
    this.parts.push(Uint8Array.from(bytes));
  }

  double(value: number): void {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    this.parts.push(bytes);
  }

  string(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.varint(bytes.length);
    this.parts.push(bytes);
  }

  bytes(value: Uint8Array): void {
    this.varint(value.length);
    this.parts.push(value);
  }

  finish(): Uint8Array {
    const size = this.parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(size);
    let offset = 0;
    for (const part of this.parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }
}

class ProtoReader {
  private offset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  done(): boolean {
    return this.offset >= this.bytes.length;
  }

  varint(): number {
    let value = 0;
    let shift = 0;
    while (true) {
      const byte = this.bytes[this.offset++];
      value |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value >>> 0;
      shift += 7;
    }
  }

  double(): number {
    const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8).getFloat64(0, true);
    this.offset += 8;
    return value;
  }

  string(): string {
    const size = this.varint();
    const value = new TextDecoder().decode(this.bytes.slice(this.offset, this.offset + size));
    this.offset += size;
    return value;
  }

  bytesField(): Uint8Array {
    const size = this.varint();
    const value = this.bytes.slice(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }

  skip(wireType: number): void {
    if (wireType === 0) {
      this.varint();
    } else if (wireType === 1) {
      this.offset += 8;
    } else if (wireType === 2) {
      this.offset += this.varint();
    } else {
      throw new Error(`Unsupported protobuf wire type ${wireType}`);
    }
  }
}

function encodePackedInt32(values: number[]): Uint8Array {
  const writer = new ProtoWriter();
  for (const value of values) writer.varint(value);
  return writer.finish();
}

function encodePackedDouble(values: number[]): Uint8Array {
  const writer = new ProtoWriter();
  for (const value of values) writer.double(value);
  return writer.finish();
}

function readPackedInt32(bytes: Uint8Array): number[] {
  const reader = new ProtoReader(bytes);
  const values = [];
  while (!reader.done()) values.push(reader.varint());
  return values;
}

function readPackedDouble(bytes: Uint8Array): number[] {
  const reader = new ProtoReader(bytes);
  const values = [];
  while (!reader.done()) values.push(reader.double());
  return values;
}

function encodeVariableProto(variable: MPVariableProto): Uint8Array {
  const writer = new ProtoWriter();
  if (variable.lowerBound !== undefined) {
    writer.field(1, 1);
    writer.double(variable.lowerBound);
  }
  if (variable.upperBound !== undefined) {
    writer.field(2, 1);
    writer.double(variable.upperBound);
  }
  if (variable.objectiveCoefficient !== undefined) {
    writer.field(3, 1);
    writer.double(variable.objectiveCoefficient);
  }
  if (variable.name !== undefined) {
    writer.field(5, 2);
    writer.string(variable.name);
  }
  return writer.finish();
}

function decodeVariableProto(bytes: Uint8Array): MPVariableProto {
  const reader = new ProtoReader(bytes);
  const variable: MPVariableProto = {};
  while (!reader.done()) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1) variable.lowerBound = reader.double();
    else if (field === 2) variable.upperBound = reader.double();
    else if (field === 3) variable.objectiveCoefficient = reader.double();
    else if (field === 5) variable.name = reader.string();
    else reader.skip(wire);
  }
  return variable;
}

function encodeConstraintProto(constraint: MPConstraintProto): Uint8Array {
  const writer = new ProtoWriter();
  if (constraint.lowerBound !== undefined) {
    writer.field(2, 1);
    writer.double(constraint.lowerBound);
  }
  if (constraint.upperBound !== undefined) {
    writer.field(3, 1);
    writer.double(constraint.upperBound);
  }
  if (constraint.varIndex?.length) {
    writer.field(6, 2);
    writer.bytes(encodePackedInt32(constraint.varIndex));
  }
  if (constraint.coefficient?.length) {
    writer.field(7, 2);
    writer.bytes(encodePackedDouble(constraint.coefficient));
  }
  return writer.finish();
}

function decodeConstraintProto(bytes: Uint8Array): MPConstraintProto {
  const reader = new ProtoReader(bytes);
  const constraint: MPConstraintProto = {};
  while (!reader.done()) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 2) constraint.lowerBound = reader.double();
    else if (field === 3) constraint.upperBound = reader.double();
    else if (field === 6) constraint.varIndex = readPackedInt32(reader.bytesField());
    else if (field === 7) constraint.coefficient = readPackedDouble(reader.bytesField());
    else reader.skip(wire);
  }
  return constraint;
}

function encodeQuadraticObjective(objective: MPQuadraticObjective): Uint8Array {
  const writer = new ProtoWriter();
  if (objective.qvar1Index?.length) {
    writer.field(1, 2);
    writer.bytes(encodePackedInt32(objective.qvar1Index));
  }
  if (objective.qvar2Index?.length) {
    writer.field(2, 2);
    writer.bytes(encodePackedInt32(objective.qvar2Index));
  }
  if (objective.coefficient?.length) {
    writer.field(3, 2);
    writer.bytes(encodePackedDouble(objective.coefficient));
  }
  return writer.finish();
}

function decodeQuadraticObjective(bytes: Uint8Array): MPQuadraticObjective {
  const reader = new ProtoReader(bytes);
  const objective: MPQuadraticObjective = {};
  while (!reader.done()) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1) objective.qvar1Index = wire === 2 ? readPackedInt32(reader.bytesField()) : [reader.varint()];
    else if (field === 2) objective.qvar2Index = wire === 2 ? readPackedInt32(reader.bytesField()) : [reader.varint()];
    else if (field === 3) objective.coefficient = wire === 2 ? readPackedDouble(reader.bytesField()) : [reader.double()];
    else reader.skip(wire);
  }
  return objective;
}

function encodeMPModelProto(value: MPModelProto): Uint8Array {
  const writer = new ProtoWriter();
  if (value.maximize !== undefined) {
    writer.field(1, 0);
    writer.varint(value.maximize ? 1 : 0);
  }
  if (value.objectiveOffset !== undefined) {
    writer.field(2, 1);
    writer.double(value.objectiveOffset);
  }
  for (const variable of value.variable ?? []) {
    writer.field(3, 2);
    writer.bytes(encodeVariableProto(variable));
  }
  for (const constraint of value.constraint ?? []) {
    writer.field(4, 2);
    writer.bytes(encodeConstraintProto(constraint));
  }
  if (value.quadraticObjective) {
    writer.field(8, 2);
    writer.bytes(encodeQuadraticObjective(value.quadraticObjective));
  }
  return writer.finish();
}

function decodeMPModelProto(bytes: Uint8Array): MPModelProto {
  const reader = new ProtoReader(bytes);
  const model: MPModelProto = { variable: [], constraint: [] };
  while (!reader.done()) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1) model.maximize = reader.varint() !== 0;
    else if (field === 2) model.objectiveOffset = reader.double();
    else if (field === 3) model.variable?.push(decodeVariableProto(reader.bytesField()));
    else if (field === 4) model.constraint?.push(decodeConstraintProto(reader.bytesField()));
    else if (field === 8) model.quadraticObjective = decodeQuadraticObjective(reader.bytesField());
    else reader.skip(wire);
  }
  return model;
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

type RawPdlpCase = {
  name: string;
  run(api: PdlpApi): Promise<void>;
};

type PdlpCase = SharedCase<PdlpApi, Record<string, never>>;

const pdlpCaseDefinitions: RawPdlpCase[] = [
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
      const qp = await api.Pdlp.qp_from_mpmodel_proto(encodeMPModelProto(smallProtoLp()), false);
      await api.Pdlp.validate_quadratic_program_dimensions(qp);
      assert(await api.Pdlp.is_linear_program(qp), 'expected LP to be linear');
      assertSameElements(qp.objective_vector, [0, -2], 'objective_vector');
    },
  },
  {
    name: 'QuadraticProgramTest.test_converts_from_tiny_mpmodel_qp',
    async run(api) {
      const qp = await api.Pdlp.qp_from_mpmodel_proto(encodeMPModelProto(smallProtoQp()), false);
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
      assertProtoLp(decodeMPModelProto(await api.Pdlp.qp_to_mpmodel_proto(qp)));
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
      assertProtoQp(decodeMPModelProto(await api.Pdlp.qp_to_mpmodel_proto(qp)));
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

function pdlpCaseId(name: string): string {
  return `pdlp.${name
    .replaceAll('.', '_')
    .replaceAll('/', '_')
    .replaceAll(/[^a-zA-Z0-9_]+/g, '_')
    .replaceAll(/^_+|_+$/g, '')
    .toLowerCase()}`;
}

const pdlpCases: PdlpCase[] = pdlpCaseDefinitions.map((testCase) => ({
  id: pdlpCaseId(testCase.name),
  name: testCase.name,
  solver: 'pdlp',
  source: testCase.name.startsWith('QuadraticProgramTest.')
    ? 'ortools/pdlp/python/quadratic_program_test.py'
    : 'ortools/pdlp/python/primal_dual_hybrid_gradient_test.py',
  upstream: testCase.name,
  tags: ['python-parity'],
  async run(api) {
    await testCase.run(api);
    return {};
  },
}));

export async function runPdlpCases(api: PdlpApi): Promise<PdlpCaseResult[]> {
  await api.initPdlp();
  const results: PdlpCaseResult[] = [];
  for (const mode of fixtureModes) {
    await withWorkerBridgeMode(api, mode, 'PDLP', async () => {
      for (const testCase of pdlpCases) {
        const result = await testCase.run(api, { mode });
        results.push(passedCase(testCase, { mode }, result));
      }
    });
  }
  return results;
}

export { pdlpCases };
