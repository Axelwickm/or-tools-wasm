import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('MPSolver clamping transports model and solution bytes independently and preserves backend zero', async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { mpSolverProtocol } from './mp_solver/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { mpSolverProtocol } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const solverType of [0, 2, 3]) {
    const request = { type: 'clampSolution', model: new Uint8Array([0, 255]), solution: new Uint8Array([1, 127]), solverType };
    assert.deepEqual(mpSolverProtocol.decodeRequest(mpSolverProtocol.encodeRequest(request)), request);
  }
  for (const solution of [new Uint8Array(), new Uint8Array([0, 127, 255])]) {
    const response = { type: 'clampSolution', solution };
    assert.deepEqual(mpSolverProtocol.decodeResult(mpSolverProtocol.encodeResult(response)), response);
  }
});
