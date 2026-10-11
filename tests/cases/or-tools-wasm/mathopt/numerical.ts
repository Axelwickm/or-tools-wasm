import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMathOptNumericalCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
    const model = api.MathOpt.Model('large-result'), x = model.addVariable({ lowerBound: 0, upperBound: 2, name: 'x' }); model.maximize(x);
    const native = await api.MathOpt.solveProto(model.encodeModelProto(), execution);
    // Protobuf unknown fields survive native validation/serialization. Repeated
    // packed fields must not turn their element count into JS call arguments.
    const suffix = new Uint8Array(150_009);
    suffix.set([0x9a, 0x06, 1, 0, 0x9a, 0x06, 0xf0, 0x93, 0x09]);
    const payload = new Uint8Array(native.bytes.length + suffix.length);
    payload.set(native.bytes); payload.set(suffix, native.bytes.length);
    const parsed = await api.MathOpt.parseSolveResult(payload, model, execution);
    assert(parsed.objectiveValue === 2 && parsed.value(x) === 2,
      'Large repeated protobuf segments preserve validated native results without argument-count limits');
    const count = model.getNumVariables();
    const invalid = { variables: { ids: [0], lowerBounds: [0], upperBounds: [1], integers: [false] },
      objective: { linearCoefficients: { ids: [0], values: [Infinity] } } };
    let rejected = false;
    try { await api.MathOpt.solveProto(invalid, execution); } catch { rejected = true; }
    assert(rejected && model.getNumVariables() === count,
      'Nonfinite coefficients are rejected natively without changing the editable source model');
    assert((await api.MathOpt.solve(model, execution)).objectiveValue === 2, 'Native validation and large-result parsing leave solves usable');
    results.push({ id: 'mathopt.numerical.large_wire_native_validation', solver: 'mathopt', mode,
      source: 'ortools/math_opt/result.proto', tags: ['native-contract', 'large-model', 'numerical'], ok: true as const });
  }
  return results;
}
