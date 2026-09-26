import * as cpSat from 'or-tools-wasm/cp-sat';
import * as mp from 'or-tools-wasm/mp-solver';
import * as routing from 'or-tools-wasm/routing';
import * as knapsack from 'or-tools-wasm/knapsack';
import * as flow from 'or-tools-wasm/network-flow';
import * as cover from 'or-tools-wasm/set-cover';
import * as mathopt from 'or-tools-wasm/mathopt';
import { solveResultCases } from '../../cases/or-tools-wasm/solve_results.ts';
import { executorFixtureModes } from '../../harness/shared_case.ts';

const apis = { cpSat, mp, routing, knapsack, flow, cover, mathopt };

for (const testCase of solveResultCases) {
  for (const mode of executorFixtureModes) {
    Deno.test({
      name: `${testCase.id} (${mode})`,
      sanitizeResources: false,
      sanitizeOps: false,
      async fn() {
        try { await testCase.run(apis as never, { mode }); }
        finally { await cpSat.terminateLoadedRuntimeThreads(); }
      },
    });
  }
}
