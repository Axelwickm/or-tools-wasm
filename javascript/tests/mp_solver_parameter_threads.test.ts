import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rootIntegerParameter } from '../lib/mp_solver/text_parameter_threads.ts';
const sat = ['num_workers', 'num_search_workers'];
test('admits root native worker settings without counting nested or quoted fields', () => {
  assert.equal(rootIntegerParameter('num_workers: 4', sat), 4);
  assert.equal(rootIntegerParameter('num_search_workers: 04', sat), 4);
  assert.equal(rootIntegerParameter('num_workers: 0x4', sat), 4);
  assert.equal(rootIntegerParameter(`subsolver_params { num_workers: 17 name: "num_workers: 22" }
    # num_workers: 33
    /* num_workers: 44 */ num_workers: 4`, sat), 4);
  assert.equal(rootIntegerParameter('num_workers: 0', sat), undefined);
  assert.throws(() => rootIntegerParameter('num_workers: -1', sat), /thread count/);
  assert.throws(() => rootIntegerParameter('num_workers: 2147483648', sat), /thread count/);
  assert.throws(() => rootIntegerParameter('num_workers: 4 num_search_workers: 2', sat), /Conflicting/);
});
