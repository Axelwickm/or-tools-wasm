import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { executeKnapsackNative, loadMPSolverNativeModule } from '../mp_solver/native_runtime.js';
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
  KnapsackBridgeRequestSchema,
  KnapsackBridgeResponseSchema,
  type KnapsackBridgeRequest,
  type KnapsackBridgeResponse,
} from '../generated/bridge/knapsack_pb.js';

export type KnapsackExecutorEvent = SolverJobEvent;
export type KnapsackExecutorEventHandler = (event: KnapsackExecutorEvent) => void | Promise<void>;
export type KnapsackExecutorJob = SolverJob<KnapsackBridgeResponse>;
export type KnapsackExecutorLike = SolverExecutor<KnapsackBridgeRequest, KnapsackBridgeResponse, never>;

export const knapsackBridgeCodec: SolverBridgeCodec<
  KnapsackBridgeRequest,
  KnapsackBridgeResponse,
  never
> = {
  solver: 'knapsack',
  label: 'Knapsack',
  encodeRequest: (request) => toBinary(KnapsackBridgeRequestSchema, request),
  decodeRequest: (payload) => fromBinary(KnapsackBridgeRequestSchema, payload),
  encodeResult: (response) => toBinary(KnapsackBridgeResponseSchema, response),
  decodeResult: (payload) => fromBinary(KnapsackBridgeResponseSchema, payload),
  defaultRequestedThreads: 1,
};

const nowMs = () => BigInt(Date.now());

export class KnapsackExecutor implements KnapsackExecutorLike {
  readonly solver = 'knapsack';
  private nextRequestId = 1;
  private readonly cancelledRequests = new Set<number>();

  async load(): Promise<void> {
    await loadMPSolverNativeModule();
  }

  execute(
    request: KnapsackBridgeRequest,
    options: SolverExecutionOptions<never>,
  ): KnapsackExecutorJob {
    const requestId = this.nextRequestId++;
    return {
      requestId,
      result: this.run(requestId, request, options.onEvent),
      cancel: () => this.cancel(requestId, options.onEvent),
    };
  }

  terminate(_reason?: string): void {}

  private async run(
    requestId: number,
    request: KnapsackBridgeRequest,
    onEvent: KnapsackExecutorEventHandler,
  ): Promise<KnapsackBridgeResponse> {
    const createdAtMs = nowMs();
    try {
      await onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.STARTING, createdAtMs,
      ));
      if (this.cancelledRequests.has(requestId)) {
        throw new DOMException('The Knapsack solve was aborted.', 'AbortError');
      }
      await onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.RUNNING, createdAtMs, nowMs(), 1,
      ));
      const result = await executeKnapsackNative(
        request.solverType,
        request.name,
        request.useReduction,
        request.timeLimitSeconds,
        request.profits,
        request.weights.map((dimension) => dimension.values),
        request.capacities,
      );
      const state = this.cancelledRequests.has(requestId)
        ? SolverJobState.CANCELLED
        : SolverJobState.SUCCEEDED;
      await onEvent(createSolverJobStatusEvent(this.solver, requestId, state, createdAtMs));
      return create(KnapsackBridgeResponseSchema, {
        profit: result.profit ?? 0,
        optimal: result.optimal === true,
        contains: result.contains ?? [],
      });
    } catch (error) {
      if (this.cancelledRequests.has(requestId)) {
        await onEvent(createSolverJobStatusEvent(
          this.solver, requestId, SolverJobState.CANCELLED, createdAtMs,
        ));
        throw error;
      }
      const failure = createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.INTERNAL,
        error instanceof Error ? error.stack ?? '' : '',
      );
      await onEvent(failure);
      await onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.FAILED, createdAtMs,
      ));
      throw error;
    } finally {
      this.cancelledRequests.delete(requestId);
    }
  }

  private async cancel(requestId: number, onEvent: KnapsackExecutorEventHandler): Promise<void> {
    this.cancelledRequests.add(requestId);
    await onEvent(createSolverJobStatusEvent(
      this.solver, requestId, SolverJobState.CANCELLING, nowMs(),
    ));
  }
}
