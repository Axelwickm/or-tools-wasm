import { test } from 'node:test';
import { packageName, version } from 'or-tools-wasm';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import { runCloudExecutorCase } from '../../cases/or-tools-wasm/cloud_executor.ts';

test('cloud executor checks service status without sending the model', async () => {
  await runCloudExecutorCase(CpSatApi, { packageName, version });
});
