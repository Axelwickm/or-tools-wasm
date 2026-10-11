import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

const responseType = protobuf.parse(`syntax = "proto3";
  message Primal { double objective_value = 2; int32 feasibility_status = 3; }
  message Solution { Primal primal_solution = 1; }
  message Result { repeated Solution solutions = 3; }
  message Response { Result result = 1; string messages = 2; }
`).root.lookupType('Response');

test('incremental handles belong to the local runtime that created them', { timeout: 10_000 }, async t => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-lifecycle-', import.meta.url)));
  const globals = globalThis as Record<string, any>;
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      stdin: { resolveDir: fileURLToPath(new URL('../lib', import.meta.url)), contents: `
        export * from './mathopt.ts';
        export {mathOptProtocol} from './mathopt/protocol.ts';
        export * from './solver_bridge.ts';
        export {createSolverJobStatusEvent, SolverJobState} from './solver_executor.ts';
      ` },
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      define: { Worker: 'globalThis.__mathoptLifecycleWorker' },
      plugins: [{ name: 'controlled-runtime', setup(builder) {
        builder.onResolve({ filter: /runtime_loader\.js$/ }, () => ({ path: 'runtime', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export const loadMathOptRuntime = async () => globalThis.__mathoptLifecycleModule;
          export const terminateLoadedRuntimeThreads = async () => {};
        ` }));
      } }],
    });
    const api = await import(outfile);

    class NativeState {
      nextHandle = 1;
      handles = new Set<number>();
      calls: string[] = [];
      readonly objective: number;
      constructor(objective: number) { this.objective = objective; }
      execute(type: string, handle?: number): Uint8Array {
        this.calls.push(type);
        if (type === 'incrementalCreate') {
          const id = this.nextHandle++;
          this.handles.add(id);
          return responseType.encode({ messages: String(id) }).finish();
        }
        assert.ok(this.handles.has(handle!), 'native handle must exist');
        if (type === 'incrementalUpdate') return Uint8Array.of(1);
        if (type === 'incrementalDelete') {
          this.handles.delete(handle!);
          return new Uint8Array();
        }
        return responseType.encode({ result: { solutions: [{ primalSolution: {
          objectiveValue: this.objective, feasibilityStatus: 2,
        } }] } }).finish();
      }
      module() {
        let allocation = 16;
        const heap = new Uint8Array(1 << 20);
        const malloc = (length: number) => { const pointer = allocation; allocation += length; return pointer; };
        return { HEAPU8: heap, _malloc: malloc, _free: () => {},
          ccall: (name: string, _: unknown, __: unknown, args: number[]) => {
            const type = name === 'mathopt_incremental_update' ? 'incrementalUpdate' : name === 'mathopt_incremental_create' ? 'incrementalCreate'
              : name === 'mathopt_incremental_solve' ? 'incrementalSolve' : 'incrementalDelete';
            const bytes = this.execute(type, args[0]);
            if (type === 'incrementalUpdate') return 'true';
            if (type === 'incrementalDelete') return;
            const lengthPointer = args[type === 'incrementalCreate' ? 2 : 8];
            new DataView(heap.buffer).setUint32(lengthPointer, bytes.length, true);
            const pointer = malloc(bytes.length);
            heap.set(bytes, pointer);
            return pointer;
          },
        };
      }
    }

    for (const executor of ['worker', 'direct']) for (const raw of [false, true]) {
      for (const retireDuringCreation of [false, true]) {
        await t.test(`${executor}/${raw ? 'raw' : 'editable'}: ${retireDuringCreation ? 'retirement before creation commits' : 'dormant sessions after restart'}`, async () => {
          const objective = (result: any) => raw ? result.response.solutions[0].primalSolution.objectiveValue : result.objectiveValue;
          const native = new NativeState(1);
          const replacement = new NativeState(9);
          let current = native;
          const workers: ControlledWorker[] = [];
          class ControlledWorker {
            native = current;
            receive?: (bytes: Uint8Array) => void;
            exit?: (code: number) => void;
            refs = 0;
            constructor() { workers.push(this); }
            on(event: string, listener: any) {
              if (event === 'message') {
                this.receive = listener;
                queueMicrotask(() => this.receive!(api.encodeSolverBridgeReady('mathopt')));
              } else if (event === 'exit') this.exit = listener;
            }
            ref() { ++this.refs; }
            unref() { this.refs = 0; }
            terminate() {}
            postMessage(bytes: Uint8Array) {
              const request = api.decodeSolverBridgeRequest(bytes);
              assert.equal(request.operation.case, 'executePayload');
              const operation = api.mathOptProtocol.decodeRequest(request.operation.value);
              const response = this.native.execute(operation.type, Number(operation.handle));
              const status = api.createSolverJobStatusEvent('mathopt', request.requestId,
                api.SolverJobState.SUCCEEDED, 0n).status;
              this.receive!(api.encodeSolverBridgeStatus(request.requestId, 'mathopt', status));
              this.receive!(api.encodeSolverBridgeResult(request.requestId, 'mathopt',
                api.mathOptProtocol.encodeResult(operation.type === 'incrementalUpdate' ? { updated: true } : { response })));
            }
          }
          globals.__mathoptLifecycleWorker = ControlledWorker;
          globals.__mathoptLifecycleModule = native.module();
          const retire = () => {
            current = replacement;
            globals.__mathoptLifecycleModule = replacement.module();
            if (executor === 'worker') workers[workers.length - 1]!.exit!(1);
          };
          const create = (onEvent?: (event: any) => void) => raw
            ? new api.MathOptProtoIncrementalSolver(new Uint8Array(), api.MathOptSolverType.GLOP, { executor, onEvent })
            : new api.MathOptIncrementalSolver(api.MathOpt.Model(), api.MathOptSolverType.GLOP, { executor, onEvent });
          const sessions: any[] = [];
          const initialized = async (retireOnSuccess = false) => {
            let ready!: () => void;
            let failed!: (error: Error) => void;
            const terminal = new Promise<void>((resolve, reject) => { ready = resolve; failed = reject; });
            const session = create(event => {
              if (event.type === 'failure') failed(new Error(event.failure.message));
              if (event.type === 'status' && event.status.state === api.SolverJobState.SUCCEEDED) {
                if (retireOnSuccess) retire();
                ready();
              }
            });
            sessions.push(session);
            await terminal;
            await nextTurn();
            return session;
          };
          try {
            // Reuse remains valid while native ownership is unchanged.
            const old = await initialized();
            assert.equal(objective(await old.solve()), 1);
            const aborted = new AbortController(); aborted.abort();
            const beforeAbort = native.calls.length;
            await assert.rejects(old.solve({ signal: aborted.signal }), { name: 'AbortError' });
            if (raw) await assert.rejects(old.update({}, { signal: aborted.signal }), { name: 'AbortError' });
            assert.equal(native.calls.length, beforeAbort, 'Pre-aborted operations never dispatch against the native handle');
            assert.equal(objective(await old.solve()), 1, 'Pre-aborted operations leave the session reusable');
            const unused = await initialized();
            const healthy = await initialized();
            await healthy.close();
            const racing = retireDuringCreation ? await initialized(true) : undefined;
            if (!retireDuringCreation) retire();

            // A fresh native runtime allocates handles 1 and 2 again.
            const fresh = await initialized();
            const second = await initialized();
            assert.deepEqual([...replacement.handles], [1, 2]);
            assert.equal(objective(await fresh.solve()), 9);
            const calls = [...replacement.calls];
            if (raw) await assert.rejects(old.update({}), /runtime was replaced/);
            else {
              old.model.addVariable(); // A stale solve must not send model updates either.
              await assert.rejects(old.solve(), /runtime was replaced/);
            }
            await assert.rejects(old.solve(), /unusable/);
            await old.close();
            await old.close();
            // Close a dormant session directly, without a failed solve first.
            await unused.close();
            if (racing) {
              await assert.rejects(racing.solve(), /runtime was replaced/);
              await racing.close();
            }
            assert.deepEqual(replacement.calls, calls, 'stale handles never reach the new native runtime');
            if (executor === 'worker') assert.equal(workers[workers.length - 1].refs, 0,
              'rejected dispatch does not keep the replacement worker alive');
            assert.equal(objective(await fresh.solve()), 9);
            assert.equal(objective(await second.solve()), 9);
            await fresh.close();
            assert.equal(objective(await second.solve()), 9);
            await second.close();
            assert.equal(replacement.handles.size, 0, 'normal close still deletes native sessions');
          } finally {
            for (const session of sessions) await session.close().catch(() => {});
            if (executor === 'worker') workers[workers.length - 1]?.exit?.(0);
          }
        });
      }
    }
  } finally {
    delete globals.__mathoptLifecycleWorker;
    delete globals.__mathoptLifecycleModule;
    await rm(directory, { recursive: true, force: true });
  }
});
