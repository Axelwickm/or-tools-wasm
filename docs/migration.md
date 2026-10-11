# Migrating to the next major release

This release includes breaking changes. Upgrade the package and solver server
together; the expanded binary bridge is not a compatibility promise for older
clients or servers. Nothing is published by the cleanup itself.

## Results and retained solvers

The existing result-first calls remain: `CpSat.solve(model)`,
`MPSolver.solve(mpModel)`, and `MathOpt.solve(model)` return independent answers.
Read a value from that answer, for example `result.value(x)`. A later solve or
model edit does not replace values in an earlier result.

MPSolver now exposes native diagnostics on `MpResult`: `solverVersion`,
`wallTimeMs`, exact `bigint` `iterations`/`nodes`, `exactConditionNumber`, and
`basisStatus(element)`. Missing optional metadata is `null`; native counter
sentinels such as `-1n` are retained. A basis
query fails when the backend supplies no basis. Numeric counters on the
Python-style facade throw if a value cannot be represented safely.

Use `mpModel.incremental(options)` to retain a native solver and return a fresh
`MpResult` for each solve. Always `await session.close()` in `finally`.
The existing Python-style `CpSolver` and `MPSolver` facades still keep a current
answer for their status/getter API; that behavior predates this release.

`CpSolver.response` now returns a detached copy. Mutating it does not change
the solver's current answer.
`CpResult` exposes native statistics, timing/counters, status names and
infeasibility assumptions directly. CP-SAT, MPSolver, Knapsack and Network Flow
result constructors are private; obtain results from their solve methods.
MathOpt variable/constraint constructors are also private; obtain registered
handles from the model's methods. CP-SAT callback dispatch and cancellation
hooks are internal; use `onSolutionCallback()` and `stopSearch()`.

## Routing and inspection surfaces

Use `routing.addConstraints(...)` with typed comparisons or Boolean predicates;
`routing.solver()` and `routing.costVar()` were removed. Solution callbacks now
receive an event: `routing.addAtSolutionCallback(event => console.log(event.objectiveValue))`.
Read profiling text and the native automatic strategy from `RoutingResult` (or
from an assignment returned by a specialized method). `getModelParameters()`
returns a copy of submitted overrides. Assignments, dimensions and resource
groups have private constructors; obtain them from the model's methods.
Routing parameter objects no longer include `solverParameters.copyFrom()`.
Replace nested settings with ordinary typed objects, for example
`parameters.solverParameters = { profileLocalSearch: true }`.

Set Cover's `inspect()` returns a focused `SetCoverInspection`. Use one
inspection when reading cost, selection and coverage together; individual
getters still issue their own native requests. MPSolver model, request and
response objects have generated proto types, so misspelled fields now fail type
checking. Use `MPSolverModelProto` for a model and `MPSolverModelRequest` for its
containing solve request. Raw byte inputs remain available.
Ordinary Set Cover searches reject stale results if the model, selection or
trace changes during execution; user edits are preserved and a fresh search can
be submitted.

MathOpt expression constructors now take explicit term iterables and an offset.
Replace `new MathOpt.LinearExpression(x)` with
`MathOpt.asFlatLinearExpression(x)`; use the corresponding quadratic converter
for quadratic inputs. To add a constant, use `.add(constant)` or the constructor's
offset argument. Evaluation maps require variable handles; use value records
for numeric IDs.

## Await native operations

MPSolver model exports, constraint activities, solution loading/verification,
solver-specific parameter validation, and version queries are awaitable:

```ts
const options = { executor: 'worker' as const };
const lp = await solver.exportModelAsLpFormat(false, options);
const loaded = await solver.loadSolutionFromProto(response, 1e-7, options);
const valid = await solver.verifySolution(1e-7, false, options);
const version = await solver.solverVersion(options);
```

Routing restoration/domain/cost queries and Set Cover native state/diagnostic
operations also require awaiting their current declaration signatures. Local
model edits and getters on completed results remain synchronous. Consult the
[API reference](api.md) and exported declarations for individual methods.

## Native reports and validation

CP-SAT `modelStats()` and `responseStats()` return native human-readable text,
not the previous JSON summary. Use typed model/response fields for structured
data; do not parse the native report as JSON.

Native MPSolver LP/MPS exports use OR-Tools formatting and naming. Upstream
ignores the MPS `fixedFormat` argument. Solution imports use native validation,
including dual/reduced-cost dimensions and the supplied bound tolerance; an
invalid import returns `false` and preserves the previous answer.
`CpModel.validate({ executor, signal })` accepts the same execution controls as
its other native diagnostic operations.

Exact IDs and counters reject unsafe numeric representations instead of
silently rounding. Ownership, shape and unsupported-backend checks can reject
inputs that previously failed later or appeared to succeed. MathOpt objective
and constraint term getters return copies: edit coefficients through the model
API. Mutable handle storage (`data`/`ref`) and internal record helpers are private.

## Session failures and backend capabilities

A pre-aborted operation does not invalidate a healthy incremental session.
After a transport failure that leaves native state uncertain, close and recreate
the session. Executors and backends are fixed for a session's lifetime.
MathOpt incremental `removeNames` is a constructor option; passing it to
`solve()` now rejects instead of silently retaining the original naming policy.

MathOpt model/parameter exposure does not add multiobjective solving, quadratic
dual computation or IIS to backends that lack them. SCIP IIS through MPSolver
is available separately. GLPK retained server sessions require a stable native
thread and remain unavailable. RCPSP consumer/producer, resource-investment
and selected-recipe Max constraints use CP-SAT models; they do not introduce
another optimization engine.

## MathOpt surface cleanup

Read result vectors from their `...ById` fields or use `result.value(variable)`.
Name-keyed maps were removed because unnamed or duplicate names lose entries.
Builder options use `lowerBound`, `upperBound`, `integer` and `expression`;
`lb`, `ub`, `isInteger` and `expr` aliases were removed. Use `variables()`,
`indicatorConstraints()` and `setObjective()` instead of their duplicate aliases.

Use `variable.equals(other)` for identity and `MathOpt.eq(lhs, rhs)` for a
constraint. The Python equality/Boolean shims were removed. Expression maps
are immutable views, including the map supplied to `forEach()` callbacks.
Explicit empty filters select no entries in array, object and class forms;
omitting a selection or setting `filterByIds: false` returns all entries.
Handle-based model parameters reject foreign, deleted or unregistered handles.
Raw protobuf access is unchanged.

Create update trackers with `model.addUpdateTracker()` and use
`exportUpdate()` / `advanceCheckpoint()`; tracker IDs and model snapshots are
internal. Obtain MPSolver variables, constraints and objectives from the model
or solver; their constructors are private.

Obtain MathOpt objective handles from `model.objective` or auxiliary objective
methods. Use `setToExpression()` / `add()` for general expressions; their
quadratic aliases and the always-throwing `ne()` helper were removed. Read names
from handles rather than model ID-to-name helpers. Primal solution hints now use
`{ variable, value }`, matching dual hint values. Public linear constraint and
expression input types are exported from `or-tools-wasm/mathopt`.

RCPSP results contain schedules, objective/capacity values and the native response.
Generated model/variable fields were removed; use `problem.toCpSatModel()` for the
CP-SAT model. Independent solves may share one problem, subject to executor limits.
Raw CP-SAT handle constructors no longer accept ignored names; name variables and
intervals through model builders. `MPSolverProtoSolveOptions.tolerance` was removed
because solving never used it; solution loading and verification retain tolerances.

Knapsack and Network Flow solve calls capture independent model inputs. Calls
may share one model across independent executors; singleton direct/worker
executors retain their concurrency limits. Their obsolete per-model
`RuntimeError` exports were removed. `MPSolver.nextSolution()` was a constant
`false` placeholder and is removed; use an incremental session for enumeration.

MathOpt model lookups take only an ID and return `undefined` for absent/deleted
entries. The `validate: false` positional flag and synthetic handles were removed.
Use `model.objective` to read/edit objectives; `model.objectiveData` was internal
representation and is removed. Incremental duplicate-name errors come from native
validation and surface through the first awaited `solve()`, with `close()` in
`finally`. Routing search settings now use only native protobufs; the obsolete
scalar bridge fields and WASM solve entry points were removed. Empty overrides
still select native defaults. Upgrade client and server together.

Set Cover inspection always recomputes a fresh native snapshot. `select(subset)`
and `deselect(subset)` take only the subset index; `ConsistencyLevel`,
`checkConsistency()`, `recompute()` and the standalone JS `TabuList` are removed.
Native `GuidedTabuSearch` tuning, including tabu list size, remains available.
Replace `RcpspParser.parseString()` / `problem()` with
`RcpspProblem.fromPsplib(text)` and `exportModelAsProto()` when needed.
