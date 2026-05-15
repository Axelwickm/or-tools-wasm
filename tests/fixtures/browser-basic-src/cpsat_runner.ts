import { cpSatCases } from './cpsat_cases.ts';
import type { CpSatLike } from './cpsat_types.ts';

type RunMode = 'direct' | 'worker';

type RunOptions = {
  modes?: RunMode[];
  getWorkerStats?: () => unknown;
};

const DEFAULT_MODES: RunMode[] = ['direct', 'worker'];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runCpSatCases(CpSat: CpSatLike, options: RunOptions = {}) {
  const modes = options.modes ?? DEFAULT_MODES;
  const getWorkerStats = options.getWorkerStats ?? (() => undefined);
  const results = [];

  for (const mode of modes) {
    CpSat.setWorkerBridgeEnabled(mode === 'worker');
    assert(CpSat.isWorkerBridgeEnabled() === (mode === 'worker'), `worker bridge state mismatch for ${mode}`);

    const cases = [];
    for (const testCase of cpSatCases) {
      const solverStatus = await testCase.run(CpSat);
      cases.push({
        name: testCase.name,
        source: testCase.source,
        ok: true,
        solverStatus,
      });
    }

    results.push({
      mode,
      ok: true,
      cases,
      solverStatus: cases.at(-1)?.solverStatus,
      workerStats: getWorkerStats(),
    });
  }

  return results;
}

export { cpSatCases };
