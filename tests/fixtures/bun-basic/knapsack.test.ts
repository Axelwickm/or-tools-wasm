import {
  initKnapsack,
  isWorkerBridgeAvailable,
  isWorkerBridgeEnabled,
  KnapsackSolver,
  KnapsackSolverType,
  setWorkerBridgeEnabled,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/knapsack';
import { runKnapsackCases } from '../browser-basic-src/knapsack_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const knapsackResults = await runKnapsackCases({
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setWorkerBridgeEnabled,
    isWorkerBridgeEnabled,
    isWorkerBridgeAvailable,
  });
  assertAllCases('bun Knapsack', knapsackResults);
  console.log(`bun ran ${knapsackResults.length} Knapsack cases`);
}, async () => {
  setWorkerBridgeEnabled(false);
  await terminateLoadedRuntimeThreads();
});
