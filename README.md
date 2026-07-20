# Google OR-Tools for Web

Solve complex optimization models from TypeScript with Google OR-Tools running
as multithreaded WebAssembly.

[![GitHub](https://img.shields.io/badge/GitHub-or--tools--wasm-181717?logo=github)](https://github.com/Axelwickm/or-tools-wasm)
[![npm](https://img.shields.io/npm/v/or-tools-wasm?logo=npm&label=npm)](https://www.npmjs.com/package/or-tools-wasm)

[![Package](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml/badge.svg)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Native Server](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/server.yml/badge.svg)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/server.yml)
[![Vite 7 dev Chromium](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Vite%207%20dev%20Chromium&nameFilter=Vite%207%20%2F%20dev%20%2F%20chromium)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Vite 7 dev Firefox](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Vite%207%20dev%20Firefox&nameFilter=Vite%207%20%2F%20dev%20%2F%20firefox)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Vite 7 static Chromium](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Vite%207%20static%20Chromium&nameFilter=Vite%207%20%2F%20static%20%2F%20chromium)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Vite 7 static Firefox](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Vite%207%20static%20Firefox&nameFilter=Vite%207%20%2F%20static%20%2F%20firefox)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Webpack 5 dev Chromium](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Webpack%205%20dev%20Chromium&nameFilter=Webpack%205%20%2F%20dev%20%2F%20chromium)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Webpack 5 dev Firefox](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Webpack%205%20dev%20Firefox&nameFilter=Webpack%205%20%2F%20dev%20%2F%20firefox)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Webpack 5 static Chromium](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Webpack%205%20static%20Chromium&nameFilter=Webpack%205%20%2F%20static%20%2F%20chromium)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Webpack 5 static Firefox](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Webpack%205%20static%20Firefox&nameFilter=Webpack%205%20%2F%20static%20%2F%20firefox)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Rollup 4 static Chromium](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Rollup%204%20static%20Chromium&nameFilter=Rollup%204%20%2F%20static%20%2F%20chromium)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Rollup 4 static Firefox](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Rollup%204%20static%20Firefox&nameFilter=Rollup%204%20%2F%20static%20%2F%20firefox)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Node 24.12.0](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Node%2024.12.0&nameFilter=Node%2024.12.0%20%2F%20solve)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Deno 2.8.1](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Deno%202.8.1&nameFilter=Deno%202.8.1%20%2F%20solve)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Bun 1.3.14](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Bun%201.3.14&nameFilter=Bun%201.3.14%20%2F%20solve)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)

[Try online in your browser](https://axelwickman.com/or-tools-wasm?utm_source=or-tools-wasm&utm_medium=readme&utm_campaign=try_online)

Used in [PragmaPlanner](https://pragmaplanner.com/?utm_source=or-tools-wasm&utm_medium=readme&utm_campaign=used_in)

<p>
  <img src="docs/media/factory_floor.gif" alt="Factory floor optimization in PragmaPlanner" height="180">
  <img src="docs/media/sudoku.gif" alt="Sudoku optimization example in PragmaPlanner" height="180">
</p>
<p>
  <img src="docs/media/network_design.gif" alt="Network design optimization in PragmaPlanner" height="160">
  <img src="docs/media/vrp.gif" alt="Vehicle routing optimization in PragmaPlanner" height="160">
  <img src="docs/media/steel_mill_slab.png" alt="Steel mill slab optimization in PragmaPlanner" height="160">
</p>

## Usage

Install from npm:

```sh
npm install or-tools-wasm
```

Run the local test site:

```sh
npm --prefix javascript install
npm --prefix javascript run dev
```

> [!WARNING]
> Browser builds require cross-origin isolation headers for WebAssembly threads.
> See [Browser requirements](#browser-requirements) below.

Public solver APIs live under solver-scoped subpaths:

```ts
import { CpModel, CpSolver } from 'or-tools-wasm/cp-sat';
import { RoutingIndexManager, RoutingModel } from 'or-tools-wasm/routing';
import { MPSolver } from 'or-tools-wasm/mp-solver';
import { MathOpt } from 'or-tools-wasm/mathopt';
import { Pdlp } from 'or-tools-wasm/pdlp';
import { KnapsackSolver } from 'or-tools-wasm/knapsack';
import { SimpleMaxFlow } from 'or-tools-wasm/network-flow';
import { SetCoverModel } from 'or-tools-wasm/set-cover';
import { RcpspModelBuilder } from 'or-tools-wasm/rcpsp';
```

Build a CP-SAT model and solve it:

```ts
import { CpModel, CpSolver } from 'or-tools-wasm/cp-sat';

const model = new CpModel();

const desks = model.newIntVar(0, 4, 'desks');
const tables = model.newIntVar(0, 3, 'tables');

model.addLinearConstraint(desks.times(3).plus(tables.times(4)), 0, 12);
model.maximize(desks.times(20).plus(tables.times(30)));

const solver = new CpSolver();
const status = await solver.solve(model, { numSearchWorkers: 1 });

console.log(solver.statusName(status));
console.log({
  desks: solver.value(desks),
  tables: solver.value(tables),
  profit: solver.objectiveValue(),
});
```

Force CP-SAT to solve through its worker bridge when you want to keep solver
work off the main thread:

```ts
import { CpSat, CpModel, CpSolver } from 'or-tools-wasm/cp-sat';

CpSat.setExecutor({ type: 'worker' });

const model = new CpModel();
const x = model.newIntVar(0, 10, 'x');

model.add(x.ge(3));
model.minimize(x);

const solver = new CpSolver();
await solver.solve(model, { numWorkers: 1 });

console.log(solver.value(x));
```

## API reference

See [docs/api.md](docs/api.md) for the full TypeScript API reference.

## Benchmarking

See [benchmarking/](benchmarking/).

## Supported OR-Tools surface

| OR-Tools surface | or-tools-wasm | Description |
| --- | --- | --- |
| CP-SAT | ✅ | Constraint and integer optimization for Boolean, integer, scheduling, and logical models. |
| Routing | ✅ | Vehicle routing (VRP), TSP, pickup-delivery, capacity, dimension, and time-window search. |
| MPSolver API | ✅ | Linear and mixed-integer programming wrapper; this package includes GLOP LP, CLP LP, GLPK LP/MIP, SCIP MIP, CBC MIP, BOP MIP, Knapsack MIP, and SAT MIP backends. |
| MathOpt API | ✅ | Unified modeling and solve API with incremental solving and callback support; this package includes GLOP, GLPK, GSCIP, CP-SAT, and PDLP backends. |
| GLOP | ✅ | Google's simplex linear programming solver. |
| PDLP | ✅ | First-order LP and convex diagonal quadratic solver for very large models. |
| SAT integer programming | ✅ | CP-SAT-backed integer programming backend for pure integer linear models. |
| CLP | ✅ | COIN-OR linear programming backend. |
| GLPK | ✅ | GNU linear and mixed-integer programming backend. |
| SCIP / GSCIP | ✅ | SCIP-based mixed-integer backend through MPSolver and MathOpt. |
| CBC | ✅ | COIN-OR branch-and-cut mixed-integer programming backend through MPSolver. |
| BOP | ✅ | Boolean/integer optimization backend through MPSolver. |
| Knapsack | ✅ | Dedicated 0-1 and multi-dimensional knapsack solver, plus the MPSolver Knapsack backend. |
| Network flow algorithms | ✅ | Dedicated max-flow, min-cost-flow, and linear-sum assignment graph algorithms. |
| Assignment algorithms | ✅ | Linear-sum assignment through the dedicated Network Flow API. |
| Set cover | ✅ | Dedicated weighted set cover model, invariant, and heuristic search API. |
| RCPSP | ✅ | CP-SAT-backed resource-constrained project scheduling model, parser, and visual scheduling surface. |
| Linear Solver ModelBuilder |  | Ergonomic LP/MIP modeling API with import/export helpers and backend solve helpers. |

Unchecked rows are planned OR-Tools targets that are not exposed by this package
yet. Commercial and large third-party native backends such as Gurobi, CPLEX,
XPRESS, HiGHS, OSQP, ECOS, and SCS are not planned.

The TypeScript API mirrors the public OR-Tools Python API shape where it maps
cleanly to WebAssembly, and the fixture suite tracks Python API behavior for
the exposed solver surfaces. CP-SAT exposes both a high-level builder and the
proto-first `CpSat` API, routing exposes the familiar `RoutingIndexManager` and
`RoutingModel` APIs, MPSolver exposes the `pywraplp`-style solver API, and
MathOpt exposes a TypeScript model builder.

The worker script and WebAssembly files are emitted automatically from package
imports, with no manual copying into `public/` or `static/` required.

## Fixture test matrix

Run the full fixture matrix:

```sh
npm --prefix javascript run test:fixtures
```

This runs the shared solver cases through Vite, Webpack, Rollup, Deno, Node,
and Bun. Browser fixtures cover dev and static serving where the bundler
supports both, Chromium and Firefox, direct runtime execution, the browser
worker bridge, and solver thread settings where supported.

For focused iteration:

```sh
npm --prefix javascript run test:fixtures:browser
npm --prefix javascript run test:fixtures:runtime
npm --prefix javascript run test:fixture:node
```

Run the full matrix before landing solver API, worker bridge, threading, or
packaging changes.

## Browser requirements

Browser builds use WebAssembly threads, so pages must be served with
cross-origin isolation enabled:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, solving can fail during WebAssembly runtime or worker
startup.

See [Bundler configuration](#bundler-configuration) for Vite, Webpack, and
Rollup setup.

## Bundler configuration

See [docs/bundlers.md](docs/bundlers.md) for Vite, Webpack, and Rollup setup.

## Node, Deno, and Bun

Node and Bun work with normal ESM imports and do not need browser
cross-origin-isolation headers.

Deno needs permissions to read package assets and inspect CPU count:

```sh
deno run --allow-read --allow-sys=cpus your-script.ts
```

Node uses the JSPI runtime when `WebAssembly.promising` is available and falls
back to Asyncify otherwise. Deno and Bun use the package's Asyncify runtime
path.

## Upstream OR-Tools

This repository vendors Google OR-Tools and adds a JavaScript/WebAssembly
packaging layer on top. OR-Tools is Google's open-source suite for solving
combinatorial optimization problems, including CP-SAT, linear programming,
routing, bin packing, and graph algorithms.

Upstream project:

- Source: [github.com/google/or-tools](https://github.com/google/or-tools)
- Documentation: [developers.google.com/optimization](https://developers.google.com/optimization/)
- License: Apache License 2.0

## Maintainer

Maintained by [Axel Wickman](https://axelwickman.com).

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
