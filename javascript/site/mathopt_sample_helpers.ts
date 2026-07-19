import { setExecutor } from 'or-tools-wasm/mathopt';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { getMaxWorkerCount } from './worker_limits.js';

export const statusEl = document.getElementById('status');
export const solutionOutput = document.getElementById('solution-output');
export const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
export const workerCountInput = document.getElementById('worker-count') as HTMLInputElement | null;
export const runButton = document.getElementById('run') as HTMLButtonElement | null;

export function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

export function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : (runButton.dataset.idleLabel ?? 'Solve');
}

export function clearStatus() {
  if (statusEl) statusEl.textContent = '';
}

export function configureMathOptRun() {
  const requested = Number(workerCountInput?.value ?? getMaxWorkerCount());
  return Math.max(1, Math.min(getMaxWorkerCount(), Number.isFinite(requested) ? Math.floor(requested) : 1));
}

configureSolverExecutorSelector({ setExecutor }, executorSelector);

export function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? 'n/a' : value.toFixed(6).replace(/\.?0+$/, '');
}

export function renderRows(rows: Array<[string, string | number | null | undefined]>) {
  if (!solutionOutput) return;
  solutionOutput.innerHTML = `
    <table>
      <tbody>
        ${rows.map(([label, value]) => `<tr><th>${label}</th><td>${typeof value === 'number' ? formatNumber(value) : value ?? 'n/a'}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}
