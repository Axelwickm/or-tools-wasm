import { trackPendingEvent } from '../solver_executor.js';
import { create } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { allocateWasmBytes, readWasmResult } from '../wasm_memory.js';
import { withWasmRuntimeLock } from '../wasm_runtime_lock.js';
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
  PdlpIterationEventSchema,
  PdlpQuadraticProgramSchema,
  PdlpSolverResultSchema,
  type PdlpQuadraticProgram,
} from '../generated/bridge/pdlp_pb.js';
import type {
  PdlpExecutor,
  PdlpJob,
  PdlpOperation,
  PdlpResult,
  PdlpSolverEvent,
} from './protocol.js';

class PdlpWireWriter {
  private bytes = new Uint8Array(256);
  private view = new DataView(this.bytes.buffer);
  private offset = 0;

  private reserve(size: number): number {
    const start = this.offset;
    const end = start + size;
    if (end > this.bytes.length) {
      const bytes = new Uint8Array(Math.max(end, this.bytes.length * 2));
      bytes.set(this.bytes.subarray(0, start));
      this.bytes = bytes;
      this.view = new DataView(bytes.buffer);
    }
    this.offset = end;
    return start;
  }

  u8(value: number) {
    const offset = this.reserve(1);
    this.view.setUint8(offset, value);
  }

  u32(value: number) {
    const offset = this.reserve(4);
    this.view.setUint32(offset, value, true);
  }

  double(value: number) {
    const offset = this.reserve(8);
    this.view.setFloat64(offset, value, true);
  }

  rawBytes(bytes: Uint8Array) {
    this.u32(bytes.length);
    const offset = this.reserve(bytes.length);
    this.bytes.set(bytes, offset);
  }

  string(value: string) {
    this.rawBytes(new TextEncoder().encode(value));
  }

  doubles(values: readonly number[]) {
    this.u32(values.length);
    const offset = this.reserve(values.length * 8);
    for (let index = 0; index < values.length; ++index) this.view.setFloat64(offset + index * 8, values[index], true);
  }

  strings(values: readonly string[]) {
    this.u32(values.length);
    for (const value of values) this.string(value);
  }

  finish() {
    return this.bytes.subarray(0, this.offset);
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

  rawBytes() {
    return new Uint8Array(this.take(this.u32()));
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
  writer.u8(255);
  writer.rawBytes(parameters.nativeParameters);
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
    nativeSolveLog: reader.rawBytes(),
  };
  reader.finish();
  return result;
}

export class DirectPdlpExecutor implements PdlpExecutor {
  readonly solver = 'pdlp';

  private nextRequestId = 1;
  private activeJob: { cancelled: boolean; nativeRunning: boolean } | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadPdlpRuntime,
  ) {}

  async load() {
    await this.module();
  }

  terminate(_reason?: string) {}

  execute(request: PdlpOperation, options: SolverExecutionOptions<PdlpSolverEvent>): PdlpJob {
    if (this.activeJob) {
      throw new SolverExecutorBusyError(this.solver);
    }
    const requestId = this.nextRequestId++;
    const state = { cancelled: false, nativeRunning: false };
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, request, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: async () => {
        if (request.type !== 'solve') throw new SolverCancellationUnsupportedError(this.solver);
        if (this.activeJob !== state) return;
        state.cancelled = true;
        const module = await this.module();
        if (this.activeJob === state && state.nativeRunning) this.interrupt(module);
      },
    };
  }

  private interrupt(module: OrToolsWasmModule) {
    const address = module.ccall('pdlp_interrupt_address', 'number', [], []) as number;
    Atomics.store(module.HEAPU8, address, 1);
  }

  private module() {
    return this.loadModuleImpl();
  }

  private async run(
    requestId: number,
    request: PdlpOperation,
    options: SolverExecutionOptions<PdlpSolverEvent>,
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
      const pendingCallbacks = new Set<Promise<void>>();
      let callbackError: { error: unknown } | undefined;
      const response = await withWasmRuntimeLock(module, () => this.invoke(module, request, event => {
        if (callbackError) return;
        try {
          const pending = options.onEvent(event);
          trackPendingEvent(pendingCallbacks, pending, error => { callbackError ??= { error }; });
        } catch (error) { callbackError ??= { error }; }
      }));
      await Promise.all(pendingCallbacks);
      if (callbackError) throw callbackError.error;
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
    onEvent: (event: PdlpSolverEvent) => void,
  ): Promise<PdlpResult> {
    const input = request.type === 'fromMpModel' ? request.model
      : request.type === 'solve' ? encodeSolveRequest(request) : encodeQuadraticProgram(request.quadraticProgram);
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
              'pdlp_read_quadratic_program',
              'number',
              ['number', 'number', 'number', 'number', 'number', 'number'],
              [
                ptr,
                input.length,
                request.inputFormat ?? 0,
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
          if (!bytes.length) throw new Error('PDLP model import returned no response.');
          if (bytes[0] !== 1) throw new Error(new TextDecoder().decode(bytes.subarray(1)) || 'PDLP model import failed.');
          return {
            type: 'fromMpModel',
            quadraticProgram: create(PdlpQuadraticProgramSchema, decodeQuadraticProgram(bytes.subarray(1))),
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
          const state = this.activeJob;
          if (!state) throw new Error('PDLP solve has no active job.');
          const registry: { nextId: number; sinks: Map<number, (type: number, bytes: Uint8Array) => void> } =
            module.__ortoolsPdlpCallbacks ??= { nextId: 1, sinks: new Map() };
          const callbackId = registry.nextId++;
          registry.sinks.set(callbackId, (type, bytes) => {
            if (type === 1) onEvent({ type: 'log', message: new TextDecoder().decode(bytes) });
            else if (type === 2) {
              const reader = new PdlpWireReader(bytes);
              const info = create(PdlpIterationEventSchema, {
                iterationType: reader.u32(),
                iterationStats: reader.rawBytes(), terminationCriteria: reader.rawBytes(),
                l2NormPrimalLinearObjective: reader.double(), l2NormConstraintBounds: reader.double(),
                lInfNormPrimalLinearObjective: reader.double(), lInfNormConstraintBounds: reader.double(),
              });
              reader.finish();
              onEvent({ type: 'iteration', info });
            }
          });
          state.nativeRunning = true;
          if (state.cancelled) this.interrupt(module);
          let bytes: Uint8Array;
          try {
            bytes = await readWasmResult(
              module,
              async (lengthPointer) => await module.ccall(
                'pdlp_primal_dual_hybrid_gradient_with_callbacks',
                'number',
                ['number', 'number', 'number', 'number', 'number'],
                [ptr, input.length, request.callbackFlags ?? 0, callbackId, lengthPointer],
                { async: true },
              ) as number,
              (pointer) => module.ccall(
                'free_buffer', undefined, ['number'], [pointer],
              ),
            );
          } finally {
            state.nativeRunning = false;
            registry.sinks.delete(callbackId);
          }
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
