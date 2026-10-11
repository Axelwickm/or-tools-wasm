import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('PDLP reset and serialization preserve native dimension validation', async (t) => {
  const directory = await mkdtemp(fileURLToPath(new URL('.pdlp-qp-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: {
        contents: `export * from './api.ts';
          import { fromBinary } from '@bufbuild/protobuf';
          import { PdlpQuadraticProgramSchema } from '../generated/bridge/pdlp_pb.ts';
          export const decode = (bytes) => fromBinary(PdlpQuadraticProgramSchema, bytes);`,
        resolveDir: fileURLToPath(new URL('../lib/pdlp/', import.meta.url)),
      },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'serialization-only', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `export class DirectPdlpExecutor {
          execute() { throw new Error('Serialization test must not invoke a solver'); }
        }` }));
      } }],
    });
    const { QuadraticProgram, decode } = await import(outfile);
    await t.test('diagonal-only input infers dimensions while retaining explicit mismatches', () => {
      const wire = decode(new QuadraticProgram({ objectiveMatrixDiagonal: [2, 4] }).toBytes());
      assert.deepEqual(wire.objectiveVector, [0, 0]);
      assert.deepEqual(wire.variableLowerBounds, [-Infinity, -Infinity]);
      assert.deepEqual(wire.variableUpperBounds, [Infinity, Infinity]);
      assert.equal(wire.numVariables, 2);
      const malformed = decode(new QuadraticProgram({ objectiveMatrixDiagonal: [2, 4], objectiveVector: [0] }).toBytes());
      assert.deepEqual(malformed.objectiveVector, [0]);
    });
    await t.test('resizing a used model clears quadratic objective, metadata and scaling', () => {
      const qp = new QuadraticProgram({
        problemName: 'old', objectiveOffset: 7, objectiveScalingFactor: -3,
        objectiveVector: [1, 2], objectiveMatrixDiagonal: [4, 5],
        variableNames: ['x', 'y'], constraintNames: ['capacity'],
        constraintMatrix: { numRows: 1, numColumns: 2, entries: [{ row: 0, column: 1, value: 8 }] },
      });
      qp.resizeAndInitialize(3, 2);
      const wire = decode(qp.toBytes());
      assert.equal(wire.problemName, '');
      assert.equal(wire.objectiveOffset, 0);
      assert.equal(wire.objectiveScalingFactor, 1);
      assert.equal(wire.hasObjectiveMatrixDiagonal, false);
      assert.deepEqual(wire.objectiveMatrixDiagonal, []);
      assert.deepEqual(wire.variableNames, []);
      assert.deepEqual(wire.constraintNames, []);
      assert.deepEqual(wire.constraintMatrixEntries, []);
      assert.deepEqual(wire.objectiveVector, [0, 0, 0]);
      assert.deepEqual(wire.variableLowerBounds, [-Infinity, -Infinity, -Infinity]);
      assert.deepEqual(wire.variableUpperBounds, [Infinity, Infinity, Infinity]);
      assert.deepEqual(wire.constraintLowerBounds, [-Infinity, -Infinity]);
      assert.deepEqual(wire.constraintUpperBounds, [Infinity, Infinity]);
      assert.equal(wire.numVariables, 3);
      assert.equal(wire.numConstraints, 2);
    });
    await t.test('explicit vectors and matrix sizes survive construction and serialization', () => {
      const qp = new QuadraticProgram({
        objectiveVector: [1], variableLowerBounds: [0, 0], variableUpperBounds: [],
        constraintLowerBounds: [], constraintUpperBounds: [2, 3],
        objectiveMatrixDiagonal: [5],
        constraintMatrix: { numRows: 1, numColumns: 3, entries: [] },
      });
      const wire = decode(qp.toBytes());
      assert.deepEqual(wire.objectiveVector, [1], 'do not invent zero coefficients');
      assert.deepEqual(wire.variableLowerBounds, [0, 0]);
      assert.deepEqual(wire.variableUpperBounds, [], 'explicit empty bounds must not become unbounded bounds');
      assert.deepEqual(wire.constraintLowerBounds, []);
      assert.deepEqual(wire.constraintUpperBounds, [2, 3]);
      assert.deepEqual(wire.objectiveMatrixDiagonal, [5]);
      assert.equal(wire.numVariables, 3, 'matrix columns must not be replaced by vector length');
      assert.equal(wire.numConstraints, 1, 'matrix rows must not be replaced by vector length');
      qp.objectiveVector = [];
      assert.deepEqual(decode(qp.toBytes()).objectiveVector, [], 'mutable model serialization must preserve mismatches too');
    });
    await t.test('omitted arrays still receive documented modeling defaults', () => {
      const qp = new QuadraticProgram({ objectiveVector: [1, 2], constraintMatrix: { numRows: 1, numColumns: 2 } });
      const wire = decode(qp.toBytes());
      assert.deepEqual(wire.variableLowerBounds, [-Infinity, -Infinity]);
      assert.deepEqual(wire.variableUpperBounds, [Infinity, Infinity]);
      assert.deepEqual(wire.constraintLowerBounds, [-Infinity]);
      assert.deepEqual(wire.constraintUpperBounds, [Infinity]);
    });
    await t.test('invalid resize dimensions fail before changing an existing model', () => {
      const qp = new QuadraticProgram({ objectiveVector: [3], objectiveOffset: 5 });
      for (const [variables, constraints] of [[-1, 2], [1.5, 2], [1, -1], [1, NaN], [Infinity, 1]]) {
        assert.throws(() => qp.resizeAndInitialize(variables, constraints));
        assert.deepEqual(qp.objectiveVector, [3]);
        assert.equal(qp.objectiveOffset, 5);
      }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
