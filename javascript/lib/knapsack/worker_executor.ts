import { ManagedWorker, defaultLoadErrorMessage } from '../worker_helpers.js';
import {
  decodeSolverBridgeRequest,
  decodeSolverBridgeResponse,
  encodeSolverBridgeCancelRequest,
} from '../solver_bridge.js';
import { SolverFailureKind } from '../generated/bridge/job_pb.js';
import type { SolverExecutionOptions } from '../solver_executor.js';
import type { KnapsackBridgeRequest, KnapsackBridgeResponse } from '../generated/bridge/knapsack_pb.js';
import {
  createSolverFailureEvent,
} from '../solver_executor.js';
import {
  decodeKnapsackBridgeResult,
  encodeKnapsackSolverBridgeRequest,
  knapsackEventFromSolverBridgeResponse,
  type KnapsackExecutorJob,
  type KnapsackExecutorLike,
} from './executor.js';

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

async function createKnapsackWorker(): Promise<BridgeWorker> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) {
    return new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'ortools-executor-knapsack' }) as BridgeWorker;
  }
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(new URL('./knapsack_node_worker_bridge.js', import.meta.url), { execArgv: [] }) as BridgeWorker;
  }
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'ortools-executor-knapsack' }) as BridgeWorker;
}

export class KnapsackWorkerExecutor implements KnapsackExecutorLike {
  readonly solver = 'knapsack';
  private nextRequestId = 1;
  private readonly worker = new ManagedWorker<Uint8Array, Uint8Array>({
    createWorker: createKnapsackWorker,
    getRequestId: (bytes) => decodeSolverBridgeRequest(bytes).requestId,
    getResponseId: (bytes) => decodeSolverBridgeResponse(bytes).requestId,
    isEvent: (bytes) => decodeSolverBridgeResponse(bytes).payload.case === 'status',
    loadErrorMessage: (error) => defaultLoadErrorMessage(error).replace('Worker', 'Knapsack worker'),
  });

  execute(
    request: KnapsackBridgeRequest,
    options: SolverExecutionOptions<never>,
  ): KnapsackExecutorJob {
    const requestId = this.nextRequestId++;
    return {
      requestId,
      result: this.run(requestId, request, options),
      cancel: () => this.cancel(requestId, options),
    };
  }

  async load(): Promise<void> { await this.worker.load(); }
  terminate(reason?: string): void { this.worker.terminate(reason ?? 'Knapsack worker executor terminated.'); }

  private async run(
    requestId: number,
    request: KnapsackBridgeRequest,
    options: SolverExecutionOptions<never>,
  ): Promise<KnapsackBridgeResponse> {
    const bytes = encodeKnapsackSolverBridgeRequest(requestId, request);
    let failureHandled = false;
    try {
      const resultBytes = await this.worker.post(bytes, async (eventBytes) => {
        const event = knapsackEventFromSolverBridgeResponse(decodeSolverBridgeResponse(eventBytes));
        if (event) await options.onEvent(event);
      }, [bytes.buffer]);
      const outer = decodeSolverBridgeResponse(resultBytes);
      if (outer.payload.case === 'failure') {
        failureHandled = true;
        await options.onEvent({ type: 'failure', failure: outer.payload.value });
        throw new Error(outer.payload.value.message);
      }
      return decodeKnapsackBridgeResult(outer);
    } catch (error) {
      if (!failureHandled) {
        await options.onEvent(createSolverFailureEvent(
          this.solver,
          requestId,
          error instanceof Error ? error.message : String(error),
          SolverFailureKind.WORKER_CRASH,
          error instanceof Error ? error.stack ?? '' : '',
          true,
        ));
      }
      throw error;
    }
  }

  private async cancel(targetRequestId: number, options: SolverExecutionOptions<never>): Promise<void> {
    const requestId = this.nextRequestId++;
    const bytes = encodeSolverBridgeCancelRequest(requestId, this.solver, targetRequestId);
    try {
      await this.worker.post(bytes, undefined, [bytes.buffer]);
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.WORKER_CRASH,
        error instanceof Error ? error.stack ?? '' : '',
        true,
      ));
      throw error;
    }
  }
}
