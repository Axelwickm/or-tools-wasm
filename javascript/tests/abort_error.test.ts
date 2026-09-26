import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../lib/solver_job.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { createAbortError }: typeof import('../lib/solver_job.ts') =
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('abort errors preserve Error reasons and name other reasons AbortError', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'DOMException')!;
  try {
    for (const domException of [DOMException, undefined]) {
      Object.defineProperty(globalThis, 'DOMException', { ...descriptor, value: domException });
      for (const reason of ['cancelled', 7, null, { cause: 'cancelled' }]) {
        const controller = new AbortController();
        controller.abort(reason);
        const error = createAbortError(controller.signal);
        assert.equal(error.name, 'AbortError');
        assert.equal(error.message, String(reason));
      }
      const reason = new Error('original reason');
      const controller = new AbortController();
      controller.abort(reason);
      assert.equal(createAbortError(controller.signal), reason);
      assert.equal(createAbortError(new AbortController().signal).name, 'AbortError');
    }
  } finally {
    Object.defineProperty(globalThis, 'DOMException', descriptor);
  }
});
