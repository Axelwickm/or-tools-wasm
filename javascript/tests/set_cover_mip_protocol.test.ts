import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('Set Cover MIP transport distinguishes omitted/empty focus and absent/zero LP objectives', async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { setCoverProtocol } from './set_cover/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { setCoverProtocol: codec } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  for (const focusIndices of [undefined, [], [1]]) for (const lpRelaxation of [false, true]) {
    const operation = { type: 'mip', costs: [1, 2], starts: [0, 1, 2], elements: [0, 0], selected: [true, false],
      focusIndices, lpRelaxation, timeLimitSeconds: 0.0001 };
    assert.deepEqual(codec.decodeRequest(codec.encodeRequest(operation)), operation);
  }
  for (const objectiveValue of [undefined, 0, 1.5, Infinity, NaN]) {
    const result = { nextSolution: false, cost: 3, numUncoveredElements: 1, selected: [true, false], coverage: [],
      numFreeElements: [], numCoverageLe1Elements: [], isRedundant: [], mip: { subproblemStatus: 6, objectiveValue } };
    const decoded = codec.decodeResult(codec.encodeResult(result));
    assert.equal(decoded.mip.objectiveValue, objectiveValue);
    assert.equal(decoded.mip.subproblemStatus, 6);
    assert.equal(decoded.nextSolution, false);
    assert.deepEqual(decoded.selected, result.selected);
  }
});
