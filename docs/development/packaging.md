# Standalone solver packages

These packages reuse the full library's built JavaScript, declarations and native runtimes. They do not change `or-tools-wasm/cp-sat` or `or-tools-wasm/routing` and do not depend on the full npm package.

After building the library, assemble both standalone tarballs:

```sh
npm --prefix javascript run pack:solvers
```

Outputs:

- `javascript/build/solver-packages/cp-sat.tgz` — `cp-sat-wasm`
- `javascript/build/solver-packages/routing.tgz` — `routing-wasm`

The package version comes from `javascript/package.json`. The script requires existing build artifacts and the JavaScript development dependencies; it does not compile native code or publish anything. Each standalone solver uses `docs/solvers/<solver>/README.md` as both its documentation landing page and npm README source. Its detailed API is in `api.md` beside it. Packaging makes the relative reference link absolute for npm. The example site links directly to the Markdown references on GitHub. `docs/README.md` is the documentation index; `docs/execution.md` covers shared execution.

Run the shared solver cases against the tarballs, including TypeScript checking and Direct/Worker execution:

```sh
npm --prefix javascript run test:fixture:solver-packages
```

Browser tests use Chromium and Firefox, with both JSPI and forced Asyncify (including workers):

```sh
cd tests/fixtures/solver-packages
npm exec playwright install chromium firefox
npm run test:browser
```

The same fixture's `run.ts` can also run with Bun or Deno:

```sh
bun run.ts
deno run --no-lock --node-modules-dir=manual --allow-read --allow-sys --allow-env run.ts
```

The Package workflow assembles these tarballs from the existing library build and uploads them as the `npm-solver-packages` artifact. A separate CI job installs only these packages and runs the Node, Bun, Deno and browser checks above.

A `v<version>` tag publishes all three packages after every package fixture passes.
The tag and all three tarball versions must match `javascript/package.json`.
Publishing uses separate jobs so a failed package can be retried with GitHub's
**Re-run failed jobs** without republishing successful packages. The GitHub
release is created after all three publish jobs succeed and includes all three
tarballs.

Each npm package needs a [trusted publisher](https://docs.npmjs.com/trusted-publishers/)
configured for owner `Axelwickm`, repository `or-tools-wasm`, and workflow
`package.yml`, with permission to publish directly. This is npm-side setup;
workflow changes alone do not grant access to the scoped packages.
