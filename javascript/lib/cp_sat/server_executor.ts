import { create } from '@bufbuild/protobuf';
import type { ServerExecutorConfiguration } from '../executor_configuration.js';
import {
  decodeSolverBridgeResponse,
} from '../solver_bridge.js';
import { DEFAULT_SOLVER_STATUS_INTERVAL_MS } from '../solver_executor.js';
import {
  CpSatBridgeRequestSchema,
  type CpSatBridgeRequest,
  type CpSatBridgeResponse,
} from '../generated/bridge/cp_sat_pb.js';
import { SolverFailureKind, type SolverBridgeResponse } from '../generated/bridge/job_pb.js';
import {
  cpSatResponseFromSolverBridgeResponse,
  createCpSatCancelBridgeRequest,
  createCpSatFailureBridgeResponse,
  encodeCpSatSolverBridgeRequest,
  type CpSatExecutorEventHandler,
  type CpSatExecutorJob,
  type CpSatExecutorLike,
  type CpSatExecutorRequest,
} from './executor.js';

const PROTOBUF_CONTENT_TYPE = 'application/x-protobuf';
// Server polling contract:
//   200 + SolverBridgeResponse: event/status/failure/result payload.
//   202 + SolverBridgeResponse: accepted or still running, usually status/event.
//   204 + empty body: no new status/result available yet.
const JOB_ACCEPTED_STATUS = 202;
const JOB_NOT_READY_STATUS = 204;

type FetchLike = typeof fetch;

function currentFetch(fetchImpl?: FetchLike): FetchLike {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('CP-SAT server executor requires fetch().');
  }
  return fetchFn.bind(globalThis) as FetchLike;
}

function normalizeBaseUrl(url: string | URL): string {
  const value = String(url);
  return value.endsWith('/') ? value : `${value}/`;
}

function serverBaseUrl(configuration: ServerExecutorConfiguration): string {
  const endpoint = configuration.host ?? configuration.url;
  if (!endpoint) {
    throw new Error('CP-SAT server executor requires a server host.');
  }
  return normalizeBaseUrl(endpoint);
}

function serverHeaders(configuration: ServerExecutorConfiguration): Record<string, string> {
  const headers = { ...configuration.headers };
  if (configuration.authToken) {
    headers.Authorization = `Bearer ${configuration.authToken}`;
  }
  return headers;
}

function jobsEndpoint(baseUrl: string): string {
  return new URL('jobs', baseUrl).href;
}

function jobEndpoint(baseUrl: string, jobId: bigint): string {
  return new URL(`jobs/${jobId.toString()}`, baseUrl).href;
}

function jobResultEndpoint(baseUrl: string, jobId: bigint): string {
  return new URL(`jobs/${jobId.toString()}/result`, baseUrl).href;
}

function jobCancelEndpoint(baseUrl: string, jobId: bigint): string {
  return new URL(`jobs/${jobId.toString()}/cancel`, baseUrl).href;
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
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
    this.baseUrl = serverBaseUrl(configuration);
    this.headers = serverHeaders(configuration);
    this.fetchImpl = configuration.fetch;
    this.statusIntervalMs = configuration.statusIntervalMs ?? DEFAULT_SOLVER_STATUS_INTERVAL_MS;
  }

  execute(
    payload: CpSatExecutorRequest,
    onEvent: CpSatExecutorEventHandler,
  ): CpSatExecutorJob {
    const request = this.createRequest(payload);
    const submitted = this.submit(request);
    return {
      requestId: request.requestId,
      result: this.run(request, submitted, onEvent),
      cancel: () => this.cancel(request.requestId, submitted, onEvent),
    };
  }

  async load(): Promise<void> {}

  terminate(_reason?: string): void {}

  private async submit(request: CpSatBridgeRequest): Promise<SolverBridgeResponse> {
    const response = await currentFetch(this.fetchImpl)(jobsEndpoint(this.baseUrl), {
      method: 'POST',
      headers: {
        accept: PROTOBUF_CONTENT_TYPE,
        'content-type': PROTOBUF_CONTENT_TYPE,
        ...this.headers,
      },
      body: bytesBody(encodeCpSatSolverBridgeRequest(request)),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`CP-SAT server job submission failed (${response.status} ${response.statusText}): ${detail}`);
    }

    return decodeSolverBridgeResponse(await readResponseBytes(response));
  }

  private async run(
    request: CpSatBridgeRequest,
    submitted: Promise<SolverBridgeResponse>,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    try {
      const submittedResponse = await submitted;
      const submittedResult = await this.handleBridgeResponse(request.requestId, submittedResponse, onEvent);
      if (submittedResult) return submittedResult;
      if (submittedResponse.jobId === 0n) {
        throw new Error('CP-SAT server did not return a job id.');
      }
      return await this.pollResult(request.requestId, submittedResponse.jobId, onEvent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack ?? '' : '';
      const failure = createCpSatFailureBridgeResponse(
        request.requestId,
        message,
        SolverFailureKind.SERVER_DISCONNECTED,
        trace,
        true,
      );
      await onEvent(failure);
      return failure;
    }
  }

  private async pollResult(
    requestId: number,
    jobId: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    for (;;) {
      await delay(this.statusIntervalMs);

      const statusResult = await this.pollStatus(requestId, jobId, onEvent);
      if (statusResult) return statusResult;

      const response = await currentFetch(this.fetchImpl)(jobResultEndpoint(this.baseUrl, jobId), {
        method: 'GET',
        headers: {
          accept: PROTOBUF_CONTENT_TYPE,
          ...this.headers,
        },
      });

      if (response.status === JOB_NOT_READY_STATUS) continue;
      if (response.status !== JOB_ACCEPTED_STATUS && !response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`CP-SAT server job result failed (${response.status} ${response.statusText}): ${detail}`);
      }

      const bytes = await readResponseBytes(response);
      if (bytes.byteLength === 0) continue;
      const bridgeResponse = decodeSolverBridgeResponse(bytes);
      const result = await this.handleBridgeResponse(requestId, bridgeResponse, onEvent);
      if (result) return result;
    }
  }

  private async pollStatus(
    requestId: number,
    jobId: bigint,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse | null> {
    const response = await currentFetch(this.fetchImpl)(jobEndpoint(this.baseUrl, jobId), {
      method: 'GET',
      headers: {
        accept: PROTOBUF_CONTENT_TYPE,
        ...this.headers,
      },
    });

    if (response.status === JOB_NOT_READY_STATUS) return null;
    if (response.status !== JOB_ACCEPTED_STATUS && !response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`CP-SAT server job status failed (${response.status} ${response.statusText}): ${detail}`);
    }

    const bytes = await readResponseBytes(response);
    if (bytes.byteLength === 0) return null;
    return this.handleBridgeResponse(requestId, decodeSolverBridgeResponse(bytes), onEvent);
  }

  private async handleBridgeResponse(
    requestId: number,
    response: SolverBridgeResponse,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse | null> {
    if (response.solver && response.solver !== this.solver) {
      return createCpSatFailureBridgeResponse(
        requestId,
        `CP-SAT server returned response for unsupported solver: ${response.solver}`,
        SolverFailureKind.SERVER_DISCONNECTED,
        '',
        true,
      );
    }

    const cpSatResponse = cpSatResponseFromSolverBridgeResponse(
      requestId,
      response,
      SolverFailureKind.SERVER_DISCONNECTED,
    );
    switch (response.payload.case) {
      case 'eventPayload':
      case 'status':
        await onEvent(cpSatResponse);
        return null;
      case 'failure':
      case 'resultPayload':
        return cpSatResponse;
      default:
        return cpSatResponse;
    }
  }

  private async cancel(
    targetRequestId: number,
    submitted: Promise<SolverBridgeResponse>,
    onEvent: CpSatExecutorEventHandler,
  ): Promise<CpSatBridgeResponse> {
    const cancelRequest = createCpSatCancelBridgeRequest(this.nextCpSatRequestId(), targetRequestId);
    try {
      const submittedResponse = await submitted;
      if (submittedResponse.jobId === 0n) {
        throw new Error('CP-SAT server did not return a job id.');
      }

      const response = await currentFetch(this.fetchImpl)(jobCancelEndpoint(this.baseUrl, submittedResponse.jobId), {
        method: 'POST',
        headers: {
          accept: PROTOBUF_CONTENT_TYPE,
          'content-type': PROTOBUF_CONTENT_TYPE,
          ...this.headers,
        },
        body: bytesBody(encodeCpSatSolverBridgeRequest(cancelRequest)),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`CP-SAT server cancel failed (${response.status} ${response.statusText}): ${detail}`);
      }

      const bridgeResponse = decodeSolverBridgeResponse(await readResponseBytes(response));
      const cpSatResponse = await this.handleBridgeResponse(cancelRequest.requestId, bridgeResponse, onEvent);
      return cpSatResponse ?? createCpSatFailureBridgeResponse(
        cancelRequest.requestId,
        'CP-SAT server cancel did not return a terminal response.',
        SolverFailureKind.SERVER_DISCONNECTED,
        '',
        true,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const trace = error instanceof Error ? error.stack ?? '' : '';
      const failure = createCpSatFailureBridgeResponse(
        cancelRequest.requestId,
        message,
        SolverFailureKind.SERVER_DISCONNECTED,
        trace,
        true,
      );
      await onEvent(failure);
      return failure;
    }
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
