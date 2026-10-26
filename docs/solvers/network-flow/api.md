# Network Flow API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/network-flow.ts).

The dedicated Network Flow API provides camelCase builders for
`SimpleMaxFlow`, `SimpleMinCostFlow`, and `SimpleLinearSumAssignment`. Like
CP-SAT, the runtime is loaded lazily and execution is selected per solve.

```ts
import { asNumber, SimpleMaxFlow, SimpleMaxFlowStatus } from 'or-tools-wasm/network-flow';

const maxFlow = new SimpleMaxFlow();
const arcs = maxFlow.addArcsWithCapacity(
  [0, 0, 0, 1, 1, 2, 2, 3, 3],
  [1, 2, 3, 2, 4, 3, 4, 2, 4],
  [20, 30, 10, 40, 30, 10, 20, 5, 20],
);
const result = await maxFlow.solve({ source: 0, sink: 4, executor: 'worker' });
if (result.status === SimpleMaxFlowStatus.OPTIMAL) {
  console.log(asNumber(result.optimalFlow), arcs.map((arc) => result.flow(arc)));
}
```

`solve(options)` on each Network Flow class returns an independent
`MaxFlowResult`, `MinCostFlowResult`, or `LinearSumAssignmentResult` snapshot.
This replaces the earlier status-only return and mutable result accessors. Read
the status, objective, flows, cuts, and assignments from the returned result.

`NetworkFlowSolveOptions` contains `executor`, `signal` and `onEvent`.
`MaxFlowSolveOptions` additionally requires `source` and `sink`. Min-cost flow
also accepts `maxFlowWithMinCost`. Inputs are captured for each submitted solve.
Edits after submission do not change the returned snapshot, and earlier results
remain readable after later solves. Vector accessors take arc IDs from that
snapshot and reject out-of-range IDs.

Every solve accepts `executor`, `signal`, and `onEvent`. `executor` supports
the shared `direct`, `worker`, `server`, `cloud`, and `auto` selections. The
default is `auto`; browser main-thread calls select a worker while environments
without browser workers select direct execution. There is no global initializer
or executor setting.

Capacity, supply and cost inputs accept `IntValue`; numeric results are
`bigint`. Node and arc indexes remain checked `number` values. Arc endpoints
must be nonnegative and at most `2_147_483_645` for max-flow,
`2_147_483_643` for min-cost flow (including supply nodes), or `1_073_741_822`
for assignment. These limits reserve native graph nodes and sentinels.
Max-flow source/sink values remain nonnegative int32 inputs with native status
semantics. Arc insertion and supply conversion validate before changing state.
Check native range/overflow statuses before reading flows or assignments.

`SimpleMaxFlow` exposes:

- `SimpleMaxFlowStatus`: `OPTIMAL`, `POSSIBLE_OVERFLOW`, `BAD_INPUT`, `BAD_RESULT`
- `addArcWithCapacity(tail, head, capacity): number`
- `addArcsWithCapacity(tails, heads, capacities): number[]`
- `setArcCapacity(arc, capacity): void`
- `setArcsCapacity(arcs, capacities): void`
- `numNodes(): number`
- `numArcs(): number`
- `tail(arc)`, `head(arc): number`
- `capacity(arc): bigint`
- `solve({ source, sink, ...options }): Promise<MaxFlowResult>`

`MaxFlowResult` exposes `status`, `optimalFlow`, `flow(arc)`, `flows(arcs)`,
`getSourceSideMinCut()`, and `getSinkSideMinCut()`.

`SimpleMinCostFlow` exposes:

- `SimpleMinCostFlowStatus`: `NOT_SOLVED`, `OPTIMAL`, `FEASIBLE`, `INFEASIBLE`,
  `UNBALANCED`, `BAD_RESULT`, `BAD_COST_RANGE`, `BAD_CAPACITY_RANGE`
- `addArcWithCapacityAndUnitCost(tail, head, capacity, unitCost): number`
- `addArcsWithCapacityAndUnitCost(tails, heads, capacities, unitCosts): number[]`
- `setArcCapacity(arc, capacity): void`
- `setArcCapacities(arcs, capacities): void`
- `setNodeSupply(node, supply): void`
- `setNodesSupplies(nodes, supplies): void`
- `setPriceScaling(enabled): void` (default `true`)
- `numNodes()`, `numArcs()`, `tail(arc)`, `head(arc)`, `capacity(arc)`
- `supply(node)`, `unitCost(arc)`
- `solve(options?): Promise<MinCostFlowResult>`
- pass `maxFlowWithMinCost: true` to request maximum flow with minimum cost

`MinCostFlowResult` exposes `status`, `optimalCost`, `maximumFlow`, `flow(arc)`,
and `flows(arcs)`.

With price scaling enabled, native min-cost flow guarantees the integer-cost
optimum. Disabling it permits a native 1-optimal solution: an optimum for costs
perturbed by at most one per arc. This can accommodate larger integer costs;
native range checks and status values remain unchanged. The result's
`optimalCost` field retains its native name and reflects the returned flow's
cost. The setting applies to both ordinary and maximum-flow-with-minimum-cost
solves.

`SimpleLinearSumAssignment` exposes:

- `SimpleLinearSumAssignmentStatus`: `OPTIMAL`, `INFEASIBLE`, `POSSIBLE_OVERFLOW`
- `addArcWithCost(leftNode, rightNode, cost): number`
- `addArcsWithCost(leftNodes, rightNodes, costs): number[]`
- `numNodes(): number`
- `numArcs(): number`
- `leftNode(arc): number`
- `rightNode(arc): number`
- `cost(arc): bigint`
- `solve(options?): Promise<LinearSumAssignmentResult>`

`LinearSumAssignmentResult` exposes `status`, `optimalCost`, `rightMate(leftNode)`,
and `assignmentCost(leftNode)`.

Network Flow algorithms are single-threaded, so there is no solver thread-count
parameter. A worker solve can be cancelled by terminating its worker; the
underlying direct native solve has no cancellation hook. The singleton direct
and worker executors each reject overlapping jobs. Server solves use independent
snapshots, including calls sharing one builder, subject to server admission.
Lifecycle events use the same
`SolverJobEvent` shape as CP-SAT.
