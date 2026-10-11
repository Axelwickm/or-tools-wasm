import type * as Api from 'or-tools-wasm/mathopt';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

export async function runMathOptSessionOptionsCases(api: typeof Api) {
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const model = api.MathOpt.Model('Unicode names');
    model.addVariable({ lowerBound: 0, upperBound: 1, name: '重复名称' });
    model.addVariable({ lowerBound: 0, upperBound: 1, name: '重复名称' });
    const preservesError = async (action: () => Promise<unknown>) => {
      let failure: unknown;
      try { await action(); } catch (error) { failure = error; }
      assert(failure instanceof Error && /duplicate name.*重复名称/.test(failure.message),
        'Native UTF-8 validation details survive response decoding');
    };
    await preservesError(() => api.MathOpt.solve(model, { solverType: 'GLOP', executor }));
    await preservesError(() => api.MathOpt.solveProto(model.encodeModelProto(), { solverType: 'GLOP', executor }));
    const failed = new api.MathOpt.IncrementalSolver(model, 'GLOP', { executor });
    try { await preservesError(() => failed.solve()); } finally { await failed.close(); }
    results.push({ id: 'mathopt.correctness.unicode_errors', solver: 'mathopt', mode, ok: true as const });

    const solver = new api.MathOpt.IncrementalSolver(model, 'GLOP', { executor, removeNames: true });
    try {
      assert((await solver.solve()).hasSolution, 'Name removal is applied during construction');
      let rejected = false;
      try { await solver.solve({ removeNames: false } as never); }
      catch (error) { rejected = error instanceof TypeError && /fixed at construction/.test(error.message); }
      assert(rejected, 'Per-solve changes to name removal reject before dispatch');
      model.addVariable({ lowerBound: 0, upperBound: 1, name: '重复名称' });
      assert((await solver.solve()).hasSolution, 'New variables retain the constructor naming policy after rejection');
    } finally { await solver.close(); }
    results.push({ id: 'mathopt.correctness.incremental_name_options', solver: 'mathopt', mode, ok: true as const });
  }
  return results;
}
