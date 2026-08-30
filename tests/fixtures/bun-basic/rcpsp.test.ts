import * as RcpspApi from 'or-tools-wasm/rcpsp';
import { runRcpspCases } from '../../cases/python-parity/rcpsp/index.ts';
import { runRcpspConcurrencyCase } from '../../cases/or-tools-wasm/rcpsp/concurrency.ts';
import { runRcpspEventHandlerCase } from '../../cases/or-tools-wasm/rcpsp/event_handler.ts';
import { runRcpspWorkerLifecycleCase } from '../../cases/or-tools-wasm/rcpsp/worker_lifecycle.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const rcpspResults = await runRcpspCases(RcpspApi);
  assertAllCases('bun RCPSP', rcpspResults);
  await runRcpspConcurrencyCase(RcpspApi);
  await runRcpspWorkerLifecycleCase(RcpspApi);
  await runRcpspEventHandlerCase(RcpspApi);
  console.log(`bun ran ${rcpspResults.length} RCPSP cases`);
});
