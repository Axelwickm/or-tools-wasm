import {
  runMPSolverContractCases,
  type MPSolverApi,
  type MpSolverCaseResult,
} from './cases/ortools/linear_solver/index.ts';

export type { MPSolverApi, MpSolverCaseResult };

export async function runMPSolverCases(api: MPSolverApi): Promise<MpSolverCaseResult[]> {
  return runMPSolverContractCases(api);
}
