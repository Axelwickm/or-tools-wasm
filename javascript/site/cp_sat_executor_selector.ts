import type { CpSatApi } from 'or-tools-wasm/cp-sat';

type CpSatExecutorMode = 'direct' | 'worker' | 'server';

function serverHost(): string {
  return `http://${window.location.hostname || '127.0.0.1'}:17827`;
}

export function configureCpSatExecutorSelector(
  cpSat: Pick<CpSatApi, 'setExecutor'>,
  selector: HTMLSelectElement | null,
): void {
  if (!selector) return;

  const apply = () => {
    const mode = selector.value as CpSatExecutorMode;
    cpSat.setExecutor(mode === 'server'
      ? { type: 'server', host: serverHost() }
      : { type: mode });
  };

  apply();
  selector.addEventListener('change', apply);
}
