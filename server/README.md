# Native OR-Tools Server

This folder builds the native solver job server against the checked-in Google
OR-Tools source.

Build and run it with Docker Compose:

```sh
docker compose -f server/docker-compose.yml up --build
```

The Dockerfile uses a BuildKit cache mount for the native CMake build tree, so
rebuilding after server-only edits should reuse downloaded dependencies and
previous OR-Tools objects.

Run the native server tests in the same Docker Compose build:

```sh
docker compose -f server/docker-compose.yml run --rm ortools-native-test
```

The compose file is the source of deployment defaults. It reads overrides from
the environment or a local `.env` file. `server/.env.sample` shows the current
settings:

```sh
ORTOOLS_SERVER_HOST=0.0.0.0
ORTOOLS_SERVER_PORT=17827
ORTOOLS_SERVER_TOTAL_THREADS=auto
ORTOOLS_SERVER_MAX_QUEUE_SIZE=100000
# ORTOOLS_SERVER_BEARER_TOKEN=
```

`ORTOOLS_SERVER_HOST` and `ORTOOLS_SERVER_PORT` select the HTTP bind address.
`ORTOOLS_SERVER_TOTAL_THREADS=auto` uses the container's reported hardware
concurrency. A numeric value sets the scheduler's total thread-token budget.
`ORTOOLS_SERVER_MAX_QUEUE_SIZE` must be a positive integer.
`ORTOOLS_SERVER_BEARER_TOKEN` enables bearer-token auth when set. If it is
unset, the server warns loudly and accepts unauthenticated requests.

The default executable is `ortools_server`, built from
`server/src/main.cc`. It starts the native HTTP server and exposes:

```text
GET  /healthz
POST /jobs
GET  /jobs/:id
GET  /jobs/:id/events?after=:sequence
GET  /jobs/:id/result
POST /jobs/:id/cancel
DELETE /jobs/:id
```

Clients release completed job state with `DELETE /jobs/:id` after receiving a
terminal result. Active jobs cannot be released.

The job API carries generic `SolverBridgeRequest` / `SolverBridgeResponse`
protobuf bytes. Solver-specific payloads, events, and results are nested as
opaque bytes inside that generic envelope. Status, events, and results have
separate responsibilities:

```text
GET /jobs/:id         current SolverJobStatus snapshot
GET /jobs/:id/events?after=N   SolverEventBatch after sequence N
GET /jobs/:id/result           final result or execution failure; 204 while pending
```

Event reads are non-destructive. Each retained status transition and solver
event has a monotonically increasing sequence ID, so clients can poll without
losing or duplicating callbacks.

The native server registers CP-SAT, Knapsack, MathOpt, MPSolver, Network Flow,
PDLP, Routing, and Set Cover executors. Each returns the same typed payload used
by its direct and worker executors. Cancellation uses the same generic protobuf
command for every solver; queued cancellation is immediate.

The server path is native C++. JavaScript remains only on the client/package
side for selecting a server executor and sending bridge protobuf bytes.

The next server transport should stay protocol-thin: HTTP carrying the existing
bridge protobuf bytes. gRPC can be added later if we need service discovery,
load-balancer-native streaming, or generated multi-language clients, but the
first native server should not introduce a second RPC schema.
