import { SolverWorkerExecutor, type WorkerLike } from '../worker_helpers.js';
import type { CpSatBridgeResponse } from '../generated/bridge/cp_sat_pb.js';
import {
  cpSatBridgeCodec,
  type CpSatExecutorLike,
  type CpSatExecutorRequest,
} from './executor.js';

declare const __ORTOOLS_WASM_BROWSER_BUILD__: boolean | undefined;

const isDeno = 'Deno' in globalThis;
const isBun = 'Bun' in globalThis;
const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string' && !isDeno && !isBun;

async function createCpSatWorker(): Promise<WorkerLike<Uint8Array, Uint8Array>> {
  if (typeof __ORTOOLS_WASM_BROWSER_BUILD__ !== 'undefined' && __ORTOOLS_WASM_BROWSER_BUILD__) {
    return new Worker(new URL('./worker.js', import.meta.url), {
      type: 'module',
      name: 'ortools-executor-cp-sat',
    });
  }
  if (isNode || isDeno) {
    const { Worker: NodeWorker } = await import('node:worker_threads');
    return new NodeWorker(
      new URL('./cp_sat_node_worker_bridge.js', import.meta.url),
      { execArgv: [] },
    ) as WorkerLike<Uint8Array, Uint8Array>;
  }
  return new Worker(new URL('./worker.js', import.meta.url), {
    type: 'module',
    name: 'ortools-executor-cp-sat',
  });
}

export class CpSatWorkerExecutor
  extends SolverWorkerExecutor<CpSatExecutorRequest, CpSatBridgeResponse, CpSatBridgeResponse>
  implements CpSatExecutorLike {
  constructor() {
    super(cpSatBridgeCodec, createCpSatWorker);
  }
}
