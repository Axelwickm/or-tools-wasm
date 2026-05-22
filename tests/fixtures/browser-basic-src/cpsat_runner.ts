import { cpSatCases } from './cpsat_cases.ts';
import type { CpSatLike, CpSatSolveParams } from './cpsat_types.ts';
import { withWorkerBridgeMode } from './shared_case.ts';

type RunMode = 'direct' | 'worker';

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

const DEFAULT_MODES: RunMode[] = ['direct', 'worker'];
const DEFAULT_WORKER_PROFILES: WorkerProfile[] = [
  { label: '1 worker', params: { numSearchWorkers: 1 } },
  { label: '4 workers', params: { numSearchWorkers: 4 } },
];

export async function runCpSatCases(CpSat: CpSatLike, options: RunOptions = {}) {
  const modes = options.modes ?? DEFAULT_MODES;
  const workerProfiles = options.workerProfiles ?? DEFAULT_WORKER_PROFILES;
  const getWorkerStats = options.getWorkerStats ?? (() => undefined);
  const results: CpSatRunResult[] = [];

  for (const mode of modes) {
    await withWorkerBridgeMode(CpSat, mode, 'CP-SAT', async () => {
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
