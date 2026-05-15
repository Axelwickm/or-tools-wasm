import { runCpSatCases } from '../../browser-basic-src/cpsat_runner.ts';

const statusEl = document.getElementById('status');

type RunResult = {
  mode: 'direct' | 'worker';
  ok: boolean;
  solverStatus?: unknown;
  cases: Array<{
    name: string;
    ok: boolean;
    solverStatus: unknown;
  }>;
  workerStats: WorkerStats;
};

type WorkerStats = {
  total: number;
  pthread: number;
};

type CpSatApi = typeof import('or-tools-wasm')['CpSat'];

function setStatus(value: unknown) {
  if (statusEl) {
    statusEl.textContent = JSON.stringify(value, null, 2);
  }
}

function installWorkerSpy() {
  const originalWorker = window.Worker;
  const creations: Array<{ url: string; name?: string }> = [];

  window.Worker = function WorkerSpy(scriptURL: string | URL, options?: WorkerOptions) {
    creations.push({
      url: String(scriptURL),
      name: options?.name,
    });
    return new originalWorker(scriptURL, options);
  } as unknown as typeof Worker;

  return {
    snapshot(): WorkerStats {
      return {
        total: creations.length,
        pthread: creations.filter((creation) => creation.name?.startsWith('em-pthread-')).length,
      };
    },
  };
}

function forceSmallHardwareConcurrency() {
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    configurable: true,
    value: 2,
  });
}

async function main() {
  setStatus({ ok: false, phase: 'running' });
  forceSmallHardwareConcurrency();
  const workerSpy = installWorkerSpy();
  const { CpSat } = await import('or-tools-wasm');
  const typedCpSat: CpSatApi = CpSat;
  const results = await runCpSatCases(typedCpSat, {
    getWorkerStats: workerSpy.snapshot,
  }) as RunResult[];
  setStatus({ ok: true, results });
}

void main();
