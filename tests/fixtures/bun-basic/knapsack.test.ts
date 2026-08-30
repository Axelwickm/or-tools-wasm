import {
  KnapsackSolver,
  KnapsackSolverType,
  terminateLoadedRuntimeThreads,
} from 'or-tools-wasm/knapsack';
import { runKnapsackCases } from '../../cases/python-parity/knapsack/index.ts';
import { runKnapsackConcurrencyCase } from '../../cases/or-tools-wasm/knapsack/concurrency.ts';
import { runKnapsackEventHandlerCase } from '../../cases/or-tools-wasm/knapsack/event_handler.ts';
import { runKnapsackWorkerLifecycleCase } from '../../cases/or-tools-wasm/knapsack/worker_lifecycle.ts';
import { assertAllCases, runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  const knapsackResults = await runKnapsackCases({
    KnapsackSolver,
    KnapsackSolverType,
  });
  await runKnapsackWorkerLifecycleCase({ KnapsackSolver, KnapsackSolverType });
  await runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType });
  await runKnapsackEventHandlerCase({ KnapsackSolver, KnapsackSolverType });
  assertAllCases('bun Knapsack', knapsackResults);
  console.log(`bun ran ${knapsackResults.length} Knapsack cases`);
}, async () => {
  await terminateLoadedRuntimeThreads();
});
