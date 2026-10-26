# RCPSP API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/rcpsp.ts).

The RCPSP API provides a project scheduling builder and a parser for standard
PSPLIB single/multimode files. It translates projects into native CP-SAT
constraints. It is not a binding for every format accepted by Python's
`ortools.scheduling.python.rcpsp` parser.

```ts
import { RcpspModelBuilder } from 'or-tools-wasm/rcpsp';

const project = new RcpspModelBuilder('house_project')
  .addResource({ name: 'crew', capacity: 3 })
  .addActivity({ name: 'site', duration: 3, demands: { crew: 2 }, successors: ['frame'] })
  .addActivity({ name: 'permit', duration: 2, demands: { crew: 1 }, successors: ['wire'] })
  .addActivity({ name: 'frame', duration: 4, demands: { crew: 2 }, successors: ['inspect'] })
  .addActivity({ name: 'wire', duration: 2, demands: { crew: 1 }, successors: ['inspect'] })
  .addActivity({ name: 'inspect', duration: 1, demands: { crew: 1 } })
  .build();

const result = await project.solve({
  numWorkers: 4,
  maxTimeInSeconds: 5,
  executor: 'worker',
});
console.log(result.statusName, result.makespan, result.tasks);
```

RCPSP reuses the CP-SAT solve path instead of loading a separate native runtime.
The runtime is loaded lazily by `solve()`, and `executor` is selected per call.

`RcpspModelBuilder` exposes:

- `addResource({ name, capacity, renewable? })`
- `addActivity({ name, duration, demands?, successors? })`
- `build(): RcpspProblem`

Builder and parsed RCPSP quantities are safe-integer `number` values; unsafe
numbers and unsafe aggregate demands/horizons are rejected instead of being
rounded. Builder inputs are captured, rejected resources reserve no name, and
`source`/`sink` are reserved activity names. Solved schedule times are exact `bigint` values.

`RcpspProblem` exposes:

- `new RcpspProblem(proto?: RcpspProblemProto)`
- `RcpspProblem.fromProto(proto)`
- `RcpspProblem.fromPsplib(text)`
- properties: `name`, `resources`, `tasks`, `horizon`
- `exportModelAsProto()`
- `toCpSatModel()`
- `solve(options?: RcpspSolveOptions): Promise<RcpspSolveResult>`

`RcpspSolveResult` contains:

- `status` and `statusName`
- `makespan` as an exact `bigint`, or `null` when no schedule was found
- `objectiveValue`
- scheduled `tasks` with exact `bigint` `start` and `end` values, plus `name`,
  `id`, zero-based `selectedRecipe`, `duration`, `demands`, and `successors`
- `resourceCapacities` as exact `bigint` values for resource investment, otherwise `null`
- the native CP-SAT `response`

Use `problem.toCpSatModel()` for the generated CP-SAT model. Each `solve()` builds
an independent model and callback state; concurrent calls obey executor limits.

Pass file contents directly to `RcpspProblem.fromPsplib(text)` to get a reusable
problem. The parser supports one project with renewable and nonrenewable
resources. Multiple projects, doubly constrained resources and other native
RCPSP text formats reject. Native filesystem helpers are not exposed.

## Problem input and variants

`RcpspProblemProto` is an object input, not serialized protobuf bytes.
Construction copies and validates it. `resources`, `tasks` and
`exportModelAsProto()` return independent objects. `toCpSatModel()` returns a
new editable `CpModel`, which can be customized and solved through CP-SAT.

| Input | Fields and meaning |
| --- | --- |
| `RcpspResourceProto` | `name`, `maxCapacity`, `minCapacity`, `renewable` (default true), `unitCost` |
| `RcpspTaskProto` | `name`, `successors` (zero-based task IDs), `recipes`, `successorDelays` |
| `RcpspRecipeProto` | `duration`, `demands`, optional `resources` mapping demands to resource IDs |
| Problem controls | `name`, `horizon`, `deadline`, `isRcpspMax`, `isConsumerProducer`, `isResourceInvestment` |

Without recipe `resources`, demands follow resource order. Multiple recipes
select exactly one mode for a task. Renewable capacity limits concurrent use.
Nonrenewable capacity limits total selected demand across the project.

With `isRcpspMax`, `successorDelays[edge].recipeDelays[recipe].minDelays[successorRecipe]`
is the minimum start-to-start delay for that recipe pair. There must be one
matrix per successor, one row per source recipe and one column per successor
recipe. Without this flag, successors follow ordinary finish-to-start precedence.

The ordinary objective is makespan. `horizon` bounds schedule times and is
derived when omitted. A positive `deadline` also bounds task ends. Metadata
`releaseDate`, `dueDate`, `tardinessCost`, `mpmTime`, `seed` and `basedata` is
preserved by object import/export but does not add constraints, change the
objective or configure CP-SAT. Add custom requirements to `toCpSatModel()`.

`RcpspModelBuilder` builds ordinary projects. `RcpspProblem.fromProto()` also
supports multimode recipes, nonrenewable budgets, and recipe-dependent
RCPSP/Max start-to-start delays (including negative delays).

- With `isConsumerProducer: true`, all resources use reservoir level bounds
  `minCapacity` / `maxCapacity`. Tasks have zero duration and signed demands
  at their starts; only the selected recipe contributes. Simultaneous events
  are aggregated. Bounds excluding zero require sufficient events at time zero.
  A fixed time-zero offset translates these bounds into native reservoir bounds.
- With `isResourceInvestment: true`, native cumulative constraints use decision
  capacities and the objective is `sum(unitCost * capacity)`. Every task finishes
  by `deadline`; zero is a literal deadline for this variant. `maxCapacity: -1`
  uses the sum of each task's largest recipe demand as the capacity upper bound.
  Resources are renewable for investment, and unit costs must be nonnegative.
  `makespan` still reports the maximum task end but is not minimized.

```ts
import { RcpspProblem } from 'or-tools-wasm/rcpsp';

const investment = RcpspProblem.fromProto({
  isResourceInvestment: true,
  deadline: 2,
  resources: [{ maxCapacity: -1, unitCost: 4 }],
  tasks: [
    { recipes: [{ duration: 2, demands: [2] }] },
    { recipes: [{ duration: 2, demands: [3] }] },
  ],
});
const purchased = await investment.solve({ executor: 'worker', numWorkers: 1 });
console.log(purchased.statusName, purchased.resourceCapacities, purchased.objectiveValue);
// OPTIMAL, [5n], 20
```

Solution events include `tasks`, `makespan`, `objectiveValue` and
`resourceCapacities` with the same meanings as the final result. These variants
share CP-SAT's direct, worker and server execution path; no separate scheduling
search is implemented by the library.

## Solve options and events

`RcpspSolveOptions` combines CP-SAT parameters with `executor`, `signal`,
`eventMask` and `onEvent`. It does not accept a `CpSolverSolutionCallback`.
Use `onEvent` to receive schedules. With an observer and no explicit mask,
solution, best-bound and log events are enabled. `RcpspEventMask` uses the
CP-SAT fields `{ solution?, bestBound?, log? }`.

Independent calls may share a `RcpspProblem`. The chosen executor still controls
concurrency and cancellation. On an unsuccessful solve, `tasks` is empty and
`makespan`, `objectiveValue` and `resourceCapacities` are null. Check `statusName`
before using a schedule. `asNumber()` is exported for checked conversion of
bigint times and capacities.
