# Setup

## Choose a package

| Package | Includes | Import |
| --- | --- | --- |
| [`or-tools-wasm`](https://www.npmjs.com/package/or-tools-wasm) | All solvers | `or-tools-wasm/<solver>` |
| [`@or-tools-wasm/cp-sat`](https://www.npmjs.com/package/@or-tools-wasm/cp-sat) | CP-SAT and its runtimes | `@or-tools-wasm/cp-sat` |
| [`@or-tools-wasm/routing`](https://www.npmjs.com/package/@or-tools-wasm/routing) | Routing and its runtimes | `@or-tools-wasm/routing` |

The standalone packages expose the same solver APIs as the full library, with a
smaller installation. Choose either distribution for a solver; installing both
duplicates its runtime assets.

```sh
npm install or-tools-wasm
# Or install just the solver you need:
npm install @or-tools-wasm/cp-sat
npm install @or-tools-wasm/routing
```

```ts
import { CpModel, CpSat } from '@or-tools-wasm/cp-sat';
import { RoutingIndexManager, RoutingModel } from '@or-tools-wasm/routing';
```

See the [CP-SAT](solvers/cp-sat/README.md) and
[Routing](solvers/routing/README.md) quick starts.

## Import from jsDelivr

Import the standalone package's browser module directly in a browser module
script. Replace `VERSION` with an exact published version:

```html
<script type="module">
  import { CpModel, CpSat } from 'https://cdn.jsdelivr.net/npm/@or-tools-wasm/cp-sat@VERSION/build/javascript/browser/cp-sat.js';

  const model = new CpModel();
  const x = model.newIntVar(0, 10, 'x');
  model.maximize(x);

  const result = await CpSat.solve(model, {
    executor: { type: 'server', url: 'http://localhost:17827' },
  });
  console.log(result.value(x));
</script>
```

For Routing, use
`https://cdn.jsdelivr.net/npm/@or-tools-wasm/routing@VERSION/build/javascript/browser/routing.js`.
Use these browser files directly, without adding `/+esm`, to preserve the package's
relative asset URLs. [jsDelivr](https://www.jsdelivr.com/documentation) serves npm
package files, including their WASM assets; its package-size limit makes the
standalone packages the appropriate choice here.

The example uses [Server execution](execution.md#server-execution-and-errors)
and does not load local WASM. Start your solver server and replace the endpoint
as needed. For local WASM solves, install with npm and a bundler, or host the
package assets on your page's origin: browser workers cannot be created directly
from a different origin. Local WASM also needs the headers described under
[Browser requirements](#browser-requirements).

## First solve

Public APIs use solver-scoped imports. For example, build a CP-SAT model and
solve it:

```ts
import { CpModel, CpSat } from 'or-tools-wasm/cp-sat';

const model = new CpModel();

const desks = model.newIntVar(0, 4, 'desks');
const tables = model.newIntVar(0, 3, 'tables');

model.addLinearConstraint(desks.times(3).plus(tables.times(4)), 0, 12);
model.maximize(desks.times(20).plus(tables.times(30)));

const result = await CpSat.solve(model, { numWorkers: 1 });

console.log(result.status);
if (result.hasSolution) {
  console.log({
    desks: result.value(desks),
    tables: result.value(tables),
    profit: result.objectiveValue,
  });
}
```

Browser calls use a worker by default to keep the main thread responsive.
Choose `executor: 'direct'` or `'worker'` explicitly, or pass
`executor: { type: 'server', url: 'http://localhost:17827' }` for native execution.

Start the native server from the repository root:

```sh
docker compose -f server/docker-compose.yml up --build
```

Solve calls share execution controls: `executor` selects where to run,
`onEvent` reports progress, and `signal` requests cancellation.

## Browser requirements

Local browser WASM builds use WebAssembly threads, so pages must be served with
cross-origin isolation enabled:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, solving can fail during WebAssembly runtime or worker
startup.

Server-only execution does not load local WASM and does not require these
headers. The server must still be reachable from the page under the browser's
CORS and mixed-content rules.

See [Bundler configuration](#bundler-configuration) for Vite, Webpack, and
Rollup setup.

## Node, Deno, and Bun

Node and Bun work with normal ESM imports and do not need browser
cross-origin-isolation headers.

Deno needs permissions to read package assets and inspect CPU count:

```sh
deno run --allow-read --allow-sys=cpus your-script.ts
```

Server execution also needs `--allow-net` permission for the server endpoint.

Node uses the JSPI runtime when `WebAssembly.promising` is available and falls
back to Asyncify otherwise. Deno and Bun use the package's Asyncify runtime
path.

## Bundler configuration

The configurations below let the bundler emit worker scripts and WebAssembly
files from package imports. No manual copying into `public/` or `static/` is
required.

### Vite

For Vite apps, keep `or-tools-wasm` out of dependency optimization so Vite
handles the worker and WebAssembly URLs through its normal asset pipeline.
`protobufjs` is CommonJS, so include it in dependency optimization. The worker
runtime also needs ES module worker output. Local browser WASM solves require
cross-origin-isolation headers for WebAssembly threads:

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
plugin surface for those features. Static Rollup output must still be served
with the same cross-origin-isolation headers shown above:

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
