import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

test('browser loader allows non-isolated execution with a suppressible warning', async () => {
  const bundled = await build({
    stdin: { contents: `export * from './runtime_loader.ts'; export * from './browser_threading.ts'; export * from './executor_configuration.ts';`,
      resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) },
    bundle: true, write: false, platform: 'browser', format: 'esm',
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const keys = ['crossOriginIsolated', 'SharedArrayBuffer', 'document'] as const;
  const descriptors = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const warning = console.warn;
  const messages: string[] = [];
  try {
    Object.defineProperty(globalThis, 'crossOriginIsolated', { value: false, configurable: true });
    Object.defineProperty(globalThis, 'SharedArrayBuffer', { value: undefined, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: {}, configurable: true });
    console.warn = (message: string) => { messages.push(message); };
    const asset = () => ({ jsUrl: 'data:text/javascript,export default async () => ({ loaded: true })', wasmUrl: '/runtime.wasm' });
    api.setSingleThreadWarningEnabled(false);
    assert.equal((await api.loadBrowserRuntime('cp_sat_runtime', asset, 'jspi')).loaded, true);
    assert.equal(messages.length, 0);
    api.setSingleThreadWarningEnabled(true);
    assert.equal(api.resolveExecutorConfiguration().type, 'direct');
    assert.equal((await api.loadBrowserRuntime('routing_runtime', asset, 'asyncify')).loaded, true);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /setSingleThreadWarningEnabled\(false\)/);
    assert.equal(api.resolveExecutorConfiguration('worker').type, 'worker');
    assert.equal(messages.length, 1);
  } finally {
    console.warn = warning;
    Reflect.deleteProperty(globalThis, Symbol.for('or-tools-wasm.single-thread-warning'));
    keys.forEach((key, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
});
