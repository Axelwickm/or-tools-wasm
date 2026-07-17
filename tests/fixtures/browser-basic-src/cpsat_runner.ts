import { cpSatCases } from './cpsat_cases.ts';
import type { CpSatLike, CpSatSolveParams } from './cpsat_types.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from './shared_case.ts';

type RunMode = ExecutorFixtureMode;

type WorkerProfile = {
  label: string;
  params: CpSatSolveParams;
};

type RunOptions = {
  modes?: RunMode[];
  workerProfiles?: WorkerProfile[];
  getWorkerStats?: () => unknown;
};

type CpSatCaseRunResult = {
  id?: string;
  name: string;
  solver?: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  ok: boolean;
  solverStatus: unknown;
};

type CpSatRunResult = {
  mode: RunMode;
  workerProfile: string;
  params: CpSatSolveParams;
  ok: boolean;
  cases: CpSatCaseRunResult[];
  solverStatus?: unknown;
  workerStats: unknown;
};

const DEFAULT_WORKER_PROFILES: WorkerProfile[] = [
  { label: '1 worker', params: { numSearchWorkers: 1 } },
  { label: '4 workers', params: { numSearchWorkers: 4 } },
];

async function withCpSatExecutorMode<T>(
  CpSat: CpSatLike,
  mode: RunMode,
  run: () => Promise<T>,
): Promise<T> {
  if (mode === 'server') {
    await assertServerExecutorIsRunning();
    CpSat.setExecutor(serverExecutorConfiguration());
  } else {
    CpSat.setExecutor({ type: mode });
  }
  try {
    return await run();
  } finally {
    CpSat.setExecutor({ type: 'auto' });
  }
}

export async function runCpSatCases(CpSat: CpSatLike, options: RunOptions = {}) {
  const modes = options.modes ?? executorFixtureModes;
  const workerProfiles = options.workerProfiles ?? DEFAULT_WORKER_PROFILES;
  const getWorkerStats = options.getWorkerStats ?? (() => undefined);
  const results: CpSatRunResult[] = [];

  for (const mode of modes) {
    await withCpSatExecutorMode(CpSat, mode, async () => {
      for (const profile of workerProfiles) {
        const cases: CpSatCaseRunResult[] = [];
        for (const testCase of cpSatCases) {
          const solverStatus = await testCase.run(CpSat, profile.params);
          cases.push({
            id: testCase.id,
            name: testCase.name,
            solver: testCase.solver,
            source: testCase.source,
            upstream: testCase.upstream,
            tags: testCase.tags,
            ok: true,
            solverStatus,
          });
        }

        results.push({
          mode,
          workerProfile: profile.label,
          params: profile.params,
          ok: true,
          cases,
          solverStatus: cases.at(-1)?.solverStatus,
          workerStats: getWorkerStats(),
        });
      }
    });
  }

  return results;
}

export { cpSatCases };
