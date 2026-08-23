import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { executeKnapsackNative, loadKnapsackNativeModule } from './native_runtime.js';
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
};

const nowMs = () => BigInt(Date.now());

type KnapsackJobState = {
  cancelled: boolean;
};

export class KnapsackExecutor implements KnapsackExecutorLike {
  readonly solver = 'knapsack';
  private nextRequestId = 1;

  async load(): Promise<void> {
    await loadKnapsackNativeModule();
  }

  execute(
    request: KnapsackBridgeRequest,
    options: SolverExecutionOptions<never>,
  ): KnapsackExecutorJob {
    const requestId = this.nextRequestId++;
    const state: KnapsackJobState = { cancelled: false };
    return {
      requestId,
      result: this.run(requestId, request, options.onEvent, state),
      cancel: () => this.cancel(requestId, options.onEvent, state),
    };
  }

  terminate(_reason?: string): void {}

  private async run(
    requestId: number,
    request: KnapsackBridgeRequest,
    onEvent: KnapsackExecutorEventHandler,
    state: KnapsackJobState,
  ): Promise<KnapsackBridgeResponse> {
    const createdAtMs = nowMs();
    try {
      await onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.STARTING, createdAtMs,
      ));
      if (state.cancelled) {
        throw new DOMException('The Knapsack solve was aborted.', 'AbortError');
      }
      await onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.RUNNING, createdAtMs, nowMs(),
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
      const terminalState = state.cancelled
        ? SolverJobState.CANCELLED
        : SolverJobState.SUCCEEDED;
      await onEvent(createSolverJobStatusEvent(this.solver, requestId, terminalState, createdAtMs));
      return create(KnapsackBridgeResponseSchema, {
        profit: result.profit ?? 0,
        optimal: result.optimal === true,
        contains: result.contains ?? [],
      });
    } catch (error) {
      if (state.cancelled) {
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
    }
  }

  private async cancel(
    requestId: number,
    onEvent: KnapsackExecutorEventHandler,
    state: KnapsackJobState,
  ): Promise<void> {
    state.cancelled = true;
    await onEvent(createSolverJobStatusEvent(
      this.solver, requestId, SolverJobState.CANCELLING, nowMs(),
    ));
  }
}
