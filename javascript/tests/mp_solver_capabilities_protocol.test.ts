import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('MPSolver capability transport preserves false flags and the zero-valued backend', async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { mpSolverProtocol } from './mp_solver/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { mpSolverProtocol } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const solverType of [0, 3, 999]) {
    const request = { type: 'capabilities', solverType };
    assert.deepEqual(mpSolverProtocol.decodeRequest(mpSolverProtocol.encodeRequest(request)), request);
  }
  for (const supportsCallbacks of [false, true]) for (const supportsMessageCallbacks of [false, true]) {
    const response = { type: 'capabilities', supportsCallbacks, supportsMessageCallbacks };
    assert.deepEqual(mpSolverProtocol.decodeResult(mpSolverProtocol.encodeResult(response)), response);
  }
});
