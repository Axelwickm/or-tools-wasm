import { runCpSatCases } from '../../browser-basic-src/cpsat_runner.ts';
import type { CpSat as CpSatValue } from 'or-tools-wasm';

const statusEl = document.getElementById('status');

function setStatus(value: unknown) {
  if (statusEl) {
    statusEl.textContent = JSON.stringify(value, null, 2);
  }
}

function installWorkerSpy() {
  const OriginalWorker = window.Worker;
  const creations: Array<{ url: string; name?: string }> = [];

  window.Worker = function WorkerSpy(scriptURL: string | URL, options?: WorkerOptions) {
    creations.push({
      url: String(scriptURL),
      name: options?.name,
    });
    return new OriginalWorker(scriptURL, options);
  } as unknown as typeof Worker;

  return {
    snapshot() {
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
  const typedCpSat: typeof CpSatValue = CpSat;
  const results = await runCpSatCases(typedCpSat, {
    getWorkerStats: workerSpy.snapshot,
  });
  setStatus({ ok: true, results });
}

void main();
