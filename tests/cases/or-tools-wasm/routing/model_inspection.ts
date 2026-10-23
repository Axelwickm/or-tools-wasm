import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown) { try { await run(); } catch (error) { assert(error instanceof Error, String(error)); return; } throw new Error('Expected rejection'); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });

export const routingModelInspectionCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.cost_classes', name: 'Native Routing cost classes retain reserved-zero and fixed-cost semantics', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:RoutingModel::GetArcCostForClass', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 2, 0)), options = execution(mode);
    const first = model.registerTransitCallback(() => 3), second = model.registerTransitCallback(() => 7);
    model.setArcCostEvaluatorOfVehicle(first, 0); model.setArcCostEvaluatorOfVehicle(second, 1);
    model.setFixedCostOfVehicle(11, 0); model.setFixedCostOfVehicle(13, 1);
    const count = await model.getCostClassesCount(options), nonzero = await model.getNonZeroCostClassesCount(options);
    assert(count === 3 && nonzero === 2, 'Native count includes its reserved zero cost class');
    const a = await model.getCostClassIndexOfVehicle(0, options), b = await model.getCostClassIndexOfVehicle(1, options);
    assert(a !== b && a > 0 && b > 0, 'Different native arc evaluators yield different cost classes');
    assert(await model.hasVehicleWithCostClassIndex(a, options) && await model.hasVehicleWithCostClassIndex(b, options), 'Native classes identify assigned vehicles');
    assert(!await model.hasVehicleWithCostClassIndex(0, options) && !await model.hasVehicleWithCostClassIndex(count + 20, options),
      'Reserved zero and nonexistent classes need not contain a vehicle');
    assert(!await model.costsAreHomogeneousAcrossVehicles(options), 'Native heterogeneous flag is forwarded');
    assert(await model.getArcCostForClass(model.start(0), 1, a, options) === 14n
      && await model.getArcCostForClass(model.start(0), 1, b, options) === 18n, 'Class costs include the source vehicle fixed cost');
    assert(await model.getArcCostForClass(model.start(0), 1, 0, options) === 11n, 'Native zero class does not imply a zero total arc cost');
    assert(await model.getArcCostForClass(model.end(0), model.end(0), 0, options) === 0n, 'Native self arcs retain zero cost');
    assert(await model.getArcCostForClass(1, 2, b, options) === await model.getArcCostForVehicle(1, 2, 1, options),
      'Class and vehicle queries agree away from vehicle starts');
    for (const query of [() => model.getCostClassIndexOfVehicle(2, options), () => model.hasVehicleWithCostClassIndex(-1, options),
      () => model.getArcCostForClass(1, 2, count, options), () => model.getArcCostForClass(model.end(0), 1, a, options)]) await rejects(query);
    model.setArcCostEvaluatorOfAllVehicles(first);
    assert(await model.costsAreHomogeneousAcrossVehicles(options) && await model.getCostClassesCount(options) === 2,
      'Native class inspection reflects model edits; different fixed costs do not split cost classes');
    assert(count === 3 && (await model.solve(options)).assignment, 'Earlier scalar result remains independent and runtime recovers after bad queries');
    return {};
  },
}, {
  id: 'routing.inspection.penalties', name: 'Native Routing penalties preserve exact values, defaults and forced-active sentinels', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::UnperformedPenaltyOrValue', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(7, 1, 0)), options = execution(mode);
    const penalty = (1n << 60n) + 3n, fallback = -(1n << 60n);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addDisjunction([1], penalty); model.addDisjunction([2, 3], 5); model.addDisjunction([2, 4], 7);
    model.addDisjunction([6], 0); model.activeVar(5).setValue(1);
    assert(await model.unperformedPenalty(1, options) === penalty, 'Single native disjunction penalty retains exact int64 precision');
    assert(await model.unperformedPenalty(2, options) === 0n && await model.unperformedPenaltyOrValue(fallback, 2, options) === fallback,
      'Overlapping disjunctions use the native fallback rather than invented penalty aggregation');
    assert(await model.unperformedPenalty(6, options) === 0n && await model.unperformedPenaltyOrValue(fallback, 6, options) === 0n,
      'A genuine zero penalty is distinct from an undefined penalty');
    assert(await model.unperformedPenalty(5, options) === (1n << 63n) - 1n
      && await model.unperformedPenaltyOrValue(fallback, 5, options) === (1n << 63n) - 1n, 'Forced-active native sentinel overrides the default');
    const pending = model.unperformedPenalty(1, options); model.activeVar(1).setValue(1);
    assert(await pending === penalty && await model.unperformedPenalty(1, options) === (1n << 63n) - 1n, 'Each inspection owns its submitted model snapshot');
    await rejects(() => model.unperformedPenalty(model.end(0), options));
    await rejects(() => model.unperformedPenaltyOrValue(1n << 63n, 1, options));
    return {};
  },
}, {
  id: 'routing.inspection.dimension_classification', name: 'Native dimension classification preserves unary metadata and the native cost filter', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::GetDimensionsWithSoftOrSpanCosts', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 2, 0)), options = execution(mode);
    assert((await model.getUnaryDimensions(options)).length === 0 && (await model.getDimensionsWithSoftOrSpanCosts(options)).length === 0, 'Empty native classifications are successful results');
    const unary = model.registerUnaryTransitCallback(() => 1), binary = model.registerTransitCallback(() => 1);
    model.addDimension(unary, 0, 20, true, '荷重'); model.addDimension(binary, 0, 20, true, 'binary');
    model.addDimensionWithVehicleTransits([unary, binary], 0, 20, true, 'mixed');
    for (const name of ['span', 'soft', 'global only', 'piecewise only']) model.addDimension(binary, 0, 20, true, name);
    model.getDimensionOrDie('span').setSpanCostCoefficientForVehicle(1, 0);
    model.getDimensionOrDie('soft').setCumulVarSoftUpperBound(1, 3, 2);
    model.getDimensionOrDie('global only').setGlobalSpanCostCoefficient(1);
    model.getDimensionOrDie('piecewise only').setCumulVarPiecewiseLinearCost(1, [{ pointX: 0, pointY: 0, slope: 1, otherPointX: 20 }]);
    assert(await model.getDimensionOrDie('荷重').isUnary(options) && !await model.getDimensionOrDie('binary').isUnary(options)
      && !await model.getDimensionOrDie('mixed').isUnary(options), 'Unary classification uses registered native evaluator metadata, not sampled matrix values');
    const pending = model.getUnaryDimensions(options); model.addDimension(unary, 0, 20, true, 'later');
    const original = await pending;
    assert(original.length === 1 && original[0].name === '荷重', 'Classification captures dimensions before awaiting');
    original.length = 0;
    const current = await model.getUnaryDimensions(options);
    assert(current.length === 2 && current[1].name === 'later' && await current[0].isUnary(options), 'Returned arrays are owned and dimension handles remain usable');
    const costs = (await model.getDimensionsWithSoftOrSpanCosts(options)).map(dimension => dimension.name);
    assert(costs.join(',') === 'span,soft', 'Native filter includes vehicle span and soft cumul costs, excluding global-only and piecewise-only costs');
    return {};
  },
}];
