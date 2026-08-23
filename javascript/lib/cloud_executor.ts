import { packageName, version } from './package_metadata.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
  type SolverExecutor,
  type SolverJob,
} from './solver_executor.js';

export const CLOUD_STATUS_URL =
  'https://or-tools-wasm-api.axelwickman.com/status';

type ProcessLike = {
  env?: Record<string, string | undefined>;
  stdout?: { isTTY?: boolean };
};

export type CloudExecutorOptions = {
  fetch?: typeof fetch;
  log?: (message: string) => void;
  test?: boolean;
};

export class CloudExecutorUnavailableError extends Error {
  readonly cause?: unknown;

  constructor(
    message = 'OR-Tools WASM Cloud execution is not currently available.',
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = 'CloudExecutorUnavailableError';
    this.cause = options?.cause;
  }
}

function processLike(): ProcessLike | undefined {
  return (globalThis as typeof globalThis & { process?: ProcessLike }).process;
}

export function terminalSupportsColor(): boolean {
  const process = processLike();
  if (!process) return false;
  if (process.env?.NO_COLOR !== undefined) return false;
  if (process.env?.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== '0';
  }
  return process.stdout?.isTTY === true;
}

export class CloudExecutor<Request, Response, Event>
implements SolverExecutor<Request, Response, Event> {
  private nextRequestId = 1;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (message: string) => void;
  private readonly test: boolean;
  private readonly controllers = new Set<AbortController>();

  constructor(
    readonly solver: string,
    options: CloudExecutorOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.log = options.log ?? ((message) => console.info(message));
    this.test = options.test === true;
  }

  async load(): Promise<void> {}

  execute(
    _request: Request,
    options: SolverExecutionOptions<Event>,
  ): SolverJob<Response> {
    const requestId = this.nextRequestId++;
    const controller = new AbortController();
    this.controllers.add(controller);
    return {
      requestId,
      result: this.run(requestId, controller, options),
      cancel: () => this.cancel(requestId, controller, options),
    };
  }

  terminate(reason?: string): void {
    for (const controller of this.controllers.values()) controller.abort(reason);
    this.controllers.clear();
  }

  private async run(
    requestId: number,
    controller: AbortController,
    options: SolverExecutionOptions<Event>,
  ): Promise<Response> {
    const createdAtMs = BigInt(Date.now());
    const onEvent = options.onEvent;
    await onEvent(createSolverJobStatusEvent(
      this.solver,
      requestId,
      SolverJobState.STARTING,
      createdAtMs,
    ));

    try {
      const response = await this.fetchImpl(CLOUD_STATUS_URL, {
        method: 'POST',
        headers: {
          accept: terminalSupportsColor() ? 'text/x-ansi' : 'text/plain',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          package: packageName,
          version,
          ...(this.test ? { test: true } : {}),
        }),
        signal: controller.signal,
      });
      const statusMessage = await response.text();
      if (statusMessage) this.log(statusMessage);

      const error = new CloudExecutorUnavailableError();
      await onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error.message,
        SolverFailureKind.UNSUPPORTED_SOLVER,
      ));
      await onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.FAILED,
        createdAtMs,
      ));
      throw error;
    } catch (error) {
      if (error instanceof CloudExecutorUnavailableError) throw error;
      if (controller.signal.aborted) {
        const cancelled = new CloudExecutorUnavailableError(
          'OR-Tools WASM Cloud status request was cancelled.',
          { cause: error },
        );
        await onEvent(createSolverFailureEvent(
          this.solver,
          requestId,
          cancelled.message,
          SolverFailureKind.CANCELLED,
        ));
        await onEvent(createSolverJobStatusEvent(
          this.solver,
          requestId,
          SolverJobState.CANCELLED,
          createdAtMs,
        ));
        throw cancelled;
      }

      const unavailable = new CloudExecutorUnavailableError(
        'Could not reach OR-Tools WASM Cloud.',
        { cause: error },
      );
      await onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        unavailable.message,
        SolverFailureKind.EXECUTOR_ERROR,
      ));
      await onEvent(createSolverJobStatusEvent(
        this.solver,
        requestId,
        SolverJobState.FAILED,
        createdAtMs,
      ));
      throw unavailable;
    } finally {
      this.controllers.delete(controller);
    }
  }

  private async cancel(
    requestId: number,
    controller: AbortController,
    options: SolverExecutionOptions<Event>,
  ): Promise<void> {
    if (!this.controllers.has(controller)) return;
    await options.onEvent(createSolverJobStatusEvent(
      this.solver,
      requestId,
      SolverJobState.CANCELLING,
      BigInt(Date.now()),
    ));
    controller.abort();
  }
}
