# Shared native Routing construction

## Comparison before extraction

The WASM C entry points and server protobuf adapter already use the same narrow helpers for visit types, resource attributes, breaks, dependent transit, costs, finalizers, variable domains and expression algebra. Keep those helpers; do not add a second operation framework.

The duplicated native setup was index-manager/model creation, matrix registration, ordinary dimensions, direct constraints and setters, and construction-state ownership. These now live in `javascript/routing_model_builder.h`, used by both adapters alongside the existing narrow shared helpers. Adapter dispatch and input conversion remain runtime-specific while the public APIs, C exports and protobuf schema stay available.

Intentional differences to preserve:

- WASM transfers flat buffers and stages expression IDs; the server reads protobuf matrices and expression trees. Node-indexed matrices and routing-indexed (including unary) matrices have different native registration semantics.
- WASM keeps separate public manager/model handles. The server creates a complete model per job. The builder retains its manager independently of adapter handles.
- WASM registers progress sinks before operations; the server installs progress observers after inspection and closure decisions. Keep that timing in each adapter.
- WASM translates callback failures through its JavaScript registration table; the server catches transport exceptions, records the original exception and requests cancellation. Neither may unwind callback failures through native search.
- Both create resource groups before operations, populate resources afterward, and attach secondary models after constructing the primary. Attaching a secondary closes that secondary through the existing native helper. Construction leaves the primary open; existing query/search adapters decide its closure timing.
- WASM tracks evaluator IDs for staged C calls and retains dependent-transit domain metadata. Server operations register matrices immediately; its domain metadata previously lived only during each dependent-dimension operation. Native transit closures own their sampled data in both cases.
- Primary Routing models reference secondary models. Destruction must release the primary model before secondary models, managers and construction support state. Result extraction remains in the adapters and completes before model destruction.

Runtime-only cancellation, thread admission, scheduling, callback transport, search workflows and result serialization stay outside the builder. Existing shared fixture cases remain contract tests; this extraction does not establish additional Python parity.

## Verification

- All 150 WASM C export declarations remain present; all 56 protobuf model-operation cases retain their dispatch order. The TypeScript native adapter and protobuf format are unchanged by this extraction.
- Four native Routing suites passed before extraction (116 cases) and after rebuilding (118 cases). The added cases exercise deterministic construction and objective behavior, manager and callback ownership, primary-before-secondary destruction, and release of owned objects. Callback caching is disabled in the lifetime probe so the test observes actual retained callback storage.
- The same 509 shared checks passed before and after extraction across Node JSPI direct/worker and server execution, including the existing control and parity cases, worker lifecycle and concurrency checks.
- Another 340 shared checks passed using Node Asyncify direct/worker execution. Chromium passed 340 checks each using JSPI and forced Asyncify, including actual browser-worker callback transport. The forced selection only changes the test server's response for the generated runtime-loader module; product sources are unchanged.
- All seven Routing unit test files, the JavaScript build and verification of all 14 shared browser/Node WASM binaries passed. Native builds used two compiler jobs; no permanent build-concurrency setting changed.
