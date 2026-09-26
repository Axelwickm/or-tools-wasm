import assert from 'node:assert/strict';
import test from 'node:test';
import { serverRequest } from './server_request.ts';

test('server requests explain connection failures and retain the cause', async (t) => {
  const cause = new TypeError('Failed to fetch');
  t.mock.method(globalThis, 'fetch', async () => { throw cause; });
  await assert.rejects(serverRequest('http://localhost:17827/jobs'), (error: Error) => {
    assert.match(error.message, /Cannot reach the server.*CORS/);
    assert.equal((error as Error & { cause: unknown }).cause, cause);
    return true;
  });
});

test('server connection setup times out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_input: RequestInfo | URL, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
  const request = serverRequest('http://localhost:17827/jobs');
  const rejected = assert.rejects(request, /connection timed out/);
  t.mock.timers.tick(10_000);
  await rejected;
});

test('connection timeout does not abort a live response stream', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal: AbortSignal | null = null;
  const response = new Response('data: event\n\n');
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init: RequestInit) => {
    requestSignal = init.signal!;
    return response;
  });
  assert.equal(await serverRequest('http://localhost:17827/jobs/1/stream'), response);
  t.mock.timers.tick(20_000);
  assert.equal(requestSignal!.aborted, false);
  assert.equal(await response.text(), 'data: event\n\n');
});

test('HTTP responses stay intact for bridge error decoding', async (t) => {
  const response = new Response('server failure', { status: 503 });
  t.mock.method(globalThis, 'fetch', async () => response);
  assert.equal(await serverRequest('http://localhost:17827/jobs'), response);
  assert.equal(await response.text(), 'server failure');
});
