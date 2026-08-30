import {
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from '../../../harness/shared_case.ts';

let routingMode: ExecutorFixtureMode = 'direct';

export function setRoutingMode(mode: ExecutorFixtureMode): void {
  routingMode = mode;
}

export function routingExecutionOptions() {
  return {
    executor: routingMode === 'server'
      ? serverExecutorConfiguration()
      : routingMode,
  };
}
