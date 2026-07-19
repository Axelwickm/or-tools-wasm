type ExecutorMode = 'direct' | 'worker' | 'server';
type ExecutorConfiguration =
  | { type: 'direct' }
  | { type: 'worker' }
  | { type: 'server'; host: string };
type ExecutorApi = {
  setExecutor(configuration: ExecutorConfiguration): void;
};

function serverHost(): string {
  return `http://${window.location.hostname || '127.0.0.1'}:17827`;
}

export function configureSolverExecutorSelector(
  api: ExecutorApi,
  selector: HTMLSelectElement | null,
): void {
  if (!selector) return;

  const apply = () => {
    const mode = selector.value as ExecutorMode;
    api.setExecutor(mode === 'server'
      ? { type: 'server', host: serverHost() }
      : { type: mode });
  };

  apply();
  selector.addEventListener('change', apply);
}
