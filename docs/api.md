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

`onEvent` observers may return a Promise and run in order. Cancellation stops
observer delivery and stops waiting for a pending observer; the solve still waits
for native cleanup and commits any returned session state before rejecting.
The solve promise reports cancellation; no further observer calls are scheduled.

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
- `solutionIsFeasible(values: Iterable<IntValue>, options?: CpSatValidateOptions): Promise<boolean>`:
  checks an explicit complete point in native variable-index order.
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

These three callbacks must return synchronously. Promise or thenable returns
reject the solve; use the solve option `onEvent` for asynchronous observers.
Intermediate solutions are requested only for a solution callback or subscribed
solution events. `stopSearch()` interrupts native search and preserves its final
response, status and statistics. `solveProto()` also accepts `interruptSignal`
for this behavior; `signal` cancels and rejects instead.

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

`CpSat.solutionIsFeasible(model: CpModel, values: Iterable<IntValue>, options?: CpSatValidateOptions): Promise<boolean>`

`model.solutionIsFeasible(values, options?)` is the equivalent instance method.
`CpSat.solutionIsFeasibleProto(model: Uint8Array | CpModelProto, values, options?)`
checks a serialized/native-proto model through the same operation.

Pass a complete vector in native variable-index order, including any constant
variables. For an existing answer, pass `result.response!.solution!`. The model
and values are captured before awaiting; checking leaves both inputs and existing
solve results untouched. Values accept safe integer numbers or signed int64
bigints. Direct, worker and server execution use the native checker.

The Boolean is native `SolutionIsFeasible()`: domain/constraint/objective-domain
violations and wrong-length vectors return `false`. Malformed bytes, invalid
models and invalid integer values reject. This checks the supplied point without
searching or proving optimality. Native solve-time assumptions and solution hints
are not enforced by this checker; encode a requirement as a constraint when it
must participate in this check. The options select `executor` and `signal`.

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
`localSearchProfile`, `automaticFirstSolutionStrategy`, collected assignments,
search statistics and the search lower bound for that solve.
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
- `getModelParameters(): RoutingModelParameters` (copy of submitted overrides)`

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
`searchStatistics` carries all five native subsolver call counters as `bigint`, plus
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
returns an owned `ReadonlyMap` of bound successor arcs. Both methods accept
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

### Pickup/delivery alternatives and ride limits

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

### `RoutingDimension`

Driver breaks use native fixed-duration intervals owned by the routing model:

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

### Routing piecewise-linear cumul costs

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

### Routing inspection and whole-route callbacks

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
interruption finish before an active AbortSignal rejection. Cancelled server
creation finishes in the background so its late handle can be retrieved and
closed, including after `close()` returns.

`findErrorInModelProto(bytesOrObject, options?)` is also exported as a module
function. It uses native validation without solving and returns `''` on success
or the native diagnostic. A valid model may require a backend that supports its
constraint types.

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

`await MPSolver.clampSolutionWithinBounds(model, solution, options?)` invokes
native `ClampSolutionWithinBounds()` on a private model/response snapshot and
returns a new `MpResult`. `model` may be an `MpModel` or `MPSolver`; `solution`
is an `MPSolutionResponse` object (for example `result.response`) or its bytes.
Neither the model nor any currently loaded answer is changed. Options accept
`{ executor, signal, onEvent, solverType }`; the backend defaults to the model's
problem type. Input snapshots are captured before awaiting; clearing the model
during the call rejects because its variable handles belong to a new generation.

```ts
const clamped = await MPSolver.clampSolutionWithinBounds(model, result.response,
  { executor: 'worker' });
console.log(clamped.value(x));
```

`clampSolutionWithinBoundsProto(modelProtoOrBytes, solutionProtoOrBytes, options?)`
returns `{ bytes, response }` containing native `MPSolutionResponse` output and
defaults to GLOP. Both paths support direct, worker and server execution. Native
solution loading requires OPTIMAL/FEASIBLE status and matching dimensions; native
clamping rejects NaNs and clips out-of-bound values. No optimization is run.

Native clamping preserves the submitted status and objective without
recalculating them. It does not verify constraint feasibility, integrality or
optimality. Integer accessors retain native rounding, including cases where
exporting a fractional bound rounds outside it. Treat the returned values as
post-processed coordinates and verify them independently when needed. No
TypeScript bound repair or replacement certificate is added.

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
- `supportsCallbacks(options?): Promise<boolean>` and
  `supportsMessageCallbacks(options?): Promise<boolean>` — query the selected
  executor's native backend for search and message callback support. They work
  before solving and preserve the model and its current result. Availability
  does not remove native restrictions (SCIP search callbacks require one solver
  thread). Both accept the usual `{ executor, signal }` options.
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

### MPSolver basis input and native MIP callbacks

All solve styles, including raw-proto and retained-session solves, accept
`startingBasis: { variableStatuses, constraintStatuses }`. Arrays follow native
variable/row order and use the exported `BasisStatus` enum. GLOP supports this
input; other bundled backends reject it. Disable presolve explicitly when using
a basis, as native GLOP does not transform the supplied basis through presolve.
This is separate from basis state already retained by an incremental solver.

```ts
const first = await MPSolver.solve(model, { parameters: { presolve: PresolveValues.PRESOLVE_OFF } });
const second = await MPSolver.solve(model, {
  parameters: { presolve: PresolveValues.PRESOLVE_OFF },
  startingBasis: {
    variableStatuses: variables.map(variable => first.basisStatus(variable)),
    constraintStatuses: constraints.map(row => first.basisStatus(row)),
  },
});
```

`callback` and optional `callbackRegistration` bind existing native MPSolver MIP
callbacks on the bundled SCIP backend, across direct/worker/server execution.
SCIP callbacks require one solver thread: native concurrent solving can return
solutions violating callback-added constraints. Other thread counts reject;
the wrapper does not change the requested count or repair native solutions.
These are separate from `messageCallback`, `onEvent` observers and MathOpt's
callback API. Callbacks return synchronously; native search waits for the reply.
Registration declares `mightAddCuts`/`mightAddLazyConstraints`; optional
`variableIndices` filters value queries (omitted: all, empty: none).

Callback data contains `event` (`mipSolution` or `mipNode`),
`canQueryVariableValues`, an owned `variableValues` map keyed by variable index,
and exact bigint `numExploredNodes`. Values are present only when native permits
queries. Return `{ cuts?, lazyConstraints? }`, with each row containing
`variableIndices`, `coefficients` and optional `lowerBound`/`upperBound`
(defaulting to negative/positive infinity). Cuts require a MIP-node event and
must preserve integer-feasible solutions; lazy constraints can exclude unwanted
integer solutions. Native SCIP does not support callback solution suggestions.
Callback pointers and transport are released after each solve, including errors;
retained-session callback errors preserve the original exception after native
search unwinds. Callback constraints follow native solver lifetime semantics.

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

`SetCoverInvariant` exposes:

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

`timeLimitSeconds` must be finite, non-negative and representable as int64
milliseconds. It defaults to zero (unlimited); native truncation means values
below one millisecond also become unlimited. These calls do not accept iteration
limits or additional backend configuration. Cancellation follows the executor's
existing behavior. Server cancellation interrupts the generator's internal native
MPSolver and releases job capacity when that solve stops.

`SetCover.solveCft(model, options?)` calls native `scp::RunCftHeuristic()` on a
full-model submodel and returns `{ cover, dual }`. The owned `cover` is a
`SetCoverResult`; `dual` contains `lowerBound`, `reducedCosts` (subset indices),
and `multipliers` (element indices). Model/proto imports use the same operation.
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
- `setPriceScaling(enabled): void` (default `true`)
- `numNodes()`, `numArcs()`, `tail(arc)`, `head(arc)`, `capacity(arc)`
- `supply(node)`, `unitCost(arc)`
- `solve(options?): Promise<MinCostFlowResult>`
- pass `maxFlowWithMinCost: true` to request maximum flow with minimum cost

`MinCostFlowResult` exposes `status`, `optimalCost`, `maximumFlow`, `flow(arc)`,
and `flows(arcs)`.

With price scaling enabled, native min-cost flow guarantees the integer-cost
optimum. Disabling it permits a native 1-optimal solution: an optimum for costs
perturbed by at most one per arc. This can accommodate larger integer costs;
native range checks and status values remain unchanged. The result's
`optimalCost` field retains its native name and reflects the returned flow's
cost. The setting applies to both ordinary and maximum-flow-with-minimum-cost
solves.

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
For server sessions, a cancelled creation reply is still consumed in the background
so any late native handle can be deleted, including after `close()` returns.

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

`removeNames` omits model, variable, linear, quadratic, indicator, SOS and cone
constraint names from the encoded `ModelProto`, matching upstream
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
constraints, matrix coefficient changes, and new/deleted indicator, quadratic,
SOS and second-order cone constraints.
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
solver-specific proto fields. GSCIP, GLOP and PDLP parameter objects use schema
validation: unknown fields and incorrect scalar types reject before dispatch.
Raw protobuf bytes retain the native validation path:

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

`await MathOpt.formulateIndicatorConstraintAsMip(model, indicator, options?)`
returns a new editable model after invoking native MathOpt labs
`FormulateIndicatorConstraintAsMip()`. Native code replaces the selected
indicator with linear Big-M rows. The submitted model and its handles remain
unchanged, including on failure; use the returned model's handles when solving it.
Existing IDs are preserved in the native exported model.

```ts
const mip = await MathOpt.formulateIndicatorConstraintAsMip(model, indicator,
  { executor: 'worker' });
const result = await MathOpt.solve(mip, { solverType: 'CP_SAT' });
console.log(result.value(mip.getVariable(x.id)!));
```

Native bound calculations must establish finite expression bounds for the
constrained sides. No Big-M values or fallback bounds are computed in TypeScript.
Activation-on-zero and ranged constraints retain native semantics. An indicator
with no activation variable is removed without adding rows. This is an explicit
transformation, never an automatic solve fallback.
`formulateIndicatorConstraintAsMipProto(modelProtoOrBytes, indicatorId, options?)`
returns `{ bytes, proto }` for the transformed native `ModelProto`; use bigint for
IDs beyond JavaScript's safe integer range. Both entry points capture inputs
before awaiting and accept the usual `{ executor, signal, onEvent }` options
across direct, worker and server execution. This operation lives in upstream
`labs`; native errors are propagated.

`await MathOpt.addRobustConstraint(model, uncertaintyModel, rhs, coefficients, options?)`
returns a new model after native MathOpt labs `AddRobustConstraint()` constructs
an extended formulation by LP duality. It enforces
`max { sum(a_i(w) * x_i) : w in W } <= rhs`: `W` is the uncertainty model's
feasible region, each coefficient is a linear expression in its variables, and
`rhs` and every `x_i` are variables of the main model.

```ts
const robust = await MathOpt.addRobustConstraint(model, uncertainty, capacity,
  [{ variable: x, coefficient: new MathOpt.LinearExpression(
    [{ variable: w, coefficient: 1 }], 1) }], { executor: 'worker' });
const answer = await MathOpt.solve(robust, { solverType: 'GLOP' });
console.log(answer.value(robust.getVariable(x.id)!));
```

The uncertainty model must be an LP; its objective is unused. The main model can
contain integer variables. Both inputs remain unchanged; the returned model
preserves existing IDs and contains native added dual variables and rows. Use
handles from that returned model. Inputs are captured before awaiting.
`addRobustConstraintProto(modelProtoOrBytes, uncertaintyProtoOrBytes, rhsId,
coefficients, options?)` returns `{ bytes, proto }`, with coefficient entries
`{ variableId, coefficient: { ids, coefficients, offset } }`. Expression IDs must
be sorted and unique; bigint preserves exact int64 IDs. Both APIs accept
`{ executor, signal, onEvent }` across direct, worker and server execution.
This exposes the upstream labs operation and its LP-duality assumptions,
including behavior for infeasible or unbounded uncertainty regions; it does
not solve or repair the uncertainty model before reformulating.

`await MathOpt.linearExpressionBounds(model, expression, options?)` returns
`{ lowerBound, upperBound }` using native MathOpt labs `LowerBound()` and
`UpperBound()` on one model snapshot. Only variable domains participate; constraints
and integrality do not tighten these bounds. Inconsistent domains can produce reversed
bounds; this is not a feasibility check. No solve is performed. Expressions may
be constants, variables, linear terms or `MathOpt.LinearExpression` objects.
`linearExpressionBoundsProto(modelProtoOrBytes, { ids, coefficients, offset }, options?)`
returns the same shape, with sorted unique IDs and bigint support for exact int64 IDs.
Both accept `{ executor, signal, onEvent }` across direct, worker and server execution.
Native validation rejects malformed expressions and nonfinite coefficients/offsets.
Unbounded domains and native arithmetic overflow retain their IEEE values; the
native utility assumes finite-term accumulation does not overflow and does not
provide a numerical optimality certificate.

`await MathOpt.moveVariablesToTheirBestFeasibleValue(model, values, variables, options?)`
forwards native MathOpt labs solution improvement. Pass a complete point as a
variable-handle map or ID-keyed record and an ordered iterable of variables to
move. It returns a new read-only map containing every submitted variable's value.
Inputs remain unchanged; returned keys are the submitted model's handles.

```ts
const improved = await MathOpt.moveVariablesToTheirBestFeasibleValue(
  model, result.variableValuesById, [x, y], { executor: 'worker' });
console.log(improved.get(x));
```

Native code moves only selected variables, in the supplied order, toward values
that improve the objective. Unselected and zero-objective variables remain
unchanged; an empty selection preserves the point. Order can affect the outcome.
This is an explicit post-processing heuristic, not an optimality or feasibility
certificate or general repair operation. Native code validates complete finite
values and supported linear/MIP model structures and reports unbounded moves as
errors. Its `integralityTolerance` defaults to zero and must be in `[0, 0.25]`.

`moveVariablesToTheirBestFeasibleValueProto(modelProtoOrBytes, values, variableIds,
options?)` accepts native sparse values `{ ids, values }` with sorted unique IDs
and returns `{ bytes, proto }` for native `SparseDoubleVectorProto`. Selection
order is preserved, including repeated IDs; use bigint for exact int64 IDs.
Both APIs capture inputs before awaiting and accept `{ executor, signal,
onEvent, integralityTolerance }` across direct, worker and server execution.

`MathOpt.checkPrimalSolutionFeasibility(model, values, options?)` checks a complete
point using OR-Tools' native MathOpt labs feasibility checker, without selecting
or running a solver backend. Pass a map from variable handles to numbers or an
ID-keyed record (such as `result.variableValuesById`). The returned `feasible`,
`violations` (a `MathOptModelSubset` keyed by the submitted handles) and native
`descriptions` describe this point, not an infeasible subsystem of the model.

```ts
const check = await MathOpt.checkPrimalSolutionFeasibility(
  model, result.variableValuesById, { executor: 'worker' });
if (!check.feasible) console.log(check.descriptions);
```

The native checker covers bounds, integrality, linear/quadratic, cone, SOS and
indicator constraints. Options forward `absoluteConstraintTolerance` (default
`1e-6`), `integralityTolerance` and `nonzeroTolerance` (both `1e-5`); explicit
zero is preserved. Every model variable needs a value. Inputs are snapshotted
before execution; no point is repaired or stored on the model.
`checkPrimalSolutionFeasibilityProto(modelProtoOrBytes, { ids, values }, options?)`
returns the same Boolean/descriptions with an exact-ID `ModelSubsetProto` in
`violations` and its serialized `bytes`. Raw IDs must be sorted and unique;
use bigint for IDs beyond JavaScript's safe integer range. Both methods support
direct, worker and server execution, and retain upstream labs semantics.

`MathOpt.computeInfeasibleSubsystem(model, options?)` and
`MathOpt.computeInfeasibleSubsystemProto(modelProtoOrBytes, options?)` forward
MathOpt's native IIS operation. The bundled GSCIP, GLOP, GLPK, CP-SAT and PDLP
adapters return native unsupported-operation errors. The binding does not add a
SCIP IIS implementation or translate models into another backend.

The model-based result uses handle-keyed membership maps/sets; the proto result
contains `{ bytes, response, messages }` with exact native IDs. Both incremental
solver classes expose the same operation on their retained native model.
Unsupported-operation errors follow the existing failed-session contract;
close the session after failure.

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

GSCIP solves supported quadratic models but does not return a dual solution.
The bundled backends do not compute quadratic-constraint multipliers;
`quadraticDualValuesById` preserves values supplied through result conversion.

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

SOS constraints use affine expressions:

```ts
model.addSos1Constraint([x, y], { name: 'exclusive choices' });
model.addSos2Constraint([x, y, z], { weights: [1, 2, 3] });
```

SOS1 permits at most one nonzero expression; SOS2 permits at most two adjacent
nonzero expressions. `weights` is optional; native validation checks its length,
finite values and uniqueness. GSCIP supports both families and rejects empty
SOS constraints; that native error is preserved. The model exposes
`sos1Constraints()` / `sos2Constraints()`, corresponding `getNum`, `getNextId`
(`getNextSos1ConstraintId` / `getNextSos2ConstraintId`), `ensureNextIdAtLeast`,
`has` and `get` methods, and `deleteSosConstraint(handle)` for either family.
`MathOptSosConstraint` has `id`, `kind`, `name`, `expressions()`, `weights()` and
`equals(other)`. Expressions and weights are detached inspection values;
constraints support addition/deletion in incremental sessions, rather than
in-place edits. Deleting a referenced variable treats it as zero. Editable
model import/export and update trackers preserve both families and their IDs.

Second-order cones use affine expressions on both sides:

```ts
const cone = model.addSecondOrderConeConstraint([x, y], radius, { name: 'ball' });
// sqrt(x² + y²) <= radius; arguments and the upper bound may include offsets.
```

The model can represent and serialize cones independently of backend support.
An empty argument vector has norm zero. The model exposes
`secondOrderConeConstraints()`, `getNumSecondOrderConeConstraints()`,
`getNextSecondOrderConeConstraintId()`, `ensureNextSecondOrderConeConstraintIdAtLeast(id)`,
`hasSecondOrderConeConstraint(id)`, `getSecondOrderConeConstraint(id)` and
`deleteSecondOrderConeConstraint(handle)`. Handles expose `id`, `name`,
`upperBound`, `argumentsToNorm()`, `equals(other)` and `assertLive()`.
Expression inspections are snapshots. Cone data supports model addition/deletion,
import/export and update trackers. Deleting a referenced variable substitutes zero.
The bundled backends, including GSCIP, reject cone execution through their native
capability checks; the binding does not construct a solver-specific formulation.

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
then restores an editable model. It preserves linear, quadratic, indicator,
SOS and cone data, linear auxiliary objectives, exact objective priorities and
sparse safe-integer IDs. Quadratic auxiliary objectives are rejected by the editable wrapper;
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
one-second budget. After cancellation or native interruption, an accepted job
has 30 seconds to settle, including a stalled control request or result response.
Cancellation preserves the caller's abort reason; interruption without a result
reports `TimeoutError`. Native results received within that window are committed
before deferred caller errors. A session with an unconfirmed operation becomes
failed and must be closed and recreated. Ordinary solves have no added result
deadline. Other requests follow the supplied `fetch` implementation's timeout
policy. Applications can supply a custom `fetch`; the example site uses
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
