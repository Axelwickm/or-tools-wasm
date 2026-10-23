import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
async function rejects(action: () => unknown, expected?: string) {
  try { await action(); } catch (error) {
    assert(error instanceof Error && (!expected || error.message.includes(expected)), `Unexpected failure: ${error}`); return;
  }
  throw new Error('Expected sibling query to reject');
}
export const routingSiblingCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.sibling_order', name: 'Native sibling predicates preserve alternative order, both directions and short circuit', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:GetFirstMatchingPickupDeliverySibling', tags: ['native-contract'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), model = new api.RoutingModel(new api.RoutingIndexManager(7, 1, 0));
    model.addPickupAndDeliverySets(model.addDisjunction([2, 1]), model.addDisjunction([4, 3, 5]));
    const seen: number[] = [];
    assert(await model.getFirstMatchingPickupDeliverySibling(1, index => { seen.push(index); return index === 3; }, options) === 3,
      'Find matching delivery alternative');
    assert(seen.join() === '4,3', 'Native declaration order and early exit');
    seen.length = 0;
    assert(await model.getFirstMatchingPickupDeliverySibling(5, index => { seen.push(index); return true; }, options) === 2 && seen.join() === '2',
      'Delivery searches pickup alternatives in native order');
    seen.length = 0;
    assert(await model.getFirstMatchingPickupDeliverySibling(2, index => { seen.push(index); return false; }, options) === null && seen.join() === '4,3,5',
      'No match visits all native alternatives');
    for (const index of [model.start(0), 6]) assert(await model.getFirstMatchingPickupDeliverySibling(index, () => { throw new Error('Unexpected predicate'); }, options) === null,
      'Unpaired visits do not call predicate');
    return {};
  },
}, {
  id: 'routing.inspection.sibling_lifecycle', name: 'Sibling query snapshots coexist with route callbacks and do not register persistent predicates', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:GetFirstMatchingPickupDeliverySibling', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    let routeCalls = 0, predicateCalls = 0;
    model.addRouteConstraint(() => { routeCalls++; return 7; });
    const pending = model.getFirstMatchingPickupDeliverySibling(1, () => { predicateCalls++; return true; }, options);
    model.addPickupAndDelivery(1, 2);
    assert(await pending === null && predicateCalls === 0, 'In-flight model snapshot excludes later pair');
    assert(await model.getFirstMatchingPickupDeliverySibling(1, () => { predicateCalls++; return true; }, options) === 2, 'Later query sees pair');
    assert(routeCalls === 0, 'Sibling inspection does not evaluate route costs');
    assert(await model.getRouteCost([], options) === 7n && Number(routeCalls) === 1 && Number(predicateCalls) === 1, 'Predicate is transient and route callback handles remain valid');
    assert(await model.getFirstMatchingPickupDeliverySibling(1, () => false, options) === null, 'Next query uses its own predicate');
    assert((await model.solve({ ...options, solutionLimit: 1 })).assignment, 'Inspection leaves builder usable');
    return {};
  },
}, {
  id: 'routing.inspection.sibling_failures', name: 'Sibling predicates reject failures, unsafe inputs and unsupported dual-role nodes and recover', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:GetFirstMatchingPickupDeliverySibling', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), model = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0));
    model.addPickupAndDelivery(1, 2);
    await rejects(() => model.getFirstMatchingPickupDeliverySibling(1, () => { throw new Error('sibling predicate failed'); }, options), 'sibling predicate failed');
    await rejects(() => model.getFirstMatchingPickupDeliverySibling(1, (() => 1) as unknown as () => boolean, options), 'Boolean');
    await rejects(() => model.getFirstMatchingPickupDeliverySibling(1, (async () => true) as unknown as () => boolean, options), 'Routing sibling predicates must return synchronously.');
    for (const index of [-1, 0.5, NaN, model.end(0)]) await rejects(() => model.getFirstMatchingPickupDeliverySibling(index, () => true, options));
    const abort = new AbortController(); abort.abort();
    await rejects(() => model.getFirstMatchingPickupDeliverySibling(1, () => true, { ...options, signal: abort.signal }));
    assert(await model.getFirstMatchingPickupDeliverySibling(1, () => true, options) === 2, 'Query recovers after failures');
    model.addPickupAndDelivery(3, 1);
    await rejects(() => model.getFirstMatchingPickupDeliverySibling(1, () => true, options), 'both pickup and delivery');
    return {};
  },
}];
