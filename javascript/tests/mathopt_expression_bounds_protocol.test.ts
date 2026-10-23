import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('MathOpt expression bounds preserve exact IDs and IEEE results through transport', async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { mathOptProtocol } from './mathopt/protocol.ts';
      export * from './generated/bridge/mathopt_expression_bounds_pb.ts';
      export { create, fromBinary, toBinary } from '@bufbuild/protobuf';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { mathOptProtocol, create, fromBinary, toBinary, MathOptExpressionBoundsRequestSchema: requestSchema,
    MathOptExpressionBoundsResponseSchema: responseSchema } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const request = toBinary(requestSchema, create(requestSchema, { modelProto: new Uint8Array([0, 255]),
    variableIds: [9007199254740993n], coefficients: [-3], offset: 1 }));
  const operation = { type: 'expressionBounds', request };
  assert.deepEqual(mathOptProtocol.decodeRequest(mathOptProtocol.encodeRequest(operation)), operation);
  assert.deepEqual(fromBinary(requestSchema, request).variableIds, [9007199254740993n]);
  for (const [lowerBound, upperBound] of [[-13, -1], [-Infinity, Infinity], [NaN, Infinity], [0, 0]]) {
    const result = { expressionBounds: toBinary(responseSchema, create(responseSchema, { lowerBound, upperBound })) };
    const decoded = mathOptProtocol.decodeResult(mathOptProtocol.encodeResult(result));
    assert.deepEqual(decoded, result);
    const bounds = fromBinary(responseSchema, decoded.expressionBounds);
    assert.equal(bounds.lowerBound, lowerBound); assert.equal(bounds.upperBound, upperBound);
  }
});
