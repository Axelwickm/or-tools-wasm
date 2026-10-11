import type * as Api from 'or-tools-wasm/mathopt';
import { runMathOptNumericalCases } from './numerical.ts';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMathOptResultConversionCases(api: typeof Api) {
  const results = [];
  const variableId = 9_007_199_254_740_993n, auxiliaryId = variableId + 2n;
  const model: Api.MathOptModelProto = {
    variables: { ids: [variableId], lowerBounds: [0], upperBounds: [4], integers: [false], names: ['x'] },
    linearConstraints: { ids: [7], lowerBounds: [-Infinity], upperBounds: [4], names: ['row'] },
    linearConstraintMatrix: { rowIds: [7], columnIds: [variableId], coefficients: [1] },
    quadraticConstraints: { '9': { lowerBound: -Infinity, upperBound: 16, name: 'quad',
      quadraticTerms: { rowIds: [variableId], columnIds: [variableId], coefficients: [1] } } },
    auxiliaryObjectives: { [String(auxiliaryId)]: { name: 'reward', priority: 1,
      linearCoefficients: { ids: [variableId], values: [2] } } },
  };
  const primal: Api.MathOptSolutionProtoMap['primalSolution'] = { variableValues: { ids: [variableId], values: [2] },
    objectiveValue: 0, auxiliaryObjectiveValues: { [String(auxiliaryId)]: 4 }, feasibilityStatus: 'SOLUTION_STATUS_FEASIBLE' };
  const dual: Api.MathOptSolutionProtoMap['dualSolution'] = { dualValues: { ids: [7], values: [0] },
    quadraticDualValues: { ids: [9], values: [0.5] }, reducedCosts: { ids: [variableId], values: [0] },
    feasibilityStatus: 'SOLUTION_STATUS_UNDETERMINED' };
  const basis: Api.MathOptSolutionProtoMap['basis'] = { variableStatus: { ids: [variableId], values: ['BASIS_STATUS_BASIC'] },
    constraintStatus: { ids: [7], values: ['BASIS_STATUS_AT_UPPER_BOUND'] } };
  for (const mode of executorFixtureModes) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const converted = await api.MathOpt.convertSolutionProto('primalSolution', primal, model, options);
    assert(converted.proto.variableValues?.ids?.[0] === variableId && converted.proto.objectiveValue === 0 &&
      converted.proto.auxiliaryObjectiveValues?.[String(auxiliaryId)] === 4, 'Native primal conversion retains exact variable/auxiliary IDs and zero objective');
    for (const [kind, input] of [
      ['dualSolution', dual], ['basis', basis], ['primalRay', { variableValues: primal.variableValues }],
      ['dualRay', { dualValues: dual.dualValues, reducedCosts: dual.reducedCosts }],
      ['solution', { primalSolution: primal, dualSolution: dual, basis }],
    ] as const) {
      const first = await api.MathOpt.convertSolutionProto(kind, input, model, options);
      const second = await api.MathOpt.convertSolutionProto(kind, first.bytes, model, options);
      assert(JSON.stringify(first.proto, (_, value) => typeof value === 'bigint' ? String(value) : value) ===
        JSON.stringify(second.proto, (_, value) => typeof value === 'bigint' ? String(value) : value), `${kind} round trips through native converters`);
    }
    const convertedDual = await api.MathOpt.convertSolutionProto('dualSolution', dual, model, options);
    assert(convertedDual.proto.quadraticDualValues?.values?.[0] === 0.5 && convertedDual.proto.objectiveValue === undefined,
      'Quadratic duals and omitted optional dual objectives survive');
    const zeroDual = await api.MathOpt.convertSolutionProto('dualSolution', { ...dual, objectiveValue: 0 }, model, options);
    assert(zeroDual.proto.objectiveValue === 0, 'Explicit optional zero is distinct from absence');
    results.push({ id: 'mathopt.result.native_solution_roundtrips', solver: 'mathopt', mode, ok: true });

    for (const [kind, input] of [
      ['problemStatus', { primalStatus: 'FEASIBILITY_STATUS_FEASIBLE', dualStatus: 'FEASIBILITY_STATUS_UNDETERMINED' }],
      ['objectiveBounds', { primalBound: 0, dualBound: -Infinity }],
      ['solveStats', { solveTime: { seconds: 2, nanos: 500_000_000 }, simplexIterations: variableId, nodeCount: 3 }],
      ['termination', { reason: 'TERMINATION_REASON_OPTIMAL', detail: 'native round trip',
        problemStatus: { primalStatus: 'FEASIBILITY_STATUS_FEASIBLE', dualStatus: 'FEASIBILITY_STATUS_FEASIBLE' },
        objectiveBounds: { primalBound: 0, dualBound: 0 } }],
    ] as const) {
      const first = await api.MathOpt.convertResultProto(kind, input, options);
      const second = await api.MathOpt.convertResultProto(kind, first.bytes, options);
      assert(JSON.stringify(first.proto, (_, value) => typeof value === 'bigint' ? String(value) : value) ===
        JSON.stringify(second.proto, (_, value) => typeof value === 'bigint' ? String(value) : value), `${kind} round trips through native converters`);
    }
    const stats = await api.MathOpt.convertResultProto('solveStats', { simplexIterations: variableId,
      barrierIterations: 9_223_372_036_854_775_807n, firstOrderIterations: variableId + 1n, nodeCount: variableId + 2n }, options);
    assert(stats.proto.simplexIterations === variableId && stats.proto.barrierIterations === 9_223_372_036_854_775_807n &&
      stats.proto.firstOrderIterations === variableId + 1n && stats.proto.nodeCount === variableId + 2n, 'All native statistics keep exact int64 counters');
    const emptyBounds = await api.MathOpt.convertResultProto('objectiveBounds', {}, options);
    const emptySolution = await api.MathOpt.convertSolutionProto('solution', {}, model, options);
    assert(emptyBounds.bytes.length === 0 && emptyBounds.proto.primalBound === 0 && emptyBounds.proto.dualBound === 0 &&
      emptySolution.bytes.length === 0 && emptySolution.proto.primalSolution === undefined,
      'Successful empty native messages retain scalar zero defaults and absent components');
    results.push({ id: 'mathopt.result.native_metadata_roundtrips', solver: 'mathopt', mode, ok: true });

    const mustReject = async (operation: () => Promise<unknown>) => {
      let rejected = false; try { await operation(); } catch { rejected = true; }
      assert(rejected, 'Native converters reject malformed vectors and foreign model references');
    };
    for (const variableValues of [
      { ids: [variableId], values: [] }, { ids: [variableId, variableId], values: [1, 1] },
      { ids: [variableId + 1n, variableId], values: [1, 1] }, { ids: [variableId + 1n], values: [1] },
    ]) await mustReject(() => api.MathOpt.convertSolutionProto('primalRay', { variableValues }, model, options));
    await mustReject(() => api.MathOpt.convertSolutionProto('dualSolution', { ...dual, quadraticDualValues: { ids: [10], values: [1] } }, model, options));
    await mustReject(() => api.MathOpt.convertSolutionProto('primalSolution', { ...primal, auxiliaryObjectiveValues: { '0': 1 } }, model, options));
    await mustReject(() => api.MathOpt.convertSolutionProto('basis', { variableStatus: { ids: [variableId], values: [0] } }, model, options));
    await mustReject(() => api.MathOpt.convertSolutionProto('solution', Uint8Array.of(255), model, options));
    await mustReject(() => api.MathOpt.convertResultProto('problemStatus', {}, options));
    await mustReject(() => api.MathOpt.convertResultProto('termination', {}, options));
    assert((await api.MathOpt.convertSolutionProto('primalSolution', converted.bytes, model, options)).proto.variableValues?.values?.[0] === 2,
      'Converters recover after rejection');
    results.push({ id: 'mathopt.result.native_rejection_recovery', solver: 'mathopt', mode, ok: true });

    const editable = api.MathOpt.Model('snapshot'); const x = editable.addVariable({ name: 'x', lowerBound: 0, upperBound: 4 });
    const source = { variableValues: { ids: [x.id], values: [2] } };
    const pending = api.MathOpt.convertSolutionProto('primalRay', source, editable, options);
    source.variableValues.values[0] = 99; editable.deleteVariable(x);
    const saved = await pending;
    assert(saved.proto.variableValues?.values?.[0] === 2, 'Conversion snapshots model and typed input before awaiting');
    saved.bytes.fill(255); assert(saved.proto.variableValues?.values?.[0] === 2, 'Returned bytes and typed data are independent');
    results.push({ id: 'mathopt.result.native_conversion_snapshots', solver: 'mathopt', mode, ok: true });
  }
  results.push(...await runMathOptNumericalCases(api));
  return results;
}
