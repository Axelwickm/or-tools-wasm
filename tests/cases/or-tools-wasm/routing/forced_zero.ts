import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';
import type * as Api from 'or-tools-wasm/routing';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const execution = (mode: ExecutorFixtureMode = 'direct') => ({ executor: mode === 'server' ? serverExecutorConfiguration() : mode });
function model(api: typeof Api) { return new api.RoutingModel(new api.RoutingIndexManager(3, 1, 0)); }

export const routingForcedZeroCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.disjunctions.forced_zero_penalties', name: 'Explicit native simplification removes forced-inactive penalties and mandatory cardinality', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::IgnoreDisjunctionsAlreadyForcedToZero', tags: ['native-contract', 'gap-regression'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), exact = 9007199254740993n;
    for (const behavior of [api.PenaltyCostBehavior.PENALIZE_ONCE, api.PenaltyCostBehavior.PENALIZE_PER_INACTIVE]) {
      const routing = model(api), id = routing.addDisjunction([1, 2], exact, 2, behavior);
      routing.activeVar(1).setValue(0); routing.activeVar(2).setValue(0);
      const original = await routing.solve(options);
      assert(original.assignment?.objectiveValue() === exact * (behavior === api.PenaltyCostBehavior.PENALIZE_ONCE ? 1n : 2n),
        'Ordinary solving preserves native penalty accounting without automatic simplification');
      routing.ignoreDisjunctionsAlreadyForcedToZero();
      assert(await routing.getDisjunctionMaxCardinality(id, options) === 0n, 'Native getter observes changed cardinality');
      assert(routing.getDisjunctionPenalty(id) === exact && routing.getDisjunctionPenaltyCostBehavior(id) === behavior,
        'Simplification changes cardinality, preserving penalty and cost behavior');
      const simplified = await routing.solve(options);
      assert(simplified.assignment?.objectiveValue() === 0n, 'Both native penalty behaviors charge zero after explicit simplification');
      assert(await routing.checkIfAssignmentIsFeasible(simplified.assignment, false, options), 'Simplified assignment satisfies native CP');
      assert(original.assignment.objectiveValue() > 0n, 'Earlier assignment is an independent result');
      assert((await routing.readAssignmentFromRoutes([[]], false, options))?.objectiveValue() === 0n,
        'Assignment restoration uses the same pre-closure operation');
    }
    const mandatory = model(api), id = mandatory.addDisjunction([1, 2]);
    mandatory.activeVar(1).setValue(0); mandatory.activeVar(2).setValue(0);
    assert(!(await mandatory.solve(options)).assignment, 'Unsimplified mandatory disjunction is infeasible');
    mandatory.ignoreDisjunctionsAlreadyForcedToZero();
    assert((await mandatory.solve(options)).assignment && await mandatory.getDisjunctionMaxCardinality(id, options) === 0n,
      'Native simplification also removes mandatory cardinality');
    assert(mandatory.hasMandatoryDisjunctions(), 'Native mandatory flag still reflects its unchanged -1 penalty sentinel');
    return {};
  },
}, {
  id: 'routing.disjunctions.forced_zero_order', name: 'Simplification respects construction order and does not propagate or infer inactive visits', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::IgnoreDisjunctionsAlreadyForcedToZero', tags: ['native-contract', 'model-correctness'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), routing = model(api), id = routing.addDisjunction([1, 2], 50);
    routing.activeVar(1).setValue(0);
    routing.ignoreDisjunctionsAlreadyForcedToZero();
    routing.activeVar(2).setValue(0);
    assert(await routing.getDisjunctionMaxCardinality(id, options) === 1n && (await routing.solve(options)).assignment?.objectiveValue() === 50n,
      'A later domain change does not retroactively modify the earlier native operation');
    routing.ignoreDisjunctionsAlreadyForcedToZero();
    assert((await routing.solve(options)).assignment?.objectiveValue() === 0n, 'Repeating the explicit operation sees the later domain change');
    routing.ignoreDisjunctionsAlreadyForcedToZero();
    const later = routing.addDisjunction([1], 70);
    assert(await routing.getDisjunctionMaxCardinality(later, options) === 1n && (await routing.solve(options)).assignment?.objectiveValue() === 70n,
      'Disjunctions added afterwards remain unchanged, even when their visits are already inactive');
    const constrained = model(api);
    constrained.addDisjunction([1, 2], 50);
    constrained.addConstraints(constrained.activeVar(1).eq(0), constrained.activeVar(2).eq(0));
    constrained.ignoreDisjunctionsAlreadyForcedToZero();
    assert((await constrained.solve(options)).assignment?.objectiveValue() === 50n,
      'Native operation inspects current domains, without performing constraint propagation');
    return {};
  },
}, {
  id: 'routing.disjunctions.forced_zero_snapshots', name: 'Native disjunction inspection captures each execution and leaves the builder editable', solver: 'routing',
  source: 'ortools/constraint_solver/routing.cc:RoutingModel::HasMaxCardinalityConstrainedDisjunctions', tags: ['native-contract', 'lifecycle'],
  async run({ routing: api }, { mode }) {
    const options = execution(mode), routing = model(api);
    routing.ignoreDisjunctionsAlreadyForcedToZero(); // Empty native model is a no-op.
    const id = routing.addDisjunction([1, 2], 50, 2);
    assert(!(await routing.hasMaxCardinalityConstrainedDisjunctions(options)), 'Equal group size/cardinality is initially unconstrained');
    routing.activeVar(1).setValue(0); routing.activeVar(2).setValue(0);
    const cardinality = routing.getDisjunctionMaxCardinality(id, options);
    routing.ignoreDisjunctionsAlreadyForcedToZero();
    assert(await cardinality === 2n, 'Pending cardinality inspection retains its construction snapshot');
    assert(await routing.getDisjunctionMaxCardinality(id, options) === 0n && await routing.hasMaxCardinalityConstrainedDisjunctions(options),
      'Subsequent inspection sees native cardinality and constrained-disjunction classification');
    assert((await routing.solve(options)).assignment?.objectiveValue() === 0n, 'Inspection does not close the TypeScript builder');
    for (const inspect of [true, false]) {
      const fresh = model(api);
      fresh.addDisjunction([1, 2], 50, 2);
      fresh.activeVar(1).setValue(0); fresh.activeVar(2).setValue(0);
      if (inspect) {
        const pending = fresh.hasMaxCardinalityConstrainedDisjunctions(options);
        fresh.ignoreDisjunctionsAlreadyForcedToZero();
        assert(!(await pending) && await fresh.hasMaxCardinalityConstrainedDisjunctions(options),
          'Pending flag inspection retains its own construction snapshot');
      } else {
        const pending = fresh.solve(options);
        fresh.ignoreDisjunctionsAlreadyForcedToZero();
        assert((await pending).assignment?.objectiveValue() === 50n && (await fresh.solve(options)).assignment?.objectiveValue() === 0n,
          'Pending solve retains its own construction snapshot');
      }
    }
    for (const index of [-1, 0.5, NaN, 1]) {
      let rejected = false;
      try { await routing.getDisjunctionMaxCardinality(index, options); } catch { rejected = true; }
      assert(rejected, 'Invalid native getter indices reject before unsafe access');
    }
    return {};
  },
}];
