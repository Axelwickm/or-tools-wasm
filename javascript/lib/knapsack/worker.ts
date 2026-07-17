/// <reference lib="webworker" />

import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { KnapsackExecutor } from './executor.js';
import { KnapsackBridgeRequestSchema, KnapsackBridgeResponseSchema } from '../generated/bridge/knapsack_pb.js';
import {
  decodeSolverBridgeRequest,
  encodeSolverBridgeCancelled,
  encodeSolverBridgeFailure,
  encodeSolverBridgeResult,
  encodeSolverBridgeStatus,
} from '../solver_bridge.js';
import type { SolverJob } from '../solver_executor.js';
import type { KnapsackBridgeResponse } from '../generated/bridge/knapsack_pb.js';
import { SolverFailureKind, SolverJobFailureSchema } from '../generated/bridge/job_pb.js';

const scope = self as DedicatedWorkerGlobalScope;
const executor = new KnapsackExecutor();
const jobs = new Map<number, SolverJob<KnapsackBridgeResponse>>();
const solver = 'knapsack';

function post(bytes: Uint8Array) {
  scope.postMessage(bytes, [bytes.buffer]);
}

scope.onmessage = async (event: MessageEvent<Uint8Array>) => {
  const outer = decodeSolverBridgeRequest(event.data);
  let failureSent = false;
  try {
    if (outer.solver !== solver) throw new Error(`Knapsack worker received unsupported solver: ${outer.solver}`);
    if (outer.operation.case === 'cancel') {
      const targetRequestId = outer.operation.value.targetRequestId;
      await jobs.get(targetRequestId)?.cancel();
      post(encodeSolverBridgeCancelled(outer.requestId, solver, targetRequestId));
      return;
    }
    if (outer.operation.case !== 'executePayload') throw new Error('Knapsack worker request has no operation.');
    const request = fromBinary(KnapsackBridgeRequestSchema, outer.operation.value);
    const job = executor.execute(request, {
      onEvent: async (jobEvent) => {
        if (jobEvent.type === 'status') {
          post(encodeSolverBridgeStatus(outer.requestId, solver, jobEvent.status));
        } else {
          failureSent = true;
          post(encodeSolverBridgeFailure(outer.requestId, solver, jobEvent.failure));
        }
      },
    });
    jobs.set(outer.requestId, job);
    try {
      const result = await job.result;
      post(encodeSolverBridgeResult(
        outer.requestId,
        solver,
        toBinary(KnapsackBridgeResponseSchema, result),
      ));
    } finally {
      jobs.delete(outer.requestId);
    }
  } catch (error) {
    if (failureSent) return;
    const failure = create(SolverJobFailureSchema, {
      requestId: outer.requestId,
      solver,
      kind: SolverFailureKind.WORKER_CRASH,
      message: error instanceof Error ? error.message : String(error),
      trace: error instanceof Error ? error.stack ?? '' : '',
      retryable: true,
    });
    post(encodeSolverBridgeFailure(outer.requestId, solver, failure));
  }
};
