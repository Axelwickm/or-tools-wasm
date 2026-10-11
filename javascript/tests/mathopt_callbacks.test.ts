import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { setImmediate as nextTurn } from 'node:timers/promises';
import * as protobuf from 'protobufjs';
import type { MathOptCallbackResult } from '../lib/mathopt/callbacks.ts';

test('callback reply transport preserves empty and multi-chunk native protos and user errors', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-callbacks-', import.meta.url)));
  let executor: { terminate(): void } | undefined;
  try {
    const outfile = `${directory}/bridge.mjs`;
    await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)), contents:
      `export {SolverWorkerExecutor} from './worker_helpers.ts'; export {installSolverWorker} from './solver_worker.ts'; export {executeSolverJob} from './solver_job.ts'; export * from './mathopt/callbacks.ts'; export {mathOptCallbackDescriptor} from './generated/mathopt_callback_schemas.ts'; export {DirectMathOptExecutor} from './mathopt/direct_executor.ts'; export {SolverCallbackTransportError} from './solver_executor.ts';` },
      bundle: true, platform: 'node', format: 'esm', outfile, packages: 'external' });
    const api = await import(outfile);
    const nativeType = protobuf.Root.fromJSON(api.mathOptCallbackDescriptor).resolveAll().lookupType('operations_research.math_opt.CallbackDataProto');
    const exact = 9007199254740993n;
    const snapshot = api.decodeMathOptCallbackData(nativeType.encode(nativeType.fromObject({ event: 4,
      primalSolutionVector: { ids: [String(exact)], values: [1] }, mipStats: { exploredNodes: String(exact) } })).finish());
    assert.equal(snapshot.event, 4);
    assert.equal(snapshot.primalSolutionVector.ids[0], exact);
    assert.equal(snapshot.mipStats.exploredNodes, exact);
    assert.equal(snapshot.runtime, undefined);
    const reply: MathOptCallbackResult = {
      terminate: false,
      cuts: [{ linearExpression: { ids: [exact], values: [1.5] }, lowerBound: -Infinity, upperBound: 2, isLazy: true },
        { linearExpression: { ids: [7], values: [-1] }, lowerBound: 0, upperBound: Infinity, isLazy: false }],
      suggestedSolutions: [{ ids: [exact, exact + 1n], values: [0, 1] }],
    };
    const resultType = protobuf.Root.fromJSON(api.mathOptCallbackDescriptor).resolveAll()
      .lookupType('operations_research.math_opt.CallbackResultProto');
    const replyBytes = api.callbackHandler(() => reply)(new Uint8Array());
    const decoded = resultType.decode(replyBytes) as any;
    assert.equal(decoded.cuts[0].linearExpression.ids[0].toString(), String(exact));
    assert.equal(decoded.cuts[0].lowerBound, -Infinity);
    assert.equal(decoded.cuts[0].upperBound, 2);
    assert.equal(decoded.cuts[0].isLazy, true);
    assert.equal(decoded.cuts[1].upperBound, Infinity);
    assert.equal(decoded.cuts[1].isLazy, false);
    assert.deepEqual(decoded.suggestedSolutions[0].ids.map(String), [String(exact), String(exact + 1n)]);
    assert.deepEqual(decoded.suggestedSolutions[0].values, [0, 1]);
    assert.deepEqual(api.encodeMathOptCallbackResult(replyBytes), new Uint8Array(replyBytes), 'native callback result bytes stay available');
    let allocation = 16;
    const module = { HEAPU8: new Uint8Array(4096), _malloc: (count: number) => { const pointer = allocation; allocation += count; return pointer; },
      _free: () => {}, __mathoptCallbacks: new Map<number, (bytes: Uint8Array) => number>(), ccall: (_name: string, _type: string, _types: string[], args: number[]) => {
        module.__mathoptCallbacks.get(args[7])!(new Uint8Array());
        new DataView(module.HEAPU8.buffer).setUint32(args[4], 0, true);
        return 0;
      } };
    const direct = new api.DirectMathOptExecutor(async () => module);
    const request = {type:'solve',request:Uint8Array.of(1),useInterrupter:false,interruptAtStart:false,callbackRegistration:Uint8Array.of(8,4)};
    const transportFailure = new api.SolverCallbackTransportError('reply timed out');
    await assert.rejects(direct.execute(request, {onEvent:()=>{},onCallback:()=>{throw transportFailure;}}).result,
      error=>error===transportFailure);
    const codec = { solver: 'test', label: 'Test', encodeRequest: (bytes: Uint8Array) => bytes,
      decodeRequest: (bytes: Uint8Array) => bytes, encodeResult: (bytes: Uint8Array) => bytes, decodeResult: (bytes: Uint8Array) => bytes };
    const worker = () => Promise.resolve(new Worker(`
      const {parentPort} = require('node:worker_threads');
      import(${JSON.stringify(outfile)}).then(({installSolverWorker}) => {
        const scope = {onmessage:null,postMessage:(bytes,transfer)=>parentPort.postMessage(bytes,transfer)};
        parentPort.on('message', data=>scope.onmessage({data}));
        const codec = {solver:'test',label:'Test',encodeRequest:x=>x,decodeRequest:x=>x,encodeResult:x=>x,decodeResult:x=>x};
        installSolverWorker(scope, {solver:'test',execute:(data,options)=>({requestId:1,cancel:async()=>{},result:Promise.resolve().then(()=>{
          try{return options.onCallback(data);}catch{return new Uint8Array();}
        })})}, codec);
      });`, { eval: true }));
    const instance = new api.SolverWorkerExecutor(codec, worker);
    executor = instance;
    for (const length of [0, 2, 65536, 65537, 200000]) {
      const bytes = Uint8Array.from({length}, (_, index) => index % 251);
      const result = await api.executeSolverJob(instance, bytes, { onCallback: (data: Uint8Array) => {
        assert.deepEqual(data, bytes); return data.reverse();
      } });
      assert.deepEqual(result, bytes.slice().reverse());
    }
    const failure = new Error('reply failed');
    await assert.rejects(api.executeSolverJob(instance, new Uint8Array(), {onCallback: () => {throw failure;}}), error => error === failure);
    const result = await api.executeSolverJob(instance, Uint8Array.of(7), {onCallback: (data: Uint8Array) => data});
    assert.deepEqual(result, Uint8Array.of(7));
    assert.throws(() => api.callbackHandler(() => Promise.resolve({terminate:true}))(new Uint8Array()), /synchronously/);
    assert.throws(() => api.encodeMathOptCallbackResult(Uint8Array.of(255)), /range|index|wire/i);
  } finally { executor?.terminate(); await rm(directory, {recursive:true,force:true}); }
});

test('worker callback transfers stop on crashes, failed jobs and missing acknowledgements', async t => {
  const bundled = await build({stdin:{resolveDir:fileURLToPath(new URL('../lib',import.meta.url)),contents:
    `export {SolverWorkerExecutor} from './worker_helpers.ts'; export {installSolverWorker} from './solver_worker.ts'; export * from './solver_bridge.ts';
     export {createSolverFailureEvent, SolverFailureKind} from './solver_executor.ts';
     export {CALLBACK_REPLY_TIMEOUT_MS, WORKER_CALLBACK_REPLY_CHUNK_SIZE} from './solver_worker.ts';`},
    bundle:true,write:false,platform:'node',format:'esm'});
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
  const codec = {solver:'test',label:'Test',encodeRequest:(x:Uint8Array)=>x,decodeResult:(x:Uint8Array)=>x};
  await t.test('receiver timeout closes a chunk published at the deadline', async t => {
    let control: Int32Array | undefined;
    const responses: Uint8Array[] = [];
    const scope = {onmessage:null as any,postMessage:(message:any)=>{
      if (message instanceof Uint8Array) responses.push(message);
      else if (message.type === 'callback') control = new Int32Array(message.reply,0,3);
    }};
    t.mock.method(Atomics,'wait',(words:Int32Array)=>{
      Atomics.store(words,0,1); // Sender publication wins just as the wait expires.
      return 'timed-out';
    });
    api.installSolverWorker(scope,{solver:'test',execute:(_:unknown,options:any)=>({
      requestId:1,cancel:async()=>{},result:Promise.resolve().then(()=>options.onCallback(new Uint8Array())),
    })},{...codec,decodeRequest:(x:Uint8Array)=>x,encodeResult:(x:Uint8Array)=>x});
    await scope.onmessage({data:api.encodeSolverBridgeRequest({requestId:1,solver:'test',payload:new Uint8Array()})});
    assert.equal(Atomics.load(control!,0),-2,'timeout closes the transfer even after chunk publication');
    const failure = responses.find(bytes=>api.decodeSolverBridgeResponse(bytes).payload.case==='failure');
    assert.ok(failure);
    assert.match(api.decodeSolverBridgeResponse(failure).payload.value.message,/timed out/);
  });
  for (const failure of ['crash','exit','job failure','missing acknowledgement','termination'] as const) {
    await t.test(failure, async t => {
      let receive!: (message: unknown) => void;
      let error!: (failure: Error) => void;
      let exit!: (code: number) => void;
      let control: Int32Array | undefined;
      let requestId = 0;
      const worker = {
        on:(event:string, listener:(message:any)=>void) => {
          if (event === 'message') {
            receive = listener;
            queueMicrotask(()=>receive(api.encodeSolverBridgeReady('test')));
          } else if (event === 'error') error = listener;
          else if (event === 'exit') exit = listener;
        },
        terminate:()=>{},
        postMessage:(bytes:Uint8Array)=>{
          requestId = api.decodeSolverBridgeRequest(bytes).requestId;
          const reply = new SharedArrayBuffer(12 + api.WORKER_CALLBACK_REPLY_CHUNK_SIZE);
          control = new Int32Array(reply,0,3);
          receive({type:'callback',requestId,payload:new Uint8Array(),reply});
        },
      };
      const executor = new api.SolverWorkerExecutor(codec,async()=>worker);
      try {
        await executor.load();
        const result = executor.execute(new Uint8Array(), {
          onEvent:()=>{},onCallback:()=>new Uint8Array(200000),
        }).result;
        const rejected = assert.rejects(result);
        while (!control) await nextTurn();
        assert.equal(Atomics.load(control,0),1,'first chunk waits for receiver acknowledgement');
        if (failure === 'crash') error(new Error('worker crashed'));
        else if (failure === 'exit') exit(1);
        else if (failure === 'job failure') receive(api.encodeSolverBridgeFailure(requestId,'test',
          api.createSolverFailureEvent('test',requestId,'native job failed',api.SolverFailureKind.WORKER_CRASH).failure));
        else if (failure === 'termination') executor.terminate();
        else {
          const deadline = Date.now() + api.CALLBACK_REPLY_TIMEOUT_MS + 1;
          t.mock.timers.enable({apis:['Date'], now:deadline});
          await new Promise(resolve=>setTimeout(resolve,5));
          assert.equal(Atomics.load(control,0),-2,'sender deadline closes the transfer without a worker reply');
          executor.terminate();
        }
        await rejected;
        assert.equal(Atomics.load(control,0),-2,'failed job releases pending callback transfer');
        await nextTurn();
      } finally {executor.terminate();}
    });
  }
});
