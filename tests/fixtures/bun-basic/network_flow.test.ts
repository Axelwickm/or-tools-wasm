import {
  SimpleLinearSumAssignment,
  SimpleLinearSumAssignmentStatus,
  SimpleMaxFlow,
  SimpleMaxFlowStatus,
  SimpleMinCostFlow,
  SimpleMinCostFlowStatus,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/network-flow';
import { runNetworkFlowCases } from '../../cases/python-parity/network_flow/index.ts';
import { runNetworkFlowConcurrencyCase } from '../../cases/or-tools-wasm/network_flow/concurrency.ts';
import { runNetworkFlowEventHandlerCase } from '../../cases/or-tools-wasm/network_flow/event_handler.ts';
import { runNetworkFlowWorkerLifecycleCase } from '../../cases/or-tools-wasm/network_flow/worker_lifecycle.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const networkFlowResults = await runNetworkFlowCases({
    SimpleMaxFlow,
    SimpleMaxFlowStatus,
    SimpleMinCostFlow,
    SimpleMinCostFlowStatus,
    SimpleLinearSumAssignment,
    SimpleLinearSumAssignmentStatus,
  });
  await runNetworkFlowConcurrencyCase({ SimpleMaxFlow });
  await runNetworkFlowWorkerLifecycleCase({ SimpleMaxFlow });
  await runNetworkFlowEventHandlerCase({ SimpleMaxFlow });
  assertAllCases('bun Network Flow', networkFlowResults);
  console.log(`bun ran ${networkFlowResults.length} Network Flow cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
