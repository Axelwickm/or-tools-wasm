# or-tools-wasm - solve complex constraint problems in browser

Solve complex optimization models directly in the browser with Google OR-Tools
running as multithreaded WebAssembly.

## [Click here to Try Online](https://axelwickman.com/or-tools-wasm?utm_source=or-tools-wasm&utm_medium=readme&utm_campaign=try_online)

Used in [PragmaPlanner](https://pragmaplanner.com/?utm_source=or-tools-wasm&utm_medium=readme&utm_campaign=used_in).

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

## Install

```sh
npm install or-tools-wasm
```

```ts
import { CpSat } from 'or-tools-wasm';
```

Currently supported solvers: CP-SAT, routing, MPSolver with the GLOP LP and
SAT MIP backends, MathOpt with GLOP, CP-SAT, and PDLP through its unified solve
request path, and a direct PDLP runtime.

## Solver coverage

| OR-Tools solver | or-tools-wasm | Description |
| --- | --- | --- |
| CP-SAT | ✅ | Constraint and integer optimization for Boolean, integer, scheduling, and logical models. |
| Routing | ✅ | Vehicle routing, TSP, pickup-delivery, capacity, dimension, and time-window search. |
| MPSolver API | ✅ | Linear and mixed-integer programming wrapper; this package includes GLOP LP and SAT MIP backends. |
| MathOpt API | ✅ | Unified modeling and solve API; this package includes GLOP, CP-SAT, and PDLP backends. |
| GLOP | ✅ | Google's simplex linear programming solver. |
| PDLP | ✅ | First-order LP and convex diagonal quadratic solver for very large models. |
| SAT integer programming | ✅ | CP-SAT-backed integer programming backend for pure integer linear models. |
| CLP |  | COIN-OR linear programming backend. |
| GLPK |  | GNU linear and mixed-integer programming backend. |
| SCIP / GSCIP |  | SCIP-based LP, MIP, and nonconvex integer quadratic backend. |
| CBC |  | COIN-OR branch-and-cut mixed-integer programming backend. |
| HiGHS |  | Linear and mixed-integer programming backend. |
| BOP |  | Boolean optimization backend for mostly Boolean integer models. |
| Knapsack |  | Dedicated knapsack mixed-integer programming backend. |
| Gurobi |  | Commercial LP, MIP, and nonconvex integer quadratic backend. |
| CPLEX |  | Commercial linear and mixed-integer programming backend. |
| XPRESS |  | Commercial LP, MIP, and nonconvex integer quadratic backend. |
| COPT |  | Commercial linear and mixed-integer programming backend exposed by MPSolver. |
| OSQP |  | Continuous convex quadratic programming backend exposed by MathOpt. |
| ECOS |  | Conic optimization backend exposed by MathOpt. |
| SCS |  | First-order conic optimization backend exposed by MathOpt. |
| Santorini |  | MathOpt reference MIP solver, intended for testing rather than production. |
| Network flow algorithms |  | Max-flow and min-cost-flow graph optimization algorithms. |
| Assignment algorithms |  | Linear-sum assignment and related assignment optimization algorithms. |

Verified with:

- Vite 7 in browser contexts
- Webpack 5 in browser contexts
- Rollup 4 static browser builds
- Node 22 runtime solves
- Deno runtime solves
- Bun runtime solves

The TypeScript API intentionally mirrors the public OR-Tools API shape where it
maps cleanly to WebAssembly, so upstream examples and tests are useful contract
references. CP-SAT stays proto-first, while routing exposes familiar
`RoutingIndexManager`, `RoutingModel`, callback, dimension, and search-parameter
entry points. MPSolver exposes the familiar `pywraplp`-style solver, variable,
constraint, objective, and parameter entry points for linear and mixed-integer
models. MathOpt exposes a TypeScript model builder that serializes native
MathOpt solve requests.

## What is included

- A CP-SAT, routing, MPSolver, and MathOpt WebAssembly runtime built with
  Emscripten pthread support.
- A TypeScript API for solving, validating models, interrupting solves, and
  reading embedded proto schemas.
- An OR-Tools-style routing API for `RoutingIndexManager`, `RoutingModel`,
  transit callbacks, search parameters, and solution traversal.
- An OR-Tools-style MPSolver API for `MPSolver`, `MPSolverParameters`,
  `MPVariable`, `MPConstraint`, and `MPObjective` using GLOP and SAT.
- A MathOpt API for building linear models and solving them through GLOP or
  CP-SAT.
- A worker bridge for keeping browser UI threads responsive while solving.
- Generated TypeScript definitions for SAT parameters.
- Demo pages for CP-SAT, routing, MPSolver, MathOpt, and schema inspection.

This flow is verified with Vite, Webpack, and Rollup. The worker script and
WebAssembly files are emitted automatically from the package import, with no
manual copying into `public/` or `static/` required.

## Usage

The smallest flow is: create or serialize an OR-Tools proto model, validate it,
then solve it. The same package also exposes routing, MPSolver, and MathOpt APIs;
see the online demos for complete examples of those solvers.

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

## Browser hosting requirements

This package uses a threaded WebAssembly runtime. Browser pages that load it
must be served with cross-origin isolation enabled:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, browsers may block the `SharedArrayBuffer` APIs required
by Emscripten pthreads, and solving can fail during WebAssembly runtime or
worker startup.

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

### Vite

For Vite apps, keep `or-tools-wasm` out of dependency optimization so Vite
handles the worker and WebAssembly URLs through its normal asset pipeline.
`protobufjs` is CommonJS, so include it in dependency optimization. The worker
runtime also needs ES module worker output:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    include: ['protobufjs'],
    exclude: ['or-tools-wasm'],
  },
  worker: {
    format: 'es',
  },
});
```

### Webpack

For Webpack 5, enable async WebAssembly, emit `.wasm` files as resources, and
use `publicPath: 'auto'` so worker and WebAssembly URLs resolve from the emitted
bundle location:

```js
// webpack.config.cjs
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

module.exports = {
  output: {
    publicPath: 'auto',
  },
  experiments: {
    asyncWebAssembly: true,
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
    ],
  },
  devServer: {
    headers,
  },
};
```

### Rollup

Rollup core does not bundle module workers or emit `new URL(...,
import.meta.url)` assets by itself. The verified fixture uses Rollup's standard
plugin surface for those features:

```js
// rollup.config.mjs
import { nodeResolve } from '@rollup/plugin-node-resolve';
import OMT from '@surma/rollup-plugin-off-main-thread';
import { importMetaAssets } from '@web/rollup-plugin-import-meta-assets';

function moduleRelativeFileUrls() {
  return {
    name: 'module-relative-file-urls',
    resolveFileUrl({ fileName }) {
      return `new URL(${JSON.stringify(fileName)}, import.meta.url).href`;
    },
  };
}

export default {
  input: 'src/main.js',
  output: {
    dir: 'dist',
    format: 'es',
  },
  plugins: [
    nodeResolve({ browser: true }),
    moduleRelativeFileUrls(),
    OMT(),
    importMetaAssets(),
  ],
};
```

Other modern bundlers may also work if they support module workers and
WebAssembly asset emission, but they are not yet officially verified.

## Threading model

The WebAssembly runtime is built with Emscripten pthread support. When the
runtime starts, Emscripten creates a pthread worker pool sized from
`navigator.hardwareConcurrency`. This pool is separate from CP-SAT's own search
worker setting.

`SatParameters.numSearchWorkers` controls how many CP-SAT search workers the
solver should use for a solve. It does not change how many Emscripten pthread
workers are created when the WebAssembly runtime is initialized.

By default, browser solves run through the package's worker bridge. The bridge
loads the solver runtime in a dedicated JavaScript worker, so the browser's
main thread remains available for rendering, input, progress UI, and
cancellation. If the worker bridge is disabled, solving runs directly on the
main thread. The solver still works, but the GUI can freeze until the solve
returns because the browser cannot repaint or process UI events during the
synchronous WebAssembly call.

## Local development

```sh
npm install
npm run dev
```

`npm run dev` / `npm run start` builds the library and launches the Vite dev
server for the demo site.

## Build

```sh
npm run build
npm run preview
```

`npm run build` runs the full pipeline: Emscripten/CMake builds the low-level
WebAssembly runtime, Vite builds the package bundle, and Vite builds the static
demo site.

The Emscripten SDK is tracked as a pinned `emsdk` git submodule. The build
script initializes that submodule automatically if needed, so a normal clone can
run `npm run build` directly after `npm install`. If you prefer to fetch
submodules up front, clone with `--recurse-submodules` or run
`git submodule update --init --recursive`.

## npm scripts

- `npm run build:wasm` rebuilds the WebAssembly runtimes via emsdk + CMake.
- `npm run build:lib` regenerates SAT parameter types, type-checks with `tsc`, and builds the library bundle with `vite.lib.config.ts`.
- `npm run build:site` builds the demo site with `vite.site.config.ts`. The site imports `or-tools-wasm` directly, so Vite emits the worker/runtime/wasm assets from the package bundle automatically.
- `npm run build` runs `build:wasm`, `build:lib`, and `build:site`.
- `npm run preview` serves the already-built Vite site from `build/javascript/site`.
- `npm run clean` removes the entire `build/` tree.
- `npm run pack:lib` rebuilds the library bundle and writes an npm tarball into `build/javascript/lib`.

## Project layout

- `javascript/lib` contains the TypeScript package API and worker bridge.
- `javascript/lib/runtime_loader.ts` loads solver-specific browser runtimes and the compatibility runtime used by Node, Deno, and Bun.
- `javascript/lib/worker_bridge.ts` owns the hidden browser worker bridge used by browser solves.
- `javascript/lib/worker_protocol.ts` defines the internal worker message protocol shared by solvers.
- `javascript/site` contains the demo pages.
- `javascript/cp_sat_api.cc` contains the CP-SAT C++ binding layer compiled into WebAssembly.
- `javascript/routing_api.cc` contains the routing C++ binding layer compiled into WebAssembly.
- `javascript/mp_solver_api.cc` contains the MPSolver C++ binding layer compiled into WebAssembly.
- `javascript/mathopt_api.cc` contains the MathOpt C++ solve-request bridge compiled into WebAssembly.
- `scripts/embed_proto.cmake` embeds CP-SAT proto schemas into the runtime.
- `scripts/generate_sat_parameters_types.mjs` generates TypeScript SAT parameter definitions.
- `vite.lib.config.ts` builds the distributable JS package.
- `vite.site.config.ts` builds the demo site.

## Demos

- The Magic Square and Sports Scheduling pages let users pick a CP-SAT search worker count; that value becomes `SatParameters.num_search_workers`, clamped to `min(navigator.hardwareConcurrency, 8)`.
- Each demo exposes a "Use worker bridge" checkbox. Keep it enabled for interactive use; disabling it runs the solve on the main browser thread and can freeze the GUI until CP-SAT returns.
- Schema Viewer imports the bundled `CpSat` API automatically; no extra script ordering is required.

## JSPI and Asyncify

The package ships separate browser runtime builds so importing one solver does
not force every solver runtime into the first solve path:

- Each solver has a JSPI runtime and an Asyncify runtime.
- The browser package loads the selected solver runtime on demand and passes the emitted `.wasm` asset to Emscripten explicitly, so bundlers do not need root-relative wasm files.
- Node uses the node-targeted runtime builds.
- Deno and Bun use the web-hosted Asyncify runtimes because their JSPI support is not compatible with these Emscripten runtimes yet.

For CP-SAT, `javascript/lib/runtime_loader.ts` chooses the runtime at startup.
If `WebAssembly.promising` is available, it imports the JSPI runtime, which is
the more modern and faster path. Otherwise it falls back to the Asyncify
runtime. Both paths expose the same TypeScript API, so application code does
not need to choose one manually. Current browser support for JSPI is tracked at
[caniuse.com/wf-wasm-jspi](https://caniuse.com/wf-wasm-jspi).

Browser solves use the hidden worker bridge by default. Routing transit
callbacks are precomputed into a serializable transit matrix before being sent
to that worker, so application code does not manage worker wiring. The worker
tries the JSPI runtime first and falls back to Asyncify if the browser reports a
JSPI suspend error.

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
