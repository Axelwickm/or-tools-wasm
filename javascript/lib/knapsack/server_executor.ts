import { fromBinary } from '@bufbuild/protobuf';
import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import {
  decodeSolverBridgeResponse,
  encodeSolverBridgeCancelRequest,
} from '../solver_bridge.js';
import {
  createSolverFailureEvent,
  DEFAULT_SOLVER_STATUS_INTERVAL_MS,
  SolverFailureKind,
  type SolverExecutionOptions,
} from '../solver_executor.js';
import { SolverEventBatchSchema, type SolverBridgeResponse } from '../generated/bridge/job_pb.js';
import type { SolverJobFailure } from '../generated/bridge/job_pb.js';
import { KnapsackBridgeResponseSchema, type KnapsackBridgeRequest, type KnapsackBridgeResponse } from '../generated/bridge/knapsack_pb.js';
import {
  encodeKnapsackSolverBridgeRequest,
  knapsackEventFromSolverBridgeResponse,
  type KnapsackExecutorJob,
  type KnapsackExecutorLike,
} from './executor.js';

const CONTENT_TYPE = 'application/x-protobuf';
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

class RemoteKnapsackError extends Error {
  constructor(readonly failure: SolverJobFailure) {
    super(failure.message);
    if (failure.trace) this.stack = failure.trace;
  }
}

function body(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer as ArrayBuffer
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export class KnapsackServerExecutor implements KnapsackExecutorLike {
  readonly solver = 'knapsack';
  private nextRequestId = 1;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly statusIntervalMs: number;

  constructor(configuration: ServerExecutorConfiguration) {
    const endpoint = configuration.host ?? configuration.url;
    if (!endpoint) throw new Error('Knapsack server executor requires a server host.');
    const value = String(endpoint);
    this.baseUrl = value.endsWith('/') ? value : `${value}/`;
    this.headers = { ...configuration.headers };
    if (configuration.authToken) this.headers.Authorization = `Bearer ${configuration.authToken}`;
    const fetchImpl = configuration.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('Knapsack server executor requires fetch().');
    this.fetchImpl = fetchImpl.bind(globalThis) as typeof fetch;
    this.statusIntervalMs = configuration.statusIntervalMs ?? DEFAULT_SOLVER_STATUS_INTERVAL_MS;
  }

  execute(
    request: KnapsackBridgeRequest,
    options: SolverExecutionOptions<never>,
  ): KnapsackExecutorJob {
    const requestId = this.nextRequestId++;
    const submitted = this.submit(requestId, request);
    return {
      requestId,
      result: this.run(requestId, submitted, options),
      cancel: () => this.cancel(requestId, submitted),
    };
  }

  async load(): Promise<void> {
    const response = await this.fetchImpl(new URL('healthz', this.baseUrl), { headers: this.headers });
    if (!response.ok) throw new Error(`Knapsack server health check failed (${response.status}).`);
  }

  terminate(_reason?: string): void {}

  private async submit(requestId: number, request: KnapsackBridgeRequest): Promise<SolverBridgeResponse> {
    const bytes = encodeKnapsackSolverBridgeRequest(requestId, request);
    const response = await this.fetchImpl(new URL('jobs', this.baseUrl), {
      method: 'POST',
      headers: { accept: CONTENT_TYPE, 'content-type': CONTENT_TYPE, ...this.headers },
      body: body(bytes),
    });
    if (!response.ok) throw new Error(`Knapsack server submission failed (${response.status} ${response.statusText}).`);
    return decodeSolverBridgeResponse(new Uint8Array(await response.arrayBuffer()));
  }

  private async run(
    requestId: number,
    submitted: Promise<SolverBridgeResponse>,
    options: SolverExecutionOptions<never>,
  ): Promise<KnapsackBridgeResponse> {
    try {
      const accepted = await submitted;
      const immediate = await this.handle(accepted, options);
      if (immediate) return immediate;
      if (accepted.jobId === 0n) throw new Error('Knapsack server did not return a job id.');
      let sequenceId = accepted.sequenceId;
      for (;;) {
        await delay(this.statusIntervalMs);
        const eventsResponse = await this.fetchImpl(
          new URL(`jobs/${accepted.jobId}/events?after=${sequenceId}`, this.baseUrl),
          { headers: { accept: CONTENT_TYPE, ...this.headers } },
        );
        if (!eventsResponse.ok) throw new Error(`Knapsack server events failed (${eventsResponse.status}).`);
        const eventBytes = new Uint8Array(await eventsResponse.arrayBuffer());
        if (eventBytes.length) {
          const batch = fromBinary(SolverEventBatchSchema, eventBytes);
          for (const outer of batch.responses) {
            if (outer.sequenceId > sequenceId) sequenceId = outer.sequenceId;
            const result = await this.handle(outer, options);
            if (result) return result;
          }
        }
        const resultResponse = await this.fetchImpl(
          new URL(`jobs/${accepted.jobId}/result`, this.baseUrl),
          { headers: { accept: CONTENT_TYPE, ...this.headers } },
        );
        if (resultResponse.status === 204) continue;
        if (!resultResponse.ok && resultResponse.status !== 202) {
          throw new Error(`Knapsack server result failed (${resultResponse.status}).`);
        }
        const resultBytes = new Uint8Array(await resultResponse.arrayBuffer());
        if (!resultBytes.length) continue;
        const result = await this.handle(decodeSolverBridgeResponse(resultBytes), options);
        if (result) return result;
      }
    } catch (error) {
      if (error instanceof RemoteKnapsackError) throw error;
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.SERVER_DISCONNECTED,
        error instanceof Error ? error.stack ?? '' : '',
        true,
      ));
      throw error;
    }
  }

  private async handle(
    outer: SolverBridgeResponse,
    options: SolverExecutionOptions<never>,
  ): Promise<KnapsackBridgeResponse | null> {
    if (outer.solver && outer.solver !== this.solver) {
      throw new Error(`Knapsack server returned response for solver ${outer.solver}.`);
    }
    if (outer.payload.case === 'failure') {
      await options.onEvent({ type: 'failure', failure: outer.payload.value });
      throw new RemoteKnapsackError(outer.payload.value);
    }
    if (outer.payload.case === 'resultPayload') {
      return fromBinary(KnapsackBridgeResponseSchema, outer.payload.value);
    }
    const event = knapsackEventFromSolverBridgeResponse(outer);
    if (event) await options.onEvent(event);
    return null;
  }

  private async cancel(targetRequestId: number, submitted: Promise<SolverBridgeResponse>): Promise<void> {
    const accepted = await submitted;
    if (accepted.jobId === 0n) throw new Error('Knapsack server did not return a job id.');
    const bytes = encodeSolverBridgeCancelRequest(this.nextRequestId++, this.solver, targetRequestId);
    const response = await this.fetchImpl(new URL(`jobs/${accepted.jobId}/cancel`, this.baseUrl), {
      method: 'POST',
      headers: { accept: CONTENT_TYPE, 'content-type': CONTENT_TYPE, ...this.headers },
      body: body(bytes),
    });
    if (!response.ok) throw new Error(`Knapsack server cancellation failed (${response.status}).`);
  }
}
