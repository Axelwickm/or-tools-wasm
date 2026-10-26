# MPSolver API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/mp-solver.ts).

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

## `MpModel`, solve options and independent results

`new MpModel(name?)` exposes `addVariable(lb, ub, integer, name?)`,
`addNumVariable`, `addIntVariable`, `addBoolVariable`, `addConstraint`,
`objective()`, `numVariables()`, `numConstraints()` and `incremental(options?)`.
The variable, row and objective handles use the editing methods documented below.
Keep those handles when building the model. Read answers through `MpResult`,
rather than the handles' Python-style current-solution accessors.

`MPSolver.solve(model, options?: MpSolveOptions)` accepts:

| Option | Meaning |
| --- | --- |
| `solverType` | `OptimizationProblemType`, default GLOP |
| `threads` | Native thread request, subject to backend and executor limits |
| `timeLimitSeconds` | Solve time limit in seconds |
| `enableOutput`, `messageCallback` | Native logging controls |
| `solverSpecificParameters` | Native backend parameter text |
| `parameters` | Plain `MpSolveParameters` object |
| `startingBasis`, `callback`, `callbackRegistration` | Native basis and MIP callback inputs described below |
| `executor`, `signal`, `onEvent` | Shared execution controls |

`MpSolveParameters` contains `relativeMipGap`, `primalTolerance`, `dualTolerance`,
`presolve`, `lpAlgorithm`, `incrementality` and `scaling`. The last four use the
parameter enums documented below. This is a plain object. The Python-style
`solver.solve()` instead accepts a `MPSolverParameters` instance and takes its
backend, thread count and time limit from the solver's setters.

`MpResult` exposes `status`, `hasSolution`, `objectiveValue`,
`bestObjectiveBound`, `value(variable)`, `reducedCost(variable)`,
`dualValue(constraint)` and `basisStatus(variableOrConstraint)`, plus the
diagnostics listed above. `objectiveValue` is null without a solution.
`bestObjectiveBound` is null when the native response omits it. Vector accessors
throw for missing values, foreign handles or handles added after the submitted
snapshot. Duals and reduced costs depend on backend support.

`new MpIncrementalSolver(model, options?)` is equivalent to
`model.incremental(options?)`. Its constructor accepts `MpSolveOptions`, while
`solve()` accepts `MpIncrementalSolveOptions`, excluding the fixed `executor`
and `solverType`. `nextSolution({ signal?, onEvent? })` returns an independent
answer or null. `reset({ signal?, onEvent? })` resets native solve state.
Always await `close()` in `finally`.

## Protobuf requests and results

`MPSolver.solveModelRequest(request, options?)` accepts a native
`MPSolverModelRequest` object or its serialized bytes. Put the model, backend,
time limit and backend parameter text in that request. Its options select
execution, `numThreads`, `parameters: MPSolverParameters`, message callbacks,
starting basis and search callbacks.

`MPSolverProtoSolveResult` contains `bytes`, decoded `response` and optional
`metadata`. The bytes encode a native `MPSolutionResponse`. They are independent
of subsequent solves. `LinearSolverSchemas` exposes `linear_solver` and
`optional_boolean` schema text for protobuf tooling.

The instance method `solver.solveWithProto(options)` additionally returns
`loaded`. Its `MPSolverProtoSolveOptions` can override `solverType`,
`timeLimitSeconds`, `numThreads`, `enableOutput` and `solverSpecificParameters`.
`loadSolution` defaults to true. Set it to false to obtain the response without
installing it as the instance's current answer. The ordinary instance
`MPSolverSolveOptions` and retained-session options have narrower contracts.

## Solver Types And Status

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

## `MPSolver`

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

## MPSolver basis input and native MIP callbacks

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

## `MPVariable`

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
- `toString(): string`

## `MPConstraint`

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

## `MPObjective`

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

## `MPSolverParameters`

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

`MPSolverParameters` also exposes these enum members as static constants and
the defaults `defaultRelativeMipGap` (`1e-4`), `defaultPrimalTolerance` and
`defaultDualTolerance` (`1e-7`), `defaultPresolve` (`PRESOLVE_ON`) and
`defaultIncrementality` (`INCREMENTALITY_ON`). Backend support still determines
which settings take effect.
