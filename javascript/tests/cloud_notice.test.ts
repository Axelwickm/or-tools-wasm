import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { build } from 'esbuild';
import type { executeSolverJob } from '../lib/solver_job.ts';
import type { setCloudNoticeEnabled } from '../lib/cloud_notice.ts';

const bundled = await build({
  stdin: {
    contents: `export { executeSolverJob } from './solver_job.js';
      export { setCloudNoticeEnabled } from './cloud_notice.js';`,
    resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)),
  },
  bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'api',
});
type Api = { executeSolverJob: typeof executeSolverJob; setCloudNoticeEnabled: typeof setCloudNoticeEnabled };
const executor = {
  solver: 'test', load: async () => {}, terminate() {},
  execute: () => ({ requestId: 1, result: Promise.resolve(42), cancel: async () => {} }),
};

test('cloud notice is local, suppressible and once per context across bundled copies', async () => {
  const messages: string[] = [];
  const env: Record<string, string> = { ORTOOLS_WASM_CLOUD_NOTICE: '0', FORCE_COLOR: '1', NO_COLOR: '' };
  const context = createContext({
    console: { info: (message: string) => messages.push(message) },
    process: { env, stdout: { isTTY: true } },
    fetch: () => { throw new Error('notice must not make a request'); },
  });
  const load = (): Api => {
    runInContext(bundled.outputFiles[0].text, context);
    return context.api;
  };
  const first = load();
  assert.equal(messages.length, 0, 'import is quiet');
  await first.executeSolverJob(executor, {}, { showCloudNotice: true });
  assert.equal(messages.length, 0, 'environment suppresses notice');
  delete env.ORTOOLS_WASM_CLOUD_NOTICE;
  first.setCloudNoticeEnabled(false);
  const second = load();
  await second.executeSolverJob(executor, {}, { showCloudNotice: true });
  assert.equal(messages.length, 0, 'API suppression spans bundles');
  second.setCloudNoticeEnabled(true);
  await first.executeSolverJob(executor, {}, {});
  assert.equal(messages.length, 0, 'unmarked operations are quiet');
  await assert.rejects(first.executeSolverJob({
    ...executor,
    execute: () => ({ ...executor.execute(), result: Promise.reject(new Error('solve failed')) }),
  }, {}, { showCloudNotice: true }), /solve failed/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(first.executeSolverJob(executor, {}, {
    showCloudNotice: true, signal: controller.signal,
  }));
  assert.equal(messages.length, 0, 'failed and cancelled jobs are quiet');
  assert.equal(await first.executeSolverJob(executor, {}, { showCloudNotice: true }), 42);
  await second.executeSolverJob(executor, {}, { showCloudNotice: true });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Build your app\. Let us run the solvers\./);
  assert.match(messages[0], /Send optimization jobs through an API\./);
  assert.match(messages[0], /We handle the compute, queues, and scaling\./);
  assert.match(messages[0], /Explore cloud \/ early access/);
  assert.doesNotMatch(messages[0], /\x1b\[/, 'NO_COLOR wins over FORCE_COLOR');
  assert.equal(new Set(messages[0].split('\n').map((line) => line.length)).size, 1);
});

test('cloud notice uses terminal color and cannot fail a completed solve', async () => {
  const messages: string[] = [];
  const context = createContext({
    console: { info: (message: string) => { messages.push(message); throw new Error('logger failed'); } },
    process: { env: {}, stdout: { isTTY: true } },
  });
  runInContext(bundled.outputFiles[0].text, context);
  const api: Api = context.api;
  assert.equal(await api.executeSolverJob(executor, {}, { showCloudNotice: true }), 42);
  assert.match(messages[0], /^\x1b\[36m/);
  await api.executeSolverJob(executor, {}, { showCloudNotice: true });
  assert.equal(messages.length, 1);
});

test('denied environment access does not fail a solve or suppress the notice', async () => {
  const messages: string[] = [];
  const context = createContext({
    console: { info: (message: string) => messages.push(message) },
    process: {
      env: new Proxy({}, { get() { throw new Error('environment access denied'); } }),
      stdout: { isTTY: false },
    },
  });
  runInContext(bundled.outputFiles[0].text, context);
  const api: Api = context.api;
  assert.equal(await api.executeSolverJob(executor, {}, { showCloudNotice: true }), 42);
  await api.executeSolverJob(executor, {}, { showCloudNotice: true });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /OR-Tools WASM Cloud/);
  assert.doesNotMatch(messages[0], /\x1b\[/);
});
