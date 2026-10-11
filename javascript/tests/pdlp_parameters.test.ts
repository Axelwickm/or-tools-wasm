import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { pdlpDescriptor } from '../lib/generated/pdlp_schemas.ts';

test('native PDLP/Glop controls reject silent parameter loss and integer rounding', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.pdlp-params-', import.meta.url)));
  try {
    const outfile = `${directory}/proto.mjs`;
    await build({ entryPoints: [fileURLToPath(new URL('../lib/pdlp/proto.ts', import.meta.url))],
      outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
    const { encodePdlpParameters, encodeGlopParameters, decodePdlpSolveLog } = await import(outfile);
    const root = protobuf.Root.fromJSON(pdlpDescriptor).resolveAll();
    const logType = root.lookupType('operations_research.pdlp.SolveLog');
    const log = decodePdlpSolveLog(logType.encode(logType.create({ params: { terminationCriteria: {} } })).finish());
    assert.equal(log.params.terminationCriteria.timeSecLimit, Infinity);
    assert.equal(log.params.terminationCriteria.kktMatrixPassLimit, Infinity);
    const glopType = root.lookupType('operations_research.glop.GlopParameters');
    assert.equal(glopType.fields.objectiveLowerLimit.resolve().defaultValue, -Infinity);
    assert.equal(glopType.fields.objectiveUpperLimit.resolve().defaultValue, Infinity);
    assert.throws(() => encodePdlpParameters({ terminationCriteria: { timeLimit: 1 } }), /Unknown.*timeLimit/);
    assert.throws(() => encodePdlpParameters({ presolveOptions: 1 }), /must be a protobuf message object/);
    assert.throws(() => encodeGlopParameters({ maxNumberOfIterations: 9007199254740992 }), /safe integer/);
    assert.throws(() => encodeGlopParameters({ maxNumberOfIterations: 1n << 63n }), /64-bit/);
    assert.doesNotThrow(() => encodeGlopParameters({ maxNumberOfIterations: 9007199254740993n }));
    assert.throws(() => encodePdlpParameters({ schedulerType: 'TYPO' }), /Unknown.*enum/);
    assert.throws(() => encodePdlpParameters({ terminationCriteria: {
      simpleOptimalityCriteria: {}, detailedOptimalityCriteria: {},
    } }), /multiple values/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
