import { CpSat } from 'or-tools-wasm';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';

Deno.test('runs the shared CP-SAT cases in Deno with and without the worker bridge', async () => {
  const results = await runCpSatCases(CpSat);
  const [directResult, workerResult] = results;
  if (JSON.stringify(workerResult.cases) !== JSON.stringify(directResult.cases)) {
    throw new Error('worker and direct modes ran different CP-SAT cases');
  }
  for (const result of results) {
    if (result.cases.length !== cpSatCases.length) {
      throw new Error(`${result.mode} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
    }
  }
});
