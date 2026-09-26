import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAbortError } from '../lib/solver_job.ts';

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
