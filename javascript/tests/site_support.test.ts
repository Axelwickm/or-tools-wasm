import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatJson } from '../site/site_support.ts';

test('formats exact solver integers without asking JSON.stringify to serialize bigint', () => {
  const formatted = formatJson({
    solution: [1n, 25n],
    payload: new Uint8Array([1, 2, 3]),
  });

  assert.deepEqual(JSON.parse(formatted), {
    solution: ['1', '25'],
    payload: '<3 bytes>',
  });
});
