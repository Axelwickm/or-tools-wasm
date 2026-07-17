import { create, fromBinary } from '@bufbuild/protobuf';
import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import {
  decodeSolverBridgeResponse,
  encodeSolverBridgeCancelRequest,
} from '../solver_bridge.js';
import { DEFAULT_SOLVER_STATUS_INTERVAL_MS } from '../solver_executor.js';
import type { SolverExecutionOptions } from '../solver_executor.js';
import {
  CpSatBridgeRequestSchema,
  CpSatBridgeResponseSchema,
  type CpSatBridgeRequest,
  type CpSatBridgeResponse,
} from '../generated/bridge/cp_sat_pb.js';
import {
  SolverEventBatchSchema,
  SolverFailureKind,
  type SolverJobFailure,
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

const PROTOBUF_CONTENT_TYPE = 'application/x-protobuf';
const JOB_ACCEPTED_STATUS = 202;
const JOB_NOT_READY_STATUS = 204;

type FetchLike = typeof fetch;

class RemoteSolverError extends Error {
  constructor(readonly failure: SolverJobFailure, readonly emitted = false) {
    super(failure.message);
    if (failure.trace) this.stack = failure.trace;
  }
}

function currentFetch(fetchImpl?: FetchLike): FetchLike {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('CP-SAT server executor requires fetch().');
  return fetchFn.bind(globalThis) as FetchLike;
}

function normalizeBaseUrl(url: string | URL): string {
  const value = String(url);
  return value.endsWith('/') ? value : `${value}/`;
}

function bytesBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer as ArrayBuffer
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CpSatServerExecutor implements CpSatExecutorLike {
  readonly solver = 'cp-sat';
  private nextRequestId = 1;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl?: FetchLike;
  private readonly statusIntervalMs: number;

  constructor(configuration: ServerExecutorConfiguration) {
    const endpoint = configuration.host ?? configuration.url;
    if (!endpoint) throw new Error('CP-SAT server executor requires a server host.');
    this.baseUrl = normalizeBaseUrl(endpoint);
    this.headers = { ...configuration.headers };
    if (configuration.authToken) this.headers.Authorization = `Bearer ${configuration.authToken}`;
    this.fetchImpl = configuration.fetch;
    this.statusIntervalMs = configuration.statusIntervalMs ?? DEFAULT_SOLVER_STATUS_INTERVAL_MS;
  }

  execute(
    payload: CpSatExecutorRequest,
    options: SolverExecutionOptions<CpSatBridgeResponse>,
  ): CpSatExecutorJob {
    const requestId = this.nextCpSatRequestId();
    const request = create(CpSatBridgeRequestSchema, { payload });
    const submitted = this.submit(requestId, request, options.requestedThreads ?? 0);
    return {
      requestId,
      result: this.run(requestId, submitted, options.onEvent),
      cancel: () => this.cancel(requestId, submitted),
    };
  }

  async load(): Promise<void> {
    const response = await currentFetch(this.fetchImpl)(new URL('healthz', this.baseUrl), {
      headers: this.headers,
    });
    if (!response.ok) {
      throw new Error(`CP-SAT server health check failed (${response.status} ${response.statusText}).`);
    }
  }

  terminate(_reason?: string): void {}

  private async submit(
    requestId: number,
    request: CpSatBridgeRequest,
    requestedThreads: number,
  ): Promise<SolverBridgeResponse> {
    const bytes = encodeCpSatSolverBridgeRequest(requestId, request, requestedThreads);
    const response = await currentFetch(this.fetchImpl)(new URL('jobs', this.baseUrl), {
      method: 'POST',
      headers: { accept: PROTOBUF_CONTENT_TYPE, 'content-type': PROTOBUF_CONTENT_TYPE, ...this.headers },
      body: bytesBody(bytes),
    });
    if (!response.ok) await this.throwHttpError('submission', response);
    return decodeSolverBridgeResponse(new Uint8Array(await response.arrayBuffer()));
  }

  private async run(
    requestId: number,
    submitted: Promise<SolverBridgeResponse>,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    try {
      const submittedResponse = await submitted;
      const immediate = await this.handleResponse(submittedResponse, onEvent);
      if (immediate) return immediate;
      if (submittedResponse.jobId === 0n) throw new Error('CP-SAT server did not return a job id.');
      return await this.pollResult(
        submittedResponse.jobId,
        submittedResponse.sequenceId,
        onEvent,
      );
    } catch (error) {
      if (error instanceof RemoteSolverError) {
        if (!error.emitted) await onEvent({ type: 'failure', failure: error.failure });
        throw error;
      }
      const failure = createCpSatFailureEvent(
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.SERVER_DISCONNECTED,
        error instanceof Error ? error.stack ?? '' : '',
        true,
      );
      await onEvent(failure);
      throw error;
    }
  }

  private async pollResult(
    jobId: bigint,
    initialSequenceId: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    let sequenceId = initialSequenceId;
    for (;;) {
      await delay(this.statusIntervalMs);
      const eventsResponse = await currentFetch(this.fetchImpl)(
        new URL(`jobs/${jobId}/events?after=${sequenceId}`, this.baseUrl),
        { headers: { accept: PROTOBUF_CONTENT_TYPE, ...this.headers } },
      );
      if (!eventsResponse.ok) await this.throwHttpError('events', eventsResponse);
      const eventBytes = new Uint8Array(await eventsResponse.arrayBuffer());
      if (eventBytes.byteLength) {
        const batch = fromBinary(SolverEventBatchSchema, eventBytes);
        for (const outer of batch.responses) {
          if (outer.sequenceId > sequenceId) sequenceId = outer.sequenceId;
          const eventResult = await this.handleResponse(outer, onEvent);
          if (eventResult) return eventResult;
        }
      }

      const outer = await this.fetchJob(new URL(`jobs/${jobId}/result`, this.baseUrl), 'result');
      if (!outer) continue;
      const result = await this.handleResponse(outer, onEvent);
      if (result) return result;
    }
  }

  private async fetchJob(url: URL, operation: string): Promise<SolverBridgeResponse | null> {
    const response = await currentFetch(this.fetchImpl)(url, {
      headers: { accept: PROTOBUF_CONTENT_TYPE, ...this.headers },
    });
    if (response.status === JOB_NOT_READY_STATUS) return null;
    if (response.status !== JOB_ACCEPTED_STATUS && !response.ok) await this.throwHttpError(operation, response);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength ? decodeSolverBridgeResponse(bytes) : null;
  }

  private async handleResponse(
    outer: SolverBridgeResponse,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse | null> {
    if (outer.solver && outer.solver !== this.solver) {
      throw new Error(`CP-SAT server returned response for unsupported solver: ${outer.solver}`);
    }
    if (outer.payload.case === 'failure') {
      await onEvent({ type: 'failure', failure: outer.payload.value });
      throw new RemoteSolverError(outer.payload.value, true);
    }
    if (outer.payload.case === 'resultPayload') {
      return fromBinary(CpSatBridgeResponseSchema, outer.payload.value);
    }
    const event = cpSatEventFromSolverBridgeResponse(outer);
    if (event) await onEvent(event);
    return null;
  }

  private async cancel(
    targetRequestId: number,
    submitted: Promise<SolverBridgeResponse>,
  ): Promise<void> {
    const outer = await submitted;
    if (outer.jobId === 0n) throw new Error('CP-SAT server did not return a job id.');
    const requestId = this.nextCpSatRequestId();
    const bytes = encodeSolverBridgeCancelRequest(requestId, this.solver, targetRequestId);
    const response = await currentFetch(this.fetchImpl)(new URL(`jobs/${outer.jobId}/cancel`, this.baseUrl), {
      method: 'POST',
      headers: { accept: PROTOBUF_CONTENT_TYPE, 'content-type': PROTOBUF_CONTENT_TYPE, ...this.headers },
      body: bytesBody(bytes),
    });
    if (!response.ok) await this.throwHttpError('cancel', response);
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    if (responseBytes.byteLength) {
      const acknowledgement = decodeSolverBridgeResponse(responseBytes);
      if (acknowledgement.payload.case === 'failure') {
        throw new RemoteSolverError(acknowledgement.payload.value);
      }
      if (acknowledgement.payload.case !== 'cancelled' ||
          acknowledgement.payload.value.targetRequestId !== targetRequestId) {
        throw new Error('CP-SAT server returned an invalid cancellation acknowledgement.');
      }
    }
  }

  private async throwHttpError(operation: string, response: Response): Promise<never> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes(PROTOBUF_CONTENT_TYPE)) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength) {
        const outer = decodeSolverBridgeResponse(bytes);
        if (outer.payload.case === 'failure') throw new RemoteSolverError(outer.payload.value);
      }
    }
    const detail = await response.text().catch(() => '');
    throw new Error(`CP-SAT server job ${operation} failed (${response.status} ${response.statusText}): ${detail}`);
  }

  private nextCpSatRequestId() {
    return this.nextRequestId++;
  }
}
