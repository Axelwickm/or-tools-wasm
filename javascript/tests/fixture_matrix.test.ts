import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCaseMatrix } from '../../tests/harness/shared_case.ts';

test('fixture matrix rejects missing cases and executor modes', () => {
  const cases = [{ id: 'a' }, { id: 'b' }];
  const modes = ['direct', 'worker', 'server'];
  const results = cases.flatMap(({ id }) => modes.map((mode) => ({ id, mode, ok: true })));
  assertCaseMatrix(results, cases, modes);
  assert.throws(() => assertCaseMatrix(results.filter((r) => r.mode !== 'server'), cases, modes), /a:server/);
  assert.throws(() => assertCaseMatrix(results.filter((r) => r.id !== 'b'), cases, modes), /b:direct/);
  assert.throws(() => assertCaseMatrix([...results, { id: 'c', mode: 'direct', ok: true }], cases, modes), /Unexpected/);
  assert.throws(() => assertCaseMatrix([{ id: 'a', mode: 'direct', ok: false }], cases, modes), /failed/);
});
