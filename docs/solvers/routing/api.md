# Routing API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/routing.ts).

[Installation, quick start and examples](README.md).

In this reference: [model and assignment workflows](#routingmodel),
[variables](#routing-variable-handles), [fleet and visit types](#routing-fleet-groups-and-visit-types),
[pickup/delivery](#pickupdelivery-alternatives-and-ride-limits),
[constraints](#routing-solver-constraints), [dimensions and breaks](#routingdimension),
[nonlinear expressions](#routing-native-nonlinear-expressions),
[resources](#routing-resource-groups), [inspection and callbacks](#routing-inspection-and-whole-route-callbacks),
[assignment values](#assignment) and [parameters](#routing-parameters-and-enums).

Import:

```ts
import {
  Assignment,
  asNumber,
  BoundCost,
  defaultRoutingModelParameters,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  RoutingSearchStatus,
  defaultRoutingSearchParameters,
  FirstSolutionStrategy,
} from 'or-tools-wasm/routing';
```

Routing models are constructed synchronously. The WebAssembly runtime is loaded
lazily when a solve starts:

```ts
const manager = new RoutingIndexManager(distanceMatrix.length, 1, 0);
const routing = new RoutingModel(manager);
const transit = routing.registerTransitCallback((from, to) => {
  return distanceMatrix[manager.indexToNode(from)][manager.indexToNode(to)];
});
routing.setArcCostEvaluatorOfAllVehicles(transit);

const result = await routing.solve({
  firstSolutionStrategy: FirstSolutionStrategy.PATH_CHEAPEST_ARC,
  executor: 'worker',
});
const assignment = result.assignment;
const objective = assignment ? asNumber(assignment.objectiveValue()) : null;
```

The Routing API is a high-level wrapper around the compiled OR-Tools Routing
runtime. Public methods use camelCase while preserving the corresponding Python
Routing concepts.

`solve(options)` takes search and execution settings in one object. Its
`RoutingResult` snapshots the status, optional `Assignment`, native
`localSearchProfile`, `automaticFirstSolutionStrategy`, collected assignments,
search statistics and the search lower bound for that solve.
Absent diagnostics are `null`. Assignment-returning methods capture
`localSearchProfile` and `automaticFirstSolutionStrategy` on the assignment.
Use `RoutingResult` for collected assignments, search statistics and bounds.
Assignments and dimensions are obtained from the model. Their constructors are private.
Read `result.assignment` when `result.hasSolution` is true. The specialized
`solveWithParameters()` method
continues to return `Assignment | null`.
`solveFromAssignmentWithParameters()` accepts execution options containing
`executor`, `signal`, and `onEvent`. Use the worker executor for cancellation;
it interrupts the native Routing search and remains reusable afterward. Direct
execution cannot stop native work already in progress. `onEvent` reports the
shared job lifecycle and native `solution` events with `objectiveValue` and
`unchecked`. `addAtSolutionCallback(callback, trackUncheckedNeighbors?)` receives
the native solution event (`objectiveValue`, `solutionCount`, `unchecked`); pass `trackUncheckedNeighbors: true` in solve
options to include unchecked neighbors in `onEvent`. These notifications expose
the objective, not a complete intermediate assignment.

`RoutingSolveOptions` combines native search fields with `executor`, `signal`,
`onEvent` and `trackUncheckedNeighbors`. Most inspection methods instead accept
`RoutingDomainOptions`, containing only `executor` and `signal`. Methods that
explicitly accept search parameters, such as optimizer inspection, use those
parameters for native closure as well as the thread budget.

Each execution captures the model, search parameters, registered callbacks and
matching resource demand before awaiting. Later edits affect later requests.
Inspections construct fresh native models and can sample transit callbacks,
so they are not cached metadata reads. Routing defaults to one CP-SAT worker.
Explicit primary and secondary demands reserve their maximum. If any requests
zero/automatic workers, allocation remains automatic and subject to executor
capacity. The same rules apply to solving and parameterized inspection.

Transit evaluators, state-dependent transit functions, pickup/delivery limits,
sibling predicates and whole-route evaluators must return synchronously.
Promise/thenable results reject without leaking an unhandled rejection.
Registered solution and search-entry callbacks are asynchronous event observers,
as is `onEvent`. Use pure, repeatable evaluators because sampling and native
search can invoke them many times.

## `RoutingIndexManager`

Constructors:

```ts
new RoutingIndexManager(numLocations, numVehicles, depot)
new RoutingIndexManager(numLocations, numVehicles, starts, ends)
```

Methods:

- `indexToNode(index): number`
- `nodeToIndex(node): number`
- `getNumberOfNodes(): number`
- `getNumberOfVehicles(): number`
- `getNumberOfIndices(): number`
- `getStartIndex(vehicle): number`
- `getEndIndex(vehicle): number`

Properties:

- `numLocations: number`
- `numVehicles: number`
- `starts: number[]`
- `ends: number[]`
- `depot: number`

## `RoutingModel`

Construction:

```ts
const routing = new RoutingModel(manager);
```

An optional second argument accepts native `RoutingModelParameters`; see
[Routing Parameters And Enums](#routing-parameters-and-enums).

Routing quantities use `IntValue`; indexes remain checked JavaScript `number`
values. Costs, cumul values, bounds, and objective values are returned as
`bigint`.

Callbacks and costs:

- `registerTransitCallback((fromIndex, toIndex) => IntValue): number`
- `registerTransitMatrix(matrix: IntValue[][]): number`
- `registerUnaryTransitCallback((fromIndex) => IntValue): number`
- `registerUnaryTransitVector(values: IntValue[]): number`
- `setArcCostEvaluatorOfAllVehicles(evaluatorIndex): void`
- `setArcCostEvaluatorOfVehicle(evaluatorIndex, vehicle): void`
- `getArcCostForVehicle(fromIndex, toIndex, vehicle, options?): Promise<bigint>`

Dimensions:

- `addDimension(transitIndex, slackMax, capacity, fixStartCumulToZero, name): boolean`
- `addDimensionWithVehicleCapacity(transitIndex, slackMax, capacities, fixStartCumulToZero, name): boolean`
- `addDimensionWithVehicleTransits(transitIndices, slackMax, capacity, fixStartCumulToZero, name): boolean`
- `addDimensionWithVehicleTransitAndCapacity(transitIndices, slackMax, capacities, fixStartCumulToZero, name): boolean`
- `addConstantDimensionWithSlack(value, capacity, slackMax, fixStartCumulToZero, name): [number, boolean]`
- `addConstantDimension(value, capacity, fixStartCumulToZero, name): [number, boolean]`
- `addVectorDimension(values, capacity, fixStartCumulToZero, name): [number, boolean]`
- `addMatrixDimension(matrix, capacity, fixStartCumulToZero, name): [number, boolean]`
- `hasDimension(name): boolean`
- `getAllDimensionNames(): string[]`
- `getDimensions(): RoutingDimension[]`
- `getDimensionOrDie(name): RoutingDimension`

For customer time windows or vehicle start/end limits, use
`dimension.cumulVar(index).setRange(start, end)`. Waiting time is controlled with
`dimension.slackVar(index)`. See [Routing variable handles](#routing-variable-handles).

Search and assignments:

- `solve(options?): Promise<RoutingResult>`
- `solveWithParameters(parameters, options?): Promise<Assignment | null>`
- `solveFromAssignmentWithParameters(assignment, parameters, options?): Promise<Assignment | null>`
- `readAssignmentFromRoutes(routes, ignoreInactiveIndices, options?): Promise<Assignment | null>`
- `restoreAssignment(assignment, options?): Promise<Assignment | null>`
- `transferAssignmentFrom(sourceAssignment, options?): Promise<RoutingAssignmentSeed>`
- `solveFromAssignmentsWithParameters(assignments, parameters, options?): Promise<RoutingResult>`
- `fastSolveFromAssignmentWithParameters(assignment, parameters, checkSolutionInCp?, options?): Promise<RoutingResult>`
- `packCumulsOfOptimizerDimensionsFromAssignment(assignment, durationLimitSeconds, options?): Promise<RoutingPackingResult>`
- `compactAssignment(assignment, options?): Promise<Assignment | null>`
- `compactAndCheckAssignment(assignment, options?): Promise<Assignment | null>`
- `computeLowerBound(options?): Promise<bigint>`
- `setFirstSolutionHint(assignmentOrNull): void`, `getFirstSolutionHint(): Assignment | null`
- `applyLocksToAllVehicles(routes, closeRoutes, options?): Promise<boolean>`
- `inspectPreAssignment(options?): Promise<RoutingPreAssignment>`
- `status(): RoutingSearchStatus`

Route structure and model helpers:

- `start(vehicle): number`
- `end(vehicle): number`
- `isEnd(index): boolean`
- `nextVar(index): number`
- `vehicleVar(index): RoutingVehicleVar`
- `vehicles(): number`
- `addDisjunction(indices, penalty?, maxCardinality?, penaltyCostBehavior?): number`
- `addPickupAndDelivery(pickup, delivery): number` (native pair index)
- `addPickupAndDeliverySets(pickupDisjunction, deliveryDisjunction): number` (native pair index)
- `addAtSolutionCallback(callback, trackUncheckedNeighbors?): void`
- `addConstraints(...constraints: RoutingConstraint[]): void`
- `getModelParameters(): RoutingModelParameters` (copy of submitted overrides)

Pass search parameters directly to `solve(options)` or `solveWithParameters(parameters, options)`.
Each solve prepares its own native model. There is no separate model-closing
step; first-solution decision/reject counters are in `result.searchStatistics`. Route restoration
also runs native feasibility checks and returns `null` for infeasible routes.
`ignoreInactiveIndices` skips forced-inactive nodes; it does not permit omitting
mandatory visits. Await `getArcCostForVehicle(..., options)` for native costs
without running search.

`restoreAssignment(saved, options)` restores the saved native variable and break
bounds and checks feasibility; it returns a new owned assignment or `null`.
`checkIfAssignmentIsFeasible(saved, callAtSolutionMonitors = false, options)`
returns the native feasibility-check Boolean without another assignment.
Opting into monitors invokes registered solution callbacks. The native check
obeys search limits: `false` does not independently prove infeasibility.

`target.transferAssignmentFrom(sourceAssignment, options?)` forwards native
`SetAssignmentFromOtherModelAssignment()` and returns an owned
`RoutingAssignmentSeed`. The source model is known from the assignment; source
and target must have the same node count, vehicle count and ordered start/end
nodes. The seed copies successors and, when target costs are heterogeneous,
vehicle variables. `seed.value(nextIndexOrHandle)` and `seed.value(vehicleVar)`
read copied values; missing variables reject. Transfer does not copy schedules,
resources or breaks, check feasibility, or evaluate a target objective.

```ts
const seed = await target.transferAssignmentFrom(sourceAssignment, { executor: 'worker' });
const answer = await target.solveFromAssignmentWithParameters(seed, parameters, { executor: 'worker' });
if (answer) console.log(answer.objectiveValue());
```

Ordinary/multiple warm starts, `restoreAssignment()` and
`checkIfAssignmentIsFeasible()` accept either a full `Assignment` or a seed
owned by that target. Restoration returns a full assignment or `null` under the
target's constraints. Fast solving, packing, compaction and first-solution hints
require a full assignment; restore the seed explicitly before using those calls.
Native fast solving can otherwise return a partial route-only result.

`solve()` also returns `collectedAssignments` in native worst-to-best order,
with the best assignment last, according to `numberOfSolutionsToCollect`.
Each entry is a complete owned snapshot; single-solution collection reuses the
returned best snapshot. `useIteratedLocalSearch` selects native
ILS and requires an explicit native ruin strategy. ILS rejects initial
assignments and collection counts above one; it does not support those workflows.

`solveFromAssignmentsWithParameters(assignments, parameters, options)` returns a
`RoutingResult`: native tries the candidates in order until one succeeds.
`fastSolveFromAssignmentWithParameters(assignment, parameters, checkSolutionInCp,
options)` also returns a `RoutingResult` and supports only GREEDY_DESCENT or
AUTOMATIC. CP checking defaults to true; a failed check preserves the native
failure status and returns no assignment. Disabling it returns an unchecked
native candidate.

`packCumulsOfOptimizerDimensionsFromAssignment(assignment, durationLimitSeconds,
options)` returns `{ assignment, timeLimitReached }`. Native packing keeps routes
fixed, minimizes optimizer-dimension costs, then ends, then maximizes starts.
Without eligible optimizers it preserves the assignment. Nonpositive duration
also preserves it and sets the limit flag; packing failure returns null.
Positive infinity forwards native unlimited packing.
Await `hasGlobalCumulOptimizer(name, options)`, `hasLocalCumulOptimizer(name,
options)`, `getDimensionsWithGlobalCumulOptimizers(options)` or
`getDimensionsWithLocalCumulOptimizers(options)` to inspect the native optimizer
configuration. Lists contain ordinary `RoutingDimension` handles. These queries
close a fresh native model with the search parameters in `options`; use the same
parameters as packing to inspect which dimensions it can affect.
`compactAssignment()` and `compactAndCheckAssignment()` return owned assignments
or null under native cost/vehicle restrictions; the latter validates the output.

`computeLowerBound(options)` explicitly computes the native assignment bound.
Unsupported disjunctions or heterogeneous costs return `0n`.
`RoutingResult.objectiveLowerBound` is the separate bound obtained during search;
its native unset sentinel is `-9223372036854775808n`.
`RoutingSearchStatistics` carries five exact bigint counters:
`numCpSatCallsInLpScheduling`, `numGlopCallsInLpScheduling`, `numMinCostFlowCalls`,
`numCpSatCallsInRouting` and `numGeneralizedCpSatCallsInRouting`. It also contains
`numDecisionsInFirstSolution` and `numRejectsInFirstSolution` from the solve's actual
search parameters. These two counters are `null` when native validation prevents
initialization; native strategies without a filtered first-solution builder return zero.

`await model.getFirstMatchingPickupDeliverySibling(index, predicate, options)` returns
an opposite-side pickup/delivery alternative or `null`. Native code chooses the
candidate order and stops at the first match. The synchronous predicate must return
a Boolean; thrown errors reject the query. Unpaired visits return `null` without
calling it. A node classified as both pickup and delivery is outside this native
method's contract and rejects. The predicate belongs only to this query.

Await `getPerfectBinaryDisjunctions()`, `getNumOfSingletonNodes()`,
`isVehicleAllowedForIndex(vehicle, index)` and `getArcCostForFirstSolution(from, to)`
for native inspection. Eligibility reports the explicit allowed-vehicle list, not
complete feasibility. First-solution arc costs retain native vehicle-zero cost semantics
and the int64-maximum sentinel discouraging route closure. Returned arrays are owned
snapshots; inspection does not close the TypeScript builder.
The unsupported zero and unset sentinel do not establish optimality.

`setFirstSolutionEvaluator(evaluatorIndex)` selects a registered transit evaluator
for `EVALUATOR_STRATEGY`; it ranks first-solution arcs independently of objective
arc costs. `setPrimaryConstrainedDimension(name)` selects the dimension used by
`PATH_MOST_CONSTRAINED_ARC` when comparing destination bounds. The name must exist;
`''` clears it. `getPrimaryConstrainedDimension()` returns that configured name.

`setSecondaryModel(secondary: RoutingModel | null, parameters?: RoutingSearchParameters): void`
configures native partial-route reoptimization while building a first solution.
Set `firstSolutionOptimizationPeriod` on the primary solve and use
`LOCAL_CHEAPEST_INSERTION` or `LOCAL_CHEAPEST_COST_INSERTION`. Period zero leaves
the hook inactive; positive periods preserve native call-count semantics.

The secondary model must have the same index-manager layout (locations,
vehicles, starts and ends). Its own costs and constraints are replayed separately.
Its parameters are copied by the setter; both models and their callbacks are
captured when an execution starts. `null` clears the configuration. Secondary
chains must be acyclic. Direct, worker and server execution keep every native
model alive through the solve and destroy primaries before their secondaries.

Native secondary search uses unchecked `FastSolveFromAssignmentWithParameters()`;
its metaheuristic must be `GREEDY_DESCENT` or `AUTOMATIC`. It does not run ordinary
entry/solution monitors or return a separate checked solution. Whole-route
callbacks on either model reject for this combined workflow: native route
rejection can throw `bad_optional_access` and leave an active CP search.
Transit evaluators and ordinary search events remain available.
The secondary model must have homogeneous
vehicle costs: native secondary assignments contain only next variables, while
heterogeneous-cost operators require additional vehicle variables. This unsupported
combination rejects before search. Cancellation signals reach both models; the
unchecked native search's own limits govern when it returns. Thread admission
reserves the maximum demand across the sequential models.
The secondary time limit is native and independent of the primary limit; supply
a finite secondary limit when needed. No wrapper search, feasibility repair or
cached secondary answer is added.

```ts
routing.setSecondaryModel(secondary, {
  localSearchMetaheuristic: LocalSearchMetaheuristic.GREEDY_DESCENT,
  timeLimit: { nanos: 50_000_000 },
});
const result = await routing.solve({
  executor: 'worker',
  firstSolutionStrategy: FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION,
  firstSolutionOptimizationPeriod: 1,
});
```

`solveFromAssignmentWithParameters(saved, parameters, options)` uses those bounds
as the initial native assignment for optimization. Saved assignments must belong
to the same model and remain readable after subsequent solves or model edits.
Native restoration checks model constraints, while route locks form the search
preassignment. Restoring a saved assignment does not enforce those locks; a warm
search can return `null` when its initial assignment conflicts with them.

```ts
const saved = (await routing.solve({ executor: 'worker' })).assignment;
if (saved) {
  const first = saved.value(routing.nextVar(routing.start(0)));
  if (!routing.isEnd(first)) {
    const applied = await routing.applyLocksToAllVehicles([[first]], false, { executor: 'worker' });
    if (applied) {
      routing.setFirstSolutionHint(saved);
      const replanned = await routing.solve({ executor: 'worker',
        firstSolutionStrategy: FirstSolutionStrategy.LOCAL_CHEAPEST_INSERTION });
      console.log(replanned.assignment?.objectiveValue());
    }
  }
}
```

Locks contain routing indices for each vehicle, excluding its start/end depots.
With `closeRoutes: false`, native search can extend each prefix. With `true`,
listed routes end at the depot and omitted nodes are deactivated; mandatory-node
feasibility is still checked during solving. Locks persist as explicit model
configuration. `applyLocksToAllVehicles([], false, options)` clears them.
The native boolean reports whether locks were applied, not solve feasibility;
native rejection can retain a partial preassignment. `inspectPreAssignment`
returns a `RoutingPreAssignment` with an owned `nextValues: ReadonlyMap<number,
number>` of bound successor arcs. Both methods accept
the usual `executor` and `signal` options.

First-solution hints are copied inputs. Native `LOCAL_CHEAPEST_INSERTION` and
`LOCAL_CHEAPEST_COST_INSERTION` consume them; hard constraints and locks take
precedence. `setFirstSolutionHint(null)` clears the hint.

`nextVar(index)` returns an opaque next-variable handle represented by the
index. Pass that value to `assignment.value(...)`. `vehicleVar(index)` returns
an opaque vehicle-variable handle for solver constraints.

`setSweepArranger(points)` supplies native `SweepArranger` coordinates for the
`SWEEP` first-solution strategy. Provide one `{ x, y }` point per routing index,
including duplicate starts and ends; map node coordinates with
`manager.indexToNode(index)`. Coordinates and offsets from point zero must fit
int32, matching native storage/arithmetic. Native Routing owns the arranger and
performs the ordering; omitting it preserves native `ROUTING_INVALID` for SWEEP.

`addOrderedActivityGroup(disjunctionIds)` forwards native ordered activation:
a later disjunction may reach its maximum cardinality only when the preceding
one does. This controls activation, not visit order. Empty/singleton groups are
native no-ops. `getOrderedActivityGroups()` returns owned configured ID arrays.

Native Routing inspection methods return promises and accept `{ executor, signal }`:

- Cost classes: `getCostClassesCount()`, `getNonZeroCostClassesCount()`,
  `getCostClassIndexOfVehicle(vehicle)`, `hasVehicleWithCostClassIndex(costClass)`,
  `costsAreHomogeneousAcrossVehicles()` and `getArcCostForClass(from, to, costClass)`.
- Vehicle equivalence: `getVehicleClassIndexOfVehicle(vehicle)`,
  `getVehicleClassesCount()` and `getVehicleOfClass(vehicleClass)` (returns `-1`
  when no representative exists).
- Vehicle relationships: `getSameVehicleIndicesOfIndex(index)` and
  `getVehiclesOfSameClass(startEndIndex)` return owned index arrays;
  `getSameVehicleClassArcs(from, to)` returns `[from, to][]` tuples.
- Node precedences: `getTopologicallySortedNodePrecedences()` returns owned
  `number[][][]` arrays: dimensions with precedences, then layers, then indices.
- Visit relationships: `getVisitTypeComponents()` and
  `getTopologicallySortedVisitTypes()` return owned `number[][]` arrays.
- Penalties: `unperformedPenalty(index)` and
  `unperformedPenaltyOrValue(defaultValue, index)`.
- Dimensions: `getUnaryDimensions()`, `getDimensionsWithSoftOrSpanCosts()` and
  `dimension.isUnary()`.

Class IDs/counts are numbers; costs and penalties are exact `bigint` values.
The reserved zero cost class is included in the total count and may have no
vehicle. Its arc cost can still include a vehicle fixed cost. These are native
cost classes, distinct from vehicle equivalence classes and dimension evaluator
classes. IDs describe the submitted model; edits can change its classification.
An end index cannot start a non-self arc.
Vehicle and visit-type queries close the submitted native model. Component
arrays retain native empty groups; topological groups retain native ordering
and include only types participating in requirements. With no requirements,
both results are empty; cyclic requirements also produce an empty topological
result. These methods do not group vehicles or sort visit types in TypeScript.
Same-vehicle groups come from native inspection of vehicle-variable equalities;
end indices cannot query those groups. Equivalent-vehicle lookup requires a
start/end index. Equivalent arcs expand start or end arcs across native vehicle
classes; an ordinary customer arc returns itself. For start-to-end inputs, native
expansion pairs each equivalent vehicle with its own end. These are metadata
queries, not arc-feasibility checks. Node-precedence results retain native
dimension order, omit dimensions without precedences, preserve native ordering
within layers and retain an empty slot for a cyclic dimension. No JS graph
reconstruction or sorting is performed.

Penalty queries preserve native semantics: forced-active nodes return
`9223372036854775807n`; nodes without a well-defined single-disjunction penalty
return zero or the supplied default. Overlapping penalties are not aggregated.
Dimension lists are owned arrays of model dimension handles, in native order;
each handle exposes its readonly `name`.
Unary classification uses evaluator registration, even when a binary evaluator
returns the same values. The native soft/span filter checks vehicle span
coefficients and soft cumul bounds; it does not list every dimension with costs
(for example, global-span-only and piecewise-only dimensions are excluded).

`setTabuVars(variables)` selects existing variable handles for native
`GENERIC_TABU_SEARCH`, for example `routing.nextVarHandle(index)`. The native
callback returns the selected native variables; search stays entirely native.
The list is copied, including an explicitly empty list. Pass `null` to restore
the native default objective variable. Selection does not affect ordinary
`TABU_SEARCH` or other metaheuristics. As required by native tabu search, selected
variables must be bound at solutions; configuring the list adds no finalizers.

## Routing variable handles

`vehicleVar(index)`, `activeVar(index)` and `nextVarHandle(index)` provide handles
for vehicle membership, presence and successors. `activeVehicleVar(vehicle)`
and `vehicleRouteConsideredVar(vehicle)` use vehicle IDs. Dimension cumul handles
include ends; slack, transit, fixed-transit, active and successor handles exclude ends.
The numeric `nextVar(index)` remains available for assignment reads and finalizers.

All handles support synchronous domain mutations:

- `setMin(value)`, `setMax(value)`, `setRange(lower, upper)`
- `setValue(value)`, `setValues(values)`
- `removeValue(value)`, `removeValues(values)`, `removeInterval(lower, upper)`

Mutations intersect the native domain and accept exact int64 values. Empty-domain
mutations may fail during native model construction. To express infeasibility
as a search constraint, use `routing.addConstraints(...)`.

`await handle.domain({ executor, signal })` returns pre-search native `min`,
`max`, `size` and `bound`. Individual `min`, `max`, `size`, `bound`,
`contains(value)` and `value` queries are also awaitable; `value()` requires a
bound variable. Queries preserve the last solve result. Use assignment reads for
solved bounds rather than these construction-domain queries.

Handles and `RoutingLinearExpr` support `add`, `sub`, scalar `mul`, `neg` and
comparisons `eq`, `ne`, `le`, `ge`, `lt`, `gt`. Operands must belong to the same
model. Add comparisons through `routing.addConstraints(...)`:

```ts
const arrival = time.cumulVar(customer);
arrival.setRange(10, 30);
routing.addConstraints(arrival.add(time.slackVar(customer).mul(2)).le(40));
```

The equivalent model-level domain methods are
`setVariableRange(variable, lower, upper)`, `setVariableValues(variable, values)`,
`removeVariableValues(variable, values)` and
`removeVariableInterval(variable, lower, upper)`. `setNextValue(index, successor)`
and `setNextValues(index, successors)` restrict successor indices. End indices
have no successor variable. A self-successor represents an unperformed visit.
`inspectVariableDomain(variable, options?, containsValue?)` returns the same
`RoutingVariableDomain` snapshot as `handle.domain()`, with optional `contains`.
Bounds and size in this snapshot are bigint, even for index-valued variables.

`RoutingLinearExpr.from(value)` accepts a variable, expression or integer constant.
Its read-only `terms` contain variable/coefficient pairs and its `offset` is bigint.

All six native finalizers accept a handle or numeric `nextVar`:

- `addVariableMinimizedByFinalizer(variable)`
- `addVariableMaximizedByFinalizer(variable)`
- `addVariableTargetToFinalizer(variable, target)`
- `addWeightedVariableMinimizedByFinalizer(variable, weight)`
- `addWeightedVariableMaximizedByFinalizer(variable, weight)`
- `addWeightedVariableTargetToFinalizer(variable, target, weight)`

Higher weights have higher priority.
Finalizers select feasible values after choosing a route; they do not change
the route objective or override constraints.

## Routing fleet, groups and visit types

| Purpose | Methods |
| --- | --- |
| Fleet usage | `setMaximumNumberOfActiveVehicles(count)`, `getMaximumNumberOfActiveVehicles()` |
| Fixed costs | `setFixedCostOfVehicle(cost, vehicle)`, `setFixedCostOfAllVehicles(cost)`, `getFixedCostOfVehicle(vehicle)` |
| Amortized costs | `setAmortizedCostFactorsOfVehicle(linear, quadratic, vehicle)`, `setAmortizedCostFactorsOfAllVehicles(linear, quadratic)`, `getAmortizedLinearCostFactorOfVehicles()`, `getAmortizedQuadraticCostFactorOfVehicles()` |
| Empty routes | `setVehicleUsedWhenEmpty(isUsed, vehicle)`, `isVehicleUsedWhenEmpty(vehicle)` |
| Vehicle eligibility | `setAllowedVehiclesForIndex(vehicleIds, index)`; an empty list permits all vehicles |
| Same-vehicle penalty | `addSoftSameVehicleConstraint(indices, cost)`, `getNumberOfSoftSameVehicleConstraints()`, `getSoftSameVehicleIndices(id)`, `getSoftSameVehicleCost(id)` |
| Pair ordering | `setPickupAndDeliveryPolicyOfVehicle(policy, vehicle)`, `setPickupAndDeliveryPolicyOfAllVehicles(policy)`, `getPickupAndDeliveryPolicyOfVehicle(vehicle)` |

Fixed costs apply to nonempty routes. Amortized costs add
`linear - quadratic * customerCount²` per nonempty route. Empty-route usage
controls arc/dimension costs, not fixed/amortized costs or active-vehicle slots.
Costs and factors must be nonnegative int64 values. Optional nodes may still be
dropped when restricting vehicle eligibility.

Disjunction cardinality defaults to one. Negative or omitted penalties require
exactly that cardinality; nonnegative penalties allow fewer visits.
`PenaltyCostBehavior.PENALIZE_ONCE` is the default; `PENALIZE_PER_INACTIVE`
charges for each missing visit. Starts and ends cannot join disjunctions.
Inspect configuration with `getDisjunctionIndices(nodeIndex)`,
`getDisjunctionPenalty(id)`, `await getDisjunctionMaxCardinality(id, options?)`,
`getDisjunctionPenaltyCostBehavior(id)`, `getNumberOfDisjunctions()`,
`hasMandatoryDisjunctions()` and `await hasMaxCardinalityConstrainedDisjunctions(options?)`.
`hasMandatoryDisjunctions()` checks the native `-1` sentinel.

`ignoreDisjunctionsAlreadyForcedToZero()` explicitly forwards the native operation
at that point in model construction, before native closure. For each existing
disjunction whose active variables already have maximum zero, it sets maximum
cardinality to zero, preserving its penalty and cost behavior. This can remove
drop penalties or a mandatory cardinality requirement. It does not propagate
constraints, affect disjunctions added later, or reconsider later domain changes.
Ordinary solves never apply it automatically.

```ts
const id = routing.addDisjunction([1, 2], 50);
routing.activeVar(1).setValue(0);
routing.activeVar(2).setValue(0);
routing.ignoreDisjunctionsAlreadyForcedToZero();
const cardinality = await routing.getDisjunctionMaxCardinality(id, { executor: 'worker' }); // 0n
```

The two cardinality getters now return promises and accept executor/cancellation
options. They inspect native snapshots, so they include this operation's effects;
they do not close the editable TypeScript builder.

`setVisitType(index, type, policy)` assigns a `VisitTypePolicy`; type `-1` clears
it. Set types before registering incompatibilities or requirements:

- `addHardTypeIncompatibility(type1, type2)` forbids sharing a route.
- `addTemporalTypeIncompatibility(type1, type2)` forbids simultaneous presence.
- `addSameVehicleRequiredTypeAlternatives(dependentType, alternatives)` requires
  a provider anywhere on the same route.
- `addRequiredTypeAlternativesWhenAddingType(dependentType, alternatives)` and
  `addRequiredTypeAlternativesWhenRemovingType(dependentType, alternatives)`
  require a provider present at that visit according to the native visit policy.

Each requirement call needs one of its alternatives; multiple calls must all
hold. Empty alternatives make matching visits infeasible. Native requirement
cycles are unsupported. Optional visits can be dropped.

Configuration getters include `getVisitType`, `getVisitTypePolicy`,
`getNumberOfVisitTypes`,
`getHardTypeIncompatibilitiesOfType`, `getTemporalTypeIncompatibilitiesOfType`,
`getSameVehicleRequiredTypeAlternativesOfType`,
`getRequiredTypeAlternativesWhenAddingType`,
`getRequiredTypeAlternativesWhenRemovingType`, `hasHardTypeIncompatibilities`,
`hasTemporalTypeIncompatibilities`, `hasSameVehicleTypeRequirements`,
`hasTemporalTypeRequirements` and `hasTypeRegulations`. Returned arrays are
independent snapshots. Native empty requirements do not set the inspection flags.

`await getSingleNodesOfType(type, options?)` and
`await getPairIndicesOfType(type, options?)` query a fresh closed native model,
accepting `{ executor, signal }`. These formerly synchronous methods now return
promises. Singleton lists contain routing indices; pair lists contain native
pair IDs, including pickup/delivery sets and subsequent ordinary pairs. Arrays
are independent and retain native node-scan order.

## Pickup/delivery alternatives and ride limits

Pair builders return the native pair index, shared by singleton pairs and
alternative sets. Set builders take disjunction IDs from the same model;
use cardinality-one disjunctions to choose one pickup and one delivery.
Each routing index must belong to at most one pickup/delivery pair, as required
by the native pair-limit API.

```ts
const pickup = routing.addDisjunction([pickupA, pickupB]);
const delivery = routing.addDisjunction([deliveryA, deliveryB]);
const pair = routing.addPickupAndDeliverySets(pickup, delivery);
const time = routing.getDimensionOrDie('time');
time.setPickupToDeliveryLimitFunctionForPair(
  (pickupAlternative, deliveryAlternative) => pickupAlternative === deliveryAlternative ? 30 : 45,
  pair,
);
const result = await routing.solve({ executor: 'worker',
  firstSolutionStrategy: FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION });
```

Callback arguments are zero-based positions in each alternative set, rather
than routing node indices. Each request samples their finite combination table
and copies exact int64 limits into the native callback. Replacing the function
changes subsequent requests; `hasPickupToDeliveryLimits()` reports configured
limits on the dimension. Await
`getPickupToDeliveryLimitForPair(pairIndex, pickupAlternativeIndex, deliveryAlternativeIndex, options?)`
to read an exact `bigint` limit; an unset pair returns native `INT64_MAX`.
Limits use the dimension's units and native search
filters/scheduling. The native schedule optimizer also enforces them during
restoration. Pair metadata otherwise has the same native boundary as singleton
pickup/delivery metadata; add explicit model constraints when needed for vehicle
equality. The native CP-SAT Routing converter omits these limits, so its fallback
now declines this model family.

## Routing Solver Constraints

`routing.addConstraints(...)` accepts linear comparisons, Boolean predicates and
the following explicit vehicle/cumul comparison objects:

```ts
routing.addPickupAndDelivery(pickupIndex, deliveryIndex);

routing.addConstraints(routing.vehicleVar(pickupIndex).eq(routing.vehicleVar(deliveryIndex)));

const distance = routing.getDimensionOrDie('distance');
routing.addConstraints(distance.cumulVar(pickupIndex).le(distance.cumulVar(deliveryIndex)));
```

Linear comparisons also support conditional enforcement:

```ts
routing.addConstraints(
  time.cumulVar(pickup).lt(time.cumulVar(delivery)).onlyEnforceIf(
    routing.activeVar(pickup).eq(1),
    routing.activeVar(delivery).eq(1),
  ),
);
```

All conditions must hold to enforce the comparison. Conditions support all six
linear comparisons (`eq`, `ne`, `le`, `ge`, `lt`, `gt`) and may involve different
dimensions in the same model. Chaining `onlyEnforceIf()` adds conditions;
comparisons and condition lists are immutable. With no conditions, the comparison
is unconditional. Conditions may also be Boolean literals, native Boolean handles
or compound `RoutingBoolExpr` predicates. Comparisons used as predicates must be
unconditional comparisons.
The native solver implements the implication through reified comparisons.

`RoutingBoolExpr` composes predicates through `from(value)`, `and(...values)`,
`or(...values)` and instance `and(...)`, `or(...)`, `not()`. Operands are Boolean
literals, unconditional comparisons, reified Boolean variables, ActiveVar,
ActiveVehicleVar or VehicleRouteConsideredVar handles. Static AND/OR requires at
least one operand. Mixed models reject, and expression trees are immutable.
`comparison.asBool()` converts an unconditional comparison into a predicate.

```ts
import { RoutingBoolExpr } from 'or-tools-wasm/routing';

const eitherDelivery = RoutingBoolExpr.or(routing.activeVar(first), routing.activeVar(second));
routing.addConstraints(eitherDelivery); // Require at least one delivery.
const before = routing.reify(time.cumulVar(first).lt(time.cumulVar(second)));
const bothPresent = RoutingBoolExpr.and(routing.activeVar(first), routing.activeVar(second));
routing.addConstraints(before.eq(1).onlyEnforceIf(bothPresent));
const assignment = await routing.solveWithParameters({}, { executor: 'worker' });
if (assignment) console.log(assignment.min(before), assignment.max(before));
```

`routing.reify(predicate)` returns a `RoutingBoolVar` backed by native comparison,
minimum/maximum or negation expressions. It supports the ordinary variable-domain,
linear arithmetic/comparison and finalizer APIs. AND/OR/NOT and comparison truth
are computed by OR-Tools; TypeScript does not evaluate or simplify predicates.
`assignment.min(handle)` and `max(handle)` return native truth bounds as numbers.
`assignment.value(handle)` returns 0 or 1 when bound and rejects an unbound truth
value. Registered truths are captured for ordinary, warm and restored assignments;
older assignments remain detached after edits. Native finalizers do not override
logical constraints. Boolean-domain inspection uses the existing awaited
executor/signal convention.

`routing.addConstraints(...)` also accepts compound predicates and Boolean literals:
true is an always-satisfied native constraint, and false makes the model infeasible.
Unsupported constraint objects throw immediately.

`setPathEnergyCostOfVehicle(force, distance, costPerUnit, vehicle)` adds native
energy costs for two existing dimensions: the sum of
`force.CumulVar(Next(i)) × distance.TransitVar(i)` along a route, multiplied by
the rate. `setPathEnergyCostsOfVehicle(force, distance, threshold, costBelow,
costAbove, vehicle)` splits the force at a threshold and applies the two rates.
Thresholds/rates accept exact nonnegative `bigint` values. Setting both rates
to zero follows the native no-op behavior; it does not clear an earlier cost.
The force dimension requires a native unary evaluator; use a registered unary
callback/vector or a constant/vector dimension. Binary force evaluators reject.

`addSameActivityGroup(indices)` makes the stops serve or drop together through
native active-variable equality. Overlapping groups can merge. It does not
require the stops to share a vehicle or visit order. To allow dropping, configure
the corresponding disjunctions. `await inspectActivityGroups({ executor,
signal })` returns native group IDs by routing index in `groups` and member
indices by group ID in `members`. Inspection closes a temporary native model
without searching; its arrays are independent snapshots.

`registerStateDependentTransitCallback((fromIndex, toIndex) => ({ x, y }),
{ domainStart, domainEnd })` registers per-arc piecewise-linear functions for
native cumul-dependent travel/consumption. The domain is half-open; x anchors
must strictly increase and cover that domain. Native interpolation and rounding
use OR-Tools' `FloatSlopePiecewiseLinearFunction`. x values are nonnegative
int32 values; y anchors must be safe integers, including when passed as `bigint`.

`addDimensionDependentDimensionWithVehicleCapacity(fixedEvaluators,
dependentEvaluators, baseDimension, slackMax, capacities, fixStartCumulToZero,
name)` adds fixed plus dependent transit. Pass `null` to depend on the new
dimension's own departure cumul, or an existing dimension name to depend on
that dimension. All evaluator/capacity arrays have one entry per vehicle. Every
dependent domain must cover all possible base cumuls; for self-dependence it
must cover zero through the largest vehicle capacity. Domains satisfy
`0 <= domainStart < domainEnd <= 2147483647`. Native caching uses memory
proportional to arc count times domain width, so use a bounded planning horizon.
Callbacks are sampled when the dimension is added, and their anchors are copied
for use by every executor. The example site demonstrates peak traffic delays.

## `RoutingDimension`

Driver breaks use native fixed-duration intervals owned by the routing model.
`addBreakInterval(options: RoutingBreakIntervalOptions)` returns a
`RoutingBreakInterval` with read-only `index`, `name`, `startMin`, `startMax`,
`duration`, `optional` and owning `model`. These are configured bounds. Read
solved bounds through `assignment.breakInterval(interval)`.

```ts
const rest = routing.addBreakInterval({
  startMin: 60, startMax: 90, duration: 15, name: 'driver rest',
});
const time = routing.getDimensionOrDie('Time');
time.setBreakIntervalsOfVehicle([rest], 0);
time.setBreakDistanceDurationOfVehicle(120, 15, 0);
// After solving:
const scheduled = result.assignment?.breakInterval(rest);
```

`optional: true` allows an interval to be skipped. The assignment snapshot
reports `performed` (`true`, `false` or `null` for an unfixed native interval)
and native `startMin`/`startMax`/`endMin`/`endMax`; unperformed intervals have no
time fields. Earlier snapshots survive later solves. Interval windows and
durations accept exact `bigint` values and belong to the model that created them.

Breaks can interrupt travel and consume slack, but cannot overlap service time.
Break intervals and distance/duration rules on state-dependent dimensions reject
as unsupported because native break propagation omits dependent transit.
Pass `{ preTravelEvaluator, postTravelEvaluator }` to
`setBreakIntervalsOfVehicle` for registered evaluators defining those exclusions;
omitted evaluators or `-1` mean zero. The distance/duration rule uses the
dimension's units and the native minimum qualifying break duration. Native
semantics permit breaks before the route starts or after it ends; choose start
windows accordingly. Setters and model construction are synchronous; solves
and assignment restoration use the same direct/worker/server paths.

- `cumulVar(index): RoutingCumulVar`
- `slackVar(index): RoutingSlackVar`
- `transitVar(index): RoutingTransitVar`
- `fixedTransitVar(index): RoutingFixedTransitVar`
- `hasSoftSpanUpperBounds(): boolean`
- `setSoftSpanUpperBoundForVehicle(boundCost, vehicle): void`
- `getSoftSpanUpperBoundForVehicle(vehicle): BoundCost`
- `hasQuadraticCostSoftSpanUpperBounds(): boolean`
- `setQuadraticCostSoftSpanUpperBoundForVehicle(boundCost, vehicle): void`
- `getQuadraticCostSoftSpanUpperBoundForVehicle(vehicle): BoundCost`

Dimension controls:

- `setCumulVarRange(index, lower, upper)`, `addNodePrecedence(first, second, offset, performedConstraint?)`
- `setSpanUpperBoundForVehicle(value, vehicle)`
- `setSpanCostCoefficientForVehicle(value, vehicle)`, `setSpanCostCoefficientForAllVehicles(value)`
- `setSlackCostCoefficientForVehicle(value, vehicle)`, `setSlackCostCoefficientForAllVehicles(value)`
- `setGlobalSpanCostCoefficient(value)`
- `getSpanUpperBoundForVehicle(vehicle)`, `getSpanCostCoefficientForVehicle(vehicle)`,
  `getSlackCostCoefficientForVehicle(vehicle)`, `globalSpanCostCoefficient()`
- `setCumulVarSoftUpperBound(index, bound, coefficient)`,
  `setCumulVarSoftLowerBound(index, bound, coefficient)`
- `hasCumulVarSoftUpperBound(index)`, `hasCumulVarSoftLowerBound(index)`
- `getCumulVarSoftUpperBound(index, options?)`, `getCumulVarSoftLowerBound(index, options?)`
- `getCumulVarSoftUpperBoundCoefficient(index)`, `getCumulVarSoftLowerBoundCoefficient(index)`

Node precedence requires `second.cumul >= first.cumul + offset` when both visits
are performed. `RoutingPrecedencePerformedConstraint` selects
`FIRST_AND_SECOND_INDEPENDENT` (default), `SECOND_IMPLIES_FIRST`,
`FIRST_IMPLIES_SECOND` or `FIRST_AND_SECOND_EQUAL`. The last three also constrain
which visits must be performed. End indices are not valid precedence nodes.

Costs and span limits are nonnegative int64 values; repeated settings replace
previous ones. Soft upper/lower penalties charge the coefficient times the
violation for performed nodes. Bound getters are awaitable native queries;
presence and coefficient getters read configuration. The model-level equivalent
is `inspectCumulSoftBound(dimensionName, index, lower, options?)`, where `lower`
selects the lower or upper soft bound. Without a soft bound,
the bound getter returns the native hard cumul bound. Soft-span getters require
the corresponding `has...()` flag; untouched vehicles then return
`BoundCost(INT64_MAX, 0)`.

`cumulVar(index)` returns a handle for domain mutations, assignment reads and
solver constraints.

## `BoundCost`

```ts
new BoundCost(bound = 0, cost = 0)
```

Fields:

- `bound: bigint`
- `cost: bigint`

## Routing native nonlinear expressions

`routing.product(left, right)`, `routing.abs(value)`, `routing.min(...values)` and
`routing.max(...values)` return `RoutingExpressionVar` handles. Operands accept
Routing variable handles, linear expressions or exact int64 constants. Minimum
and maximum require at least one operand. These methods call native `MakeProd`,
`MakeAbs`, `MakeMin` and `MakeMax`; TypeScript does not calculate results, fold
constants, linearize expressions or add solver fallbacks.

```ts
const arrivalA = time.cumulVar(first);
const arrivalB = time.cumulVar(second);
const gap = routing.abs(arrivalA.sub(arrivalB));
routing.addConstraints(gap.le(10));
const product = routing.product(arrivalA, arrivalB);
const latest = routing.max(arrivalA, arrivalB);
const nested = routing.abs(product.sub(latest));
const assignment = await routing.solveWithParameters({}, { executor: 'worker' });
if (assignment) console.log(assignment.min(nested), assignment.max(nested));
```

Handles support native domain queries/mutations, linear arithmetic/comparisons,
Boolean reification/conditional enforcement and the existing finalizers. They can
be passed as operands to another nonlinear factory. Native result bounds and
assignment values are exact `bigint`; `assignment.value(handle)` rejects an
unbound expression result, while `min`/`max` expose its native bounds. Ordinary,
warm and restored assignments capture registered expressions and preserve detached
snapshots after edits. Native int64 arithmetic and search behavior are retained;
these factories do not promise arbitrary-precision arithmetic or select a search
strategy. Foreign-model operands, invalid int64 constants and empty extrema reject.
This surface supports native Routing modeling and does not add legacy Python helpers.

## Routing resource groups

`routing.addResourceGroup()` returns a `RoutingResourceGroup`. Groups are indexed in
creation order; `getResourceGroup(index)` and `getResourceGroups()` return the registered
handles. `getDimensionResourceGroupIndices(name)` returns configured group indices for
that dimension. `getDimensionResourceGroupIndex(name)` requires exactly one group.

```ts
routing.addConstantDimension(1, 100, false, 'time');
const shifts = routing.addResourceGroup();
shifts.addResource({ startDomain: [[0, 0]], endDomain: [[2, 2]] }, 'time');
shifts.addResource({ startDomain: [[10, 10]], endDomain: [[12, 12]] }, 'time');
shifts.notifyVehicleRequiresAResource(0);
shifts.setAllowedResourcesForVehicle(0, [0, 1]);
const assignment = await routing.solveWithParameters({}, { executor: 'worker' });
if (assignment) console.log(assignment.resourceIndex(0, shifts));
```

`addResource(attributes, dimensionName)` returns its zero-based resource index.
`startDomain` and `endDomain` are arrays of `[lower, upper]` intervals accepting exact
int64 `bigint` or safe-integer `number` bounds; omitted domains allow all values.
Empty domains reject because native resource scheduling reads their extrema.
OR-Tools currently permits one affected dimension per group. Native domain
construction and resource constraints determine feasibility and assignment.

A used vehicle marked with `notifyVehicleRequiresAResource(vehicle)` receives exactly
one resource, and each resource can serve at most one requiring vehicle. Unused
vehicles consume no resource; native `setVehicleUsedWhenEmpty` semantics also apply.
`setAllowedResourcesForVehicle` requires a marked vehicle and a nonempty list of valid
resource indices. `clearAllowedResourcesForVehicle(vehicle)` allows all resources.
Configuration getters include `size()`, `vehicleRequiresAResource(vehicle)`,
`getVehiclesRequiringAResource()`, `getResourcesMarkedAllowedForVehicle(vehicle)` and
`isResourceAllowedForVehicle(resource, vehicle)`. Returned arrays are detached.

`assignment.resourceIndex(vehicle, groupOrIndex)` returns the native assigned resource,
or `-1` when none is assigned. Assignment data remains independent of later model
changes. A foreign handle, missing result data or an unbound resource assignment throws.
Native LP scheduling uses doubles; for tight bounds above JavaScript's safe-integer
range, the existing native `disableSchedulingBewareThisMayDegradePerformance: true`
option provides a CP-only scheduling path. The wrapper does not select it automatically.
`routing.resourceVar(vehicle, groupOrIndex)` returns a `RoutingResourceVar`. It uses
vehicle IDs and accepts a registered group index or handle. It supports the existing
variable domain methods, linear expressions, conditional comparisons and all six
finalizers. `assignment.value(handle)`, `min(handle)` and `max(handle)` return native
resource indices as numbers, including `-1` for no resource. Finalizer targets remain
native hints; they do not override resources already bound by native scheduling. Assignment bounds remain
independent of later model changes. Foreign model/group handles reject.

The resource handle's `resourceGroup` is the group's numeric index. Resource
inspection records use native class indices, while assignment access uses the
resource index itself.

```ts
const slot = routing.resourceVar(0, shifts);
slot.setValues([0, 1]);
routing.addConstraints(slot.eq(1));
routing.addVariableTargetToFinalizer(slot, 1);
const result = await routing.solveWithParameters({}, { executor: 'worker' });
if (result) console.log(result.value(slot));
```

Domain inspection awaits native execution. Before model closure, a newly created
resource variable has native bounds `[-1, INT64_MAX]`; resource eligibility and unused
vehicle constraints are applied at closure. Domain queries do not infer closed-model
bounds from registered resources. `await group.inspect({ executor: 'worker', signal })` returns a detached
`RoutingResourceGroupInspection` snapshot with `affectedDimensions`, `resources`
and `classes`. Each resource carries its native `classIndex` and
`dimensionAttributes`; each class carries native `resourceIndices` and class
`dimensionAttributes`. Attributes contain a dimension name and normalized
`[bigint, bigint]` interval arrays for the start and end domains, including native
default domains for unaffected dimensions.

```ts
const inspection = await shifts.inspect({ executor: 'worker' });
for (const [index, resourceClass] of inspection.classes.entries()) {
  console.log(index, resourceClass.resourceIndices, resourceClass.dimensionAttributes);
}
```

Awaited getters also include `getResources(options)`, `getResource(index, options)`,
`getResourceClassesCount(options)`, `getResourceIndicesInClass(classIndex, options)`,
`getResourceIndicesPerClass(options)`, `getResourceClassIndex(resourceIndex, options)`
and `getDimensionAttributesForClass(dimensionName, classIndex, options)`.
`routing.inspectResourceGroup(group, options?)` is the model-level equivalent
of `group.inspect(options?)`.

Each query reconstructs and closes a native model without searching; it preserves
registered builder state and existing solve results. OR-Tools computes classes from
attributes and vehicle assignability, including ResourceVar domains and allowed
resources. No class grouping happens in TypeScript. Prefer `inspect()` when reading
several fields together. Class indices describe that snapshot and may change after
model edits. Empty groups have no resources or classes. Invalid resource/class/group
indices or dimension names reject. Queries use the same executor/signal convention
as variable-domain inspection. Low-level bridge callers choose inspected dimensions
through `dimension_names`; the high-level API includes all registered dimensions.

## Routing piecewise-linear cumul costs

`dimension.setCumulVarPiecewiseLinearCost(index, segments)` forwards native
integer-slope segments: `{ pointX, pointY, slope, otherPointX }`. Each segment
anchors a line at `(pointX, pointY)` through `otherPointX`; values accept exact
int64 numbers/bigints. Native OR-Tools sorts/normalizes the segments and evaluates
the cost. Segments may share endpoints but must not overlap. Empty input rejects
at construction; overlap rejects during native execution before the fatal native
factory check. Native Routing ignores decreasing functions or costs negative at zero,
leaving any previously accepted cost intact.

`hasCumulVarPiecewiseLinearCost(index, options?)` and
`getCumulVarPiecewiseLinearCost(index, options?)` inspect native acceptance. They
are asynchronous and accept executor/signal options. The getter returns `null`
or owned native-normalized segments with bigint fields.

```ts
time.setCumulVarPiecewiseLinearCost(routing.end(0), [
  { pointX: 0, pointY: 0, slope: 0, otherPointX: 10 },
  { pointX: 10, pointY: 0, slope: 5, otherPointX: 100 },
]);
```

## Routing inspection and whole-route callbacks

`getPickupPosition(index, options?)` and `getDeliveryPosition(index, options?)`
return `{ pairIndex, alternativeIndex }` or `null` from native configuration.
`isPickup(index, options?)` and `isDelivery(index, options?)` return native
classifications. These asynchronous queries accept executor/signal options.

`dimension.inspectBreaks(vehicle, options?)` returns `hasBreakConstraints`,
owned `intervals`, exact `distanceDuration` pairs and optional
`preTravelEvaluator`/`postTravelEvaluator` handles. Dedicated getters are
`hasBreakConstraints(options?)`, `getBreakIntervalsOfVehicle(vehicle, options?)`,
`getBreakDistanceDurationOfVehicle(vehicle, options?)`,
`getPreTravelEvaluatorOfVehicle(vehicle, options?)` and
`getPostTravelEvaluatorOfVehicle(vehicle, options?)`. The vehicle getters reject
when native break configuration is uninitialized; inspection remains available.

`await model.isMatchingModel(options?)` returns native vehicle/node matching
recognition, including its unary-dimension and disjunction restrictions. False
means native detection did not qualify the model, not that matching is impossible.
`await model.areRoutesInterdependent(parameters?, options?)` returns native route
coupling for the supplied search parameters and configured resources/optimizers.
Omitted parameters use native defaults; supplied parameters also control closure.
Both are fresh native inspections and preserve existing results.

`await model.arcIsMoreConstrainedThanArc(from, to1, to2, options?)` forwards the
native preference comparison on a fresh closed model, including the configured
primary constrained dimension. Arguments are routing indices; `from` cannot be
an end index. This inspects configured domains, not a previously solved state.

`await dimension.shortestTransitionSlack(assignment, index, options?)` returns an
exact `bigint` from native `ShortestTransitionSlack()`. It restores the supplied
owned assignment in a temporary native search state. The dimension must be
self-dependent and the index must not be an end or dropped node. The current
cumul, vehicle and successor variables must be bound unless the next node is an
end, where native returns the slack's minimum. Assignments with required values
still ranged reject; the binding does not complete schedules or choose cumuls.
Route seeds require explicit restoration first. Neither query modifies results.

Dimension queries also expose `getTransitValue(from, to, vehicle, options?)`,
`getTransitValueFromClass(from, to, vehicleClass, options?)` and
`vehicleToClass(vehicle, options?)`. Class IDs belong to that dimension's transit
evaluators, distinct from model vehicle/resource classes. Exact transit values
are bigint. Queries use a fresh closed native model.

`await dimension.getNodePrecedences(options?)` returns owned records with
`first`/`second` routing indices, exact `bigint` `offset`, and
`RoutingPrecedencePerformedConstraint` `performedConstraint`.
`getTransitEvaluatorSign(vehicle, options?)` returns a promise of
`RoutingTransitEvaluatorSign` (`UNKNOWN`, `POSITIVE_OR_ZERO`, `NEGATIVE_OR_ZERO`);
`areVehicleTransitsPositive(vehicle, options?)` returns a promise of a boolean.
Both read native registered sign metadata. An unknown sign stays unknown even
when the callback's values happen to be nonnegative.

`addForbiddenIntervals(index, intervals)` forwards native `MakeNotMemberCt`
constraints for `{ start, end }` intervals. These populate the native forbidden
list during closure; direct `cumulVar.removeInterval()` domain holes do not.

`getAllowedIntervalsInRange(index, min, max, options?)` and
`getForbiddenIntervals(index, options?)` return owned `{ start, end }` bigint
intervals. `getFirstPossibleGreaterOrEqualValueForNode(index, value, options?)`
and `getLastPossibleLessOrEqualValueForNode(index, value, options?)` forward native
permitted-value queries. Their native boundary/sentinel behavior is preserved;
these are configuration queries rather than solved schedule snapshots.

`addEnterSearchCallback(callback)` registers native search-entry notifications.
The callback accepts no arguments and may return a Promise. `onEvent` listeners
also receive `{ type: 'searchEntered' }`. Native entry differs from executor
RUNNING status; model construction/closure does not fabricate it. Callback errors
reject the job through the existing event path.

`getFirstSolutionHint()` synchronously returns the explicitly configured immutable
`Assignment` or `null`. Solving does not store a last solution or create a hint.

`addRouteConstraint(evaluator, costsAreHomogeneousAcrossVehicles = false)`
forwards native C++ whole-route evaluation. The synchronous callback receives a
fresh array of Routing indices including start and end, and returns an int64
cost (`number` or `bigint`) or `null` to reject the route. Multiple evaluators add
their costs. Native search calls evaluators repeatedly; a given route must always
produce the same result. Set the homogeneity flag only when the costs are equal
for equivalent vehicle routes. Callback errors reject the job. This uses the
existing callback transport for direct, worker and server execution.

```ts
routing.addRouteConstraint(route => route.length > 8 ? null : 10n);
const result = await routing.solve({ executor: 'worker' });
```

`await routing.getRouteCost(routeIndices, options?)` evaluates the registered
whole-route callbacks through native `GetRouteCost()`, using the supplied Routing
indices exactly as given. Pass start/end indices explicitly for a complete route.
It returns their combined exact `bigint` cost, `null` if any callback rejects,
or `0n` when no evaluators exist. Native saturating int64 addition and callback
order are preserved. This is custom callback cost, not the full routing objective
or an assignment-feasibility check. Empty and repeated-index inputs reach the
callbacks unchanged; indices must belong to the model's index range. Route and
registration snapshots are captured at submission. The method accepts
`{ executor, signal }` and propagates callback errors across direct/worker/server.

## `Assignment`

- `objectiveValue(): bigint`
- `value(nextVar): number`
- `value(cumulVar): bigint`
- `min(nextVar): number`
- `min(cumulVar): bigint`
- `max(nextVar): number`
- `max(cumulVar): bigint`

For `nextVar(index)`, pass the returned value into `assignment.value()` to get
the next index. For dimensions, pass `dimension.cumulVar(index)`.

`value()`, `min()` and `max()` also accept slack, transit and fixed-transit
handles and return `bigint`. They accept `routing.activeVehicleVar(vehicle)`
or `routing.vehicleRouteConsideredVar(vehicle)` and return numeric values (0 or 1).
Vehicle, active, successor, resource and reified Boolean handles return numbers.
Cumul, slack, transit, fixed-transit and nonlinear expression handles return bigint.
These reads use captured native assignment bounds, including on warm starts and
restored routes. Waiting/transit variables
can remain unbound: `value()` returns their minimum, while `min()`/`max()` expose
the range without adding finalizers. End indices have no slack or transit handles.
Missing captured bounds and handles from another model throw. Assignments retain
their own snapshots after subsequent solves or model changes.

`vehicleRouteConsideredVar` is 1 when a vehicle route is nonempty or
`setVehicleUsedWhenEmpty(true, vehicle)` is enabled. `activeVehicleVar` remains
0 for empty routes. Both use vehicle IDs and support native domain operations,
expressions, comparisons and finalizers.

## Routing Parameters And Enums

- `defaultRoutingSearchParameters(): RoutingSearchParameters`
- `defaultRoutingModelParameters(): RoutingModelParameters`
- `BOOL_FALSE`, `BOOL_TRUE`, `BOOL_UNSPECIFIED`

`RoutingSearchParameters` and `RoutingModelParameters` cover the vendored native
protobuf fields using camelCase names. Omitted fields retain native defaults;
explicit zero/false values override them. The default factories return editable
patch objects, not complete snapshots of native defaults.

```ts
const parameters = defaultRoutingSearchParameters();
parameters.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;
parameters.localSearchMetaheuristic = LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH;
parameters.timeLimit = { seconds: 1, nanos: 0 };
parameters.localSearchOperators = { useTwoOpt: BOOL_FALSE };
const assignment = await routing.solveWithParameters(parameters, { executor: 'worker' });
```

Controls include time/solution limits, local-search operators and metaheuristics,
scheduling solvers, logging, search improvements and nested CP-SAT parameters.
Duration fields use `{ seconds, nanos }`, not milliseconds. Use
`satParameters.numWorkers` for CP-SAT workers. Operator switches accept
`BOOL_TRUE`/`BOOL_FALSE`; `BOOL_UNSPECIFIED` is invalid when explicitly overriding
an operator. Unknown fields and malformed values reject; native checks validate
parameter combinations at execution. There is no separate validation method.

Model settings such as `solverParameters.tracePropagation`,
`solverParameters.profileLocalSearch`, `reduceVehicleCostModel` and
`maxCallbackCacheSize` reach the native model. Parameter objects contain only
protobuf fields; assign `parameters.solverParameters = { profileLocalSearch: true }`
to replace nested settings. After a completed native solve,
`result.localSearchProfile` returns native profiling text; enable
`profileLocalSearch` to collect it.

Exported enums include `FirstSolutionStrategy`, `LocalSearchMetaheuristic`,
`PickupAndDeliveryPolicy`, `VisitTypePolicy`, `PenaltyCostBehavior` and the
generated parameter enums. Local search supports `AUTOMATIC`, `GREEDY_DESCENT`,
`GUIDED_LOCAL_SEARCH`, `SIMULATED_ANNEALING`, `TABU_SEARCH` and `GENERIC_TABU_SEARCH`.

`RoutingSearchStatus` contains:

- `ROUTING_NOT_SOLVED`
- `ROUTING_SUCCESS`
- `ROUTING_PARTIAL_SUCCESS_LOCAL_OPTIMUM_NOT_REACHED`
- `ROUTING_FAIL`
- `ROUTING_FAIL_TIMEOUT`
- `ROUTING_INVALID`
- `ROUTING_INFEASIBLE`
- `ROUTING_OPTIMAL`
