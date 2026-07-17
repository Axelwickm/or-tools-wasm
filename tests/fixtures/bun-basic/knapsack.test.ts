import {
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
  setExecutor,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/knapsack';
import { runKnapsackCases } from '../browser-basic-src/knapsack_runner.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const knapsackResults = await runKnapsackCases({
    initKnapsack,
    KnapsackSolver,
    KnapsackSolverType,
    setExecutor,
  });
  assertAllCases('bun Knapsack', knapsackResults);
  console.log(`bun ran ${knapsackResults.length} Knapsack cases`);
}, async () => {
  setExecutor({ type: 'direct' });
  await terminateLoadedRuntimeThreads();
});
