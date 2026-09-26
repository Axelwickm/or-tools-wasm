import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { cpModelProtoSchema } from '../lib/generated/cp_sat_schemas.ts';

test('CpSat.solve(model) owns its result and keeps the proto solve path', async () => {
  const type = protobuf.parse(cpModelProtoSchema).root.lookupType('operations_research.sat.CpSolverResponse');
  const responses = [3, 7].map((value) => [...type.encode(type.fromObject({
    status: 'OPTIMAL', solution: [value], objectiveValue: value,
  })).finish()]);
  const directory = await mkdtemp(fileURLToPath(new URL('.cp-result-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL('../lib/cp-sat.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external',
      plugins: [{ name: 'cp-executor', setup(builder) {
        builder.onResolve({ filter: /^\.\/direct_executor\.js$/ }, () => ({ path: 'cp-executor', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
          const responses = ${JSON.stringify(responses)};
          let next = 0;
          export class DirectCpSatExecutor {
            execute() {
              const response = Uint8Array.from(responses[Math.min(next++, responses.length - 1)]);
              return { result: Promise.resolve({ type: 'solve', response }) };
            }
          }
        ` }));
      } }],
    });
    const { CpSat, CpModel } = await import(outfile);
    const model = new CpModel();
    const x = model.newIntVar(0, 10, 'x');
    const first = await CpSat.solve(model, { executor: 'direct' });
    const second = await CpSat.solve(model, { executor: 'direct' });
    assert.equal(first.hasSolution, true);
    assert.equal(first.objectiveValue, 3);
    assert.equal(first.value(x), 3n);
    assert.equal(second.value(x), 7n);
    const later = model.newIntVar(0, 1, 'later');
    assert.throws(() => first.value(later), /added after this solve/);
    assert.throws(() => first.value(new CpModel().newIntVar(0, 1, 'foreign')), /different CpModel/);
    const copy = first.response;
    copy.solution[0] = 99n;
    assert.equal(first.value(x), 3n);
    const bytes = await CpSat.createModel(model.modelProto);
    const raw = await CpSat.solveProto(bytes, { executor: 'direct' });
    assert.ok(raw.bytes instanceof Uint8Array);
    await assert.rejects(
      CpSat.solve(bytes as never, { executor: 'direct' }),
      /use CpSat\.solveProto\(\)/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
