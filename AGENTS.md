# Agent Notes

## Project Direction

This repo is aiming for Python API parity where it is practical, while still preserving access to the lower-level proto-oriented APIs. New solver work should generally expose both:

- A high-level, Python-like TypeScript API for ergonomic model building and solving.
- The existing proto/API surface for callers that need direct generated protobuf access.

Do not remove or obscure the proto path while adding higher-level wrappers. The goal is to support both styles cleanly.

## API Surface

When adding or changing solver functionality, check the public API entry points as well as implementation files. In particular:

- Update high-level wrapper files such as `javascript/lib/cp_sat_high_level.ts` when adding Python-like behavior.
- Update package exports in `javascript/lib/index.ts` so new public classes, helpers, enums, and types are reachable.
- Check generated API files and generator scripts when the missing surface belongs to generated protobuf or parameter types.
- Keep names close to upstream Python concepts where that helps parity, but use idiomatic TypeScript casing for public methods unless an existing pattern says otherwise.

## Test Parity

Python parity tests should be converted assertion-by-assertion from the upstream Python tests. When TypeScript behavior is ambiguous, upstream Python behavior is the reference.

`docs/test-audit/solver-python-test-parity-audit.md` is the working source of truth for Python solver-test parity. Keep it current whenever you inspect, convert, defer, or discover a mismatch in an upstream Python test. When a test is known to match upstream behavior and assertions through the high-level API, mark it with a `TEMP: parity` comment in the test code and update the audit.

Fixture location is not the API contract. Node may be the first runner used while iterating, but parity cases should live under shared fixture case modules and target the public package API. Add runner-specific glue only to pass the public API objects into those shared cases, so the same cases can later be executed by browser, webpack, Vite, Deno, Bun, or other fixture suites.

Shared fixture cases should carry stable IDs, upstream references, tags, and runtime context separately from assertion logic. Keep solver cases as isolated `run(api, context)` definitions where practical; adapters may batch initialization for performance, but should report individual case IDs when the host test runner supports subtests or steps.

Be conservative with audit status:

- Mark ✅ only when the implemented test matches upstream functionality and assertions.
- Mark placeholders/API gaps separately.
- Mark tests that belong to unimplemented solvers as not currently expected, instead of treating them as missing work for implemented solvers.
- Do not mark a test as parity-complete if it only smoke-tests similar behavior, omits meaningful assertions, or changes the checked edge cases.

Prefer targeted verification while iterating, such as `tsc --noEmit` or one focused fixture, before running broad fixture matrices.

## Example Site

Every solver exposed by the package should have its own example on the example site. Treat each solver as its own product surface: CP-SAT, Routing, MPSolver, MathOpt, and PDLP should each have tests and a dedicated example-site path.

When adding or materially expanding a solver API, add or update a site example that demonstrates that solver directly rather than relying only on tests. Examples should show model construction, solve invocation, status handling, and reading results.

Examples should show the intended public API style. For solvers with both high-level and proto access, prefer showing the high-level path first and keep proto access available where useful.

## Worktree Hygiene

The worktree may contain unrelated user changes. Do not revert or rewrite unrelated dirty files while doing parity, API, or example-site work.
