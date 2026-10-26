# Execution and shared APIs

[All documentation](README.md)

Shared execution controls apply across the public solver subpaths of `or-tools-wasm`.
The exported TypeScript declarations provide complete signatures and generated
protobuf fields; this reference covers model building, results and execution.
For changes from `1.0.0`, see the [migration guide](migration.md).
The package is ESM only:

```ts
import { CpSat } from 'or-tools-wasm/cp-sat';
import { RoutingIndexManager, RoutingModel } from 'or-tools-wasm/routing';
```

The root `or-tools-wasm` entry exports `packageName`, `version` and
`setCloudNoticeEnabled()`. Import solver APIs and executor configuration types
from their solver subpaths. Standalone CP-SAT and Routing packages expose the
same solver APIs from their package roots, as shown in [setup](setup.md).

Most solver runtimes are loaded lazily. Browser solves use the package worker
bridge by default so the main thread stays responsive. Local browser WASM needs
cross-origin isolation headers; server-only execution does not. See
[Browser requirements](setup.md#browser-requirements). For local setup, see
the [example site guide](development/testing.md) and [native server setup](../server/README.md).

The one-shot APIs keep inputs on the model/problem and return an independent
result for that particular solve. Solver settings and executor controls go in one options object:

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

CP-SAT also supports serialized models through `CpSat.solveProto()`. Stateful
interfaces remain available alongside one-shot solves: `CpSolver`, the
`pywraplp`-style MPSolver interface, and incremental MathOpt. Their contracts
are documented in the [solver API references](README.md#solvers).

`onEvent` observers may return a Promise and run in order. Cancellation stops
observer delivery and stops waiting for a pending observer; the solve still waits
for native cleanup and commits any returned session state before rejecting.
The solve promise reports cancellation; no further observer calls are scheduled.

### Callbacks and event observers

Callbacks that supply data to native code must return synchronously. This includes
CP-SAT solution, bound and log callbacks, MathOpt and MPSolver search/message
callbacks, and Routing transit, state-dependent transit, pickup/delivery limit,
sibling and whole-route evaluators. A Promise or thenable is rejected, and a
rejected asynchronous return is consumed so it cannot escape as an unhandled
rejection. Synchronous callback errors retain the original exception.

Use `onEvent` for asynchronous notifications. Routing's registered solution and
search-entry notifications also allow asynchronous handlers. These observers do
not supply native callback replies. Their errors reject the operation after
native cleanup. An observer cannot close its own active retained session.

`SolverJobEvent` is the shared discriminated union of `{ type: 'status', status }`
and `{ type: 'failure', failure }`. Status carries native job state, request ID,
solver name, timestamps, allocated threads and queue position. Failure carries
the kind, message, trace and retryability information. Solver-specific event
unions add solution, log or iteration payloads. Observe failures for display,
but also catch the operation's rejected promise.

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

GLPK persistent sessions require a stable native thread. They work with local
execution but are not supported on the server.

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

The native server rejects solver parameters that write files, including backend
parameter-string equivalents. A setting accepted by local native execution may
therefore be rejected remotely. There is no remote opt-in for solver-controlled
file output. See [server security controls](../server/README.md).

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

`ExecutorSelection` accepts the string forms described above or the corresponding
`AutoExecutorConfiguration`, `DirectExecutorConfiguration`,
`WorkerExecutorConfiguration`, `ServerExecutorConfiguration` and
`CloudExecutorConfiguration` objects. `ExecutorConfiguration` is their union.
Cloud selection performs a service-status check and rejects with the exported
`CloudExecutorUnavailableError`. It does not upload a model. `{ type: 'cloud',
test: true }` marks the status request as a test, but still makes that request.

### Runtime cleanup

Every solver subpath exports `terminateLoadedRuntimeThreads(): Promise<void>`.
After finishing local work and closing retained sessions, await it to terminate
the loaded WASM pthread pools in the current JavaScript context and clear their
runtime cache. A later local solve loads a fresh runtime. It is not a substitute
for cancelling an active solve or closing a session, and does not terminate
server jobs or pools in another worker context.

Integer solver subpaths export `asNumber(value)`. It converts an exact integer
to a JavaScript number only when safe, otherwise throwing `RangeError`.
Use bigint-aware serialization when storing exact results as JSON.

### Cloud notice

After the first completed local solve, the library prints a cloud notice with
`console.info`, once per JavaScript context (page, process, or independent worker),
shared across solver imports. The notice makes no network request. To suppress
it before solving:

```ts
import { setCloudNoticeEnabled } from 'or-tools-wasm';
setCloudNoticeEnabled(false);
```

The setting is also exported by every solver subpath. Command-line applications
can instead set `ORTOOLS_WASM_CLOUD_NOTICE=0`. An explicit function call takes
precedence over the environment setting. Re-enabling the notice does not print
it again if it has already appeared. Explicit cloud status messages are unaffected.

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
