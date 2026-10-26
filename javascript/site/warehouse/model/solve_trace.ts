/** Actual feasible solutions emitted by CP-SAT, plus its final search counters. */
export type SolveCandidate = { placement: number[]; seconds: number; average: number };
export type SolveTrace = {
  candidates: SolveCandidate[];
  solutions: number;
  branches: number;
  conflicts: number;
  seconds: number;
  status: string;
};
