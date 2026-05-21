# TypeScript API

This page documents the public exports from `or-tools-wasm`. The package is ESM
only:

```ts
import { CpSat, initRouting, RoutingIndexManager, RoutingModel } from 'or-tools-wasm';
```

Most solver runtimes are loaded lazily. Browser solves use the package worker
bridge by default so the main thread stays responsive. Browser pages still need
cross-origin isolation headers; see [Browser requirements](../README.md#browser-requirements).

## CP-SAT

Import:

```ts
import {
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
} from 'or-tools-wasm';
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
solver.parameters.numSearchWorkers = 4;
const status = await solver.solve(model);

console.log(solver.statusName(status));
console.log(solver.value(x), solver.value(y), solver.objectiveValue());
```

The high-level CP-SAT API uses explicit expression methods because JavaScript
does not support Python-style operator overloading. For example:

- `x.plus(y.times(2)).eq(29)` instead of `x + 2 * y == 29`
- `x.le(10)`, `x.lt(10)`, `x.ge(0)`, `x.gt(0)`, `x.ne(y)`
- `x.not()` or `x.negated()` for Boolean negation

Most high-level methods are exported in idiomatic camelCase, with snake_case
aliases for Python parity where useful. Some PascalCase aliases are also present
for compatibility with existing OR-Tools examples.

### `CpModel`

`new CpModel(model?: CpModelProto)`

Creates a high-level model. Passing an existing proto clones it into a wrapper.

Common variable methods:

- `newIntVar(lb, ub, name?)`
- `new_int_var(lb, ub, name?)`
- `NewIntVar(lb, ub, name?)`
- `newIntVarFromDomain(domain, name?)`
- `new_int_var_from_domain(domain, name?)`
- `NewIntVarFromDomain(domain, name?)`
- `newBoolVar(name?)`
- `new_bool_var(name?)`
- `NewBoolVar(name?)`
- `newConstant(value, name?)`
- `new_constant(value, name?)`
- `NewConstant(value, name?)`
- `getIntVarFromProtoIndex(index)`
- `get_int_var_from_proto_index(index)`
- `getBoolVarFromProtoIndex(index)`
- `get_bool_var_from_proto_index(index)`
- `getIntervalVarFromProtoIndex(index)`
- `get_interval_var_from_proto_index(index)`

Model/proto helpers:

- `name`: model name getter/setter.
- `proto()` / `Proto()`: returns the mutable `CpModelProto`.
- `clone()`: returns a new `CpModel` wrapper around a cloned proto.
- `removeAllNames()`
- `remove_all_names()`
- `validate(): Promise<string>`: returns `''` for a valid model, otherwise the
  native validation message.
- `modelStats(): string`
- `hasObjective(): boolean`
- `getOrMakeIndexFromConstant(value)`
- `get_or_make_index_from_constant(value)`
- `getOrMakeVariableIndex(variable)`
- `get_or_make_variable_index(variable)`
- `isBooleanValue(value)` / `is_boolean_value(value)`
- `isBooleanIndex(index)`
- `literalReferences(literals)`

Linear constraints and objectives:

- `add(bound: BoundedLinearExpr | boolean)`
- `Add(bound)`
- `addLinearConstraint(expression, lb, ub)`
- `add_linear_constraint(expression, lb, ub)`
- `AddLinearConstraint(expression, lb, ub)`
- `addEquality(left, right)`
- `minimize(expression)`
- `Minimize(expression)`
- `maximize(expression)`
- `Maximize(expression)`

Logical constraints:

- `addBoolOr(literals)`
- `add_bool_or(literals)`
- `AddBoolOr(literals)`
- `addBoolAnd(literals)`
- `add_bool_and(literals)`
- `AddBoolAnd(literals)`
- `addBoolXor(literals)`
- `add_bool_xor(literals)`
- `AddBoolXOr(literals)`
- `addAtLeastOne(literals)`
- `add_at_least_one(literals)`
- `addAtMostOne(literals)`
- `add_at_most_one(literals)`
- `addExactlyOne(literals)`
- `add_exactly_one(literals)`
- `addImplication(left, right)`
- `add_implication(left, right)`
- `addMapDomain(variable, booleanVariables, offset?)`
- `add_map_domain(variable, booleanVariables, offset?)`

Integer and table constraints:

- `addAllDifferent(expressions)`
- `AddAllDifferent(expressions)`
- `addElement(index, expressions, target)`
- `addAllowedAssignments(expressions, tuples)`
- `addForbiddenAssignments(expressions, tuples)`
- `addAutomaton(expressions, startingState, finalStates, transitions)`
- `addCircuit(arcs)`
- `addMultipleCircuit(arcs)`
- `addInverse(direct, inverse)`
- `addMaxEquality(target, expressions)`
- `add_max_equality(target, expressions)`
- `addMinEquality(target, expressions)`
- `add_min_equality(target, expressions)`
- `addAbsEquality(target, expression)`
- `add_abs_equality(target, expression)`
- `addDivisionEquality(target, numerator, denominator)`
- `add_division_equality(target, numerator, denominator)`
- `addModuloEquality(target, expression, modulo)`
- `add_modulo_equality(target, expression, modulo)`
- `addMultiplicationEquality(target, expressions)`
- `add_multiplication_equality(target, expressions)`

Scheduling constraints:

- `newIntervalVar(start, size, end, name?)`
- `new_interval_var(start, size, end, name?)`
- `newFixedSizeIntervalVar(start, size, name?)`
- `new_fixed_size_interval_var(start, size, name?)`
- `newOptionalFixedSizeIntervalVar(start, size, isPresent, name?)`
- `new_optional_fixed_size_interval_var(start, size, isPresent, name?)`
- `newOptionalIntervalVar(start, size, end, isPresent, name?)`
- `new_optional_interval_var(start, size, end, isPresent, name?)`
- `addNoOverlap(intervals)`
- `add_no_overlap(intervals)`
- `AddNoOverlap(intervals)`
- `addNoOverlap2D(xIntervals, yIntervals)`
- `add_no_overlap_2d(xIntervals, yIntervals)`
- `AddNoOverlap2D(xIntervals, yIntervals)`
- `addCumulative(intervals, demands, capacity)`
- `add_cumulative(intervals, demands, capacity)`
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
- `LinearExpr`, `BoundedLinearExpr`, `BoundedLinearExpression`
- `FlatIntExpr`, `FlatFloatExpr`
- `IntervalVar`, `Constraint`
- `Domain`
- `ValueError`, `RuntimeError`, `ArithmeticError`, `NotImplementedError`
- `sum(values)`, `weightedSum(values, coeffs)`, `term(variable, coeff)`
- `object_is_a_true_literal(literal)`, `object_is_a_false_literal(literal)`
- `rebuild_from_linear_expression_proto(proto, modelProto)`
- camelCase aliases: `objectIsATrueLiteral`, `objectIsAFalseLiteral`,
  `rebuildFromLinearExpressionProto`
- types: `LinearExprLike`, `LiteralLike`

Expression helpers:

- `LinearExpr.constant(value)`
- `LinearExpr.from(value)`
- `LinearExpr.affine(expression, coeff, offset)`
- `LinearExpr.sum(values)` / `LinearExpr.Sum(values)`
- `LinearExpr.weightedSum(values, coeffs)`
- `LinearExpr.weighted_sum(values, coeffs)`
- `LinearExpr.WeightedSum(values, coeffs)`
- `LinearExpr.term(variable, coeff)` / `LinearExpr.Term(variable, coeff)`
- `plus(value, coeff?)`, `minus(value)`, `times(coeff)`, `neg()`
- `eq(value)`, `ne(value)`, `le(value)`, `lt(value)`, `ge(value)`, `gt(value)`
- `toProto()`
- `isInteger()` / `is_integer()`
- `hasFloatingPointTerms()`
- `toString()` and `repr()` for display/debug parity with Python-style tests
- `toFloatObjective(maximize?)`

Unsupported Python-style operation methods such as `abs()`, `div()`,
`truediv()`, `mod()`, and the `__pow__`/bitwise helpers throw
`NotImplementedError` with guidance to use the matching `CpModel` constraint
method instead.

`IntVar` supports:

- `name`, `model_proto`, `expr()`
- `plus(value, coeff?)`, `minus(value)`, `times(coeff)`, `neg()`
- `eq(value)`, `ne(value)`, `le(value)`, `lt(value)`, `ge(value)`, `gt(value)`
- `isInteger()` / `is_integer()`
- `isBoolean()` / `is_boolean`
- `negated()` for Boolean variables
- `debugString()`, `repr()`, `toString()`
- Python-style helper aliases used by parity tests: `__add__`, `__mul__`,
  `__lt__`, `__gt__`, `__abs__`, `__div__`, `__truediv__`, `__mod__`, and
  unsupported bitwise/power helpers.

`BoolVar` extends `IntVar` with:

- `literalIndex`
- `not()`

`NotBoolVar` supports:

- `variable`, `model`, `index`, `name`, `model_proto`
- `not()` / `negated()`
- `expr()`
- `plus(value, coeff?)`, `minus(value)`, `times(coeff)`, `neg()`
- `isInteger()` / `is_integer()`
- `repr()`, `toString()`

`FlatIntExpr` and `FlatFloatExpr` support:

- `vars`
- `coeffs`
- `offset`
- `expr()`
- `plus(value)`, `minus(value)`, `times(coeff)`
- `repr()`, `toString()`

`BoundedLinearExpr` supports:

- `expression`
- `lowerBound`
- `upperBound`
- `domain`
- `toString()`

`BoundedLinearExpression` builds a `BoundedLinearExpr` from an expression and a
`Domain`.

`Domain` supports:

- `new Domain(lower, upper)`
- `new Domain(value)`
- `Domain.fromFlatIntervals(intervals)`
- `Domain.from_flat_intervals(intervals)`
- `Domain.fromIntervals(intervals)`
- `Domain.from_intervals(intervals)`
- `Domain.fromValues(values)`
- `Domain.from_values(values)`
- `flatIntervals`

`Constraint` supports:

- `model`
- `index`
- `name`
- `withName(name)`
- `with_name(name)`
- `onlyEnforceIf(literals)`

`IntervalVar` supports:

- `model`
- `index`
- `name`
- `model_proto`
- `startExpr()`
- `sizeExpr()`
- `endExpr()`
- `presenceLiterals()`
- `repr()`, `toString()`

### `CpSolver`

`new CpSolver()`

High-level solver wrapper. It delegates to the proto-first `CpSat` runtime while
keeping the latest decoded response for Python-like result helpers.

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

- `response()`
- `responseStats()`
- `solutionInfo()`
- `statusName(status?)`
- `value(expression)`
- `floatValue(expression)`
- `booleanValue(literal)`
- `objectiveValue()`
- `bestObjectiveBound()`

Response properties:

- `response_proto`
- `solve_log`
- `objective_value`
- `best_objective_bound`
- `wall_time` / `wallTime`
- `user_time`
- `deterministic_time`
- `num_booleans` / `numBooleans`
- `num_conflicts` / `numConflicts`
- `num_branches` / `numBranches`
- `num_integers`
- `num_binary_propagations`
- `num_integer_propagations`

Callbacks:

- `solver.bestBoundCallback = (bound) => {}`
- `solver.logCallback = (message) => {}`
- Python-style aliases: `best_bound_callback`, `log_callback`

`CpSolverSolutionCallback` can be subclassed or assigned an
`onSolutionCallback()` method. During a callback, use `value()`, `floatValue()`,
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
  numSearchWorkers: 4,
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

`CpSat.solve(model: Uint8Array, params?: Uint8Array | SatParameters | null, callbacks?: CpSatSolveCallbacks): Promise<CpSatSolveResult>`

Solves a binary `CpModelProto`. `params` can be binary `SatParameters`, a
JSON-like `SatParameters` object, or `null`. The returned `CpSatSolveResult`
contains:

- `response`: decoded `CpSolverResponse | null`
- `bytes`: raw binary `CpSolverResponse`

`callbacks` may contain:

- `onSolution(response, bytes)`: called for intermediate solutions when enabled
  by compatible solver parameters.
- `onBestBound(bound)`: called on best-bound updates.
- `onLog(message)`: called for solver log output.

`CpSat.solveRaw(model: Uint8Array, params?: Uint8Array | null): Promise<Uint8Array>`

Low-level solve that returns raw `CpSolverResponse` bytes and accepts only raw
parameter bytes.

`CpSat.cancelSolve(): Promise<void>`

Requests cancellation of the active CP-SAT solve.

`CpSat.getSchemas(): Promise<{ cp_model: string; sat_parameters: string; linear_solver?: string; optional_boolean?: string }>`

Returns embedded `.proto` schemas. CP-SAT always returns `cp_model` and
`sat_parameters`; MPSolver-related schemas may be present when fetched through
the worker path.

`CpSat.loadModule(): Promise<unknown>`

Loads the CP-SAT WebAssembly module directly. This is mostly an escape hatch;
normal application code should use `solve()`.

`CpSat.setWorkerBridgeEnabled(enabled: boolean): void`

Alias for the shared package worker bridge control.

`CpSat.isWorkerBridgeEnabled(): boolean`

Alias for the shared package worker bridge state.

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
  BoundCost,
  DefaultRoutingModelParameters,
  initRouting,
  LocalSearchMetaheuristic,
  RoutingIndexManager,
  RoutingModel,
  RoutingSearchStatus,
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
} from 'or-tools-wasm';
```

Always initialize the routing runtime before constructing routing objects:

```ts
await initRouting();

const manager = new RoutingIndexManager(distanceMatrix.length, 1, 0);
const routing = new RoutingModel(manager);
const transit = routing.RegisterTransitCallback((from, to) => {
  return distanceMatrix[manager.IndexToNode(from)][manager.IndexToNode(to)];
});
routing.SetArcCostEvaluatorOfAllVehicles(transit);

const params = DefaultRoutingSearchParameters();
params.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;
const assignment = await routing.SolveWithParameters(params);
```

The Routing API is a high-level wrapper around the compiled OR-Tools Routing
runtime. It keeps Python-style method names for parity with upstream examples
and tests.

### Initialization

`initRouting(): Promise<void>`

Loads the routing WebAssembly runtime. Construction of `RoutingIndexManager` or
`RoutingModel` before this resolves will throw.

### `RoutingIndexManager`

Constructors:

```ts
new RoutingIndexManager(numLocations, numVehicles, depot)
new RoutingIndexManager(numLocations, numVehicles, starts, ends)
```

Methods:

- `indexToNode(index): Promise<number>`
- `nodeToIndex(node): Promise<number>`
- `indexToNodeSync(index): number`
- `nodeToIndexSync(node): number`
- `IndexToNode(index): number`
- `NodeToIndex(node): number`
- `GetNumberOfNodes(): number`
- `GetNumberOfVehicles(): number`
- `GetNumberOfIndices(): number`
- `GetStartIndex(vehicle): number`
- `GetEndIndex(vehicle): number`
- `delete(): void`

Properties:

- `ready: Promise<void>`
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

Callbacks and costs:

- `RegisterTransitCallback((fromIndex, toIndex) => number): number`
- `RegisterTransitMatrix(matrix: number[][]): number`
- `RegisterUnaryTransitCallback((fromIndex) => number): number`
- `RegisterUnaryTransitVector(values: number[]): number`
- `SetArcCostEvaluatorOfAllVehicles(evaluatorIndex): void`
- `GetArcCostForVehicle(fromIndex, toIndex, vehicle): number`

Dimensions:

- `AddDimension(transitIndex, slackMax, capacity, fixStartCumulToZero, name): boolean`
- `AddDimensionWithVehicleCapacity(transitIndex, slackMax, capacities, fixStartCumulToZero, name): boolean`
- `AddDimensionWithVehicleTransits(transitIndices, slackMax, capacity, fixStartCumulToZero, name): boolean`
- `AddConstantDimension(value, capacity, fixStartCumulToZero, name): [number, boolean]`
- `AddVectorDimension(values, capacity, fixStartCumulToZero, name): [number, boolean]`
- `AddMatrixDimension(matrix, capacity, fixStartCumulToZero, name): [number, boolean]`
- `GetDimensionOrDie(name): RoutingDimension`

Search and assignments:

- `Solve(): Promise<Assignment | null>`
- `SolveWithParameters(parameters): Promise<Assignment | null>`
- `solveWithParametersSync(parameters): Assignment | null`
- `SolveFromAssignmentWithParameters(assignment, parameters): Promise<Assignment | null>`
- `ReadAssignmentFromRoutes(routes, ignoreInactiveIndices): Assignment`
- `CloseModelWithParameters(parameters): void`
- `status(): RoutingSearchStatus`

Route structure and model helpers:

- `Start(vehicle): number`
- `End(vehicle): number`
- `IsEnd(index): boolean`
- `NextVar(index): number`
- `VehicleVar(index): RoutingVehicleVar`
- `vehicles(): number`
- `AddDisjunction(indices, penalty?): number`
- `AddPickupAndDelivery(pickup, delivery): void`
- `AddAtSolutionCallback(callback): void`
- `GetAutomaticFirstSolutionStrategy(): FirstSolutionStrategy`
- `GetNumberOfDecisionsInFirstSolution(parameters): number`
- `GetNumberOfRejectsInFirstSolution(parameters): number`
- `CostVar(): { Max(): number }`
- `solver(): { Parameters(): { trace_propagation: boolean }; LocalSearchProfile(): string; Add(...): void }`
- `delete(): void`

`NextVar(index)` returns an opaque next-variable handle represented by the
index. Pass that value to `assignment.Value(...)`. `VehicleVar(index)` returns
an opaque vehicle-variable handle for solver constraints.

Advanced assignment helpers are also exposed for parity with the current
wrapper implementation:

- `assignmentObjectiveValue(): number`
- `nextValue(index): number`
- `dimensionCumulValue(dimensionName, index): number`

These helpers read values from the current assignment state and are usually
used through `Assignment`.

### Routing Solver Constraints

`routing.solver().Add(...)` accepts the routing constraint objects currently
needed for pickup-and-delivery parity. JavaScript does not support Python-style
operator overloading, so constraints are explicit objects:

```ts
routing.AddPickupAndDelivery(pickupIndex, deliveryIndex);

routing.solver().Add({
  type: 'routingVehicleEquality',
  left: routing.VehicleVar(pickupIndex),
  right: routing.VehicleVar(deliveryIndex),
});

const distance = routing.GetDimensionOrDie('distance');
routing.solver().Add({
  type: 'routingCumulLessOrEqual',
  left: distance.CumulVar(pickupIndex),
  right: distance.CumulVar(deliveryIndex),
});
```

Supported solver constraint object shapes:

- `{ type: 'routingVehicleEquality', left: routing.VehicleVar(...), right: routing.VehicleVar(...) }`
- `{ type: 'routingCumulLessOrEqual', left: dimension.CumulVar(...), right: dimension.CumulVar(...) }`

Unknown constraint objects are ignored by the compatibility shim.

### `RoutingDimension`

- `CumulVar(index): RoutingCumulVar`
- `HasSoftSpanUpperBounds(): boolean`
- `SetSoftSpanUpperBoundForVehicle(boundCost, vehicle): void`
- `GetSoftSpanUpperBoundForVehicle(vehicle): BoundCost`
- `HasQuadraticCostSoftSpanUpperBounds(): boolean`
- `SetQuadraticCostSoftSpanUpperBoundForVehicle(boundCost, vehicle): void`
- `GetQuadraticCostSoftSpanUpperBoundForVehicle(vehicle): BoundCost`

`CumulVar(index)` returns an opaque cumul-variable handle for assignment reads
and solver constraints.

### `BoundCost`

```ts
new BoundCost(bound = 0, cost = 0)
```

Fields:

- `bound: number`
- `cost: number`

### `Assignment`

- `ObjectiveValue(): number`
- `Value(indexOrVar): number`
- `Min(indexOrVar): number`

For `NextVar(index)`, pass the returned value into `assignment.Value()` to get
the next index. For dimensions, pass `dimension.CumulVar(index)`.

### Routing Parameters And Enums

- `DefaultRoutingSearchParameters(): RoutingSearchParameters`
- `DefaultRoutingModelParameters(): RoutingModelParameters`
- `FindErrorInRoutingSearchParameters(params): string`
- `BOOL_FALSE`, `BOOL_TRUE`, `BOOL_UNSPECIFIED`

`RoutingSearchParameters` currently exposes the subset used by the bridge:

- `firstSolutionStrategy?: FirstSolutionStrategy`
- `solution_limit?: number`
- `local_search_operators?: Record<string, unknown>`
- `local_search_metaheuristic?: LocalSearchMetaheuristic`

`RoutingModelParameters` exposes:

- `solver_parameters.CopyFrom(value): void`
- `solver_parameters.trace_propagation: boolean`
- `solver_parameters.profile_local_search: boolean`

`FindErrorInRoutingSearchParameters(params)` returns an empty string when the
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
import { initMPSolver, MPSolver, MPSolverParameters } from 'or-tools-wasm';
```

Initialize before constructing solvers:

```ts
await initMPSolver();

const solver = MPSolver.CreateSolver('GLOP'); // or 'CLP' / 'GLPK_LP' for LP backends
if (!solver) throw new Error('LP backend unavailable');

const x = solver.NumVar(0, solver.infinity(), 'x');
const y = solver.NumVar(0, solver.infinity(), 'y');
const c = solver.Constraint(-solver.infinity(), 14, 'c');
c.SetCoefficient(x, 1);
c.SetCoefficient(y, 2);
solver.Objective().SetCoefficient(x, 3);
solver.Objective().SetCoefficient(y, 1);
solver.Objective().SetMaximization();

const status = await solver.Solve();
```

### Initialization

`initMPSolver(): Promise<void>`

Loads the MPSolver WebAssembly runtime.

### Solver Types And Status

`OptimizationProblemType` contains OR-Tools MPSolver problem type ids, including
`GLOP_LINEAR_PROGRAMMING`, `CLP_LINEAR_PROGRAMMING`, `PDLP_LINEAR_PROGRAMMING`,
`SAT_INTEGER_PROGRAMMING`, `GLPK_LINEAR_PROGRAMMING`,
`SCIP_MIXED_INTEGER_PROGRAMMING`, `GLPK_MIXED_INTEGER_PROGRAMMING`,
`CBC_MIXED_INTEGER_PROGRAMMING`, `KNAPSACK_MIXED_INTEGER_PROGRAMMING`, and
others. Only problem types compiled into the WebAssembly runtime will be supported at runtime; use
`MPSolver.SupportsProblemType()`.

The default package runtime currently includes `GLOP`, `CLP`, and `GLPK_LP` for
continuous linear programming, plus `SAT`, `GLPK`, `SCIP`, `CBC`, and
`KNAPSACK` for integer linear programming through MPSolver.

`MPSolverResultStatus` contains `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`,
`UNBOUNDED`, `ABNORMAL`, `MODEL_INVALID`, and `NOT_SOLVED`.

Basis status values are returned by `basis_status()` and are also exposed as
static constants on `MPSolver`: `FREE`, `AT_LOWER_BOUND`, `AT_UPPER_BOUND`,
`FIXED_VALUE`, and `BASIC`.

### `MPSolver`

Static helpers:

- `CreateSolver(solverId): MPSolver | null`
- `Infinity(): number`
- `SupportsProblemType(problemType): boolean`
- `ParseSolverType(solverId): OptimizationProblemType | null`
- `ParseAndCheckSupportForProblemType(solverId): OptimizationProblemType | null`
- `getLinearSolverSchemas(): Promise<LinearSolverSchemas>`
- `createModelRequest(request): Promise<Uint8Array>`
- `createSolutionResponse(response): Promise<Uint8Array>`
- `decodeSolutionResponse(bytes): Promise<MPSolverSolutionResponse>`
- `solveModelRequest(request): Promise<MPSolverProtoSolveResult>`

Construction:

```ts
new MPSolver(name, problemType)
```

Core model methods:

- `Name(): string`
- `ProblemType(): OptimizationProblemType`
- `IsMIP()` / `IsMip(): boolean`
- `Clear(): void`
- `infinity(): number`
- `NumVariables(): number`
- `NumConstraints(): number`
- `variable(index): MPVariable`
- `variables(): MPVariable[]`
- `constraint(index): MPConstraint`
- `constraints(): MPConstraint[]`
- `LookupVariableOrNull(name): MPVariable | null`
- `LookupVariable(name): MPVariable | null`
- `LookupConstraintOrNull(name): MPConstraint | null`
- `LookupConstraint(name): MPConstraint | null`
- `Objective(): MPObjective`

Variables:

- `Var(lb, ub, integer, name): MPVariable`
- `NumVar(lb, ub, name): MPVariable`
- `IntVar(lb, ub, name): MPVariable`
- `BoolVar(name): MPVariable`

Constraints:

- `Constraint(): MPConstraint`
- `Constraint(name): MPConstraint`
- `Constraint(lb, ub, name?): MPConstraint`
- `RowConstraint(...)`: same overloads as `Constraint`

Solving and solution loading:

- `Solve(parameters?): Promise<MPSolverResultStatus>`
- `SolveWithProto(options?): Promise<MPSolverProtoSolveResult & { loaded: boolean }>`
- `LoadSolutionFromProto(response?, tolerance?): Promise<boolean>`
- `exportModelProto(): Promise<Uint8Array>`
- `exportModelRequestProto(options?): Promise<Uint8Array>`
- `VerifySolution(tolerance, logErrors): boolean`
- `Reset(): void`
- `InterruptSolve(): boolean`
- `NextSolution(): boolean`

Options and output:

- `EnableOutput(): void`
- `SuppressOutput(): void`
- `OutputIsEnabled(): boolean`
- `SetTimeLimit(milliseconds): void`
- `set_time_limit(milliseconds): void`
- `time_limit(): number`
- `SetNumThreads(numThreads): boolean`
- `GetNumThreads(): number`
- `SetSolverSpecificParametersAsString(parameters): boolean`
- `GetSolverSpecificParametersAsString(): string`
- `SolverVersion(): string`
- `ComputeConstraintActivities(): number[]`
- `ComputeExactConditionNumber(): number`
- `SetHint(variables, values): void`
- `ExportModelAsLpFormat(obfuscate): string`
- `ExportModelAsMpsFormat(fixedFormat, obfuscate): string`
- `WallTime()` / `wall_time(): number`
- `Iterations()` / `iterations(): number`
- `nodes(): number`
- `delete(): void`

### `MPVariable`

- `SolutionValue()` / `solution_value(): number`
- `unrounded_solution_value(): number`
- `ReducedCost()` / `reduced_cost(): number`
- `basis_status(): number`
- `index(): number`
- `name(): string`
- `Lb(): number`
- `Ub(): number`
- `SetBounds(lb, ub): void`
- `SetLb()` / `SetLB(lb): void`
- `SetUb()` / `SetUB(ub): void`
- `Integer(): boolean`
- `SetInteger(integer): void`
- `branching_priority(): number`
- `SetBranchingPriority(priority): void`

### `MPConstraint`

- `SetCoefficient(variable, coefficient): void`
- `GetCoefficient(variable): number`
- `Clear(): void`
- `index(): number`
- `name(): string`
- `Lb(): number`
- `Ub(): number`
- `SetBounds(lb, ub): void`
- `SetLb()` / `SetLB(lb): void`
- `SetUb()` / `SetUB(ub): void`
- `DualValue()` / `dual_value(): number`
- `basis_status(): number`
- `is_lazy(): boolean`
- `set_is_lazy(laziness): void`

### `MPObjective`

- `Clear(): void`
- `SetCoefficient(variable, coefficient): void`
- `GetCoefficient(variable): number`
- `SetOffset(offset): void`
- `AddOffset(offset): void`
- `Offset()` / `offset(): number`
- `SetOptimizationDirection(maximize): void`
- `SetMinimization(): void`
- `SetMaximization(): void`
- `Value(): number`
- `BestBound(): number`
- `maximization(): boolean`
- `minimization(): boolean`

### `MPSolverParameters`

Use `new MPSolverParameters()` and pass it to `solver.Solve(parameters)`.

- `SetDoubleParam(param, value): void`
- `GetDoubleParam(param): number`
- `ResetDoubleParam(param): void`
- `SetIntegerParam(param, value): void`
- `GetIntegerParam(param): number`
- `ResetIntegerParam(param): void`
- `Reset(): void`
- `delete(): void`

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
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm';

setWorkerBridgeEnabled(true);
await initKnapsack();

const solver = new KnapsackSolver(
  KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
  'knapsack',
);
solver.init(
  [360, 83, 59, 130],
  [[7, 0, 30, 22]],
  [50],
);

const profit = await solver.solve();
const selected = [0, 1, 2, 3].filter((item) => solver.best_solution_contains(item));
console.log(profit, selected, solver.is_solution_optimal());
```

`initKnapsack(): Promise<void>` loads the shared MPSolver/Knapsack runtime.

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

`KnapsackSolver` supports `init()` / `Init()`, `solve()` / `Solve()`,
`best_solution_contains()` / `BestSolutionContains()`,
`is_solution_optimal()` / `IsSolutionOptimal()`, `set_use_reduction()` /
`SetUseReduction()`, and `set_time_limit()` / `SetTimeLimit()`.

The MPSolver frontend also exposes
`KNAPSACK_MIXED_INTEGER_PROGRAMMING`, `MPSolver.CreateSolver('KNAPSACK')`, and
the proto solve path for knapsack-shaped 0-1 models.

## Network Flow

The dedicated Network Flow API mirrors the Python graph wrappers for
`SimpleMaxFlow`, `SimpleMinCostFlow`, and `SimpleLinearSumAssignment`.

```ts
import { initNetworkFlow, SimpleMaxFlow, setWorkerBridgeEnabled } from 'or-tools-wasm';

setWorkerBridgeEnabled(true);
await initNetworkFlow();

const maxFlow = new SimpleMaxFlow();
const arcs = maxFlow.add_arcs_with_capacity(
  [0, 0, 0, 1, 1, 2, 2, 3, 3],
  [1, 2, 3, 2, 4, 3, 4, 2, 4],
  [20, 30, 10, 40, 30, 10, 20, 5, 20],
);
const status = await maxFlow.solve(0, 4);
if (status === SimpleMaxFlow.OPTIMAL) {
  console.log(maxFlow.optimal_flow(), maxFlow.flows(arcs));
}
```

`initNetworkFlow(): Promise<void>` loads the graph WebAssembly runtime.

`SimpleMaxFlow` exposes Python-style snake_case methods and camelCase aliases:

- status constants: `OPTIMAL`, `POSSIBLE_OVERFLOW`, `BAD_INPUT`, `BAD_RESULT`
- `add_arc_with_capacity(tail, head, capacity): number`
- `add_arcs_with_capacity(tails, heads, capacities): number[]`
- `set_arc_capacity(arc, capacity): void`
- `set_arcs_capacity(arcs, capacities): void`
- `num_nodes()` / `numNodes(): number`
- `num_arcs()` / `numArcs(): number`
- `tail(arc)`, `head(arc)`, `capacity(arc): number`
- `solve(source, sink): Promise<number>`
- `optimal_flow()` / `optimalFlow(): number`
- `flow(arc): number`
- `flows(arcs): number[]`
- `get_source_side_min_cut()` / `getSourceSideMinCut(): number[]`
- `get_sink_side_min_cut()` / `getSinkSideMinCut(): number[]`

`SimpleMinCostFlow` exposes:

- status constants: `NOT_SOLVED`, `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`,
  `UNBALANCED`, `BAD_RESULT`, `BAD_COST_RANGE`, `BAD_CAPACITY_RANGE`
- `add_arc_with_capacity_and_unit_cost(tail, head, capacity, unitCost): number`
- `add_arcs_with_capacity_and_unit_cost(tails, heads, capacities, unitCosts): number[]`
- `set_arc_capacity(arc, capacity): void`
- `set_arc_capacities(arcs, capacities): void`
- `set_node_supply(node, supply): void`
- `set_nodes_supplies(nodes, supplies): void`
- `num_nodes()`, `num_arcs()`, `tail(arc)`, `head(arc)`, `capacity(arc)`
- `supply(node)`, `unit_cost(arc)` / `unitCost(arc)`
- `solve(): Promise<number>`
- `solve_max_flow_with_min_cost()` / `solveMaxFlowWithMinCost(): Promise<number>`
- `optimal_cost()` / `optimalCost(): number`
- `maximum_flow()` / `maximumFlow(): number`
- `flow(arc): number`
- `flows(arcs): number[]`

`SimpleLinearSumAssignment` exposes:

- status constants: `OPTIMAL`, `INFEASIBLE`, `POSSIBLE_OVERFLOW`
- `add_arc_with_cost(leftNode, rightNode, cost): number`
- `add_arcs_with_cost(leftNodes, rightNodes, costs): number[]`
- `num_nodes()` / `numNodes(): number`
- `num_arcs()` / `numArcs(): number`
- `left_node(arc)` / `leftNode(arc): number`
- `right_node(arc)` / `rightNode(arc): number`
- `cost(arc): number`
- `solve(): Promise<number>`
- `optimal_cost()` / `optimalCost(): number`
- `right_mate(leftNode)` / `rightMate(leftNode): number`
- `assignment_cost(leftNode)` / `assignmentCost(leftNode): number`

Network Flow algorithms are single-threaded in this package. They support the
shared browser worker bridge, so UI code can run graph solves off the main
thread, but there is no solver thread-count parameter.

## MathOpt

Import:

```ts
import { GlpkParameters, initMathOpt, MathOpt, MathOptModel, MathOptObjective } from 'or-tools-wasm';
```

Initialize, build a model, and solve:

```ts
await initMathOpt();

const model = MathOpt.Model('basic');
const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
const y = model.addVariable({ lowerBound: 0, upperBound: 2, name: 'y' });
model.addLinearConstraint({
  upperBound: 1.5,
  terms: [MathOpt.linearTerm(x), MathOpt.linearTerm(y)],
});
model.maximize([MathOpt.linearTerm(x, 2), MathOpt.linearTerm(y)]);

const result = await MathOpt.solve(model, { solverType: MathOpt.SolverType.GLOP });
```

### Initialization

`initMathOpt(): Promise<void>`

Loads the MathOpt WebAssembly runtime.

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
- `MathOpt.GlpkParameters`
- `MathOpt.setWorkerBridgeEnabled(enabled): void`
- `MPSolver.setWorkerBridgeEnabled(enabled): void`
- `MPSolver.isWorkerBridgeEnabled(): boolean`
- `Pdlp.setWorkerBridgeEnabled(enabled): void`
- `Pdlp.isWorkerBridgeEnabled(): boolean`
- `NetworkFlow.setWorkerBridgeEnabled(enabled): void`
- `NetworkFlow.isWorkerBridgeEnabled(): boolean`
- `RoutingModel.setWorkerBridgeEnabled(enabled): void`
- `RoutingModel.isWorkerBridgeEnabled(): boolean`

Top-level value exports:

- `setWorkerBridgeEnabled`
- `isWorkerBridgeEnabled`
- `isWorkerBridgeAvailable`
- `terminateWorkerBridge`
- `MathOptModel`
- `MathOptObjective`
- `GlpkParameters`
- `initNetworkFlow`
- `NetworkFlow`
- `SimpleMaxFlow`
- `SimpleMaxFlowStatus`
- `SimpleMinCostFlow`
- `SimpleMinCostFlowStatus`
- `SimpleLinearSumAssignment`
- `SimpleLinearSumAssignmentStatus`

Top-level type exports:

- `MathOptDualSolutionResult`
- `MathOptLinearConstraint`
- `MathOptLinearConstraintMatrixEntry`
- `MathOptLinearTerm`
- `MathOptPrimalSolutionResult`
- `MathOptSolutionResult`
- `MathOptSolveOptions`
- `MathOptSolveResult`
- `MathOptVariable`
- `MathOptVariableOptions`

Solving:

- `MathOpt.solve(model, options?): Promise<MathOptSolveResult>`

`MathOptSolveOptions`:

- `solverType?: MathOptSolverType | keyof typeof MathOptSolverType`
- `threads?: number`
- `iterationLimit?: number`
- `glpk?: GlpkParameters`

`GlpkParameters` mirrors the upstream MathOpt GLPK-specific solve parameters:

- `computeUnboundRaysIfPossible?: boolean`
- `compute_unbound_rays_if_possible?: boolean`

GLPK is single-threaded in this package. MathOpt GLPK solves reject
`threads > 1`; omit `threads` or pass `threads: 1`.

`MathOptSolveResult`:

- `terminationReason: string`
- `primalBound: number | null`
- `dualBound: number | null`
- `objectiveValue: number | null`
- `variableValues: Record<string, number>`
- `variableValuesById: Record<number, number>`
- `solutions: MathOptSolutionResult[]`
- `rawResponse: Uint8Array`

`MathOptSolutionResult`:

- `primalSolution: MathOptPrimalSolutionResult | null`
- `dualSolution: MathOptDualSolutionResult | null`

`MathOptPrimalSolutionResult`:

- `objectiveValue: number | null`
- `variableValues: Record<string, number>`
- `variableValuesById: Record<number, number>`

`MathOptDualSolutionResult`:

- `objectiveValue: number | null`
- `dualValues: Record<string, number>`
- `dualValuesById: Record<number, number>`
- `reducedCosts: Record<string, number>`
- `reducedCostsById: Record<number, number>`

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
- `add_variable(options?): MathOptVariable`
- `addIntegerVariable(options?): MathOptVariable`
- `add_integer_variable(options?): MathOptVariable`
- `addBinaryVariable(options?): MathOptVariable`
- `add_binary_variable(options?): MathOptVariable`
- `deleteVariable(variable): void`
- `delete_variable(variable): void`
- `variablesList(): MathOptVariable[]`
- `variables(): MathOptVariable[]`
- `getNumVariables()` / `get_num_variables(): number`
- `getNextVariableId()` / `get_next_variable_id(): number`
- `ensureNextVariableIdAtLeast(id): void`
- `ensure_next_variable_id_at_least(id): void`
- `hasVariable(id)` / `has_variable(id): boolean`
- `getVariable(id, validate?): MathOptVariable | undefined`
- `get_variable(id, { validate }?): MathOptVariable`

Linear constraints:

- `addLinearConstraint(options?): MathOptLinearConstraint`
- `add_linear_constraint(options?): MathOptLinearConstraint`
- `deleteLinearConstraint(constraint): void`
- `delete_linear_constraint(constraint): void`
- `linearConstraints()` / `linear_constraints(): MathOptLinearConstraint[]`
- `getNumLinearConstraints()` / `get_num_linear_constraints(): number`
- `getNextLinearConstraintId()` / `get_next_linear_constraint_id(): number`
- `ensureNextLinearConstraintIdAtLeast(id): void`
- `ensure_next_linear_constraint_id_at_least(id): void`
- `hasLinearConstraint(id)` / `has_linear_constraint(id): boolean`
- `getLinearConstraint(id, validate?): MathOptLinearConstraint | undefined`
- `get_linear_constraint(id, { validate }?): MathOptLinearConstraint`
- `columnNonzeros(variable)` / `column_nonzeros(variable): MathOptLinearConstraint[]`
- `rowNonzeros(constraint)` / `row_nonzeros(constraint): MathOptVariable[]`
- `linearConstraintMatrixEntries()` / `linear_constraint_matrix_entries(): MathOptLinearConstraintMatrixEntry[]`

`MathOptLinearConstraintMatrixEntry` contains:

- `linearConstraint` / `linear_constraint: MathOptLinearConstraint`
- `variable: MathOptVariable`
- `coefficient: number`

Objective and encoding:

- `objective: MathOptObjective`
- `maximize(terms, offset?): void`
- `minimize(terms, offset?): void`
- `maximizeLinearObjective(terms, offset?): void`
- `maximize_linear_objective(terms, offset?): void`
- `minimizeLinearObjective(terms, offset?): void`
- `minimize_linear_objective(terms, offset?): void`
- `setObjective(terms, isMaximize, offset?): void`
- `set_objective(terms, is_maximize, offset?): void`
- `setLinearObjective(terms, isMaximize, offset?): void`
- `set_linear_objective(terms, is_maximize, offset?): void`
- `setQuadraticObjective(terms, isMaximize, offset?): void`
- `set_quadratic_objective(terms, is_maximize, offset?): void`
- `variableName(id): string`
- `linearConstraintName(id): string`
- `encodeModelProto(): Uint8Array`

`MathOptVariableOptions`:

- `lb?: number`
- `ub?: number`
- `isInteger?: boolean`
- `is_integer?: boolean`
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

### `MathOptVariable`

Properties:

- `id: number`
- `name: string`
- `lowerBound` / `lower_bound`
- `upperBound` / `upper_bound`
- `integer` / `is_integer`

Methods:

- `equals(other): boolean`
- `toString(): string`
- `assertLive(): void`

### `MathOptLinearConstraint`

Properties:

- `id: number`
- `name: string`
- `lowerBound` / `lower_bound`
- `upperBound` / `upper_bound`

Methods:

- `setCoefficient(variable, coefficient): void`
- `set_coefficient(variable, coefficient): void`
- `getCoefficient(variable): number`
- `get_coefficient(variable): number`
- `terms(): MathOptLinearTerm[]`
- `asBoundedLinearExpression(): MathOptBoundedExpression<MathOptLinearExpression>`
- `as_bounded_linear_expression(): MathOptBoundedExpression<MathOptLinearExpression>`
- `equals(other): boolean`
- `toString(): string`
- `assertLive(): void`

### `MathOptObjective`

Properties:

- `isMaximize` / `is_maximize`
- `offset`
- `name`

`isMaximize` / `is_maximize` and `offset` are writable. `name` is read-only and
is currently the empty string for the primary objective.

Methods:

- `clear(): void`
- `setLinearCoefficient(variable, coefficient): void`
- `set_linear_coefficient(variable, coefficient): void`
- `getLinearCoefficient(variable): number`
- `get_linear_coefficient(variable): number`
- `linearTerms()` / `linear_terms(): MathOptLinearTerm[]`
- `setQuadraticCoefficient(firstVariable, secondVariable, coefficient): void`
- `set_quadratic_coefficient(firstVariable, secondVariable, coefficient): void`
- `getQuadraticCoefficient(firstVariable, secondVariable): number`
- `get_quadratic_coefficient(firstVariable, secondVariable): number`
- `quadraticTerms()` / `quadratic_terms(): MathOptQuadraticTerm[]`

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
- Properties: `firstVariable` / `first_variable`, `secondVariable` /
  `second_variable`.
- Method: `assertNotBoolean(): never`.

Bounded expression classes represent constraints produced by `eq`, `le`, and
`ge`:

- `MathOptBoundedExpression`
- `MathOptLowerBoundedExpression`
- `MathOptUpperBoundedExpression`

They expose `lowerBound`/`lower_bound`, `upperBound`/`upper_bound`, and
`toString()`. `MathOptBoundedExpression` also exposes `expression` and
`assertNotBoolean()`. `MathOptLowerBoundedExpression` exposes `expression`,
`toBoundedExpression(upperBound)`, and `assertNotBoolean()`.
`MathOptUpperBoundedExpression` exposes `expression`,
`toBoundedExpression(lowerBound)`, and `assertNotBoolean()`.

## PDLP

Import:

```ts
import { initPdlp, Pdlp, QuadraticProgram } from 'or-tools-wasm';
```

PDLP exposes the primal-dual hybrid gradient solver for LP and convex diagonal
quadratic programs.

```ts
const qp = new QuadraticProgram({
  objectiveVector: [1, 2],
  variableLowerBounds: [0, 0],
  variableUpperBounds: [10, 10],
});

const result = await Pdlp.primalDualHybridGradient(qp, {
  terminationCriteria: { iterationLimit: 1000 },
});
```

### Initialization

`initPdlp(): Promise<void>`

Loads the PDLP WebAssembly runtime. The `Pdlp` async helpers will initialize the
runtime automatically if needed, but `initPdlp()` is available for explicit
warmup.

### `QuadraticProgram`

Constructor:

```ts
new QuadraticProgram(input?: QuadraticProgramInput)
```

Fields are available in both camelCase and snake_case:

- `problemName` / `problem_name`
- `objectiveOffset` / `objective_offset`
- `objectiveScalingFactor` / `objective_scaling_factor`
- `objectiveVector` / `objective_vector`
- `objectiveMatrixDiagonal` / `objective_matrix_diagonal`
- `constraintMatrix` / `constraint_matrix`
- `constraintLowerBounds` / `constraint_lower_bounds`
- `constraintUpperBounds` / `constraint_upper_bounds`
- `variableLowerBounds` / `variable_lower_bounds`
- `variableUpperBounds` / `variable_upper_bounds`
- `variableNames` / `variable_names`
- `constraintNames` / `constraint_names`

Methods:

- `resizeAndInitialize(numVariables, numConstraints): void`
- `resize_and_initialize(numVariables, numConstraints): void`
- `setObjectiveMatrixDiagonal(values): void`
- `set_objective_matrix_diagonal(values): void`
- `clearObjectiveMatrix(): void`
- `clear_objective_matrix(): void`
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

Fields are also exposed as `primal_solution` and `dual_solution`.

### `Pdlp`

- `Pdlp.QuadraticProgram`
- `Pdlp.PrimalAndDualSolution`
- `validateQuadraticProgramDimensions(qp): Promise<void>`
- `validate_quadratic_program_dimensions(qp): Promise<void>`
- `isLinearProgram(qp): Promise<boolean>`
- `is_linear_program(qp): Promise<boolean>`
- `qpFromMpModelProto(proto, options?): Promise<QuadraticProgram>`
- `qp_from_mpmodel_proto(proto, relaxIntegerVariables?, includeNames?): Promise<QuadraticProgram>`
- `qpToMpModelProto(qp): Promise<Uint8Array>`
- `qp_to_mpmodel_proto(qp): Promise<Uint8Array>`
- `primalDualHybridGradient(qp, params?, initialSolution?): Promise<PdlpSolverResult>`
- `primal_dual_hybrid_gradient(qp, params?, initialSolution?): Promise<PdlpSolverResult>`

`PdlpSolveParams` supports camelCase and snake_case forms:

- `terminationCriteria.iterationLimit`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalRelative`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalAbsolute`
- `terminationCheckFrequency`
- `lInfRuizIterations`
- `l2NormRescaling`

`PdlpSolverResult` contains:

- `primalSolution` / `primal_solution`
- `dualSolution` / `dual_solution`
- `reducedCosts` / `reduced_costs`
- `solveLog` / `solve_log`

`solveLog` contains `terminationReason` / `termination_reason` and
`iterationCount` / `iteration_count`.

## Browser Worker Bridge

The CP-SAT, MathOpt, Routing, MPSolver proto-solve, Knapsack, Network Flow, and
PDLP paths can use the browser worker bridge. Worker bridge availability is independent of
solver threading support; for example GLPK and Knapsack are single-threaded but
can still run through the worker bridge in browser UI code, Network Flow is
single-threaded but worker-bridge capable, while CP-SAT, SAT, SCIP/GSCIP, CBC,
and other threaded-capable paths can also accept solver thread settings. Prefer
the shared package controls:

```ts
import { isWorkerBridgeEnabled, setWorkerBridgeEnabled } from 'or-tools-wasm';

setWorkerBridgeEnabled(true);
isWorkerBridgeEnabled();
```

Solver-specific aliases are also exposed for existing call sites:

```ts
CpSat.setWorkerBridgeEnabled(true);
MathOpt.setWorkerBridgeEnabled(true);
MPSolver.setWorkerBridgeEnabled(true);
Pdlp.setWorkerBridgeEnabled(true);
RoutingModel.setWorkerBridgeEnabled(true);
```

The worker bridge is intended for browser UI responsiveness. In non-browser
runtimes, direct runtime paths are used.

## Generated Protobuf Types

The package exports generated CP-SAT model and response types from
`generated/cp_model`, plus `SatParameters` from `generated/sat_parameters`.
These are large generated definitions matching OR-Tools protobuf schemas. Use
them to type JSON-like model and parameter objects passed to `CpSat.createModel`
and `CpSat.solve`.

For raw protobuf workflows, use the schema helpers:

- `CpSat.getSchemas()`
- `MPSolver.getLinearSolverSchemas()`

## Memory Management

Objects backed by native WebAssembly handles expose `delete()` when explicit
cleanup is supported:

- `RoutingIndexManager.delete()`
- `RoutingModel.delete()`
- `MPSolver.delete()`
- `MPSolverParameters.delete()`

For long-running applications that create many native objects, call `delete()`
when a model is no longer needed.
