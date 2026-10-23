import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('MathOpt feasibility transport preserves exact IDs and absent versus zero tolerances', async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { mathOptProtocol } from './mathopt/protocol.ts';
      export { create, fromBinary, toBinary } from '@bufbuild/protobuf';
      export { MathOptFeasibilityRequestSchema } from './generated/bridge/mathopt_feasibility_pb.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const tolerance of [undefined, 0, 0.5]) {
    const input = api.create(api.MathOptFeasibilityRequestSchema, { modelProto: new Uint8Array([1, 2]),
      variableIds: [9007199254740993n], variableValues: [1.5], absoluteConstraintTolerance: tolerance });
    const request = api.toBinary(api.MathOptFeasibilityRequestSchema, input);
    const operation = api.mathOptProtocol.decodeRequest(api.mathOptProtocol.encodeRequest({ type: 'checkPrimalFeasibility', request }));
    assert.equal(operation.type, 'checkPrimalFeasibility');
    assert.deepEqual(api.fromBinary(api.MathOptFeasibilityRequestSchema, operation.request), input);
    const response = { primalFeasibility: new Uint8Array([0, 1, 255]) };
    assert.deepEqual(api.mathOptProtocol.decodeResult(api.mathOptProtocol.encodeResult(response)), response);
  }
});
