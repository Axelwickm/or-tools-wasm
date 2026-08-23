# Shared test cases

`python-parity/` contains cases derived from upstream OR-Tools Python tests.
`or-tools-wasm/` contains behavior that belongs to this package, such as executor
lifecycle and cloud-status handling.

Runtime fixtures do not own subsets of these cases. Vite, Webpack, Rollup, Node,
Bun, and Deno import the shared catalog, while executor applicability is defined
centrally in `tests/harness/shared_case.ts`. Direct, worker, and server are solve
executors; cloud has its own unavailable-status contract because it does not solve
models yet.
