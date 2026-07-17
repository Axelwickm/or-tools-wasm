export type FixtureMode = 'direct' | 'worker';

export const fixtureModes: readonly FixtureMode[] = ['direct', 'worker'];

export type ExecutorFixtureMode = FixtureMode | 'server';

export const executorFixtureModes: readonly ExecutorFixtureMode[] = ['direct', 'worker', 'server'];

export const serverExecutorHost = 'http://127.0.0.1:17827/';
export const serverExecutorAuthToken: string | undefined = undefined;

export function serverExecutorConfiguration() {
  return {
    type: 'server',
    host: serverExecutorHost,
    authToken: serverExecutorAuthToken,
    statusIntervalMs: 20,
  } as const;
}

export async function assertServerExecutorIsRunning() {
  const configuration = serverExecutorConfiguration();
  let response: Response;
  try {
    response = await fetch(new URL('healthz', configuration.host), {
      headers: configuration.authToken
        ? { Authorization: `Bearer ${configuration.authToken}` }
        : undefined,
    });
  } catch (error) {
    throw new Error(
      `Server executor fixture expected a running server at ${serverExecutorHost}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!response.ok) {
    throw new Error(
      `Server executor fixture health check failed at ${serverExecutorHost} (${response.status} ${response.statusText})`,
    );
  }
}

export type WorkerBridgeApi = {
  setWorkerBridgeEnabled(enabled: boolean): void;
  isWorkerBridgeEnabled(): boolean;
  isWorkerBridgeAvailable?(): boolean;
};

export function fixtureModesFor(api: WorkerBridgeApi): readonly FixtureMode[] {
  return api.isWorkerBridgeAvailable?.() === false ? ['direct'] : fixtureModes;
}

export function setWorkerBridgeMode(api: WorkerBridgeApi, mode: FixtureMode, label: string) {
  api.setWorkerBridgeEnabled(mode === 'worker');
  if (api.isWorkerBridgeEnabled() !== (mode === 'worker')) {
    throw new Error(`${label} worker bridge state mismatch for ${mode}`);
  }
}

export async function withWorkerBridgeMode<T>(
  api: WorkerBridgeApi,
  mode: FixtureMode,
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  setWorkerBridgeMode(api, mode, label);
  try {
    return await run();
  } finally {
    api.setWorkerBridgeEnabled(false);
  }
}

export type SharedCaseMetadata = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
};

export type SharedCaseContext = {
  mode?: ExecutorFixtureMode;
  workerProfile?: string;
  params?: Record<string, unknown>;
  threads?: number;
};

export type SharedCase<Api, Result extends Record<string, unknown> = Record<string, unknown>> = SharedCaseMetadata & {
  run(api: Api, context: SharedCaseContext): Promise<Result>;
};

export type SharedCaseResult = SharedCaseMetadata & SharedCaseContext & {
  ok: boolean;
};

export function passedCase<Result extends Record<string, unknown>>(
  testCase: SharedCaseMetadata,
  context: SharedCaseContext,
  result: Result,
): SharedCaseResult & Result {
  return {
    ...result,
    id: testCase.id,
    name: testCase.name,
    solver: testCase.solver,
    source: testCase.source,
    upstream: testCase.upstream,
    tags: testCase.tags,
    mode: context.mode,
    workerProfile: context.workerProfile,
    params: context.params,
    threads: context.threads,
    ok: true,
  };
}
