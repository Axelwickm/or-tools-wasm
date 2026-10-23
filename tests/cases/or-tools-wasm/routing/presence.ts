import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown) { try { await run(); } catch (error) { assert(error instanceof Error, String(error)); return; } throw new Error('Expected rejection'); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });

export const routingPresenceCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.inspection.visit_type_membership', name: 'Native visit-type membership includes alternative sets and preserves actual pair IDs', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::FinalizeVisitTypes', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const model = new api.RoutingModel(new api.RoutingIndexManager(9, 1, 0)), options = execution(mode);
    model.addPickupAndDelivery(1, 2);
    const pickups = model.addDisjunction([3, 4], 100), deliveries = model.addDisjunction([5, 6], 100);
    model.addPickupAndDeliverySets(pickups, deliveries);
    model.addPickupAndDelivery(7, 8);
    for (const index of [0, 3, 7]) model.setVisitType(index, 0, api.VisitTypePolicy.TYPE_ADDED_TO_VEHICLE);
    model.setVisitType(8, 2, api.VisitTypePolicy.ADDED_TYPE_REMOVED_FROM_VEHICLE);
    assert((await model.getSingleNodesOfType(0, options)).join(',') === '0', 'Alternative pickups are not singleton nodes');
    const pairs = await model.getPairIndicesOfType(0, options);
    assert(pairs.join(',') === '1,2', 'Sets consume native pair IDs, including IDs of subsequent ordinary pairs');
    assert((await model.getPairIndicesOfType(2, options)).join(',') === '2', 'Delivery membership uses the same native pair');
    assert((await model.getSingleNodesOfType(1, options)).length === 0 && (await model.getPairIndicesOfType(1, options)).length === 0, 'Sparse unused types return empty arrays');
    pairs.push(99);
    const pending = model.getPairIndicesOfType(0, options);
    model.setVisitType(3, -1, api.VisitTypePolicy.TYPE_ADDED_TO_VEHICLE);
    assert((await pending).join(',') === '1,2' && (await model.getPairIndicesOfType(0, options)).join(',') === '2', 'Queries capture submitted edits and return independent arrays');
    await rejects(() => model.getPairIndicesOfType(3, options));
    await rejects(() => model.getSingleNodesOfType(-1, options));
    assert((await model.getSingleNodesOfType(0, options)).join(',') === '0', 'Invalid queries leave the model reusable');
    return {};
  },
}, {
  id: 'routing.precedence.performed_relationship', name: 'Native node precedences enforce each optional-visit relationship and cumul ordering', solver: 'routing',
  source: 'ortools/constraint_solver/routing.h:RoutingDimension::NodePrecedence::PerformedConstraint', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const P = api.RoutingPrecedencePerformedConstraint, options = execution(mode);
    for (const relationship of [P.FIRST_AND_SECOND_INDEPENDENT, P.SECOND_IMPLIES_FIRST, P.FIRST_IMPLIES_SECOND, P.FIRST_AND_SECOND_EQUAL]) {
      const model = new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0));
      model.addConstantDimension(1, 10, true, 'order');
      model.addDisjunction([1], 100); model.addDisjunction([2], 100);
      const dimension = model.getDimensionOrDie('order');
      // Omission must preserve the original independent behavior.
      dimension.addNodePrecedence(1, 2, 1, relationship === P.FIRST_AND_SECOND_INDEPENDENT ? undefined : relationship);
      for (const route of [[], [1], [2], [1, 2]]) {
        const expected = relationship === P.FIRST_AND_SECOND_INDEPENDENT
          || (relationship === P.SECOND_IMPLIES_FIRST && route.join(',') !== '2')
          || (relationship === P.FIRST_IMPLIES_SECOND && route.join(',') !== '1')
          || (relationship === P.FIRST_AND_SECOND_EQUAL && route.length !== 1);
        const assignment = await model.readAssignmentFromRoutes([route], true, options);
        assert(Boolean(assignment) === expected, `Native presence relationship ${relationship} for route ${route}`);
        if (assignment && route.length === 2) assert(assignment.value(dimension.cumulVar(2)) >= assignment.value(dimension.cumulVar(1)) + 1n, 'Both performed nodes retain the cumul offset');
      }
      assert(await model.readAssignmentFromRoutes([[2, 1]], true, options) === null, 'Reverse ordering fails even when both visits are present');
      await rejects(() => dimension.addNodePrecedence(1, 2, 0, 4 as Parameters<typeof dimension.addNodePrecedence>[3]));
      await rejects(() => dimension.addNodePrecedence(1, model.end(0), 0));
      const solved = await model.solve(options);
      assert(solved.assignment, 'Native optimization succeeds after rejected inputs');
    }
    return {};
  },
}];
