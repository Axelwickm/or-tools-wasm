import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as protobuf from 'protobufjs';
import { mathOptResultDescriptor } from '../lib/generated/mathopt_result_schemas.ts';

test('MathOpt parses exact native statistics, diagnostics and backend outputs', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mathopt-result-', import.meta.url)));
  try {
    const outfile = `${directory}/api.mjs`;
    await build({ stdin: {contents: `export * from './api.ts'; export {mathOptProtocol} from './protocol.ts';`, resolveDir: fileURLToPath(new URL('../lib/mathopt', import.meta.url))},
      outfile, bundle: true, format: 'esm', platform: 'node', packages: 'external',
      plugins: [{name:'result-validator-stub', setup(builder) {
        builder.onResolve({filter:/^\.\/direct_executor\.js$/},()=>({path:'executor',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`export class DirectMathOptExecutor { execute(operation) { return {result:Promise.resolve(globalThis.__mathOptResultValidationError ? {validationError:globalThis.__mathOptResultValidationError} : {validatedResult:operation.result})};} }`}));
      }}] });
    const { MathOpt }: typeof import('../lib/mathopt/api.ts') = await import(pathToFileURL(outfile).href);
    const root = protobuf.Root.fromJSON(mathOptResultDescriptor).resolveAll();
    const type = root.lookupType('operations_research.math_opt.SolveResultProto');
    const encode = (value: Record<string, unknown>) => new Uint8Array(type.encode(type.fromObject(value)).finish());
    const model = MathOpt.Model('native_result');
    const variable = model.addVariable({ name: 'x' });
    const quadratic = model.addQuadraticConstraint({ name: 'square', quadraticTerms: [
      { firstVariable: variable, secondVariable: variable, coefficient: 1 },
    ] });
    model.ensureNextAuxiliaryObjectiveIdAtLeast(3);
    model.addAuxiliaryObjective({ priority: 1, name: '' });
    model.addAuxiliaryObjective({ priority: 2, name: '' });
    const fields = await MathOpt.parseSolveResult(encode({ solutions: [{
      primalSolution: { auxiliaryObjectiveValues: { '3': 0, '4': 7 } },
      dualSolution: { quadraticDualValues: { ids: [quadratic.id], values: [2] } },
    }] }), model);
    assert.deepEqual(fields.solutions[0].primalSolution?.auxiliaryObjectiveValuesById, { '3': 0, '4': 7 });
    assert.deepEqual(fields.solutions[0].dualSolution?.quadraticDualValuesById, { [quadratic.id]: 2 });
    const unnamed = model.addVariable();
    const sameName = model.addVariable({ name: 'x' });
    const duplicateNames = await MathOpt.parseSolveResult(encode({ solutions: [{ primalSolution: {
      variableValues: { ids: [variable.id, unnamed.id, sameName.id], values: [1, 2, 3] }, feasibilityStatus: 2,
    } }] }), model);
    assert.deepEqual(duplicateNames.variableValuesById, { [variable.id]: 1, [unnamed.id]: 2, [sameName.id]: 3 });
    assert.equal(duplicateNames.value(variable), 1);
    assert.equal(duplicateNames.value(unnamed), 2);
    assert.equal(duplicateNames.value(sameName), 3);
    await assert.rejects(MathOpt.parseSolveResult(encode({ solutions: [{ primalSolution: {
      auxiliaryObjectiveValues: { '99': 1 },
    } }] }), model), /unknown model ID/);
    const result = await MathOpt.parseSolveResult(encode({ termination: { reason: 1, detail: 'Native stopping diagnostic' },
      solveStats: { simplexIterations: '9007199254740993', barrierIterations: '9223372036854775807',
        firstOrderIterations: 17, nodeCount: 3 },
      gscipOutput: { status: 11, stats: { totalLpIterations: '9007199254740993', nodeCount: 3 } },
    }), model);
    assert.equal(result.terminationDetail, 'Native stopping diagnostic');
    assert.equal(result.solveStats.simplexIterations, 9007199254740993n);
    assert.equal(result.solveStats.barrierIterations, 9223372036854775807n);
    assert.equal(result.solveStats.firstOrderIterations, 17n);
    assert.equal(result.solveStats.nodeCount, 3n);
    assert.equal(result.gscipSpecificOutput?.status, 'OPTIMAL');
    assert.equal(result.gscipSpecificOutput?.stats?.totalLpIterations, 9007199254740993n);
    const zeroCounters = await MathOpt.parseSolveResult(encode({ gscipOutput: { stats: {} } }), model);
    assert.equal(zeroCounters.gscipSpecificOutput?.stats?.nodeCount, 0n, 'Omitted backend counters retain exact scalar defaults');
    assert.equal(result.pdlpSpecificOutput, null);
    assert.equal(result.osqpSpecificOutput, null);
    const pdlp = await MathOpt.parseSolveResult(encode({ pdlpOutput: { convergenceInformation: {
      primalObjective: 7, dualObjective: 6, lInfPrimalResidual: 0.01,
    } } }), model);
    assert.equal(pdlp.pdlpSpecificOutput?.convergenceInformation?.primalObjective, 7);
    assert.equal(pdlp.pdlpSpecificOutput?.convergenceInformation?.lInfPrimalResidual, 0.01);
    assert.equal(pdlp.gscipSpecificOutput, null);
    assert.equal(pdlp.solveStats.simplexIterations, 0n);
    const zero = await MathOpt.parseSolveResult(encode({ termination: { reason: 1, objectiveBounds: {} },
      solutions: [{ primalSolution: { feasibilityStatus: 2 }, dualSolution: { feasibilityStatus: 2 } }],
    }), model);
    assert.equal(zero.hasSolution, true);
    assert.equal(zero.objectiveValue, 0);
    assert.equal(zero.primalBound, 0);
    assert.equal(zero.dualBound, 0);
    assert.equal(zero.solutions[0].dualSolution?.objectiveValue, null);
    const explicitDualZero = await MathOpt.parseSolveResult(encode({ solutions: [{ dualSolution: {
      feasibilityStatus: 2, objectiveValue: 0,
    } }] }), model);
    assert.equal(explicitDualZero.solutions[0].dualSolution?.objectiveValue, 0);
    const absent = await MathOpt.parseSolveResult(encode({ termination: { reason: 2 } }), model);
    assert.equal(absent.objectiveValue, null);
    assert.equal(absent.hasSolution, false);
    assert.equal(absent.primalBound, null);
    const osqp = await MathOpt.parseSolveResult(encode({ osqpOutput: { initializedUnderlyingSolver: true } }), model);
    assert.equal(osqp.osqpSpecificOutput?.initializedUnderlyingSolver, true);
    const {mathOptProtocol} = await import(pathToFileURL(outfile).href);
    const query = {type:'validateResult',request:Uint8Array.of(1,2),result:Uint8Array.of(3,4)};
    assert.deepEqual(mathOptProtocol.decodeRequest(mathOptProtocol.encodeRequest(query)), query);
    const wire = {validatedResult:Uint8Array.of(1,2)};
    assert.deepEqual(mathOptProtocol.decodeResult(mathOptProtocol.encodeResult(wire)), wire);
    const x = model.addVariable({name:'x'});
    const primal = {variableValues:{ids:[x.id],values:[4]},feasibilityStatus:2};
    const owned = await MathOpt.parseSolveResult(encode({solutions:[{primalSolution:primal}]}), model);
    assert.equal(owned.value(x), 4);
    assert.throws(() => owned.value(MathOpt.Model().addVariable({name:'foreign'})), /different MathOpt model/);
    const copy = owned.toProtoBytes(); copy.fill(255);
    assert.notEqual(owned.toProtoBytes()[0], 255);
    await assert.rejects(MathOpt.parseSolveResult(encode({solutions:[{primalSolution:{...primal,
      variableValues:{ids:[x.id],values:[]}}}]}),model), /mismatched IDs and values/);
    (globalThis as Record<string, unknown>).__mathOptResultValidationError = 'Native result validator rejected the payload';
    await assert.rejects(MathOpt.parseSolveResult(new Uint8Array(),model), /Native result validator rejected/);
    delete (globalThis as Record<string, unknown>).__mathOptResultValidationError;

  } finally { delete (globalThis as Record<string, unknown>).__mathOptResultValidationError; await rm(directory, { recursive: true, force: true }); }
});
