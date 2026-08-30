# TypeScript API

This page documents the public solver subpath exports from `or-tools-wasm`.
The package is ESM only:

```ts
import { CpSat } from 'or-tools-wasm/cp-sat';
import { initRouting, RoutingIndexManager, RoutingModel } from 'or-tools-wasm/routing';
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
} from 'or-tools-wasm/routing';
```

Initialize the routing runtime before constructing routing objects when using
the direct runtime path. In browser worker-bridge mode this is a no-op, but
awaiting it keeps the same code portable across runtimes:

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

Loads the routing WebAssembly runtime for direct solves. Construction of
`RoutingIndexManager` or `RoutingModel` before this resolves will throw on
direct runtime paths.

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
import { initMPSolver, MPSolver, MPSolverParameters } from 'or-tools-wasm/mp-solver';
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

Loads the MPSolver WebAssembly runtime for direct solves. When the browser
worker bridge is enabled, model objects use bridge-backed handles and
`initMPSolver()` is a no-op.

### Solver Types And Status

`OptimizationProblemType` contains OR-Tools MPSolver problem type ids, including
`GLOP_LINEAR_PROGRAMMING`, `CLP_LINEAR_PROGRAMMING`, `PDLP_LINEAR_PROGRAMMING`,
`SAT_INTEGER_PROGRAMMING`, `GLPK_LINEAR_PROGRAMMING`,
`SCIP_MIXED_INTEGER_PROGRAMMING`, `GLPK_MIXED_INTEGER_PROGRAMMING`,
`CBC_MIXED_INTEGER_PROGRAMMING`, `BOP_INTEGER_PROGRAMMING`,
`KNAPSACK_MIXED_INTEGER_PROGRAMMING`, and
others. Only problem types compiled into the WebAssembly runtime will be supported at runtime; use
`MPSolver.SupportsProblemType()`.

The default package runtime currently includes `GLOP`, `CLP`, and `GLPK_LP` for
continuous linear programming, plus `SAT`, `GLPK`, `SCIP`, `CBC`, `BOP`, and
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
- `SetLb(lb)` / `SetLB(lb): void`
- `SetUb(ub)` / `SetUB(ub): void`
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
- `SetLb(lb)` / `SetLB(lb): void`
- `SetUb(ub)` / `SetUB(ub): void`
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
} from 'or-tools-wasm/knapsack';

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

`initKnapsack(): Promise<void>` loads the shared MPSolver/Knapsack runtime for
direct solves. When the browser worker bridge is enabled, it is a no-op and the
solve path runs through the worker bridge.

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

## Set Cover

The dedicated Set Cover API mirrors
`ortools.set_cover.python.set_cover` for weighted set covering models,
solution invariants, and heuristic searches. It uses its own Set Cover
WebAssembly runtime.

```ts
import {
  GreedySolutionGenerator,
  initSetCover,
  SetCoverInvariant,
  SetCoverModel,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm/set-cover';

setWorkerBridgeEnabled(true);
await initSetCover();

const model = new SetCoverModel();
model.add_empty_subset(2.0);
model.add_element_to_last_subset(0);
model.add_empty_subset(2.0);
model.add_element_to_last_subset(1);
model.add_empty_subset(1.0);
model.add_element_to_last_subset(0);
model.add_element_to_last_subset(1);

const inv = new SetCoverInvariant(model);
const greedy = new GreedySolutionGenerator(inv);
if (await greedy.next_solution()) {
  console.log(inv.cost(), inv.export_solution_as_proto().subset);
}
```

`initSetCover(): Promise<void>` loads the Set Cover runtime for direct solves.
When the browser worker bridge is enabled, it is a no-op and heuristic search
calls run through the worker bridge.

`SetCoverModel` exposes Python-style methods and properties:

- properties: `name`, `num_elements`, `num_subsets`, `num_nonzeros`,
  `fill_rate`, `subset_costs`, `columns`, `rows`, `row_view_is_valid`,
  `all_subsets`
- `SubsetRange(): number[]`
- `ElementRange(): number[]`
- `set_name(name): void`
- `add_empty_subset(cost): void`
- `add_element_to_last_subset(element): void`
- `add_element_to_subset(element, subset): void`
- `set_subset_cost(subset, cost): void`
- `create_sparse_row_view(): void`
- `sort_elements_in_subsets(): void`
- `compute_feasibility(): boolean`
- `resize_num_subsets(numSubsets): void`
- `reserve_num_elements_in_subset(numElements, subset): void`
- `export_model_as_proto(): SetCoverModelProto`
- `import_model_from_proto(proto): void`
- `compute_cost_stats()`, `compute_row_stats()`, `compute_column_stats()`
- `compute_row_deciles()`, `compute_column_deciles()`

`SetCoverInvariant` exposes:

- `initialize()`, `clear()`, `model()`
- `cost(): number`
- `num_uncovered_elements(): number`
- `is_selected(): boolean[]`
- `coverage(): number[]`
- `num_free_elements(): number[]`
- `num_coverage_le_1_elements(): number[]`
- `compute_coverage_in_focus(focus): number[]`
- `is_redundant(): boolean[]`
- `trace(): SetCoverDecision[]`, `clear_trace()`, `compress_trace()`
- `clear_removability_information()`, `newly_removable_subsets()`,
  `newly_non_removable_subsets()`
- `load_solution(solution): void`
- `check_consistency(consistency): boolean`
- `compute_is_redundant(subset): boolean`
- `recompute(): void`
- `select(subset, consistency): boolean`
- `deselect(subset, consistency): boolean`
- `export_solution_as_proto(): SetCoverSolutionResponse`
- `import_solution_from_proto(proto): void`

`consistency_level` / `ConsistencyLevel` exposes
`COST_AND_COVERAGE`, `FREE_AND_UNCOVERED`, and `REDUNDANCY`.

Solution generators and searches expose `next_solution()` and
`set_max_iterations()`:

- `TrivialSolutionGenerator`
- `RandomSolutionGenerator`
- `GreedySolutionGenerator`
- `ElementDegreeSolutionGenerator`
- `LazyElementDegreeSolutionGenerator`
- `SteepestSearch`
- `GuidedLocalSearch`
- `GuidedTabuSearch`

`GuidedTabuSearch` also exposes `set_lagrangian_factor()`,
`get_lagrangian_factor()`, `set_epsilon()`, `get_epsilon()`,
`set_penalty_factor()`, `get_penalty_factor()`, `set_tabu_list_size()`, and
`get_tabu_list_size()`. `TabuList`, `clear_random_subsets()`, and
`clear_most_covered_elements()` are available for compatibility with the
Python wrapper surface.

Model and solution proto helpers are object-based in the browser-oriented
runtime: use `export_model_as_proto()` / `import_model_from_proto()` and
`export_solution_as_proto()` / `import_solution_from_proto()`. File-based
helpers such as `read_set_cover_proto()`, `write_set_cover_proto()`,
`read_orlib_scp()`, `read_orlib_rail()`, and `read_fimi_dat()` are exported for
API discoverability but throw because package consumers do not share a native
OR-Tools filesystem.

Set Cover is single-threaded in this package. It supports the shared browser
worker bridge, so UI code can run heuristic searches off the main thread, but
there is no solver thread-count parameter.

## RCPSP

The dedicated RCPSP API provides a Python-like parser surface for
`ortools.scheduling.python.rcpsp` and a higher-level TypeScript project
scheduling builder that compiles to CP-SAT scheduling constraints.

```ts
import {
  initRcpsp,
  RcpspModelBuilder,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm/rcpsp';

setWorkerBridgeEnabled(true);
await initRcpsp();

const project = new RcpspModelBuilder('house_project')
  .add_resource({ name: 'crew', capacity: 3 })
  .add_activity({ name: 'site', duration: 3, demands: { crew: 2 }, successors: ['frame'] })
  .add_activity({ name: 'permit', duration: 2, demands: { crew: 1 }, successors: ['wire'] })
  .add_activity({ name: 'frame', duration: 4, demands: { crew: 2 }, successors: ['inspect'] })
  .add_activity({ name: 'wire', duration: 2, demands: { crew: 1 }, successors: ['inspect'] })
  .add_activity({ name: 'inspect', duration: 1, demands: { crew: 1 } })
  .build();

const result = await project.solve({ numWorkers: 4, maxTimeInSeconds: 5 });
console.log(result.statusName, result.makespan, result.tasks);
```

`initRcpsp(): Promise<void>` is a compatibility no-op. RCPSP currently reuses
the CP-SAT solve path instead of loading a separate native runtime; calling
`solve()` loads or uses the CP-SAT runtime as needed.

`RcpspModelBuilder` exposes:

- `add_resource({ name, capacity, renewable? })`
- `add_activity({ name, duration, demands?, successors? })`
- `build(): RcpspProblem`

`RcpspProblem` exposes:

- `RcpspProblem.from_proto(proto)` / `fromProto(proto)`
- `RcpspProblem.from_psplib(text)` / `fromPsplib(text)`
- properties: `name`, `resources`, `tasks`, `horizon`
- `export_model_as_proto()` / `exportModelAsProto()`
- `to_cp_sat_model()` / `toCpSatModel()`
- `solve(params?: SatParameters): Promise<RcpspSolveResult>`

`RcpspSolveResult` contains:

- `status` and `statusName`
- `makespan`
- `objectiveValue`
- scheduled `tasks` with `name`, `start`, `end`, `duration`, `demands`, and
  `successors`
- the generated `CpModel`, `starts`, `ends`, and `makespanVar` for callers that
  need the lower-level CP-SAT model path

`RcpspParser` mirrors the upstream Python wrapper shape with `problem()` and
`parse_string()`. `parse_file()` is exported for API discoverability but throws
in this browser-oriented package because consumers do not share a native
OR-Tools filesystem; pass file contents to `parse_string()` instead.

The CP-SAT-backed builder supports the standard renewable-resource RCPSP case:
activities, durations, precedence constraints, renewable resource capacities,
and makespan minimization. RCPSP/Max delays, resource-investment objectives, and
consumer/producer instances are parsed as proto data but rejected by
`to_cp_sat_model()` / `solve()` until those variants have a dedicated model
translation.

## Network Flow

The dedicated Network Flow API mirrors the Python graph wrappers for
`SimpleMaxFlow`, `SimpleMinCostFlow`, and `SimpleLinearSumAssignment`.

```ts
import { initNetworkFlow, SimpleMaxFlow, setWorkerBridgeEnabled } from 'or-tools-wasm/network-flow';

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

`initNetworkFlow(): Promise<void>` loads the graph WebAssembly runtime for
direct solves. When the browser worker bridge is enabled, it is a no-op and
graph solves run through the worker bridge.

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
- `getNextVariableId(): number`
- `ensureNextVariableIdAtLeast(id): void`
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

## Worker Bridge

The CP-SAT, MathOpt, Routing, MPSolver, Knapsack, Network Flow, Set
Cover, RCPSP, and PDLP paths can use the shared worker bridge. Worker bridge
availability is independent of solver threading support; for example GLPK, BOP,
Knapsack, Set Cover, and Network Flow are single-threaded but can still run
through the worker bridge for UI responsiveness, while RCPSP uses CP-SAT and
can also accept CP-SAT thread settings. CP-SAT, SAT, SCIP/GSCIP, CBC, and other
threaded-capable paths can also accept solver thread settings.
Prefer the shared package controls:

```ts
import { isWorkerBridgeEnabled, setWorkerBridgeEnabled } from 'or-tools-wasm/cp-sat';

setWorkerBridgeEnabled(true);
isWorkerBridgeEnabled();
```

Solver-specific aliases are also exposed for existing call sites:

```ts
CpSat.setWorkerBridgeEnabled(true);
MathOpt.setWorkerBridgeEnabled(true);
MathOpt.isWorkerBridgeEnabled();
MPSolver.setWorkerBridgeEnabled(true);
Pdlp.setWorkerBridgeEnabled(true);
RoutingModel.setWorkerBridgeEnabled(true);
```

The worker bridge defaults on in browser main-thread builds and defaults off in
non-browser runtimes. Non-browser callers normally use direct runtime paths
unless they explicitly enable the bridge.

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
