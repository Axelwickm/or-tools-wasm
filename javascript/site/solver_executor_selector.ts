import { serverRequest } from './server_request.js';

type ExecutorMode = 'direct' | 'worker' | 'cloud' | 'server';
export type ExecutorConfiguration =
  | { type: 'direct' }
  | { type: 'worker' }
  | { type: 'cloud' }
  | { type: 'server'; url: string; authToken?: string; fetch: typeof fetch };

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
  endpointInput.setAttribute('autocomplete', 'url');
  endpointInput.spellcheck = false;
  endpointLabel.append(endpointInput);

  const authLabel = document.createElement('label');
  authLabel.textContent = 'Bearer token (optional)';
  const authInput = document.createElement('input');
  authInput.className = 'server-auth-input';
  authInput.type = 'password';
  authInput.autocomplete = 'off';
  authInput.spellcheck = false;
  authInput.placeholder = 'Not stored; enter token without Bearer';
  authLabel.append(authInput);

  const target = document.createElement('span');
  target.className = 'server-endpoint-target';

  const commandLabel = document.createElement('span');
  commandLabel.append('Start from the ');
  const repositoryLink = document.createElement('a');
  repositoryLink.href = 'https://github.com/Axelwickm/or-tools-wasm';
  repositoryLink.textContent = 'repository';
  repositoryLink.rel = 'noopener';
  commandLabel.append(repositoryLink, ' root:');
  const command = document.createElement('code');
  command.className = 'server-start-command';

  const error = document.createElement('p');
  error.className = 'server-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  settings.append(endpointLabel, authLabel, target, commandLabel, command, error);
  const controls = selector.closest('.controls, .runtime-controls');
  (controls ?? selector.parentElement)?.insertAdjacentElement('afterend', settings);

  return { settings, endpointInput, authInput, target, command, error };
}

export function configureSolverExecutorSelector(
  selector: HTMLSelectElement | null,
): () => ExecutorConfiguration {
  let configuration: ExecutorConfiguration = { type: 'direct' };
  if (!selector) return () => configuration;

  const serverSettings = createServerSettings(selector);

  const configurationFor = (url: string): ExecutorConfiguration => ({
    type: 'server', url,
    authToken: serverSettings.authInput.value.trim() || undefined,
    fetch: async (input, init) => {
      try {
        const response = await serverRequest(input, init);
        // These statuses are part of the server's polling/stream fallback protocol.
        const streamFallback = String(input).includes('/stream?') && [404, 409].includes(response.status);
        if (!response.ok && !streamFallback) {
          serverSettings.error.textContent = `Server ${url}: HTTP ${response.status} ${response.statusText}. Check the endpoint and server logs.`;
          serverSettings.error.hidden = false;
        }
        return response;
      } catch (error) {
        serverSettings.error.textContent = `Server ${url}: ${error instanceof Error ? error.message : String(error)}`;
        serverSettings.error.hidden = false;
        throw error;
      }
    },
  });

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
      configuration = { type: mode };
      return;
    }

    const endpoint = readEndpoint();
    if (endpoint) {
      configuration = configurationFor(endpoint);
    }
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
    if (selector.value === 'server') {
      configuration = configurationFor(endpoint);
    }
  });
  return () => {
    serverSettings.error.hidden = true;
    if (selector.value === 'server') {
      const endpoint = readEndpoint();
      if (!endpoint) throw new Error('Enter a valid HTTP or HTTPS server endpoint.');
      configuration = configurationFor(endpoint);
    }
    return configuration;
  };
}
