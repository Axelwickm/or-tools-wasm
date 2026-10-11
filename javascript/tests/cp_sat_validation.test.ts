import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('raw CP-SAT validation captures Uint8Array and Buffer input including subviews', async () => {
  const bundled = await build({ stdin: { contents: `export { CpSat } from './api.ts';`,
    resolveDir: fileURLToPath(new URL('../lib/cp_sat/', import.meta.url)) },
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'deferred-validation', setup(builder) {
      builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
        export class DirectCpSatExecutor {
          execute(request) {
            return { result: Promise.resolve().then(() => ({ type: 'validate',
              ok: request.model.length === 2 && request.model[0] === 1 && request.model[1] === 2, message: '' })) };
          }
        }` }));
    } }] });
  const { CpSat } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  for (const input of [new Uint8Array([1, 2]), Buffer.from([1, 2]),
    new Uint8Array([0, 1, 2, 0]).subarray(1, 3), Buffer.from([0, 1, 2, 0]).subarray(1, 3)]) {
    const pending = CpSat.validate(input, { executor: 'direct' });
    input.fill(255);
    assert.equal((await pending).ok, true);
  }
});
