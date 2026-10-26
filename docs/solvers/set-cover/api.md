# Set Cover API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/set-cover.ts).

The Set Cover API provides weighted covering models, solution invariants,
heuristic searches, native MIP covers, LP relaxations, CFT covers and Lagrangian bounds. The runtime is loaded lazily and execution is selected per
search, following the same execution contract as CP-SAT.

```ts
import { SetCover, SetCoverModel } from 'or-tools-wasm/set-cover';

const model = new SetCoverModel();
model.addEmptySubset(2.0);
model.addElementToLastSubset(0);
model.addEmptySubset(2.0);
model.addElementToLastSubset(1);
model.addEmptySubset(1.0);
model.addElementToLastSubset(0);
model.addElementToLastSubset(1);

const result = await SetCover.solve(model, { algorithm: 'greedy', executor: 'worker' });
if (result.hasSolution) console.log(result.cost, result.selectedSubsets());
```

## One-shot solves and results

`SetCover.solve(model, options?: SetCoverOneShotOptions)` starts from an empty
selection. `algorithm` accepts `'trivial'`, `'random'`, `'greedy'` (default),
`'elementDegree'`, `'lazyElementDegree'`, `'steepest'`, `'lazySteepest'`,
`'guidedLocal'` and `'guidedTabu'`. Improvement searches need an appropriate
starting cover. Use `SetCoverInvariant` and generators to construct that cover
before running an iterative or focused search.

Options combine `maxIterations`, `timeLimitSeconds`, `executor`, `signal` and
`onEvent`. The two search limits default to infinity, but enforcement depends
on the native algorithm as described below. `SetCoverResult` contains `cost`,
`numUncoveredElements`, `hasSolution`, `statistics`, `contains(subset)` and
`selectedSubsets()`. It owns its selection. `hasSolution` means every element is
covered, not that the heuristic proved optimality.

`nextSolution(focus?, options?)` accepts `executor`, `signal`, and `onEvent`.
`executor` supports `direct`, `worker`, `server`, `cloud`, and `auto`; the
default is `auto`. There is no global initializer or executor setting.

## Models and formats

`new SetCoverModel()` exposes:

- properties: `name`, `numElements`, `numSubsets`, `numNonzeros`, `fillRate`,
  `subsetCosts`, `columns`, `rows`, `rowViewIsValid`, `allSubsets`
- `subsetRange()`, `elementRange()`
- `setName(name)`
- `addEmptySubset(cost)`, `addElementToLastSubset(element)`
- `addElementToSubset(element, subset)`, `setSubsetCost(subset, cost)`
- `createSparseRowView()`, `sortElementsInSubsets()`
- `computeFeasibility()`
- `resizeNumSubsets(numSubsets)`
- `exportModelAsProto()`, `importModelFromProto(proto)`
- `SetCoverModel.fromText(text, format, options?)`, `model.exportText(format, options?)`
- `computeCostStats()`, `computeRowStats()`, `computeColumnStats()`
- `computeRowDeciles()`, `computeColumnDeciles()`

`computeFeasibility()` is a local structural coverage check; it does not validate
algorithm-specific cost restrictions or run a native solve.

Costs must be finite. Element and subset indices must be nonnegative and below
`2_147_483_647`, reserving the native int32 count boundary. Imports and rejected
setters leave the model unchanged. Native floating-point results, including
overflowing costs, are preserved across executors.

Native text import accepts `'orlibScp'`, `'orlibRail'` and `'fimi'`; export accepts
`'orlibScp'` and `'orlibRail'` because native OR-Tools has no FIMI writer. Both
operations are asynchronous and accept executor/signal options. They use native
format converters through private temporary files (in WASM memory or on the
server), released on success and errors. Malformed tokens, truncated input and
invalid indices reject rather than aborting the runtime. OR-Library imports also
reject trailing uncovered elements: the native model cannot preserve that declared
universe, and silently dropping elements would change feasibility. FIMI preserves native
minimum-label normalization, unit costs and within-subset duplicate removal.

```ts
const model = await SetCoverModel.fromText(text, 'orlibScp', { executor: 'worker' });
const rail = await model.exportText('orlibRail', { executor: 'worker' });
```

Native generator timing is available in `SetCover.solve(...).statistics` and
`generator.nextSolutionWithStats(focus?, options?)`, which returns
`{ nextSolution, statistics }`. The existing `nextSolution()` Boolean contract is
preserved. Statistics contain native `runTimeSeconds` and
`runTimeMicroseconds`, or `null` when the executor supplies no timing metadata.
The microsecond value follows native truncation; no JavaScript timer is used.

For initialized guided searches, `await search.statistics(options?)` reads the
existing native counter without another search or changing the invariant.
Native timing describes the latest `NextSolution()` call; initialization preserves
that duration. Stateless generator calls describe their newly created native
generator. Results own their metadata; no last-result cache is added.

## Invariants and selection edits

`new SetCoverInvariant(model)` exposes:

- `initialize()`, `clear()`, `model()`, `setModel(model)`
- `cost()`, `numUncoveredElements()`, `isSelected()`, `coverage()`
- `numFreeElements()`, `numCoverageLe1Elements()`
- `computeCoverageInFocus(focus)`, `isRedundant()`, `computeIsRedundant(subset)`
- `trace()`, `clearTrace()`, `compressTrace()`
- `loadSolution(solution)`
- `select(subset)`, `deselect(subset)`
- `updateSelection(subset, selected, options?)`
- `clearRandomSubsets(numSubsets, options?)`, `clearMostCoveredElements(numSubsets, options?)`
- `exportSolutionAsProto()`, `importSolutionFromProto(proto)`

`inspect(options?)` returns a detached `SetCoverInspection` with native cost,
selection, coverage, free elements and redundancy. Its fields are `cost`,
`numUncoveredElements`, `selected`, `coverage`, `numFreeElements`,
`numCoverageLe1Elements`, `isRedundant` and optional native `costLowerBound` and
`computedRedundancy`. Selection, redundancy and free-element arrays use subset
indices. `coverage` uses element indices. Read several fields from one
inspection to perform one native request. Convenience getters each perform a
fresh inspection; no result cache is maintained. Calculated getters
(`cost`, coverage counts, `coverage`, `isRedundant`), `computeCoverageInFocus`,
`computeIsRedundant` and
`exportSolutionAsProto` are awaitable and accept executor/signal/event options.
They snapshot the editable model and selection before executing. `isSelected`,
`trace`, selection/load/import methods and `clearTrace` are synchronous.

```ts
const state = await invariant.inspect({ executor: 'worker' });
console.log(state.cost, state.coverage);
```

`trace()` returns `SetCoverDecision` values. Read their `subset()` index and
`decision()` Boolean. `loadSolution(booleanSelection)` replaces the selection.
`SetCoverModelProto` contains `subset: { cost, element: number[] }[]` and optional
`name`. `SetCoverSolutionResponse` contains selected `subset` indices, optional
`status`, `numSubsets`, `cost` and `costLowerBound`, plus `toString()`. These are
object-based import/export formats, separate from the text converters.

`await invariant.compressTrace({ executor })` calls native trace compression,
preserving first occurrence order for subsets whose final trace decision selects
them. It changes only the trace; an empty trace stays empty. `setModel(model)`
resets the selection and trace for the replacement model.

`updateSelection` applies native selection/removal and returns a detached
`SetCoverRemovability` with `changed`, `newlyRemovableSubsets` and
`newlyNonRemovableSubsets`. Notifications belong to that update; no-op updates
return empty lists. Native notification order and repeated subset IDs are
preserved. The synchronous `select`/`deselect` methods remain explicit
selection edits without native notifications.

Both awaited perturbation methods update the invariant and return the native
subset indices that can be reused as a focus. Options accept an optional
`focus` index list alongside executor/signal/event settings; omitted focus means
all subsets, while `[]` means none. Random perturbation can also clear selected
intersecting subsets outside the focus and beyond the requested count. Its
returned focus contains sampled subsets, rather than every cleared subset.
Most-covered perturbation clears at most the requested number of selected
subsets touching overcovered elements. Counts are nonnegative int32 values.
Native randomness remains native; no seed or wrapper repair is added.

```ts
const changes = await invariant.updateSelection(2, true, { executor: 'worker' });
console.log(changes.newlyRemovableSubsets);
await invariant.clearMostCoveredElements(1, { executor: 'worker' });
await new GreedySolutionGenerator(invariant).nextSolution(undefined, { executor: 'worker' });
```

Mutations copy their inputs before execution and reject stale results if the
model or selection is edited while they run. A guided search that was already
initialized must call `initialize()` after external edits before continuing.

## Generators and retained searches

Available generators and searches:

- `TrivialSolutionGenerator`
- `RandomSolutionGenerator`
- `GreedySolutionGenerator`
- `ElementDegreeSolutionGenerator`
- `LazyElementDegreeSolutionGenerator`
- `SteepestSearch`
- `LazySteepestSearch`
- `GuidedLocalSearch`
- `GuidedTabuSearch`

Construct each with a `SetCoverInvariant`. `name()` returns its generator name.
`focus` in `nextSolution` or `nextSolutionWithStats` accepts subset indices or
a Boolean mask with one entry per subset. Omission means all subsets, while an
empty index list means none. Numeric duplicates select a subset only once.
The native algorithm decides how focus affects its search.

All expose `nextSolution()`, `setMaxIterations()`,
`setTimeLimitInSeconds(seconds)` and `resetLimits()`. Steepest and guided searches
honor iteration limits; construction generators ignore them as native OR-Tools
does. Time settings are forwarded, but the pinned OR-Tools Set Cover heuristics
do not implement time-limit enforcement. Use executor cancellation when needed.
Set a finite iteration limit for bounded guided search. `LazySteepestSearch`
forwards sparse or Boolean focus to native lazy redundancy removal; its inherited
iteration limit is unused by native code.
`nextSolution()` returns the native generator's Boolean result; use coverage or
`SetCoverResult.hasSolution` to determine whether the resulting cover is feasible.
If the model or selection/trace changes during an ordinary search, its stale
result is rejected and the edits are preserved. Submit a fresh search to continue.

`GuidedTabuSearch` also exposes `setLagrangianFactor(factor)`, `setEpsilon(value)`,
`setPenaltyFactor(factor)` and `setTabuListSize(size)`. Setters configure the next
search synchronously. The corresponding `getLagrangianFactor(options?)`,
`getEpsilon(options?)`, `getPenaltyFactor(options?)` and `getTabuListSize(options?)`
are awaitable native queries, accepting the usual executor, signal and event
options. Unspecified settings use the native defaults; explicit zero values are
preserved. Numeric factors must be finite, and tabu-list size must be a positive
int32 to keep native tabu-list indexing safe.

```ts
import { GreedySolutionGenerator, GuidedTabuSearch, SetCoverInvariant } from 'or-tools-wasm/set-cover';

const invariant = new SetCoverInvariant(model);
await new GreedySolutionGenerator(invariant).nextSolution(undefined, { executor: 'worker' });
const search = new GuidedTabuSearch(invariant);
search.setPenaltyFactor(0.5);
search.setEpsilon(1e-6);
search.setTabuListSize(9);
search.setMaxIterations(200);
console.log(await search.getPenaltyFactor({ executor: 'worker' }));
try {
  await search.initialize({ executor: 'worker' });
  for (let pass = 0; pass < 5; pass++) await search.nextSolution();
} finally {
  await search.close();
}
```

`GuidedLocalSearch` and `GuidedTabuSearch` own persistent native sessions, like
MathOpt's incremental solver. The first `initialize(options?)` or `nextSolution()`
creates a session from a feasible cover and binds its executor. Repeated searches
reuse the same native invariant and generator, preserving penalties, heaps and
tabu history. Later calls without executor options use that bound executor.
`SetCover.solve()` remains the stateless one-shot API.

`initialize(options?)` reloads the current cover and calls the existing generator's
native initializer. It preserves native semantics: initialization resets native
penalties but does not promise to clear tabu history or every heap. Changing the
cover outside this search requires initialization before continuing. Model edits
require a new search instance. Iteration limits apply to each call; native elapsed
search time describes the latest call. Time settings are forwarded without adding
timeout behavior to the native heuristic. Setters forward only changed settings, so ordinary calls do not
reset the native tabu list.

Always await `close()` to release the native session. Close is idempotent and waits
for an active operation; it cannot be called from that operation's event handler.
Cancelled server creation finishes in the background so its late handle can be
retrieved and deleted, including after `close()` returns.
Executor changes and direct/worker runtime replacement require a new instance.
Overlapping operations on the same search are rejected. After a failed or canceled
operation, close and recreate the instance if its native state is unavailable.

Before session creation, tuning getters read a temporary native generator without
changing the cover or running search. After creation they query the bound native
generator and apply pending setters. Operations capture settings before awaiting
and forward native setters directly.
Lagrangian factor is stored/read by the native API but is currently unused by
its search implementation. The TypeScript getter/setter names follow C++; the
upstream Python binding accidentally swaps the Lagrangian-factor names.

Model and solution proto conversion is
object-based through the model and invariant methods; native filesystem helpers
are not exposed.

## Model statistics

Model distribution queries use native OR-Tools and are awaitable under their ordinary names:
`computeCostStats(options?)`, `computeRowStats(options?)`, `computeColumnStats(options?)`,
`computeRowDeciles(options?)` and `computeColumnDeciles(options?)`. They accept the usual
executor, signal and event options and snapshot the model before execution.

```ts
const stats = await model.computeCostStats({ executor: 'worker' });
console.log(stats.mean, stats.stddev, stats.iqr);
const columnDeciles = await model.computeColumnDeciles({ executor: 'worker' });
```

`SetCoverModelStats` contains `min`, `max`, `median`, `mean`, `stddev` and `iqr`
(interquartile range). Native standard deviation excludes zero samples, while the
other statistics retain them. Nonfinite native results are preserved. Deciles use
the native ten-entry vector, including its initial zero and integer step; column
queries use actual column sizes. The upstream Python binding accidentally uses rows
for column deciles; this API follows the native column method. Empty samples reject
because the native routines assume nonempty vectors. Diagnostic formatting remains
a TypeScript convenience through `toString()` and `toVerboseString()`, including
`iqr`.

## MIP and LP steps

`SetCover.solveMip(model, options?)` calls native `SetCoverMip::NextSolution()`
with SCIP, loading the existing MPSolver WASM runtime on demand. Ordinary Set Cover
heuristics keep their lightweight runtime. It returns `{ subproblemStatus, nextSolution, cover }`, where `cover`
is an owned `SetCoverResult`. `SetCover.solveLpRelaxation(model, options?)` calls
the same native generator with GLOP and continuous variables, returning
`{ subproblemStatus, nextSolution, objectiveValue, statistics }`. Upstream does
not expose fractional variable values; the relaxation result is not a cover.

```ts
const integer = await SetCover.solveMip(model, { executor: 'worker' });
console.log(SetCoverMipStatus[integer.subproblemStatus], integer.cover.hasSolution);
const relaxation = await SetCover.solveLpRelaxation(model, { executor: 'worker' });
console.log(relaxation.objectiveValue);
```

Both accept `initialSelectedSubsets`, a `focus` list of distinct subset indices,
and the usual executor, signal and event options. The initial selection is native
generator state, not a solver hint. Omitted focus means all subsets;
`[]` means none. Inputs are snapshotted, and the model and caller selection are
unchanged. Native integer search only **adds** selections: a redundant seed may
remain more expensive than an optimal unseeded cover even with `OPTIMAL`
`subproblemStatus`. Inspect `cover.hasSolution` separately: native focused
subproblems omit elements absent from the focus and can leave the full model
uncovered. The LP objective excludes selected costs outside the focus and is not
a full-model bound in that case. `nextSolution` forwards the native Boolean;
always inspect `subproblemStatus` (`SetCoverMipStatus`) before interpreting it or
the objective. `objectiveValue` is null if native execution reported no relaxation.
The other status values are `FEASIBLE`, `INFEASIBLE`, `UNBOUNDED`, `ABNORMAL`,
`MODEL_INVALID` and `NOT_SOLVED`. `SetCoverMipOptions` is shared by both methods.
Their result types are `SetCoverMipResult` and `SetCoverLpResult`.

`timeLimitSeconds` must be finite, non-negative and representable as int64
milliseconds. It defaults to zero (unlimited); native truncation means values
below one millisecond also become unlimited. These calls do not accept iteration
limits or additional backend configuration. Cancellation follows the executor's
existing behavior. Server cancellation interrupts the generator's internal native
MPSolver and releases job capacity when that solve stops.

## CFT and Lagrangian bounds

`SetCover.solveCft(model, options?)` calls native `scp::RunCftHeuristic()` on a
full-model submodel and returns `{ cover, dual }`. The owned `cover` is a
`SetCoverResult`. `dual` contains `lowerBound`, `reducedCosts` indexed by subset,
and `multipliers` indexed by element. Model/proto imports use the same operation.
Inputs are snapshotted and the caller's model is unchanged.

```ts
const cft = await SetCover.solveCft(model, {
  executor: 'worker', initialSelectedSubsets: previousCover.selectedSubsets(),
});
console.log(cft.cover.hasSolution, cft.cover.selectedSubsets(), cft.dual.lowerBound);
```

CFT requires a nonempty, coverable model with finite non-negative costs and
nonempty subsets. It retains native stopping rules, including the fixed `.999`
gap threshold, and native timing
output. It is a heuristic: fractional costs are accepted, but no exactness or
requested gap guarantee is implied.

`initialSelectedSubsets` optionally supplies a complete incumbent cover; omission
uses native initialization. Incomplete covers reject, repeated indices select
the subset once, and input selections are copied before execution. Native CFT
may replace the incumbent; these selections are not fixed. Other options are
the usual executor, signal and event options; upstream exposes no time-limit or
interruption hook. Native timing counters are not exposed, so `cover.statistics` is null.

`await model.computeLagrangianLowerBound(upperBound, options?)` returns an owned
`{ lowerBound, reducedCosts, multipliers }` snapshot from native
`SetCoverLagrangian::ComputeLowerBound()`. Supply a valid finite cover-cost upper
bound, such as the cost of a feasible greedy cover. The model must be nonempty,
coverable and have non-negative costs. Arrays use subset and element indices.
Model/proto imports work with the same operation; the bridge also exposes the
request and response schemas. This operation does not select or modify a cover.

```ts
const bounds = await model.computeLagrangianLowerBound(result.cost, { executor: 'worker' });
console.log(bounds.lowerBound, result.cost);
```

The pinned native implementation runs 1,000 iterations with one native worker;
there are no iteration or time-limit options. Returned vectors are native iteration
state, not certificates for the best retained bound. Native nonfinite values
(including NaN when the subgradient vanishes) are preserved.

Set Cover uses one native worker. Worker cancellation terminates and recreates the
worker because the native heuristic has no interruption hook. Direct native
search cannot be interrupted. Concurrent searches sharing an invariant reject
with the exported `RuntimeError`. The singleton direct and worker executors also
reject overlapping jobs.
