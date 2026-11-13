import assert from 'node:assert/strict';
import test from 'node:test';
import { patchJspiPthreadEntry } from '../../scripts/patch_jspi_pthread_entry.ts';

// Emscripten 6.0.8's generated entry and the relevant callback/exit semantics.
const entry = 'var invokeEntryPoint=async(ptr,arg)=>{runtimeKeepaliveCounter=0;noExitRuntime=0;var result=WebAssembly.promising(getWasmTableEntry(ptr))(arg);function finish(result){if(keepRuntimeAlive()){EXITSTATUS=result;return}__emscripten_thread_exit(result)}result=await result;finish(result)};';
function runtime(source: string, body: (hooks: { mailbox(): void; retain(): void; exit(): void }) => unknown) {
  return new Function('body', `
    let runtimeKeepaliveCounter=0, noExitRuntime=0, EXITSTATUS=0, current=1;
    const exits=[];
    const runtimeKeepalivePush=()=>{runtimeKeepaliveCounter++};
    const runtimeKeepalivePop=()=>{if(--runtimeKeepaliveCounter<0)throw Error('negative keepalive')};
    const keepRuntimeAlive=()=>noExitRuntime||runtimeKeepaliveCounter>0;
    const __emscripten_thread_exit=result=>{
      if(!current)throw Error('double exit');current=0;exits.push(result);
    };
    const maybeExit=()=>{if(!keepRuntimeAlive()&&current)__emscripten_thread_exit(EXITSTATUS)};
    const mailbox=()=>{try{}finally{maybeExit()}};
    const getWasmTableEntry=()=>()=>body({mailbox,retain:runtimeKeepalivePush,exit:()=>__emscripten_thread_exit(0)});
    const WebAssembly={promising:fn=>fn};
    ${source}
    return {run:()=>invokeEntryPoint(1,0),mailbox,exits,
      count:()=>runtimeKeepaliveCounter,release:runtimeKeepalivePop};
  `)(body);
}

test('pending JSPI entry survives a mailbox callback before its continuation', async () => {
  const body = ({ mailbox }: { mailbox(): void }) => {
    queueMicrotask(mailbox);
    return Promise.resolve(42);
  };
  // Demonstrate the original failure, not just the patched output's spelling.
  await assert.rejects(runtime(entry, body).run(), /double exit/);
  const fixed = runtime(patchJspiPthreadEntry(entry), body);
  await fixed.run();
  assert.deepEqual(fixed.exits, [42]);
  assert.equal(fixed.count(), 0);
});

for (const asynchronous of [false, true]) {
  test(`entry ${asynchronous ? 'rejection' : 'synchronous throw'} releases its keepalive`, async () => {
    const error = new Error('entry failed');
    const fixed = runtime(patchJspiPthreadEntry(entry), () => {
      if (asynchronous) return Promise.reject(error);
      throw error;
    });
    await assert.rejects(fixed.run(), error);
    assert.equal(fixed.count(), 0);
    assert.deepEqual(fixed.exits, []);
  });
}

test('entry preserves independently retained work', async () => {
  const fixed = runtime(patchJspiPthreadEntry(entry), ({ retain, mailbox }) => {
    retain();
    queueMicrotask(mailbox);
    return Promise.resolve(7);
  });
  await fixed.run();
  assert.equal(fixed.count(), 1);
  assert.deepEqual(fixed.exits, []);
  fixed.release();
  fixed.mailbox();
  assert.deepEqual(fixed.exits, [7]);
});

test('explicit pthread exit and unwind do not cause another exit', async () => {
  const fixed = runtime(patchJspiPthreadEntry(entry), ({ exit }) => {
    exit();
    return Promise.reject('unwind');
  });
  await assert.rejects(fixed.run(), (error: unknown) => error === 'unwind');
  assert.deepEqual(fixed.exits, [0]);
  assert.equal(fixed.count(), 0);
});

test('patch is idempotent, leaves Asyncify alone, and rejects unfamiliar JSPI entry', () => {
  const fixed = patchJspiPthreadEntry(entry);
  assert.equal(patchJspiPthreadEntry(fixed), fixed);
  const asyncify = entry.replace('WebAssembly.promising', 'Asyncify.makeAsyncFunction');
  assert.equal(patchJspiPthreadEntry(asyncify), asyncify);
  assert.throws(() => patchJspiPthreadEntry(entry.replace('result=await result;', 'await changed();')), /Unsupported/);
});
