import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import { upstreamMps } from './mps_fixture.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) { let rejected = false; try { await action(); } catch { rejected = true; } assert(rejected, 'Invalid or lossy conversion must reject'); }

export async function runMathOptMpsCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const simple = api.MathOpt.Model('unbounded_integers');
    const sx = simple.addVariable({ lowerBound: 1, upperBound: Infinity, integer: true, name: 'x' }), sy = simple.addVariable({ lowerBound: 4, upperBound: Infinity, integer: true, name: 'y' });
    simple.addLinearConstraint({ lowerBound: 2, upperBound: Infinity, name: 'c', terms: [{ variable: sx, coefficient: 1 }, { variable: sy, coefficient: 1 }] });
    simple.objective.setLinearCoefficient(sx, 1); simple.objective.setLinearCoefficient(sy, 1);
    assert(await simple.exportMps({ executor }) === upstreamMps, 'MPS output exactly matches upstream native fixture');
    const parsed = await api.mpsToModelProto(upstreamMps, { executor });
    assert(parsed.name === 'unbounded_integers' && parsed.variables?.ids?.map(Number).join(',') === '0,1'
      && parsed.variables.lowerBounds?.join(',') === '1,4' && parsed.variables.upperBounds?.every(value => value === Infinity)
      && parsed.variables.integers?.every(Boolean) && parsed.variables.names?.join(',') === 'x,y'
      && parsed.linearConstraints?.names?.join(',') === 'c' && parsed.linearConstraints.lowerBounds?.[0] === 2
      && parsed.linearConstraintMatrix?.coefficients?.join(',') === '1,1' && parsed.objective?.linearCoefficients?.values?.join(',') === '1,1', 'Native import matches the upstream expected ModelProto');
    // TEMP: parity — compare the complete canonical model from the upstream fixture.
    const importedBytes = (await api.MathOptModel.fromModelProto(parsed, { executor })).encodeModelProto();
    const expectedBytes = simple.encodeModelProto();
    assert(importedBytes.length === expectedBytes.length && importedBytes.every((value, index) => value === expectedBytes[index]), 'Complete imported ModelProto matches the upstream expected model');
    assert((await api.mpsToModelProto('NAME MIN_SIZE_MAX_FEATURES', { executor })).name === 'MIN_SIZE_MAX_FEATURES', 'Upstream name-only MPS parses');
    const pending = api.modelProtoToMps(parsed, { executor }); parsed.variables!.lowerBounds![0] = 99;
    assert(await pending === upstreamMps, 'Proto-shaped input is serialized before awaiting execution');
    results.push({ id: 'mathopt.contract.native_mps_conversion', solver: 'mathopt', mode, ok: true as const });

    for (const integer of [false, true]) {
      const source = api.MathOpt.Model(integer ? 'integer' : 'linear'); source.ensureNextVariableIdAtLeast(3_000_000_000);
      const x = source.addVariable({ lowerBound: 0, upperBound: 10, integer, name: 'x' }), y = source.addVariable({ lowerBound: 2, upperBound: 2, name: 'y' });
      source.addVariable({ lowerBound: -Infinity, upperBound: Infinity, name: 'unused' }); source.ensureNextLinearConstraintIdAtLeast(1_000_000_000);
      source.addLinearConstraint({ lowerBound: 3, upperBound: 7, name: 'range', terms: [{ variable: x, coefficient: 1 }, { variable: y, coefficient: 2 }] });
      source.objective.isMaximize = true; source.objective.offset = 5.5; source.objective.setLinearCoefficient(x, 2.5); source.objective.setLinearCoefficient(y, -1);
      const before = source.encodeModelProto(); const bytesPending = api.modelProtoToMps(before, { executor }); before.fill(0xff);
      const mps = await bytesPending, imported = await api.MathOptModel.fromMps(mps, { executor });
      const importedX = imported.variables().find(variable => variable.name === 'x'), importedY = imported.variables().find(variable => variable.name === 'y');
      const row = imported.linearConstraints().find(constraint => constraint.name === 'range');
      assert(importedX && importedY && row && importedX.id === 0 && importedX.integer === integer
        && importedX.lowerBound === 0 && importedX.upperBound === 10 && importedY.lowerBound === 2 && importedY.upperBound === 2
        && imported.variables().some(variable => variable.name === 'unused') && row.lowerBound === 3 && row.upperBound === 7
        && imported.objective.isMaximize && imported.objective.offset === 5.5, 'Native MPS preserves linear/MIP modeling data and regenerates IDs');
      const solverType = integer ? api.MathOptSolverType.GSCIP : api.MathOptSolverType.GLOP;
      const solved = await api.MathOpt.solve(imported, { executor, solverType });
      assert(solved.objectiveValue === 11 && solved.variableValuesById[importedX.id] === 3, 'Converted model solves with original objective/offset/integrality');
      importedX.upperBound = 2;
      assert((await api.MathOpt.solve(imported, { executor, solverType })).objectiveValue === 8.5, 'MPS-imported model remains editable');
      assert(x.upperBound === 10 && source.getNextVariableId() > 3_000_000_000, 'Conversion does not mutate the source model');
      const nameless = await api.mpsToModelProto(await source.exportMps({ executor, removeNames: true }), { executor });
      assert(!(nameless.variables?.names ?? []).includes('x') && !(nameless.linearConstraints?.names ?? []).includes('range'), 'Name removal is forwarded through model export');
    }
    results.push({ id: 'mathopt.correctness.mps_model_roundtrip', solver: 'mathopt', mode, ok: true as const });

    for (const input of [new Uint8Array([0xff]), { variables: { ids: [0], lowerBounds: [], upperBounds: [1], integers: [false] } },
      { auxiliaryObjectives: { '0': { priority: 1 } } },
      { variables: { ids: [0], lowerBounds: [0], upperBounds: [1], integers: [false] }, objective: { quadraticCoefficients: { rowIds: [0], columnIds: [0], coefficients: [1] } } }]) {
      await rejects(() => api.modelProtoToMps(input, { executor }));
    }
    await rejects(() => api.mpsToModelProto('this is not MPS', { executor }));
    const controller = new AbortController(); controller.abort();
    await rejects(() => api.mpsToModelProto(upstreamMps, { executor, signal: controller.signal }));
    assert(await api.modelProtoToMps(simple.encodeModelProto(), { executor }) === upstreamMps, 'Conversion recovers after malformed, unsupported and aborted requests');
    results.push({ id: 'mathopt.contract.mps_conversion_validation', solver: 'mathopt', mode, ok: true as const });
  }
  return results;
}
