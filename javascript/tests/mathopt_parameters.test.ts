import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

// Independent wire readers: field numbers/types come from parameters.proto and gscip.proto.
const root = protobuf.parse(`syntax = "proto2";
  message GScip { map<string, int32> int_params = 6; map<string, int64> long_params = 7; }
  message Parameters { optional int64 iteration_limit = 2; optional int32 threads = 4;
    optional int32 random_seed = 5; optional int32 solution_limit = 23;
    optional int64 node_limit = 24; optional int32 solution_pool_size = 25; optional GScip gscip = 12; }
  message Request { optional Parameters parameters = 4; }
`).root;
const requestType = root.lookupType('Request');
const gscipType = root.lookupType('GScip');

test('MathOpt exact integer wire encoding and backend admission', async t => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-parameters-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { contents: `export * from './mathopt/api.ts'; export { calls } from 'capture-executor';`,
      resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) },
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external',
      plugins: [{ name: 'capture-executor', setup(builder) {
        builder.onResolve({ filter: /^(capture-executor|\.\/direct_executor\.js)$/ }, () => ({ path: 'capture', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export const calls = [];
          export class DirectMathOptExecutor {
            execute(operation, options) {
              calls.push({operation, options});
              const response = operation.type === 'incrementalCreate' ? new Uint8Array([18,1,49]) : new Uint8Array([10,0]);
              return { requestId: calls.length, result: Promise.resolve({response}), cancel: async () => {} };
            }
          }` }));
      } }] });
    const api = await import(pathToFileURL(outfile).href);
    const { MathOpt, MathOptSolverType: types, GScipParameters, GlopParameters, PdlpParameters, calls } = api;
    const model = MathOpt.Model('wire');
    const capture = async (options: Record<string, unknown>) => {
      calls.length = 0;
      await MathOpt.solve(model, { executor: 'direct', ...options });
      assert.equal(calls.length, 1);
      return calls[0];
    };
    await t.test('int64 limits and signed GSCIP maps preserve exact values and bounded negative encoding', async () => {
      for (const value of [0n, -1n, -9223372036854775808n, 9007199254740993n, 9223372036854775807n]) {
        const call = await capture({ iterationLimit: value, nodeLimit: value, gscip: { longParams: { exact: value } } });
        const parameters = (requestType.decode(call.operation.request) as any).parameters;
        assert.equal(parameters.iterationLimit.toString(), String(value));
        assert.equal(parameters.nodeLimit.toString(), String(value));
        assert.equal(parameters.gscip.longParams.exact.toString(), String(value));
        const bytes = new GScipParameters({ longParams: { x: value } }).toProtoBytes();
        assert.equal((gscipType.decode(bytes) as any).longParams.x.toString(), String(value));
      }
      assert.equal(Buffer.from(new GScipParameters({ longParams: { x: -1n } }).toProtoBytes()).toString('hex'),
        '3a0e0a017810ffffffffffffffffff01');
      assert.equal(Buffer.from(new GScipParameters({ longParams: { x: -9223372036854775808n } }).toProtoBytes()).toString('hex'),
        '3a0e0a01781080808080808080808001');
      const negative = await capture({ randomSeed: -1, solutionLimit: -2147483648 });
      const decoded = (requestType.decode(negative.operation.request) as any).parameters;
      assert.equal(decoded.randomSeed, -1); assert.equal(decoded.solutionLimit, -2147483648);
    });
    await t.test('invalid numbers and integer overflow fail before executor submission', async () => {
      for (const value of [Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 1.5, 9223372036854775808n, -9223372036854775809n]) {
        for (const field of ['iterationLimit', 'nodeLimit']) {
          calls.length = 0;
          await assert.rejects(MathOpt.solve(model, { executor: 'direct', [field]: value }), /integer|int64|safe/i);
          assert.equal(calls.length, 0);
        }
        assert.throws(() => new GScipParameters({ longParams: { invalid: value } }).toProtoBytes());
      }
      for (const value of [-2147483649, 2147483648, NaN, Infinity, 1.5]) {
        for (const field of ['threads', 'randomSeed', 'solutionLimit', 'solutionPoolSize']) {
          calls.length = 0;
          await assert.rejects(MathOpt.solve(model, { executor: 'direct', [field]: value }), /int32/);
          assert.equal(calls.length, 0);
        }
        assert.throws(() => new GScipParameters({ intParams: { invalid: value } }).toProtoBytes(), /int32/);
      }
    });
    await t.test('backend overrides control admission for typed, class and raw parameter forms', async () => {
      const scenarios = [
        { solverType: types.CP_SAT, cpSat: { numWorkers: 2 }, expected: 2 },
        { solverType: types.CP_SAT, cpSat: { numSearchWorkers: 2 }, expected: 2 },
        { solverType: types.CP_SAT, threads: 1, cpSat: { numSearchWorkers: 2 }, expected: 1 },
        { solverType: types.CP_SAT, threads: 1, cpSat: { numWorkers: 0, numSearchWorkers: 2 }, expected: 2 },
        { solverType: types.CP_SAT, cpSat: { numWorkers: 0, numSearchWorkers: 0 }, expected: 1 },
        ...[new GlopParameters({ numOmpThreads: 2 }), { numOmpThreads: 2 }, new GlopParameters({ numOmpThreads: 2 }).toProtoBytes()]
          .map(glop => ({ solverType: types.GLOP, threads: 1, glop, expected: 2 })),
        ...[new PdlpParameters({ numThreads: 2 }), { numThreads: 2 }, new PdlpParameters({ numThreads: 2 }).toProtoBytes()]
          .map(pdlp => ({ solverType: types.PDLP, threads: 1, pdlp, expected: 2 })),
        ...[new GScipParameters({ intParams: { 'parallel/maxnthreads': 2 } }), { intParams: { 'parallel/maxnthreads': 2 } },
          new GScipParameters({ intParams: { 'parallel/maxnthreads': 2 } }).toProtoBytes()]
          .flatMap(gscip => [{ solverType: types.GSCIP, gscip, expected: 2 }, { solverType: types.GSCIP, threads: 1, gscip, expected: 2 }]),
      ];
      for (const { expected, ...options } of scenarios) {
        assert.equal((await capture(options)).options.resources.threads, expected);
        const instance = new MathOpt.IncrementalSolver(model, options.solverType, { executor: 'direct', ...options });
        await instance.solve();
        const incremental = calls.find((call: any) => call.operation.type === 'incrementalSolve');
        assert.equal(incremental.options.resources.threads, expected);
        assert.equal(calls.find((call: any) => call.operation.type === 'incrementalCreate').options.resources.threads, 1);
        await instance.close();
      }
    });
    await t.test('raw duplicate scalar and map entries follow native last-value semantics', async () => {
      const join = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap(part => [...part]));
      const one = new GScipParameters({ intParams: { 'parallel/maxnthreads': 1 } }).toProtoBytes();
      const two = new GScipParameters({ intParams: { 'parallel/maxnthreads': 2 } }).toProtoBytes();
      const raw = [
        { solverType: types.PDLP, pdlp: join(new PdlpParameters({ numThreads: 1 }).toProtoBytes(), new PdlpParameters({ numThreads: 2 }).toProtoBytes()) },
        { solverType: types.GLOP, glop: join(new GlopParameters({ numOmpThreads: 1 }).toProtoBytes(), new GlopParameters({ numOmpThreads: 2 }).toProtoBytes()) },
        { solverType: types.GSCIP, gscip: join(one, two) },
        // SatParameters.num_workers = 206; num_search_workers = 100.
        { solverType: types.CP_SAT, cpSat: new Uint8Array([0xf0, 0x0c, 1, 0xf0, 0x0c, 2]) },
        { solverType: types.CP_SAT, cpSat: new Uint8Array([0xa0, 6, 1, 0xa0, 6, 2]) },
      ];
      for (const options of raw) assert.equal((await capture(options)).options.resources.threads, 2);
      assert.equal((await capture({ solverType: types.GSCIP, gscip: join(two, one) })).options.resources.threads, 1);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
