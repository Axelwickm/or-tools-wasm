import { CpSat } from 'or-tools-wasm';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';

Deno.test('runs the shared CP-SAT cases in Deno', async () => {
  if (CpSat.isWorkerBridgeEnabled()) {
    throw new Error('Deno should use the direct runtime by default');
  }
  const results = await runCpSatCases(CpSat, { modes: ['direct'] });
  for (const result of results) {
    if (result.cases.length !== cpSatCases.length) {
      throw new Error(`${result.mode} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
    }
  }
});
