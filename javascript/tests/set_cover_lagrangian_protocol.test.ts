import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('Set Cover Lagrangian requests and IEEE vector values survive bridge transport', async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { setCoverProtocol } from './set_cover/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { setCoverProtocol: codec } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const operation = { type: 'lagrangianBound', costs: [1, 2], starts: [0, 1, 2], elements: [0, 0], upperBound: 2 };
  assert.deepEqual(codec.decodeRequest(codec.encodeRequest(operation)), operation);
  const lagrangianBound = { lowerBound: 1.5, reducedCosts: [NaN, Infinity, -Infinity, 0], multipliers: [NaN, 0.5] };
  const result = { nextSolution: false, cost: 0, numUncoveredElements: 0, selected: [], coverage: [],
    numFreeElements: [], numCoverageLe1Elements: [], isRedundant: [], lagrangianBound };
  assert.deepEqual(codec.decodeResult(codec.encodeResult(result)).lagrangianBound.reducedCosts, lagrangianBound.reducedCosts);
  assert.deepEqual(codec.decodeResult(codec.encodeResult(result)).lagrangianBound.multipliers, lagrangianBound.multipliers);
  assert.equal(codec.decodeResult(codec.encodeResult(result)).lagrangianBound.lowerBound, 1.5);
});
