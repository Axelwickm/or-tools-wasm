export type FixtureMode = 'direct' | 'worker';

export type SharedCaseMetadata = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
};

export type SharedCaseContext = {
  mode?: FixtureMode;
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
