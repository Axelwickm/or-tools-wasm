# OR-Tools CP-SAT for JavaScript

[![npm: cp-sat-wasm](https://img.shields.io/npm/v/cp-sat-wasm?logo=npm&label=cp-sat-wasm)](https://www.npmjs.com/package/cp-sat-wasm)

**Install:**

```sh
npm install cp-sat-wasm
```

[**Main repository**](https://github.com/Axelwickm/or-tools-wasm) · [Documentation](https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/README.md) · [Full library on npm](https://www.npmjs.com/package/or-tools-wasm) · [Google OR-Tools](https://github.com/google/or-tools)

> [!TIP]
> **Same API. Fast solves on any device.**
>
> [Sign up for the hosted cloud version](https://or-tools-wasm-api.axelwickman.com/info).

Build employee rosters, shift schedules, school timetables, and production plans
in JavaScript or TypeScript. Solve assignment, packing, and other constraint
problems with Google OR-Tools CP-SAT, running locally in your browser or Node.js.
No solver server required.

The same API as `or-tools-wasm/cp-sat`, in a smaller standalone package.

## Installation

```sh
npm install cp-sat-wasm
```

The package includes TypeScript declarations and the required runtime. No other
solver package is required.

### Browser import with jsDelivr

Replace `VERSION` with an exact published version:

```html
<script type="module">
  import { CpModel, CpSat } from 'https://cdn.jsdelivr.net/npm/cp-sat-wasm@VERSION/build/javascript/browser/cp-sat.js';
</script>
```

For a direct CDN import, use Server execution with
`executor: { type: 'server', url: 'http://localhost:17827' }`.
For local WASM execution, use npm and a bundler or serve package assets from your
own origin so browser workers can load. See
[CDN and browser setup](https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/setup.md#import-from-jsdelivr).

## Quick start

```ts
import { CpModel, CpSat } from 'cp-sat-wasm';

const model = new CpModel();
const x = model.newIntVar(0, 10, 'x');
model.maximize(x);
const result = await CpSat.solve(model, { executor: 'worker' });
console.log(result.value(x));
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

The existing `or-tools-wasm/cp-sat` import remains supported. Choose either distribution; installing both duplicates runtime assets. Model objects should be used with the API that created them.

## Reference and examples

- [CP-SAT API reference](api.md) — model building, solving, results and proto access.
- [Browser setup](https://github.com/Axelwickm/or-tools-wasm/blob/main/docs/setup.md#browser-requirements) and [server configuration](https://github.com/Axelwickm/or-tools-wasm/blob/main/server/README.md).
- [Calendar scheduling](https://axelwickman.com/or-tools-wasm/project_calendar.html), [Steel Mill Slab](https://axelwickman.com/or-tools-wasm/steel_mill_slab.html) and [Model Playground](https://axelwickman.com/or-tools-wasm/model_playground.html).
