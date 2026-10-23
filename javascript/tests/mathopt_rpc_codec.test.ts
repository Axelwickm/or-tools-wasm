import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';

const root = new protobuf.Root();
root.resolvePath = (_, target) => fileURLToPath(new URL(`../../${target}`, import.meta.url));
root.loadSync('ortools/math_opt/rpc.proto').resolveAll();
const type = (name: string) => root.lookupType(`operations_research.math_opt.${name}`);
const decode = (name: string, bytes: Uint8Array) => type(name).toObject(type(name).decode(bytes), { longs: String });

// Read opaque payloads independently, using field IDs from the native schema.
function embedded(bytes: Uint8Array, name: string, field: string): Uint8Array[] {
  const id = type(name).fields[field].id;
  const reader = protobuf.Reader.create(bytes);
  const values: Uint8Array[] = [];
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag >>> 3 === id) values.push(new Uint8Array(reader.bytes()));
    else reader.skipType(tag & 7);
  }
  return values;
}

test('MathOpt schema codecs preserve opaque messages, scalar presence and response ownership', async t => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-codec-', import.meta.url)));
  try {
    const outfile = `${directory}/codec.mjs`;
    await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)), contents:
      `export * from './mathopt/rpc_proto.ts'; export * from './mathopt/api.ts';` },
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external' });
    const api: typeof import('../lib/mathopt/rpc_proto.ts') & typeof import('../lib/mathopt/api.ts') = await import(pathToFileURL(outfile).href);
    const { encodeMathOptRpc: encode, decodeMathOptResponse: response } = api;
    const unknown = new Uint8Array(protobuf.Writer.create().uint32(9000 << 3).int64(7).finish());

    await t.test('raw model and backend protos retain unknown fields byte for byte', () => {
      const backends = ['gscip', 'glop', 'cpSat', 'pdlp', 'glpk'];
      const options = Object.fromEntries(backends.map(name => [name, unknown]));
      const request = api.MathOpt.encodeSolveRequest(api.MathOpt.Model(), options);
      const rawRequest = encode('SolveRequest', { model: unknown }, true);
      assert.equal(request.constructor, Uint8Array);
      assert.deepEqual(embedded(rawRequest, 'SolveRequest', 'model'), [unknown]);
      const [parameters] = embedded(request, 'SolveRequest', 'parameters');
      for (const name of backends) assert.deepEqual(embedded(parameters, 'SolveParametersProto', name), [unknown]);
      assert.deepEqual(embedded(api.MathOpt.encodeSolveRequest(api.MathOpt.Model(), { modelParameters: unknown }), 'SolveRequest', 'modelParameters'), [unknown]);
    });

    await t.test('raw basis, repeated hints and objective parameters retain bytes and empty message presence', () => {
      const model = api.MathOpt.Model();
      model.ensureNextAuxiliaryObjectiveIdAtLeast(Number.MAX_SAFE_INTEGER - 1);
      const auxiliary = model.addAuxiliaryObjective({ priority: 1 });
      const bytes = new api.MathOptModelSolveParameters({ initialBasis: unknown,
        solutionHints: [new Uint8Array(), unknown], objectiveParameters: new Map([
          [model.objective, new Uint8Array()], [auxiliary, unknown],
        ]) }).toProtoBytes(model);
      assert.deepEqual(embedded(bytes, 'ModelSolveParametersProto', 'initialBasis'), [unknown]);
      assert.deepEqual(embedded(bytes, 'ModelSolveParametersProto', 'solutionHints'), [new Uint8Array(), unknown]);
      assert.deepEqual(embedded(bytes, 'ModelSolveParametersProto', 'primaryObjectiveParameters'), [new Uint8Array()]);
      const [entry] = embedded(bytes, 'ModelSolveParametersProto', 'auxiliaryObjectiveParameters');
      const mapType = protobuf.parse('syntax="proto3"; message Entry { int64 key=1; bytes value=2; }').root.lookupType('Entry');
      const map = mapType.toObject(mapType.decode(entry), { longs: String });
      assert.equal(map.key, String(auxiliary.id)); assert.deepEqual(new Uint8Array(map.value), unknown);
      assert.deepEqual(decode('SolutionHintProto', new api.MathOptSolutionHint({ variableValues: [], dualValues: [] }).toProtoBytes()),
        { variableValues: {}, dualValues: {} });
      assert.deepEqual(decode('ModelSolveParametersProto', new api.MathOptModelSolveParameters({ branchingPriorities: [] }).toProtoBytes()),
        { branchingPriorities: {} });
    });

    await t.test('explicit zero, false, exact integers, enum names and durations survive native decoding', () => {
      const request = api.MathOpt.encodeSolveRequest(api.MathOpt.Model(), { iterationLimit: 9007199254740993n,
        nodeLimit: 9223372036854775807n, threads: 1, enableOutput: false, randomSeed: 0,
        relativeGapTolerance: 0, absoluteGapTolerance: Infinity, timeLimitSeconds: 0,
        lpAlgorithm: 'PRIMAL_SIMPLEX', presolve: 'OFF' });
      const parameters = decode('SolveRequest', request).parameters;
      assert.equal(parameters.iterationLimit, '9007199254740993'); assert.equal(parameters.nodeLimit, '9223372036854775807');
      assert.equal(parameters.enableOutput ?? false, false); assert.equal(parameters.randomSeed, 0);
      assert.equal(parameters.relativeGapTolerance, 0); assert.equal(parameters.absoluteGapTolerance, Infinity);
      assert.deepEqual(parameters.timeLimit, {});
      assert.equal(parameters.lpAlgorithm, (type('SolveParametersProto').fields.lpAlgorithm.resolvedType as protobuf.Enum).values.LP_ALGORITHM_PRIMAL_SIMPLEX);
      for (const [seconds, expected] of [[1.9999999996, { seconds: '2' }], [-1.25, { seconds: '-1', nanos: -250000000 }]] as const) {
        const bytes = new api.MathOptObjectiveParameters({ timeLimitSeconds: seconds }).toProtoBytes();
        assert.deepEqual(decode('ObjectiveParametersProto', bytes).timeLimit, expected);
      }
      assert.deepEqual(embedded(encode('SolveRequest', { model: new Uint8Array() }, true), 'SolveRequest', 'model'), [new Uint8Array()]);
    });

    await t.test('resource inspection treats the model as opaque and preserves automatic workers', () => {
      // An invalid model body proves this path never decodes model contents.
      const request = encode('SolveRequest', { model: Uint8Array.of(255), parameters: encode('SolveParametersProto', {
        cpSat: encode('operations_research.sat.SatParameters', { numWorkers: 0, numSearchWorkers: 2 }),
        threads: 3,
      }, true) }, true);
      const decoded = api.decodeMathOptRequestParameters(request);
      assert.equal(decoded.parameters!.threads, 3);
      assert.equal(decoded.parameters!.cpSat!.numWorkers, 0);
      assert.equal(decoded.parameters!.cpSat!.numSearchWorkers, 2);
    });

    await t.test('response presence, native errors and unknown result bytes are preserved', () => {
      const bytes = encode('SolveResponse', { result: unknown, messages: ['native 🙂'] }, true);
      const parts = response(bytes, 'MathOpt solve');
      assert.deepEqual(new Uint8Array(parts.resultBytes!), unknown); assert.deepEqual(parts.messages, ['native 🙂']);
      assert.equal(response(encode('SolveResponse', { result: new Uint8Array() }, true), 'MathOpt solve').resultBytes!.length, 0);
      assert.equal(response(new Uint8Array(), 'MathOpt solve').resultBytes, undefined);
      for (const [status, message] of [[{}, 'MathOpt solve failed.'], [{ message: '' }, ''], [{ message: 'native failure' }, 'native failure']] as const) {
        assert.throws(() => response(encode('SolveResponse', { status: encode('StatusProto', status, true) }, true), 'MathOpt solve'), { message });
      }
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
