# OR-Tools Routing for JavaScript

[![npm: routing-wasm](https://img.shields.io/npm/v/routing-wasm?logo=npm&label=routing-wasm)](https://www.npmjs.com/package/routing-wasm)
[![npm: or-tools-wasm](https://img.shields.io/npm/v/or-tools-wasm?logo=npm&label=or-tools-wasm)](https://www.npmjs.com/package/or-tools-wasm)
[![GitHub](https://img.shields.io/badge/GitHub-or--tools--wasm-181717?logo=github)](https://github.com/Axelwickm/or-tools-wasm)

**Install:**

```sh
npm install routing-wasm
```

[**Main repository**](https://github.com/Axelwickm/or-tools-wasm) · [Documentation](https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/README.md) · [Full library on npm](https://www.npmjs.com/package/or-tools-wasm) · [Google OR-Tools](https://github.com/google/or-tools)

> **Same API. Fast solves on any device.**
>
> [Sign up for the hosted cloud version](https://or-tools-wasm-api.axelwickman.com/info).

- **Route optimization and fleet planning:** build last-mile delivery planners,
  courier dispatch tools, and field-service schedules. Solve traveling salesman
  (TSP) and vehicle routing (VRP) problems.
- **Capacity and delivery windows:** solve capacitated vehicle routing (CVRP) and
  vehicle routing with time windows (VRPTW). Optimize travel distance or cost while
  respecting vehicle capacities, pickups and deliveries, and driver breaks.
- **TypeScript and JavaScript:** define travel costs with callbacks, inspect routes
  and schedules, and reuse assignments to reoptimize routes.
- **Browser and server:** run multithreaded WebAssembly locally in browsers, Node.js,
  Deno, or Bun without sending your model data to a server. Use a native server when
  you want remote execution through the same API.

Native Google OR-Tools Routing, directly in JavaScript. No Python service required.
The same API as `or-tools-wasm/routing`, in a smaller standalone package.

### Examples

**Click the image to try delivery routing.**

<p>
  <a href="https://axelwickman.com/or-tools-wasm/routing_dispatch.html"><img src="../../media/vrp.gif" alt="OR-Tools vehicle routing and delivery dispatch on a map" width="100%"></a>
</p>

## Installation

```sh
npm install routing-wasm
```

The package includes TypeScript declarations and Routing's native solver
dependencies. No separate CP-SAT package is required.

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
