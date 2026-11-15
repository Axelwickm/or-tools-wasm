const key = Symbol.for('or-tools-wasm.single-thread-warning');
const host = globalThis as typeof globalThis & { [key]?: { enabled: boolean; printed: boolean } };
const state = () => host[key] ??= { enabled: true, printed: false };

/** Enable or suppress the once-per-page warning. Set before starting a local browser solve. */
export function setSingleThreadWarningEnabled(enabled: boolean): void {
  state().enabled = enabled;
}

export function isSingleThreadedBrowser(): boolean {
  return typeof globalThis.crossOriginIsolated === 'boolean'
    && (globalThis.crossOriginIsolated !== true || typeof globalThis.SharedArrayBuffer !== 'function');
}

export function warnSingleThreadedBrowser(): void {
  if (typeof document === 'undefined') return;
  const notice = state();
  if (!isSingleThreadedBrowser() || !notice.enabled || notice.printed) return;
  notice.printed = true;
  try {
    console.warn('OR-Tools WASM is running with one solver thread because cross-origin isolation is unavailable. '
      + 'Automatic execution runs directly and may block the UI. Enable COOP/COEP headers for parallel solving and shared worker callbacks/cancellation. '
      + 'To hide this warning, call setSingleThreadWarningEnabled(false).');
  } catch { /* Logging must not prevent solving. */ }
}
