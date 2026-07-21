type ExecutorMode = 'direct' | 'worker' | 'server';
type ExecutorConfiguration =
  | { type: 'direct' }
  | { type: 'worker' }
  | { type: 'server'; url: string };
type ExecutorApi = {
  setExecutor(configuration: ExecutorConfiguration): void;
};

const SERVER_ENDPOINT_STORAGE_KEY = 'ortools-wasm.server-endpoint';
const DEFAULT_SERVER_PORT = '17827';
const SERVER_COMMAND = 'docker compose -f server/docker-compose.yml up --build';

function defaultServerEndpoint(): string {
  return `http://${window.location.hostname || '127.0.0.1'}:17827`;
}

function storedServerEndpoint(): string {
  try {
    return localStorage.getItem(SERVER_ENDPOINT_STORAGE_KEY) ?? defaultServerEndpoint();
  } catch {
    return defaultServerEndpoint();
  }
}

function normalizeServerEndpoint(value: string): URL | null {
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') return null;
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');
    endpoint.search = '';
    endpoint.hash = '';
    return endpoint;
  } catch {
    return null;
  }
}

function endpointPort(endpoint: URL): string {
  return endpoint.port || (endpoint.protocol === 'https:' ? '443' : '80');
}

function serverCommand(port: string): string {
  return port === DEFAULT_SERVER_PORT
    ? SERVER_COMMAND
    : `ORTOOLS_SERVER_PORT=${port} ${SERVER_COMMAND}`;
}

function createServerSettings(selector: HTMLSelectElement) {
  const settings = document.createElement('div');
  settings.className = 'server-executor-settings';
  settings.hidden = true;

  const endpointLabel = document.createElement('label');
  endpointLabel.textContent = 'Server endpoint';
  const endpointInput = document.createElement('input');
  endpointInput.className = 'server-endpoint-input';
  endpointInput.type = 'url';
  endpointInput.placeholder = defaultServerEndpoint();
  endpointInput.value = storedServerEndpoint();
  endpointInput.autocomplete = 'url';
  endpointInput.spellcheck = false;
  endpointLabel.append(endpointInput);

  const target = document.createElement('span');
  target.className = 'server-endpoint-target';

  const commandLabel = document.createElement('span');
  commandLabel.textContent = 'Start from the repository root:';
  const command = document.createElement('code');
  command.className = 'server-start-command';

  settings.append(endpointLabel, target, commandLabel, command);
  const controls = selector.closest('.controls, .runtime-controls');
  (controls ?? selector.parentElement)?.insertAdjacentElement('afterend', settings);

  return { settings, endpointInput, target, command };
}

export function configureSolverExecutorSelector(
  api: ExecutorApi,
  selector: HTMLSelectElement | null,
): void {
  if (!selector) return;

  const serverSettings = createServerSettings(selector);

  const readEndpoint = () => {
    const endpoint = normalizeServerEndpoint(serverSettings.endpointInput.value);
    serverSettings.endpointInput.setCustomValidity(endpoint ? '' : 'Enter a valid HTTP or HTTPS endpoint.');
    if (!endpoint) return null;

    const normalized = endpoint.toString().replace(/\/$/, '');
    const port = endpointPort(endpoint);
    serverSettings.target.textContent = `Requests use ${normalized}, port ${port}.`;
    serverSettings.command.textContent = serverCommand(port);
    return normalized;
  };

  const apply = () => {
    const mode = selector.value as ExecutorMode;
    serverSettings.settings.hidden = mode !== 'server';
    if (mode !== 'server') {
      api.setExecutor({ type: mode });
      return;
    }

    const endpoint = readEndpoint();
    if (endpoint) api.setExecutor({ type: 'server', url: endpoint });
  };

  apply();
  selector.addEventListener('change', apply);
  serverSettings.endpointInput.addEventListener('change', () => {
    const endpoint = readEndpoint();
    if (!endpoint) return;
    serverSettings.endpointInput.value = endpoint;
    try {
      localStorage.setItem(SERVER_ENDPOINT_STORAGE_KEY, endpoint);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
    if (selector.value === 'server') api.setExecutor({ type: 'server', url: endpoint });
  });
}
