import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('min-cost-flow wire distinguishes explicit false from the native default', async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { networkFlowProtocol } from './network_flow/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { networkFlowProtocol } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const priceScaling of [undefined, false, true]) {
    const operation = { type: 'minCostFlow', tails: [0], heads: [1], capacities: [1n], unitCosts: [1n << 60n],
      supplies: [1n, -1n], solveMaxFlowWithMinCost: true, ...(priceScaling === undefined ? {} : { priceScaling }) };
    assert.deepEqual(networkFlowProtocol.decodeRequest(networkFlowProtocol.encodeRequest(operation)), operation);
  }
});
