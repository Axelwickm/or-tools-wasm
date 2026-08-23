import * as RcpspApi from 'or-tools-wasm/rcpsp';
import { runRcpspCases } from '../../cases/python-parity/rcpsp/index.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const rcpspResults = await runRcpspCases(RcpspApi as never);
  assertAllCases('bun RCPSP', rcpspResults);
  console.log(`bun ran ${rcpspResults.length} RCPSP cases`);
});
