import { CpSat } from 'or-tools-wasm';
import { cpSatCases, runCpSatCases } from '../browser-basic-src/cpsat_runner.ts';

const results = await runCpSatCases(CpSat, { modes: ['direct'] });

for (const result of results) {
  if (result.cases.length !== cpSatCases.length) {
    throw new Error(`node ${result.workerProfile} ran ${result.cases.length} cases, expected ${cpSatCases.length}`);
  }

  for (const testCase of result.cases) {
    if (!testCase.ok) {
      throw new Error(`node ${result.workerProfile} case failed: ${testCase.name}`);
    }
  }
}

console.log(`node ran ${cpSatCases.length} CP-SAT cases across ${results.length} worker profiles`);
