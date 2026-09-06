# TypeScript API

This page documents the public solver subpath exports from `or-tools-wasm`.
The package is ESM only:

```ts
import { CpSat } from 'or-tools-wasm/cp-sat';
import { RoutingIndexManager, RoutingModel } from 'or-tools-wasm/routing';
```

Most solver runtimes are loaded lazily. Browser solves use the package worker
bridge by default so the main thread stays responsive. Browser pages still need
cross-origin isolation headers; see [Browser requirements](../README.md#browser-requirements).

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

CP-SAT exposes two public API layers:

- A high-level Python-like model builder around `CpModel` and `CpSolver`.
- The proto-first `CpSat` API for callers that build or serialize
  `CpModelProto` objects directly.

Prefer the high-level API for application code, and use `CpSat` when you need
direct generated protobuf access.

### High-Level CP-SAT

```ts
const model = new CpModel();
const x = model.newIntVar(0, 10, 'x');
const y = model.newIntVar(0, 10, 'y');

model.add(x.plus(y.times(2)).eq(14));
model.maximize(x.plus(y));

const solver = new CpSolver();
solver.parameters.numWorkers = 4;
const status = await solver.solve(model);

console.log(solver.statusName(status));
console.log(solver.value(x), solver.value(y), solver.objectiveValue);
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
from `solver.value()` and callback `value()`; objective values and bounds remain
floating-point `number` values.

```ts
const exact = 9_007_199_254_740_993n;
const x = model.newIntVar(exact, exact, 'exact');
await solver.solve(model);
console.log(solver.value(x) === exact); // true
```

Use the exported `asNumber()` helper when ordinary number arithmetic or an API
that only accepts `number` is more convenient. It throws rather than rounding
an unsafe value:

```ts
const value = asNumber(solver.value(x));
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

Model/proto helpers:

- `name`: model name getter/setter.
- `modelProto`: returns a detached `CpModelProto` snapshot. Construct a new
  `CpModel(snapshot)` after editing it; mutating the snapshot cannot invalidate
  the original model's variable and constant caches.
- `clone()`: returns a new `CpModel` wrapper around a cloned proto.
- `removeAllNames()`
- `validate(): Promise<string>`: returns `''` for a valid model, otherwise the
  native validation message.
- `modelStats(): string`
- `hasObjective(): boolean`

Linear constraints and objectives:

- `add(bound: BoundedLinearExpr | boolean)`
- `addLinearConstraint(expression, lb, ub)`
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
- `addAssumption(literal)`
- `addAssumptions(literals)`
- `clearAssumptions()`

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

- `name`, `modelProto`, `expr()`
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
- `flatIntervals`

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

Mutable `SatParameters` object merged into every `solve()` call unless raw
parameters are passed.

`solver.solve(model, paramsOrCallback?, callbacks?): Promise<CpSolverStatus | undefined>`

Solves a `CpModel`. The second argument can be:

- a `SatParameters` object
- raw `Uint8Array` parameter bytes
- a `CpSolverSolutionCallback`
- `null`

Result helpers:

- `responseStats()`
- `statusName(status?)`
- `value(expression)`: `bigint` for integer expressions, `number` for floating-point expressions
- `booleanValue(literal)`

Response properties:

- `response`: latest decoded `CpSolverResponse`, or `null` before solving
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

```ts
class Printer extends CpSolverSolutionCallback {
  onSolutionCallback() {
    console.log(this.value(x));
  }
}

await solver.solve(model, new Printer());
```

### Proto-First CP-SAT

Build or serialize a `CpModelProto`, validate it, then solve it:

```ts
const modelBytes = await CpSat.createModel(model);
const validation = await CpSat.validate(modelBytes);
if (!validation.ok) throw new Error(validation.message);

const result = await CpSat.solve(modelBytes, {
  numWorkers: 4,
  logSearchProgress: true,
});
```

### `CpSat`

`CpSat.createModel(model: CpModelProto): Promise<Uint8Array>`

Encodes a JSON-like `CpModelProto` object into binary protobuf bytes. The input
uses the generated TypeScript `CpModelProto` shape from OR-Tools.

`CpSat.validate(model: Uint8Array): Promise<{ ok: boolean; message: string }>`

Runs native CP-SAT model validation. `ok` is `false` when OR-Tools rejects the
model; `message` contains the native validation message.

`CpSat.solve(model: Uint8Array, options?: CpSatSolveOptions): Promise<CpSatSolveResult>`

Solves a binary `CpModelProto`. Solver parameters and execution options share
one options object. The returned `CpSatSolveResult` contains:

- `response`: decoded `CpSolverResponse | null`
- `bytes`: raw binary `CpSolverResponse`

`options.onEvent` receives enabled solution, best-bound, log, status, and
failure events. Pass an `AbortSignal` as `options.signal` to cancel a solve.

`CpSat.getSchemas(): Promise<{ cp_model: string; sat_parameters: string; linear_solver?: string; optional_boolean?: string }>`

Returns embedded `.proto` schemas. CP-SAT always returns `cp_model` and
`sat_parameters`; MPSolver-related schemas may be present when fetched through
the worker path.

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

const params = defaultRoutingSearchParameters();
params.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;
const assignment = await routing.solveWithParameters(params, {
  executor: 'worker',
});
const objective = assignment ? asNumber(assignment.objectiveValue()) : null;
```

The Routing API is a high-level wrapper around the compiled OR-Tools Routing
runtime. Public methods use camelCase while preserving the corresponding Python
Routing concepts.

`solve()`, `solveWithParameters()`, and
`solveFromAssignmentWithParameters()` accept execution options containing
`executor`, `signal`, and `onEvent`. Use the worker executor for cancellation;
it interrupts the native Routing search and remains reusable afterward. Direct
execution cannot stop native work already in progress. `onEvent` reports the
shared job lifecycle; OR-Tools Routing does not expose native solution-progress
callbacks through this bridge.

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
const routing = new RoutingModel(manager, parameters?);
```

Routing quantities use `IntValue`; indexes remain checked JavaScript `number`
values. Costs, cumul values, bounds, and objective values are returned as
`bigint`.

Callbacks and costs:

- `registerTransitCallback((fromIndex, toIndex) => IntValue): number`
- `registerTransitMatrix(matrix: IntValue[][]): number`
- `registerUnaryTransitCallback((fromIndex) => IntValue): number`
- `registerUnaryTransitVector(values: IntValue[]): number`
- `setArcCostEvaluatorOfAllVehicles(evaluatorIndex): void`
- `getArcCostForVehicle(fromIndex, toIndex, vehicle): bigint`

Dimensions:

- `addDimension(transitIndex, slackMax, capacity, fixStartCumulToZero, name): boolean`
- `addDimensionWithVehicleCapacity(transitIndex, slackMax, capacities, fixStartCumulToZero, name): boolean`
- `addDimensionWithVehicleTransits(transitIndices, slackMax, capacity, fixStartCumulToZero, name): boolean`
- `addConstantDimension(value, capacity, fixStartCumulToZero, name): [number, boolean]`
- `addVectorDimension(values, capacity, fixStartCumulToZero, name): [number, boolean]`
- `addMatrixDimension(matrix, capacity, fixStartCumulToZero, name): [number, boolean]`
- `getDimensionOrDie(name): RoutingDimension`

Search and assignments:

- `solve(options?): Promise<Assignment | null>`
- `solveWithParameters(parameters, options?): Promise<Assignment | null>`
- `solveFromAssignmentWithParameters(assignment, parameters, options?): Promise<Assignment | null>`
- `readAssignmentFromRoutes(routes, ignoreInactiveIndices): Assignment`
- `closeModelWithParameters(parameters): void`
- `status(): RoutingSearchStatus`

Route structure and model helpers:

- `start(vehicle): number`
- `end(vehicle): number`
- `isEnd(index): boolean`
- `nextVar(index): number`
- `vehicleVar(index): RoutingVehicleVar`
- `vehicles(): number`
- `addDisjunction(indices, penalty?): number`
- `addPickupAndDelivery(pickup, delivery): void`
- `addAtSolutionCallback(callback): void`
- `getAutomaticFirstSolutionStrategy(): FirstSolutionStrategy`
- `getNumberOfDecisionsInFirstSolution(parameters): number`
- `getNumberOfRejectsInFirstSolution(parameters): number`
- `costVar(): { max(): bigint }`
- `solver(): { parameters(): { tracePropagation: boolean }; localSearchProfile(): string; add(...): void }`

`nextVar(index)` returns an opaque next-variable handle represented by the
index. Pass that value to `assignment.value(...)`. `vehicleVar(index)` returns
an opaque vehicle-variable handle for solver constraints.

Advanced assignment helpers are also exposed for parity with the current
wrapper implementation:

- `assignmentObjectiveValue(): bigint`
- `nextValue(index): number`
- `dimensionCumulValue(dimensionName, index): bigint`

These helpers read values from the current assignment state and are usually
used through `Assignment`.

### Routing Solver Constraints

`routing.solver().add(...)` accepts the routing constraint objects currently
needed for pickup-and-delivery parity. JavaScript does not support Python-style
operator overloading, so constraints are explicit objects:

```ts
routing.addPickupAndDelivery(pickupIndex, deliveryIndex);

routing.solver().add({
  type: 'routingVehicleEquality',
  left: routing.vehicleVar(pickupIndex),
  right: routing.vehicleVar(deliveryIndex),
});

const distance = routing.getDimensionOrDie('distance');
routing.solver().add({
  type: 'routingCumulLessOrEqual',
  left: distance.cumulVar(pickupIndex),
  right: distance.cumulVar(deliveryIndex),
});
```

Supported solver constraint object shapes:

- `{ type: 'routingVehicleEquality', left: routing.vehicleVar(...), right: routing.vehicleVar(...) }`
- `{ type: 'routingCumulLessOrEqual', left: dimension.cumulVar(...), right: dimension.cumulVar(...) }`

Unknown constraint objects are ignored by the compatibility shim.

### `RoutingDimension`

- `cumulVar(index): RoutingCumulVar`
- `hasSoftSpanUpperBounds(): boolean`
- `setSoftSpanUpperBoundForVehicle(boundCost, vehicle): void`
- `getSoftSpanUpperBoundForVehicle(vehicle): BoundCost`
- `hasQuadraticCostSoftSpanUpperBounds(): boolean`
- `setQuadraticCostSoftSpanUpperBoundForVehicle(boundCost, vehicle): void`
- `getQuadraticCostSoftSpanUpperBoundForVehicle(vehicle): BoundCost`

`cumulVar(index)` returns an opaque cumul-variable handle for assignment reads
and solver constraints.

### `BoundCost`

```ts
new BoundCost(bound = 0, cost = 0)
```

Fields:

- `bound: bigint`
- `cost: bigint`

### `Assignment`

- `objectiveValue(): bigint`
- `value(nextVar): number`
- `value(cumulVar): bigint`
- `min(nextVar): number`
- `min(cumulVar): bigint`

For `nextVar(index)`, pass the returned value into `assignment.value()` to get
the next index. For dimensions, pass `dimension.cumulVar(index)`.

### Routing Parameters And Enums

- `defaultRoutingSearchParameters(): RoutingSearchParameters`
- `defaultRoutingModelParameters(): RoutingModelParameters`
- `findErrorInRoutingSearchParameters(params): string`
- `BOOL_FALSE`, `BOOL_TRUE`, `BOOL_UNSPECIFIED`

`RoutingSearchParameters` currently exposes the subset used by the bridge:

- `firstSolutionStrategy?: FirstSolutionStrategy`
- `solutionLimit?: number`
- `localSearchOperators?: Record<string, unknown>`
- `localSearchMetaheuristic?: LocalSearchMetaheuristic`

`RoutingModelParameters` exposes:

- `solverParameters.copyFrom(value): void`
- `solverParameters.tracePropagation: boolean`
- `solverParameters.profileLocalSearch: boolean`

`findErrorInRoutingSearchParameters(params)` returns an empty string when the
supported parameter subset is valid.

`FirstSolutionStrategy` contains:

- `UNSET`
- `AUTOMATIC`
- `PATH_CHEAPEST_ARC`
- `PATH_MOST_CONSTRAINED_ARC`
- `EVALUATOR_STRATEGY`
- `SAVINGS`
- `SWEEP`
- `CHRISTOFIDES`
- `ALL_UNPERFORMED`
- `BEST_INSERTION`
- `PARALLEL_CHEAPEST_INSERTION`
- `SEQUENTIAL_CHEAPEST_INSERTION`
- `LOCAL_CHEAPEST_INSERTION`
- `LOCAL_CHEAPEST_COST_INSERTION`
- `GLOBAL_CHEAPEST_ARC`
- `LOCAL_CHEAPEST_ARC`
- `FIRST_UNBOUND_MIN_VALUE`

`LocalSearchMetaheuristic` contains:

- `UNSET`
- `GUIDED_LOCAL_SEARCH`

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
import { MPSolver, MPSolverParameters } from 'or-tools-wasm/mp-solver';
```

Build the model and select the executor at the solve boundary:

```ts
const solver = MPSolver.createSolver('GLOP'); // or 'CLP' / 'GLPK_LP' for LP backends
if (!solver) throw new Error('LP backend unavailable');

const x = solver.addNumVariable(0, solver.infinity(), 'x');
const y = solver.addNumVariable(0, solver.infinity(), 'y');
const c = solver.addConstraint(-solver.infinity(), 14, 'c');
c.setCoefficient(x, 1);
c.setCoefficient(y, 2);
solver.objective().setCoefficient(x, 3);
solver.objective().setCoefficient(y, 1);
solver.objective().setMaximization();

const status = await solver.solve({ executor: 'worker' });
```

`solve()`, `solveWithProto()`, and `MPSolver.solveModelRequest()` accept the
same execution controls as CP-SAT: choose an executor with `executor`, cancel
with an `AbortSignal` in `signal`, and observe lifecycle events with `onEvent`.
Cancellation should use the worker executor. GLOP, SAT, and PDLP solves are
interrupted natively; for backends without native interruption support, the
worker is terminated and recreated. Direct execution cannot stop native work
already in progress.

### Solver Types And Status

`OptimizationProblemType` contains OR-Tools MPSolver problem type ids, including
`GLOP_LINEAR_PROGRAMMING`, `CLP_LINEAR_PROGRAMMING`, `PDLP_LINEAR_PROGRAMMING`,
`SAT_INTEGER_PROGRAMMING`, `GLPK_LINEAR_PROGRAMMING`,
`SCIP_MIXED_INTEGER_PROGRAMMING`, `GLPK_MIXED_INTEGER_PROGRAMMING`,
`CBC_MIXED_INTEGER_PROGRAMMING`, `BOP_INTEGER_PROGRAMMING`,
`KNAPSACK_MIXED_INTEGER_PROGRAMMING`, and
others. Only problem types compiled into the WebAssembly runtime will be supported at runtime; use
`MPSolver.supportsProblemType()`.

The default package runtime currently includes `GLOP`, `CLP`, and `GLPK_LP` for
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
- `getLinearSolverSchemas(options?): Promise<LinearSolverSchemas>`
- `createModelRequest(request): Promise<Uint8Array>`
- `createSolutionResponse(response): Promise<Uint8Array>`
- `decodeSolutionResponse(bytes): Promise<MPSolverSolutionResponse>`
- `solveModelRequest(request, options?): Promise<MPSolverProtoSolveResult>`

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
- `exportModelProto(options?): Promise<Uint8Array>`
- `exportModelRequestProto(options?): Promise<Uint8Array>`
- `verifySolution(tolerance, logErrors): boolean`
- `reset(): void`
- `nextSolution(): boolean`

Options and output:

- `enableOutput(): void`
- `suppressOutput(): void`
- `outputIsEnabled(): boolean`
- `setTimeLimit(milliseconds): void`
- `timeLimit(): number`
- `setNumThreads(numThreads): boolean`
- `getNumThreads(): number`
- `setSolverSpecificParametersAsString(parameters): boolean`
- `getSolverSpecificParametersAsString(): string`
- `solverVersion(): string`
- `computeConstraintActivities(): number[]`
- `computeExactConditionNumber(): number`
- `setHint(variables, values): void`
- `exportModelAsLpFormat(obfuscate): string`
- `exportModelAsMpsFormat(fixedFormat, obfuscate): string`
- `wallTime(): number`
- `iterations(): number`
- `nodes(): number`

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

const profit = await solver.solve({ executor: 'worker' });
const selected = [0, 1, 2, 3].filter((item) => solver.bestSolutionContains(item));
console.log(asNumber(profit), selected, solver.isSolutionOptimal());
```

The runtime is loaded lazily. Select execution for each solve with
`executor: 'auto' | 'direct' | 'worker'` or a server/cloud executor
configuration. `signal` cancels worker and remote jobs; a direct native solve
cannot be interrupted after it starts. Knapsack emits the shared solver
lifecycle events through `onEvent` but has no native solution-progress callback.
A solver instance accepts one solve at a time, and an `onEvent` error is reported
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

`KnapsackSolver` supports `init()`, `solve()`, `bestSolutionContains()`,
`isSolutionOptimal()`, `setUseReduction()`, `setTimeLimit()`, and `getName()`.
Profits, weights, and capacities accept `IntValue`; `solve()` returns the exact
optimal profit as `bigint`.

The MPSolver frontend also exposes
`KNAPSACK_MIXED_INTEGER_PROGRAMMING`, `MPSolver.createSolver('KNAPSACK')`, and
the proto solve path for knapsack-shaped 0-1 models.

## Set Cover

The Set Cover API provides weighted covering models, solution invariants, and
heuristic searches. The runtime is loaded lazily and execution is selected per
search, following the same execution contract as CP-SAT.

```ts
import {
  ConsistencyLevel,
  GreedySolutionGenerator,
  SetCoverInvariant,
  SetCoverModel,
} from 'or-tools-wasm/set-cover';

const model = new SetCoverModel();
model.addEmptySubset(2.0);
model.addElementToLastSubset(0);
model.addEmptySubset(2.0);
model.addElementToLastSubset(1);
model.addEmptySubset(1.0);
model.addElementToLastSubset(0);
model.addElementToLastSubset(1);

const inv = new SetCoverInvariant(model);
const greedy = new GreedySolutionGenerator(inv);
if (await greedy.nextSolution(undefined, { executor: 'worker' })) {
  console.log(inv.cost(), inv.exportSolutionAsProto().subset);
  console.log(inv.checkConsistency(ConsistencyLevel.COST_AND_COVERAGE));
}
```

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

`SetCoverInvariant` exposes:

- `initialize()`, `clear()`, `model()`, `setModel(model)`
- `cost()`, `numUncoveredElements()`, `isSelected()`, `coverage()`
- `numFreeElements()`, `numCoverageLe1Elements()`
- `computeCoverageInFocus(focus)`, `isRedundant()`, `computeIsRedundant(subset)`
- `trace()`, `clearTrace()`, `compressTrace()`
- `loadSolution(solution)`, `checkConsistency(consistency)`, `recompute()`
- `select(subset, consistency)`, `deselect(subset, consistency)`
- `exportSolutionAsProto()`, `importSolutionFromProto(proto)`

`ConsistencyLevel` exposes `COST_AND_COVERAGE`, `FREE_AND_UNCOVERED`, and
`REDUNDANCY`. Solution generators and searches expose `nextSolution()` and
`setMaxIterations()`:

- `TrivialSolutionGenerator`
- `RandomSolutionGenerator`
- `GreedySolutionGenerator`
- `ElementDegreeSolutionGenerator`
- `LazyElementDegreeSolutionGenerator`
- `SteepestSearch`
- `GuidedLocalSearch`
- `GuidedTabuSearch`

`TabuList` remains available. Model and solution proto conversion is
object-based through the model and invariant methods; native filesystem helpers
are not exposed.

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
numbers are rejected instead of being rounded. Solved schedule times are exact
`bigint` values.

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
- the generated `CpModel`, `starts`, `ends`, and `makespanVar` for callers that
  need the lower-level CP-SAT model path

`RcpspParser` exposes `problem()` and `parseString()`. Native filesystem helpers
are not exposed; pass file contents to `parseString()`.

The CP-SAT-backed builder supports the standard renewable-resource RCPSP case:
activities, durations, precedence constraints, renewable resource capacities,
and makespan minimization. RCPSP/Max delays, resource-investment objectives, and
consumer/producer instances are parsed as proto data but rejected by
`toCpSatModel()` / `solve()` until those variants have a dedicated model
translation.

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
const status = await maxFlow.solve(0, 4, { executor: 'worker' });
if (status === SimpleMaxFlowStatus.OPTIMAL) {
  console.log(asNumber(maxFlow.optimalFlow()), maxFlow.flows(arcs));
}
```

Every solve accepts `executor`, `signal`, and `onEvent`. `executor` supports
the shared `direct`, `worker`, `server`, `cloud`, and `auto` selections. The
default is `auto`; browser main-thread calls select a worker while environments
without browser workers select direct execution. There is no global initializer
or executor setting.

Capacities, supplies, costs, flows, and objective totals accept `IntValue` and
are returned as `bigint`. Node and arc indexes remain checked `number` values.

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
- `solve(source, sink, options?): Promise<number>`
- `optimalFlow(): bigint`
- `flow(arc): bigint`
- `flows(arcs): bigint[]`
- `getSourceSideMinCut(): number[]`
- `getSinkSideMinCut(): number[]`

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
- `solve(options?): Promise<number>`
- `solveMaxFlowWithMinCost(options?): Promise<number>`
- `optimalCost(): bigint`
- `maximumFlow(): bigint`
- `flow(arc): bigint`
- `flows(arcs): bigint[]`

`SimpleLinearSumAssignment` exposes:

- `SimpleLinearSumAssignmentStatus`: `OPTIMAL`, `INFEASIBLE`, `POSSIBLE_OVERFLOW`
- `addArcWithCost(leftNode, rightNode, cost): number`
- `addArcsWithCost(leftNodes, rightNodes, costs): number[]`
- `numNodes(): number`
- `numArcs(): number`
- `leftNode(arc): number`
- `rightNode(arc): number`
- `cost(arc): bigint`
- `solve(options?): Promise<number>`
- `optimalCost(): bigint`
- `rightMate(leftNode): number`
- `assignmentCost(leftNode): bigint`

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

Initialize, build a model, and solve:

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
```

The runtime is loaded lazily. Select `auto`, `direct`, `worker`, `server`, or
`cloud` per solve with the `executor` option.

### `MathOpt`

Static constructors and aliases:

- `MathOpt.Model(name?): MathOptModel`
- `MathOpt.SolverType`
- `MathOpt.LinearExpression`
- `MathOpt.QuadraticExpression`
- `MathOpt.QuadraticTermKey`
- `MathOpt.VarEqVar`
- `MathOpt.BoundedExpression`
- `MathOpt.LowerBoundedExpression`
- `MathOpt.UpperBoundedExpression`
- `MathOpt.LPAlgorithm`
- `MathOpt.Emphasis`
- `MathOpt.GScipEmphasis`
- `MathOpt.GScipMetaParamValue`
- `MathOpt.GScipParameters`
- `MathOpt.GlopParameters`
- `MathOpt.PdlpParameters`
- `MathOpt.PdlpOptimalityNorm`
- `MathOpt.PdlpSchedulerType`
- `MathOpt.PdlpRestartStrategy`
- `MathOpt.PdlpLinesearchRule`
- `MathOpt.GlpkParameters`
- `MathOpt.SolveInterrupter`
- `MathOpt.IncrementalSolver`
- `MathOpt.ModelSolveParameters`
- `MathOpt.SparseVectorFilter`
- `MathOpt.SolutionHint`

Top-level value exports:

- `MathOpt`
- `terminateLoadedRuntimeThreads`
- `MathOptModel`
- `MathOptObjective`
- `MathOptIndicatorConstraint`
- `MathOptSolveInterrupter`
- `MathOptIncrementalSolver`
- `MathOptModelSolveParameters`
- `MathOptSparseVectorFilter`
- `MathOptSolutionHint`
- `MathOptSolverType`
- `MathOptLPAlgorithm`
- `MathOptEmphasis`
- `GScipEmphasis`
- `GScipMetaParamValue`
- `PdlpOptimalityNorm`
- `PdlpSchedulerType`
- `PdlpRestartStrategy`
- `PdlpLinesearchRule`
- `GScipParameters`
- `GlopParameters`
- `PdlpParameters`
- `GlpkParameters`

Top-level type exports:

- `MathOptDualSolutionResult`
- `MathOptDualRayResult`
- `MathOptBasisResult`
- `MathOptIndicatorConstraintOptions`
- `MathOptIncrementalSolveOptions`
- `MathOptIncrementalSolverOptions`
- `MathOptLinearConstraint`
- `MathOptLinearConstraintMatrixEntry`
- `MathOptLinearTerm`
- `MathOptModelSolveParametersOptions`
- `MathOptPrimalSolutionResult`
- `MathOptPrimalRayResult`
- `MathOptSolutionResult`
- `MathOptSolutionHintOptions`
- `MathOptSolveInterrupterLike`
- `MathOptSolveOptions`
- `MathOptSolveResult`
- `MathOptSparseVectorFilterInput`
- `MathOptSparseVectorFilterOptions`
- `MathOptVariable`
- `MathOptVariableOptions`
- `GScipParametersOptions`
- `GlopParametersOptions`
- `GlpkParametersOptions`
- `PdlpParametersOptions`

Solving:

- `MathOpt.solve(model, options?): Promise<MathOptSolveResult>`
- `MathOpt.encodeSolveRequest(model, options?): Uint8Array`
- `new MathOpt.IncrementalSolver(model, solverType?, options?)`
- `incrementalSolver.solve(options?): Promise<MathOptSolveResult>`
- `incrementalSolver.close(): Promise<void>`

`MathOptSolveOptions`:

- `executor?: 'auto' | 'direct' | 'worker' | 'server' | 'cloud' | ExecutorConfiguration`
- `solverType?: MathOptSolverType | keyof typeof MathOptSolverType`
- `removeNames?: boolean`
- `interrupter?: MathOptSolveInterrupter`
- `messageCallback?: (messages: string[]) => void`
- `modelParameters?: Uint8Array | MathOptModelSolveParameters | MathOptModelSolveParametersOptions`
- `timeLimitSeconds?: number`
- `threads?: number`
- `iterationLimit?: number`
- `nodeLimit?: number`
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
- `cpSat?: Omit<SatParameters, 'numWorkers' | 'numSearchWorkers'> | Uint8Array`
- `pdlp?: PdlpParameters | PdlpParametersOptions | Uint8Array`
- `glpk?: GlpkParameters | GlpkParametersOptions | Uint8Array`

`removeNames` omits model, variable, linear constraint, and
indicator constraint names from the encoded `ModelProto`, matching upstream
MathOpt `solve(remove_names=True)` behavior for models with duplicate names.

`messageCallback` receives batched solver log lines after the WASM
solve returns. Passing a message callback enables solver output capture and
also stores the captured lines on `MathOptSolveResult.messages`.

`MathOpt.SolveInterrupter` mirrors the upstream one-shot interrupter shape for
MathOpt solves. Call `interrupt()` before passing it as `interrupter` to request
early termination; the result exposes the corresponding termination limit.

#### Full, Incremental, And Filtered Solves

`MathOpt.solve(model, options?)` is the stateless/full solve path. It encodes
the current model into a `SolveRequest`, solves it, and does not keep a native
solver handle for later reuse. Use `MathOpt.encodeSolveRequest(model, options?)`
when you need the raw proto-oriented request bytes.

`MathOpt.IncrementalSolver` keeps a native MathOpt solver handle alive across
solves. Construct it with the `MathOptModel` instance you intend to mutate, then
call `solve()` after each model edit:

```ts
const model = MathOpt.Model('rolling_lp');
const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
model.maximize([{ variable: x, coefficient: 2 }]);

const solver = new MathOpt.IncrementalSolver(model, MathOpt.SolverType.GLOP, {
  presolve: MathOpt.Emphasis.OFF,
});

let result = await solver.solve();

x.upperBound = 3;
result = await solver.solve(); // sends the bound update to the native solver

await solver.close();
```

Tracked incremental updates include variable bounds/integrality, linear
constraint bounds, objective changes, new/deleted variables and linear
constraints, matrix coefficient changes, and new/deleted indicator constraints.
Constructor options are used as defaults for every solve; per-call `solve()`
options override those defaults except for executor placement and solver type,
which are fixed by the incremental solver. `close()` releases the native handle
and is safe to call more than once.

`solve()` accepts the same solver options as `MathOpt.solve()`, including
message callbacks, `ModelSolveParameters`, backend-specific parameters, and
pre-interrupted solve interrupters. If a backend rejects an
incremental model update but can solve the current full model, the wrapper
recreates the native solver and solves from that current full model. This keeps
callers on one API for backends with limited update support, while still
surfacing errors from invalid full models. Duplicate names are rejected for
incremental solvers unless `removeNames` is set.

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
proto bytes for advanced callers. Thread count is always configured with the
top-level `threads` option, independent of the selected MathOpt backend.

`modelParameters` and each backend parameter option may be raw serialized proto
bytes. This preserves a proto escape hatch for backend fields that do not yet
have ergonomic TypeScript wrappers.

`MathOpt.ModelSolveParameters` encodes model-specific solve controls:

- `variableValuesFilter`
- `dualValuesFilter`
- `reducedCostsFilter`
- `quadraticDualValuesFilter`
- `initialBasis` as raw `BasisProto` bytes
- `solutionHints`
- `branchingPriorities`
- `lazyLinearConstraints`
- `onlySomePrimalVariables(variables)` as a convenience constructor for
  filtering returned primal variable values

`MathOpt.SparseVectorFilter` accepts `skipZeroValues`, `filterByIds`, and
either numeric ids or model elements with an `id`. `MathOpt.SolutionHint`
accepts primal variable values and dual linear constraint values.

`GlpkParameters` mirrors the upstream MathOpt GLPK-specific solve parameters:

- `computeUnboundRaysIfPossible?: boolean`

GLPK is single-threaded in this package. MathOpt GLPK solves reject
`threads > 1`; omit `threads` or pass `threads: 1`.

`MathOptSolveResult`:

- `terminationReason: string`
- `terminationLimit: string | null`
- `solveTimeSeconds: number | null`
- `primalBound: number | null`
- `dualBound: number | null`
- `primalStatus: string | null`
- `dualStatus: string | null`
- `primalOrDualInfeasible: boolean`
- `objectiveValue: number | null`
- `variableValues: Record<string, number>`
- `variableValuesById: Record<number, number>`
- `solutions: MathOptSolutionResult[]`
- `primalRays: MathOptPrimalRayResult[]`
- `dualRays: MathOptDualRayResult[]`
- `messages: string[]`
- `rawResponse: Uint8Array`

`MathOptSolutionResult`:

- `primalSolution: MathOptPrimalSolutionResult | null`
- `dualSolution: MathOptDualSolutionResult | null`
- `basis: MathOptBasisResult | null`

`MathOptPrimalSolutionResult`:

- `objectiveValue: number | null`
- `variableValues: Record<string, number>`
- `variableValuesById: Record<number, number>`
- `feasibilityStatus: string`

`MathOptDualSolutionResult`:

- `objectiveValue: number | null`
- `dualValues: Record<string, number>`
- `dualValuesById: Record<number, number>`
- `reducedCosts: Record<string, number>`
- `reducedCostsById: Record<number, number>`
- `feasibilityStatus: string`

`MathOptPrimalRayResult`:

- `variableValues: Record<string, number>`
- `variableValuesById: Record<number, number>`

`MathOptDualRayResult`:

- `dualValues: Record<string, number>`
- `dualValuesById: Record<number, number>`
- `reducedCosts: Record<string, number>`
- `reducedCostsById: Record<number, number>`

`MathOptBasisResult`:

- `variableStatus: Record<string, string>`
- `variableStatusById: Record<number, string>`
- `constraintStatus: Record<string, string>`
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
- `ne(lhs, rhs)` throws, because `!=` constraints are unsupported.
- `le(lhs, rhs)`
- `ge(lhs, rhs)`
- `completeUpperBound(lowerBounded, upperBound)`
- `completeLowerBound(lowerBound, upperBounded)`
- `variableEq(lhs, rhs)`
- `variableNe(lhs, rhs)`

These helpers are available as `MathOpt.*` static methods. Some helper classes
are exposed as `MathOpt.LinearExpression`, `MathOpt.QuadraticExpression`, etc.,
rather than as top-level value exports.

### `MathOptModel`

Variables:

- `addVariable(options?): MathOptVariable`
- `addIntegerVariable(options?): MathOptVariable`
- `addBinaryVariable(options?): MathOptVariable`
- `deleteVariable(variable): void`
- `variablesList(): MathOptVariable[]`
- `variables(): MathOptVariable[]`
- `getNumVariables(): number`
- `getnextVariableId(): number`
- `ensurenextVariableIdAtLeast(id): void`
- `hasVariable(id): boolean`
- `getVariable(id, validate?): MathOptVariable | undefined`

Linear constraints:

- `addLinearConstraint(options?): MathOptLinearConstraint`
- `deleteLinearConstraint(constraint): void`
- `linearConstraints(): MathOptLinearConstraint[]`
- `getNumLinearConstraints(): number`
- `getNextLinearConstraintId(): number`
- `ensureNextLinearConstraintIdAtLeast(id): void`
- `hasLinearConstraint(id): boolean`
- `getLinearConstraint(id, validate?): MathOptLinearConstraint | undefined`
- `columnNonzeros(variable): MathOptLinearConstraint[]`
- `rowNonzeros(constraint): MathOptVariable[]`
- `linearConstraintMatrixEntries(): MathOptLinearConstraintMatrixEntry[]`

Indicator constraints:

- `addIndicatorConstraint(options?): MathOptIndicatorConstraint`

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
- `setQuadraticObjective(terms, isMaximize, offset?): void`
- `variableName(id): string`
- `linearConstraintName(id): string`
- `encodeModelProto(): Uint8Array`

`MathOptVariableOptions`:

- `lb?: number`
- `ub?: number`
- `isInteger?: boolean`
- `lowerBound?: number`
- `upperBound?: number`
- `integer?: boolean`
- `name?: string`

`addLinearConstraint()` accepts:

- `lb?: number`
- `ub?: number`
- `expr?: number | MathOptVariable | MathOptLinearTerm | linear expression`
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
- `lb` / `lowerBound` and `ub` / `upperBound`
- `expr` / `expression`
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

Properties:

- `isMaximize`
- `offset`
- `name`

`isMaximize` and `offset` are writable. `name` is read-only and
is currently the empty string for the primary objective.

Methods:

- `clear(): void`
- `setLinearCoefficient(variable, coefficient): void`
- `getLinearCoefficient(variable): number`
- `linearTerms(): MathOptLinearTerm[]`
- `setQuadraticCoefficient(firstVariable, secondVariable, coefficient): void`
- `getQuadraticCoefficient(firstVariable, secondVariable): number`
- `quadraticTerms(): MathOptQuadraticTerm[]`

### MathOpt Expression Classes

`MathOptLinearExpression`

- Construct from a number, variable, linear term, iterable of terms, or another
  expression.
- Properties: `offset`, `terms`.
- Methods: `add(input)`, `subtract(input)`, `multiply(coefficient)`,
  `evaluate(variableValues)`, `toString()`.

`MathOptQuadraticExpression`

- Construct from linear inputs plus optional quadratic terms.
- Properties: `offset`, `linearTerms`, `quadraticTerms`.
- Methods: `add(input)`, `subtract(input)`, `multiply(coefficient)`,
  `evaluate(variableValues)`, `toString()`.

`MathOptQuadraticTermKey`

- Construct from two variables in the same model.
- Properties: `firstVariable`, `secondVariable`.
- Methods: `equals(other)`, `toString()`.

`MathOptVarEqVar`

- Returned by `MathOpt.variableEq(lhs, rhs)` when two different live variables
  belong to the same model.
- Properties: `firstVariable`, `secondVariable`.
- Method: `assertNotBoolean(): never`.

Bounded expression classes represent constraints produced by `eq`, `le`, and
`ge`:

- `MathOptBoundedExpression`
- `MathOptLowerBoundedExpression`
- `MathOptUpperBoundedExpression`

They expose `lowerBound`, `upperBound`, and
`toString()`. `MathOptBoundedExpression` also exposes `expression` and
`assertNotBoolean()`. `MathOptLowerBoundedExpression` exposes `expression`,
`toBoundedExpression(upperBound)`, and `assertNotBoolean()`.
`MathOptUpperBoundedExpression` exposes `expression`,
`toBoundedExpression(lowerBound)`, and `assertNotBoolean()`.

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
- `toBytes(): Uint8Array`

Sparse matrix input accepts either:

```ts
{ numRows?: number; numColumns?: number; entries?: Array<{ row: number; column: number; value: number }> }
```

or a dense `number[][]`.

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
- `qpFromMpModelProto(proto, options?): Promise<QuadraticProgram>`
- `qpToMpModelProto(qp, options?): Promise<Uint8Array>`
- `solve(qp, options?): Promise<PdlpSolverResult>`

`PdlpSolveOptions` combines solver parameters with execution options:

- `terminationCriteria.iterationLimit`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalRelative`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalAbsolute`
- `terminationCheckFrequency`
- `lInfRuizIterations`
- `l2NormRescaling`
- `numThreads`

It also accepts `initialSolution`, `executor`, `signal`, and `onEvent`.
Conversion options such as `relaxIntegerVariables` and `includeNames` belong in
the same per-call options object.

`PdlpSolverResult` contains:

- `primalSolution`
- `dualSolution`
- `reducedCosts`
- `solveLog`

`solveLog` contains `terminationReason` and `iterationCount`.

## Executor Selection

The CP-SAT, MathOpt, Routing, MPSolver, Knapsack, Network Flow, Set
Cover, RCPSP, and PDLP paths can use the shared worker bridge. Worker bridge
availability is independent of solver threading support; for example GLPK, BOP,
Knapsack, Set Cover, and Network Flow are single-threaded but can still run
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

## Generated Protobuf Types

The package exports generated CP-SAT model and response types from
`generated/cp_model`, plus `SatParameters` from `generated/sat_parameters`.
These are large generated definitions matching OR-Tools protobuf schemas. Use
them to type JSON-like model and parameter objects passed to `CpSat.createModel`
and `CpSat.solve`.

For raw protobuf workflows, use the schema helpers:

- `CpSat.getSchemas()`
- `MPSolver.getLinearSolverSchemas()`
