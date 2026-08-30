import {
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from '../../../harness/shared_case.ts';

let networkFlowMode: ExecutorFixtureMode = 'direct';

export function setNetworkFlowMode(mode: ExecutorFixtureMode): void {
  networkFlowMode = mode;
}

export function networkFlowExecutionOptions() {
  return {
    executor: networkFlowMode === 'server'
      ? serverExecutorConfiguration()
      : networkFlowMode,
  };
}
