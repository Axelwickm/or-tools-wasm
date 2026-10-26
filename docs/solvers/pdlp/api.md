# PDLP API reference

[Documentation](../../README.md) · [Execution options](../../execution.md#executor-selection)

[Public exports and TypeScript signatures](../../../javascript/lib/pdlp.ts).

Import:

```ts
import { Pdlp, QuadraticProgram } from 'or-tools-wasm/pdlp';
```

PDLP exposes the primal-dual hybrid gradient solver for LP and convex diagonal
quadratic programs.

```ts
const qp = new QuadraticProgram({
  objectiveVector: [1, 2],
  variableLowerBounds: [0, 0],
  variableUpperBounds: [10, 10],
});

const result = await Pdlp.solve(qp, {
  executor: 'worker',
  terminationCriteria: { iterationLimit: 1000 },
});
```

The runtime is loaded lazily. Select `auto`, `direct`, `worker`, `server`, or
`cloud` per operation with the `executor` option. `auto` selects the default for
the current environment.

## `QuadraticProgram`

Constructor:

```ts
new QuadraticProgram(input?: QuadraticProgramInput)
```

Fields:

- `problemName`
- `objectiveOffset`
- `objectiveScalingFactor`
- `objectiveVector`
- `objectiveMatrixDiagonal`
- `constraintMatrix`
- `constraintLowerBounds`
- `constraintUpperBounds`
- `variableLowerBounds`
- `variableUpperBounds`
- `variableNames`
- `constraintNames`

Methods:

- `resizeAndInitialize(numVariables, numConstraints): void`
- `setObjectiveMatrixDiagonal(values): void`
- `clearObjectiveMatrix(): void`
- `applyObjectiveScalingAndOffset(objective): number` — returns `objectiveScalingFactor * (objective + objectiveOffset)` using the current fields.
- `toBytes(): Uint8Array`

Sparse matrix input accepts either:

```ts
{ numRows?: number; numColumns?: number; entries?: Array<{ row: number; column: number; value: number }> }
```

or a dense `number[][]`. `SparseMatrixInput` also accepts `{ dense: number[][] }`.

Solve and conversion calls capture vectors, names and initial solutions before
awaiting execution. Explicit sparse entries, including zeros, undergo native
index validation; native assembly combines duplicates. Native solves reject
nonfinite coefficients and scaling factors with `INVALID_PROBLEM`; infinite
bounds retain their usual meaning. Dimension validation checks shape only.

## `PrimalAndDualSolution`

Constructor:

```ts
new PrimalAndDualSolution({ primalSolution?: number[]; dualSolution?: number[] })
```

## `Pdlp`

- `Pdlp.QuadraticProgram`
- `Pdlp.PrimalAndDualSolution`
- `validateQuadraticProgramDimensions(qp, options?): Promise<void>`
- `isLinearProgram(qp, options?): Promise<boolean>`
- `readQuadraticProgram(input, options): Promise<QuadraticProgram>`
- `qpFromMpModelProto(proto, options?): Promise<QuadraticProgram>`
- `qpToMpModelProto(qp, options?): Promise<Uint8Array>`
- `solve(qp, options?): Promise<PdlpSolverResult>`

`readQuadraticProgram` accepts model text or `Uint8Array` with an explicit `format`:
`mps`, `proto` (binary native `MPModelProto`), `textproto` or `json` (native
`MPModelProto` representations). Binary imports require bytes. The format describes
the contents, not a filename; read a browser File/Blob or a Node file into bytes first.
Compressed files must be decompressed before import.

```ts
const qp = await Pdlp.readQuadraticProgram(mpsText, {
  format: 'mps', includeNames: true, executor: 'worker',
});
const result = await Pdlp.solve(qp, { executor: 'worker', numThreads: 1 });
```

Options also accept `relaxIntegerVariables` (default false), `includeNames`
(default false), `executor`, `signal` and `onEvent`. Names are retained only when
requested. Input bytes are snapshotted before execution. Parsing, model validation,
maximization/offset conversion and diagonal quadratic conversion use native OR-Tools
and protobuf routines. Malformed models and unsupported general constraints or
off-diagonal quadratic terms reject with errors. Integer variables require explicit
relaxation. `qpFromMpModelProto` remains available for binary conversion.

`QuadraticProgram.toBytes()` is the wrapper's structured program encoding; it is not
an `MPModelProto` file. Use `Pdlp.qpToMpModelProto(qp)` to obtain native model bytes
for a `format: 'proto'` import. See the dedicated PDLP import example on the site.


`PdlpSolveOptions` combines solver parameters with execution options:

- `terminationCriteria.iterationLimit`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalRelative`
- `terminationCriteria.simpleOptimalityCriteria.epsOptimalAbsolute`
- `terminationCheckFrequency`
- `lInfRuizIterations`
- `l2NormRescaling`
- `numThreads`

All vendored `PrimalDualHybridGradientParams` fields are typed and forwarded,
including presolve, restart, scheduler, sharding and feasibility-polishing settings.
Solve options also accept `initialSolution`, `executor`, `signal`, `onEvent` and
`eventMask: { log?, iteration? }`. Log events contain `message`; iteration events
contain detached typed `info` with iteration type/stats, termination criteria and
bound norms. Events are notifications, not callback replies. Use a worker for
responsive cancellation; native interruption is supported.

With `onEvent`, both log and iteration notifications are enabled unless their
mask field is explicitly false. For example, `eventMask: { iteration: false }`
keeps logs while avoiding iteration payloads. Without `onEvent`, neither is
requested. Native verbosity parameters still control which log messages exist.

`relaxIntegerVariables` and `includeNames` belong to import/conversion options,
not solve options.

`PdlpIterationCallbackInfo` contains `iterationType`, typed `iterationStats`,
`terminationCriteria` and `boundNorms`. The norms are
`l2NormPrimalLinearObjective`, `l2NormConstraintBounds`,
`lInfNormPrimalLinearObjective` and `lInfNormConstraintBounds`.
`PdlpIterationType` distinguishes `NORMAL`, `PRIMAL_FEASIBILITY`,
`DUAL_FEASIBILITY`, `PRESOLVE_TERMINATION`, `NORMAL_TERMINATION` and
`FEASIBILITY_POLISHING_TERMINATION`. These are iteration phases, not final solve
statuses. Use `solveLog.terminationReason` for final termination.

`PdlpSolverResult` contains:

- `primalSolution`
- `dualSolution`
- `reducedCosts`
- `solveLog`

The three solution vectors are owned `number[]` arrays in the submitted
variable/constraint order. `initialSolution` accepts either
`PrimalAndDualSolution` or a `PrimalAndDualSolutionInput` with `primalSolution`
and `dualSolution` arrays. Native validation determines whether that starting
point is accepted. `PdlpSolveParams` and `PdlpSolveLog` expose the vendored
parameter and log schemas without replacing their native stopping rules.

`solveLog` contains `terminationReason`, `iterationCount` and the native
statistics, solution metadata and optional iteration history. Inspect its
termination reason before treating returned vectors as an optimal solution.
