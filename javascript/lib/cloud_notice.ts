import { optionalEnvironmentVariable, terminalSupportsColor } from './cloud_executor.js';

const stateKey = Symbol.for('or-tools-wasm.cloud-notice');
type NoticeState = { printed: boolean; enabled?: boolean };
const host = globalThis as typeof globalThis & {
  [stateKey]?: NoticeState;
};

function state(): NoticeState {
  return host[stateKey] ??= { printed: false };
}

/**
 * Enable or suppress the once-per-JavaScript-context cloud notice after a local
 * solve. Shared across solver imports. Set before solving to suppress output.
 * Defaults to enabled unless ORTOOLS_WASM_CLOUD_NOTICE=0 is set in the environment.
 * This setting does not affect explicit cloud executor status messages.
 */
export function setCloudNoticeEnabled(enabled: boolean): void {
  state().enabled = enabled;
}

export function printCloudNotice(): void {
  const notice = state();
  if (notice.printed || !(notice.enabled ?? (optionalEnvironmentVariable('ORTOOLS_WASM_CLOUD_NOTICE') !== '0'))) return;
  notice.printed = true;
  const lines = [
    'OR-Tools WASM Cloud',
    '',
    'Build your app. Let us run the solvers.',
    'Send optimization jobs through an API.',
    'We handle the compute, queues, and scaling.',
    '',
    'Explore cloud / early access:',
    'https://or-tools-wasm-api.axelwickman.com/info',
  ];
  const width = Math.max(...lines.map((line) => line.length));
  const border = `+-${'-'.repeat(width)}-+`;
  const banner = [border, ...lines.map((line) => `| ${line.padEnd(width)} |`), border].join('\n');
  try {
    console.info(terminalSupportsColor() ? `\x1b[36m${banner}\x1b[0m` : banner);
  } catch {
    // A logging hook must not turn a completed solve into a failure.
  }
}
