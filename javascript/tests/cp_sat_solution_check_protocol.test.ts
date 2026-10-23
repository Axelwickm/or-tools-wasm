import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('CP-SAT solution checks preserve exact signed values and false response presence', async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { cpSatProtocol } from './cp_sat/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { cpSatProtocol } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const values of [[], [0n, 9007199254740993n, -9007199254740993n, -(1n << 63n), (1n << 63n) - 1n]]) {
    const request = { type: 'checkSolution', model: new Uint8Array([0, 127, 255]), values };
    assert.deepEqual(cpSatProtocol.decodeRequest(cpSatProtocol.encodeRequest(request)), request);
  }
  for (const feasible of [false, true]) {
    const response = { type: 'solutionFeasible', feasible };
    assert.deepEqual(cpSatProtocol.decodeResult(cpSatProtocol.encodeResult(response)), response);
  }
});
