import {
  initNetworkFlow,
  setExecutor,
  SimpleLinearSumAssignment,
  SimpleMaxFlow,
  SimpleMinCostFlow,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/network-flow';
import { runNetworkFlowCases } from '../browser-basic-src/network_flow_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const networkFlowResults = await runNetworkFlowCases({
    initNetworkFlow,
    SimpleMaxFlow,
    SimpleMinCostFlow,
    SimpleLinearSumAssignment,
    setExecutor,
  });
  assertAllCases('bun Network Flow', networkFlowResults);
  console.log(`bun ran ${networkFlowResults.length} Network Flow cases`);
}, async () => {
  setExecutor({ type: 'direct' });
  await terminateLoadedRuntimeThreads();
});
