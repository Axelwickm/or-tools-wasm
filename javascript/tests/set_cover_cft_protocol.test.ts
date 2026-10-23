import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('Set Cover CFT requests and IEEE vector values survive bridge transport', async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { setCoverProtocol } from './set_cover/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { setCoverProtocol: codec } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const operation = { type: 'cft', costs: [1, 2], starts: [0, 1, 2], elements: [0, 0] };
  assert.deepEqual(codec.decodeRequest(codec.encodeRequest(operation)), operation);
  for (const selected of [[true, true], [false, false]]) {
    const seeded = { ...operation, selected };
    assert.deepEqual(codec.decodeRequest(codec.encodeRequest(seeded)), seeded);
  }
  const cftDual = { lowerBound: 1.5, reducedCosts: [NaN, Infinity, -Infinity, 0], multipliers: [NaN, 0.5] };
  const result = { nextSolution: false, cost: 0, numUncoveredElements: 0, selected: [], coverage: [],
    numFreeElements: [], numCoverageLe1Elements: [], isRedundant: [], cftDual };
  assert.deepEqual(codec.decodeResult(codec.encodeResult(result)).cftDual.reducedCosts, cftDual.reducedCosts);
  assert.deepEqual(codec.decodeResult(codec.encodeResult(result)).cftDual.multipliers, cftDual.multipliers);
  assert.equal(codec.decodeResult(codec.encodeResult(result)).cftDual.lowerBound, 1.5);
});
