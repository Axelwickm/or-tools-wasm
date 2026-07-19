import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import { loadPdlpRuntime } from '../runtime_loader.js';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
  type SolverJobEvent,
} from '../solver_executor.js';
import {
  PdlpBridgeRequestSchema,
  PdlpBridgeResponseSchema,
  PdlpOperation,
  type PdlpBridgeRequest,
  type PdlpBridgeResponse,
  type PdlpQuadraticProgram,
} from '../generated/bridge/pdlp_pb.js';

export type PdlpExecutorLike = SolverExecutor<PdlpBridgeRequest, PdlpBridgeResponse, never>;
export type PdlpExecutorJob = SolverJob<PdlpBridgeResponse>;
export type PdlpExecutorEvent = SolverJobEvent;

export const pdlpBridgeCodec: SolverBridgeCodec<PdlpBridgeRequest, PdlpBridgeResponse, never> = {
  solver: 'pdlp',
  label: 'PDLP',
  encodeRequest: (request) => toBinary(PdlpBridgeRequestSchema, request),
  decodeRequest: (payload) => fromBinary(PdlpBridgeRequestSchema, payload),
  encodeResult: (response) => toBinary(PdlpBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(PdlpBridgeResponseSchema, payload),
  defaultRequestedThreads: 1,
};

class Writer {
  private readonly parts: Uint8Array[] = [];
  u8(value: number) { this.parts.push(Uint8Array.of(value & 0xff)); }
  u32(value: number) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    this.parts.push(bytes);
  }
  double(value: number) {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    this.parts.push(bytes);
  }
  string(value: string) { const bytes = new TextEncoder().encode(value); this.u32(bytes.length); this.parts.push(bytes); }
  doubles(values: readonly number[]) { this.u32(values.length); for (const value of values) this.double(value); }
  strings(values: readonly string[]) { this.u32(values.length); for (const value of values) this.string(value); }
  finish() {
    const output = new Uint8Array(this.parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of this.parts) { output.set(part, offset); offset += part.length; }
    return output;
  }
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  u8() { return this.bytes[this.offset++] ?? 0; }
  u32() { const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4).getUint32(0, true); this.offset += 4; return value; }
  double() { const value = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 8).getFloat64(0, true); this.offset += 8; return value; }
  string() { const size = this.u32(); const value = new TextDecoder().decode(this.bytes.slice(this.offset, this.offset + size)); this.offset += size; return value; }
  doubles() { return Array.from({ length: this.u32() }, () => this.double()); }
  strings() { return Array.from({ length: this.u32() }, () => this.string()); }
}

function encodeQuadraticProgram(qp: PdlpQuadraticProgram) {
  const writer = new Writer();
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
    writer.u32(entry.row); writer.u32(entry.column); writer.double(entry.value);
  }
  return writer.finish();
}

function decodeQuadraticProgram(bytes: Uint8Array) {
  const reader = new Reader(bytes);
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
  const constraintMatrixEntries = Array.from({ length: reader.u32() }, () => ({
    row: reader.u32(), column: reader.u32(), value: reader.double(),
  }));
  return { numVariables, numConstraints, problemName, objectiveOffset, objectiveScalingFactor,
    objectiveVector, objectiveMatrixDiagonal, hasObjectiveMatrixDiagonal, constraintLowerBounds,
    constraintUpperBounds, variableLowerBounds, variableUpperBounds, variableNames, constraintNames,
    constraintMatrixEntries };
}

function encodeSolveRequest(request: PdlpBridgeRequest) {
  if (!request.quadraticProgram) throw new Error('PDLP solve requires a quadratic program.');
  const writer = new Writer();
  const qp = encodeQuadraticProgram(request.quadraticProgram);
  const parameters = request.parameters;
  const initial = request.initialSolution;
  const chunks = [qp];
  writer.u8(parameters?.iterationLimit !== undefined ? 1 : 0); if (parameters?.iterationLimit !== undefined) writer.u32(parameters.iterationLimit);
  writer.u8(parameters?.terminationCheckFrequency !== undefined ? 1 : 0); if (parameters?.terminationCheckFrequency !== undefined) writer.u32(parameters.terminationCheckFrequency);
  writer.u8(parameters?.epsOptimalRelative !== undefined ? 1 : 0); if (parameters?.epsOptimalRelative !== undefined) writer.double(parameters.epsOptimalRelative);
  writer.u8(parameters?.epsOptimalAbsolute !== undefined ? 1 : 0); if (parameters?.epsOptimalAbsolute !== undefined) writer.double(parameters.epsOptimalAbsolute);
  writer.u8(parameters?.lInfRuizIterations !== undefined ? 1 : 0); if (parameters?.lInfRuizIterations !== undefined) writer.u32(parameters.lInfRuizIterations);
  writer.u8(parameters?.l2NormRescaling !== undefined ? 1 : 0); if (parameters?.l2NormRescaling !== undefined) writer.u8(parameters.l2NormRescaling ? 1 : 0);
  writer.u8(initial ? 1 : 0);
  if (initial) { writer.doubles(initial.primalSolution); writer.doubles(initial.dualSolution); }
  chunks.push(writer.finish());
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  output.set(chunks[0]); output.set(chunks[1], chunks[0].length);
  return output;
}

function decodeSolverResult(bytes: Uint8Array) {
  const reader = new Reader(bytes);
  if (reader.u8() === 0) throw new Error(reader.string() || 'PDLP solve failed.');
  return { primalSolution: reader.doubles(), dualSolution: reader.doubles(), reducedCosts: reader.doubles(),
    terminationReason: reader.u32(), iterationCount: reader.u32() };
}

function copyBytes(module: OrToolsWasmModule, bytes: Uint8Array) {
  if (!bytes.length) return 0;
  const ptr = module._malloc(bytes.length); module.HEAPU8.set(bytes, ptr); return ptr;
}

async function nativeBytes(module: OrToolsWasmModule, fn: (lenPtr: number) => Promise<number>) {
  const lenPtr = module._malloc(4); let responsePtr = 0;
  try {
    responsePtr = await fn(lenPtr);
    const len = new DataView(module.HEAPU8.buffer, lenPtr, 4).getUint32(0, true);
    return responsePtr && len ? module.HEAPU8.slice(responsePtr, responsePtr + len) : new Uint8Array();
  } finally {
    if (responsePtr) module.ccall('free_buffer', undefined, ['number'], [responsePtr]);
    module._free(lenPtr);
  }
}

export class PdlpExecutor implements PdlpExecutorLike {
  readonly solver = 'pdlp';
  private modulePromise: Promise<OrToolsWasmModule> | null = null;
  private nextRequestId = 1;
  async load() { await this.module(); }
  terminate(_reason?: string) {}
  execute(request: PdlpBridgeRequest, options: SolverExecutionOptions<never>): PdlpExecutorJob {
    const requestId = this.nextRequestId++;
    return { requestId, result: this.run(requestId, request, options), cancel: async () => {} };
  }
  private module() { return this.modulePromise ??= loadPdlpRuntime(); }
  private async run(requestId: number, request: PdlpBridgeRequest, options: SolverExecutionOptions<never>) {
    const createdAtMs = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.STARTING, createdAtMs));
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.RUNNING, createdAtMs, BigInt(Date.now()), 1));
      const response = await this.invoke(await this.module(), request);
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.SUCCEEDED, createdAtMs));
      return response;
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(this.solver, requestId, error instanceof Error ? error.message : String(error), SolverFailureKind.INTERNAL, error instanceof Error ? error.stack ?? '' : ''));
      await options.onEvent(createSolverJobStatusEvent(this.solver, requestId, SolverJobState.FAILED, createdAtMs));
      throw error;
    }
  }
  private async invoke(module: OrToolsWasmModule, request: PdlpBridgeRequest): Promise<PdlpBridgeResponse> {
    const qpBytes = request.quadraticProgram ? encodeQuadraticProgram(request.quadraticProgram) : new Uint8Array();
    const input = request.operation === PdlpOperation.FROM_MP_MODEL ? request.mpModelProto
      : request.operation === PdlpOperation.SOLVE ? encodeSolveRequest(request) : qpBytes;
    const ptr = copyBytes(module, input);
    try {
      switch (request.operation) {
        case PdlpOperation.IS_LINEAR: {
          const value = await module.ccall('pdlp_is_linear_program', 'number', ['number', 'number'], [ptr, input.length], { async: true }) as number;
          return create(PdlpBridgeResponseSchema, { isLinear: value === 1 });
        }
        case PdlpOperation.VALIDATE: {
          const bytes = await nativeBytes(module, async (lenPtr) => await module.ccall('pdlp_validate_quadratic_program', 'number', ['number', 'number', 'number'], [ptr, input.length, lenPtr], { async: true }) as number);
          return create(PdlpBridgeResponseSchema, { validationError: new TextDecoder().decode(bytes) });
        }
        case PdlpOperation.FROM_MP_MODEL: {
          const bytes = await nativeBytes(module, async (lenPtr) => await module.ccall('pdlp_qp_from_mpmodel_proto', 'number', ['number', 'number', 'number', 'number', 'number'], [ptr, input.length, request.relaxIntegerVariables ? 1 : 0, request.includeNames ? 1 : 0, lenPtr], { async: true }) as number);
          if (!bytes.length) throw new Error('PDLP could not convert MPModelProto to QuadraticProgram.');
          return create(PdlpBridgeResponseSchema, { quadraticProgram: decodeQuadraticProgram(bytes) });
        }
        case PdlpOperation.TO_MP_MODEL: {
          const bytes = await nativeBytes(module, async (lenPtr) => await module.ccall('pdlp_qp_to_mpmodel_proto', 'number', ['number', 'number', 'number'], [ptr, input.length, lenPtr], { async: true }) as number);
          if (!bytes.length) throw new Error('PDLP could not convert QuadraticProgram to MPModelProto.');
          return create(PdlpBridgeResponseSchema, { mpModelProto: bytes });
        }
        case PdlpOperation.SOLVE: {
          const bytes = await nativeBytes(module, async (lenPtr) => await module.ccall('pdlp_primal_dual_hybrid_gradient', 'number', ['number', 'number', 'number'], [ptr, input.length, lenPtr], { async: true }) as number);
          if (!bytes.length) throw new Error('PDLP solve failed.');
          return create(PdlpBridgeResponseSchema, { solverResult: decodeSolverResult(bytes) });
        }
        default: throw new Error('PDLP request has no operation.');
      }
    } finally { if (ptr) module._free(ptr); }
  }
}
