import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { ManagedWorker, WorkerLike } from '../lib/worker_helpers.ts';

type Request = { id: number; value: number };
type Response = { ready?: boolean; id?: number; value?: number; custom?: boolean; event?: boolean };

test('concurrent loads and posts share worker readiness and deliver events once', { timeout: 10_000 }, async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { ManagedWorker } from './worker_helpers.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const events = new EventEmitter();
  let creations = 0, posts = 0, notifications = 0;
  let finishCreation!: (worker: WorkerLike<Request, Response>) => void;
  const creating = new Promise<WorkerLike<Request, Response>>(resolve => { finishCreation = resolve; });
  const worker = { on: events.on.bind(events), terminate() {}, postMessage() { ++posts; } };
  const manager: ManagedWorker<Request, Response> = new api.ManagedWorker({
    createWorker: () => { ++creations; return creating; },
    isReady: (response: Response) => response.ready === true,
    isEvent: (response: Response) => response.event === true,
    getRequestId: (request: Request) => request.id, getResponseId: (response: Response) => response.id,
  });
  try {
    const first = manager.load(), second = manager.load();
    const result = manager.post({ id: 1, value: 7 }, () => { ++notifications; });
    finishCreation(worker);
    await nextTurn();
    assert.equal(creations, 1);
    assert.equal(posts, 0, 'Every waiter waits for the native ready handshake');
    for (const event of ['message', 'error', 'exit']) assert.equal(events.listenerCount(event), 1);
    events.emit('message', { ready: true });
    await Promise.all([first, second]);
    await nextTurn();
    assert.equal(posts, 1);
    events.emit('message', { id: 1, event: true });
    events.emit('message', { id: 1, value: 7 });
    assert.deepEqual(await result, { id: 1, value: 7 });
    assert.equal(notifications, 1);
  } finally { manager.terminate(); }
});

test('managed workers reject unexpected exits and ignore retired workers', { timeout: 10_000 }, async t => {
  const bundled = await build({
    stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
      contents: `export {ManagedWorker} from './worker_helpers.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm',
  });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const protocol = {
    isReady: (message: Response) => message.ready === true,
    getRequestId: (request: Request) => request.id,
    getResponseId: (message: Response) => message.id,
  };

  for (const stage of ['startup', 'request', 'idle'] as const) {
    for (const code of [0, 1]) {
      await t.test(`exit ${code} during ${stage} allows a fresh worker`, async () => {
        let creations = 0;
        let errors = 0;
        let exited!: () => void;
        const exit = new Promise<void>(resolve => { exited = resolve; });
        let first!: Worker;
        const manager: ManagedWorker<Request, Response> = new api.ManagedWorker({ ...protocol,
          createWorker: async () => {
            const failing = creations++ === 0;
            const worker = new Worker(`
              const {parentPort} = require('node:worker_threads');
              ${failing && stage === 'startup' ? `process.exit(${code});` : ''}
              parentPort.postMessage({ready:true});
              parentPort.on('message', request => {
                ${failing ? `process.exit(${code});` : 'parentPort.postMessage({id:request.id,value:request.value});'}
              });
            `, { eval: true, execArgv: [] });
            if (failing) {
              first = worker;
              worker.on('error', () => { ++errors; });
              worker.on('exit', () => exited());
            }
            return worker;
          },
        });
        try {
          if (stage === 'startup') {
            await assert.rejects(manager.load(), new RegExp(`exited unexpectedly with code ${code}`));
          } else if (stage === 'request') {
            await assert.rejects(manager.post({ id: 1, value: 7 }), new RegExp(`exited unexpectedly with code ${code}`));
          } else {
            await manager.load();
            first.ref();
            first.postMessage({ id: 1, value: 7 });
          }
          await exit;
          assert.equal(errors, 0, 'exit does not require a JavaScript error event');
          assert.deepEqual(await manager.post({ id: 2, value: 42 }), { id: 2, value: 42 });
          assert.equal(creations, 2, 'the terminated worker is replaced');
        } finally { manager.terminate(); }
      });
    }
  }

  for (const adapter of ['node', 'browser'] as const) {
    await t.test(`late ${adapter} events cannot affect a replacement worker`, async () => {
      type ControlledWorker = WorkerLike<Request, Response> & {
        events: EventEmitter;
        terminated: number;
        received: Promise<void>;
        emitMessage(message: Response): void;
        emitError(): void;
      };
      const workers: ControlledWorker[] = [];
      let customMessages = 0;
      let cleanups = 0;
      const manager: ManagedWorker<Request, Response> = new api.ManagedWorker({ ...protocol,
        onTerminate: () => { ++cleanups; },
        handleMessage: (message: Response) => {
          if (!message.custom) return false;
          ++customMessages;
          return true;
        },
        createWorker: async () => {
          let posted!: () => void;
          const events = new EventEmitter();
          const worker: ControlledWorker = {
            events, terminated: 0,
            received: new Promise<void>(resolve => { posted = resolve; }),
            postMessage: () => posted(),
            terminate() { ++this.terminated; },
            emitMessage(message) {
              if (adapter === 'node') events.emit('message', message);
              else this.onmessage?.({ data: message } as MessageEvent<Response>);
            },
            emitError() {
              if (adapter === 'node') events.emit('error', new Error('late error'));
              else this.onerror?.({ message: 'late error', error: new Error('late error') } as ErrorEvent);
            },
          };
          if (adapter === 'node') worker.on = events.on.bind(events);
          workers.push(worker);
          // Listener installation occurs after the asynchronous factory returns.
          setImmediate(() => worker.emitMessage({ ready: true }));
          return worker;
        },
      });
      try {
        const original = manager.post({ id: 1, value: 1 });
        const originalRejected = assert.rejects(original, /replace worker/);
        await nextTurn();
        await workers[0].received;
        manager.terminate('replace worker');
        await originalRejected;
        let settled = false;
        const replacement = manager.post({ id: 1, value: 42 });
        void replacement.then(() => { settled = true; }, () => { settled = true; });
        await nextTurn();
        await workers[1].received;
        // Reuse the request ID so an old terminal response would be observable.
        workers[0].emitMessage({ id: 1, value: 999 });
        workers[0].emitMessage({ custom: true });
        workers[0].emitMessage({ ready: true });
        workers[0].emitError();
        if (adapter === 'node') workers[0].events.emit('exit', 1);
        await nextTurn();
        assert.equal(settled, false);
        assert.equal(workers[1].terminated, 0);
        assert.equal(cleanups, 1, 'retired events cannot run current cleanup');
        assert.equal(customMessages, 0, 'retired callback/cancellation messages are ignored');
        workers[1].emitMessage({ id: 1, value: 42 });
        assert.deepEqual(await replacement, { id: 1, value: 42 });
      } finally { manager.terminate(); }
    });
  }
});

test('managed workers retry creation and release failed posts without unrefing other jobs', async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { ManagedWorker } from './worker_helpers.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const events = new EventEmitter();
  let attempts = 0, refs = 0, unrefs = 0;
  const worker = { on: events.on.bind(events), terminate() {}, ref() { ++refs; }, unref() { ++unrefs; },
    postMessage(request: Request) { if (request.value < 0) throw new Error('post failed'); } };
  const manager: ManagedWorker<Request, Response> = new api.ManagedWorker({
    createWorker: async () => { if (++attempts === 1) throw new Error('creation failed'); return worker; },
    getRequestId: (request: Request) => request.id, getResponseId: (response: Response) => response.id,
  });
  try {
    await assert.rejects(manager.load(), /creation failed/);
    await assert.rejects(manager.post({ id: 1, value: -1 }), /post failed/);
    assert.equal(attempts, 2); assert.equal(refs, 1); assert.equal(unrefs, 1);
    const pending = manager.post({ id: 2, value: 42 });
    await nextTurn();
    await assert.rejects(manager.post({ id: 3, value: -1 }), /post failed/);
    assert.equal(unrefs, 1, 'Another pending job still needs the worker');
    events.emit('message', { id: 2, value: 42 });
    assert.deepEqual(await pending, { id: 2, value: 42 });
    assert.equal(unrefs, 2, 'The last successful job releases the reference');
    // Reuse the failed request id; no stale pending entry may interfere.
    const recovered = manager.post({ id: 3, value: 7 });
    await nextTurn(); events.emit('message', { id: 3, value: 7 });
    assert.deepEqual(await recovered, { id: 3, value: 7 });
  } finally { manager.terminate(); }
});


test('a retired worker startup failure cannot discard its replacement startup', async () => {
  const bundled = await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)),
    contents: `export { ManagedWorker } from './worker_helpers.ts';` },
    bundle: true, write: false, platform: 'node', format: 'esm' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  let fail!: (error: Error) => void, finish!: (worker: WorkerLike<Request, Response>) => void;
  let attempts = 0;
  const manager: ManagedWorker<Request, Response> = new api.ManagedWorker({
    createWorker: () => {
      ++attempts;
      return new Promise<WorkerLike<Request, Response>>((resolve, reject) => {
        if (attempts === 1) fail = reject; else finish = resolve;
      });
    },
    getRequestId: (request: Request) => request.id, getResponseId: (response: Response) => response.id,
  });
  try {
    const old = manager.load();
    const rejected = assert.rejects(old, /retired failure/);
    manager.terminate();
    const replacement = manager.load();
    fail(new Error('retired failure'));
    await rejected;
    const shared = manager.load();
    assert.equal(attempts, 2, 'Retired rejection cannot clear the new in-flight factory');
    finish({ postMessage() {}, terminate() {} });
    await replacement; await shared;
    assert.equal(attempts, 2);
  } finally { manager.terminate(); }
});
