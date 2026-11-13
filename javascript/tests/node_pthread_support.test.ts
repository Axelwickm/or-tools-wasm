import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
// @ts-ignore Build-time JavaScript helper, embedded in generated runtime glue.
import { createNodePthreadSupport, patchNodePthreads } from '../../scripts/node_pthread_support.mjs';

class FakeWorker extends EventEmitter {
  options: any;
  terminated = false;
  constructor(_url: unknown, options: any) { super(); this.options = options; }
  async terminate() { this.terminated = true; this.emit('exit', 1); }
}

test('pthread flags remove only input type, including its separate argument', async () => {
  const args = ['--trace-warnings', '--input-type=module', '--input-type', 'commonjs', '--import', './hook.mjs'];
  const support = createNodePthreadSupport(FakeWorker, args);
  const worker = new support.Worker('worker.js', { workerData: 'em-pthread' });
  assert.deepEqual(worker.options, { workerData: 'em-pthread', execArgv: ['--trace-warnings', '--import', './hook.mjs'] });
  assert.equal(args.length, 6);
  await support.initialize(() => ({}));
  assert.equal(support.fail(new Error('after startup')), false);
});

for (const mode of ['error', 'exit', 'throw']) {
  test(`pthread startup ${mode} rejects initialization and cleans the pool`, async () => {
    const support = createNodePthreadSupport(FakeWorker, []);
    const workers = [new support.Worker('a', {}), new support.Worker('b', {})];
    const error = new Error('startup failure');
    const ready = support.initialize(() => {
      if (mode === 'throw') throw error;
      queueMicrotask(() => {
        if (mode === 'error') workers[0].emit('error', error);
        else workers[0].emit('exit', 0);
      });
      return new Promise(() => {});
    });
    await assert.rejects(ready, mode === 'exit' ? /exited during startup/ : (actual: unknown) => actual === error);
    assert.equal(workers[1].terminated, true);
    if (mode !== 'exit') assert.equal(workers[0].terminated, true);
  });
}

test('Node patch fails visibly when upstream worker glue changes', () => {
  assert.throws(() => patchNodePthreads('different upstream glue'), /Unsupported Emscripten/);
});

test('pthread workers retain Node default inheritance when input-type is absent', async () => {
  const support = createNodePthreadSupport(FakeWorker, ['--stack-trace-limit=10', '--trace-warnings']);
  const worker = new support.Worker('worker.js', { workerData: 'em-pthread' });
  assert.deepEqual(worker.options, { workerData: 'em-pthread' });
  await support.initialize(() => ({}));
});
