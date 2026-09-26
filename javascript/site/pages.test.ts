import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

test('every site page uses the device viewport without disabling zoom', async () => {
  const directory = new URL('./', import.meta.url);
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.html')) continue;
    const html = await readFile(new URL(name, directory), 'utf8');
    const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"/);
    assert.ok(viewport, `${name}: missing mobile viewport`);
    assert.match(viewport[1], /width=device-width/, name);
    assert.match(viewport[1], /initial-scale=1(?:,|$)/, name);
    assert.doesNotMatch(viewport[1], /user-scalable=no|maximum-scale/, name);
  }
});
