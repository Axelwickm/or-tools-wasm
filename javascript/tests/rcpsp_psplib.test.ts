import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parsePsplib } from '../lib/rcpsp/psplib.ts';
import { multimodePsplib, repeatedJobPsplib, invalidPsplibCases } from '../../tests/cases/or-tools-wasm/rcpsp/psplib_fixtures.ts';

test('PSPLIB preserves continuation modes, repeated job modes and all resources', () => {
  for (const text of [multimodePsplib, repeatedJobPsplib]) {
    const parsed = parsePsplib(text);
    assert.deepEqual(parsed.resources, [
      { name: 'R1', maxCapacity: 1, renewable: true },
      { name: 'N1', maxCapacity: 3, renewable: false },
    ]);
    assert.deepEqual(parsed.tasks![1].recipes!.map(recipe => [recipe.duration, recipe.demands, recipe.resources]), [
      [1, [1, 3], [0, 1]], [4, [1, 1], [0, 1]], [9, [1, 1], [0, 1]],
    ]);
    assert.deepEqual(parsed.tasks!.map(task => task.successors), [[1], [2], [3], []]);
  }
});

test('PSPLIB parses the vendored single-mode, multimode and MMLIB examples', async () => {
  for (const [name, jobs, modes, capacities] of [
    ['j301_1.sm', 32, 1, [12, 13, 4, 12]],
    ['c1510_1.mm.txt', 18, 3, [18, 17, 44, 49]],
    ['mmlib100_j100100_1.mm.txt', 102, 3, [31, 27, 543, 521]],
  ] as const) {
    const parsed = parsePsplib(await readFile(new URL(`../../ortools/scheduling/testdata/${name}`, import.meta.url), 'utf8'));
    assert.equal(parsed.tasks!.length, jobs);
    assert.equal(parsed.tasks![1].recipes!.length, modes);
    assert.deepEqual(parsed.resources!.map(resource => resource.maxCapacity), capacities);
    assert.deepEqual(parsed.resources!.map(resource => resource.renewable), modes === 1 ? [true, true, true, true] : [true, true, false, false]);
  }
});

test('PSPLIB rejects malformed or unsupported input instead of changing the model', () => {
  for (const [name, text] of invalidPsplibCases) {
    assert.throws(() => parsePsplib(text), /RCPSP PSPLIB parser:/, name);
  }
});

test('PSPLIB handles zero renewable resources and resource-free projects', () => {
  const nonrenewableOnly = `jobs (incl. supersource/sink ): 3
- renewable : 0 R
- nonrenewable : 1 N
PRECEDENCE RELATIONS:
1 1 1 2
2 1 1 3
3 1 0
REQUESTS/DURATIONS:
jobnr. mode duration N 1
1 1 0 0
2 1 2 1
3 1 0 0
RESOURCE AVAILABILITIES
N 1
1`;
  const parsed = parsePsplib(nonrenewableOnly);
  assert.deepEqual(parsed.resources, [{ name: 'N1', maxCapacity: 1, renewable: false }]);
  assert.deepEqual(parsed.tasks![1].recipes![0].demands, [1]);
  const resourceFree = nonrenewableOnly.replace('nonrenewable : 1', 'nonrenewable : 0')
    .replace('duration N 1', 'duration').replace('1 1 0 0', '1 1 0')
    .replace('2 1 2 1', '2 1 2').replace('3 1 0 0', '3 1 0').replace('\nN 1\n1', '');
  assert.deepEqual(parsePsplib(resourceFree).resources, []);
});
