import type { CpModelProto, CpSatApi, CpSolverResponse } from 'or-tools-wasm';

export type CpSatLike = CpSatApi;

export type SolverResponse = CpSolverResponse;

export type CpSatSolveParams = Record<string, unknown>;

export type CpSatCase = {
  name: string;
  source: string;
  model: CpModelProto;
  run(CpSat: CpSatLike, params: CpSatSolveParams): Promise<unknown>;
};
