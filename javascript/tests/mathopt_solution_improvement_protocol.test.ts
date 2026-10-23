import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

test('MathOpt solution improvement preserves selected order, exact IDs and explicit zero tolerance across transport', async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { mathOptProtocol } from './mathopt/protocol.ts';
      export { encodeImprovementRequest, decodeImprovementResponse } from './mathopt/solution_improvement.ts';
      export { MathOptSolutionImprovementRequestSchema } from './generated/bridge/mathopt_solution_improvement_pb.ts';
      export { fromBinary } from '@bufbuild/protobuf';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const { mathOptProtocol, encodeImprovementRequest, fromBinary, MathOptSolutionImprovementRequestSchema } =
    await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const id = 9007199254740993n;
  const operation = { type: 'improveSolution', request: encodeImprovementRequest(new Uint8Array([0, 255]),
    { ids: [0n, id], values: [-1, 2] }, [id, 0n, id], { integralityTolerance: 0 }) };
  assert.deepEqual(mathOptProtocol.decodeRequest(mathOptProtocol.encodeRequest(operation)), operation);
  const decoded = fromBinary(MathOptSolutionImprovementRequestSchema, operation.request);
  assert.deepEqual(decoded.selectedVariableIds, [id, 0n, id]);
  assert.equal(decoded.integralityTolerance, 0);
  assert.deepEqual(decoded.variableIds, [0n, id]);
  const response = { improvedValues: new Uint8Array([0, 127, 255]) };
  assert.deepEqual(mathOptProtocol.decodeResult(mathOptProtocol.encodeResult(response)), response);
});
