import { fromBinary } from '@bufbuild/protobuf';
import type { ServerExecutorConfiguration } from './executor_configuration.js';
import {
  decodeSolverBridgeResponse,
  encodeSolverBridgeCancelRequest,
  encodeSolverBridgeRequest,
  type SolverBridgeCodec,
} from './solver_bridge.js';
import {
  createSolverFailureEvent,
  DEFAULT_SOLVER_STATUS_INTERVAL_MS,
  SolverFailureKind,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
} from './solver_executor.js';
import {
  SolverEventBatchSchema,
  type SolverBridgeResponse,
  type SolverJobFailure,
} from './generated/bridge/job_pb.js';

const PROTOBUF_CONTENT_TYPE = 'application/x-protobuf';
const EVENT_STREAM_CONTENT_TYPE = 'text/event-stream';
const JOB_ACCEPTED_STATUS = 202;
const JOB_NOT_READY_STATUS = 204;
const JOB_STREAM_NOT_READY_STATUS = 409;

class RemoteSolverError extends Error {
  constructor(readonly failure: SolverJobFailure, readonly emitted = false) {
    super(failure.message);
    if (failure.trace) this.stack = failure.trace;
  }
}

type StreamResult<Response> =
  | { complete: true; result: Response }
  | { complete: false; sequenceId: bigint };

function bytesBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer as ArrayBuffer
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function* serverSentEventData(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      buffer = buffer.replace(/\r\n/g, '\n');
      let separator = buffer.indexOf('\n\n');
      while (separator >= 0) {
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = frame.split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
        separator = buffer.indexOf('\n\n');
      }
      if (chunk.done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

export class SolverServerExecutor<Request, Response, Event>
implements SolverExecutor<Request, Response, Event> {
  readonly solver: string;
  private nextRequestId = 1;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly statusIntervalMs: number;

  constructor(
    private readonly codec: SolverBridgeCodec<Request, Response, Event>,
    configuration: ServerExecutorConfiguration,
  ) {
    this.solver = codec.solver;
    const value = String(configuration.url);
    this.baseUrl = value.endsWith('/') ? value : `${value}/`;
    this.headers = { ...configuration.headers };
    if (configuration.authToken) this.headers.Authorization = `Bearer ${configuration.authToken}`;
    const fetchImpl = configuration.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error(`${codec.label} server executor requires fetch().`);
    this.fetchImpl = fetchImpl.bind(globalThis) as typeof fetch;
    this.statusIntervalMs = configuration.statusIntervalMs ?? DEFAULT_SOLVER_STATUS_INTERVAL_MS;
  }

  execute(request: Request, options: SolverExecutionOptions<Event>): SolverJob<Response> {
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
    if (!response.ok) {
      throw new Error(`${this.codec.label} server health check failed (${response.status} ${response.statusText}).`);
    }
  }

  terminate(_reason?: string): void {}

  private async submit(
    requestId: number,
    request: Request,
  ): Promise<SolverBridgeResponse> {
    const bytes = encodeSolverBridgeRequest({
      requestId,
      solver: this.solver,
      payload: this.codec.encodeRequest(request),
    });
    const response = await this.fetchImpl(new URL('jobs', this.baseUrl), {
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
    options: SolverExecutionOptions<Event>,
  ): Promise<Response> {
    try {
      const accepted = await submitted;
      const immediate = await this.handleResponse(accepted, options);
      if (immediate !== null) return immediate;
      if (accepted.jobId === 0n) throw new Error(`${this.codec.label} server did not return a job id.`);
      const streamed = await this.streamResult(
        accepted.jobId,
        accepted.sequenceId,
        options,
      );
      if (streamed.complete) return streamed.result;
      return await this.pollResult(accepted.jobId, streamed.sequenceId, options);
    } catch (error) {
      if (error instanceof RemoteSolverError) {
        if (!error.emitted) await options.onEvent({ type: 'failure', failure: error.failure });
        throw error;
      }
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

  private async streamResult(
    jobId: bigint,
    initialSequenceId: bigint,
    options: SolverExecutionOptions<Event>,
  ): Promise<StreamResult<Response>> {
    let sequenceId = initialSequenceId;
    let response: globalThis.Response;
    try {
      response = await this.fetchImpl(
        new URL(`jobs/${jobId}/stream?after=${initialSequenceId}`, this.baseUrl),
        { headers: { accept: EVENT_STREAM_CONTENT_TYPE, ...this.headers } },
      );
    } catch {
      return { complete: false, sequenceId };
    }
    if (response.status === 404 || response.status === JOB_STREAM_NOT_READY_STATUS) {
      return { complete: false, sequenceId };
    }
    if (!response.ok) await this.throwHttpError('event stream', response);
    if (!response.headers.get('content-type')?.includes(EVENT_STREAM_CONTENT_TYPE) || !response.body) {
      return { complete: false, sequenceId };
    }

    try {
      for await (const data of serverSentEventData(response.body)) {
        const outer = decodeSolverBridgeResponse(decodeBase64Bytes(data));
        if (outer.sequenceId > sequenceId) sequenceId = outer.sequenceId;
        const terminal = outer.payload.case === 'resultPayload' || outer.payload.case === 'failure';
        try {
          const result = await this.handleResponse(outer, options);
          if (result !== null) return { complete: true, result };
        } finally {
          if (terminal) await this.release(jobId);
        }
      }
    } catch (error) {
      if (error instanceof RemoteSolverError) throw error;
      return { complete: false, sequenceId };
    }
    return { complete: false, sequenceId };
  }

  private async pollResult(
    jobId: bigint,
    initialSequenceId: bigint,
    options: SolverExecutionOptions<Event>,
  ): Promise<Response> {
    let sequenceId = initialSequenceId;
    let firstRequest = true;
    for (;;) {
      if (!firstRequest) await delay(this.statusIntervalMs);
      firstRequest = false;
      const eventsResponse = await this.fetchImpl(
        new URL(`jobs/${jobId}/events?after=${sequenceId}`, this.baseUrl),
        { headers: { accept: PROTOBUF_CONTENT_TYPE, ...this.headers } },
      );
      if (!eventsResponse.ok) await this.throwHttpError('events', eventsResponse);
      const eventBytes = new Uint8Array(await eventsResponse.arrayBuffer());
      if (eventBytes.byteLength) {
        const batch = fromBinary(SolverEventBatchSchema, eventBytes);
        for (const outer of batch.responses) {
          if (outer.sequenceId > sequenceId) sequenceId = outer.sequenceId;
          const terminal = outer.payload.case === 'resultPayload' || outer.payload.case === 'failure';
          try {
            const result = await this.handleResponse(outer, options);
            if (result !== null) return result;
          } finally {
            if (terminal) await this.release(jobId);
          }
        }
      }

      const outer = await this.fetchJob(new URL(`jobs/${jobId}/result`, this.baseUrl), 'result');
      if (!outer) continue;
      const terminal = outer.payload.case === 'resultPayload' || outer.payload.case === 'failure';
      try {
        const result = await this.handleResponse(outer, options);
        if (result !== null) return result;
      } finally {
        if (terminal) await this.release(jobId);
      }
    }
  }

  private async release(jobId: bigint): Promise<void> {
    await this.fetchImpl(new URL(`jobs/${jobId}`, this.baseUrl), {
      method: 'DELETE',
      headers: this.headers,
    }).catch(() => undefined);
  }

  private async fetchJob(url: URL, operation: string): Promise<SolverBridgeResponse | null> {
    const response = await this.fetchImpl(url, {
      headers: { accept: PROTOBUF_CONTENT_TYPE, ...this.headers },
    });
    if (response.status === JOB_NOT_READY_STATUS) return null;
    if (response.status !== JOB_ACCEPTED_STATUS && !response.ok) {
      await this.throwHttpError(operation, response);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength ? decodeSolverBridgeResponse(bytes) : null;
  }

  private async handleResponse(
    outer: SolverBridgeResponse,
    options: SolverExecutionOptions<Event>,
  ): Promise<Response | null> {
    if (outer.solver && outer.solver !== this.solver) {
      throw new Error(`${this.codec.label} server returned response for solver ${outer.solver}.`);
    }
    switch (outer.payload.case) {
      case 'failure':
        await options.onEvent({ type: 'failure', failure: outer.payload.value });
        throw new RemoteSolverError(outer.payload.value, true);
      case 'status':
        await options.onEvent({ type: 'status', status: outer.payload.value });
        return null;
      case 'eventPayload': {
        const event = this.codec.decodeEvent?.(outer.payload.value);
        if (event !== null && event !== undefined) await options.onEvent(event);
        return null;
      }
      case 'resultPayload':
        return this.codec.decodeResult(outer.payload.value);
      default:
        return null;
    }
  }

  private async cancel(
    targetRequestId: number,
    submitted: Promise<SolverBridgeResponse>,
  ): Promise<void> {
    const accepted = await submitted;
    if (accepted.jobId === 0n) throw new Error(`${this.codec.label} server did not return a job id.`);
    const bytes = encodeSolverBridgeCancelRequest(this.nextRequestId++, this.solver, targetRequestId);
    const response = await this.fetchImpl(new URL(`jobs/${accepted.jobId}/cancel`, this.baseUrl), {
      method: 'POST',
      headers: { accept: PROTOBUF_CONTENT_TYPE, 'content-type': PROTOBUF_CONTENT_TYPE, ...this.headers },
      body: bytesBody(bytes),
    });
    if (!response.ok) await this.throwHttpError('cancel', response);
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    if (!responseBytes.byteLength) return;
    const acknowledgement = decodeSolverBridgeResponse(responseBytes);
    if (acknowledgement.payload.case === 'failure') {
      throw new RemoteSolverError(acknowledgement.payload.value);
    }
    if (acknowledgement.payload.case !== 'cancelled' ||
        acknowledgement.payload.value.targetRequestId !== targetRequestId) {
      throw new Error(`${this.codec.label} server returned an invalid cancellation acknowledgement.`);
    }
  }

  private async throwHttpError(operation: string, response: globalThis.Response): Promise<never> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes(PROTOBUF_CONTENT_TYPE)) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength) {
        const outer = decodeSolverBridgeResponse(bytes);
        if (outer.payload.case === 'failure') throw new RemoteSolverError(outer.payload.value);
      }
    }
    const detail = await response.text().catch(() => '');
    throw new Error(
      `${this.codec.label} server job ${operation} failed ` +
      `(${response.status} ${response.statusText}): ${detail}`,
    );
  }
}
