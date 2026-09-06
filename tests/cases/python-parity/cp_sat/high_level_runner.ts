import { runCpSatHighLevelParityCases } from './index.ts';
import type { CpSatExecutorConfiguration } from '../../../harness/cpsat_types.ts';

export { cpSatHighLevelParityCases, runCpSatHighLevelParityCases } from './index.ts';

type HighLevelCpSatPackage = {
  CpModel: unknown;
  CpSolver: unknown;
  CpSolverSolutionCallback: unknown;
  Domain: unknown;
  LinearExpr: unknown;
  DecisionStrategyProto_DomainReductionStrategy: unknown;
  DecisionStrategyProto_VariableSelectionStrategy: unknown;
  sum: unknown;
  weightedSum: unknown;
};

export function cpSatHighLevelApiFromPackage(api: HighLevelCpSatPackage) {
  let executor: CpSatExecutorConfiguration = { type: 'auto' };
  const BaseCpSolver = api.CpSolver as new () => {
    solve(model: unknown, options?: Record<string, unknown>): Promise<unknown>;
  };
  class FixtureCpSolver extends BaseCpSolver {
    override solve(model: unknown, options: Record<string, unknown> = {}) {
      return super.solve(model, { ...options, executor });
    }
  }
  const highLevelApi = {
    CpModel: api.CpModel,
    CpSolver: FixtureCpSolver,
    CpSolverSolutionCallback: api.CpSolverSolutionCallback,
    Domain: api.Domain,
    LinearExpr: api.LinearExpr,
    DecisionStrategyProto_DomainReductionStrategy: api.DecisionStrategyProto_DomainReductionStrategy,
    DecisionStrategyProto_VariableSelectionStrategy: api.DecisionStrategyProto_VariableSelectionStrategy,
    setFixtureExecutor: (configuration: CpSatExecutorConfiguration) => {
      executor = configuration;
    },
    sum: api.sum,
    weightedSum: api.weightedSum,
  };

  for (const [name, value] of Object.entries(highLevelApi)) {
    if (value === undefined || value === null) {
      throw new Error(`or-tools-wasm package is missing high-level CP-SAT export ${name}`);
    }
  }

  return highLevelApi;
}

export function runCpSatHighLevelParityCasesForPackage(api: HighLevelCpSatPackage) {
  return runCpSatHighLevelParityCases(cpSatHighLevelApiFromPackage(api) as never);
}
