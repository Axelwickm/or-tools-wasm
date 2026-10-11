# TypeScript API

This page documents the public solver subpaths of `or-tools-wasm`.
The exported TypeScript declarations provide complete signatures and generated
protobuf fields; this reference covers model building, results and execution.
The package is ESM only:

```ts
import { CpSat } from 'or-tools-wasm/cp-sat';
import { RoutingIndexManager, RoutingModel } from 'or-tools-wasm/routing';
```

Most solver runtimes are loaded lazily. Browser solves use the package worker
bridge by default so the main thread stays responsive. Local browser WASM needs
cross-origin isolation headers; server-only execution does not. See
[Browser requirements](../README.md#browser-requirements).

The one-shot APIs keep inputs on the model/problem and return a result for that
particular solve. Solver settings and executor controls go in one options object:

| Solver | One-shot call | Answer |
| --- | --- | --- |
| CP-SAT | `CpSat.solve(model, options)` | `CpResult` |
| MPSolver | `MPSolver.solve(model, options)` | `MpResult` |
| Routing | `routing.solve(options)` | `RoutingResult` |
| MathOpt | `MathOpt.solve(model, options)` | `MathOptSolveResult` |
| PDLP | `Pdlp.solve(problem, options)` | `PdlpSolverResult` |
| Knapsack | `solver.solve(options)` | `KnapsackResult` |
| Network Flow | `maxFlow.solve(options)` and related classes | Flow result |
| Set Cover | `SetCover.solve(model, options)` | `SetCoverResult` |
| RCPSP | `problem.solve(options)` | `RcpspSolveResult` |

## CP-SAT

Import:

```ts
import {
  asNumber,
  CpModel,
  CpSolver,
  CpSolverSolutionCallback,
  CpSat,
  Domain,
  LinearExpr,
  sum,
  weightedSum,
  type CpModelProto,
  type SatParameters,
} from 'or-tools-wasm/cp-sat';
```

For application code, build a `CpModel`, call `CpSat.solve(model, options)`,
and read the returned `CpResult`. The Python-style `CpSolver` instance is also
supported. Call `CpSat.solveProto(bytes, options)` when you
need the byte-oriented protobuf path.

### High-Level CP-SAT

```ts
const model = new CpModel();
const x = model.newIntVar(0, 10, 'x');
const y = model.newIntVar(0, 10, 'y');

model.add(x.plus(y.times(2)).eq(14));
model.maximize(x.plus(y));

const result = await CpSat.solve(model, { numWorkers: 4 });
console.log(result.status);
console.log(result.value(x), result.value(y), result.objectiveValue);
```

The high-level CP-SAT API uses explicit expression methods because JavaScript
does not support Python-style operator overloading. For example:

- `x.plus(y.times(2)).eq(29)` instead of `x + 2 * y == 29`
- `x.le(10)`, `x.lt(10)`, `x.ge(0)`, `x.gt(0)`, `x.ne(y)`
- `x.not()` or `x.negated()` for Boolean negation

The high-level TypeScript API is camelCase-only. Python snake_case and deprecated
pre-PEP8 PascalCase spellings are intentionally not exposed; Python parity tests
exercise equivalent behavior through the canonical TypeScript names.

Integer values use the exported `IntValue = number | bigint` type. A `number`
must be a safe integer; use `bigint` outside JavaScript's safe-integer range.
Bigints may span the full signed int64 range and are encoded exactly at the
WebAssembly protobuf boundary. Unsafe integer numbers and out-of-int64 bigints
throw `RangeError` instead of being rounded. Integer expressions return `bigint`
from `result.value()` and callback `value()`; objective values and bounds remain
floating-point `number` values.

```ts
const exact = 9_007_199_254_740_993n;
const x = model.newIntVar(exact, exact, 'exact');
const result = await CpSat.solve(model);
console.log(result.value(x) === exact); // true
```

Use the exported `asNumber()` helper when ordinary number arithmetic or an API
that only accepts `number` is more convenient. It throws rather than rounding
an unsafe value:

```ts
const value = asNumber(result.value(x));
```

For JSON, either convert selected values with `asNumber()` or serialize large
values as decimal strings with a bigint-aware replacer.

Linear constraints require exact integer coefficients and bounds. Floating-point
coefficients are supported for objectives. The lower-level generated proto types
also accept protobuf int64 representations for direct serialization; those raw
representations are not high-level `IntValue` inputs.

### `CpModel`

`new CpModel(model?: CpModelProto)`

Creates a high-level model. Passing an existing proto clones it into a wrapper.

Common variable methods:

- `newIntVar(lb, ub, name?)`
- `newIntVarFromDomain(domain, name?)`
- `newBoolVar(name?)`
- `newConstant(value, name?)`
- `getIntVarFromProtoIndex(index)`
- `getBoolVarFromProtoIndex(index)`
- `getIntervalVarFromProtoIndex(index)`

Variable, interval and constraint mutation:

- `IntVar.name`, `IntervalVar.name`, `Constraint.name`: writable string properties.
- `withName(name): this` on all three handle types; `BoolVar` inherits the variable method.
- `IntVar.domain: Domain`: getter returns a detached domain; setter replaces the live domain.
- `IntVar.withDomain(domain: Domain): this`: replaces the domain and returns the same handle.

Names are stored in the model protobuf, so restored handles and negated-variable
names see later renames. An empty name clears it. Domain replacement can narrow
or widen bounds and preserves exact signed int64 values. Boolean detection reads
the current domain. Invalid inputs throw before mutation; empty domains and
previously stored Boolean references that become invalid reach native model
validation. Model/proto snapshots and clones remain independent, and constant
lookup checks that cached variables still have the requested fixed domain.

Model/proto helpers:

- `name`: model name getter/setter.
- `modelProto`: returns a detached `CpModelProto` snapshot. Construct a new
  `CpModel(snapshot)` after editing it; mutating the snapshot cannot invalidate
  the original model's variable and constant caches.
- `clone()`: returns a new `CpModel` wrapper around a cloned proto.
- `removeAllNames()`
- `validate(options?: { executor?, signal? }): Promise<string>`: returns `''` for a valid model, otherwise the
  native validation message.
- `modelStats(options?: { executor?, signal? }): Promise<string>`: returns the
  native model report without solving.
- `exportModelProto(): Promise<Uint8Array>`: returns detached binary protobuf
  bytes, serialized from the current model before awaiting.
- `exportModelText(options?: { executor?, signal? }): Promise<string>`: returns
  native protobuf text. Like upstream file export, invalid models can still be
  exported for debugging; malformed protobuf bytes reject.
- `hasObjective(): boolean`

Linear constraints and objectives:

- `add(bound: BoundedLinearExpr | boolean)`
- `addLinearConstraint(expression, lb, ub)`
- `addLinearExpressionInDomain(expression, domain)`
- `addEquality(left, right)`
- `minimize(expression)`
- `maximize(expression)`

Logical constraints:

- `addBoolOr(literals)`
- `addBoolAnd(literals)`
- `addBoolXor(literals)`
- `addAtLeastOne(literals)`
- `addAtMostOne(literals)`
- `addExactlyOne(literals)`
- `addImplication(left, right)`
- `addMapDomain(variable, booleanVariables, offset?)`

Integer and table constraints:

- `addAllDifferent(expressions)`
- `addElement(index, expressions, target)`
- `addAllowedAssignments(expressions, tuples)`
- `addForbiddenAssignments(expressions, tuples)`
- `addAutomaton(expressions, startingState, finalStates, transitions)`
- `addCircuit(arcs)`
- `addMultipleCircuit(arcs)`
- `addInverse(direct, inverse)`
- `addMaxEquality(target, expressions)`
- `addMinEquality(target, expressions)`
- `addAbsEquality(target, expression)`
- `addDivisionEquality(target, numerator, denominator)`
- `addModuloEquality(target, expression, modulo)`
- `addMultiplicationEquality(target, expressions)`

Scheduling constraints:

- `newIntervalVar(start, size, end, name?)`
- `newFixedSizeIntervalVar(start, size, name?)`
- `newOptionalFixedSizeIntervalVar(start, size, isPresent, name?)`
- `newOptionalIntervalVar(start, size, end, isPresent, name?)`
- `addNoOverlap(intervals)`
- `addNoOverlap2D(xIntervals, yIntervals)`
- `addCumulative(intervals, demands, capacity)`
- `addReservoirConstraint(times, levelChanges, minLevel, maxLevel, activeLiterals?)`

Search and hints:

- `addDecisionStrategy(expressions, variableSelectionStrategy, domainReductionStrategy)`
- `addHint(variable, value)`
- `clearHints()`
- `addAssumption(literal)`
- `addAssumptions(literals)`
- `clearAssumptions()`

Handle `modelProto` getters return detached model snapshots.
`IntVar.proto`, `Constraint.proto` and `IntervalVar.proto` return detached
`IntegerVariableProto`, `ConstraintProto` and `IntervalConstraintProto` messages.
For advanced edits, change a model snapshot and construct `new CpModel(snapshot)`;
get variable/interval handles back with `getIntVarFromProtoIndex`,
`getBoolVarFromProtoIndex` and `getIntervalVarFromProtoIndex`. The constructor
copies its input and rebuilds constant indexes. Literal negation uses `-index - 1`.

```ts
const snapshot = model.modelProto;
snapshot.variables![x.index].domain = [0, 5];
const edited = new CpModel(snapshot);
const editedX = edited.getIntVarFromProtoIndex(x.index);
```

### Expressions And Variables

The high-level package exports:

- `IntVar`, `BoolVar`, `NotBoolVar`
- `LinearExpr`, `BoundedLinearExpr`
- `IntervalVar`, `Constraint`
- `Domain`
- `sum(values)`, `weightedSum(values, coeffs)`, `term(variable, coeff)`
- types: `LinearExprLike`, `LiteralLike`

Expression helpers:

- `LinearExpr.constant(value)`
- `LinearExpr.from(value)`
- `LinearExpr.affine(expression, coeff, offset)`
- `LinearExpr.sum(values)`
- `LinearExpr.weightedSum(values, coeffs)`
- `LinearExpr.term(variable, coeff)`
- `plus(value, coeff?)`, `minus(value)`, `times(coeff)`, `neg()`
- `eq(value)`, `ne(value)`, `le(value)`, `lt(value)`, `ge(value)`, `gt(value)`
- `toProto()`
- `isInteger()`
- `hasFloatingPointTerms()`
- `toString()` and `repr()` for display/debug parity with Python-style tests
- `toFloatObjective(maximize?)`

Nonlinear operations are modeled explicitly with `addAbsEquality()`,
`addDivisionEquality()`, and `addModuloEquality()`; expressions do not expose
always-throwing operation methods. Accidental use of native JavaScript operators
on CP-SAT expressions throws `TypeError`.

The API uses standard JavaScript errors: `TypeError` for invalid operand or
object types, `RangeError` for invalid numeric ranges, indexes, domains, and
arities, and `Error` when an operation is invalid in the solver's current state.

`IntVar` supports:

- `name`, `proto`, `modelProto`, `expr()`
- `plus(value, coeff?)`, `minus(value)`, `times(coeff)`, `neg()`
- `eq(value)`, `ne(value)`, `le(value)`, `lt(value)`, `ge(value)`, `gt(value)`
- `isInteger()`
- `isBoolean()`
- `negated()` for Boolean variables
- `debugString()`, `repr()`, `toString()`

`BoolVar` extends `IntVar` with:

- `literalIndex`
- `not()`

`NotBoolVar` supports:

- `variable`, `model`, `index`, `name`, `modelProto`
- `not()` / `negated()`
- `expr()`
- `plus(value, coeff?)`, `minus(value)`, `times(coeff)`, `neg()`
- `isInteger()`
- `repr()`, `toString()`

`LinearExpr.terms`, `offset` and `isInteger()` expose canonical flattened terms
for integer and floating expressions. Term keys are variable indices; resolve
handles through the expression's model. Separate flat-expression classes and
constant-cache indexing helpers are intentionally omitted.

`new BoundedLinearExpr(expression, bounds: Domain)` accepts variables, constants
or linear expressions. The existing `(expression, lowerBound, upperBound, domain?)`
constructor remains available. Read-only `bounds: Domain`, `vars: IntVar[]`,
`coeffs: NumericValue[]`, `offset: NumericValue` and `ok: boolean` expose canonical
terms sorted by variable ID; inspection arrays/bounds are detached. `ok` is false
for noninteger expressions, invalid references or int64 overflow. Empty bounds
represent an infeasible constraint, not an invalid expression.

`model.rebuildFromLinearExpressionProto(proto): LinearExpr` and the exported
`rebuildFromLinearExpressionProto(proto, model)` reconstruct typed integer
expressions with validated IDs, lengths, coefficients and offsets. Duplicate
terms are combined and zero terms removed; input arrays are copied. Variable IDs
are resolved within the supplied model; the format carries no separate model
identity. Negated Boolean expressions serialize as a negative coefficient and
an offset, rather than a negative variable ID.

`BoundedLinearExpr` supports:

- `expression`
- `lowerBound`
- `upperBound`
- `domain`
- `toString()`

`Domain` supports:

- `new Domain(lower, upper)`
- `new Domain(value)`
- `Domain.fromFlatIntervals(intervals)`
- `Domain.fromIntervals(intervals)`
- `Domain.fromValues(values)`
- `Domain.allValues()`, `Domain.greaterOrEqual(value)`, `Domain.lowerOrEqual(value)`
- `flatIntervals`, `flattenedIntervals()`: detached interval bounds
- `min()`, `max()`, `size()`, `contains(value)`, `isEmpty()`
- `isIncludedIn(domain)`, `overlapsWith(domain)`
- `intersectionWith(domain)`, `unionWith(domain)`, `additionWith(domain)`
- `complement()`, `negation()`

Domain operations return new domains. `min()` and `max()` reject an empty
domain; `size()` returns a bigint and saturates at signed int64 maximum.

`Constraint` supports:

- `model`
- `index`
- `name`
- `withName(name)`
- `onlyEnforceIf(literals)`

`IntervalVar` supports:

- `model`
- `index`
- `name`
- `modelProto`
- `startExpr()`
- `sizeExpr()`
- `endExpr()`
- `presenceLiterals()`
- `repr()`, `toString()`

### `CpSolver`

`new CpSolver()`

High-level solver wrapper. It delegates to the proto-first `CpSat` runtime while
keeping the latest decoded response for high-level result helpers.

`solver.parameters`

Mutable `CpSatSolverParameters` object merged into every `solve()` call.
Per-call options override these defaults. Use `numWorkers` for the thread count.

`solver.solve(model, options?: CpSolverSolveOptions): Promise<CpSolverStatus | undefined>`

Solves a `CpModel`. The options object combines:

- CP-SAT parameters such as `numWorkers` and `maxTimeInSeconds`
- `solutionCallback?: CpSolverSolutionCallback`
- `executor`, `signal`, `onEvent`, and `eventMask`

Positional callbacks and raw parameter bytes are not accepted. Use
`CpSat.solveProto()` for byte-oriented models; its parameters still use an
options object.

Result helpers:

- `responseStats(): string`: returns the native report saved during solving.
- `statusName(status?)`
- `value(expression)`: `bigint` for integer expressions, `number` for floating-point expressions
- `booleanValue(literal)`
- `sufficientAssumptionsForInfeasibility()`: encoded literals in the native infeasibility core
- `stopSearch()`: requests termination of an active solve

Response properties:

- `response`: detached copy of the latest decoded `CpSolverResponse`, or `null` before solving
- `objectiveValue`
- `bestObjectiveBound`
- `solutionInfo`
- `solveLog`
- `wallTime`
- `userTime`
- `deterministicTime`
- `numBooleans`
- `numConflicts`
- `numBranches`
- `numIntegers`
- `numBinaryPropagations`
- `numIntegerPropagations`

Callbacks:

- `solver.bestBoundCallback = (bound) => {}`
- `solver.logCallback = (message) => {}`

`CpSolverSolutionCallback` can be subclassed or assigned an
`onSolutionCallback()` method. During a callback, use `value()`,
`booleanValue()`, `objectiveValue`, `bestObjectiveBound`, and `wallTime`.
`stopSearch()` requests termination; `hasResponse()` and the `responseProto` property
inspect the current callback response.

```ts
class Printer extends CpSolverSolutionCallback {
  onSolutionCallback() {
    console.log(this.value(x));
  }
}

await solver.solve(model, { solutionCallback: new Printer() });
```

### CP-SAT model and result

`CpSat.solve(model: CpModel, options?: CpSolverSolveOptions)` returns a `CpResult`.
The result owns one answer, so a later solve or model edit does not change its
values. `hasSolution` must be true before reading variable values.
Results are produced by solving; their constructors are private.

Read diagnostics directly from the result: `wallTime`, `userTime`,
`deterministicTime`, `numIntegers`, `numBooleans`, `numConflicts`, `numBranches`,
`numBinaryPropagations`, `numIntegerPropagations`, `solutionInfo`, and `solveLog`.
Times are in seconds; numeric counters reject values outside the safe integer
range. `statusName()` names the native status, and
`sufficientAssumptionsForInfeasibility()` returns a copied native core.
`responseStats()` returns the native report captured by this solve, without
another native request. Diagnostics remain available for infeasible responses.
The `response` property returns a detached protobuf snapshot.

```ts
const model = new CpModel();
const x = model.newIntVar(0, 10, 'x');
model.maximize(x);
const result = await CpSat.solve(model, { numWorkers: 4 });
if (result.hasSolution) console.log(result.value(x), result.objectiveValue);
```

### Proto-First CP-SAT

Build or serialize a `CpModelProto`, validate it, then solve it:

```ts
const proto: CpModelProto = {
  variables: [{ name: 'x', domain: [0, 10] }],
  objective: { vars: [0], coeffs: [1] },
};
const modelBytes = await CpSat.createModel(proto);
const validation = await CpSat.validate(modelBytes);
if (!validation.ok) throw new Error(validation.message);

const result = await CpSat.solveProto(modelBytes, {
  numWorkers: 4,
  logSearchProgress: true,
});
```

### `CpSat`

`CpSat.createModel(model: CpModelProto): Promise<Uint8Array>`

Encodes a JSON-like `CpModelProto` object into binary protobuf bytes. The input
uses the generated TypeScript `CpModelProto` shape from OR-Tools.

`CpSat.validate(model: Uint8Array, options?: { executor?: ExecutorSelection; signal?: AbortSignal }): Promise<{ ok: boolean; message: string }>`

Runs native CP-SAT model validation. `ok` is `false` when OR-Tools rejects the
model; `message` contains the native validation message.

`CpSat.solveProto(model: Uint8Array, options?: CpSatSolveOptions): Promise<CpSatSolveResult>`

Captures the submitted model bytes before dispatching.

Solves a binary `CpModelProto`. Solver parameters and execution options share
one options object. The returned `CpSatSolveResult` contains:

- `response`: decoded `CpSolverResponse | null`
- `bytes`: raw binary `CpSolverResponse`
- `statistics`: native formatted response report (when supplied by the executor)

`options.onEvent` receives enabled solution, best-bound, log, status, and
failure events. Pass an `AbortSignal` as `options.signal` to cancel a solve.

`CpSat.getSchemas(): Promise<{ cp_model: string; sat_parameters: string }>`

Returns embedded `.proto` schemas without loading a solver runtime. CP-SAT
returns `cp_model` and `sat_parameters`.

`CpSat.modelStats(model: Uint8Array, options?: { executor?, signal? }): Promise<string>`
returns native model statistics without solving.

`CpSat.responseStats(response: Uint8Array | CpSolverResponse, options?: { executor?, signal? }): Promise<string>`
returns a native response report. Both statistics methods support direct, worker
and server execution; their reports are text, while protobuf data remains typed.

`CpSat.exportModelText(model: Uint8Array | CpModelProto, options?: { executor?, signal? }): Promise<string>`
returns native protobuf text with exact int64 values, native enum names and
protobuf string escaping. Direct, worker and server execution are supported.
Input bytes are copied and objects are serialized before awaiting. An empty
model exports `''`; invalid model domains or constraints remain exportable for
diagnostics, while malformed protobuf bytes reject. `CpSat.createModel(proto)`
and `CpModel.exportModelProto()` provide binary bytes. Saving text or bytes to
files, or initiating browser downloads, remains caller-owned.

### CP-SAT Types And Enums

The package exports generated CP-SAT protobuf types and enums, including:

- `CpModelProto`
- `CpSolverResponse`
- `SatParameters`
- `CpSolverStatus`
- `DecisionStrategyProto_DomainReductionStrategy`
- `DecisionStrategyProto_VariableSelectionStrategy`

It also re-exports the generated `cp_model` symbols, so generated nested
message types are available from the package entrypoint.

## Routing

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
`localSearchProfile` and `automaticFirstSolutionStrategy` for that solve.
Absent diagnostics are `null`; assignment-returning methods also capture these
diagnostics on the returned assignment. Assignments and dimensions are obtained
from the model; their constructors are private.
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

### `RoutingIndexManager`

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

### `RoutingModel`

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
- `status(): RoutingSearchStatus`

Route structure and model helpers:

- `start(vehicle): number`
- `end(vehicle): number`
- `isEnd(index): boolean`
- `nextVar(index): number`
- `vehicleVar(index): RoutingVehicleVar`
- `vehicles(): number`
- `addDisjunction(indices, penalty?, maxCardinality?, penaltyCostBehavior?): number`
- `addPickupAndDelivery(pickup, delivery): void`
- `addAtSolutionCallback(callback, trackUncheckedNeighbors?): void`
- `addConstraints(...constraints: RoutingConstraint[]): void`
- `getModelParameters(): RoutingModelParameters` (copy of submitted overrides)`

Pass search parameters directly to `solve(options)` or `solveWithParameters(parameters, options)`.
Each solve prepares its own native model. The wrapper does not expose a separate
model-closing step or first-solution decision/reject statistics. Route restoration
also runs native feasibility checks and returns `null` for infeasible routes.
`ignoreInactiveIndices` skips forced-inactive nodes; it does not permit omitting
mandatory visits. Await `getArcCostForVehicle(..., options)` for native costs
without replacing the last assignment.

`nextVar(index)` returns an opaque next-variable handle represented by the
index. Pass that value to `assignment.value(...)`. `vehicleVar(index)` returns
an opaque vehicle-variable handle for solver constraints.

Helpers for reading the current assignment:

- `assignmentObjectiveValue(): bigint`
- `nextValue(index): number`
- `dimensionCumulValue(dimensionName, index): bigint`

These helpers read values from the current assignment state and are usually
used through `Assignment`.

### Routing variable handles

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

All six native finalizers accept a handle or numeric `nextVar`:
`addVariableMinimizedByFinalizer`, `addVariableMaximizedByFinalizer`,
`addVariableTargetToFinalizer(variable, target)` and their `addWeightedVariable...`
variants. Weighted minimum/maximum take `(variable, weight)`; weighted target
takes `(variable, target, weight)`. Higher weights have higher priority.
Finalizers select feasible values after choosing a route; they do not change
the route objective or override constraints.

### Routing fleet, groups and visit types

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
`getDisjunctionPenalty(id)`, `getDisjunctionMaxCardinality(id)`,
`getDisjunctionPenaltyCostBehavior(id)`, `getNumberOfDisjunctions()`,
`hasMandatoryDisjunctions()` and `hasMaxCardinalityConstrainedDisjunctions()`.
`hasMandatoryDisjunctions()` checks the native `-1` sentinel.

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
`getNumberOfVisitTypes`, `getSingleNodesOfType`, `getPairIndicesOfType`,
`getHardTypeIncompatibilitiesOfType`, `getTemporalTypeIncompatibilitiesOfType`,
`getSameVehicleRequiredTypeAlternativesOfType`,
`getRequiredTypeAlternativesWhenAddingType`,
`getRequiredTypeAlternativesWhenRemovingType`, `hasHardTypeIncompatibilities`,
`hasTemporalTypeIncompatibilities`, `hasSameVehicleTypeRequirements`,
`hasTemporalTypeRequirements` and `hasTypeRegulations`. Returned arrays are
independent snapshots; pair lists contain pair IDs, while singleton lists contain
routing indices. Native empty requirements do not set the inspection flags.

### Routing Solver Constraints

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

### `RoutingDimension`

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

- `setCumulVarRange(index, lower, upper)`, `addNodePrecedence(first, second, offset)`
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

Costs and span limits are nonnegative int64 values; repeated settings replace
previous ones. Soft upper/lower penalties charge the coefficient times the
violation for performed nodes. Bound getters are awaitable native queries;
presence and coefficient getters read configuration. Without a soft bound,
the bound getter returns the native hard cumul bound. Soft-span getters require
the corresponding `has...()` flag; untouched vehicles then return
`BoundCost(INT64_MAX, 0)`.

`cumulVar(index)` returns a handle for domain mutations, assignment reads and
solver constraints.

### `BoundCost`

```ts
new BoundCost(bound = 0, cost = 0)
```

Fields:

- `bound: bigint`
- `cost: bigint`

### Routing native nonlinear expressions

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

### Routing resource groups

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

Each query reconstructs and closes a native model without searching; it preserves
registered builder state and existing solve results. OR-Tools computes classes from
attributes and vehicle assignability, including ResourceVar domains and allowed
resources. No class grouping happens in TypeScript. Prefer `inspect()` when reading
several fields together. Class indices describe that snapshot and may change after
model edits. Empty groups have no resources or classes. Invalid resource/class/group
indices or dimension names reject. Queries use the same executor/signal convention
as variable-domain inspection. Low-level bridge callers choose inspected dimensions
through `dimension_names`; the high-level API includes all registered dimensions.

### `Assignment`

- `objectiveValue(): bigint`
- `value(nextVar): number`
- `value(cumulVar): bigint`
- `min(nextVar): number`
- `min(cumulVar): bigint`

For `nextVar(index)`, pass the returned value into `assignment.value()` to get
the next index. For dimensions, pass `dimension.cumulVar(index)`.

`value()`, `min()` and `max()` also accept slack, transit and fixed-transit
handles and return `bigint`. They accept `routing.activeVehicleVar(vehicle)`
or `routing.vehicleRouteConsideredVar(vehicle)` and return numeric values (0 or 1).
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

### Routing Parameters And Enums

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

## MPSolver

Import:

```ts
import { MpModel, MPSolver } from 'or-tools-wasm/mp-solver';
```

Build the model and select the executor at the solve boundary:

```ts
const model = new MpModel('example');
const x = model.addNumVariable(0, Infinity, 'x');
const y = model.addNumVariable(0, Infinity, 'y');
const c = model.addConstraint(-Infinity, 14, 'c');
c.setCoefficient(x, 1);
c.setCoefficient(y, 2);
model.objective().setCoefficient(x, 3);
model.objective().setCoefficient(y, 1);
model.objective().setMaximization();

const result = await MPSolver.solve(model, {
  solverType: MPSolver.GLOP_LINEAR_PROGRAMMING,
  executor: 'worker',
});
if (result.hasSolution) console.log(result.value(x), result.objectiveValue);
```

Each `MpResult` owns its response and variable values, so solving the same
model again does not change an earlier result. Read native diagnostics from
`result.solverVersion`, `iterations` and `nodes` (exact `bigint` counters),
`wallTimeMs`, `exactConditionNumber`, and `basisStatus(variableOrConstraint)`.
Missing optional metadata is `null`; native counter sentinels such as `-1n`
are retained. Basis queries throw when the
backend does not provide a basis. `response` and `nativeMetadata` return copies.
The existing `MPSolver`
instance API is also supported, and
`solveWithProto()` / `MPSolver.solveModelRequest()` remain available for
protobuf-oriented callers. `MPSolverModelProto`, `MPSolverModelRequest` and
`MPSolverSolutionResponse` use generated types from the vendored native schema;
a model proto and its containing solve request are distinct types. Raw bytes
remain supported. All solve paths accept the
same execution controls as CP-SAT: choose an executor with `executor`, cancel
with an `AbortSignal` in `signal`, and observe lifecycle events with `onEvent`.
Cancellation should use the worker executor. GLOP, SAT, and PDLP solves are
interrupted natively; for backends without native interruption support, the
worker is terminated and recreated. Direct execution cannot stop native work
already in progress.

To retain native model state while keeping each answer independent:

```ts
const session = model.incremental({
  solverType: MPSolver.GLOP_LINEAR_PROGRAMMING, executor: 'worker',
});
try {
  const first = await session.solve();
  x.setUpperBound(2);
  const second = await session.solve();
  console.log(first.value(x), second.value(x));
} finally {
  await session.close();
}
```

`MpIncrementalSolver` uses the same native session as the Python-style
`MPSolver.IncrementalSolver`, returning `MpResult` instead of installing a last
answer on the model. `nextSolution()` returns a result or `null`; `reset()` and
`close()` are awaitable. The executor and backend are fixed at creation. A
pre-aborted operation leaves a healthy session reusable. A transport failure
that leaves native state uncertain requires closing and recreating the session.

### Solver Types And Status

`OptimizationProblemType` contains OR-Tools MPSolver problem type ids, including
`GLOP_LINEAR_PROGRAMMING`, `CLP_LINEAR_PROGRAMMING`, `PDLP_LINEAR_PROGRAMMING`,
`SAT_INTEGER_PROGRAMMING`, `GLPK_LINEAR_PROGRAMMING`,
`SCIP_MIXED_INTEGER_PROGRAMMING`, `GLPK_MIXED_INTEGER_PROGRAMMING`,
`CBC_MIXED_INTEGER_PROGRAMMING`, `BOP_INTEGER_PROGRAMMING`,
`KNAPSACK_MIXED_INTEGER_PROGRAMMING`, and
others. Only problem types compiled into the WebAssembly runtime will be supported at runtime; use
`MPSolver.supportsProblemType()`.

The default package runtime currently includes `GLOP`, `CLP`, `PDLP`, and `GLPK_LP` for
continuous linear programming, plus `SAT`, `GLPK`, `SCIP`, `CBC`, `BOP`, and
`KNAPSACK` for integer linear programming through MPSolver.

`MPSolverResultStatus` contains `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`,
`UNBOUNDED`, `ABNORMAL`, `MODEL_INVALID`, and `NOT_SOLVED`.

Basis status values are returned by `basisStatus()` and are also exposed as
static constants on `MPSolver`: `FREE`, `AT_LOWER_BOUND`, `AT_UPPER_BOUND`,
`FIXED_VALUE`, and `BASIC`.

### `MPSolver`

Static helpers:

- `createSolver(solverId): MPSolver | null`
- `infinity(): number`
- `supportsProblemType(problemType): boolean`
- `parseSolverType(solverId): OptimizationProblemType | null`
- `parseAndCheckSupportForProblemType(solverId): OptimizationProblemType | null`
- `findErrorInModelProto(model, options?): Promise<string>`
- `computeIrreducibleInfeasibleSubset(model, options?): Promise<MPSolverIISResult>`
- `getLinearSolverSchemas(options?): Promise<LinearSolverSchemas>`
- `createModelRequest(request, options?): Promise<Uint8Array>`
- `createSolutionResponse(response, options?): Promise<Uint8Array>`
- `decodeSolutionResponse(bytes, options?): Promise<MPSolverSolutionResponse>`
- `solveModelRequest(request, options?): Promise<MPSolverProtoSolveResult>`

Raw model/solution codecs capture their inputs before awaiting schema loading.
Raw solves also capture execution options and native parameter maps.

Construction:

```ts
new MPSolver(name, problemType)
```

Core model methods:

- `name(): string`
- `problemType(): OptimizationProblemType`
- `isMip(): boolean`
- `clear(): void`
- `infinity(): number`
- `numVariables(): number`
- `numConstraints(): number`
- `variable(index): MPVariable`
- `variables(): MPVariable[]`
- `constraint(index): MPConstraint`
- `constraints(): MPConstraint[]`
- `lookupVariable(name): MPVariable | null`
- `lookupConstraint(name): MPConstraint | null`
- `objective(): MPObjective`

Variables:

- `addVariable(lb, ub, integer, name): MPVariable`
- `addNumVariable(lb, ub, name): MPVariable`
- `addIntVariable(lb, ub, name): MPVariable`
- `addBoolVariable(name): MPVariable`

Constraints:

- `addConstraint(): MPConstraint`
- `addConstraint(name): MPConstraint`
- `addConstraint(lb, ub, name?): MPConstraint`

Solving and solution loading:

- `solve(options?): Promise<MPSolverResultStatus>`
- `solveWithProto(options?): Promise<MPSolverProtoSolveResult & { loaded: boolean }>`
- `loadSolutionFromProto(response?, tolerance?, options?): Promise<boolean>`
- `loadModelFromProto(model, options?): Promise<string>`
- `loadModelFromProtoKeepNames(model, options?): Promise<string>`
- `fillSolutionResponseProto(response): void`
- `exportSolutionProto(options?): Promise<Uint8Array>`
- `exportModelProto(options?): Promise<Uint8Array>`
- `exportModelRequestProto(options?): Promise<Uint8Array>`
- `verifySolution(tolerance, logErrors?, options?): Promise<boolean>`
- `computeIrreducibleInfeasibleSubset(options?): Promise<MPSolverIISResult>`
- `reset(): void`

`solver.solve()` and `solver.solveWithProto()` are one-shot operations: each
request constructs a native solver. Their `INCREMENTALITY` setting cannot retain
backend state across requests; `solver.reset()` clears the cached solution.
Use an incremental session for native solution-pool enumeration.

Solve options accept `messageCallback: (messages: string[]) => void` for native
backend logs. It enables output by default; `enableOutput: false` suppresses it.
`onEvent` also receives `{ type: 'log', messages }` when output is enabled.
GLOP, CLP, GLPK LP/MIP, SAT, PDLP, SCIP and CBC support streaming; explicit
streaming requests on BOP or Knapsack reject. One-shot, proto and retained solves
use the same event transport across direct, worker and server execution. Direct
execution remains blocking; use worker/server for responsive UI updates.
Message callbacks are synchronous; use `onEvent` for async observers. Logging
levels and solver-specific overrides retain native behavior.

For retained native state, use `MPSolver.IncrementalSolver` (also exported as
`MPSolverIncrementalSolver`):

```ts
const session = new MPSolver.IncrementalSolver(solver, { executor: 'worker' });
try {
  await session.solve();
  x.setUpperBound(2);
  await session.solve();
  while (await session.nextSolution()) console.log(x.solutionValue());
  await session.reset();
} finally {
  await session.close();
}
```

The session snapshots the model at creation and forwards later edits to the same
native solver. Native `MPSolverParameters` control backend reuse. All session
methods are awaitable:

- `solve(options?)`: returns status and updates the original solver's results.
- `solveWithProto(options?)`: also returns native bytes, decoded response and metadata.
- `nextSolution(options?)`: advances SCIP's native pool; other built backends return `false`.
- `reset(options?)`: calls native Reset, preserving the mathematical model.
- `close()`: releases the session; call it in `finally`.

The executor is fixed: direct, worker and server are supported; cloud is unavailable.
GLPK server sessions are unsupported because its environment belongs to the
creating thread. Operations on the same model cannot overlap. Mutating a model
during a solve discards stale results. Runtime replacement or an unacknowledged
native failure requires close/recreation. Close is idempotent, waits for active
work and cannot be called from an event handler. Backends without native
interruption finish before an active AbortSignal rejection.

`findErrorInModelProto(bytesOrObject, options?)` is also exported as a module
function. It uses native validation without solving and returns `''` on success
or the native diagnostic. A valid model may require a backend that supports its
constraint types.

`MpModel.computeIrreducibleInfeasibleSubset(options?)` and the static helper
default to SCIP; an `MPSolver` instance defaults to its configured backend.
Only SCIP supports this diagnostic. The static helper accepts `MPModelProto`
bytes or an object. All paths capture a linear-model snapshot, run the native
SCIP IIS finder through direct, worker or server execution, and preserve cached
solutions and retained sessions. General constraints and quadratic objectives
are rejected.

`MPSolverIISOptions` adds `solverType`, `solverSpecificParameters`,
`timeLimitSeconds` (finite, nonnegative) and `nodeLimit` (exact int64; `-1` means
unlimited) to the execution controls. Explicit limits override native parameter
settings. Native IIS uses one search thread. Use worker or server execution for
responsive cancellation.

The result contains native `isInfeasible`, `isIrreducible`, `timeSeconds` and
`nodes: bigint`, plus `constraintIndices` and `variableBounds` entries with
`variableIndex`, `lowerBoundIncluded` and `upperBoundIncluded`. Indices refer to
the captured model arrays. Retained variables can have neither bound included
when their integer domain matters. A false `isInfeasible` flag means the finder
has no infeasibility proof; after a limit it does not establish feasibility.

The model loaders replace the model, invalidate old handles and clear the
solution, including on validation failure. They return `''` on success or a
native error string. `loadModelFromProto` discards names;
`loadModelFromProtoKeepNames` preserves unique nonempty names. The destination
solver's name and execution settings remain. Editable imports support linear
models; general constraints and quadratic objectives use raw proto solving.

`fillSolutionResponseProto(response)` clears and fills the supplied object from
the current solution. `exportSolutionProto(options?)` returns detached native
response bytes for `loadSolutionFromProto`. Unsolved/failed models export status
without fabricated values. Model edits invalidate cached solutions.

`await solver.verifySolution(tolerance, logErrors, { executor })` calls native
verification on a model/solution snapshot without optimization or changing the
cached result. It returns `false` with no loaded solution. Tolerances and
integrality checks follow the backend. `logErrors` writes native diagnostics to
runtime/server output, not `onEvent` events.

Options and output:

- `enableOutput(): void`
- `suppressOutput(): void`
- `outputIsEnabled(): boolean`
- `setTimeLimit(milliseconds): void`
- `timeLimit(): number`
- `setNumThreads(numThreads): boolean`
- `getNumThreads(): number`
- `setSolverSpecificParametersAsString(parameters, options?): Promise<boolean>`
- `getSolverSpecificParametersAsString(): string`
- `solverVersion(options?): Promise<string>` — queries the selected native executor; use `result.solverVersion` for a completed solve's captured version.
- `computeConstraintActivities(options?): Promise<number[]>` — native activities of the current solution snapshot; empty before solving/loading a solution.
- `computeExactConditionNumber(): number`
- `setHint(variables, values): void`
- `exportModelAsLpFormat(obfuscate, options?): Promise<string>`
- `exportModelAsMpsFormat(fixedFormat, obfuscate, options?): Promise<string>` — native free-format MPS; `fixedFormat` is ignored upstream.
- `wallTime(): number`
- `iterations(): number`
- `nodes(): number`

Model exports and constraint activities accept the usual executor, signal and
event options and capture their inputs before awaiting. Formatting follows
OR-Tools, including its generated names and omission of unused LP variables.
Editable solves and retained sessions preserve all constructed rows, including
unbounded rows. Explicit proto imports use native normalization, which removes
unbounded rows; raw proto solves keep their existing native execution paths.

### `MPVariable`

- `solutionValue(): number`
- `unroundedSolutionValue(): number`
- `reducedCost(): number`
- `basisStatus(): number`
- `index(): number`
- `name(): string`
- `lowerBound(): number`
- `upperBound(): number`
- `setBounds(lb, ub): void`
- `setLowerBound(lb): void`
- `setUpperBound(ub): void`
- `isInteger(): boolean`
- `setInteger(integer): void`
- `branchingPriority(): number`
- `setBranchingPriority(priority): void`

### `MPConstraint`

- `setCoefficient(variable, coefficient): void`
- `getCoefficient(variable): number`
- `clear(): void`
- `index(): number`
- `name(): string`
- `lowerBound(): number`
- `upperBound(): number`
- `setBounds(lb, ub): void`
- `setLowerBound(lb): void`
- `setUpperBound(ub): void`
- `dualValue(): number`
- `basisStatus(): number`
- `isLazy(): boolean`
- `setIsLazy(laziness): void`

### `MPObjective`

- `clear(): void`
- `setCoefficient(variable, coefficient): void`
- `getCoefficient(variable): number`
- `setOffset(offset): void`
- `addOffset(offset): void`
- `offset(): number`
- `setOptimizationDirection(maximize): void`
- `setMinimization(): void`
- `setMaximization(): void`
- `value(): number`
- `bestBound(): number`
- `isMaximization(): boolean`
- `isMinimization(): boolean`

`await solver.setSolverSpecificParametersAsString(text, { executor })` reports
the selected backend's native acceptance before solving. The native setter stores
the submitted text even when it returns `false`; the getter preserves that text.
A rejected text can be replaced with supported settings before the next solve.
Validation uses a temporary native solver and preserves existing variables and
solution snapshots. Solver thread budgets and solve-time compatibility checks
remain part of solving; setter acceptance is the backend's parameter-setter result.

### `MPSolverParameters`

Use `new MPSolverParameters()` and pass it as `solver.solve({ parameters, ...options })`.

- `setDoubleParam(param, value): void`
- `getDoubleParam(param): number`
- `resetDoubleParam(param): void`
- `setIntegerParam(param, value): void`
- `getIntegerParam(param): number`
- `resetIntegerParam(param): void`
- `reset(): void`

Parameter enums:

- `DoubleParam`: `RELATIVE_MIP_GAP`, `PRIMAL_TOLERANCE`, `DUAL_TOLERANCE`
- `IntegerParam`: `PRESOLVE`, `LP_ALGORITHM`, `INCREMENTALITY`, `SCALING`
- `PresolveValues`: `PRESOLVE_OFF`, `PRESOLVE_ON`
- `LpAlgorithmValues`: `DUAL`, `PRIMAL`, `BARRIER`
- `IncrementalityValues`: `INCREMENTALITY_OFF`, `INCREMENTALITY_ON`
- `ScalingValues`: `SCALING_OFF`, `SCALING_ON`

## Knapsack

The dedicated Knapsack API mirrors
`ortools.algorithms.python.knapsack_solver.KnapsackSolver` and uses the
MPSolver WebAssembly runtime.

```ts
import {
  asNumber,
  KnapsackSolver,
  KnapsackSolverType,
} from 'or-tools-wasm/knapsack';

const solver = new KnapsackSolver(
  KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
  'knapsack',
);
solver.init(
  [360, 83, 59, 130],
  [[7, 0, 30, 22]],
  [50],
);

const result = await solver.solve({ executor: 'worker' });
const selected = [0, 1, 2, 3].filter((item) => result.contains(item));
console.log(asNumber(result.profit), selected, result.optimal);
```

The runtime is loaded lazily. Select execution for each solve with
`executor: 'auto' | 'direct' | 'worker'` or a server/cloud executor
configuration. `signal` requests cancellation; worker execution can terminate
its worker, but running native Knapsack solves have no interruption hook,
including on the server. Knapsack emits the shared solver
lifecycle events through `onEvent` but has no native solution-progress callback.
`numWorkers` defaults to one. The CP-SAT Knapsack backend also accepts larger
positive worker counts; other algorithms require one. Counts are forwarded to
native CP-SAT and checked against the WASM pool or server budget before work
starts. A solver instance accepts one solve at a time, and an `onEvent` error is reported
after the active executor job settles so the executor remains reusable.

`KnapsackSolverType` exposes the upstream solver ids:

- `KNAPSACK_BRUTE_FORCE_SOLVER`
- `KNAPSACK_64ITEMS_SOLVER`
- `KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER`
- `KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER`
- `KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER`
- `KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER`
- `KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER`
- `KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER`
- `KNAPSACK_DIVIDE_AND_CONQUER_SOLVER`
- `KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER`

`solve(options)` returns an independent `KnapsackResult`. This replaces the
earlier scalar return and mutable last-solution accessors: use `result.profit`,
`result.contains(item)`, and `result.optimal`. `KnapsackSolver` also supports
`init()`, `setUseReduction()`, `setTimeLimit()`, and `getName()`. Profits,
weights, and capacities accept `IntValue`; `result.profit` is an exact `bigint`.

`init(profits, weights, capacities)` accepts an empty item list and requires at
least one weight dimension. Each dimension needs one weight per item and a
matching capacity. Brute force accepts at most 30 items; the 64-item solver accepts at
most 64. Those two algorithms, dynamic programming, and divide-and-conquer
require exactly one weight dimension. Limits apply before reduction and invalid
inputs throw before changing the initialized problem. `setTimeLimit(seconds)`
uses seconds. Exported solver IDs do not imply that every backend is compiled
in; commercial backends such as CPLEX and XPRESS are not included.

Profits, weights and capacities must be nonnegative; profit totals and each
weight dimension's total must fit signed int64. Branch-and-bound profits and
dynamic-programming/divide-and-conquer capacities must be below `INT64_MAX`
because native code increments them. MIP/CP-SAT profit totals must remain below
`2^63` after conversion to double. These adapters use floating-point objectives;
their native precision limits still apply. Empty 64-item problems require the
default reduction setting. Rejected initialization preserves the previous model.

The MPSolver frontend also exposes
`KNAPSACK_MIXED_INTEGER_PROGRAMMING`, `MPSolver.createSolver('KNAPSACK')`, and
the proto solve path for knapsack-shaped 0-1 models.

## Set Cover

The Set Cover API provides weighted covering models, solution invariants, and
heuristic searches. The runtime is loaded lazily and execution is selected per
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

Use `SetCoverInvariant` and a solution generator for iterative or focused
search. The one-shot result is independent of that mutable search state.

`nextSolution(focus?, options?)` accepts `executor`, `signal`, and `onEvent`.
`executor` supports `direct`, `worker`, `server`, `cloud`, and `auto`; the
default is `auto`. There is no global initializer or executor setting.

`SetCoverModel` exposes:

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
- `computeCostStats()`, `computeRowStats()`, `computeColumnStats()`
- `computeRowDeciles()`, `computeColumnDeciles()`

Costs must be finite. Element and subset indices must be nonnegative and below
`2_147_483_647`, reserving the native int32 count boundary. Imports and rejected
setters leave the model unchanged. Native floating-point results, including
overflowing costs, are preserved across executors.

`SetCoverInvariant` exposes:

- `initialize()`, `clear()`, `model()`, `setModel(model)`
- `cost()`, `numUncoveredElements()`, `isSelected()`, `coverage()`
- `numFreeElements()`, `numCoverageLe1Elements()`
- `computeCoverageInFocus(focus)`, `isRedundant()`, `computeIsRedundant(subset)`
- `trace()`, `clearTrace()`, `compressTrace()`
- `loadSolution(solution)`
- `select(subset)`, `deselect(subset)`
- `exportSolutionAsProto()`, `importSolutionFromProto(proto)`

`inspect(options?)` returns a detached `SetCoverInspection` with native cost,
selection, coverage, free elements and redundancy. Read several fields from one
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

`await invariant.compressTrace({ executor })` calls native trace compression,
preserving first occurrence order for subsets whose final trace decision selects
them. It changes only the trace; an empty trace stays empty. `setModel(model)`
resets the selection and trace for the replacement model.

Available generators and searches:

- `TrivialSolutionGenerator`
- `RandomSolutionGenerator`
- `GreedySolutionGenerator`
- `ElementDegreeSolutionGenerator`
- `LazyElementDegreeSolutionGenerator`
- `SteepestSearch`
- `GuidedLocalSearch`
- `GuidedTabuSearch`

All expose `nextSolution()`, `setMaxIterations()`,
`setTimeLimitInSeconds(seconds)` and `resetLimits()`. Steepest and guided searches
honor iteration limits; construction generators ignore them as native OR-Tools
does. Time settings are forwarded, but the pinned OR-Tools Set Cover heuristics
do not implement time-limit enforcement. Use executor cancellation when needed.
Set a finite iteration limit for bounded guided search.
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
search time accumulates across calls. Time settings are forwarded without adding
timeout behavior to the native heuristic. Setters forward only changed settings, so ordinary calls do not
reset the native tabu list.

Always await `close()` to release the native session. Close is idempotent and waits
for an active operation; it cannot be called from that operation's event handler.
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
a TypeScript convenience, including the new `iqr` field.

Set Cover is single-threaded. Worker cancellation terminates and recreates the
worker because the native heuristic has no interruption hook. Direct native
search cannot be interrupted. Concurrent searches sharing an invariant are
rejected, as are overlapping jobs on the singleton direct or worker executor.

## RCPSP

The dedicated RCPSP API provides a Python-like parser surface for
`ortools.scheduling.python.rcpsp` and a higher-level TypeScript project
scheduling builder that compiles to CP-SAT scheduling constraints.

```ts
import { RcpspModelBuilder } from 'or-tools-wasm/rcpsp';

const project = new RcpspModelBuilder('house_project')
  .addResource({ name: 'crew', capacity: 3 })
  .addActivity({ name: 'site', duration: 3, demands: { crew: 2 }, successors: ['frame'] })
  .addActivity({ name: 'permit', duration: 2, demands: { crew: 1 }, successors: ['wire'] })
  .addActivity({ name: 'frame', duration: 4, demands: { crew: 2 }, successors: ['inspect'] })
  .addActivity({ name: 'wire', duration: 2, demands: { crew: 1 }, successors: ['inspect'] })
  .addActivity({ name: 'inspect', duration: 1, demands: { crew: 1 } })
  .build();

const result = await project.solve({
  numWorkers: 4,
  maxTimeInSeconds: 5,
  executor: 'worker',
});
console.log(result.statusName, result.makespan, result.tasks);
```

RCPSP reuses the CP-SAT solve path instead of loading a separate native runtime.
The runtime is loaded lazily by `solve()`, and `executor` is selected per call.

`RcpspModelBuilder` exposes:

- `addResource({ name, capacity, renewable? })`
- `addActivity({ name, duration, demands?, successors? })`
- `build(): RcpspProblem`

Builder and parsed RCPSP quantities are safe-integer `number` values; unsafe
numbers and unsafe aggregate demands/horizons are rejected instead of being
rounded. Builder inputs are captured, rejected resources reserve no name, and
`source`/`sink` are reserved activity names. Solved schedule times are exact `bigint` values.

`RcpspProblem` exposes:

- `RcpspProblem.fromProto(proto)`
- `RcpspProblem.fromPsplib(text)`
- properties: `name`, `resources`, `tasks`, `horizon`
- `exportModelAsProto()`
- `toCpSatModel()`
- `solve(options?: RcpspSolveOptions): Promise<RcpspSolveResult>`

`RcpspSolveResult` contains:

- `status` and `statusName`
- `makespan` as an exact `bigint`, or `null` when no schedule was found
- `objectiveValue`
- scheduled `tasks` with exact `bigint` `start` and `end` values, plus `name`,
  `duration`, `demands`, and `successors`
- `resourceCapacities` as exact `bigint` values for resource investment, otherwise `null`
- the native CP-SAT `response`

Use `problem.toCpSatModel()` for the generated CP-SAT model. Each `solve()` builds
an independent model and callback state; concurrent calls obey executor limits.

Pass file contents directly to `RcpspProblem.fromPsplib(text)` to get a reusable
problem. Native filesystem helpers are not exposed.

`RcpspModelBuilder` builds ordinary projects. `RcpspProblem.fromProto()` also
supports multimode recipes, nonrenewable budgets, and recipe-dependent
RCPSP/Max start-to-start delays (including negative delays).

- With `isConsumerProducer: true`, all resources use reservoir level bounds
  `minCapacity` / `maxCapacity`. Tasks have zero duration and signed demands
  at their starts; only the selected recipe contributes. Simultaneous events
  are aggregated. Bounds excluding zero require sufficient events at time zero.
  A fixed time-zero offset translates these bounds into native reservoir bounds.
- With `isResourceInvestment: true`, native cumulative constraints use decision
  capacities and the objective is `sum(unitCost * capacity)`. Every task finishes
  by `deadline`; zero is a literal deadline for this variant. `maxCapacity: -1`
  uses the sum of each task's largest recipe demand as the capacity upper bound.
  Resources are renewable for investment, and unit costs must be nonnegative.
  `makespan` still reports the maximum task end but is not minimized.

```ts
import { RcpspProblem } from 'or-tools-wasm/rcpsp';

const investment = RcpspProblem.fromProto({
  isResourceInvestment: true,
  deadline: 2,
  resources: [{ maxCapacity: -1, unitCost: 4 }],
  tasks: [
    { recipes: [{ duration: 2, demands: [2] }] },
    { recipes: [{ duration: 2, demands: [3] }] },
  ],
});
const purchased = await investment.solve({ executor: 'worker', numWorkers: 1 });
console.log(purchased.statusName, purchased.resourceCapacities, purchased.objectiveValue);
// OPTIMAL, [5n], 20
```

Solution events include `tasks`, `makespan`, `objectiveValue` and
`resourceCapacities` with the same meanings as the final result. These variants
share CP-SAT's direct, worker and server execution path; no separate scheduling
search is implemented by the library.

Solve options use the same shape as `CpSolver.solve()`: CP-SAT parameters,
`executor`, `signal`, `eventMask`, and `onEvent` share one object. Overlapping
calls on one `RcpspProblem` are rejected. Direct and worker execution otherwise
inherit CP-SAT's concurrency and cancellation behavior.

## Network Flow

The dedicated Network Flow API provides camelCase builders for
`SimpleMaxFlow`, `SimpleMinCostFlow`, and `SimpleLinearSumAssignment`. Like
CP-SAT, the runtime is loaded lazily and execution is selected per solve.

```ts
import { asNumber, SimpleMaxFlow, SimpleMaxFlowStatus } from 'or-tools-wasm/network-flow';

const maxFlow = new SimpleMaxFlow();
const arcs = maxFlow.addArcsWithCapacity(
  [0, 0, 0, 1, 1, 2, 2, 3, 3],
  [1, 2, 3, 2, 4, 3, 4, 2, 4],
  [20, 30, 10, 40, 30, 10, 20, 5, 20],
);
const result = await maxFlow.solve({ source: 0, sink: 4, executor: 'worker' });
if (result.status === SimpleMaxFlowStatus.OPTIMAL) {
  console.log(asNumber(result.optimalFlow), arcs.map((arc) => result.flow(arc)));
}
```

`solve(options)` on each Network Flow class returns an independent
`MaxFlowResult`, `MinCostFlowResult`, or `LinearSumAssignmentResult` snapshot.
This replaces the earlier status-only return and mutable result accessors. Read
the status, objective, flows, cuts, and assignments from the returned result.

Every solve accepts `executor`, `signal`, and `onEvent`. `executor` supports
the shared `direct`, `worker`, `server`, `cloud`, and `auto` selections. The
default is `auto`; browser main-thread calls select a worker while environments
without browser workers select direct execution. There is no global initializer
or executor setting.

Capacity, supply and cost inputs accept `IntValue`; numeric results are
`bigint`. Node and arc indexes remain checked `number` values. Arc endpoints
must be nonnegative and at most `2_147_483_645` for max-flow,
`2_147_483_643` for min-cost flow (including supply nodes), or `1_073_741_822`
for assignment. These limits reserve native graph nodes and sentinels.
Max-flow source/sink values remain nonnegative int32 inputs with native status
semantics. Arc insertion and supply conversion validate before changing state.
Check native range/overflow statuses before reading flows or assignments.

`SimpleMaxFlow` exposes:

- `SimpleMaxFlowStatus`: `OPTIMAL`, `POSSIBLE_OVERFLOW`, `BAD_INPUT`, `BAD_RESULT`
- `addArcWithCapacity(tail, head, capacity): number`
- `addArcsWithCapacity(tails, heads, capacities): number[]`
- `setArcCapacity(arc, capacity): void`
- `setArcsCapacity(arcs, capacities): void`
- `numNodes(): number`
- `numArcs(): number`
- `tail(arc)`, `head(arc): number`
- `capacity(arc): bigint`
- `solve({ source, sink, ...options }): Promise<MaxFlowResult>`

`MaxFlowResult` exposes `status`, `optimalFlow`, `flow(arc)`, `flows(arcs)`,
`getSourceSideMinCut()`, and `getSinkSideMinCut()`.

`SimpleMinCostFlow` exposes:

- `SimpleMinCostFlowStatus`: `NOT_SOLVED`, `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`,
  `UNBALANCED`, `BAD_RESULT`, `BAD_COST_RANGE`, `BAD_CAPACITY_RANGE`
- `addArcWithCapacityAndUnitCost(tail, head, capacity, unitCost): number`
- `addArcsWithCapacityAndUnitCost(tails, heads, capacities, unitCosts): number[]`
- `setArcCapacity(arc, capacity): void`
- `setArcCapacities(arcs, capacities): void`
- `setNodeSupply(node, supply): void`
- `setNodesSupplies(nodes, supplies): void`
- `numNodes()`, `numArcs()`, `tail(arc)`, `head(arc)`, `capacity(arc)`
- `supply(node)`, `unitCost(arc)`
- `solve(options?): Promise<MinCostFlowResult>`
- pass `maxFlowWithMinCost: true` to request maximum flow with minimum cost

`MinCostFlowResult` exposes `status`, `optimalCost`, `maximumFlow`, `flow(arc)`,
and `flows(arcs)`.

`SimpleLinearSumAssignment` exposes:

- `SimpleLinearSumAssignmentStatus`: `OPTIMAL`, `INFEASIBLE`, `POSSIBLE_OVERFLOW`
- `addArcWithCost(leftNode, rightNode, cost): number`
- `addArcsWithCost(leftNodes, rightNodes, costs): number[]`
- `numNodes(): number`
- `numArcs(): number`
- `leftNode(arc): number`
- `rightNode(arc): number`
- `cost(arc): bigint`
- `solve(options?): Promise<LinearSumAssignmentResult>`

`LinearSumAssignmentResult` exposes `status`, `optimalCost`, `rightMate(leftNode)`,
and `assignmentCost(leftNode)`.

Network Flow algorithms are single-threaded, so there is no solver thread-count
parameter. A worker solve can be cancelled by terminating its worker; the
underlying direct native solve has no cancellation hook. Concurrent solves on
the same solver instance are rejected, and the singleton direct and worker
executors each reject overlapping jobs. Lifecycle events use the same
`SolverJobEvent` shape as CP-SAT.

## MathOpt

Import:

```ts
import { GScipParameters, GlpkParameters, MathOpt, MathOptModel, MathOptObjective } from 'or-tools-wasm/mathopt';
```

Build a model and solve:

```ts
const model = MathOpt.Model('basic');
const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
const y = model.addVariable({ lowerBound: 0, upperBound: 2, name: 'y' });
model.addLinearConstraint({
  upperBound: 1.5,
  terms: [MathOpt.linearTerm(x), MathOpt.linearTerm(y)],
});
model.maximize([MathOpt.linearTerm(x, 2), MathOpt.linearTerm(y)]);

const result = await MathOpt.solve(model, {
  executor: 'worker',
  solverType: MathOpt.SolverType.GLOP,
});
if (result.hasSolution) console.log(result.value(x), result.objectiveValue);
```

The runtime is loaded lazily. Select `auto`, `direct`, `worker`, `server`, or
`cloud` per solve with the `executor` option.

`MathOpt.solveProto(modelProtoOrBytes, options?)` solves a typed `MathOptModelProto`
object or binary `ModelProto` directly through the same native solver. It follows
CP-SAT's raw-proto naming and uses the existing executor, parameter, callback,
logging, interruption and cancellation paths. It performs no editable-model
reconstruction and forwards binary input unchanged, including unknown fields.
Native validation and backend capability errors remain authoritative.

```ts
const { bytes, response, messages } = await MathOpt.solveProto({
  variables: { ids: [7n], lowerBounds: [1], upperBounds: [2], integers: [false] },
  objective: { maximize: true, linearCoefficients: { ids: [7n], values: [1] } },
}, { executor: 'worker', solverType: MathOpt.SolverType.GLOP });
console.log(response.termination?.reason);
console.log(response.solutions?.[0]?.primalSolution?.variableValues);
```

The result type is `MathOptProtoSolveResult`: `bytes` holds the native
`SolveResultProto`, `response` is its typed `MathOptSolveResultProto` decoding,
and `messages` contains native logs. It retains the full native solution, ray,
basis, termination, statistics and backend-output fields. Int64 IDs/counters stay
exact as `number | bigint`; sparse vectors retain IDs rather than resolving names
or creating variable objects. Inputs are snapshotted before awaiting, and each
result owns its bytes and decoded data independently. Save `bytes` directly or
pass them to `MathOpt.parseSolveResult(bytes, model, options?)` when an editable
model and high-level accessors are wanted.

`MathOptProtoSolveOptions` has the same controls as `MathOptSolveOptions` except
`removeNames`: names are part of the supplied proto. Prepare nameless bytes with
`model.encodeModelProto({ removeNames: true })` when needed. This is a one-shot API;
persistent raw sessions use `MathOpt.ProtoIncrementalSolver`:

```ts
const solver = new MathOpt.ProtoIncrementalSolver(modelProtoOrBytes,
  MathOpt.SolverType.GLOP, { executor: 'worker', threads: 1 });
try {
  const first = await solver.solve();
  const applied = await solver.update({
    variableUpdates: { upperBounds: { ids: [7n], values: [2.5] } },
  });
  if (applied) console.log((await solver.solve()).response.solutions);
} finally {
  await solver.close();
}
```

`MathOptProtoIncrementalSolver` is the named export. It eagerly creates one
native solver and fixes its executor. `solve(options?)` returns
`MathOptProtoSolveResult`; `update(protoOrBytes, options?)` forwards a typed
`MathOptModelUpdateProto` or binary update. Inputs are snapshotted before awaiting.

The update boolean is authoritative: `true` applies the update; `false` retires
the native solver because that backend cannot apply it incrementally. After
`false` or native failure, close and create a new session from the desired full
model. The raw API does not rebuild automatically. CP-SAT and PDLP currently
return `false`; supported updates for other backends are decided natively.
GLPK server sessions are unsupported because their environment is thread-owned.

Always await `close()` in `finally`. Close is idempotent and waits for active
work. Operations cannot overlap, and close cannot run inside a callback.
Direct/worker runtime replacement requires a new session. The editable
`MathOpt.IncrementalSolver` derives updates from model edits and can rebuild
when a backend declines an update; the raw class leaves that decision to callers.

### `MathOpt`

Static constructors and aliases include:

- `MathOpt.Model(name?)`, `MathOpt.SolverType`, `MathOpt.LPAlgorithm`, `MathOpt.Emphasis`
- `MathOpt.LinearExpression`, `MathOpt.QuadraticExpression`, `MathOpt.QuadraticTermKey`,
  `MathOpt.BoundedExpression`, `MathOpt.LowerBoundedExpression`,
  `MathOpt.UpperBoundedExpression`
- `MathOpt.IncrementalSolver`, `MathOpt.ProtoIncrementalSolver`, `MathOpt.SolveInterrupter`
- `MathOpt.ModelSolveParameters`, `MathOpt.SparseVectorFilter`, `MathOpt.SolutionHint`
- `MathOpt.GScipParameters`, `MathOpt.GlopParameters`, `MathOpt.PdlpParameters`,
  `MathOpt.GlpkParameters` and their backend parameter enums

Model, constraint, parameter and incremental-solver classes are also exported
by name from this subpath. The declarations include the high-level option/result
types and the raw `MathOptModelProto`, `MathOptModelUpdateProto` and
`MathOptSolveResultProto` types.

Solving:

- `MathOpt.solve(model, options?): Promise<MathOptSolveResult>`
- `MathOpt.encodeSolveRequest(model, options?): Uint8Array`
- `new MathOpt.IncrementalSolver(model, solverType?, options?)`
- `incrementalSolver.solve(options?): Promise<MathOptSolveResult>`
- `incrementalSolver.close(): Promise<void>`

`MathOptSolveOptions`:

- `executor?: ExecutorSelection` (server execution requires `{ type: 'server', url }`)
- `solverType?: MathOptSolverType | keyof typeof MathOptSolverType`
- `removeNames?: boolean`
- `interrupter?: MathOptSolveInterrupter | MathOptSolveInterrupterLike`
- `messageCallback?: (messages: string[]) => void`
- `modelParameters?: Uint8Array | MathOptModelSolveParameters | MathOptModelSolveParametersOptions`
- `timeLimitSeconds?: number`
- `threads?: number`
- `iterationLimit?: number | bigint`
- `nodeLimit?: number | bigint`
- `cutoffLimit?: number`
- `objectiveLimit?: number`
- `bestBoundLimit?: number`
- `solutionLimit?: number`
- `enableOutput?: boolean`
- `randomSeed?: number`
- `absoluteGapTolerance?: number`
- `relativeGapTolerance?: number`
- `solutionPoolSize?: number`
- `lpAlgorithm?: MathOptLPAlgorithm | keyof typeof MathOptLPAlgorithm`
- `presolve?: MathOptEmphasis | keyof typeof MathOptEmphasis`
- `cuts?: MathOptEmphasis | keyof typeof MathOptEmphasis`
- `heuristics?: MathOptEmphasis | keyof typeof MathOptEmphasis`
- `scaling?: MathOptEmphasis | keyof typeof MathOptEmphasis`
- `gscip?: GScipParameters | GScipParametersOptions | Uint8Array`
- `glop?: GlopParameters | GlopParametersOptions | Uint8Array`
- `cpSat?: SatParameters | Uint8Array`
- `pdlp?: PdlpParameters | PdlpParametersOptions | Uint8Array`
- `glpk?: GlpkParameters | GlpkParametersOptions | Uint8Array`
- `callbackRegistration?: MathOptCallbackRegistration | Uint8Array`
- `callback?: MathOptCallback`
- `onEvent?: (event: MathOptEvent) => void | Promise<void>`
- `signal?: AbortSignal`

`removeNames` omits model, variable, linear constraint, and
quadratic and indicator constraint names from the encoded `ModelProto`, matching upstream
MathOpt `solve(remove_names=True)` behavior for models with duplicate names.

`messageCallback` receives native batches of solver log lines during search.
It runs synchronously in direct mode; worker and server modes deliver batches
through the existing one-way event channel. Passing a handler enables native
output unless `enableOutput: false` is explicit. The same lines remain on
`MathOptSolveResult.messages`, and completion does not replay them to the handler.

`messageCallback` must return synchronously. Use `onEvent` for asynchronous
observers; log events have `{ type: 'log', messages: string[] }` and retain ordered,
awaited delivery. An `onEvent` handler receives logs when native output is enabled.
Handler failures suppress subsequent callbacks, preserve the original error and
settle after native work, allowing incremental updates to commit. Closing an
incremental session inside its message callback rejects. Logs require no reply
handshake or callback transport deadline.

`MathOpt.SolveInterrupter` requests native termination before or during a solve
through `interrupt()`. Its `interrupted` property and `isInterrupted()` report
the state. It cannot be reset; create a new interrupter for a new search.
Interruption returns a native result with its termination limit, while aborting
the separate `signal` rejects the operation.

#### Full, Incremental, And Filtered Solves

`MathOpt.solve(model, options?)` is the stateless/full solve path. It encodes
the current model into a `SolveRequest`, solves it, and does not keep a native
solver handle for later reuse. Use `MathOpt.encodeSolveRequest(model, options?)`
when you need the raw proto-oriented request bytes.

`MathOpt.IncrementalSolver` keeps a native MathOpt solver handle alive across
solves. GLPK incremental sessions require a stable execution thread and are
supported in direct/worker execution; server creation rejects this combination
because its job thread exits after creation, destroying GLPK's native environment.
Ordinary GLPK server solves remain supported. Construct an incremental solver
with the `MathOptModel` instance you intend to mutate, then call `solve()` after
each model edit:

```ts
const model = MathOpt.Model('rolling_lp');
const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
model.maximize([{ variable: x, coefficient: 2 }]);

const controller = new AbortController();
const solver = new MathOpt.IncrementalSolver(model, MathOpt.SolverType.GLOP, {
  presolve: MathOpt.Emphasis.OFF,
  executor: 'worker',
  signal: controller.signal,
});

try {
  let result = await solver.solve();

  x.upperBound = 3;
  result = await solver.solve(); // sends the bound update to the native solver
} finally {
  controller.abort(); // cancel an active solve, if any
  await solver.close();
}
```

Tracked incremental updates include variable bounds/integrality, linear
constraint bounds, objective changes, new/deleted variables and linear
constraints, matrix coefficient changes, and new/deleted indicator and quadratic constraints.
Constructor options are used as defaults for every solve; per-call `solve()`
options override those defaults except for executor placement and solver type,
which are fixed by the incremental solver. `removeNames` is also fixed at
construction and is excluded from per-call solve options. `close()` waits for initialization
and any active solve, releases the native handle independently of the solve's
abort signal, and is safe to call more than once. If deletion fails, the handle
is retained and a later `close()` retries it. Do not call `close()` while one of
that solver's callbacks is running.

`solve()` accepts the solver settings from `MathOpt.solve()` (excluding the
fixed executor, solver type and `removeNames`), including
message callbacks, `ModelSolveParameters`, backend-specific parameters, and
pre-interrupted solve interrupters. If a backend rejects an
incremental model update but can solve the current full model, the wrapper
recreates the native solver and solves from that current full model. This keeps
callers on one API for backends with limited update support, while still
surfacing errors from invalid full models. Duplicate names are rejected for
incremental solvers unless `removeNames` is set.

A failed initialization is reported by `solve()`, even when initialization
failed before that call. Close the instance and construct a new one to retry.

A failed native update or solve leaves the underlying OR-Tools incremental
solver unusable. Further `solve()` calls reject explicitly; call `close()` and
construct a new incremental solver. Errors raised by `onEvent` after the native
operation succeeds do not poison the solver, because its submitted checkpoint
has already been committed.

`ModelSolveParameters` can request a filtered result. This is a result-size
filter, not a separate partial optimization model: the solver still optimizes
the full model, but only selected vectors are returned.

```ts
const result = await MathOpt.solve(model, {
  solverType: MathOpt.SolverType.GLOP,
  modelParameters: MathOpt.ModelSolveParameters.onlySomePrimalVariables([x]),
});
```

For finer control, pass filters directly:

```ts
const result = await solver.solve({
  modelParameters: new MathOpt.ModelSolveParameters({
    variableValuesFilter: { elements: [x, y], filterByIds: true },
    dualValuesFilter: { elements: [demand], filterByIds: true },
    reducedCostsFilter: { skipZeroValues: true },
  }),
});
```

The non-incremental `MathOpt.solve()` and proto-oriented `encodeSolveRequest()`
paths remain available alongside `MathOpt.IncrementalSolver`.

Backend-specific parameter wrappers encode the corresponding upstream MathOpt
solver-specific proto fields:

- `GScipParameters`: emphasis, meta parameters, raw SCIP bool/int/long/real/char/string maps, output controls, `numSolutions`, and `objectiveLimit`
- `GlopParameters`: `useScaling`, `maxTimeInSeconds`, `useDualSimplex`, and `usePreprocessing`
- `PdlpParameters`: termination criteria, sharding, scheduler, logging, restart, rescaling, linesearch, trust-region, and feasibility-polishing controls
- `GlpkParameters`: `computeUnboundRaysIfPossible`

`cpSat` accepts a `SatParameters`-shaped object for backend-specific settings
such as `maxTimeInSeconds`, `randomSeed`, and logging flags, or raw `Uint8Array`
proto bytes for advanced callers. Use the top-level `threads` option for the common thread budget. Native
backend-specific worker fields may override it: CP-SAT `numWorkers` (or
`numSearchWorkers` when modern workers are zero), PDLP `numThreads`, GLOP
`numOmpThreads` and SCIP `intParams['parallel/maxnthreads']`. Requests beyond
the server/WASM capacity reject before allocation. Iteration/node limits and
SCIP long parameters preserve exact int64 values, including bigint inputs.

`modelParameters` and each backend parameter option may be raw serialized proto
bytes. This preserves a proto escape hatch for backend fields that do not yet
have ergonomic TypeScript wrappers.

`MathOpt.ModelSolveParameters` encodes model-specific solve controls:

- `variableValuesFilter`
- `dualValuesFilter`
- `reducedCostsFilter`
- `quadraticDualValuesFilter`
- `initialBasis` as raw `BasisProto` bytes
- `solutionHints` — primal entries use `{ variable, value }`; dual entries use `{ linearConstraint, value }`
- `branchingPriorities`
- `lazyLinearConstraints`
- `objectiveParameters`: a `ReadonlyMap` from primary/auxiliary objective handles
  to `MathOptObjectiveParameters`, options objects or protobuf bytes
- `onlySomePrimalVariables(variables)` as a convenience constructor for
  filtering returned primal variable values

`MathOpt.SparseVectorFilter` accepts `skipZeroValues`, `filterByIds`, and
either numeric `ids` or variable/linear-constraint `elements`, not both.
An explicit selection (`[]`, `{ ids: [] }` or `{ elements: [] }`) selects no
values. Omitting the selection returns all values; `filterByIds: false`
explicitly disables selection. Handle inputs in filters, hints, priorities and
lazy constraints must be live members of the model being solved. Raw numeric
IDs and protobuf bytes are validated by native code. `MathOpt.SolutionHint`
accepts primal variable values and dual linear constraint values.

`MathOpt.ObjectiveParameters` accepts `objectiveDegradationAbsoluteTolerance`,
`objectiveDegradationRelativeTolerance` and `timeLimitSeconds`. These settings
are passed to native multiobjective solving; the built GLOP, GLPK, GSCIP,
CP-SAT and PDLP adapters reject them explicitly.

MathOpt IIS computation is unavailable in the bundled GLOP, GLPK, GSCIP,
CP-SAT and PDLP adapters, so the library does not expose a MathOpt IIS method.
MPSolver's SCIP IIS API is a separate native integration; it does not provide
MathOpt model IDs or constraint-family support.

`GlpkParameters` mirrors the upstream MathOpt GLPK-specific solve parameters:

- `computeUnboundRaysIfPossible?: boolean`

GLPK is single-threaded in this package. MathOpt GLPK solves reject
`threads > 1`; omit `threads` or pass `threads: 1`.

`MathOptSolveResult`:

- `terminationReason: string`
- `terminationDetail: string`: native stopping diagnostic
- `terminationLimit: string | null`
- `solveTimeSeconds: number | null`
- `solveStats: MathOptSolveStats`: solve time and exact bigint simplex, barrier,
  first-order iteration and node counters
- `gscipSpecificOutput`, `pdlpSpecificOutput`, `osqpSpecificOutput`: typed native
  backend output, or `null` when absent; OSQP is not linked in the default build
- `primalBound: number | null`
- `dualBound: number | null`
- `primalStatus: string | null`
- `dualStatus: string | null`
- `primalOrDualInfeasible: boolean`
- `objectiveValue: number | null`
- `hasSolution: boolean`
- `value(variable: MathOptVariable): number` (throws for a foreign or missing variable)
- `variableValuesById: Record<number, number>`
- `solutions: MathOptSolutionResult[]`
- `primalRays: MathOptPrimalRayResult[]`
- `dualRays: MathOptDualRayResult[]`
- `messages: string[]`
- `rawResponse: Uint8Array` (RPC response bytes)
- `toProtoBytes(): Uint8Array` (independent native `SolveResultProto` bytes)

Saved results can be loaded with native validation:

```ts
const saved = result.toProtoBytes();
const restored = await MathOpt.parseSolveResult(saved, model, {
  executor: 'worker',
  modelParameters, // Use the same filters as the original solve, if any.
});
```

`parseSolveResult(bytes, model, options?)` is awaitable and accepts execution
options plus `modelParameters`. Native validators check the model, filters,
solutions, rays, basis, IDs, values and result metadata before decoding. Pass the
original model parameters for filtered results. Imported results preserve omitted
entries; they do not fill them with zero. Input bytes and model names are
snapshotted before awaiting execution, and valid protobuf encodings are normalized
natively. IDs that are absent from the supplied model are rejected.

For standalone data, `MathOpt.convertSolutionProto(kind, input, model, options?)`
accepts `primalSolution`, `dualSolution`, `basis`, `primalRay`, `dualRay` or
`solution`. The model can be editable, a typed `MathOptModelProto`, or bytes.
`MathOpt.convertResultProto(kind, input, options?)` accepts `problemStatus`,
`objectiveBounds`, `solveStats` or `termination`. Both accept typed protos or
bytes and return `{ bytes, proto }` with an inferred proto type. They use native
C++ `FromProto`/`Proto` semantics, including ID checks and optional fields;
conversion does not certify mathematical feasibility. Native normalization can
drop unknown/deprecated fields. Inputs are captured before awaiting, and returned
bytes/data are independent. Options are `executor`, `signal` and `onEvent`.

```ts
const converted = await MathOpt.convertSolutionProto('primalRay', {
  variableValues: { ids: [x.id], values: [1] },
}, model, { executor: 'worker' });
const restoredRay = await MathOpt.convertSolutionProto('primalRay', converted.bytes,
  model, { executor: 'worker' });
```

`MathOptSolutionResult`:

- `primalSolution: MathOptPrimalSolutionResult | null`
- `dualSolution: MathOptDualSolutionResult | null`
- `basis: MathOptBasisResult | null`

Result vectors are keyed by native IDs, so unnamed or repeated names do not
lose entries. Read a primal value with `result.value(variable)` or
`result.variableValuesById[variable.id]`.

`MathOptPrimalSolutionResult`:

- `objectiveValue: number | null`
- `variableValuesById: Record<number, number>`
- `auxiliaryObjectiveValuesById: Record<number, number>`
- `feasibilityStatus: string`

`MathOptDualSolutionResult`:

- `objectiveValue: number | null`
- `dualValuesById: Record<number, number>`
- `quadraticDualValuesById: Record<number, number>`
- `reducedCostsById: Record<number, number>`
- `feasibilityStatus: string`

`MathOptPrimalRayResult`:

- `variableValuesById: Record<number, number>`

`MathOptDualRayResult`:

- `dualValuesById: Record<number, number>`
- `reducedCostsById: Record<number, number>`

`MathOptBasisResult`:

- `variableStatusById: Record<number, string>`
- `constraintStatusById: Record<number, string>`
- `basicDualFeasibility: string`

Solver type enum:

- `GSCIP`
- `GUROBI`
- `GLOP`
- `CP_SAT`
- `PDLP`
- `GLPK`
- `OSQP`
- `ECOS`
- `SCS`
- `HIGHS`
- `SANTORINI`
- `XPRESS`

The default package runtime currently includes `GLOP`, `GLPK`, `GSCIP`,
`CP_SAT`, and `PDLP`. Other enum values are exported for API/proto parity but
return an unavailable-solver error unless a custom build links the corresponding
native backend.

Expression helpers:

- `linearTerm(variable, coefficient?)`
- `quadraticTerm(firstVariable, secondVariable, coefficient?)`
- `linearExpression(terms?, offset?)`
- `quadraticExpression(linearTerms?, quadraticTerms?, offset?)`
- `asFlatLinearExpression(input)`
- `asFlatQuadraticExpression(input)`
- `fastSum(inputs)`
- `multiplyLinearExpressions(lhs, rhs)`
- `evaluateExpression(expression, variableValues)`
- `boundedExpression(lowerBound, expression, upperBound)`
- `lowerBoundedExpression(lowerBound, expression)`
- `upperBoundedExpression(expression, upperBound)`
- `eq(lhs, rhs)`
- `le(lhs, rhs)`
- `ge(lhs, rhs)`
- `completeUpperBound(lowerBounded, upperBound)`
- `completeLowerBound(lowerBound, upperBounded)`

These helpers are available as `MathOpt.*` static methods. Some helper classes
are exposed as `MathOpt.LinearExpression`, `MathOpt.QuadraticExpression`, etc.,
rather than as top-level value exports.

### MathOpt native callbacks

Ordinary and incremental solves accept `callbackRegistration` and `callback`
together. Registration uses the vendored `CallbackRegistrationProto` shape or
serialized proto bytes. `MathOptCallbackEventProto` exposes native event values;
native backends validate supported events and variable filters.

```ts
import { MathOpt, MathOptCallbackEventProto } from 'or-tools-wasm/mathopt';

const result = await MathOpt.solve(model, {
  executor: 'worker',
  solverType: MathOpt.SolverType.CP_SAT,
  callbackRegistration: {
    requestRegistration: [MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION],
    mipSolutionFilter: { filterByIds: true, filteredIds: [x.id, y.id] },
  },
  callback: data => {
    console.log(data.primalSolutionVector, data.mipStats);
    return { terminate: true };
  },
});
```

The handler runs during native search and returns synchronously. Returning
`undefined` continues search; `{ terminate: true }` returns native termination
through `CallbackResultProto`. The same handler contract applies to direct,
worker and server execution, including Node, Deno, Bun and browsers using JSPI
or Asyncify. Promise returns reject. Direct execution runs the handler locally;
worker/server execution waits for a correlated callback reply before native
search continues. Callback-enabled server solves use short polling requests so
concurrent browser solves leave HTTP connections available for callback replies.
Idle callback polls wait at most 20 ms (less if `statusIntervalMs` is smaller),
and each callback reply triggers an immediate event poll.
Remote callback waits expire after 30 seconds without a reply;
cancellation wakes pending waits, and transport failures reject the solve.
Reply transmission also has a 30-second deadline. Timeout rejects with
`TIMEOUT` and requests native cancellation.

`MathOptCallbackData` is a detached native-proto snapshot with numeric events,
exact `bigint` int64 fields and the statistics/solution vectors supplied by the
backend. Optional native messages remain absent when the backend omits them.
Handler exceptions stop native work and preserve the original JavaScript error.
Incremental solves commit applied model updates before reporting a handler
exception, so the session remains reusable. Closing an incremental solver from
inside its callback rejects.

`MathOptCallbackResult` exposes the full native `CallbackResultProto`:
`terminate`, `cuts` and `suggestedSolutions`. Both user cuts and lazy constraints
use `cuts`; each entry carries `linearExpression: { ids, values }`, `lowerBound`,
`upperBound` and `isLazy`. Suggested solutions use sparse `{ ids, values }`
vectors. IDs must be sorted and paired with their values. Bounds follow native
protobuf defaults (zero); set unbounded sides explicitly to `-Infinity` or
`Infinity`. Native validation checks IDs, vector lengths, bounds, registration
permissions and event/backend support.

| Reply | Event and registration | Built backend behavior |
| --- | --- | --- |
| User cut (`isLazy: false`) | `MIP_NODE`, `addCuts: true` | SCIP supports it. |
| Lazy constraint (`isLazy: true`) | `MIP_NODE` or `MIP_SOLUTION`, `addLazyConstraints: true` | SCIP supports it; CP-SAT rejects lazy-constraint registration. |
| Suggested solution | `MIP_NODE` | The field is typed and forwarded; current SCIP MathOpt rejects it as unimplemented. CP-SAT does not support the required node event. |

For example, add capacity only when a candidate violates it:

```ts
const model = MathOpt.Model('lazy capacity');
const x = model.addBinaryVariable({ name: 'x' });
const y = model.addBinaryVariable({ name: 'y' });
model.maximize([{ variable: x, coefficient: 1 }, { variable: y, coefficient: 2 }]);
const result = await MathOpt.solve(model, {
  executor: 'worker',
  solverType: MathOpt.SolverType.GSCIP,
  callbackRegistration: {
    requestRegistration: [MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION],
    addLazyConstraints: true,
  },
  callback: data => {
    const sum = (data.primalSolutionVector?.values ?? []).reduce((a, b) => a + b, 0);
    if (sum > 1 + 1e-6) return { cuts: [{
      linearExpression: { ids: [x.id, y.id], values: [1, 1] },
      lowerBound: -Infinity, upperBound: 1, isLazy: true,
    }] };
  },
});
console.log(result.objectiveValue); // 2
```

Generated constraints belong to the current solve; they do not add rows to the
editable `MathOptModel`. Native callback schemas and
`encodeMathOptCallbackRegistration`, `decodeMathOptCallbackData` and
`encodeMathOptCallbackResult` remain exported, and a callback may return native
result bytes for proto interoperability.

### `MathOptModel`

`MathOpt.Model(name?, options?: MathOptModelOptions)` creates an editable model;
`options.primaryObjectiveName` sets the primary objective name.

Variables:

Variable and constraint handles have private constructors. Obtain them through
the model's `add...()`, `get...()` and collection methods.

- `addVariable(options?): MathOptVariable`
- `addIntegerVariable(options?): MathOptVariable`
- `addBinaryVariable(options?): MathOptVariable`
- `deleteVariable(variable): void`
- `variables(): MathOptVariable[]`
- `getNumVariables(): number`
- `getNextVariableId(): number`
- `ensureNextVariableIdAtLeast(id): void`
- `hasVariable(id): boolean`
- `getVariable(id): MathOptVariable | undefined`

Linear constraints:

- `addLinearConstraint(options?): MathOptLinearConstraint`
- `deleteLinearConstraint(constraint): void`
- `linearConstraints(): MathOptLinearConstraint[]`
- `getNumLinearConstraints(): number`
- `getNextLinearConstraintId(): number`
- `ensureNextLinearConstraintIdAtLeast(id): void`
- `hasLinearConstraint(id): boolean`
- `getLinearConstraint(id): MathOptLinearConstraint | undefined`
- `columnNonzeros(variable): MathOptLinearConstraint[]`
- `rowNonzeros(constraint): MathOptVariable[]`
- `linearConstraintMatrixEntries(): MathOptLinearConstraintMatrixEntry[]`

Quadratic and indicator constraints:

- `addQuadraticConstraint(optionsOrBoundedExpression?): MathOptQuadraticConstraint`
- `quadraticConstraints()`, `getNumQuadraticConstraints()`, `hasQuadraticConstraint(id)`
- `getQuadraticConstraint(id)`, `deleteQuadraticConstraint(constraint)`
- `getNextQuadraticConstraintId()`, `ensureNextQuadraticConstraintIdAtLeast(id)`
- `addIndicatorConstraint(options?): MathOptIndicatorConstraint`
- `indicatorConstraints()`, `getNumIndicatorConstraints()`
- `hasIndicatorConstraint(id)`, `getIndicatorConstraint(id)`
- `deleteIndicatorConstraint(constraint)`
- `getNextIndicatorConstraintId()`, `ensureNextIndicatorConstraintIdAtLeast(id)`

Quadratic options accept `lowerBound`, `upperBound`, `terms`, `quadraticTerms`,
`expression` and `name`. Native backend support determines solvability; GSCIP
supports quadratic constraints. IDs are never reused after deletion.

Quadratic handles expose read-only `id`, `name`, `lowerBound`, `upperBound`,
`linearTerms()`, `quadraticTerms()`, `getLinearCoefficient(variable)`,
`getQuadraticCoefficient(first, second)`, `equals(other)` and `assertLive()`.
Indicator handles expose their trigger, bounds, `terms()`,
`getCoefficient(variable)`, `getImpliedConstraint()`, `equals(other)` and
`assertLive()`. Deleted handles reject data access; term arrays are snapshots.
Missing or deleted IDs return `undefined` from model lookups.

`MathOptLinearConstraintMatrixEntry` contains:

- `linearConstraint: MathOptLinearConstraint`
- `variable: MathOptVariable`
- `coefficient: number`

Objective and encoding:

- `objective: MathOptObjective`
- `maximize(terms, offset?): void`
- `minimize(terms, offset?): void`
- `maximizeLinearObjective(terms, offset?): void`
- `minimizeLinearObjective(terms, offset?): void`
- `setObjective(terms, isMaximize, offset?): void`
- `setLinearObjective(terms, isMaximize, offset?): void`
- `encodeModelProto(options?: { removeNames?: boolean }): Uint8Array`
- `addUpdateTracker(): MathOptUpdateTracker`
- `removeUpdateTracker(tracker): void`

`await MathOptModel.fromModelProto(bytesOrObject, options?)` validates natively
then restores an editable model. It preserves supported linear, quadratic and
indicator data, linear auxiliary objectives, exact objective priorities and
sparse safe-integer IDs. Quadratic auxiliary objectives, cone and SOS
constraints are rejected by the editable wrapper;
use raw proto solving for models outside that representation. Imports accept
executor, signal and event options. Next IDs follow the largest imported IDs.

An update tracker captures an independent checkpoint. `tracker.exportUpdate({
removeNames })` returns ModelUpdateProto bytes or `null` without advancing it;
`tracker.advanceCheckpoint()` starts tracking later edits. Removing a tracker
makes further exports/checkpoints invalid.

`MathOptVariableOptions`:

- `lowerBound?: number`
- `upperBound?: number`
- `integer?: boolean`
- `name?: string`

`addLinearConstraint()` accepts:

- `lowerBound?: number`
- `upperBound?: number`
- `terms?: MathOptLinearTerm[]`
- `expression?: number | MathOptVariable | MathOptLinearTerm | linear expression`
- `name?: string`

It also accepts `MathOpt.boundedExpression()`, `MathOpt.lowerBoundedExpression()`,
and `MathOpt.upperBoundedExpression()` results.

`addIndicatorConstraint()` accepts:

- `indicator?: MathOptVariable`
- `activateOnZero?: boolean`
- `impliedConstraint?: MathOpt.boundedExpression()` / `lowerBoundedExpression()` / `upperBoundedExpression()`
- `lowerBound` and `upperBound`
- `expression`
- `terms?: MathOptLinearTerm[]`
- `name?: string`

Indicator constraints are encoded into `ModelProto.indicator_constraints` and
are supported by linked MathOpt backends that accept them, such as GSCIP.

### `MathOptVariable`

Properties:

- `id: number`
- `name: string`
- `lowerBound`
- `upperBound`
- `integer`

Methods:

- `equals(other): boolean`
- `toString(): string`
- `assertLive(): void`

### `MathOptLinearConstraint`

Properties:

- `id: number`
- `name: string`
- `lowerBound`
- `upperBound`

Methods:

- `setCoefficient(variable, coefficient): void`
- `getCoefficient(variable): number`
- `terms(): MathOptLinearTerm[]`
- `asBoundedLinearExpression(): MathOptBoundedExpression<MathOptLinearExpression>`
- `equals(other): boolean`
- `toString(): string`
- `assertLive(): void`

### `MathOptObjective`

Obtain objective handles from `model.objective` and the model's auxiliary objective methods.

Properties:

- `isMaximize`
- `offset`
- `name`
- `priority: bigint` — writable using a safe integer or bigint; nonnegative int64

`isMaximize` and `offset` are writable. `name` is read-only and
defaults to empty and preserves the configured/imported objective name.

Methods:

- `clear(): void`
- `setLinearCoefficient(variable, coefficient): void`
- `getLinearCoefficient(variable): number`
- `linearTerms(): MathOptLinearTerm[]`
- `setQuadraticCoefficient(firstVariable, secondVariable, coefficient): void`
- `getQuadraticCoefficient(firstVariable, secondVariable): number`
- `quadraticTerms(): MathOptQuadraticTerm[]`
- `asLinearExpression()`, `asQuadraticExpression()`, `isLinear()`
- `setToExpression(expr)`, `setToLinearExpression(expr)`
- `add(expr)`, `addLinear(expr)`
- `equals(other)`, `assertLive()`

`clear()` removes coefficients and offset while preserving direction and priority.

Auxiliary objectives:

- `model.addAuxiliaryObjective({ priority, name?, expression?, isMaximize? })`
- `model.addMinimizationObjective(expr, { priority, name? })`
- `model.addMaximizationObjective(expr, { priority, name? })`
- `model.auxiliaryObjectives()`, `getNumAuxiliaryObjectives()`
- `model.getAuxiliaryObjective(id)`, `hasAuxiliaryObjective(id)`
- `model.deleteAuxiliaryObjective(objective)`
- `model.getNextAuxiliaryObjectiveId()`, `ensureNextAuxiliaryObjectiveIdAtLeast(id)`

`MathOptAuxiliaryObjective` exposes `id` and the same objective methods, with
linear expressions only, matching the Python builder. IDs are never reused;
deleted handles reject further access. Auxiliary data and per-objective parameters
can be serialized and imported, but the built native adapters do not solve
multiple objectives. Ordinary and incremental solves return their native errors.
Optimization remains delegated to the native backend.

### MathOpt MPS conversion

- `modelProtoToMps(model: Uint8Array | MathOptModelProto, options?: MathOptConversionOptions): Promise<string>`
- `mpsToModelProto(text: string, options?: MathOptConversionOptions): Promise<MathOptModelProto>`
- `model.exportMps(options?: MathOptMpsExportOptions): Promise<string>`
- `MathOptModel.fromMps(text: string, options?: MathOptConversionOptions): Promise<MathOptModel>`

Conversion uses the native converters. `MathOptConversionOptions` accepts
`executor`, `signal` and `onEvent`; export additionally accepts `removeNames`.
Input bytes/objects are snapshotted before awaiting native execution. Imported
models remain editable. MPS regenerates IDs and applies native name/format
normalization; not every MathOpt metadata field has an MPS representation.
Quadratic and auxiliary objective exports reject explicitly to prevent silent
loss in the current native exporter. Other unsupported constraint families
return native converter errors. File I/O stays with the application.

### MathOpt Expression Classes

`MathOptLinearExpression`

- Construct with `(terms?: Iterable<MathOptLinearTerm>, offset?: number)`.
- Properties: `offset`, `terms`.
- Methods: `add(input)`, `subtract(input)`, `multiply(coefficient)`,
  `evaluate(variableValues)`, `toString()`.

`MathOptQuadraticExpression`

- Construct with `(linearTerms?: Iterable<MathOptLinearTerm>,
  quadraticTerms?: Iterable<MathOptQuadraticTerm>, offset?: number)`.
- Properties: `offset`, `linearTerms`, `quadraticTerms`.
- Methods: `add(input)`, `subtract(input)`, `multiply(coefficient)`,
  `evaluate(variableValues)`, `toString()`.

Use `MathOpt.asFlatLinearExpression(input)` or
`MathOpt.asFlatQuadraticExpression(input)` to convert a number, variable, term or
existing expression. Conversion retains an already flattened expression.
Evaluation accepts a `ReadonlyMap<MathOptVariable, number>` or a value record
keyed by variable ID/name; numeric-keyed maps are not supported. `fastSum()`
consumes its input once and merges duplicate terms once.

`MathOptQuadraticTermKey`

- Construct from two variables in the same model.
- Properties: `firstVariable`, `secondVariable`.
- Methods: `equals(other)`, `toString()`.

Bounded expression classes represent constraints produced by `eq`, `le`, and
`ge`:

- `MathOptBoundedExpression`
- `MathOptLowerBoundedExpression`
- `MathOptUpperBoundedExpression`

They expose `lowerBound`, `upperBound`, `expression` and `toString()`.
One-sided expressions also expose `toBoundedExpression(bound)`.
Use `variable.equals(other)` for handle identity and `MathOpt.eq(lhs, rhs)`
for a constraint expression; JavaScript Boolean coercion is not overloaded.

## PDLP

Import:

```ts
import { Pdlp, QuadraticProgram } from 'or-tools-wasm/pdlp';
```

PDLP exposes the primal-dual hybrid gradient solver for LP and convex diagonal
quadratic programs.

```ts
const qp = new QuadraticProgram({
  objectiveVector: [1, 2],
  variableLowerBounds: [0, 0],
  variableUpperBounds: [10, 10],
});

const result = await Pdlp.solve(qp, {
  executor: 'worker',
  terminationCriteria: { iterationLimit: 1000 },
});
```

The runtime is loaded lazily. Select `auto`, `direct`, `worker`, `server`, or
`cloud` per operation with the `executor` option. `auto` selects the default for
the current environment.

### `QuadraticProgram`

Constructor:

```ts
new QuadraticProgram(input?: QuadraticProgramInput)
```

Fields:

- `problemName`
- `objectiveOffset`
- `objectiveScalingFactor`
- `objectiveVector`
- `objectiveMatrixDiagonal`
- `constraintMatrix`
- `constraintLowerBounds`
- `constraintUpperBounds`
- `variableLowerBounds`
- `variableUpperBounds`
- `variableNames`
- `constraintNames`

Methods:

- `resizeAndInitialize(numVariables, numConstraints): void`
- `setObjectiveMatrixDiagonal(values): void`
- `clearObjectiveMatrix(): void`
- `applyObjectiveScalingAndOffset(objective): number` — returns `objectiveScalingFactor * (objective + objectiveOffset)` using the current fields.
- `toBytes(): Uint8Array`

Sparse matrix input accepts either:

```ts
{ numRows?: number; numColumns?: number; entries?: Array<{ row: number; column: number; value: number }> }
```

or a dense `number[][]`.

Solve and conversion calls capture vectors, names and initial solutions before
awaiting execution. Explicit sparse entries, including zeros, undergo native
index validation; native assembly combines duplicates. Native solves reject
nonfinite coefficients and scaling factors with `INVALID_PROBLEM`; infinite
bounds retain their usual meaning. Dimension validation checks shape only.

### `PrimalAndDualSolution`

Constructor:

```ts
new PrimalAndDualSolution({ primalSolution?: number[]; dualSolution?: number[] })
```

### `Pdlp`

- `Pdlp.QuadraticProgram`
- `Pdlp.PrimalAndDualSolution`
- `validateQuadraticProgramDimensions(qp, options?): Promise<void>`
- `isLinearProgram(qp, options?): Promise<boolean>`
- `readQuadraticProgram(input, options): Promise<QuadraticProgram>`
- `qpFromMpModelProto(proto, options?): Promise<QuadraticProgram>`
- `qpToMpModelProto(qp, options?): Promise<Uint8Array>`
- `solve(qp, options?): Promise<PdlpSolverResult>`

`readQuadraticProgram` accepts model text or `Uint8Array` with an explicit `format`:
`mps`, `proto` (binary native `MPModelProto`), `textproto` or `json` (native
`MPModelProto` representations). Binary imports require bytes. The format describes
the contents, not a filename; read a browser File/Blob or a Node file into bytes first.
Compressed files must be decompressed before import.

```ts
const qp = await Pdlp.readQuadraticProgram(mpsText, {
  format: 'mps', includeNames: true, executor: 'worker',
});
const result = await Pdlp.solve(qp, { executor: 'worker', numThreads: 1 });
```

Options also accept `relaxIntegerVariables` (default false), `includeNames`
(default false), `executor`, `signal` and `onEvent`. Names are retained only when
requested. Input bytes are snapshotted before execution. Parsing, model validation,
maximization/offset conversion and diagonal quadratic conversion use native OR-Tools
and protobuf routines. Malformed models and unsupported general constraints or
off-diagonal quadratic terms reject with errors. Integer variables require explicit
relaxation. `qpFromMpModelProto` remains available for binary conversion.

`QuadraticProgram.toBytes()` is the wrapper's structured program encoding; it is not
an `MPModelProto` file. Use `Pdlp.qpToMpModelProto(qp)` to obtain native model bytes
for a `format: 'proto'` import. See the dedicated PDLP import example on the site.


`PdlpSolveOptions` combines solver parameters with execution options:

- `terminationCriteria.iterationLimit`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalRelative`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalAbsolute`
- `terminationCheckFrequency`
- `lInfRuizIterations`
- `l2NormRescaling`
- `numThreads`

All vendored `PrimalDualHybridGradientParams` fields are typed and forwarded,
including presolve, restart, scheduler, sharding and feasibility-polishing settings.
Solve options also accept `initialSolution`, `executor`, `signal`, `onEvent` and
`eventMask: { log?, iteration? }`. Log events contain `message`; iteration events
contain detached typed `info` with iteration type/stats, termination criteria and
bound norms. Events are notifications, not callback replies. Use a worker for
responsive cancellation; native interruption is supported.

`relaxIntegerVariables` and `includeNames` belong to import/conversion options,
not solve options.

`PdlpSolverResult` contains:

- `primalSolution`
- `dualSolution`
- `reducedCosts`
- `solveLog`

`solveLog` contains `terminationReason`, `iterationCount` and the native
statistics, solution metadata and optional iteration history. Inspect its
termination reason before treating returned vectors as an optimal solution.

## Executor Selection

The CP-SAT, MathOpt, Routing, MPSolver, Knapsack, Network Flow, Set
Cover, RCPSP, and PDLP paths can use the shared worker bridge. Worker bridge
availability is independent of solver threading support; for example GLPK, BOP,
Knapsack algorithms other than its CP-SAT backend, Set Cover, and Network Flow
are single-threaded but can still run
through the worker bridge for UI responsiveness, while RCPSP uses CP-SAT and
can also accept CP-SAT thread settings. CP-SAT, SAT, SCIP/GSCIP, CBC, and other
threaded-capable paths can also accept solver thread settings.
Choose execution per operation:

```ts
import { CpSat } from 'or-tools-wasm/cp-sat';

const result = await CpSat.solve(model, { executor: 'worker' });
```

Pass `executor: 'direct'`, `executor: 'worker'`, a server/cloud configuration,
or `executor: 'auto'` in the operation's options object. `auto` selects worker
execution on browser main threads when workers are available and direct
execution elsewhere. There is no global executor or worker-bridge setting.

Solve calls also accept `signal` and `onEvent`. Event handlers run in delivery
order and asynchronous handlers are awaited one at a time. If a handler throws,
later handlers are suppressed and the error is reported after the executor job
settles. Aborting requests cancellation and likewise waits for the job to settle,
so callers can safely start another solve after the rejected promise completes.

In Node, Deno and Bun, unexpected worker exits reject startup and active requests,
including exit code 0. The dead worker and its callback/cancellation resources are
discarded, allowing a fresh worker for subsequent requests. Messages, errors and
exit notifications from retired workers cannot affect their replacements.
Persistent MathOpt, MPSolver and guided Set Cover sessions are bound to the
worker generation or direct WASM module that created them. After that runtime is replaced, a stale solve rejects
before dispatch, and closing the old session cannot delete a new session that
reuses its numeric handle. Close and recreate the affected session.

### Server execution and errors

Server execution requires a URL, not the string `'server'`:

```ts
const result = await CpSat.solve(model, {
  executor: { type: 'server', url: 'http://localhost:17827' },
  onEvent(event) {
    if (event.type === 'failure') console.error(event.failure.message);
  },
});
```

The configuration also accepts `authToken`, `headers`, a custom `fetch`, and
`statusIntervalMs` (default 2000). The client streams events with polling as a
fallback. Callback-enabled solves use polling with idle delays capped at 20 ms
and immediately repoll after callback replies. The client releases terminal job
state. Cleanup has a one-second deadline covering the DELETE and its response
body; a failure or timeout preserves the solve result or original error.
See [server setup](../server/README.md).

Catch solve rejections as well as displaying failure events. Infeasibility is
a solver result, not a transport exception. Server failure events distinguish
connection failures (`SERVER_DISCONNECTED`), timeouts (`TIMEOUT`), cancellation
(`CANCELLED`), authentication (`UNAUTHENTICATED`), throttling (`QUEUE_FULL`),
invalid requests (`INVALID_REQUEST`), and other execution failures
(`EXECUTOR_ERROR`). Native structured failures retain their server-provided
details. `retryable` is a hint; the library does not automatically resubmit a
failed solve.

Callback reply exchanges have a 30-second deadline and terminal cleanup has a
one-second budget. Other requests follow the supplied `fetch` implementation's
timeout policy. Applications can supply a custom `fetch`; the example site uses
a 10-second timeout until response headers arrive, not a limit on solving or streaming.
Cancellation of queued server work is immediate; interruption of running work
depends on the native solver. Cloud execution is reserved and currently reports
unavailability rather than solving.

Local solves print an informational cloud notice once per JavaScript context,
shared across solver imports. Printing the notice makes no network request.
Call `setCloudNoticeEnabled(false)` before solving to suppress it; this function
is exported from `or-tools-wasm` and each solver subpath. Alternatively set
`ORTOOLS_WASM_CLOUD_NOTICE=0` in the environment. An explicit function call takes
precedence over the environment setting. Re-enabling the notice does not print
it again if it has already appeared. Separate pages, processes, and independent
workers have separate in-memory flags. This setting does not suppress responses
from explicitly selecting `executor: 'cloud'`.

## Generated Protobuf Types

Solver subpaths export the types needed for native protobuf workflows:

- CP-SAT: `CpModelProto`, `CpSolverResponse`, `SatParameters` and generated enums.
- Routing: complete `RoutingSearchParameters`, `RoutingModelParameters` and nested types/enums.
- MathOpt: `MathOptModelProto`, `MathOptModelUpdateProto`, `MathOptSolveResultProto`
  and callback registration/data/result types.
- PDLP: complete parameter and statistics fields through `PdlpSolveParams`,
  `PdlpSolveLog` and iteration-event types.

Use these types for protobuf-shaped objects and the solver's conversion methods
for binary data. `CpSat.getSchemas()` and `MPSolver.getLinearSolverSchemas()`
provide schemas for custom protobuf tooling. Generated definitions follow the
vendored OR-Tools schemas; exported enums can include unavailable backends.
