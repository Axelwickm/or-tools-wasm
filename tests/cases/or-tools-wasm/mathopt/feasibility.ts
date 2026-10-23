import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected invalid feasibility input to reject');
}

// Native CheckPrimalSolutionFeasibility contracts; independent of solver backend support.
export const mathOptFeasibilityCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.feasibility.constraint_families', name: 'MathOpt checks every native constraint family with typed violations', solver: 'mathopt',
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const model = MathOpt.Model(), x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true, name: 'x' });
    const y = model.addVariable(), active = model.addBinaryVariable();
    const row = model.addLinearConstraint({ upperBound: 1, terms: [{ variable: x, coefficient: 1 }] });
    const quadratic = model.addQuadraticConstraint({ upperBound: 1,
      quadraticTerms: [{ firstVariable: x, secondVariable: x, coefficient: 1 }] });
    const cone = model.addSecondOrderConeConstraint([x], y);
    const sos1 = model.addSos1Constraint([x, y]), sos2 = model.addSos2Constraint([x, 0, y]);
    const indicator = model.addIndicatorConstraint({ indicator: active, upperBound: 1, terms: [{ variable: x, coefficient: 1 }] });
    const result = await MathOpt.checkPrimalSolutionFeasibility(model, new Map([[x, 1.5], [y, 1], [active, 1]]), options);
    const v = result.violations;
    assert(!result.feasible && v.variableBounds.get(x)?.upper && v.variableIntegrality.has(x) &&
      v.linearConstraints.get(row)?.upper && v.quadraticConstraints.get(quadratic)?.upper &&
      v.secondOrderConeConstraints.has(cone) && v.sos1Constraints.has(sos1) && v.sos2Constraints.has(sos2) &&
      v.indicatorConstraints.has(indicator), 'All native constraint violations retain their model handles');
    assert(result.descriptions.length >= 8, 'Native descriptions explain the violations');
    assert((await MathOpt.checkPrimalSolutionFeasibility(model, { [x.id]: 0, [y.id]: 1, [active.id]: 0 }, options)).feasible,
      'Feasible point and inactive indicator are accepted');
    assert(!result.feasible && result.violations.variableBounds.has(x), 'Earlier results remain independent');
    return {};
  },
}, {
  id: 'mathopt.feasibility.validation_tolerances', name: 'MathOpt preserves native tolerance defaults and rejects incomplete points', solver: 'mathopt',
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const model = MathOpt.Model(), x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: true });
    const values = new Map([[x, 1.0000001]]);
    assert((await MathOpt.checkPrimalSolutionFeasibility(model, values, options)).feasible, 'Native default tolerances');
    const strict = await MathOpt.checkPrimalSolutionFeasibility(model, values,
      { ...options, absoluteConstraintTolerance: 0, integralityTolerance: 0 });
    assert(strict.violations.variableBounds.get(x)?.upper && strict.violations.variableIntegrality.has(x), 'Explicit zero tolerances survive transport');
    assert((await MathOpt.checkPrimalSolutionFeasibility(model, new Map([[x, 1.5]]),
      { ...options, absoluteConstraintTolerance: 0.5, integralityTolerance: 0.5 })).feasible, 'Native inclusive tolerance boundary');
    for (const tolerance of [-1, NaN]) {
      await rejects(() => MathOpt.checkPrimalSolutionFeasibility(model, values, { ...options, nonzeroTolerance: tolerance }));
    }
    await rejects(() => MathOpt.checkPrimalSolutionFeasibility(model, new Map(), options));
    await rejects(() => MathOpt.checkPrimalSolutionFeasibility(model, { [x.id]: 0, 999: 0 }, options));
    const foreign = MathOpt.Model().addVariable();
    await rejects(() => MathOpt.checkPrimalSolutionFeasibility(model, new Map([[foreign, 0]]), options));
    const abort = new AbortController(); abort.abort();
    await rejects(() => MathOpt.checkPrimalSolutionFeasibility(model, values, { ...options, signal: abort.signal }));
    assert((await MathOpt.checkPrimalSolutionFeasibility(MathOpt.Model(), new Map(), options)).feasible, 'Empty model is feasible after errors');
    return {};
  },
}, {
  id: 'mathopt.feasibility.exact_ids_snapshots', name: 'MathOpt raw feasibility preserves exact IDs and eager input snapshots', solver: 'mathopt',
  async run({ mathopt: { MathOpt } }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const id = 9007199254740993n;
    const proto = { variables: { ids: [id], lowerBounds: [0], upperBounds: [1], integers: [false] } };
    const raw = await MathOpt.checkPrimalSolutionFeasibilityProto(proto, { ids: [id], values: [-1] }, options);
    assert(!raw.feasible && raw.bytes.length > 0 && raw.violations.variableBounds?.[String(id)]?.lower,
      'Raw violated subset retains exact int64 IDs');
    for (const point of [{ ids: [id, id], values: [0, 0] }, { ids: [id], values: [] },
      { ids: [id + 1n, id], values: [0, 0] }]) {
      await rejects(() => MathOpt.checkPrimalSolutionFeasibilityProto(proto, point, options));
    }
    const model = MathOpt.Model(), x = model.addVariable({ upperBound: 1 });
    const values = new Map([[x, 2]]), pending = MathOpt.checkPrimalSolutionFeasibility(model, values, options);
    values.set(x, 0); model.deleteVariable(x);
    assert((await pending).violations.variableBounds.get(x)?.upper, 'Captured handles and values survive deletion during execution');
    const bytes = model.encodeModelProto(), pendingBytes = MathOpt.checkPrimalSolutionFeasibilityProto(bytes, {}, options);
    bytes.fill(255);
    assert((await pendingBytes).feasible, 'Raw model bytes copied before awaiting');
    return {};
  },
}];
