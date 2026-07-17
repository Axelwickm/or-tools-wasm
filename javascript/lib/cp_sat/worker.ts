/// <reference lib="webworker" />

import { CpSatExecutor } from './executor.js';
import {
  decodeSolverBridgeRequest,
  encodeSolverBridgeEvent,
  encodeSolverBridgeResult,
} from '../solver_bridge.js';

type CpSatWorkerRequest = {
  id: number;
  bytes: Uint8Array;
};

type CpSatWorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: number; bytes: Uint8Array }
  | { type: 'event'; id: number; bytes: Uint8Array }
  | { type: 'error'; id: number; error: string };

const workerScope = self as DedicatedWorkerGlobalScope;
const executor = new CpSatExecutor();
const solver = 'cp-sat';

workerScope.postMessage({ type: 'ready' } satisfies CpSatWorkerResponse);

workerScope.onmessage = async (event: MessageEvent<CpSatWorkerRequest>) => {
  const message = event.data;
  try {
    const request = decodeSolverBridgeRequest(message.bytes);
    if (request.solver !== solver) {
      throw new Error(`CP-SAT worker received unsupported solver request: ${request.solver}`);
    }

    const resultBytes = await executor.executeBytes(request.payload, async (eventBytes) => {
      const bridgeEventBytes = encodeSolverBridgeEvent(request.requestId, solver, eventBytes);
      workerScope.postMessage({
        type: 'event',
        id: request.requestId,
        bytes: bridgeEventBytes,
      } satisfies CpSatWorkerResponse, [bridgeEventBytes.buffer]);
    });
    const bridgeResultBytes = encodeSolverBridgeResult(request.requestId, solver, resultBytes);
    workerScope.postMessage({
      type: 'result',
      id: request.requestId,
      bytes: bridgeResultBytes,
    } satisfies CpSatWorkerResponse, [bridgeResultBytes.buffer]);
  } catch (error) {
    workerScope.postMessage({
      type: 'error',
      id: message?.id ?? 0,
      error: error instanceof Error ? error.message : String(error),
    } satisfies CpSatWorkerResponse);
  }
};
