import {
  type MPSolverRunOptions,
  runMPSolverContractCases,
  type MPSolverApi,
  type MpSolverCaseResult,
} from './cases/ortools/linear_solver/index.ts';

export type { MPSolverApi, MPSolverRunOptions, MpSolverCaseResult };

export async function runMPSolverCases(api: MPSolverApi, options: MPSolverRunOptions = {}): Promise<MpSolverCaseResult[]> {
  return runMPSolverContractCases(api, options);
}
