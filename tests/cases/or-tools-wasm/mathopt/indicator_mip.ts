import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid indicator conversion to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const mathOptIndicatorMipCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.transform.indicator_mip_equivalence', name: 'Native indicator-to-MIP transformation preserves activation polarity and feasible points', solver: 'mathopt',
  source: 'ortools/math_opt/labs/general_constraint_to_mip.h:FormulateIndicatorConstraintAsMip', tags: ['native-contract', 'gap-regression'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode);
    for (const activateOnZero of [false, true]) {
      const model = MathOpt.Model('indicator', { primaryObjectiveName: 'profit' });
      const active = model.addBinaryVariable({ name: 'active' }), x = model.addVariable({ lowerBound: 0, upperBound: 10, integer: true, name: 'x' });
      const indicator = model.addIndicatorConstraint({ indicator: active, activateOnZero, lowerBound: 2, upperBound: 6,
        terms: [{ variable: x, coefficient: 1 }], name: 'range' });
      model.maximize(x);
      const transformed = await MathOpt.formulateIndicatorConstraintAsMip(model, indicator, options);
      assert(transformed !== model && model.hasIndicatorConstraint(indicator.id) && model.linearConstraints().length === 0,
        'Transformation returns a new model and preserves original handles');
      assert(!transformed.hasIndicatorConstraint(indicator.id) && transformed.linearConstraints().length === 2,
        'Native routine replaces the selected ranged indicator with two linear rows');
      for (const activeValue of [0, 1]) for (const xValue of [0, 2, 6, 8]) {
        const values = { [active.id]: activeValue, [x.id]: xValue };
        const before = await MathOpt.checkPrimalSolutionFeasibility(model, values, options);
        const after = await MathOpt.checkPrimalSolutionFeasibility(transformed, values, options);
        assert(before.feasible === after.feasible && before.feasible ===
          ((activateOnZero ? activeValue === 1 : activeValue === 0) || (xValue >= 2 && xValue <= 6)),
          'Independent native feasibility checking agrees with indicator semantics');
      }
      await rejects(() => MathOpt.solve(model, { ...options, solverType: 'GSCIP', threads: 1 }));
      const converted = await MathOpt.solve(transformed, { ...options, solverType: 'CP_SAT', threads: 1 });
      const convertedScip = await MathOpt.solve(transformed, { ...options, solverType: 'GSCIP', threads: 1 });
      assert(converted.objectiveValue === 10 && convertedScip.objectiveValue === converted.objectiveValue &&
        converted.value(transformed.getVariable(x.id)!) === 10, 'Native converted model solves with a backend that lacks indicator support');
      await rejects(() => MathOpt.solve(model, { ...options, solverType: 'CP_SAT', threads: 1 }));
    }
    return {};
  },
}, {
  id: 'mathopt.transform.indicator_mip_errors', name: 'Native conversion errors preserve submitted models and permit recovery', solver: 'mathopt',
  source: 'ortools/math_opt/labs/general_constraint_to_mip.cc', tags: ['native-contract', 'lifecycle'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), model = MathOpt.Model(), active = model.addBinaryVariable(),
      x = model.addVariable({ lowerBound: 0, upperBound: Infinity });
    const indicator = model.addIndicatorConstraint({ indicator: active, lowerBound: 1, upperBound: 2, terms: [{ variable: x, coefficient: 1 }] });
    await rejects(() => MathOpt.formulateIndicatorConstraintAsMip(model, indicator, options));
    assert(model.hasIndicatorConstraint(indicator.id) && model.linearConstraints().length === 0 && x.upperBound === Infinity,
      'Native failure after adding a lower row in its private copy does not partially edit the submitted model');
    x.upperBound = 10;
    const pending = MathOpt.formulateIndicatorConstraintAsMip(model, indicator, options);
    x.upperBound = 20; model.deleteIndicatorConstraint(indicator);
    const converted = await pending;
    assert(converted.getVariable(x.id)!.upperBound === 10 && converted.linearConstraints().length === 2,
      'Submitted model and selected indicator are captured before awaiting');
    await rejects(() => MathOpt.formulateIndicatorConstraintAsMip(model, indicator, options));
    const other = MathOpt.Model(), foreign = other.addIndicatorConstraint();
    await rejects(() => MathOpt.formulateIndicatorConstraintAsMip(model, foreign, options));
    const inactive = model.addIndicatorConstraint();
    assert((await MathOpt.formulateIndicatorConstraintAsMip(model, inactive, options)).linearConstraints().length === 0,
      'Native indicator with no activation variable is deleted without rows');
    const abort = new AbortController(); abort.abort();
    await rejects(() => MathOpt.formulateIndicatorConstraintAsMip(model, inactive, { ...options, signal: abort.signal }));
    await rejects(() => MathOpt.formulateIndicatorConstraintAsMipProto(new Uint8Array([255]), 0, options));
    await rejects(() => MathOpt.formulateIndicatorConstraintAsMipProto(model.encodeModelProto(), 999, options));
    assert((await MathOpt.formulateIndicatorConstraintAsMip(model, inactive, options)).indicatorConstraints().length === 0,
      'Transformation succeeds after validation and cancellation failures');
    return {};
  },
}, {
  id: 'mathopt.transform.indicator_mip_proto', name: 'Raw native transformation preserves exact IDs, metadata, bytes and unrelated constraint families', solver: 'mathopt',
  source: 'ortools/math_opt/labs/general_constraint_to_mip.h', tags: ['native-contract', 'gap-regression'],
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = execution(mode), b = (1n << 60n) + 3n, x = b + 1n, row = b + 2n, indicator = b + 3n;
    const proto = { name: 'exact ids', variables: { ids: [b, x], lowerBounds: [0, 0], upperBounds: [1, 10], integers: [true, true], names: ['b', 'x'] },
      objective: { maximize: true, name: 'profit', linearCoefficients: { ids: [x], values: [1] } },
      linearConstraints: { ids: [row], lowerBounds: [-Infinity], upperBounds: [9], names: ['existing'] },
      linearConstraintMatrix: { rowIds: [row], columnIds: [x], coefficients: [1] },
      indicatorConstraints: { [String(indicator)]: { indicatorId: b, lowerBound: -Infinity, upperBound: 4, expression: { ids: [x], values: [1] }, name: 'selected' },
        [String(indicator + 1n)]: { indicatorId: b, lowerBound: 0, upperBound: Infinity, expression: { ids: [x], values: [1] }, name: 'keep' } },
      quadraticConstraints: { '7': { lowerBound: -Infinity, upperBound: 100, quadraticTerms: { rowIds: [x], columnIds: [x], coefficients: [1] } } } };
    const transformed = await MathOpt.formulateIndicatorConstraintAsMipProto(proto, indicator, options);
    assert(transformed.proto.variables?.ids?.[0] === b && transformed.proto.variables.ids[1] === x &&
      transformed.proto.linearConstraints?.ids?.[0] === row && transformed.proto.linearConstraints.ids[1] === row + 1n &&
      !transformed.proto.indicatorConstraints?.[String(indicator)] && transformed.proto.indicatorConstraints?.[String(indicator + 1n)] &&
      transformed.proto.quadraticConstraints?.['7'] && transformed.proto.objective?.name === 'profit',
      'Exact IDs, unrelated constraints and metadata survive native export');
    assert((await MathOpt.checkPrimalSolutionFeasibilityProto(transformed.bytes, { ids: [b, x], values: [1, 4] }, options)).feasible,
      'Returned bytes contain the transformed model');
    transformed.bytes.fill(255);
    assert(transformed.proto.name === 'exact ids' && proto.indicatorConstraints[String(indicator)].name === 'selected',
      'Decoded result and input proto remain independently owned');
    const model = MathOpt.Model(), active = model.addBinaryVariable(), value = model.addVariable({ lowerBound: -Infinity, upperBound: 5 });
    const upperOnly = model.addIndicatorConstraint({ indicator: active, upperBound: 3, terms: [{ variable: value, coefficient: 1 }] });
    const bytes = model.encodeModelProto(), pending = MathOpt.formulateIndicatorConstraintAsMipProto(bytes, upperOnly.id, options);
    bytes.fill(255);
    assert((await pending).proto.linearConstraints?.ids?.length === 1, 'Only bounds needed by the constrained side are required, and model bytes are eagerly copied');
    return {};
  },
}];
