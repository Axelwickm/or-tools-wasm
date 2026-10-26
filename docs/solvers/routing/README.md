# OR-Tools Routing for JavaScript

[![npm: routing-wasm](https://img.shields.io/npm/v/routing-wasm?logo=npm&label=routing-wasm)](https://www.npmjs.com/package/routing-wasm)

**Install:**

```sh
npm install routing-wasm
```

[**Main repository**](https://github.com/Axelwickm/or-tools-wasm) · [Documentation](https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/README.md) · [Full library on npm](https://www.npmjs.com/package/or-tools-wasm) · [Google OR-Tools](https://github.com/google/or-tools)

> [!TIP]
> **Same API. Fast solves on any device.**
>
> [Sign up for the hosted cloud version](https://or-tools-wasm-api.axelwickman.com/info).

Build delivery route planners, courier dispatch tools, and field-service schedules
in JavaScript or TypeScript. Solve traveling salesman (TSP) and vehicle routing
(VRP) problems with capacity limits, time windows, and pickup and delivery stops.
Runs locally in your browser or Node.js, with no solver server required.

The same API as `or-tools-wasm/routing`, in a smaller standalone package.

## Installation

```sh
npm install routing-wasm
```

The package includes TypeScript declarations and Routing's native solver
dependencies. No separate CP-SAT package is required.

### Browser import with jsDelivr

Replace `VERSION` with an exact published version:

```html
<script type="module">
  import { RoutingIndexManager, RoutingModel } from 'https://cdn.jsdelivr.net/npm/routing-wasm@VERSION/build/javascript/browser/routing.js';
</script>
```

For a direct CDN import, use Server execution with
`executor: { type: 'server', url: 'http://localhost:17827' }`.
For local WASM execution, use npm and a bundler or serve package assets from your
own origin so browser workers can load. See
[CDN and browser setup](https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/setup.md#import-from-jsdelivr).

## Quick start

```ts
import { RoutingIndexManager, RoutingModel } from 'routing-wasm';

const distances = [[0, 2, 3], [2, 0, 1], [3, 1, 0]];
const manager = new RoutingIndexManager(3, 1, 0);
const routing = new RoutingModel(manager);
const transit = routing.registerTransitCallback((from, to) =>
  distances[manager.indexToNode(from)][manager.indexToNode(to)]);
routing.setArcCostEvaluatorOfAllVehicles(transit);
const result = await routing.solve({ executor: 'worker' });
console.log(result);
```

## Execution

Use `executor: 'direct'` for in-process execution, or
`executor: { type: 'server', url: 'http://localhost:17827' }` for an OR-Tools solver server. Server solves do not load local WASM.

Browser local execution requires cross-origin isolation (COOP/COEP headers).
Worker execution keeps solving off the application's main thread.

The runtime uses **JSPI** when supported and automatically falls back to
**Asyncify** when JSPI is unavailable. Both runtimes are included in the package.
Only the selected runtime is loaded.

When shutting down a Node application after direct execution, call
`terminateLoadedRuntimeThreads()` to release retained runtime threads.

The existing `or-tools-wasm/routing` import remains supported. Choose either distribution; installing both duplicates runtime assets. Model objects should be used with the API that created them.

## Reference and examples

- [Routing API reference](api.md) — model building, solving, results and proto access.
- [Browser setup](https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/setup.md#browser-requirements) and [server configuration](https://github.com/Axelwickm/or-tools-wasm/blob/main/server/README.md).
- [Simple Routing](https://axelwickman.com/or-tools-wasm/routing_simple.html), [Vehicle Routing Problem](https://axelwickman.com/or-tools-wasm/routing_vrp.html) and [Dispatch Map](https://axelwickman.com/or-tools-wasm/routing_dispatch.html).
