# Native OR-Tools Server

This folder builds the native solver job server against the checked-in Google
OR-Tools source.

Build and run it with Docker Compose:

```sh
docker compose -f server/docker-compose.yml up --build
```

The Dockerfile caches the native CMake build tree and downloaded dependencies
with BuildKit. It refreshes source timestamps before compiling to avoid reusing
stale objects.
Native compilation defaults to four parallel jobs; override it with the
`NATIVE_BUILD_JOBS` Docker build argument when needed.

To try it from the example site, select **Server** and enter the server endpoint.
If authentication is enabled, enter the token in **Bearer token (optional)**
without the `Bearer` prefix. The field is masked and the site does not persist
the token; enter it again after reloading or changing pages. Use HTTPS for remote
authenticated servers. See the [example site guide](../docs/testing.md#example-site)
to run the site locally.

Run the native server tests in the same Docker Compose build:

```sh
docker compose -f server/docker-compose.yml run --build --rm ortools-native-test
```

Each `add_server_test()` declaration in `server/CMakeLists.txt` adds a suite to
the `server_tests` build target and generated `run_server_tests.sh` runner used
by Compose and CI. This includes all four Routing suites even with
`BUILD_TESTING=OFF`; enabling it also registers the same suites with CTest.

The compose file is the source of deployment defaults. It reads overrides from
the environment or a local `.env` file. `server/.env.sample` shows the current
settings:

```sh
ORTOOLS_SERVER_BIND_ADDRESS=127.0.0.1
ORTOOLS_SERVER_HOST=0.0.0.0
ORTOOLS_SERVER_PORT=17827
ORTOOLS_SERVER_TOTAL_THREADS=auto
ORTOOLS_SERVER_MAX_QUEUE_SIZE=100000
ORTOOLS_SERVER_COMPLETED_JOB_RETENTION_SECONDS=3600
ORTOOLS_SERVER_EVENT_HISTORY_MAX_EVENTS=4096
ORTOOLS_SERVER_EVENT_HISTORY_MAX_BYTES=16777216
ORTOOLS_SERVER_MAX_SESSIONS_PER_SOLVER=64
ORTOOLS_SERVER_SESSION_IDLE_TIMEOUT_SECONDS=1800
# ORTOOLS_SERVER_BEARER_TOKEN=
```

Compose publishes to host loopback by default. `ORTOOLS_SERVER_BIND_ADDRESS`
changes that host address; set a bearer token before exposing the service remotely.
`ORTOOLS_SERVER_HOST` selects the container's listen address and
`ORTOOLS_SERVER_PORT` selects the port.
`ORTOOLS_SERVER_TOTAL_THREADS=auto` uses the container's reported hardware
concurrency. A numeric value sets the scheduler's total thread-token budget.
`ORTOOLS_SERVER_MAX_QUEUE_SIZE` must be a positive integer.
`ORTOOLS_SERVER_COMPLETED_JOB_RETENTION_SECONDS` controls how long terminal job
results and event histories remain available when clients do not release them.
`ORTOOLS_SERVER_BEARER_TOKEN` enables bearer-token auth when set. If it is
unset, the server warns loudly and accepts unauthenticated requests.

Remote MathOpt requests reject GSCIP's `search_logs_filename`,
`detailed_solving_stats_filename` and `scip_model_filename` when nonempty.
SCIP string parameters are restricted to `heuristics/undercover/fixingalts`;
other strings can select files or external settings. The same policy applies to
MPSolver's SCIP parameter text, including retained sessions and parameter
validation. `ignore_solver_specific_parameters_failure` cannot bypass it.
Direct and worker execution retain the native parameter surface.

The image runs as UID/GID `10001:10001`. Compose makes its root filesystem
read-only, provides writable temporary storage at `/tmp`, drops capabilities and
prevents privilege escalation. Keep these restrictions when deploying outside
Compose; solver-controlled filesystem output has no remote opt-in.

The default executable is `ortools_server`, built from
`server/src/main.cc`. It starts the native HTTP server and exposes:

```text
GET  /healthz
POST /jobs
GET  /jobs/:id
GET  /jobs/:id/events?after=:sequence
GET  /jobs/:id/stream?after=:sequence
GET  /jobs/:id/result
POST /jobs/:id/cancel
POST /jobs/:id/callback
DELETE /jobs/:id
```

Clients release completed job state with `DELETE /jobs/:id` after receiving a
terminal result. The server also removes terminal jobs after the configured
retention period if clients do not release them. Queued and running jobs never
expire. Cleanup runs periodically, so removal can occur up to 30 seconds after
the retention period ends.

The job API carries generic `SolverBridgeRequest` / `SolverBridgeResponse`
protobuf bytes. Solver-specific payloads, events, and results are nested as
opaque bytes inside that generic envelope. Status, events, and results have
separate responsibilities:

```text
GET /jobs/:id         current SolverJobStatus snapshot
GET /jobs/:id/events?after=N   SolverEventBatch after sequence N
GET /jobs/:id/stream?after=N   server-sent SolverBridgeResponse events
GET /jobs/:id/result           final result or execution failure; 204 while pending
```

The server-sent event stream is the primary transport after a job acquires
scheduler capacity. Queued jobs use the polling endpoints instead of occupying
an HTTP worker with an idle stream. Callback-enabled MathOpt solves use short
polling requests so browser connection limits cannot block callback replies.
Each job permits one live event stream. A global stream limit leaves four HTTP
workers available for other requests. Duplicate subscriptions return `409`;
exhausted stream capacity returns `503`. The client falls back to polling for
both. Stream connections close when delivery ends, releasing their HTTP worker.
Each SSE `data` field is a base64-encoded
`SolverBridgeResponse`, so status, solver events, and terminal results retain
the same protobuf contract as direct execution and the worker bridge. The
stream closes after its terminal result or failure.

Event history is a rolling window bounded by both event count and serialized
protobuf bytes per job, including while a solve runs. An individual solver event
exceeding the byte budget expires older cursors instead of silently dropping it;
a callback exceeding the budget is rejected and stops native callback processing. A final result larger
than that budget is available through `/result` without being copied into history.
These limits bound event retention, not native model/solver memory or result size.

Events have monotonically increasing sequence IDs so clients can resume reading.
A cursor older than the retained window returns `410`; a live stream that falls
behind closes and its next poll returns `410`. The SDK reports the lost events
and requests cancellation rather than silently skipping them. The final result
remains independently readable until release or completed-job expiry.
MathOpt callbacks require a correlated `SolverBridgeRequest.callback_reply` sent to
`POST /jobs/:id/callback` within 30 seconds. The client handles this exchange;
acknowledged callback payloads are released; their sequence metadata remains only
within the retained window. Pending replies remain correlated independently of history.
The protobuf event and result endpoints remain available when streaming is unavailable.

The native server registers CP-SAT, Knapsack, MathOpt, MPSolver, Network Flow,
PDLP, Routing, and Set Cover executors. Each returns the same typed payload used
by its direct and worker executors. Cancellation uses the same generic protobuf
command for every solver; queued cancellation is immediate.

Running-job cancellation depends on the native solver's interruption support.
For example, Knapsack and Network Flow have no native interruption hook.
Requesting cancellation is not a guarantee that active computation stops
immediately.
CP-SAT and MathOpt also support `/jobs/{id}/interrupt`, which stops native
search and retains its final response instead of marking the job cancelled.

The server path is native C++. JavaScript remains only on the client/package
side for selecting a server executor and sending bridge protobuf bytes.

MathOpt, MPSolver and guided Set Cover sessions retain native state between jobs.
Always await the session's `close()` to release it. Each solver's registry also
has a finite capacity and idle timeout, independent of completed-job retention.
Idle time starts after the last session operation finishes; active operations are
leased and never expired. Cleanup runs without client traffic, at intervals of
at most 30 seconds. Expired handles fail explicitly; sessions are not recreated.
Direct/worker session lifetimes remain controlled by `close()`.
Restarting the server invalidates existing sessions. GLPK
persistent sessions are unsupported on the server because its environment is
owned by the creating thread; one-shot GLPK solves remain supported.

## JavaScript client

Pass `executor: { type: 'server', url: 'http://localhost:17827' }` to a solver
operation. Add `authToken` when bearer authentication is enabled. Server
selection is per operation; no global initialization is needed. The same model
and result APIs are used for direct, worker, and server execution.

Catch rejected solve promises and use `onEvent` for status and failure details.
The client distinguishes unreachable servers, authentication errors, timeouts,
queue limits, and solver failures. It has no default connection timeout; a
custom `fetch` can supply one. The example site adds a 10-second timeout until
response headers arrive, leaving long solves and event streams unrestricted.

See the [executor API](../docs/api.md#server-execution-and-errors) for options
and failure behavior. Server-only browser clients do not need local WASM
isolation headers, but browser CORS and mixed-content rules still apply. Do not
expose an unauthenticated server to an untrusted network; use authentication and
an HTTPS reverse proxy for remote deployment.
