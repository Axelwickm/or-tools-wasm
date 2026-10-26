# MathOpt API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/mathopt.ts).

In this reference: [solving](#mathopt), [sessions and filters](#full-incremental-and-filtered-solves),
[native utilities](#native-model-and-solution-utilities), [results](#solve-results),
[callbacks](#mathopt-native-callbacks), [model editing](#mathoptmodel),
[objectives](#mathoptobjective), [MPS conversion](#mathopt-mps-conversion) and
[expressions](#mathopt-expression-classes).

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
Direct/worker runtime replacement requires a new session.
For server sessions, a cancelled creation reply is still consumed in the background
so any late native handle can be deleted, including after `close()` returns.

`MathOpt.IncrementalSolver` derives updates from model edits and can rebuild
when a backend declines an update; the raw class leaves that decision to callers.
The named export for the editable session is `MathOptIncrementalSolver`.

## `MathOpt`

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
- `solverType?: MathOptSolverType | keyof typeof MathOptSolverType` (default GLOP)
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

A custom `MathOptSolveInterrupterLike` can supply `interrupted`,
`isInterrupted()` and an `AbortSignal` in `signal`. The first two are checked
when preparing a solve. Supply the signal for interruption after dispatch.

### Full, Incremental, And Filtered Solves

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

These classes accept their corresponding `...Options` object at construction
and expose `toProtoBytes()`. `GScipParameters`, `GlopParameters` and
`PdlpParameters` retain an `options` property. GSCIP uses `boolParams`,
`intParams`, `longParams`, `realParams`, `charParams` and `stringParams` for
native named parameters. Its enum controls use `GScipEmphasis` and
`GScipMetaParamValue`, including `presolve`, `heuristics` and `separating`.
Output controls are `silenceOutput`, `printDetailedSolvingStats`, `printScipModel`,
`searchLogsFilename`, `detailedSolvingStatsFilename` and `scipModelFilename`.
The [server restricts file-writing settings](../../execution.md#server-execution-and-errors).

PDLP enum aliases are exported as `PdlpOptimalityNorm`, `PdlpSchedulerType`,
`PdlpRestartStrategy` and `PdlpLinesearchRule`. Put the norm under
`terminationCriteria.optimalityNorm`. The other three settings use
`schedulerType`, `restartStrategy` and `linesearchRule`.

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

The named classes are `MathOptModelSolveParameters`, `MathOptSparseVectorFilter`,
`MathOptSolutionHint` and `MathOptObjectiveParameters`. Each accepts an options
object and exposes `toProtoBytes()`. The first three also accept an optional
model in `toProtoBytes(model)` to validate handle ownership. Hint fields are
`variableValues` and `dualValues`. `branchingPriorities` entries use
`{ variable, priority }`. Quadratic dual filters use IDs, while primal, linear
dual and reduced-cost filters also accept their model handles.

## Native model and solution utilities

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

`MathOptInfeasibleSubsystemOptions` accepts `solverType` (default GSCIP),
`interrupter`, `messageCallback`, `timeLimitSeconds`, `nodeLimit`,
`threads`, `enableOutput`, `randomSeed`, `gscip` and execution controls. Search
callbacks and optimization-only parameters do not apply. Retained calls use
their fixed backend and name policy.

The model-based result uses handle-keyed membership maps/sets; the proto result
contains `{ bytes, response, messages }` with exact native IDs. Both incremental
solver classes expose the same operation on their retained native model.
Unsupported-operation errors follow the existing failed-session contract;
close the session after failure.

The high-level `MathOptInfeasibleSubsystemResult` contains `feasibility`
(`'feasible'`, `'infeasible'` or `'undetermined'`), `infeasibleSubsystem`,
`isMinimal` and `messages`. Minimality is a separate native flag, not implied
by infeasibility. `MathOptModelSubset` is also used by the feasibility checker:

- `variableBounds`, `linearConstraints` and `quadraticConstraints` are
  handle-keyed maps with `{ lower: boolean, upper: boolean }` membership.
- `variableIntegrality`, `sos1Constraints`, `sos2Constraints`,
  `indicatorConstraints` and `secondOrderConeConstraints` are handle sets.

The proto equivalents preserve native IDs. These types describe returned
membership without implementing IIS search in the wrapper.

`GlpkParameters` mirrors the upstream MathOpt GLPK-specific solve parameters:

- `computeUnboundRaysIfPossible?: boolean`

GLPK is single-threaded in this package. MathOpt GLPK solves reject
`threads > 1`; omit `threads` or pass `threads: 1`.

## Solve results

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

`solveStats` fields are `solveTimeSeconds`, `simplexIterations`,
`barrierIterations`, `firstOrderIterations` and `nodeCount`. No optimality is
implied by a nonempty solution vector. Check `terminationReason`, the primal
feasibility status and the bounds for the guarantee needed by your application.

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

## MathOpt native callbacks

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

## `MathOptModel`

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
`sos1Constraints()` / `sos2Constraints()`, `getNumSos1Constraints()` /
`getNumSos2Constraints()`, `getNextSos1ConstraintId()` / `getNextSos2ConstraintId()`,
`ensureNextSos1ConstraintIdAtLeast(id)` / `ensureNextSos2ConstraintIdAtLeast(id)`,
`hasSos1Constraint(id)` / `hasSos2Constraint(id)`, `getSos1Constraint(id)` /
`getSos2Constraint(id)`, and `deleteSosConstraint(handle)` for either family.
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
`deleteSecondOrderConeConstraint(handle)`. `MathOptSecondOrderConeConstraint` handles expose `id`, `name`,
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

Editable model IDs are safe-integer numbers. Use raw proto APIs with bigint IDs
for larger int64 IDs. `ensureNext...IdAtLeast()` advances allocation without
creating an element or reusing a deleted ID. `assertOwnsVariable(variable)`,
`assertOwnsConstraint(linearConstraint)` and `assertOwnsObjective(objective)`
check that a handle is live and belongs to this model. Deleting a variable removes
its contributions to stored constraints and objectives.

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

## `MathOptVariable`

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

## `MathOptLinearConstraint`

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

## `MathOptObjective`

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

## MathOpt MPS conversion

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

## MathOpt Expression Classes

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
