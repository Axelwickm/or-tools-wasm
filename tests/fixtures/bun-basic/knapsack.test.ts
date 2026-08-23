import {
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
  setExecutor,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/knapsack';
import { runKnapsackCases } from '../../cases/python-parity/knapsack/index.ts';
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
