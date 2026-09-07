const FALLBACK_WORKER_COUNT = 8;

export function getMaxWorkerCount(): number {
  const hardware =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : FALLBACK_WORKER_COUNT;
  return Math.max(1, Math.floor(hardware));
}
