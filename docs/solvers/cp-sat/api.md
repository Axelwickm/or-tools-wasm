# CP-SAT API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/cp-sat.ts).

[Installation, quick start and examples](README.md).

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

## High-Level CP-SAT

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

## `CpModel`

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
- `clearObjective(): void`: removes either an integer or floating-point objective.

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

## Expressions And Variables

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
- `displayNodeForRendering()` for the expression's display tree, distinct from its protobuf encoding
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

## `CpSolver`

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

The callback also exposes `userTime`, `deterministicTime`, `numBooleans`,
`numConflicts`, `numBranches`, `numBinaryPropagations` and
`numIntegerPropagations`. These describe its current intermediate response,
not necessarily the final response. Register a callback instance for only one
active solve at a time.

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

## CP-SAT model and result

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

## Proto-First CP-SAT

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

## `CpSat`

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

`CpSatEventMask` selects `{ solution?, bestBound?, log? }`. With an observer and
no explicit mask, all three progress event kinds are enabled. An explicit mask
enables only its true fields. Status and failure events are not filtered by it.
`CpSatEvent` progress payloads are:

- `solution`: a detached `response` and its binary `bytes`.
- `bestBound`: the floating-point objective `bound`.
- `log`: a text `message`.

The high-level solve uses the same mask, while registered synchronous callbacks
enable the events they need. Use `eventMask: { bestBound: true }` when only bounds
are needed, avoiding intermediate solution-vector transfers. Logging still
depends on native logging parameters such as `logSearchProgress`.

`CpSatSolverParameters` uses generated `SatParameters` fields with `numWorkers`
as the worker setting. The deprecated `numSearchWorkers` alias is not a high-level
option. Omitted or zero `numWorkers` permits automatic allocation, constrained by
the executor's capacity and native restrictions such as solution enumeration.
Pass `numWorkers: 1` to explicitly request single-worker search.

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

## CP-SAT Types And Enums

The package exports generated CP-SAT protobuf types and enums, including:

- `CpModelProto`
- `CpSolverResponse`
- `SatParameters`
- `CpSolverStatus`
- `DecisionStrategyProto_DomainReductionStrategy`
- `DecisionStrategyProto_VariableSelectionStrategy`

It also re-exports the generated `cp_model` symbols, so generated nested
message types are available from the package entrypoint.
