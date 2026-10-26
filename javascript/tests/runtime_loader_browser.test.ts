import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('browser runtimes check isolation before loading assets', async t => {
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL('../lib/runtime_loader.ts', import.meta.url))],
    bundle: true, write: false, platform: 'browser', format: 'esm',
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const keys = ['crossOriginIsolated', 'SharedArrayBuffer', 'isSecureContext', 'document'] as const;
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const sharedArrayBuffer = globalThis.SharedArrayBuffer;
  const set = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { value, configurable: true });
  try {
    for (const flavor of ['jspi', 'asyncify']) {
      for (const placement of ['browser-main', 'browser-worker']) {
        for (const [isolated, shared] of [[false, false], [false, true], [true, false]]) {
          await t.test(`${flavor} ${placement}: isolated=${isolated}, shared=${shared}`, async () => {
            set('crossOriginIsolated', isolated);
            set('SharedArrayBuffer', shared ? sharedArrayBuffer : undefined);
            set('isSecureContext', true);
            set('document', placement === 'browser-main' ? {} : undefined);
            let resolved = false;
            await assert.rejects(api.loadBrowserRuntime('cp_sat_runtime', () => {
              resolved = true;
              throw new Error('Asset loading should not be reached');
            }, flavor), (error: unknown) => {
              assert.ok(error instanceof Error);
              assert.match(error.message, /cross-origin-isolated/);
              assert.match(error.message, new RegExp(`crossOriginIsolated=${isolated}`));
              assert.match(error.message, new RegExp(`SharedArrayBuffer=${shared ? 'available' : 'unavailable'}`));
              assert.match(error.message, /Cross-Origin-Opener-Policy/);
              assert.match(error.message, /Cross-Origin-Embedder-Policy/);
              assert.match(error.message, /isSecureContext=true/);
              assert.ok(error.message.includes(flavor));
              assert.ok(error.message.includes(placement));
              return true;
            });
            assert.equal(resolved, false);
          });
        }
      }
      await t.test(`${flavor} can load after the environment is corrected`, async () => {
        set('crossOriginIsolated', true);
        set('SharedArrayBuffer', sharedArrayBuffer);
        const module = await api.loadBrowserRuntime('cp_sat_runtime', () => ({
          jsUrl: 'data:text/javascript,export default async () => ({ loaded: true })',
          wasmUrl: 'https://example.test/runtime.wasm',
        }), flavor);
        assert.equal(module.loaded, true);
      });
    }
  } finally {
    await api.terminateLoadedRuntimeThreads();
    keys.forEach((key, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
