# or-tools-wasm - Google OR-Tools for WebAssembly

Solve complex optimization models from TypeScript with Google OR-Tools running
as multithreaded WebAssembly.

[![GitHub](https://img.shields.io/badge/GitHub-or--tools--wasm-181717?logo=github)](https://github.com/Axelwickm/or-tools-wasm)
[![npm](https://img.shields.io/npm/v/or-tools-wasm?logo=npm&label=npm)](https://www.npmjs.com/package/or-tools-wasm)

[![Package](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml/badge.svg)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
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
[![Node 22](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Node%2022&nameFilter=Node%2022%20%2F%20solve)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Deno](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Deno&nameFilter=Deno%20%2F%20solve)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)
[![Bun](https://img.shields.io/github/check-runs/Axelwickm/or-tools-wasm/stable?label=Bun&nameFilter=Bun%20%2F%20solve)](https://github.com/Axelwickm/or-tools-wasm/actions/workflows/package.yml)

[Try online in your browser](https://axelwickman.com/or-tools-wasm?utm_source=or-tools-wasm&utm_medium=readme&utm_campaign=try_online)

Used in [PragmaPlanner](https://pragmaplanner.com/?utm_source=or-tools-wasm&utm_medium=readme&utm_campaign=used_in).

<p>
  <img src="docs/media/network_design.gif" alt="Network design optimization in PragmaPlanner" width="24%">
  <img src="docs/media/vrp.gif" alt="Vehicle routing optimization in PragmaPlanner" width="24%">
  <img src="docs/media/steel_mill_slab.png" alt="Steel mill slab optimization in PragmaPlanner" width="24%">
</p>
<p>
  <img src="docs/media/factory_floor.gif" alt="Factory floor optimization in PragmaPlanner" width="48%">
  <img src="docs/media/sudoku.gif" alt="Sudoku optimization example in PragmaPlanner" width="24%">
</p>

## Usage

Run the local test site:

```sh
npm install
npm run dev
```

Install from npm:

```sh
npm install or-tools-wasm
```

Import the solver API you need from its subpath:

```ts
import { CpSat } from 'or-tools-wasm/cp-sat';
```

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

Create or serialize an OR-Tools proto model, validate it, then solve it:

```ts
const model = {
  name: 'choose_one',
  variables: [
    { name: 'x', domain: [0, 1] },
    { name: 'y', domain: [0, 1] },
  ],
  constraints: [
    {
      name: 'exactly_one',
      linear: {
        vars: [0, 1],
        coeffs: [1, 1],
        domain: [1, 1],
      },
    },
  ],
  objective: {
    vars: [0, 1],
    coeffs: [1, 2],
  },
};

const modelBytes = await CpSat.createModel(model);
const validation = await CpSat.validate(modelBytes);

if (!validation.ok) {
  throw new Error(validation.message);
}

const result = await CpSat.solve(modelBytes, {
  numSearchWorkers: 1,
});

console.log(result.response);
```

## Supported OR-Tools surface

| OR-Tools surface | or-tools-wasm | Description |
| --- | --- | --- |
| CP-SAT | ✅ | Constraint and integer optimization for Boolean, integer, scheduling, and logical models. |
| Routing | ✅ | Vehicle routing, TSP, pickup-delivery, capacity, dimension, and time-window search. |
| MPSolver API | ✅ | Linear and mixed-integer programming wrapper; this package includes GLOP LP, CLP LP, GLPK LP/MIP, SCIP MIP, CBC MIP, BOP MIP, Knapsack MIP, and SAT MIP backends. |
| MathOpt API | ✅ | Unified modeling and solve API; this package includes GLOP, GLPK, GSCIP, CP-SAT, and PDLP backends. |
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
| Linear Solver ModelBuilder |  | Python-like `linear_solver.model_builder` API for ergonomic LP/MIP modeling, import/export helpers, and backend solve helpers. |
| MathOpt incremental/callback APIs | ✅ | Incremental solving is exposed for MathOpt models with tracked updates for common LP/MIP model edits, rejected-update fallback, repeated LP updates, and GSCIP incremental message logging. Indicator constraints, message callbacks, solve interrupters, common solve parameters, typed model solve parameters with solve filters, Python-style solve-result accessors including ray/basis helpers for real solve results, `removeNames` duplicate-name solving, and typed backend parameters for GSCIP, GLOP, CP-SAT, PDLP, and GLPK are exposed. Python-only context managers and constructed result parser/proto-object helpers are outside the current TypeScript contract. |

Unchecked rows are planned OR-Tools targets that are not exposed by this package
yet. Commercial and large third-party native backends such as Gurobi, CPLEX,
XPRESS, HiGHS, OSQP, ECOS, and SCS are not planned.

The TypeScript API mirrors the public OR-Tools API shape where it maps cleanly
to WebAssembly. CP-SAT exposes both a Python-like high-level builder and the
proto-first `CpSat` API, routing exposes the familiar `RoutingIndexManager` and
`RoutingModel` APIs, MPSolver exposes the `pywraplp`-style solver API, and
MathOpt exposes a TypeScript model builder.

The worker script and WebAssembly files are emitted automatically from package
imports, with no manual copying into `public/` or `static/` required.

## Fixture test matrix

`npm run test:fixtures` is the full fixture matrix. It runs the shared solver
cases through Vite, Webpack, Rollup, Deno, Node, and Bun. Browser fixtures cover
dev and static serving where the bundler supports both, Chromium and Firefox,
direct runtime execution, the browser worker bridge, and solver thread settings
where the solver supports them.

For focused iteration, use `npm run test:fixtures:browser`,
`npm run test:fixtures:runtime`, or an individual fixture script such as
`npm run test:fixture:node`. The full matrix is the comprehensive check before
landing solver API, worker bridge, threading, or packaging changes.

## API reference

See [docs/api.md](docs/api.md) for the full TypeScript API reference covering
CP-SAT, routing, MPSolver, MathOpt, PDLP, RCPSP, worker behavior, generated
protobuf types, and native object cleanup.

## Browser requirements

Browser builds use WebAssembly threads, SIMD, and `SharedArrayBuffer`. Pages
must be served with cross-origin isolation enabled:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, browsers may block `SharedArrayBuffer`, and solving can
fail during WebAssembly runtime or worker startup.

Browser solves can run through a hidden worker bridge, so the main thread stays
available for rendering, input, progress UI, and cancellation. The shared worker
bridge controls apply across CP-SAT, routing, MPSolver, Knapsack, Network Flow,
Set Cover, RCPSP, MathOpt, and PDLP:

```ts
import { isWorkerBridgeEnabled, setWorkerBridgeEnabled } from 'or-tools-wasm/cp-sat';

setWorkerBridgeEnabled(true);
console.log(isWorkerBridgeEnabled());
```

Worker bridge support is separate from solver threading. For example, GLPK and
BOP are single-threaded in this package but can still run through the browser
worker bridge, while CP-SAT, SAT, SCIP/GSCIP, CBC, RCPSP, and other
threaded-capable paths may also accept solver thread settings. Knapsack and
Network Flow can run through the worker bridge but do not expose solver thread
settings. Set Cover is also single-threaded and worker-bridge capable. The package loads solver
runtimes on demand; application code does not need to choose between JSPI and
Asyncify manually.

For Vite dev and preview servers, set the headers in `vite.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
```

## Bundler configuration

See [docs/bundlers.md](docs/bundlers.md) for Vite, Webpack, and Rollup setup.

## Node, Deno, and Bun

Node and Bun work with normal ESM imports and do not need browser
cross-origin-isolation headers.

Deno needs permissions to read package assets and inspect CPU count:

```sh
deno run --allow-read --allow-sys=cpus your-script.ts
```

Deno and Bun use the Asyncify runtime path. Node uses JSPI when available and
falls back to Asyncify otherwise.

## Development

```sh
npm install
npm run dev
npm run build
npm run preview
```

`npm run dev` / `npm run start` builds the library and launches the demo site.
`npm run build` runs the full WebAssembly, package, and static site build.

The Emscripten SDK is tracked as a pinned `emsdk` git submodule. The build
script initializes that submodule automatically if needed, so a normal clone can
run `npm run build` directly after `npm install`. If you prefer to fetch
submodules up front, clone with `--recurse-submodules` or run
`git submodule update --init --recursive`.

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
