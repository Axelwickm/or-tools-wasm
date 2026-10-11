import type * as Api from 'or-tools-wasm/cp-sat';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function rejects(action: () => unknown) {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  assert(rejected, 'Malformed or aborted model export must reject');
}

export async function runCpSatModelExportCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const source: Api.CpModelProto = { name: 'native-export', variables: [
      { name: 'x', domain: [-9007199254740993n, 9007199254740993n] },
    ] };
    const expected = 'name: "native-export"\nvariables {\n  name: "x"\n  domain: -9007199254740993\n  domain: 9007199254740993\n}\n';
    assert(await api.CpSat.exportModelText(source, { executor }) === expected, 'Native protobuf text has exact field names, indentation and int64 bounds');
    const bytes = await api.CpSat.createModel(source);
    const byteExport = api.CpSat.exportModelText(bytes, { executor }); bytes.fill(0xff);
    assert(await byteExport === expected, 'Byte input is copied before awaiting');
    const objectExport = api.CpSat.exportModelText(source, { executor }); source.name = 'changed'; source.variables![0].domain![0] = 0;
    assert(await objectExport === expected, 'Object input is serialized before awaiting');
    const rich: Api.CpModelProto = {
      name: 'quote"\nline', variables: [{ name: 'flag', domain: [0, 1] }],
      constraints: [{ enforcementLiteral: [0], boolOr: { literals: [0] } }],
      objective: { vars: [0], coeffs: [2], offset: 0.5 },
      solutionHint: { vars: [0], values: [1] }, assumptions: [0],
      searchStrategy: [{ variables: [0], variableSelectionStrategy: 1, domainReductionStrategy: 1 }],
    };
    const text = await api.CpSat.exportModelText(rich, { executor });
    assert(text.includes('name: "quote\\"\\nline"') && text.includes('enforcement_literal: 0')
      && text.includes('bool_or {') && text.includes('objective {') && text.includes('offset: 0.5')
      && text.includes('solution_hint {') && text.includes('assumptions: 0')
      && text.includes('variable_selection_strategy: CHOOSE_LOWEST_MIN')
      && text.includes('domain_reduction_strategy: SELECT_MAX_VALUE'), 'Native text retains escaping, enums, constraints, objective, hints and search configuration');
    assert(await api.CpSat.exportModelText(new Uint8Array(), { executor }) === '', 'Empty model exports empty native text');
    assert((await api.CpSat.exportModelText({ variables: [{ domain: [0] }] }, { executor })).includes('domain: 0'), 'Invalid models remain exportable for debugging');
    await rejects(() => api.CpSat.exportModelText(new Uint8Array([0xff]), { executor }));
    const controller = new AbortController(); controller.abort();
    await rejects(() => api.CpSat.exportModelText({}, { executor, signal: controller.signal }));
    assert(await api.CpSat.exportModelText({}, { executor }) === '', 'Export recovers after malformed bytes and pre-abort');
    results.push({ id: 'cp_sat.contract.native_model_text_export', solver: 'cp-sat', mode, ok: true as const });

    const model = new api.CpModel(); model.name = 'editable';
    const x = model.newIntVar(0, 4, 'x'); model.maximize(x);
    const binaryPending = model.exportModelProto(), textPending = model.exportModelText({ executor });
    x.name = 'renamed'; x.domain = api.Domain.fromIntervals([[1, 2]]);
    const binary = await binaryPending, snapshotText = await textPending;
    assert(snapshotText.includes('name: "x"') && snapshotText.includes('domain: 4') && !snapshotText.includes('renamed'), 'High-level text export snapshots live model before awaiting');
    assert(snapshotText === await api.CpSat.exportModelText(binary, { executor }), 'Text and binary snapshots represent the same model');
    const solved = await api.CpSat.solveProto(binary, { executor, numWorkers: 1 });
    assert(solved.response?.status === 'OPTIMAL' && solved.response.objectiveValue === 4, 'Exported binary model solves without later edits');
    const current = await model.exportModelText({ executor });
    assert(current.includes('name: "renamed"') && current.includes('domain: 2'), 'Subsequent exports include current live model edits');
    assert((await api.CpSat.solveProto(await model.exportModelProto(), { executor, numWorkers: 1 })).response?.objectiveValue === 2, 'Current binary export includes domain edits');
    binary.fill(0xff);
    assert(await model.exportModelText({ executor }) === current, 'Exported bytes are detached from the model');
    results.push({ id: 'cp_sat.correctness.model_export_snapshots', solver: 'cp-sat', mode, ok: true as const });
  }
  return results;
}
