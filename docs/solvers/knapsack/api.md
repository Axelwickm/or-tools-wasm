# Knapsack API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/knapsack.ts).

The dedicated Knapsack API mirrors
`ortools.algorithms.python.knapsack_solver.KnapsackSolver` and uses the
MPSolver WebAssembly runtime.

```ts
import {
  asNumber,
  KnapsackSolver,
  KnapsackSolverType,
} from 'or-tools-wasm/knapsack';

const solver = new KnapsackSolver(
  KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
  'knapsack',
);
solver.init(
  [360, 83, 59, 130],
  [[7, 0, 30, 22]],
  [50],
);

const result = await solver.solve({ executor: 'worker' });
const selected = [0, 1, 2, 3].filter((item) => result.contains(item));
console.log(asNumber(result.profit), selected, result.optimal);
```

The runtime is loaded lazily. Select execution for each solve with
`executor: 'auto' | 'direct' | 'worker'` or a server/cloud executor
configuration. `signal` requests cancellation; worker execution can terminate
its worker, but running native Knapsack solves have no interruption hook,
including on the server. Knapsack emits the shared solver
lifecycle events through `onEvent` but has no native solution-progress callback.
`numWorkers` defaults to one. The CP-SAT Knapsack backend also accepts larger
positive worker counts; other algorithms require one. Counts are forwarded to
native CP-SAT and checked against the WASM pool or server budget before work
starts. The singleton direct and worker executors each accept one job at a time.
Server calls use independent snapshots and server admission limits. An `onEvent`
error is reported after the active executor job settles so it remains reusable.

`KnapsackSolverType` exposes the upstream solver ids:

- `KNAPSACK_BRUTE_FORCE_SOLVER`
- `KNAPSACK_64ITEMS_SOLVER`
- `KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER`
- `KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER`
- `KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER`
- `KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER`
- `KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER`
- `KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER`
- `KNAPSACK_DIVIDE_AND_CONQUER_SOLVER`
- `KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER`

`solve(options)` returns an independent `KnapsackResult`. This replaces the
earlier scalar return and mutable last-solution accessors: use `result.profit`,
`result.contains(item)`, and `result.optimal`. `KnapsackSolver` also supports
`init()`, `setUseReduction()`, `setTimeLimit()`, and `getName()`. Profits,
weights, and capacities accept `IntValue`; `result.profit` is an exact `bigint`.

`KnapsackSolveOptions` contains `executor`, `signal`, `onEvent` and `numWorkers`.
Set reduction and the time limit on the builder before calling `solve()`.
Submitted profits, weights, capacities and settings are captured for that call.
`KnapsackResult.contains(item)` reads an item in that snapshot and rejects an
out-of-range index. `optimal` reports the native proof flag, which can be false
when a time limit leaves only an incumbent. This result has no separate status
enum or mutable last-solution accessors on the builder.

`init(profits, weights, capacities)` accepts an empty item list and requires at
least one weight dimension. Each dimension needs one weight per item and a
matching capacity. Brute force accepts at most 30 items; the 64-item solver accepts at
most 64. Those two algorithms, dynamic programming, and divide-and-conquer
require exactly one weight dimension. Limits apply before reduction and invalid
inputs throw before changing the initialized problem. `setTimeLimit(seconds)`
uses seconds. Exported solver IDs do not imply that every backend is compiled
in; commercial backends such as CPLEX and XPRESS are not included.

Profits, weights and capacities must be nonnegative; profit totals and each
weight dimension's total must fit signed int64. Branch-and-bound profits and
dynamic-programming/divide-and-conquer capacities must be below `INT64_MAX`
because native code increments them. MIP/CP-SAT profit totals must remain below
`2^63` after conversion to double. These adapters use floating-point objectives;
their native precision limits still apply. Empty 64-item problems require the
default reduction setting. Rejected initialization preserves the previous model.

The MPSolver frontend also exposes
`KNAPSACK_MIXED_INTEGER_PROGRAMMING`, `MPSolver.createSolver('KNAPSACK')`, and
the proto solve path for knapsack-shaped 0-1 models.
