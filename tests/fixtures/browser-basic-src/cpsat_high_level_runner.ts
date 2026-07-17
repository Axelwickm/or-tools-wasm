import { runCpSatHighLevelParityCases } from './cases/ortools/sat/index.ts';
import type { CpSatExecutorConfiguration } from './cpsat_types.ts';

export { cpSatHighLevelParityCases, runCpSatHighLevelParityCases } from './cases/ortools/sat/index.ts';

type HighLevelCpSatPackage = {
  CpSat: {
    setExecutor(configuration: CpSatExecutorConfiguration): void;
  };
  CpModel: unknown;
  ArithmeticError: unknown;
  BoundedLinearExpression: unknown;
  CpSolver: unknown;
  CpSolverSolutionCallback: unknown;
  Domain: unknown;
  FlatFloatExpr: unknown;
  FlatIntExpr: unknown;
  LinearExpr: unknown;
  NotImplementedError: unknown;
  DecisionStrategyProto_DomainReductionStrategy: unknown;
  DecisionStrategyProto_VariableSelectionStrategy: unknown;
  RuntimeError: unknown;
  ValueError: unknown;
  object_is_a_false_literal: unknown;
  object_is_a_true_literal: unknown;
  rebuild_from_linear_expression_proto: unknown;
  sum: unknown;
  weightedSum: unknown;
};

export function cpSatHighLevelApiFromPackage(api: HighLevelCpSatPackage) {
  const highLevelApi = {
    CpModel: api.CpModel,
    ArithmeticError: api.ArithmeticError,
    BoundedLinearExpression: api.BoundedLinearExpression,
    CpSolver: api.CpSolver,
    CpSolverSolutionCallback: api.CpSolverSolutionCallback,
    Domain: api.Domain,
    FlatFloatExpr: api.FlatFloatExpr,
    FlatIntExpr: api.FlatIntExpr,
    LinearExpr: api.LinearExpr,
    NotImplementedError: api.NotImplementedError,
    DecisionStrategyProto_DomainReductionStrategy: api.DecisionStrategyProto_DomainReductionStrategy,
    DecisionStrategyProto_VariableSelectionStrategy: api.DecisionStrategyProto_VariableSelectionStrategy,
    RuntimeError: api.RuntimeError,
    ValueError: api.ValueError,
    object_is_a_false_literal: api.object_is_a_false_literal,
    object_is_a_true_literal: api.object_is_a_true_literal,
    rebuild_from_linear_expression_proto: api.rebuild_from_linear_expression_proto,
    setExecutor: (configuration: CpSatExecutorConfiguration) => api.CpSat.setExecutor(configuration),
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
