# Known bugs

## CP-SAT cancellation fails in a JSPI worker

In `or-tools-wasm` 0.9.1, cancelling an active CP-SAT solve from the browser worker can fail with:

```text
SuspendError: trying to suspend without WebAssembly.promising
```

The browser worker's `cancel_solve` handler calls the JSPI runtime synchronously:

```ts
(await loadCpSatModule()).ccall("interrupt_solve", "void", [], [])
```

Under JSPI, the exported call must be invoked using Emscripten's asynchronous `ccall` path so that it is wrapped with `WebAssembly.promising`:

```ts
await (await loadCpSatModule()).ccall(
  "interrupt_solve",
  "void",
  [],
  [],
  { async: true },
);
```

The handler should send `solved_cancelled` only after that promise resolves.

### Impact

Applications cannot reliably stop a running CP-SAT search. The old native search may remain active and leave the shared worker in a bad state, so a later solve can hang or interfere with the previous solve.

This affects application flows such as a Stop button, resetting a board, changing a problem, or starting another solve after cancellation.

### Temporary consumer workaround

A browser application can terminate and recreate the solver worker by toggling the worker bridge off and on. This is only a workaround; after the worker handler is fixed, consumers should use `CpSat.cancelSolve()` normally.

## CP-SAT enum types accept string names that runtime serialization rejects

The TypeScript declarations allow protobuf enum names to be assigned as strings. For example, both of these type-check:

```ts
model.addDecisionStrategy(variables, "CHOOSE_FIRST", "SELECT_MAX_VALUE");
solver.parameters.searchBranching = "FIXED_SEARCH";
```

At runtime, however, model and parameter serialization require numeric enum values and fail with errors such as:

```text
CpSat.createModel: searchStrategy.variableSelectionStrategy: enum value expected
CpSat.solve: searchBranching: enum value expected
```

Using numeric values is not consistently available as a clean workaround. Some corresponding numeric enums are not exported from the public module. In particular, `SatParameters_SearchBranching` is declared internally in `cp-sat.d.ts` but is not exported, even though `SatParameters.searchBranching` is typed as accepting that enum or its string-name union.

### Impact

Code accepted by TypeScript fails only when the model is serialized or solved. Consumers must discover and use undocumented numeric literals or unsafe casts for some parameters.

### Expected behavior

The public API should do one of the following consistently:

1. Accept string enum names at runtime and translate them to their protobuf numeric values.
2. Restrict the declarations to numeric enum values and export every enum required by a public model or parameter type.

Supporting both exported numeric enums and string names would provide the most ergonomic API. Browser and Node tests should cover both decision-strategy enums and solver-parameter enums.

## Worker-loading failures discard the actionable error context

The browser worker bridge reports many distinct startup failures using the same fallback message:

```text
OR-Tools worker failed to load: The runtime blocked or failed to load the worker module.
```

During integration, this message was produced or could be produced by materially different problems, including:

- A missing worker or WASM asset returning HTTP 404.
- An interrupted or truncated WASM response.
- A development server crashing while serving the runtime.
- A module worker being blocked by browser policy or response headers.
- A worker module failing during evaluation.

The fallback hides the worker URL, resource URL, HTTP status, browser event type, and underlying exception. As a result, consumers cannot distinguish a packaging error from a network, server, policy, or runtime-evaluation failure without manually tracing browser network requests.

### Expected behavior

Worker startup errors should preserve and report as much of the following context as the browser exposes:

- The worker module URL.
- The runtime JavaScript and WASM asset URLs when known.
- The original `Error`, `ErrorEvent`, or rejected promise message and stack.
- The event type and source location (`filename`, `lineno`, and `colno`) when available.
- The HTTP status or fetch failure when asset loading is performed by library code.
- The selected runtime flavor and placement, such as JSPI in a browser worker.

The high-level message can remain concise, but the original failure should be retained as `Error.cause` or exposed through a structured diagnostic object. Tests should distinguish at least missing worker assets, missing WASM assets, worker evaluation failures, and blocked worker creation.

## Threaded solving does not clearly report missing cross-origin isolation

Threaded browser solving depends on capabilities such as `SharedArrayBuffer`, which normally require a cross-origin-isolated page. During integration, the application had to add `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` response headers, but failures did not clearly identify `globalThis.crossOriginIsolated === false` or unavailable `SharedArrayBuffer` as the cause.

This is easy to misdiagnose as a worker-loading, WASM, bundler, or browser compatibility problem.

### Expected behavior

Before loading or starting a threaded runtime, the library should perform an explicit environment preflight that checks at least:

```ts
globalThis.crossOriginIsolated
typeof globalThis.SharedArrayBuffer === "function"
```

If threaded solving cannot run, the library should either:

1. Fail with a specific actionable error explaining that cross-origin isolation is required and naming the missing capability.
2. Deliberately fall back to a supported single-worker runtime and emit a clear diagnostic that parallel search was disabled.

An actionable browser error could include guidance such as:

```text
Threaded OR-Tools WASM requires a cross-origin-isolated page. `crossOriginIsolated` is false and `SharedArrayBuffer` is unavailable. Configure compatible COOP/COEP response headers, or request single-worker execution.
```

The diagnostic should also report the requested search-worker count, selected runtime flavor, browser placement, and whether the current context is a secure context. A public environment-inspection or preflight API would let applications surface this problem before the user starts a solve.

## Runtime selection cannot be inspected or overridden for debugging

The browser worker automatically selects JSPI when `WebAssembly.promising` is available and otherwise selects Asyncify. Automatic selection is the correct production default, but the selected runtime is currently only communicated through a console message and cannot be inspected programmatically.

There is also no obvious supported way to force JSPI or Asyncify temporarily when diagnosing browser-specific runtime, worker, cancellation, or performance problems. This makes it difficult to determine whether a failure is specific to one runtime flavor.

### Expected behavior

Production behavior should remain automatic. The public API should expose structured, read-only runtime information after selection, for example:

```ts
const info = CpSat.getRuntimeInfo();
// {
//   flavor: "jspi",
//   placement: "browser-worker",
//   automaticallySelected: true,
//   jspiSupported: true
// }
```

The library may additionally provide an explicitly debugging-only override that forces `"jspi"` or `"asyncify"`. It should be clearly named and documented as unsuitable for normal production configuration, for example:

```ts
CpSat.setDebugRuntimeFlavor("asyncify");
```

The override should apply only before a runtime or worker is created, reject unsupported selections with a specific error, and be resettable to automatic selection. Its purpose is controlled comparison and fault isolation—not allowing applications to permanently second-guess the library's runtime selection policy.
