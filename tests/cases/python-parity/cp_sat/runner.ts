import { cpSatCases } from './cases.ts';
import {
  withCpSatExecutor,
  type CpSatLike,
  type CpSatSolveParams,
} from '../../../harness/cpsat_types.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from '../../../harness/shared_case.ts';

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

async function executorForMode(mode: RunMode) {
  if (mode === 'server') {
    await assertServerExecutorIsRunning();
    return serverExecutorConfiguration();
  }
  return mode;
}

export async function runCpSatCases(CpSat: CpSatLike, options: RunOptions = {}) {
  const modes = options.modes ?? executorFixtureModes;
  const workerProfiles = options.workerProfiles ?? DEFAULT_WORKER_PROFILES;
  const getWorkerStats = options.getWorkerStats ?? (() => undefined);
  const results: CpSatRunResult[] = [];

  for (const mode of modes) {
    const scopedCpSat = withCpSatExecutor(CpSat, await executorForMode(mode));
    for (const profile of workerProfiles) {
      const cases: CpSatCaseRunResult[] = [];
      for (const testCase of cpSatCases) {
        const solverStatus = await testCase.run(scopedCpSat, profile.params);
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
  }

  return results;
}

export { cpSatCases };
