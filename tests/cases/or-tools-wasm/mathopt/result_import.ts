import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

// Wire fixtures use the field numbers from MathOpt's result/solution/sparse-container protos.
const join = (...parts: Uint8Array[]) => new Uint8Array(parts.flatMap(part => [...part]));
function varint(value: bigint): Uint8Array {
  let remaining = BigInt.asUintN(64, value); const bytes: number[] = [];
  do { const byte = Number(remaining & 127n); remaining >>= 7n; bytes.push(byte | (remaining ? 128 : 0)); } while (remaining);
  return Uint8Array.from(bytes);
}
const message = (field: number, bytes: Uint8Array) => join(varint(BigInt(field * 8 + 2)), varint(BigInt(bytes.length)), bytes);
const scalar = (field: number, value: bigint) => join(varint(BigInt(field * 8)), varint(value));
function doubles(values: number[]) { const bytes = new Uint8Array(values.length * 8), view = new DataView(bytes.buffer); values.forEach((value, index) => view.setFloat64(index * 8, value, true)); return bytes; }
const vector = (ids: Array<number | bigint>, values: number[]) => join(message(1, join(...ids.map(id => varint(BigInt(id))))), message(2, doubles(values)));

export async function runMathOptResultImportCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode, options = { executor };
    const model = api.MathOpt.Model('saved result'); model.ensureNextVariableIdAtLeast(3_000_000_000);
    const x = model.addVariable({ lowerBound: 0, upperBound: 4, name: 'x' }), y = model.addVariable({ lowerBound: 0, upperBound: 0, name: 'y' });
    model.ensureNextLinearConstraintIdAtLeast(1_000_000_000);
    const row = model.addLinearConstraint({ upperBound: 4, terms: [{ variable: x, coefficient: 1 }], name: 'capacity' });
    model.maximize([{ variable: x, coefficient: 3 }]);
    const solved = await api.MathOpt.solve(model, { ...options, solverType: api.MathOptSolverType.GLOP, threads: 1 });
    const saved = solved.toProtoBytes();
    const quadraticModel = await api.MathOptModel.fromModelProto(model.encodeModelProto(), options);
    const quadratic = quadraticModel.addQuadraticConstraint({ name: 'square_capacity', upperBound: 16,
      quadraticTerms: [{ firstVariable: quadraticModel.getVariable(x.id)!, secondVariable: quadraticModel.getVariable(x.id)!, coefficient: 1 }] });
    const standaloneDual = await api.MathOpt.convertSolutionProto('dualSolution', {
      dualValues: { ids: [row.id], values: [3] }, reducedCosts: { ids: [x.id, y.id], values: [0, 0] },
      quadraticDualValues: { ids: [quadratic.id], values: [0] }, objectiveValue: 12,
      feasibilityStatus: 'SOLUTION_STATUS_FEASIBLE',
    }, quadraticModel, options);
    const quadraticSource = join(saved, message(3, message(2, standaloneDual.bytes)));
    const quadraticPending = api.MathOpt.parseSolveResult(quadraticSource, quadraticModel, options);
    quadraticModel.deleteQuadraticConstraint(quadratic);
    const quadraticResult = await quadraticPending;
    assert(quadraticResult.solutions[1].dualSolution?.quadraticDualValuesById[quadratic.id] === 0,
      'Externally supplied quadratic duals retain captured IDs through native result validation');
    const imported = await api.MathOpt.parseSolveResult(saved, model, options);
    assert(imported.objectiveValue === 12 && imported.value(x) === 4 && imported.variableValuesById[x.id] === 4 && imported.variableValuesById[y.id] === 0,
      'Valid native results import with sparse model IDs and explicit zero values');
    assert(imported.solutions[0].dualSolution?.dualValuesById[row.id] !== undefined && imported.solutions[0].basis,
      'Valid dual/basis data survives native result import');
    const unpacked = join(scalar(1, BigInt(x.id)), varint(17n), doubles([4]), scalar(1, BigInt(y.id)), varint(17n), doubles([0]));
    const unpackedPrimal = join(message(1, unpacked), varint(17n), doubles([12]), scalar(3, 2n));
    const normalized = await api.MathOpt.parseSolveResult(join(saved, message(3, message(1, unpackedPrimal))), model, options);
    assert(normalized.solutions[1].primalSolution?.variableValuesById[x.id] === 4
      && normalized.solutions[1].primalSolution?.variableValuesById[y.id] === 0,
      'Native protobuf normalization supports unpacked and interleaved repeated fields');
    const detached = imported.toProtoBytes(); detached.fill(255);
    assert(imported.toProtoBytes()[0] !== 255, 'Result proto exports are independent copies');
    const snapshotModel = await api.MathOptModel.fromModelProto(model.encodeModelProto(), options);
    const source = solved.toProtoBytes(), pending = api.MathOpt.parseSolveResult(source, snapshotModel, options);
    source.fill(255); snapshotModel.deleteVariable(snapshotModel.getVariable(x.id)!);
    const snapshot = await pending;
    assert(snapshot.variableValuesById[x.id] === 4, 'Import snapshots bytes and model IDs before native execution');
    const mustReject = async (bytes: Uint8Array, suppliedModel = model, suppliedOptions = options) => {
      let rejected = false;
      try { await api.MathOpt.parseSolveResult(bytes, suppliedModel, suppliedOptions); } catch { rejected = true; }
      assert(rejected, 'Malformed vectors, metadata and model references must reject during native validation');
    };
    for (const [ids, values] of [
      [[x.id, y.id], [4]], [[x.id], [4, 0]], [[x.id, x.id], [4, 4]], [[y.id, x.id], [0, 4]],
      [[-1], [4]], [[9_007_199_254_740_993n], [4]], [[x.id + 100], [4]],
      [[x.id, y.id], [NaN, 0]], [[x.id, y.id], [Infinity, 0]],
    ] as Array<[Array<number | bigint>, number[]]>) {
      const primal = join(message(1, vector(ids, values)), scalar(3, 2n));
      await mustReject(join(saved, message(3, message(1, primal))));
    }
    await mustReject(Uint8Array.of(255)); await mustReject(new Uint8Array());
    await mustReject(saved, api.MathOpt.Model('unrelated'));
    const removed = api.MathOpt.Model(); removed.ensureNextVariableIdAtLeast(x.id);
    const stale = removed.addVariable({ name: 'stale' }); removed.deleteVariable(stale);
    await mustReject(saved, removed);

    const modelParameters = new api.MathOptModelSolveParameters({
      variableValuesFilter: { elements: [x], filterByIds: true },
      dualValuesFilter: { elements: [], filterByIds: true },
      reducedCostsFilter: { elements: [x], filterByIds: true },
    });
    const filtered = await api.MathOpt.solve(model, { ...options, solverType: api.MathOptSolverType.GLOP, threads: 1, modelParameters });
    const filteredImport = await api.MathOpt.parseSolveResult(filtered.toProtoBytes(), model, { ...options, modelParameters });
    assert(filteredImport.variableValuesById[x.id] === 4 && filteredImport.variableValuesById[y.id] === undefined,
      'Filtered imports use the original model parameters without inventing omitted values');
    await mustReject(filtered.toProtoBytes());
    const skipZeros = new api.MathOptModelSolveParameters({ variableValuesFilter: { skipZeroValues: true },
      dualValuesFilter: { skipZeroValues: true }, reducedCostsFilter: { skipZeroValues: true } });
    const sparse = await api.MathOpt.solve(model, { ...options, solverType: api.MathOptSolverType.GLOP, threads: 1, modelParameters: skipZeros });
    const sparseImport = await api.MathOpt.parseSolveResult(sparse.toProtoBytes(), model, { ...options, modelParameters: skipZeros });
    assert(sparseImport.variableValuesById[x.id] === 4 && sparseImport.variableValuesById[y.id] === undefined,
      'Native skip-zero semantics retain omitted sparse entries');
    assert(solved.variableValuesById[x.id] === 4 && (await api.MathOpt.parseSolveResult(saved, model, options)).objectiveValue === 12,
      'Validation failures preserve prior result snapshots and recover');
    results.push({ id: 'mathopt.correctness.result_import', solver: 'mathopt', mode, ok: true as const });
  }
  return results;
}
