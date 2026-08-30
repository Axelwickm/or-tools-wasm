import {
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from '../../../harness/shared_case.ts';

let setCoverMode: ExecutorFixtureMode = 'direct';

export function setSetCoverMode(mode: ExecutorFixtureMode): void {
  setCoverMode = mode;
}

export function setCoverExecutionOptions() {
  return {
    executor: setCoverMode === 'server'
      ? serverExecutorConfiguration()
      : setCoverMode,
  };
}
