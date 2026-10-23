import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('MathOpt indicator transformation preserves ID zero and exact int64 IDs', async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { mathOptProtocol } from './mathopt/protocol.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { mathOptProtocol } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  for (const indicatorConstraintId of [0n, 9007199254740993n]) {
    const input = { type: 'formulateIndicatorConstraintAsMip', model: new Uint8Array([0, 1, 255]), indicatorConstraintId };
    assert.deepEqual(mathOptProtocol.decodeRequest(mathOptProtocol.encodeRequest(input)), input);
  }
});

test('MathOpt robust transformation transports independent model bytes and exact coefficient IDs', async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { mathOptProtocol } from './mathopt/protocol.ts';
      export { MathOptRobustConstraintRequestSchema } from './generated/bridge/mathopt_model_transform_pb.ts';
      export { create, fromBinary, toBinary } from '@bufbuild/protobuf';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { mathOptProtocol, MathOptRobustConstraintRequestSchema: schema, create, fromBinary, toBinary } =
    await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const input = create(schema, { modelProto: new Uint8Array([1, 2]), uncertaintyModelProto: new Uint8Array([3, 4]),
    rhsId: 9007199254740993n, uncertainCoefficients: [{ variableId: 0n, uncertaintyVariableIds: [9007199254740995n], coefficients: [-2], offset: 3 }] });
  const operation = { type: 'addRobustConstraint', request: toBinary(schema, input) };
  const decoded = mathOptProtocol.decodeRequest(mathOptProtocol.encodeRequest(operation));
  assert.equal(decoded.type, operation.type);
  assert.deepEqual(fromBinary(schema, decoded.request), input);
});
