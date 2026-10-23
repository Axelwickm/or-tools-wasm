import { fromBinary } from '@bufbuild/protobuf';
import type { ServerExecutorConfiguration } from './executor_configuration.js';
import {
  decodeSolverBridgeResponse,
  encodeSolverBridgeCancelRequest,
  encodeSolverBridgeInterruptRequest,
  encodeSolverBridgeCallbackReply,
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
  type SolverResourceRequest,
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
const CALLBACK_POLL_INTERVAL_MS = 20;
const CALLBACK_REPLY_TIMEOUT_MS = 30_000;
const JOB_RELEASE_TIMEOUT_MS = 1_000;
const JOB_STOP_TIMEOUT_MS = 30_000;

class RemoteSolverError extends Error {
  constructor(readonly failure: SolverJobFailure, readonly emitted = false) {
    super(failure.message);
    this.name = failure.kind === SolverFailureKind.CANCELLED ? 'AbortError' : 'RemoteSolverError';
    if (failure.trace) this.stack = failure.trace;
  }
}

class ServerConnectionError extends Error {
  constructor(readonly cause: unknown) {
    const error = cause;
    super(error instanceof Error ? error.message : String(error));
    this.name = error instanceof Error ? error.name : 'Error';
    if (error instanceof Error) this.stack = error.stack;
  }
}

class ServerHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

class CallbackTransportError extends Error {
  constructor(readonly cause: unknown) { super(cause instanceof Error ? cause.message : String(cause)); }
}

type StreamResult<Response> =
  | { complete: true; result: Response }
  | { complete: false; sequenceId: bigint };

function bytesBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer as ArrayBuffer
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { await withAbortSignal(signal, () => new Promise<void>(resolve => { timeout = setTimeout(resolve, ms); })); }
  finally { clearTimeout(timeout); }
}

async function withRequestDeadline<T>(
  timeoutMs: number,
  message: string,
  request: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parentSignal!.reason);
  parentSignal?.addEventListener('abort', onAbort, { once: true });
  if (parentSignal?.aborted) onAbort();
  const timeout = setTimeout(() => {
    const reason = new Error(message);
    reason.name = 'TimeoutError';
    controller.abort(reason);
  }, timeoutMs);
  try {
    return await withAbortSignal(controller.signal, () => request(controller.signal));
  } finally { clearTimeout(timeout); parentSignal?.removeEventListener('abort', onAbort); }
}

async function withAbortSignal<T>(signal: AbortSignal, action: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new ServerConnectionError(signal.reason);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ServerConnectionError(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const result = await Promise.race([action(), aborted]);
    if (signal.aborted) throw new ServerConnectionError(signal.reason);
    return result;
  } finally { signal.removeEventListener('abort', onAbort); }
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
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const onAbort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await withAbortSignal(signal, () => reader.read()).catch(error => {
        throw error instanceof ServerConnectionError ? error : new ServerConnectionError(error);
      });
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
    signal.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => {});
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
    const controller = new AbortController();
    let finished = false;
    let cancelled = false;
    let interrupted = false;
    let abandoned = false;
    let terminal = false;
    const controlController = new AbortController();
    let stopTimeout: ReturnType<typeof setTimeout> | undefined;
    let stopRequest: Promise<void> | undefined;
    const terminalReceived = () => {
      terminal = true;
      clearTimeout(stopTimeout); stopTimeout = undefined;
      controlController.abort();
    };
    let submissionSettled = false;
    let rejectSubmission!: (error: Error) => void;
    const submissionCancelled = new Promise<never>((_, reject) => { rejectSubmission = reject; });
    const submission = this.submit(requestId, request, options.resources,
      options.onAbandonedResult ? undefined : controller.signal).then(accepted => {
      submissionSettled = true;
      // Custom fetch implementations may deliver acceptance after cancellation.
      // Stop that late job without delaying the cancelled caller.
      if (controller.signal.aborted && accepted.jobId !== 0n) {
        void this.cancel(requestId, Promise.resolve(accepted), this.codec.solver === 'mathopt').catch(() => {});
      }
      if (interrupted && !abandoned && !controller.signal.aborted) void stop(false).catch(() => {});
      return accepted;
    }, error => { submissionSettled = true; throw error; });
    const submitted = options.onAbandonedResult ? submission : Promise.race([submission, submissionCancelled]);
    const abandon = (reason: Error) => {
      abandoned = true;
      clearTimeout(stopTimeout); stopTimeout = undefined;
      rejectSubmission(new ServerConnectionError(reason));
    };
    const stop = (abort: boolean) => {
      if (finished || terminal) return Promise.resolve();
      cancelled ||= abort;
      interrupted ||= !abort;
      if (abort && options.onAbandonedResult && !abandoned) {
        const reason = new Error(`${this.codec.label} server operation was cancelled.`);
        reason.name = 'AbortError';
        abandon(reason);
      }
      // Cancelling a creation job can discard its successful handle on the
      // server. Let it finish so the abandoned-result hook can dispose it.
      if (abandoned) return Promise.resolve();
      if ((submissionSettled || !abort) && stopTimeout === undefined) {
        stopTimeout = setTimeout(() => {
          const reason = new Error(`${this.codec.label} server ${cancelled ? 'cancellation' : 'interruption'} did not settle within 30 seconds.`);
          reason.name = cancelled ? 'AbortError' : 'TimeoutError';
          if (options.onAbandonedResult) { abandon(reason); return; }
          controller.abort(reason);
          controlController.abort(reason);
        }, JOB_STOP_TIMEOUT_MS);
      }
      if (submissionSettled) {
        if (!stopRequest) {
          stopRequest = this.cancel(requestId, submission, this.codec.solver === 'mathopt' || !abort, controlController.signal)
            .catch(error => { if (!terminal) throw error; });
        }
        return stopRequest;
      }
      if (!abort) return Promise.resolve();
      const reason = new Error(`${this.codec.label} server submission was cancelled.`);
      reason.name = 'AbortError';
      rejectSubmission(new ServerConnectionError(reason));
      controller.abort(reason);
      return Promise.resolve();
    };
    // Resource creation must finish reading its reply even if the caller leaves:
    // only that reply identifies the native resource which must be disposed.
    const running = this.run(requestId, submitted,
      { ...options, onEvent: event => abandoned ? undefined : options.onEvent(event) }, controller.signal, terminalReceived)
      .then(async result => {
        if (abandoned) await options.onAbandonedResult!(this.codec.encodeResult(result));
        return result;
      })
      .finally(() => { finished = true; terminalReceived(); });
    return {
      requestId,
      result: options.onAbandonedResult ? Promise.race([running, submissionCancelled]).catch(async error => {
        if (abandoned) await options.onEvent(createSolverFailureEvent(this.solver, requestId, error.message,
          error.name === 'TimeoutError' ? SolverFailureKind.TIMEOUT : SolverFailureKind.CANCELLED,
          error.stack ?? '', error.name === 'TimeoutError'));
        throw error;
      }) : running,
      cancel: () => stop(true),
      interrupt: this.codec.solver === 'mathopt' || this.codec.solver === 'cp-sat' ? () => stop(false) : undefined,
    };
  }

  async load(): Promise<void> {
    const response = await this.fetch(new URL('healthz', this.baseUrl), { headers: this.headers });
    if (!response.ok) {
      throw new Error(`${this.codec.label} server health check failed (${response.status} ${response.statusText}).`);
    }
  }

  terminate(_reason?: string): void {}

  private async fetch(input: URL, init?: RequestInit, acceptLateSubmission = false): Promise<globalThis.Response> {
    try {
      if (init?.signal?.aborted) throw new ServerConnectionError(init.signal.reason);
      const response = await this.fetchImpl(input, init);
      if (init?.signal?.aborted && !acceptLateSubmission) {
        void response.body?.cancel(init.signal.reason).catch(() => {});
        throw new ServerConnectionError(init.signal.reason);
      }
      return response;
    } catch (error) {
      throw error instanceof ServerConnectionError ? error : new ServerConnectionError(error);
    }
  }

  private async submit(
    requestId: number,
    request: Request,
    resources?: SolverResourceRequest,
    signal?: AbortSignal,
  ): Promise<SolverBridgeResponse> {
    const bytes = encodeSolverBridgeRequest({
      requestId,
      solver: this.solver,
      payload: this.codec.encodeRequest(request),
      resources,
    });
    const response = await this.fetch(new URL('jobs', this.baseUrl), {
      method: 'POST',
      headers: { accept: PROTOBUF_CONTENT_TYPE, 'content-type': PROTOBUF_CONTENT_TYPE, ...this.headers },
      body: bytesBody(bytes),
      signal,
    }, true);
    if (!response.ok) await this.throwHttpError('submission', response);
    return decodeSolverBridgeResponse(new Uint8Array(await response.arrayBuffer()));
  }

  private async run(
    requestId: number,
    submitted: Promise<SolverBridgeResponse>,
    options: SolverExecutionOptions<Event>,
    signal: AbortSignal,
    terminalReceived: () => void,
  ): Promise<Response> {
    try {
      return await withAbortSignal(signal, async () => {
        const accepted = await submitted;
        const immediate = await this.handleResponse(accepted, options, signal, terminalReceived);
        if (immediate !== null) return immediate;
        if (accepted.jobId === 0n) throw new Error(`${this.codec.label} server did not return a job id.`);
        // HTTP/1.1 streams can occupy every browser connection to this origin,
        // leaving callback POSTs queued while native search waits for their replies.
        if (options.onCallback) return await this.pollResult(accepted.jobId, accepted.sequenceId, options, signal, terminalReceived);
        const streamed = await this.streamResult(accepted.jobId, accepted.sequenceId, options, signal, terminalReceived);
        if (streamed.complete) return streamed.result;
        return await this.pollResult(accepted.jobId, streamed.sequenceId, options, signal, terminalReceived);
      });
    } catch (error) {
      if (error instanceof ServerHttpError && error.status === 410 && !options.onAbandonedResult) {
        void this.cancel(requestId, submitted).catch(() => undefined);
      }
      if (error instanceof CallbackTransportError) {
        void this.cancel(requestId, submitted).catch(() => undefined);
        error = error.cause;
      }
      if (error instanceof RemoteSolverError) {
        if (!error.emitted) await options.onEvent({ type: 'failure', failure: error.failure });
        throw error;
      }
      let kind = SolverFailureKind.EXECUTOR_ERROR;
      let retryable = false;
      if (error instanceof ServerConnectionError) {
        kind = error.name === 'TimeoutError' ? SolverFailureKind.TIMEOUT
          : error.name === 'AbortError' ? SolverFailureKind.CANCELLED : SolverFailureKind.SERVER_DISCONNECTED;
        retryable = kind !== SolverFailureKind.CANCELLED;
      } else if (error instanceof ServerHttpError) {
        if (error.status === 401 || error.status === 403) kind = SolverFailureKind.UNAUTHENTICATED;
        else if (error.status === 408 || error.status === 504) kind = SolverFailureKind.TIMEOUT;
        else if (error.status === 429) kind = SolverFailureKind.QUEUE_FULL;
        else if (error.status >= 400 && error.status < 500) kind = SolverFailureKind.INVALID_REQUEST;
        retryable = error.status === 408 || error.status === 429 || error.status >= 500;
      }
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        kind,
        error instanceof Error ? error.stack ?? '' : '',
        retryable,
      ));
      throw error;
    }
  }

  private async streamResult(
    jobId: bigint,
    initialSequenceId: bigint,
    options: SolverExecutionOptions<Event>,
    signal: AbortSignal,
    terminalReceived: () => void,
  ): Promise<StreamResult<Response>> {
    let sequenceId = initialSequenceId;
    let response: globalThis.Response;
    try {
      response = await this.fetch(
        new URL(`jobs/${jobId}/stream?after=${initialSequenceId}`, this.baseUrl),
        { headers: { accept: EVENT_STREAM_CONTENT_TYPE, ...this.headers }, signal },
      );
    } catch (error) {
      if (signal.aborted) throw error;
      return { complete: false, sequenceId };
    }
    if (response.status === 404 || response.status === JOB_STREAM_NOT_READY_STATUS || response.status === 503) {
      void response.body?.cancel().catch(() => {});
      return { complete: false, sequenceId };
    }
    if (!response.ok) await this.throwHttpError('event stream', response);
    if (!response.headers.get('content-type')?.includes(EVENT_STREAM_CONTENT_TYPE) || !response.body) {
      return { complete: false, sequenceId };
    }

    try {
      for await (const data of serverSentEventData(response.body, signal)) {
        const outer = decodeSolverBridgeResponse(decodeBase64Bytes(data));
        if (outer.sequenceId > sequenceId) sequenceId = outer.sequenceId;
        const terminal = outer.payload.case === 'resultPayload' || outer.payload.case === 'failure';
        try {
          const result = await this.handleResponse(outer, options, signal, terminalReceived);
          if (result !== null) return { complete: true, result };
        } finally {
          if (terminal) await this.release(jobId);
        }
      }
    } catch (error) {
      if (error instanceof ServerConnectionError && !signal.aborted) return { complete: false, sequenceId };
      throw error;
    }
    return { complete: false, sequenceId };
  }

  private async pollResult(
    jobId: bigint,
    initialSequenceId: bigint,
    options: SolverExecutionOptions<Event>,
    signal: AbortSignal,
    terminalReceived: () => void,
  ): Promise<Response> {
    let sequenceId = initialSequenceId;
    const pollIntervalMs = options.onCallback
      ? Math.min(this.statusIntervalMs, CALLBACK_POLL_INTERVAL_MS)
      : this.statusIntervalMs;
    let pollImmediately = true;
    for (;;) {
      if (!pollImmediately) await delay(pollIntervalMs, signal);
      if (signal.aborted) throw new ServerConnectionError(signal.reason);
      pollImmediately = false;
      const eventsResponse = await this.fetch(
        new URL(`jobs/${jobId}/events?after=${sequenceId}`, this.baseUrl),
        { headers: { accept: PROTOBUF_CONTENT_TYPE, ...this.headers }, signal },
      );
      if (!eventsResponse.ok) await this.throwHttpError('events', eventsResponse);
      const eventBytes = new Uint8Array(await eventsResponse.arrayBuffer());
      if (eventBytes.byteLength) {
        const batch = fromBinary(SolverEventBatchSchema, eventBytes);
        for (const outer of batch.responses) {
          if (outer.sequenceId > sequenceId) sequenceId = outer.sequenceId;
          const terminal = outer.payload.case === 'resultPayload' || outer.payload.case === 'failure';
          try {
            const result = await this.handleResponse(outer, options, signal, terminalReceived);
            if (result !== null) return result;
            if (outer.payload.case === 'callbackRequest') pollImmediately = true;
          } finally {
            if (terminal) await this.release(jobId);
          }
        }
      }

      // Replying can unblock the next native callback immediately. Read events
      // again without a status delay or an intervening result request.
      if (pollImmediately) continue;
      const outer = await this.fetchJob(new URL(`jobs/${jobId}/result`, this.baseUrl), 'result', signal);
      if (!outer) continue;
      const terminal = outer.payload.case === 'resultPayload' || outer.payload.case === 'failure';
      try {
        const result = await this.handleResponse(outer, options, signal, terminalReceived);
        if (result !== null) return result;
      } finally {
        if (terminal) await this.release(jobId);
      }
    }
  }

  private async release(jobId: bigint): Promise<void> {
    // Cleanup is best effort; completed results must not wait for network recovery.
    await withRequestDeadline(JOB_RELEASE_TIMEOUT_MS, 'Solver job cleanup timed out.', async signal => {
      const response = await this.fetch(new URL(`jobs/${jobId}`, this.baseUrl), {
        method: 'DELETE', headers: this.headers, signal,
      });
      await response.arrayBuffer();
    }).catch(() => undefined);
  }

  private async fetchJob(url: URL, operation: string, signal: AbortSignal): Promise<SolverBridgeResponse | null> {
    const response = await this.fetch(url, {
      headers: { accept: PROTOBUF_CONTENT_TYPE, ...this.headers }, signal,
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
    signal: AbortSignal,
    terminalReceived: () => void,
  ): Promise<Response | null> {
    if (signal.aborted) throw new ServerConnectionError(signal.reason);
    if (outer.solver && outer.solver !== this.solver) {
      throw new Error(`${this.codec.label} server returned response for solver ${outer.solver}.`);
    }
    switch (outer.payload.case) {
      case 'callbackRequest': {
        const request = outer.payload.value;
        if (!options.onCallback) throw new CallbackTransportError(new Error('No solver callback handler registered.'));
        let payload: Uint8Array = new Uint8Array();
        let error = '';
        try {
          payload = options.onCallback(request.payload);
        } catch (caught) { error = (caught instanceof Error ? caught.message : String(caught)) || 'Solver callback failed.'; }
        const bytes = encodeSolverBridgeCallbackReply(outer.requestId, this.solver, request.callbackId, payload, error);
        try {
          await withRequestDeadline(CALLBACK_REPLY_TIMEOUT_MS, 'Solver callback reply timed out.', async replySignal => {
            const reply = await this.fetch(new URL(`jobs/${outer.jobId}/callback`, this.baseUrl), {
              method: 'POST', headers: { 'content-type': PROTOBUF_CONTENT_TYPE, ...this.headers },
              body: bytesBody(bytes), signal: replySignal,
            });
            // A closed callback wait settles through the job's terminal response.
            if (!reply.ok && reply.status !== 409) await this.throwHttpError('callback reply', reply);
            await reply.arrayBuffer();
          }, signal);
        } catch (cause) { throw new CallbackTransportError(cause); }
        return null;
      }
      case 'failure':
        terminalReceived();
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
        terminalReceived();
        return this.codec.decodeResult(outer.payload.value);
      default:
        return null;
    }
  }

  private async cancel(
    targetRequestId: number,
    submitted: Promise<SolverBridgeResponse>,
    nativeInterruption = false,
    signal?: AbortSignal,
  ): Promise<void> {
    return withRequestDeadline(JOB_STOP_TIMEOUT_MS, `${this.codec.label} server stop request timed out.`, async controlSignal => {
      const accepted = await submitted;
      if (accepted.jobId === 0n) throw new Error(`${this.codec.label} server did not return a job id.`);
      const bytes = (nativeInterruption ? encodeSolverBridgeInterruptRequest : encodeSolverBridgeCancelRequest)(this.nextRequestId++, this.solver, targetRequestId);
      const operation = nativeInterruption ? 'interrupt' : 'cancel';
      const response = await this.fetch(new URL(`jobs/${accepted.jobId}/${operation}`, this.baseUrl), {
        method: 'POST',
        headers: { accept: PROTOBUF_CONTENT_TYPE, 'content-type': PROTOBUF_CONTENT_TYPE, ...this.headers },
        body: bytesBody(bytes), signal: controlSignal,
      });
      if (!response.ok) await this.throwHttpError('cancel', response);
      const responseBytes = new Uint8Array(await response.arrayBuffer());
      if (!responseBytes.byteLength) return;
      const acknowledgement = decodeSolverBridgeResponse(responseBytes);
      if (acknowledgement.payload.case === 'failure') throw new RemoteSolverError(acknowledgement.payload.value);
      if ((acknowledgement.payload.case !== 'interrupted' && acknowledgement.payload.case !== 'cancelled') ||
          nativeInterruption !== (acknowledgement.payload.case === 'interrupted') ||
          acknowledgement.payload.value.targetRequestId !== targetRequestId)
        throw new Error(`${this.codec.label} server returned an invalid cancellation acknowledgement.`);
    }, signal);
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
    throw new ServerHttpError(
      `${this.codec.label} server job ${operation} failed ` +
      `(${response.status} ${response.statusText}): ${detail}`,
      response.status,
    );
  }
}
