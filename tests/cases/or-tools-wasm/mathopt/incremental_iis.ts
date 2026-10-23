import type { SharedCase, ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type { SolveResultApis } from '../solve_results.ts';

export const mathOptIncrementalIisCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'mathopt.incremental_iis.native_capabilities',
  name: 'Retained MathOpt IIS preserves native capability errors and closes its session', solver: 'mathopt',
  tags: ['native-contract', 'incremental', 'iis'],
  async run({ mathopt: api }, { mode }) {
    const options = { executor: mode === 'server' ? serverExecutorConfiguration() : mode, threads: 1 };
    const model = api.MathOpt.Model('retained native capability');
    model.addVariable({ lowerBound: 0, upperBound: 1 });
    for (const raw of [false, true]) {
      const session = raw
        ? new api.MathOpt.ProtoIncrementalSolver(model.encodeModelProto(), 'GSCIP', options)
        : new api.MathOpt.IncrementalSolver(model, 'GSCIP', options);
      try {
        let failure: unknown;
        try { await session.computeInfeasibleSubsystem(); } catch (error) { failure = error; }
        if (!(failure instanceof Error) || !/not provide|not implement|unsupported|not support/i.test(failure.message))
          throw new Error(`Expected native unsupported IIS error, received ${String(failure)}`);
      } finally { await session.close(); }
      await session.close();
    }
    return {};
  },
}];
