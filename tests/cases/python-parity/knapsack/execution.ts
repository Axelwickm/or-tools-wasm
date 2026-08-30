import {
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from '../../../harness/shared_case.ts';

let knapsackMode: ExecutorFixtureMode = 'direct';

export function setKnapsackMode(mode: ExecutorFixtureMode): void {
  knapsackMode = mode;
}

export function knapsackExecutionOptions() {
  return {
    executor: knapsackMode === 'server'
      ? serverExecutorConfiguration()
      : knapsackMode,
  };
}
