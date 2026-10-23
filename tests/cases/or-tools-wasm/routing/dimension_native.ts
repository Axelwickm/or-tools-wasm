import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown | Promise<unknown>) { try { await action(); } catch (error) { assert(error instanceof Error, String(error)); return; } throw new Error('Expected native binding rejection'); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const routingDimensionNativeCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.dimension.piecewise_cost', name: 'Native integer-slope cumul costs preserve acceptance, exact values and owned segments', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:SetCumulVarPiecewiseLinearCost', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0)), options = execution(mode);
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addConstantDimension(2, 100, true, 'time');
    const time = model.getDimensionOrDie('time'), end = model.end(0);
    assert(!await time.hasCumulVarPiecewiseLinearCost(end, options) && await time.getCumulVarPiecewiseLinearCost(end, options) === null, 'Absent native costs stay absent');
    const segments = [{ pointX: 0, pointY: 0, slope: 0, otherPointX: 6 }, { pointX: 6, pointY: 0, slope: 5, otherPointX: 100 }];
    time.setCumulVarPiecewiseLinearCost(end, segments); segments[1].slope = 999;
    const snapshot = await time.getCumulVarPiecewiseLinearCost(end, options);
    assert(snapshot?.some(segment => segment.slope === 5n) && await time.hasCumulVarPiecewiseLinearCost(end, options), 'Integer anchors and slopes are captured and returned exactly');
    const assignment = (await model.solve(options)).assignment;
    assert(assignment?.value(time.cumulVar(end)) === 8n && assignment.objectiveValue() === 14n, 'Native objective includes the tiered cumul cost once');
    assert(snapshot, 'Accepted cost has native segments');
    snapshot[0].pointY = 999n;
    assert((await time.getCumulVarPiecewiseLinearCost(end, options))?.[0].pointY === 0n, 'Getter snapshots cannot edit native costs');
    time.setCumulVarPiecewiseLinearCost(end, [{ pointX: 0, pointY: 5, slope: -1, otherPointX: 100 }]);
    time.setCumulVarPiecewiseLinearCost(end, [{ pointX: 0, pointY: -1, slope: 0, otherPointX: 100 }]);
    assert((await model.solve(options)).assignment?.objectiveValue() === 14n, 'Native ignored replacements preserve the previous accepted cost');
    const exact = 9007199254740993n;
    time.setCumulVarPiecewiseLinearCost(end, [{ pointX: 0, pointY: exact, slope: 0, otherPointX: 100 }]);
    assert((await model.solve(options)).assignment?.objectiveValue() === exact + 4n, 'Costs beyond Number precision remain exact');
    assert(assignment.objectiveValue() === 14n, 'Earlier assignments remain independent');
    await rejects(() => time.setCumulVarPiecewiseLinearCost(end, []));
    await rejects(() => time.setCumulVarPiecewiseLinearCost(end + 1, [{ pointX: 0, pointY: 0, slope: 0, otherPointX: 1 }]));
    const invalid = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0)); invalid.addConstantDimension(1, 100, true, 'time');
    const bad = invalid.getDimensionOrDie('time');
    bad.setCumulVarPiecewiseLinearCost(1, [{ pointX: 0, pointY: 0, slope: 1, otherPointX: 10 }, { pointX: 5, pointY: 5, slope: 1, otherPointX: 20 }]);
    await rejects(() => bad.getCumulVarPiecewiseLinearCost(1, options));
    assert((await model.solve(options)).assignment, 'Invalid native factory input does not poison the runtime');
    return {};
  },
}, {
  id: 'routing.dimension.transit_intervals', name: 'Native dimension classes and interval queries preserve their separate meanings', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetTransitValueFromClass', tags: ['gap-regression', 'native-contract'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 2, 0)), options = execution(mode);
    const one = model.registerTransitCallback(() => 1), exact = 9007199254740993n;
    model.setArcCostEvaluatorOfAllVehicles(one); model.setFixedCostOfVehicle(8, 1);
    model.addDimension(model.registerTransitCallback(() => exact), 0, exact * 10n, true, 'load');
    const load = model.getDimensionOrDie('load');
    assert(await load.vehicleToClass(0, options) === 0 && await load.vehicleToClass(1, options) === 0, 'Dimension classes use their own shared evaluator despite different model vehicle costs');
    assert(await load.getTransitValue(1, 2, 1, options) === exact && await load.getTransitValueFromClass(1, 2, 0, options) === exact, 'Native vehicle/class transit values preserve bigint precision');
    await rejects(() => load.getTransitValueFromClass(1, 2, 1, options)); await rejects(() => load.getTransitValue(1, 2, 2, options));
    model.addConstantDimension(1, 100, false, 'time'); const time = model.getDimensionOrDie('time');
    const variable = time.cumulVar(1); variable.setRange(2, 12);
    time.cumulVar(2).removeInterval(5, 7);
    assert((await time.getForbiddenIntervals(2, options)).length === 0, 'Direct domain removal does not fabricate native NotMember metadata');
    time.addForbiddenIntervals(1, [{ start: 5, end: 7 }]);
    const forbidden = await time.getForbiddenIntervals(1, options);
    assert(forbidden.length === 1 && forbidden[0].start === 5n && forbidden[0].end === 7n, 'Native closure exposes forbidden cumul intervals');
    const allowed = await time.getAllowedIntervalsInRange(1, 0, 100, options);
    assert(allowed.length === 2 && allowed[0].start === 2n && allowed[0].end === 4n && allowed[1].start === 8n && allowed[1].end === 12n, 'Native allowed intervals clip to cumul bounds and preserve holes');
    assert(await time.getFirstPossibleGreaterOrEqualValueForNode(1, 6, options) === 8n
      && await time.getLastPossibleLessOrEqualValueForNode(1, 6, options) === 4n, 'Native permitted-value queries skip forbidden intervals');
    assert(await time.getFirstPossibleGreaterOrEqualValueForNode(1, 20, options) === 20n, 'Native first-value query is not wrapper-clamped to cumul max');
    assert((await time.getAllowedIntervalsInRange(1, 6, 6, options)).length === 0, 'Forbidden-only ranges are empty');
    const prefix = await time.getAllowedIntervalsInRange(1, 2, 3, options);
    assert(prefix.length === 1 && prefix[0].start === 2n && prefix[0].end === 3n, 'Native inspection respects the requested upper bound before a later forbidden interval');
    forbidden[0].start = 0n; assert((await time.getForbiddenIntervals(1, options))[0].start === 5n, 'Intervals are owned snapshots');
    await rejects(() => time.getAllowedIntervalsInRange(1, 9, 8, options)); await rejects(() => time.getForbiddenIntervals(99, options));
    return {};
  },
}, {
  id: 'routing.search.native_entry', name: 'Native search-entry notifications are ordered, reusable and absent during inspection', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:AddEnterSearchCallback', tags: ['gap-regression', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)), options = execution(mode), order: string[] = [];
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1)); model.addConstantDimension(1, 100, true, 'time');
    let entries = 0, fail = false;
    model.addEnterSearchCallback(() => { entries++; order.push('entry callback'); if (fail) throw new Error('native entry failure'); });
    model.addAtSolutionCallback(() => { assert(entries > 0, 'Native entry precedes native solutions'); order.push('solution'); });
    await model.getDimensionOrDie('time').getForbiddenIntervals(1, options);
    assert(entries === 0, 'Model closure/inspection does not fabricate native search entry');
    const solve = () => model.solve({ ...options, solutionLimit: 1, onEvent: event => { if (event.type === 'searchEntered') order.push('entry event'); } });
    assert((await solve()).assignment && entries > 0 && order.indexOf('entry callback') < order.indexOf('solution'), 'Callback and public event follow native search entry');
    assert(order.includes('entry event'), 'Search-entry event crosses the selected executor');
    const before = entries; await solve(); assert(entries > before, 'Reused model registers native entry hooks on each new native model');
    fail = true; await rejects(solve); fail = false;
    assert((await solve()).assignment, 'Callback error cleanup permits a later solve');
    return {};
  },
}];
