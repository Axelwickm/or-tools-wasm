import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withoutSourceMapUrl } from './verify_shared_wasm.mjs';

const header = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
function custom(name, content) {
  const payload = Buffer.concat([Buffer.from([name.length]), Buffer.from(name + content)]);
  return Buffer.concat([Buffer.from([0, payload.length]), payload]);
}

test('shared WASM comparison ignores source-map URLs only', () => {
  const body = Buffer.from([1, 1, 0]);
  const web = Buffer.concat([header, body, custom('sourceMappingURL', 'web.wasm.map')]);
  const node = Buffer.concat([header, body, custom('sourceMappingURL', 'node.wasm.map')]);
  assert.deepEqual(withoutSourceMapUrl(web), withoutSourceMapUrl(node));
  assert.notDeepEqual(withoutSourceMapUrl(web), withoutSourceMapUrl(Buffer.concat([header, Buffer.from([1, 1, 1])])));
  assert.notDeepEqual(withoutSourceMapUrl(web), withoutSourceMapUrl(Buffer.concat([web, custom('other', 'metadata')])));
});

test('shared WASM comparison rejects malformed binaries', () => {
  for (const bytes of [Buffer.alloc(8), Buffer.concat([header, Buffer.from([1, 127])]), Buffer.concat([header, Buffer.from([0, 1, 127])])]) {
    assert.throws(() => withoutSourceMapUrl(bytes));
  }
});
