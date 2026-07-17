/// <reference lib="webworker" />

import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { CpSatExecutor } from './executor.js';
import {
  CpSatBridgeRequestSchema,
  CpSatBridgeResponseSchema,
} from '../generated/bridge/cp_sat_pb.js';
import {
  decodeSolverBridgeRequest,
  encodeSolverBridgeCancelled,
  encodeSolverBridgeEvent,
  encodeSolverBridgeFailure,
  encodeSolverBridgeResult,
  encodeSolverBridgeStatus,
} from '../solver_bridge.js';
import type { SolverJob } from '../solver_executor.js';
import type { CpSatBridgeResponse } from '../generated/bridge/cp_sat_pb.js';
import { SolverFailureKind, SolverJobFailureSchema } from '../generated/bridge/job_pb.js';

const workerScope = self as DedicatedWorkerGlobalScope;
const executor = new CpSatExecutor();
const jobs = new Map<number, SolverJob<CpSatBridgeResponse>>();
const solver = 'cp-sat';

function post(bytes: Uint8Array) {
  workerScope.postMessage(bytes, [bytes.buffer]);
}

workerScope.onmessage = async (event: MessageEvent<Uint8Array>) => {
  const outerRequest = decodeSolverBridgeRequest(event.data);
  let failureSent = false;
  try {
    if (outerRequest.solver !== solver) {
      throw new Error(`CP-SAT worker received unsupported solver request: ${outerRequest.solver}`);
    }

    if (outerRequest.operation.case === 'cancel') {
      const targetRequestId = outerRequest.operation.value.targetRequestId;
      const job = jobs.get(targetRequestId);
      if (job) await job.cancel();
      post(encodeSolverBridgeCancelled(outerRequest.requestId, solver, targetRequestId));
      return;
    }
    if (outerRequest.operation.case !== 'executePayload') {
      throw new Error('CP-SAT worker request has no operation.');
    }

    const request = fromBinary(CpSatBridgeRequestSchema, outerRequest.operation.value);
    const job = executor.execute(request.payload, {
      requestedThreads: outerRequest.settings?.requestedThreads ?? 0,
      onEvent: async (solverEvent) => {
        if ('type' in solverEvent) {
          if (solverEvent.type === 'status') {
            post(encodeSolverBridgeStatus(
              outerRequest.requestId,
              solver,
              solverEvent.status,
            ));
          } else {
            failureSent = true;
            post(encodeSolverBridgeFailure(
              outerRequest.requestId,
              solver,
              solverEvent.failure,
            ));
          }
          return;
        }
        post(encodeSolverBridgeEvent(
          outerRequest.requestId,
          solver,
          toBinary(CpSatBridgeResponseSchema, solverEvent),
        ));
      },
    });
    jobs.set(outerRequest.requestId, job);
    try {
      const result = await job.result;
      post(encodeSolverBridgeResult(
        outerRequest.requestId,
        solver,
        toBinary(CpSatBridgeResponseSchema, result),
      ));
    } finally {
      jobs.delete(outerRequest.requestId);
    }
  } catch (error) {
    if (failureSent) return;
    const message = error instanceof Error ? error.message : String(error);
    const failure = create(SolverJobFailureSchema, {
      requestId: outerRequest.requestId,
      solver,
      kind: SolverFailureKind.WORKER_CRASH,
      message,
      trace: error instanceof Error ? error.stack ?? '' : '',
      retryable: true,
    });
    post(encodeSolverBridgeFailure(outerRequest.requestId, solver, failure));
  }
};
