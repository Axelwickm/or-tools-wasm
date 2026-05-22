import * as RcpspApi from 'or-tools-wasm/rcpsp';
import { runRcpspCases } from '../browser-basic-src/rcpsp_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const rcpspResults = await runRcpspCases(RcpspApi as never);
  assertAllCases('bun RCPSP', rcpspResults);
  console.log(`bun ran ${rcpspResults.length} RCPSP cases`);
}, async () => {
  RcpspApi.setWorkerBridgeEnabled(false);
  await RcpspApi.terminateLoadedRuntimeThreads();
});
