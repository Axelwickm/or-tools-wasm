import * as cpSat from 'or-tools-wasm/cp-sat';
import * as mp from 'or-tools-wasm/mp-solver';
import * as routing from 'or-tools-wasm/routing';
import * as knapsack from 'or-tools-wasm/knapsack';
import * as flow from 'or-tools-wasm/network-flow';
import * as cover from 'or-tools-wasm/set-cover';
import * as mathopt from 'or-tools-wasm/mathopt';
import { runSolveResultCases } from '../../cases/or-tools-wasm/solve_results.ts';

const apis = { cpSat, mp, routing, knapsack, flow, cover, mathopt };
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  assertAllCases('bun solve results', await runSolveResultCases(apis as never));
}, () => cpSat.terminateLoadedRuntimeThreads());
