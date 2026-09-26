# Testing

Run commands below from the repository root. The fixture suites test the packed
public package; site tests check the examples users interact with.

## Fixture matrix

Run the full fixture matrix:

```sh
npm --prefix javascript run test:fixtures
```

This runs shared solver cases through Vite, Webpack, Rollup, Deno, Node, and
Bun. Browser fixtures cover Chromium and Firefox, dev and static serving where
supported, direct execution, the worker bridge, and solver thread settings.

For focused iteration:

```sh
npm --prefix javascript run test:fixtures:browser
npm --prefix javascript run test:fixtures:runtime
npm --prefix javascript run test:fixture:node
```

Shared cases use `executorFixtureModes`: direct and worker by default, plus
server when `ORTOOLS_TEST_SERVER=1`. The package workflow runs all three modes
in Node, Bun, Deno, and Vite static Chromium against the native server. Other
browser/bundler jobs run direct and worker modes. Runtime lifecycle and
worker-pool tests stay local because they test local runtime behavior.

Case-ID/mode checks reject missing combinations. Shared cases resolve public
package types from the same packed artifact as each fixture; the fixture
installer installs it into both the fixture and `tests`.

Run the full matrix before landing solver API, worker bridge, threading, or
packaging changes. See [shared test cases](../tests/cases/README.md) for case
organization and the [parity audit](test-audit/solver-python-test-parity-audit.md)
for upstream Python coverage.

## Example site

Building the local site requires Node and npm, Git, Python 3, CMake 3.20 or
newer, and native C/C++ build tools with Make or Ninja. The build script installs
the pinned Emscripten SDK automatically. A first build downloads the toolchain
and dependencies and compiles the WASM runtimes.

Start the local site:

```sh
npm --prefix javascript install
npm --prefix javascript run dev
```

`dev` builds the library before starting Vite. To build the library without
starting the site, use `npm --prefix javascript run build:lib`.

On any example page, select an executor to choose local or server execution.
See [native server setup](../server/README.md) for the Docker command and
optional authentication.

After building the library, run the site model and support tests:

```sh
npm --prefix javascript run test:site
```

This type-checks the site and tests the Calendar Scheduling model's
dependencies, shared people, lunch, leave, pins, and deadlines. The calendar's
displayed model is the same source that runs the page. The suite also checks
server-request errors and timeouts, plus viewport declarations.

Install Chromium and its system dependencies once, then run the browser checks:

```sh
(cd javascript && npx playwright install --with-deps chromium)
npm --prefix javascript run test:site:browser
```

This builds the site and runs Chromium checks for:

- A real worker solve on every solver example.
- Representative parameter changes: problem sizes, backends, capacity,
  deadline, formulation, and Sudoku generation.
- Mobile layouts on every page.
- Server-unavailable reporting and optional bearer-token forwarding on every
  server-enabled page, including clearing tokens and not persisting them.
- Calendar preferences, locks, dragging, reset, and failure recovery.

A completeness check requires new example pages to register a successful-solve
test. CI runs both site suites. These browser smoke checks complement the
shared solver fixtures; existing examples have not yet all been migrated to
isolated model tests.

## Native server

Native tests cover the scheduler, solver executors, job service, HTTP transport,
and configuration:

```sh
docker compose -f server/docker-compose.yml run --build --rm ortools-native-test
```

See [server setup](../server/README.md) for deployment and protocol details.
