import { assertCaseMatrix } from '../../../harness/shared_case.ts';
import type { ExecutorFixtureMode, FixtureMode, SharedCase, SharedCaseResult } from '../../../harness/shared_case.ts';
import { assertServerExecutorIsRunning, executorFixtureModes, passedCase, serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';

type PdlpApi = {
  Pdlp: {
    QuadraticProgram: new (input?: Record<string, unknown>) => QuadraticProgramLike;
    PrimalAndDualSolution: new (input?: Record<string, unknown>) => PrimalAndDualSolutionLike;
    validateQuadraticProgramDimensions(qp: QuadraticProgramLike, options?: PdlpOperationOptions): Promise<void>;
    isLinearProgram(qp: QuadraticProgramLike, options?: PdlpOperationOptions): Promise<boolean>;
    qpFromMpModelProto(proto: Uint8Array, options?: PdlpOperationOptions & {
      relaxIntegerVariables?: boolean;
      includeNames?: boolean;
    }): Promise<QuadraticProgramLike>;
    qpToMpModelProto(qp: QuadraticProgramLike, options?: PdlpOperationOptions): Promise<Uint8Array>;
    solve(qp: QuadraticProgramLike, options?: PdlpParams & PdlpOperationOptions & {
      initialSolution?: PrimalAndDualSolutionLike;
    }): Promise<PdlpResultLike>;
  };
};

type PdlpExecutorSelection = FixtureMode | ReturnType<typeof serverExecutorConfiguration>;

type PdlpOperationOptions = {
  executor?: PdlpExecutorSelection;
  onEvent?: (event: { type: string; status?: { state: number } }) => void;
  signal?: AbortSignal;
};

function withPdlpExecutor(api: PdlpApi, executor: PdlpExecutorSelection): PdlpApi {
  return {
    Pdlp: {
      ...api.Pdlp,
      validateQuadraticProgramDimensions: (qp, options = {}) =>
        api.Pdlp.validateQuadraticProgramDimensions(qp, { ...options, executor }),
      isLinearProgram: (qp, options = {}) =>
        api.Pdlp.isLinearProgram(qp, { ...options, executor }),
      qpFromMpModelProto: (proto, options = {}) =>
        api.Pdlp.qpFromMpModelProto(proto, { ...options, executor }),
      qpToMpModelProto: (qp, options = {}) =>
        api.Pdlp.qpToMpModelProto(qp, { ...options, executor }),
      solve: (qp, options = {}) =>
        api.Pdlp.solve(qp, { ...options, executor }),
    },
  };
}

type QuadraticProgramLike = {
  resizeAndInitialize(numVariables: number, numConstraints: number): void;
  setObjectiveMatrixDiagonal(values: number[]): void;
  objectiveVector: number[];
  constraintMatrix: { numRows?: number; numColumns?: number; dense?: number[][]; entries?: Array<{ row: number; column: number; value: number }> } | number[][];
  constraintLowerBounds: number[];
  constraintUpperBounds: number[];
  variableLowerBounds: number[];
  variableUpperBounds: number[];
  variableNames: string[];
  constraintNames: string[];
  problemName: string;
  objectiveMatrixDiagonal: number[] | null;
  objectiveOffset: number;
  objectiveScalingFactor: number;
};

type PrimalAndDualSolutionLike = {
  primalSolution: number[];
  dualSolution: number[];
};

type PdlpParams = {
  terminationCriteria?: {
    iterationLimit?: number;
    timeSecLimit?: number;
    kktMatrixPassLimit?: number;
    simpleOptimalityCriteria?: {
      epsOptimalRelative?: number;
      epsOptimalAbsolute?: number;
    };
  };
  recordIterationStats?: boolean;
  presolveOptions?: { useGlop?: boolean };
  terminationCheckFrequency?: number;
  lInfRuizIterations?: number;
  l2NormRescaling?: boolean;
  numThreads?: number;
};

type PdlpResultLike = {
  primalSolution: number[];
  dualSolution: number[];
  reducedCosts: number[];
  solveLog: {
    terminationReason: string;
    iterationCount: number;
    solveTimeSec?: number;
    params?: PdlpParams;
    iterationStats?: Array<{ iterationNumber?: number }>;
    solutionStats?: { convergenceInformation?: Array<{ primalObjective?: number; dualObjective?: number }> };
  };
};

export type PdlpCaseResult = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: ExecutorFixtureMode;
  ok: boolean;
} & SharedCaseResult<ExecutorFixtureMode>;

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
  qp.objectiveOffset = -14;
  qp.objectiveVector = [5, 2, 1, 1];
  qp.constraintLowerBounds = [12, 7, 1];
  qp.constraintUpperBounds = [12, Infinity, Infinity];
  qp.variableLowerBounds = [0, 0, 0, 0];
  qp.variableUpperBounds = [2, 4, 6, 3];
  qp.constraintMatrix = {
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
  qp.objectiveOffset = -14;
  qp.objectiveVector = [5.5, -2, -1, 1];
  qp.constraintLowerBounds = [12, -Infinity, -4, -1];
  qp.constraintUpperBounds = [12, 7, Infinity, 1];
  qp.variableLowerBounds = [-Infinity, -2, -Infinity, 2.5];
  qp.variableUpperBounds = [Infinity, Infinity, 6, 3.5];
  qp.constraintMatrix = {
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

type PdlpCase = SharedCase<PdlpApi, Record<string, never>, ExecutorFixtureMode>;

const pdlpCaseDefinitions: RawPdlpCase[] = [
  {
    name: 'QuadraticProgramTest.resize_resets_previous_quadratic_model',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram({
        problemName: 'previous', objectiveOffset: 9, objectiveScalingFactor: -2,
        objectiveVector: [3, 4], objectiveMatrixDiagonal: [5, 6],
        variableNames: ['x', 'y'], constraintNames: ['capacity'],
        constraintMatrix: { numRows: 1, numColumns: 2, entries: [{ row: 0, column: 0, value: 7 }] },
      });
      qp.resizeAndInitialize(1, 0);
      assert(qp.problemName === '', 'resize must clear problem name');
      assert(qp.objectiveOffset === 0 && qp.objectiveScalingFactor === 1, 'resize must reset offset/scaling');
      assert(qp.objectiveMatrixDiagonal === null, 'resize must clear quadratic objective');
      assert(qp.variableNames.length === 0 && qp.constraintNames.length === 0, 'resize must clear optional names');
      assertSameElements(qp.objectiveVector, [0], 'resized objective');
      assertSameElements(qp.variableLowerBounds, [-Infinity], 'resized lower bounds');
      assertSameElements(qp.variableUpperBounds, [Infinity], 'resized upper bounds');
      await api.Pdlp.validateQuadraticProgramDimensions(qp);
      assert(await api.Pdlp.isLinearProgram(qp), 'resized quadratic program must be linear');
      // A stale offset/scaling would change the objective after the next solve.
      qp.objectiveVector = [1];
      qp.variableLowerBounds = [2];
      qp.variableUpperBounds = [3];
      const result = await api.Pdlp.solve(qp);
      assert(result.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', 'resized model must solve');
      assert(Math.abs(result.primalSolution[0] - 2) < 1e-5, 'resized optimum must be 2');
    },
  },
  ...([
    ['objective vector', (qp: QuadraticProgramLike) => { qp.objectiveVector = [0]; }],
    ['variable lower bounds', (qp: QuadraticProgramLike) => { qp.variableLowerBounds = [0]; }],
    ['variable upper bounds', (qp: QuadraticProgramLike) => { qp.variableUpperBounds = []; }],
    ['constraint lower bounds', (qp: QuadraticProgramLike) => { qp.constraintLowerBounds = []; }],
    ['constraint upper bounds', (qp: QuadraticProgramLike) => { qp.constraintUpperBounds = [0, 1]; }],
    ['matrix columns', (qp: QuadraticProgramLike) => { qp.constraintMatrix = { numRows: 1, numColumns: 3, entries: [] }; }],
    ['matrix rows', (qp: QuadraticProgramLike) => { qp.constraintMatrix = { numRows: 2, numColumns: 2, entries: [] }; }],
    ['quadratic diagonal', (qp: QuadraticProgramLike) => { qp.objectiveMatrixDiagonal = [1]; }],
    ['variable names', (qp: QuadraticProgramLike) => { qp.variableNames = ['x']; }],
    ['constraint names', (qp: QuadraticProgramLike) => { qp.constraintNames = ['first', 'extra']; }],
  ] as const).map(([dimension, mutate]) => ({
    name: `QuadraticProgramTest.rejects_inconsistent_${dimension.replaceAll(' ', '_')}`,
    async run(api: PdlpApi) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.resizeAndInitialize(2, 1);
      mutate(qp);
      let message = '';
      try { await api.Pdlp.validateQuadraticProgramDimensions(qp); }
      catch (error) { message = error instanceof Error ? error.message : String(error); }
      assert(message.includes('Inconsistent dimensions'), `expected native dimension error for ${dimension}, received: ${message}`);
    },
  })),
  {
    name: 'QuadraticProgramTest.solve_rejects_inconsistent_objective_dimensions',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.resizeAndInitialize(2, 0);
      qp.objectiveVector = [1];
      const result = await api.Pdlp.solve(qp);
      assert(result.solveLog.terminationReason === 'TERMINATION_REASON_INVALID_PROBLEM', 'solve must reject malformed dimensions instead of padding the model');
    },
  },
  {
    name: 'QuadraticProgramTest.diagonal_only_infers_variable_dimensions',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram({ objectiveMatrixDiagonal: [2, 4] });
      assert(qp.objectiveVector.length === 2 && qp.variableLowerBounds.length === 2 && qp.variableUpperBounds.length === 2,
        'A diagonal-only objective infers two variables and their default vectors');
      await api.Pdlp.validateQuadraticProgramDimensions(qp);
      assert(!(await api.Pdlp.isLinearProgram(qp)), 'Native validation receives the quadratic diagonal');
      const result = await api.Pdlp.solve(qp);
      assert(result.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL' && result.primalSolution.length === 2
        && result.primalSolution.every(value => Math.abs(value) < 1e-5), 'Native unconstrained quadratic optimum is zero');
      const malformed = new api.Pdlp.QuadraticProgram({ objectiveMatrixDiagonal: [2, 4], objectiveVector: [0] });
      let message = '';
      try { await api.Pdlp.validateQuadraticProgramDimensions(malformed); } catch (error) { message = String(error); }
      assert(message.includes('Inconsistent dimensions'), 'Explicit mismatched vectors still reach native dimension validation');
    },
  },
  {
    name: 'QuadraticProgramTest.test_validate_quadratic_program_dimensions_for_empty_qp',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.resizeAndInitialize(3, 2);
      await api.Pdlp.validateQuadraticProgramDimensions(qp);
      assert(await api.Pdlp.isLinearProgram(qp), 'expected empty QP to be linear');
    },
  },
  {
    name: 'QuadraticProgramTest.test_converts_from_tiny_mpmodel_lp',
    async run(api) {
      const qp = await api.Pdlp.qpFromMpModelProto(
        encodeMPModelProto(smallProtoLp()),
        { relaxIntegerVariables: false },
      );
      await api.Pdlp.validateQuadraticProgramDimensions(qp);
      assert(await api.Pdlp.isLinearProgram(qp), 'expected LP to be linear');
      assertSameElements(qp.objectiveVector, [0, -2], 'objectiveVector');
    },
  },
  {
    name: 'QuadraticProgramTest.test_converts_from_tiny_mpmodel_qp',
    async run(api) {
      const qp = await api.Pdlp.qpFromMpModelProto(
        encodeMPModelProto(smallProtoQp()),
        { relaxIntegerVariables: false },
      );
      await api.Pdlp.validateQuadraticProgramDimensions(qp);
      assert(!(await api.Pdlp.isLinearProgram(qp)), 'expected QP not to be linear');
      assertSameElements(qp.objectiveVector, [0, 0], 'objectiveVector');
    },
  },
  {
    name: 'QuadraticProgramTest.test_build_lp',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.objectiveVector = [0, -2];
      qp.constraintMatrix = { dense: [[1, 1]] };
      qp.constraintLowerBounds = [-Infinity];
      qp.constraintUpperBounds = [1];
      qp.variableLowerBounds = [0, 0];
      qp.variableUpperBounds = [Infinity, Infinity];
      qp.variableNames = ['x', 'y'];
      assertProtoLp(decodeMPModelProto(await api.Pdlp.qpToMpModelProto(qp)));
    },
  },
  {
    name: 'QuadraticProgramTest.test_build_qp',
    async run(api) {
      const qp = new api.Pdlp.QuadraticProgram();
      qp.objectiveVector = [0, 0];
      qp.constraintMatrix = { dense: [[1, 1]] };
      qp.setObjectiveMatrixDiagonal([4]);
      qp.constraintLowerBounds = [-Infinity];
      qp.constraintUpperBounds = [1];
      qp.variableLowerBounds = [0, 0];
      qp.variableUpperBounds = [Infinity, Infinity];
      qp.variableNames = ['x', 'y'];
      assertProtoQp(decodeMPModelProto(await api.Pdlp.qpToMpModelProto(qp)));
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_iteration_limit',
    async run(api) {
      const result = await api.Pdlp.solve(tinyLp(api), {
        terminationCriteria: { iterationLimit: 1 },
        terminationCheckFrequency: 1,
      });
      assert(result.solveLog.iterationCount <= 1, 'expected iterationCount <= 1');
      assert(result.solveLog.terminationReason === 'TERMINATION_REASON_ITERATION_LIMIT', `unexpected termination ${result.solveLog.terminationReason}`);
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_solution',
    async run(api) {
      const result = await api.Pdlp.solve(tinyLp(api), {
        terminationCriteria: {
          simpleOptimalityCriteria: {
            epsOptimalRelative: 0,
            epsOptimalAbsolute: 1e-10,
          },
        },
      });
      assert(result.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', `unexpected termination ${result.solveLog.terminationReason}`);
      assertSequenceAlmostEqual(result.primalSolution, [1, 0, 6, 2], 'primalSolution');
      assertSequenceAlmostEqual(result.dualSolution, [0.5, 4, 0], 'dualSolution');
      assertSequenceAlmostEqual(result.reducedCosts, [0, 1.5, -3.5, 0], 'reducedCosts');
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_solution_2',
    async run(api) {
      const result = await api.Pdlp.solve(smallLp(api), {
        terminationCriteria: {
          simpleOptimalityCriteria: {
            epsOptimalRelative: 0,
            epsOptimalAbsolute: 1e-10,
          },
        },
      });
      assert(result.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', `unexpected termination ${result.solveLog.terminationReason}`);
      assertSequenceAlmostEqual(result.primalSolution, [-1, 8, 1, 2.5], 'primalSolution');
      assertSequenceAlmostEqual(result.dualSolution, [-2, 0, 2.375, 2 / 3], 'dualSolution');
    },
  },
  {
    name: 'PrimalDualHybridGradientTest.test_starting_point',
    async run(api) {
      const start = new api.Pdlp.PrimalAndDualSolution();
      start.primalSolution = [1, 0, 6, 2];
      start.dualSolution = [0.5, 4, 0];
      const result = await api.Pdlp.solve(tinyLp(api), {
        terminationCriteria: {
          simpleOptimalityCriteria: {
            epsOptimalRelative: 0,
            epsOptimalAbsolute: 1e-10,
          },
        },
        lInfRuizIterations: 0,
        l2NormRescaling: false,
        initialSolution: start,
      });
      assert(result.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', `unexpected termination ${result.solveLog.terminationReason}`);
      assert(result.solveLog.iterationCount === 0, `expected iterationCount 0, got ${result.solveLog.iterationCount}`);
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

// Python accepts these exact native protobuf controls and returns the full SolveLog.
for (const [field, reason] of [
  ['timeSecLimit', 'TERMINATION_REASON_TIME_LIMIT'],
  ['kktMatrixPassLimit', 'TERMINATION_REASON_KKT_MATRIX_PASS_LIMIT'],
] as const) {
  pdlpCaseDefinitions.push({
    name: `PrimalDualHybridGradientTest.native_${field}_zero`,
    async run(api) {
      const result = await api.Pdlp.solve(tinyLp(api), {
        terminationCriteria: { [field]: 0 },
        terminationCheckFrequency: 1,
        presolveOptions: { useGlop: false },
      });
      assert(result.solveLog.terminationReason === reason,
        `${field}: expected ${reason}, got ${result.solveLog.terminationReason}`);
      assert(result.solveLog.iterationCount === 0, `${field}: expected no iterations`);
      assert(result.solveLog.params?.terminationCriteria?.[field] === 0,
        `${field}: native SolveLog must preserve explicit zero`);
    },
  });
}
pdlpCaseDefinitions.push({
  name: 'PrimalDualHybridGradientTest.full_native_solve_log',
  async run(api) {
    const result = await api.Pdlp.solve(tinyLp(api), {
      recordIterationStats: true,
      terminationCheckFrequency: 1,
      presolveOptions: { useGlop: false },
      terminationCriteria: { simpleOptimalityCriteria: { epsOptimalAbsolute: 1e-8, epsOptimalRelative: 0 } },
    });
    assert(result.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', 'full log solve must be optimal');
    assert((result.solveLog.iterationStats?.length ?? 0) > 1, 'recordIterationStats must record actual iterations');
    assert(result.solveLog.params?.presolveOptions?.useGlop === false, 'native log preserves explicit false');
    assert(result.solveLog.params?.terminationCriteria?.timeSecLimit === Infinity, 'native log preserves unlimited default time');
    assert((result.solveLog.solveTimeSec ?? -1) >= 0, 'native log contains solve timing');
    const convergence = result.solveLog.solutionStats?.convergenceInformation ?? [];
    assert(convergence.some(info => Math.abs((info.primalObjective ?? Infinity) + 1) < 1e-6),
      'native log must report the solved LP objective -1');
  },
}, {
  name: 'PrimalDualHybridGradientTest.invalid_native_time_limit',
  async run(api) {
    const result = await api.Pdlp.solve(tinyLp(api), { terminationCriteria: { timeSecLimit: -1 } });
    assert(result.solveLog.terminationReason === 'TERMINATION_REASON_INVALID_PARAMETER',
      'negative native time limit must be rejected by PDLP');
  },
});

const pdlpCases: PdlpCase[] = pdlpCaseDefinitions.map((testCase) => ({
  id: pdlpCaseId(testCase.name),
  name: testCase.name,
  solver: 'pdlp',
  source: testCase.name.includes('native_')
    ? 'ortools/pdlp/solvers.proto; ortools/pdlp/solve_log.proto'
    : testCase.name.includes('resize_resets_previous')
    ? 'ortools/pdlp/quadratic_program.h'
    : testCase.name.includes('inconsistent_')
      ? 'ortools/pdlp/quadratic_program.cc'
      : 'ortools/pdlp/python/pdlp_test.py',
  upstream: testCase.name.includes('resize_resets_previous')
    ? 'QuadraticProgram::ResizeAndInitialize'
    : testCase.name.includes('inconsistent_')
      ? 'ValidateQuadraticProgramDimensions'
      : testCase.name,
  tags: testCase.name.includes('resize_resets_previous') || testCase.name.includes('inconsistent_')
    ? ['python-parity', 'gap-regression'] : ['python-parity'],
  async run(api) {
    await testCase.run(api);
    return {};
  },
}));

export async function runPdlpCases(
  api: PdlpApi,
  options: { modes?: readonly ExecutorFixtureMode[] } = {},
): Promise<PdlpCaseResult[]> {
  const results: PdlpCaseResult[] = [];
  const modes = options.modes ?? executorFixtureModes;
  if (modes.includes('server')) await assertServerExecutorIsRunning();
  for (const mode of modes) {
    const scopedApi = withPdlpExecutor(
      api,
      mode === 'server' ? serverExecutorConfiguration() : mode,
    );
    const states: number[] = [];
    await scopedApi.Pdlp.isLinearProgram(new scopedApi.Pdlp.QuadraticProgram(), {
      onEvent: (event) => { if (event.type === 'status' && event.status) states.push(event.status.state); },
    });
    if (!states.includes(solverJobStates.RUNNING) || !states.includes(solverJobStates.SUCCEEDED)) {
      throw new Error(`PDLP (${mode}) did not emit the complete job lifecycle.`);
    }
    for (const testCase of pdlpCases) {
      const result = await testCase.run(scopedApi, { mode });
      results.push(passedCase(testCase, { mode }, result));
    }
  }
  assertCaseMatrix(results, pdlpCases, modes);
  return results;
}

export { pdlpCases };
