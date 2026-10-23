import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('production Docker copies native bridge headers into the compiler source tree', async () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const dockerfile = await readFile(path.join(repo,'server/Dockerfile'),'utf8');
  assert.match(dockerfile,/^WORKDIR \/repo$/m);
  const copies = new Set<string>();
  for (const match of dockerfile.matchAll(/^COPY (javascript\/\S+) (\S+)$/gm)) {
    const [, source, destination] = match;
    assert.equal(path.posix.resolve('/repo',destination), `/repo/${source}`, `Native COPY destination for ${source}`);
    await readFile(path.join(repo,source));
    copies.add(source);
  }
  const seen = new Set<string>();
  async function includes(file: string): Promise<void> {
    if (seen.has(file)) return;
    seen.add(file);
    const source = await readFile(path.join(repo,file),'utf8');
    for (const match of source.matchAll(/^#include "(javascript\/[^\"]+)"/gm)) {
      assert.ok(copies.has(match[1]), `Production Docker omits ${match[1]}, included from ${file}`);
      await includes(match[1]);
    }
  }
  const entries = await readdir(path.join(repo,'server/src'));
  await Promise.all(entries.filter(file=>/\.(h|cc)$/.test(file)).map(file=>includes(`server/src/${file}`)));
});
