import { create } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { allocateWasmBytes, readWasmResult } from '../wasm_memory.js';
import { loadPdlpRuntime } from '../runtime_loader.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverCancellationUnsupportedError,
  SolverExecutorBusyError,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
} from '../solver_executor.js';
import {
  PdlpQuadraticProgramSchema,
  PdlpSolverResultSchema,
  type PdlpQuadraticProgram,
} from '../generated/bridge/pdlp_pb.js';
import type {
  PdlpExecutor,
  PdlpJob,
  PdlpOperation,
  PdlpResult,
} from './protocol.js';

class PdlpWireWriter {
  private readonly parts: Uint8Array[] = [];

  u8(value: number) {
    this.parts.push(Uint8Array.of(value & 0xff));
  }

  u32(value: number) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    this.parts.push(bytes);
  }

  i32(value: number) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    this.parts.push(bytes);
  }
  double(value: number) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    this.parts.push(bytes);
  }

  string(value: string) {
    const bytes = new TextEncoder().encode(value);
    this.u32(bytes.length);
    this.parts.push(bytes);
  }

  doubles(values: readonly number[]) {
    this.u32(values.length);
    for (const value of values) this.double(value);
  }

  strings(values: readonly string[]) {
    this.u32(values.length);
    for (const value of values) this.string(value);
  }

  finish() {
    const output = new Uint8Array(this.parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of this.parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }
}

class PdlpWireReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  u8() {
    return this.take(1)[0];
  }

  u32() {
    return new DataView(this.take(4).buffer, this.bytes.byteOffset + this.offset - 4, 4)
      .getUint32(0, true);
  }

  double() {
    return new DataView(this.take(8).buffer, this.bytes.byteOffset + this.offset - 8, 8)
      .getFloat64(0, true);
  }

  string() {
    const size = this.u32();
    return new TextDecoder().decode(this.take(size));
  }

  doubles() {
    return Array.from({ length: this.count(8, 'double array') }, () => this.double());
  }

  strings() {
    return Array.from({ length: this.count(4, 'string array') }, () => this.string());
  }

  count(minimumElementBytes: number, label: string) {
    const count = this.u32();
    if (count > Math.floor(this.remaining / minimumElementBytes)) {
      throw new Error(`Invalid PDLP ${label} length ${count}.`);
    }
    return count;
  }

  finish() {
    if (this.remaining !== 0) {
      throw new Error(`PDLP wire response has ${this.remaining} trailing bytes.`);
    }
  }

  private get remaining() {
    return this.bytes.length - this.offset;
  }

  private take(size: number) {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.remaining) {
      throw new Error(`Truncated PDLP wire response at byte ${this.offset}.`);
    }
    const start = this.offset;
    this.offset += size;
    return this.bytes.subarray(start, this.offset);
  }
}

function encodeQuadraticProgram(qp: PdlpQuadraticProgram) {
  const writer = new PdlpWireWriter();
  writer.u32(qp.numVariables);
  writer.u32(qp.numConstraints);
  writer.string(qp.problemName);
  writer.double(qp.objectiveOffset);
  writer.double(qp.objectiveScalingFactor);
  writer.doubles(qp.objectiveVector);
  writer.u8(qp.hasObjectiveMatrixDiagonal ? 1 : 0);
  if (qp.hasObjectiveMatrixDiagonal) writer.doubles(qp.objectiveMatrixDiagonal);
  writer.doubles(qp.constraintLowerBounds);
  writer.doubles(qp.constraintUpperBounds);
  writer.doubles(qp.variableLowerBounds);
  writer.doubles(qp.variableUpperBounds);
  writer.strings(qp.variableNames);
  writer.strings(qp.constraintNames);
  writer.u32(qp.constraintMatrixEntries.length);
  for (const entry of qp.constraintMatrixEntries) {
    writer.u32(entry.row);
    writer.u32(entry.column);
    writer.double(entry.value);
  }
  return writer.finish();
}

function decodeQuadraticProgram(bytes: Uint8Array) {
  const reader = new PdlpWireReader(bytes);
  const numVariables = reader.u32();
  const numConstraints = reader.u32();
  const problemName = reader.string();
  const objectiveOffset = reader.double();
  const objectiveScalingFactor = reader.double();
  const objectiveVector = reader.doubles();
  const hasObjectiveMatrixDiagonal = reader.u8() !== 0;
  const objectiveMatrixDiagonal = hasObjectiveMatrixDiagonal ? reader.doubles() : [];
  const constraintLowerBounds = reader.doubles();
  const constraintUpperBounds = reader.doubles();
  const variableLowerBounds = reader.doubles();
  const variableUpperBounds = reader.doubles();
  const variableNames = reader.strings();
  const constraintNames = reader.strings();
  const constraintMatrixEntries = Array.from({ length: reader.count(16, 'matrix entry array') }, () => ({
    row: reader.u32(),
    column: reader.u32(),
    value: reader.double(),
  }));
  reader.finish();
  return {
    numVariables,
    numConstraints,
    problemName,
    objectiveOffset,
    objectiveScalingFactor,
    objectiveVector,
    objectiveMatrixDiagonal,
    hasObjectiveMatrixDiagonal,
    constraintLowerBounds,
    constraintUpperBounds,
    variableLowerBounds,
    variableUpperBounds,
    variableNames,
    constraintNames,
    constraintMatrixEntries,
  };
}

function encodeSolveRequest(request: Extract<PdlpOperation, { type: 'solve' }>) {
  const writer = new PdlpWireWriter();
  const qp = encodeQuadraticProgram(request.quadraticProgram);
  const parameters = request.parameters;
  const initial = request.initialSolution;
  const chunks = [qp];
  writer.u8(parameters.iterationLimit !== undefined ? 1 : 0);
  if (parameters.iterationLimit !== undefined) {
    writer.i32(parameters.iterationLimit);
  }
  writer.u8(parameters.terminationCheckFrequency !== undefined ? 1 : 0);
  if (parameters.terminationCheckFrequency !== undefined) {
    writer.i32(parameters.terminationCheckFrequency);
  }
  writer.u8(parameters.epsOptimalRelative !== undefined ? 1 : 0);
  if (parameters.epsOptimalRelative !== undefined) {
    writer.double(parameters.epsOptimalRelative);
  }
  writer.u8(parameters.epsOptimalAbsolute !== undefined ? 1 : 0);
  if (parameters.epsOptimalAbsolute !== undefined) {
    writer.double(parameters.epsOptimalAbsolute);
  }
  writer.u8(parameters.lInfRuizIterations !== undefined ? 1 : 0);
  if (parameters.lInfRuizIterations !== undefined) {
    writer.i32(parameters.lInfRuizIterations);
  }
  writer.u8(parameters.l2NormRescaling !== undefined ? 1 : 0);
  if (parameters.l2NormRescaling !== undefined) {
    writer.u8(parameters.l2NormRescaling ? 1 : 0);
  }
  writer.u8(parameters.numThreads !== undefined ? 1 : 0);
  if (parameters.numThreads !== undefined) {
    writer.i32(parameters.numThreads);
  }
  writer.u8(initial ? 1 : 0);
  if (initial) {
    writer.doubles(initial.primalSolution);
    writer.doubles(initial.dualSolution);
  }
  chunks.push(writer.finish());
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  output.set(chunks[0]);
  output.set(chunks[1], chunks[0].length);
  return output;
}

function decodeSolverResult(bytes: Uint8Array) {
  const reader = new PdlpWireReader(bytes);
  if (reader.u8() === 0) {
    const message = reader.string();
    reader.finish();
    throw new Error(message || 'PDLP solve failed.');
  }
  const result = {
    primalSolution: reader.doubles(),
    dualSolution: reader.doubles(),
    reducedCosts: reader.doubles(),
    terminationReason: reader.u32(),
    iterationCount: reader.u32(),
  };
  reader.finish();
  return result;
}

export class DirectPdlpExecutor implements PdlpExecutor {
  readonly solver = 'pdlp';

  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  private activeJob: object | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadPdlpRuntime,
  ) {}

  async load() {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(request: PdlpOperation, options: SolverExecutionOptions<never>): PdlpJob {
    if (this.activeJob) {
      throw new SolverExecutorBusyError(this.solver);
    }
    const requestId = this.nextRequestId++;
    const state = {};
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, request, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: () => Promise.reject(new SolverCancellationUnsupportedError(this.solver)),
    };
  }

  private module() {
    return this.modulePromise ??= this.loadModuleImpl();
  }

  private async run(
    requestId: number,
    request: PdlpOperation,
    options: SolverExecutionOptions<never>,
  ) {
    const createdAtMs = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.STARTING,
        createdAtMs,
      ));
      const module = await this.module();
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.RUNNING,
        createdAtMs,
        BigInt(Date.now()),
      ));
      const response = await this.invoke(module, request);
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.SUCCEEDED,
        createdAtMs,
      ));
      return response;
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.INTERNAL,
        error instanceof Error ? error.stack ?? '' : '',
      ));
      await options.onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.FAILED,
        createdAtMs,
      ));
      throw error;
    }
  }

  private async invoke(
    module: OrToolsWasmModule,
    request: PdlpOperation,
  ): Promise<PdlpResult> {
    const qpBytes = request.type === 'fromMpModel'
      ? new Uint8Array()
      : encodeQuadraticProgram(request.quadraticProgram);
    const input = request.type === 'fromMpModel' ? request.model
      : request.type === 'solve' ? encodeSolveRequest(request) : qpBytes;
    const ptr = allocateWasmBytes(module, input);
    try {
      switch (request.type) {
        case 'isLinear': {
          const value = await module.ccall(
            'pdlp_is_linear_program',
            'number',
            ['number', 'number'],
            [ptr, input.length],
            { async: true },
          ) as number;
          if (value < 0) {
            throw new Error('PDLP could not parse the quadratic program.');
          }
          return { type: 'isLinear', value: value === 1 };
        }
        case 'validate': {
          const bytes = await readWasmResult(
            module,
            async (lengthPointer) => await module.ccall(
              'pdlp_validate_quadratic_program',
              'number',
              ['number', 'number', 'number'],
              [ptr, input.length, lengthPointer],
              { async: true },
            ) as number,
            (pointer) => module.ccall(
              'free_buffer', undefined, ['number'], [pointer],
            ),
          );
          return { type: 'validate', message: new TextDecoder().decode(bytes) };
        }
        case 'fromMpModel': {
          const bytes = await readWasmResult(
            module,
            async (lengthPointer) => await module.ccall(
              'pdlp_qp_from_mpmodel_proto',
              'number',
              ['number', 'number', 'number', 'number', 'number'],
              [
                ptr,
                input.length,
                request.relaxIntegerVariables ? 1 : 0,
                request.includeNames ? 1 : 0,
                lengthPointer,
              ],
              { async: true },
            ) as number,
            (pointer) => module.ccall(
              'free_buffer', undefined, ['number'], [pointer],
            ),
          );
          if (!bytes.length) {
            throw new Error('PDLP could not convert MPModelProto to QuadraticProgram.');
          }
          return {
            type: 'fromMpModel',
            quadraticProgram: create(PdlpQuadraticProgramSchema, decodeQuadraticProgram(bytes)),
          };
        }
        case 'toMpModel': {
          const bytes = await readWasmResult(
            module,
            async (lengthPointer) => await module.ccall(
              'pdlp_qp_to_mpmodel_proto',
              'number',
              ['number', 'number', 'number'],
              [ptr, input.length, lengthPointer],
              { async: true },
            ) as number,
            (pointer) => module.ccall(
              'free_buffer', undefined, ['number'], [pointer],
            ),
          );
          if (!bytes.length || bytes[0] !== 1) {
            throw new Error('PDLP could not convert QuadraticProgram to MPModelProto.');
          }
          return { type: 'toMpModel', model: bytes.slice(1) };
        }
        case 'solve': {
          const bytes = await readWasmResult(
            module,
            async (lengthPointer) => await module.ccall(
              'pdlp_primal_dual_hybrid_gradient',
              'number',
              ['number', 'number', 'number'],
              [ptr, input.length, lengthPointer],
              { async: true },
            ) as number,
            (pointer) => module.ccall(
              'free_buffer', undefined, ['number'], [pointer],
            ),
          );
          if (!bytes.length) {
            throw new Error('PDLP solve failed.');
          }
          return {
            type: 'solve',
            result: create(PdlpSolverResultSchema, decodeSolverResult(bytes)),
          };
        }
        default:
          throw new Error('PDLP request has no operation.');
      }
    } finally {
      if (ptr) module._free(ptr);
    }
  }
}
