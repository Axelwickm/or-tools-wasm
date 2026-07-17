import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { ManagedWorker, defaultLoadErrorMessage } from '../worker_helpers.js';
import {
  decodeSolverBridgeResponse,
} from '../solver_bridge.js';
import {
  CpSatBridgeRequestSchema,
  CpSatBridgeResponseSchema,
  type CpSatBridgeRequest,
  type CpSatBridgeResponse,
} from '../generated/bridge/cp_sat_pb.js';
import {
  cpSatResponseFromSolverBridgeResponse,
  encodeCpSatSolverBridgeRequest,
  createCpSatCancelBridgeRequest,
  createCpSatFailureBridgeResponse,
} from './executor.js';
import { SolverFailureKind } from '../generated/bridge/job_pb.js';
import type {
  CpSatExecutorBytesEventHandler,
  CpSatExecutorEventHandler,
  CpSatExecutorJob,
  CpSatExecutorLike,
  CpSatExecutorRequest,
} from './executor.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;

const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;

type CpSatWorkerRequest = {
  id: number;
  bytes: Uint8Array;
};

type CpSatWorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; bytes: Uint8Array }
  | { type: 'event'; id: number; bytes: Uint8Array }
  | { type: 'error'; id: number; error: string };

type BridgeWorker = {
  postMessage(message: CpSatWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void | Promise<number>;
  unref?(): void;
  onmessage?: ((event: MessageEvent<CpSatWorkerResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  on?(event: 'message', listener: (message: CpSatWorkerResponse) => void): void;
  on?(event: 'error', listener: (error: Error) => void): void;
};

async function createCpSatWorker(): Promise<BridgeWorker> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) {
    return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) as BridgeWorker;
  }
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(new URL('./cp_sat_node_worker_bridge.js', import.meta.url), { execArgv: [] }) as BridgeWorker;
  }
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }) as BridgeWorker;
}

export class CpSatWorkerExecutor implements CpSatExecutorLike {
  readonly solver = 'cp-sat';
  private nextRequestId = 1;

  private readonly worker = new ManagedWorker<CpSatWorkerRequest, CpSatWorkerResponse>({
    createWorker: createCpSatWorker,
    isReady: (message) => message.type === 'ready',
    getRequestId: (request) => request.id,
    getResponseId: (message) => 'id' in message ? message.id : undefined,
    isEvent: (message) => message.type === 'event',
    isError: (message) => message.type === 'error',
    errorMessage: (message) => message.type === 'error' ? message.error : 'CP-SAT worker request failed.',
    loadErrorMessage: (error) => defaultLoadErrorMessage(error).replace('Worker', 'CP-SAT worker'),
  });

  private async run(
    request: CpSatBridgeRequest,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const bridgeRequestBytes = encodeCpSatSolverBridgeRequest(request);
    try {
      const response = await this.worker.post(
        { id: request.requestId, bytes: bridgeRequestBytes },
        (event) => {
          if (event.type === 'event') {
            return onEvent(cpSatResponseFromSolverBridgeResponse(
              request.requestId,
              decodeSolverBridgeResponse(event.bytes),
              SolverFailureKind.WORKER_CRASH,
            ));
          }
        },
        [bridgeRequestBytes.buffer],
      );
      if (response.type !== 'result') {
        if (response.type === 'error') {
          const failure = createCpSatFailureBridgeResponse(
            request.requestId,
            response.error,
            SolverFailureKind.WORKER_CRASH,
            '',
            true,
          );
          await onEvent(failure);
          return failure;
        }
        throw new Error(`CP-SAT worker returned unexpected response type: ${response.type}`);
      }
      return cpSatResponseFromSolverBridgeResponse(
        request.requestId,
        decodeSolverBridgeResponse(response.bytes),
        SolverFailureKind.WORKER_CRASH,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack ?? '' : '';
      const failure = createCpSatFailureBridgeResponse(
        request.requestId,
        message,
        SolverFailureKind.WORKER_CRASH,
        trace,
        true,
      );
      await onEvent(failure);
      return failure;
    }
  }

  execute(
    payload: CpSatExecutorRequest,
    onEvent: CpSatExecutorEventHandler,
  ): CpSatExecutorJob {
    const request = this.createRequest(payload);
    return {
      requestId: request.requestId,
      result: this.run(request, onEvent),
      cancel: () => this.cancel(this.nextCpSatRequestId(), request.requestId, onEvent),
    };
  }

  async executeBytes(requestBytes: Uint8Array, onEvent: CpSatExecutorBytesEventHandler): Promise<Uint8Array> {
    const request = fromBinary(CpSatBridgeRequestSchema, requestBytes);
    const response = await this.run(request, async (event) => {
      await onEvent(toBinary(CpSatBridgeResponseSchema, event));
    });
    return toBinary(CpSatBridgeResponseSchema, response);
  }

  async load(): Promise<void> {
    await this.worker.load();
  }

  private async cancel(
    requestId: number,
    targetRequestId: number,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    return this.run(createCpSatCancelBridgeRequest(requestId, targetRequestId), onEvent);
  }

  terminate(reason?: string): void {
    this.worker.terminate(reason ?? 'CP-SAT worker executor terminated.');
  }

  private nextCpSatRequestId() {
    return this.nextRequestId++;
  }

  private createRequest(payload: CpSatExecutorRequest): CpSatBridgeRequest {
    return create(CpSatBridgeRequestSchema, {
      requestId: this.nextCpSatRequestId(),
      payload,
    });
  }
}
