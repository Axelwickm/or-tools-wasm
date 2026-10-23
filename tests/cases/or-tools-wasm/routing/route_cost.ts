import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  try { await action(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected route evaluation to reject');
}
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
export const routingRouteCostCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.custom_route_cost', name: 'Native route evaluation preserves exact costs, rejection, aggregation and snapshots', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetRouteCost', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)), options = execution(mode);
    assert(await model.getRouteCost([], options) === 0n && await model.getRouteCost([1, 1], options) === 0n,
      'Native no-evaluator result is zero and does not validate route feasibility');
    const seen: number[][] = [], exact = (1n << 60n) + 3n;
    model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
    model.addRouteConstraint(route => { seen.push([...route]); return exact; });
    const route = [model.start(0), 1, 2, model.end(0)], pending = model.getRouteCost(route, options);
    route.length = 0; model.addRouteConstraint(() => 2n);
    assert(await pending === exact && seen[0].join() === [model.start(0), 1, 2, model.end(0)].join(),
      'Submitted route and evaluator registrations are captured before awaiting');
    assert(await model.getRouteCost(route, options) === exact + 2n && seen[seen.length - 1].length === 0,
      'Empty supplied route reaches callbacks and later registrations apply to later queries');
    const answer = (await model.solve({ ...options, solutionLimit: 1 })).assignment;
    assert(answer?.objectiveValue() === exact + 5n && await model.getRouteCost([0, 1, 2, model.end(0)], options) === exact + 2n,
      'Getter returns custom costs only, independently of the full solve objective');
    let laterCalls = 0;
    model.addRouteConstraint(() => null); model.addRouteConstraint(() => { laterCalls++; return 999; });
    assert(await model.getRouteCost([], options) === null && laterCalls === 0, 'Native rejection short-circuits later callbacks');
    const signed = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
    signed.addRouteConstraint(() => -exact);
    assert(await signed.getRouteCost([], options) === -exact, 'Native signed int64 costs retain precision');
    const overflow = new api.RoutingModel(new api.RoutingIndexManager(2, 1, 0));
    overflow.addRouteConstraint(() => (1n << 63n) - 1n); overflow.addRouteConstraint(() => 1n);
    assert(await overflow.getRouteCost([], options) === (1n << 63n) - 1n, 'Native saturating addition is preserved');
    return {};
  },
}, {
  id: 'routing.inspection.custom_route_cost_failures', name: 'Route evaluation propagates callback failures and supports large payloads without search', solver: 'routing',
  source: 'javascript/routing_route_callbacks.h', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const manager = new api.RoutingIndexManager(3, 1, 0), model = new api.RoutingModel(manager), options = execution(mode);
    let fail = true, calls = 0;
    model.addRouteConstraint(route => { calls++; if (fail) throw new Error('route evaluation failed'); return route.length; });
    await rejects(() => model.getRouteCost([], options));
    fail = false;
    assert(await model.getRouteCost([], options) === 0n, 'A callback error does not become null and the next query recovers');
    const before = calls;
    for (const route of [[-1], [manager.getNumberOfIndices()], [0.5], [NaN]]) await rejects(() => model.getRouteCost(route, options));
    assert(calls === before, 'Invalid index inputs reject before invoking callbacks');
    const abort = new AbortController(); abort.abort();
    await rejects(() => model.getRouteCost([], { ...options, signal: abort.signal }));
    const longRoute = Array.from({ length: 10_000 }, (_, index) => index % 3);
    assert(await model.getRouteCost(longRoute, options) === 10_000n, 'Callback input larger than 64 KiB crosses worker and server transports');
    let secondLength = -1;
    model.addRouteConstraint(route => { (route as number[]).push(1); return 0; });
    model.addRouteConstraint(route => { secondLength = route.length; return 0; });
    assert(await model.getRouteCost([0, 2], options) === 2n && secondLength === 2,
      'Each evaluator receives an independent copy of the supplied route');
    return {};
  },
}];
