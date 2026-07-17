import { create, fromBinary } from '@bufbuild/protobuf';
import { ManagedWorker, defaultLoadErrorMessage } from '../worker_helpers.js';
import {
  decodeSolverBridgeResponse,
  decodeSolverBridgeRequest,
  encodeSolverBridgeCancelRequest,
} from '../solver_bridge.js';
import {
  CpSatBridgeRequestSchema,
  CpSatBridgeResponseSchema,
  type CpSatBridgeRequest,
  type CpSatBridgeResponse,
} from '../generated/bridge/cp_sat_pb.js';
import {
  SolverFailureKind,
  SolverJobFailureSchema,
  type SolverBridgeResponse,
} from '../generated/bridge/job_pb.js';
import {
  cpSatEventFromSolverBridgeResponse,
  createCpSatFailureEvent,
  encodeCpSatSolverBridgeRequest,
  type CpSatExecutorEventHandler,
  type CpSatExecutorJob,
  type CpSatExecutorLike,
  type CpSatExecutorRequest,
} from './executor.js';
import type { SolverExecutionOptions } from '../solver_executor.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;

const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;

type BridgeWorker = {
  postMessage(message: Uint8Array, transfer?: Transferable[]): void;
  terminate(): void | Promise<number>;
  ref?(): void;
  unref?(): void;
  onmessage?: ((event: MessageEvent<Uint8Array>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  on?(event: 'message', listener: (message: Uint8Array) => void): void;
  on?(event: 'error', listener: (error: Error) => void): void;
};

async function createCpSatWorker(): Promise<BridgeWorker> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) {
    return new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
      name: 'ortools-executor-cp-sat',
    }) as BridgeWorker;
  }
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(new URL('./cp_sat_node_worker_bridge.js', import.meta.url), { execArgv: [] }) as BridgeWorker;
  }
  return new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module',
    name: 'ortools-executor-cp-sat',
  }) as BridgeWorker;
}

function response(bytes: Uint8Array): SolverBridgeResponse {
  return decodeSolverBridgeResponse(bytes);
}

export class CpSatWorkerExecutor implements CpSatExecutorLike {
  readonly solver = 'cp-sat';
  private nextRequestId = 1;

  private readonly worker = new ManagedWorker<Uint8Array, Uint8Array>({
    createWorker: createCpSatWorker,
    getRequestId: (bytes) => decodeSolverBridgeRequest(bytes).requestId,
    getResponseId: (bytes) => response(bytes).requestId,
    isEvent: (bytes) => {
      const payload = response(bytes).payload.case;
      return payload === 'eventPayload' || payload === 'status';
    },
    loadErrorMessage: (error) => defaultLoadErrorMessage(error).replace('Worker', 'CP-SAT worker'),
  });

  execute(
    payload: CpSatExecutorRequest,
    options: SolverExecutionOptions<CpSatBridgeResponse>,
  ): CpSatExecutorJob {
    const requestId = this.nextCpSatRequestId();
    const request = create(CpSatBridgeRequestSchema, { payload });
    return {
      requestId,
      result: this.run(requestId, request, options),
      cancel: () => this.cancel(requestId, options.onEvent),
    };
  }

  async load(): Promise<void> {
    await this.worker.load();
  }

  terminate(reason?: string): void {
    this.worker.terminate(reason ?? 'CP-SAT worker executor terminated.');
  }

  private async run(
    requestId: number,
    request: CpSatBridgeRequest,
    options: SolverExecutionOptions<CpSatBridgeResponse>,
  ): Promise<CpSatBridgeResponse> {
    const bytes = encodeCpSatSolverBridgeRequest(requestId, request, options.requestedThreads);
    let failureHandled = false;
    try {
      const resultBytes = await this.worker.post(bytes, async (eventBytes) => {
        const event = cpSatEventFromSolverBridgeResponse(response(eventBytes));
        if (event) await options.onEvent(event);
      }, [bytes.buffer]);
      const outer = response(resultBytes);
      if (outer.payload.case === 'failure') {
        await options.onEvent({ type: 'failure', failure: outer.payload.value });
        failureHandled = true;
        const error = new Error(outer.payload.value.message);
        if (outer.payload.value.trace) error.stack = outer.payload.value.trace;
        throw error;
      }
      if (outer.payload.case !== 'resultPayload') {
        throw new Error(`CP-SAT worker returned unexpected response: ${outer.payload.case ?? 'empty'}`);
      }
      return fromBinary(CpSatBridgeResponseSchema, outer.payload.value);
    } catch (error) {
      if (failureHandled) throw error;
      const failure = createCpSatFailureEvent(
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.WORKER_CRASH,
        error instanceof Error ? error.stack ?? '' : '',
        true,
      );
      await options.onEvent(failure);
      throw error;
    }
  }

  private async cancel(
    targetRequestId: number,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<void> {
    const requestId = this.nextCpSatRequestId();
    const bytes = encodeSolverBridgeCancelRequest(requestId, this.solver, targetRequestId);
    try {
      await this.worker.post(bytes, undefined, [bytes.buffer]);
    } catch (error) {
      const failure = create(SolverJobFailureSchema, {
        requestId,
        solver: this.solver,
        kind: SolverFailureKind.WORKER_CRASH,
        message: error instanceof Error ? error.message : String(error),
        trace: error instanceof Error ? error.stack ?? '' : '',
        retryable: true,
      });
      await onEvent({ type: 'failure', failure });
      throw error;
    }
  }

  private nextCpSatRequestId() {
    return this.nextRequestId++;
  }
}
