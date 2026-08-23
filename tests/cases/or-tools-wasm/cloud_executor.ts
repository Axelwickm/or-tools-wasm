type CloudExecutorConfiguration = {
  type: 'cloud';
  test: true;
};

type CloudCpSatApi = {
  CloudExecutorUnavailableError: abstract new (...args: never[]) => Error;
  CpSat: {
    solve(
      model: Uint8Array,
      options: { executor: CloudExecutorConfiguration },
    ): Promise<unknown>;
  };
};

export type PackageMetadata = {
  packageName: string;
  version: string;
};

export type CloudExecutorCaseResult = {
  id: 'cloud/status';
  name: 'Cloud executor reports unavailable status';
  solver: 'cloud';
  ok: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export async function runCloudExecutorCase(
  api: CloudCpSatApi,
  metadata: PackageMetadata,
): Promise<CloudExecutorCaseResult> {
  const originalFetch = globalThis.fetch;
  const originalConsoleInfo = console.info;
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const messages: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    return new Response('Cloud is coming soon.');
  }) as typeof fetch;
  console.info = (message?: unknown) => {
    messages.push(String(message));
  };

  let error: unknown;
  try {
    await api.CpSat.solve(new Uint8Array([1, 2, 3]), {
      executor: { type: 'cloud', test: true },
    });
  } catch (caught) {
    error = caught;
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalConsoleInfo;
  }

  assert(
    error instanceof api.CloudExecutorUnavailableError,
    `expected CloudExecutorUnavailableError, got ${String(error)}`,
  );
  assert(requests.length === 1, `expected one status request, got ${requests.length}`);
  assert(
    requests[0].input === 'https://or-tools-wasm-api.axelwickman.com/status',
    `unexpected cloud status URL: ${requests[0].input}`,
  );
  assert(requests[0].init?.method === 'POST', 'cloud status request must use POST');
  assert(
    JSON.stringify(JSON.parse(String(requests[0].init?.body)))
      === JSON.stringify({ package: metadata.packageName, version: metadata.version, test: true }),
    `unexpected cloud status body: ${String(requests[0].init?.body)}`,
  );
  assert(
    messages.length === 1 && messages[0] === 'Cloud is coming soon.',
    `unexpected cloud status output: ${JSON.stringify(messages)}`,
  );

  return {
    id: 'cloud/status',
    name: 'Cloud executor reports unavailable status',
    solver: 'cloud',
    ok: true,
  };
}
