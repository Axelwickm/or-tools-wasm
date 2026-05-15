import { cpSatCases } from './cpsat_cases.ts';
import type { CpSatLike, CpSatSolveParams } from './cpsat_types.ts';

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

const DEFAULT_MODES: RunMode[] = ['direct', 'worker'];
const DEFAULT_WORKER_PROFILES: WorkerProfile[] = [
  { label: '1 worker', params: { numSearchWorkers: 1 } },
  { label: '4 workers', params: { numSearchWorkers: 4 } },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runCpSatCases(CpSat: CpSatLike, options: RunOptions = {}) {
  const modes = options.modes ?? DEFAULT_MODES;
  const workerProfiles = options.workerProfiles ?? DEFAULT_WORKER_PROFILES;
  const getWorkerStats = options.getWorkerStats ?? (() => undefined);
  const results = [];

  for (const mode of modes) {
    CpSat.setWorkerBridgeEnabled(mode === 'worker');
    assert(CpSat.isWorkerBridgeEnabled() === (mode === 'worker'), `worker bridge state mismatch for ${mode}`);

    for (const profile of workerProfiles) {
      const cases = [];
      for (const testCase of cpSatCases) {
        const solverStatus = await testCase.run(CpSat, profile.params);
        cases.push({
          name: testCase.name,
          source: testCase.source,
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
