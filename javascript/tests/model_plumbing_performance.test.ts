import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({ stdin: {
  resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)),
  contents: `export { DirectPdlpExecutor } from './pdlp/direct_executor.ts';
    export { RcpspModelBuilder } from './rcpsp/api.ts';
    export { create } from '@bufbuild/protobuf';
    export { PdlpQuadraticProgramSchema } from './generated/bridge/pdlp_pb.ts';`,
}, bundle: true, write: false, platform: 'node', format: 'esm' });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

test('PDLP native wire preserves mixed fields and large vectors through buffer growth', async () => {
  const values = [Infinity, -Infinity, -0, 1.25, ...Array.from({ length: 100000 }, (_, i) => i)];
  const qp = api.create(api.PdlpQuadraticProgramSchema, {
    numVariables: values.length, numConstraints: 1, problemName: 'model λ',
    objectiveOffset: -3, objectiveScalingFactor: 2, objectiveVector: values,
    hasObjectiveMatrixDiagonal: true, objectiveMatrixDiagonal: [4],
    constraintLowerBounds: [-Infinity], constraintUpperBounds: [7],
    variableLowerBounds: [0], variableUpperBounds: [Infinity],
    variableNames: ['x'.repeat(300), '变量'], constraintNames: ['row'],
    constraintMatrixEntries: [{ row: 0, column: 1, value: -2.5 }],
  });
  let captured = new Uint8Array();
  let freed = false;
  const module = {
    HEAPU8: new Uint8Array(2000000), _malloc: () => 8,
    _free(pointer: number) { assert.equal(pointer, 8); freed = true; },
    ccall(name: string, _result: string, _types: string[], args: number[]) {
      assert.equal(name, 'pdlp_is_linear_program');
      captured = this.HEAPU8.slice(args[0], args[0] + args[1]);
      return 0;
    },
  };
  await new api.DirectPdlpExecutor(async () => module).execute({ type: 'isLinear', quadraticProgram: qp }, { onEvent() {} }).result;
  assert.ok(freed);
  const view = new DataView(captured.buffer, captured.byteOffset, captured.byteLength);
  let offset = 0;
  const u32 = () => { const value = view.getUint32(offset, true); offset += 4; return value; };
  const double = () => { const value = view.getFloat64(offset, true); offset += 8; return value; };
  const string = () => { const size = u32(); const value = new TextDecoder().decode(captured.subarray(offset, offset + size)); offset += size; return value; };
  const doubles = (expected: number[]) => { assert.equal(u32(), expected.length); for (const value of expected) assert.equal(double(), value); };
  const strings = (expected: string[]) => { assert.equal(u32(), expected.length); for (const value of expected) assert.equal(string(), value); };
  assert.equal(u32(), values.length); assert.equal(u32(), 1); assert.equal(string(), 'model λ');
  assert.equal(double(), -3); assert.equal(double(), 2); doubles(values);
  assert.equal(captured[offset++], 1); doubles([4]); doubles([-Infinity]); doubles([7]); doubles([0]); doubles([Infinity]);
  strings(qp.variableNames); strings(['row']);
  assert.equal(u32(), 1); assert.equal(u32(), 0); assert.equal(u32(), 1); assert.equal(double(), -2.5);
  assert.equal(offset, captured.length, 'No capacity padding is passed to native code');
});

test('RCPSP builder preserves roots, shared successors and repeated builds', () => {
  const builder = new api.RcpspModelBuilder();
  builder.addActivity({ name: 'a', duration: 1, successors: ['c'] });
  builder.addActivity({ name: 'b', duration: 1, successors: ['c'] });
  builder.addActivity({ name: 'c', duration: 1 });
  const first = builder.build();
  assert.deepEqual(first.tasks.map((task: { successors: number[] }) => task.successors), [[1, 2], [3], [3], [4], []]);
  assert.throws(() => builder.addActivity({ name: 'a', duration: 2 }), /duplicate/);
  assert.deepEqual(builder.build().tasks, first.tasks);
  builder.addActivity({ name: 'd', duration: 1 });
  assert.deepEqual(builder.build().tasks[0].successors, [1, 2, 4]);
  assert.deepEqual(first.tasks[0].successors, [1, 2]);
});
