# Documentation

## Setup and execution

- [Setup](setup.md): full and standalone packages, a first solve, browser requirements, Node, Deno, Bun and bundlers.
- [Execution and shared APIs](execution.md): executors, results, callbacks, events, cancellation, runtime cleanup, server errors, cloud notice and protobuf access.
- [Native server](../server/README.md): building, running and configuring the server.
- [Migration](migration.md): changes since 1.0.0, breaking contracts and upgrading.

## Solvers

- CP-SAT
  - [README](solvers/cp-sat/README.md): installation, quick start and npm package information.
  - [API reference](solvers/cp-sat/api.md)
- Routing
  - [README](solvers/routing/README.md): installation, quick start and npm package information.
  - [API reference](solvers/routing/api.md)
- [MathOpt API reference](solvers/mathopt/api.md)
- [MPSolver API reference](solvers/mp-solver/api.md)
- [PDLP API reference](solvers/pdlp/api.md)
- [Knapsack API reference](solvers/knapsack/api.md)
- [Network Flow API reference](solvers/network-flow/api.md)
- [Set Cover API reference](solvers/set-cover/api.md)
- [RCPSP API reference](solvers/rcpsp/api.md)

## Development

- [Testing](development/testing.md): local example site, shared fixtures and runtime coverage.
- [Packaging](development/packaging.md): standalone builds, npm READMEs and release publishing.
- [Benchmarks](../benchmarking/README.md)
- [Python test parity audit](development/audits/solver-python-test-parity-audit.md)
- [Routing construction audit](development/audits/routing-construction.md)
- [Repository agent instructions](AGENTS.md)
- [Documentation media](media/)
