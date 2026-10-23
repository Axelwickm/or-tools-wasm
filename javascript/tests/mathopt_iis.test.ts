import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { mathOptResultDescriptor } from '../lib/generated/mathopt_result_schemas.ts';
import type { MathOptOperation } from '../lib/mathopt/protocol.ts';

test('MathOpt IIS owns native bytes, preserves exact IDs and binds stable model handles', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-iis-', import.meta.url)));
  const state: { response: Uint8Array; operations: MathOptOperation[] } = { response: new Uint8Array(), operations: [] };
  (globalThis as Record<string, unknown>).__mathOptIisTest = state;
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: { resolveDir: fileURLToPath(new URL('../lib/', import.meta.url)), contents:
      `export * from './mathopt/api.ts'; export { mathOptProtocol } from './mathopt/protocol.ts';` },
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external', plugins: [{ name: 'capture-iis', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'capture', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          export class DirectMathOptExecutor {
            execute(operation) {
              globalThis.__mathOptIisTest.operations.push(operation);
              return { requestId: 1, result: Promise.resolve({ response: globalThis.__mathOptIisTest.response }), cancel: async () => {} };
            }
          }` }));
      } }] });
    const api: typeof import('../lib/mathopt/api.ts') & typeof import('../lib/mathopt/protocol.ts') = await import(pathToFileURL(outfile).href);
    const resultType = protobuf.Root.fromJSON(mathOptResultDescriptor).resolveAll()
      .lookupType('operations_research.math_opt.ComputeInfeasibleSubsystemResultProto');
    const envelope = protobuf.loadSync(fileURLToPath(new URL('../../bridge-types/mathopt_iis.proto', import.meta.url)))
      .lookupType('ortools_wasm.bridge.v1.MathOptInfeasibleSubsystemResponse');
    const requestType = protobuf.parse('syntax="proto3"; message Request { int32 solver=1; bytes model=2; }').root.lookupType('Request');
    const reply = (value: Record<string, unknown>) => envelope.encode(envelope.fromObject({
      resultProto: resultType.encode(resultType.fromObject(value)).finish(), messages: ['native IIS — 🙂'],
    })).finish();
    const id = 9007199254740993n;
    state.response = reply({ feasibility: 3, infeasibleSubsystem: {
      variableBounds: { [String(id)]: { upper: true } }, variableIntegrality: [String(id)],
    }, isMinimal: true });
    const input = Uint8Array.of(0xa0, 0x06, 1), expected = input.slice();
    const pending = api.MathOpt.computeInfeasibleSubsystemProto(input, { executor: 'direct' }); input.fill(255);
    const raw = await pending;
    assert.equal(state.operations[0].type, 'computeInfeasibleSubsystem');
    assert(state.operations[0].type === 'computeInfeasibleSubsystem');
    assert.deepEqual(requestType.decode(state.operations[0].request).model, expected, 'unknown model fields are forwarded unchanged');
    assert.equal(requestType.decode(state.operations[0].request).solver, api.MathOptSolverType.GSCIP);
    const wire = api.mathOptProtocol.encodeRequest(state.operations[0]);
    assert.deepEqual(api.mathOptProtocol.decodeRequest(wire), state.operations[0], 'IIS uses the shared bridge protocol');
    const retained = { ...state.operations[0], handle: 9007199254740993n, modelUpdate: new Uint8Array() };
    assert.deepEqual(api.mathOptProtocol.decodeRequest(api.mathOptProtocol.encodeRequest(retained)), retained,
      'Retained IIS preserves exact handles and presence of an empty native model update');
    assert.equal(BigInt(raw.response.infeasibleSubsystem!.variableIntegrality![0]), id);
    assert.equal(raw.response.infeasibleSubsystem!.variableBounds![String(id)].upper, true);
    const saved = raw.bytes.slice(); state.response.fill(0);
    assert.deepEqual(raw.bytes, saved, 'raw IIS bytes own their storage');
    assert.deepEqual(raw.messages, ['native IIS — 🙂']);
    const model = api.MathOpt.Model(), x = model.addVariable(), row = model.addLinearConstraint(),
      quadratic = model.addQuadraticConstraint(), sos1 = model.addSos1Constraint([x]),
      sos2 = model.addSos2Constraint([x]), indicator = model.addIndicatorConstraint();
    assert.equal(model.getVariable(x.id), x); assert.equal(model.variables()[0], x);
    assert.equal(model.getLinearConstraint(row.id), row); assert.equal(model.linearConstraints()[0], row);
    assert.equal(model.getQuadraticConstraint(quadratic.id), quadratic);
    assert.equal(model.getSos1Constraint(sos1.id), sos1); assert.equal(model.getSos2Constraint(sos2.id), sos2);
    assert.equal(model.getIndicatorConstraint(indicator.id), indicator);
    assert.notEqual(api.MathOpt.Model().addVariable(), x, 'equal IDs in different models retain separate identities');
    state.response = reply({ feasibility: 3, infeasibleSubsystem: {
      variableBounds: { '0': { upper: true } }, linearConstraints: { '0': { lower: true } },
      quadraticConstraints: { '0': { upper: true } }, sos1Constraints: ['0'], sos2Constraints: ['0'], indicatorConstraints: ['0'],
    } });
    const querying = api.MathOpt.computeInfeasibleSubsystem(model, { executor: 'direct' });
    model.deleteVariable(x); model.deleteLinearConstraint(row);
    const subset = (await querying).infeasibleSubsystem;
    assert.equal(subset.variableBounds.get(x)?.upper, true); assert.equal(subset.linearConstraints.get(row)?.lower, true);
    assert.equal(subset.quadraticConstraints.get(quadratic)?.upper, true);
    assert.equal(subset.sos1Constraints.has(sos1), true); assert.equal(subset.sos2Constraints.has(sos2), true);
    assert.equal(subset.indicatorConstraints.has(indicator), true);
    await assert.rejects(api.MathOpt.computeInfeasibleSubsystem(model, { executor: 'direct' }), /unknown model ID/);
    state.response = reply({ feasibility: 0, isMinimal: true });
    await assert.rejects(api.MathOpt.computeInfeasibleSubsystem(model, { executor: 'direct' }), /unspecified feasibility/);
    state.response = envelope.encode(envelope.fromObject({ status: { code: 3, message: 'Native IIS error — 🙂' } })).finish();
    await assert.rejects(api.MathOpt.computeInfeasibleSubsystemProto(expected, { executor: 'direct' }), { message: 'Native IIS error — 🙂' });
  } finally {
    delete (globalThis as Record<string, unknown>).__mathOptIisTest;
    await rm(directory, { recursive: true, force: true });
  }
});
