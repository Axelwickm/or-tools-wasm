import type * as Api from 'or-tools-wasm/pdlp';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-5, `Expected ${expected}, got ${actual}`);
const text = `name: "imported" maximize: true objective_offset: 5
variable { name: "x" lower_bound: 0 upper_bound: 4 objective_coefficient: 3 }
variable { name: "unused" lower_bound: 0 upper_bound: 0 }
constraint { name: "capacity" upper_bound: 4 var_index: 0 coefficient: 1 }`;
const json = JSON.stringify({ name: 'imported', maximize: true, objectiveOffset: 5,
  variable: [{ name: 'x', lowerBound: 0, upperBound: 4, objectiveCoefficient: 3 }, { name: 'unused', lowerBound: 0, upperBound: 0 }],
  constraint: [{ name: 'capacity', upperBound: 4, varIndex: [0], coefficient: [1] }] });
const mps = `NAME imported
OBJSENSE
 MAX
ROWS
 N cost
 L capacity
COLUMNS
 x cost 3 capacity 1
 unused cost 0
RHS
 rhs capacity 4 cost -5
BOUNDS
 UP bounds x 4
 FX bounds unused 0
ENDATA
`;

export async function runPdlpModelImportCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const options = { executor, includeNames: true };
    const source = await api.Pdlp.readQuadraticProgram(text, { ...options, format: 'textproto' });
    const proto = await api.Pdlp.qpToMpModelProto(source, { executor });
    for (const [format, input] of [['textproto', text], ['json', json], ['mps', mps], ['proto', proto]] as const) {
      const imported = await api.Pdlp.readQuadraticProgram(input, { ...options, format });
      assert(imported.problemName === 'imported' && imported.variableNames.join(',') === 'x,unused'
        && imported.constraintNames[0] === 'capacity', `Names lost during ${format} import (${mode})`);
      assert(imported.objectiveScalingFactor === -1 && imported.objectiveOffset === -5
        && imported.objectiveVector[0] === -3 && imported.variableUpperBounds[1] === 0,
        `Objective or unused variables lost during ${format} import`);
      const solved = await api.Pdlp.solve(imported, { executor, numThreads: 1 });
      assert(solved.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', 'Imported model did not solve');
      close(solved.primalSolution[0], 4); close(solved.primalSolution[1], 0);
      close(imported.applyObjectiveScalingAndOffset(-3 * solved.primalSolution[0]), 17);
      const bytesImport = await api.Pdlp.readQuadraticProgram(typeof input === 'string' ? new TextEncoder().encode(input) : input, { executor, format });
      assert(bytesImport.variableNames.length === 0 && bytesImport.problemName === '', 'Default import unexpectedly includes names');
      results.push({ id: `pdlp.import.${format}`, name: `PDLP native ${format} model import`,
        source: 'ortools/lp_data/mps_reader.h; ortools/pdlp/quadratic_program.cc', tags: ['contract', 'model-import'], solver: 'pdlp', mode, ok: true as const });
    }
    const bytes = new Uint8Array(proto), pending = api.Pdlp.readQuadraticProgram(bytes, { ...options, format: 'proto' });
    bytes.fill(255);
    assert((await pending).variableNames[0] === 'x', 'Import did not snapshot input bytes');
    const unicode = await api.Pdlp.readQuadraticProgram(text.replace('"x"', '"café 🚀"'), { ...options, format: 'textproto' });
    assert(unicode.variableNames[0] === 'café 🚀', 'UTF-8 names did not survive native import');
    const quadratic = await api.Pdlp.readQuadraticProgram(`variable { lower_bound: 0 upper_bound: 4 objective_coefficient: -4 }
      quadratic_objective { qvar1_index: 0 qvar2_index: 0 coefficient: 1 }`, { executor, format: 'textproto' });
    assert(quadratic.objectiveMatrixDiagonal?.[0] === 2, 'Native diagonal quadratic conversion lost the implicit half');
    close((await api.Pdlp.solve(quadratic, { executor, numThreads: 1 })).primalSolution[0], 2);
    const reject = async (input: string | Uint8Array, format: Api.PdlpModelFormat, relaxIntegerVariables = false) => {
      let failed = false;
      try { await api.Pdlp.readQuadraticProgram(input, { executor, format, relaxIntegerVariables }); }
      catch (error) { failed = error instanceof Error && error.message.length > 0; }
      assert(failed, 'Invalid model import did not return an error');
    };
    await reject('not MPS', 'mps'); await reject('not textproto', 'textproto'); await reject('not JSON', 'json');
    await reject(text, 'constructor' as Api.PdlpModelFormat);
    await reject(Uint8Array.of(255), 'proto'); await reject('binary string', 'proto');
    await reject('variable {} constraint { var_index: 0 }', 'textproto');
    await reject('variable {} constraint { var_index: 8 coefficient: 1 }', 'textproto');
    await reject('variable { is_integer: true }', 'textproto');
    await reject('variable {} variable {} quadratic_objective { qvar1_index: 0 qvar2_index: 1 coefficient: 1 }', 'textproto');
    await reject('general_constraint { name: "unsupported" }', 'textproto');
    const relaxed = await api.Pdlp.readQuadraticProgram('variable { is_integer: true lower_bound: 0 upper_bound: 4 }',
      { executor, format: 'textproto', relaxIntegerVariables: true });
    assert(relaxed.variableUpperBounds[0] === 4, 'Explicit integer relaxation failed');
    await api.Pdlp.qpFromMpModelProto(proto, { executor });
    const cancelled = new AbortController(); cancelled.abort();
    let aborted = false;
    try { await api.Pdlp.readQuadraticProgram(mps, { executor, format: 'mps', signal: cancelled.signal }); }
    catch { aborted = true; }
    assert(aborted, 'Pre-aborted import was accepted');
    assert((await api.Pdlp.readQuadraticProgram(mps, { executor, format: 'mps' })).objectiveVector[0] === -3,
      'Import failure poisoned executor reuse');
    const scaling = new api.QuadraticProgram({ objectiveOffset: 7, objectiveScalingFactor: 3 });
    close(scaling.applyObjectiveScalingAndOffset(2), 27);
    scaling.objectiveScalingFactor = -2; close(scaling.applyObjectiveScalingAndOffset(2), -18);
    scaling.objectiveScalingFactor = 0; close(scaling.applyObjectiveScalingAndOffset(2), 0);
    results.push({ id: 'pdlp.import.validation_scaling_reuse', name: 'PDLP model validation, scaling and reuse',
      source: 'ortools/pdlp/quadratic_program.h; ortools/linear_solver/model_validator.h', tags: ['contract', 'model-import'], solver: 'pdlp', mode, ok: true as const });
  }
  return results;
}
