import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function unsupported(action: () => unknown) {
  try { await action(); } catch (error) {
    assert(error instanceof Error && /not provide|not implement|unsupported|not support/i.test(error.message),
      `Expected native unsupported-operation error, received ${String(error)}`);
    return;
  }
  throw new Error('Bundled MathOpt backends must retain their upstream IIS capability errors');
}

export const mathOptIisCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.iis.native_capabilities', name: 'MathOpt IIS forwards native unsupported-operation errors', solver: 'mathopt',
  tags: ['native-contract', 'iis'],
  async run({ mathopt: api }, { mode }) {
    const execution = { executor: mode === 'server' ? serverExecutorConfiguration() : mode, threads: 1 };
    for (const solverType of ['GSCIP', 'GLOP', 'GLPK', 'CP_SAT', 'PDLP'] as const) {
      const model = api.MathOpt.Model('native IIS capability');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1, integer: solverType === 'CP_SAT' });
      model.addLinearConstraint({ lowerBound: 2, terms: [{ variable: x, coefficient: 1 }] });
      await unsupported(() => api.MathOpt.computeInfeasibleSubsystem(model, { ...execution, solverType }));
      await unsupported(() => api.MathOpt.computeInfeasibleSubsystemProto(model.encodeModelProto(), { ...execution, solverType }));
    }
    const recovery = api.MathOpt.Model(); recovery.addVariable({ lowerBound: 0, upperBound: 1 });
    assert((await api.MathOpt.solve(recovery, { ...execution, solverType: 'GSCIP' })).hasSolution,
      'Unsupported IIS queries leave the executor usable for ordinary solving');
    return {};
  },
}];
