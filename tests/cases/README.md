# Shared test cases

`python-parity/` contains cases derived from upstream OR-Tools Python tests.
`or-tools-wasm/` contains behavior that belongs to this package, such as executor
lifecycle and cloud-status handling.

Runtime fixtures do not own subsets of these cases. Vite, Webpack, Rollup, Node,
Bun, and Deno import the shared catalog, while executor applicability is defined
centrally in `tests/harness/shared_case.ts`. Direct, worker, and server are solve
executors; cloud has its own unavailable-status contract because it does not solve
models yet.

Server mode is enabled with `ORTOOLS_TEST_SERVER=1`. CI runs direct, worker,
and server on Node, Bun, Deno, and the Vite static browser fixture; the other
browser bundler jobs run direct and worker. Case/mode completeness checks catch
missing registrations, but do not imply that every solver supports concurrent
jobs or immediate native cancellation.

`or-tools-wasm/solve_results.ts` tests owned results, invalid result access,
Knapsack input limits, and Network Flow recovery after rejected arc insertion.
These are package contracts, not additional Python parity claims. Site model,
layout, and interaction tests live in `javascript/site` and
`javascript/tests/site`; see the [testing guide](../../docs/testing.md) for their
commands and scope.
