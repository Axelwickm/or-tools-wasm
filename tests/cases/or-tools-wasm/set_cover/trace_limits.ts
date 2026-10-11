import type * as Api from 'or-tools-wasm/set-cover';
import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration, solverJobStates } from '../../../harness/shared_case.ts';
type CoverApi = Pick<typeof Api, 'SetCoverModel' | 'SetCoverInvariant' | 'TrivialSolutionGenerator' |
  'RandomSolutionGenerator' | 'GreedySolutionGenerator' | 'ElementDegreeSolutionGenerator' | 'SteepestSearch'>;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(run: () => unknown, pattern: RegExp) {
  try { await run(); } catch (error) { if (pattern.test(String(error))) return; throw error; }
  throw new Error(`Expected rejection matching ${pattern}`);
}
function model(api: CoverApi) {
  const model = new api.SetCoverModel();
  for (const cost of [1, 2, 3]) { model.addEmptySubset(cost); model.addElementToLastSubset(0); }
  return model;
}
function options(mode: ExecutorFixtureMode = 'direct') { return { executor: mode === 'server' ? serverExecutorConfiguration() : mode }; }
function decisions(invariant: InstanceType<CoverApi['SetCoverInvariant']>) { return invariant.trace().map(item => [item.subset(), item.decision()]); }

// Native contracts beyond upstream Python coverage. Native CompressTrace keeps
// first occurrence order for subsets whose final trace decision is selected.
export const setCoverTraceCases: SharedCase<CoverApi, { cost: number; numUncoveredElements: number }, ExecutorFixtureMode>[] = [
  {
    id: 'set_cover.inspect.selection_snapshot', name: 'Inspection and focus coverage retain submitted selections', solver: 'set-cover',
    source: 'javascript/lib/set_cover/api.ts', tags: ['binding-contract', 'snapshot'],
    async run(api, context) {
      const invariant = new api.SetCoverInvariant(model(api)), execution = options(context.mode);
      invariant.select(0);
      const pending = invariant.inspect(execution);
      invariant.select(1);
      const submitted = await pending;
      assert(JSON.stringify(submitted.selected) === '[true,false,false]' && submitted.cost === 1 && submitted.coverage[0] === 1,
        'Native inspection uses the selection submitted before later edits');
      const current = await invariant.inspect(execution);
      assert(current.cost === 3 && current.coverage[0] === 2, 'New inspection sees the edited selection');
      const focus = invariant.computeCoverageInFocus([0, 1, 2], execution);
      invariant.select(2);
      assert((await focus)[0] === 2, 'Native focus coverage retains its submitted selection');
      assert((await invariant.computeCoverageInFocus([0, 1, 2], execution))[0] === 3, 'New focus query sees the edit');
      return { cost: current.cost, numUncoveredElements: current.numUncoveredElements };
    },
  },
  {
    id: 'set_cover.native.ordinary_search_stale_result', name: 'Ordinary Set Cover searches preserve edits made during execution', solver: 'set-cover',
    source: 'javascript/lib/set_cover/api.ts', tags: ['binding-contract'],
    async run(api, context) {
      const execution = options(context.mode);
      for (const edit of ['selection', 'cost', 'replacement'] as const) {
        const original = model(api), invariant = new api.SetCoverInvariant(original);
        const generator = new api.GreedySolutionGenerator(invariant);
        let changed = false;
        await rejects(() => generator.nextSolution(undefined, { ...execution, onEvent: event => {
          if (changed || event.type !== 'status') return;
          changed = true;
          if (edit === 'selection') invariant.loadSolution([false, false, true]);
          else if (edit === 'cost') original.setSubsetCost(0, 9);
          else {
            const replacement = new api.SetCoverModel();
            replacement.addEmptySubset(7); replacement.addElementToLastSubset(0);
            invariant.setModel(replacement);
          }
        } }), /modified during search/);
        assert(changed, 'The observer edited state during the submitted search');
        assert(JSON.stringify(invariant.isSelected()) === JSON.stringify(edit === 'selection'
          ? [false, false, true] : edit === 'cost' ? [false, false, false] : [false]), 'Stale search cannot overwrite edits');
        if (edit === 'cost') assert(original.subsetCosts[0] === 9, 'Updated cost is preserved');
        await generator.nextSolution(undefined, execution);
        assert(await invariant.numUncoveredElements(execution) === 0, 'A fresh search recovers after a stale result');
      }
      return { cost: 7, numUncoveredElements: 0 };
    },
  },
  {
    id: 'set_cover.native.trace_compression', name: 'Native trace compression order and selection', solver: 'set-cover',
    source: 'ortools/set_cover/set_cover_invariant.cc::CompressTrace', tags: ['native-contract'],
    async run(api, context) {
      const invariant = new api.SetCoverInvariant(model(api)); const execution = options(context.mode);
      invariant.loadSolution([false, false, true]); invariant.clearTrace();
      invariant.deselect(2); invariant.select(1); invariant.select(2);
      invariant.select(0); invariant.deselect(1); invariant.select(1); invariant.deselect(0);
      const selected = invariant.isSelected(); const cost = await invariant.cost(execution);
      const compressing = invariant.compressTrace(execution); assert(compressing instanceof Promise, 'Compression follows native async convention'); await compressing;
      assert(JSON.stringify(decisions(invariant)) === '[[2,true],[1,true]]', 'Native first occurrence order preserved even when its original decision was false');
      assert(JSON.stringify(invariant.isSelected()) === JSON.stringify(selected) && await invariant.cost(execution) === cost, 'Compression preserves model and selection');
      await invariant.compressTrace(execution); assert(JSON.stringify(decisions(invariant)) === '[[2,true],[1,true]]', 'Native compression is idempotent');
      invariant.clearTrace(); await invariant.compressTrace(execution);
      assert(invariant.trace().length === 0 && JSON.stringify(invariant.isSelected()) === JSON.stringify(selected), 'Empty trace stays empty independently of selection');
      const replacement = new api.SetCoverModel(); replacement.addEmptySubset(7); replacement.addElementToLastSubset(0);
      invariant.setModel(replacement);
      assert(JSON.stringify(invariant.isSelected()) === '[false]' && invariant.trace().length === 0, 'Model replacement explicitly resets selection and trace');
      const empty = new api.SetCoverInvariant(new api.SetCoverModel()); await empty.compressTrace(execution);
      assert(empty.trace().length === 0, 'Empty native model/trace compress safely');
      const greedyModel = new api.SetCoverModel();
      for (const [cost, element] of [[5, 0], [7, 1], [1, 0]]) {
        greedyModel.addEmptySubset(cost); greedyModel.addElementToLastSubset(element);
      }
      const greedyInvariant = new api.SetCoverInvariant(greedyModel);
      await new api.GreedySolutionGenerator(greedyInvariant).nextSolution(undefined, execution);
      assert(JSON.stringify(decisions(greedyInvariant)) === '[[2,true],[1,true]]', 'Ordinary solves return their actual native decision order');
      await greedyInvariant.compressTrace(execution);
      assert(JSON.stringify(decisions(greedyInvariant)) === '[[2,true],[1,true]]', 'Standalone compression preserves ordinary native trace order');
      return { cost, numUncoveredElements: 0 };
    },
  },
  {
    id: 'set_cover.native.trace_lifecycle', name: 'Trace snapshot, concurrency and observer lifecycle', solver: 'set-cover',
    source: 'ortools/set_cover/set_cover_invariant.cc::CompressTrace', tags: ['native-contract'],
    async run(api, context) {
      const invariant = new api.SetCoverInvariant(model(api)); const execution = options(context.mode);
      invariant.select(2); invariant.select(0); invariant.deselect(0);
      const pending = invariant.compressTrace(execution);
      await rejects(() => invariant.compressTrace(execution), /already in progress/); await pending;
      let changed = false;
      await rejects(() => invariant.compressTrace({ ...execution, onEvent: event => {
        if (event.type === 'status' && event.status.state === solverJobStates.RUNNING && !changed) { changed = true; invariant.select(1); }
      } }), /modified during trace compression/);
      assert(changed && JSON.stringify(decisions(invariant)) === '[[2,true],[1,true]]', 'Stale native result cannot overwrite newer trace');
      const controller = new AbortController(); controller.abort(); const before = JSON.stringify(decisions(invariant));
      await rejects(() => invariant.compressTrace({ ...execution, signal: controller.signal }), /AbortError/);
      assert(JSON.stringify(decisions(invariant)) === before, 'Pre-abort preserves trace');
      const failure = new Error('trace observer failure'); let caught: unknown;
      try { await invariant.compressTrace({ ...execution, onEvent: () => { throw failure; } }); } catch (error) { caught = error; }
      assert(caught === failure, 'Observer exception is retained');
      await invariant.compressTrace(execution);
      assert(JSON.stringify(decisions(invariant)) === '[[2,true],[1,true]]', 'Invariant recovers after observer failure');
      return { cost: await invariant.cost(execution), numUncoveredElements: 0 };
    },
  },
  {
    id: 'set_cover.native.iteration_semantics', name: 'Native constructor and search iteration limits', solver: 'set-cover',
    source: 'ortools/set_cover/set_cover_heuristics.cc', tags: ['native-contract'],
    async run(api, context) {
      const execution = options(context.mode);
      // Native construction heuristics do not read max_iterations(). Forward
      // the value faithfully; the wrapper does not impose its own work budget.
      for (const Constructor of [api.TrivialSolutionGenerator, api.RandomSolutionGenerator, api.GreedySolutionGenerator, api.ElementDegreeSolutionGenerator]) {
        const invariant = new api.SetCoverInvariant(model(api)); const generator = new Constructor(invariant);
        generator.setMaxIterations(0); await generator.nextSolution(undefined, execution);
        assert(await invariant.numUncoveredElements(execution) === 0, 'Native constructor ignores iteration setting and constructs a cover');
        invariant.clear(); generator.setTimeLimitInSeconds(0);
        assert(await generator.nextSolution(undefined, execution) && await invariant.numUncoveredElements(execution) === 0, 'Native constructor ignores the unenforced time setting');
      }
      const invariant = new api.SetCoverInvariant(model(api)); invariant.loadSolution([true, true, true]);
      const steepest = new api.SteepestSearch(invariant); steepest.setMaxIterations(0);
      await steepest.nextSolution(undefined, execution);
      assert(invariant.isSelected().every(Boolean), 'Native search honors zero iterations');
      steepest.setMaxIterations(1); await steepest.nextSolution(undefined, execution);
      assert(invariant.isSelected().filter(Boolean).length === 2 && await invariant.numUncoveredElements(execution) === 0, 'Native steepest search performs one improvement iteration');
      return { cost: await invariant.cost(execution), numUncoveredElements: 0 };
    },
  },
];
