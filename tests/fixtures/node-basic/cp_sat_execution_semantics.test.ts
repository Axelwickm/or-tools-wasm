import { CpSat } from 'or-tools-wasm/cp-sat';
import assert from 'node:assert/strict';
import { runCpSatSubsolverCases } from '../../cases/or-tools-wasm/cp_sat/subsolver.ts';

const results = await runCpSatSubsolverCases(CpSat);
assert.equal(results.length, 4);
for (const result of results) {
  assert.equal(result.ok, true, result.id);
  console.log(`[PASS] ${result.name}`);
}
