// Generated from vendored MathOpt result schemas by scripts/generate_mathopt_result_types.mjs.
export type MathOptResultInt64 = number | bigint;

export type GScipOutput = {
  status?: number | GScipOutput_Status_Name;
  statusDetail?: string;
  stats?: GScipSolvingStats;
};

export enum GScipOutput_Status {
  UNKNOWN = 0,
  USER_INTERRUPT = 1,
  NODE_LIMIT = 2,
  TOTAL_NODE_LIMIT = 3,
  STALL_NODE_LIMIT = 4,
  TIME_LIMIT = 5,
  MEM_LIMIT = 6,
  GAP_LIMIT = 7,
  SOL_LIMIT = 8,
  BEST_SOL_LIMIT = 9,
  RESTART_LIMIT = 10,
  OPTIMAL = 11,
  INFEASIBLE = 12,
  UNBOUNDED = 13,
  INF_OR_UNBD = 14,
  TERMINATE = 15,
  INVALID_SOLVER_PARAMETERS = 16,
}
export type GScipOutput_Status_Name = "UNKNOWN" | "USER_INTERRUPT" | "NODE_LIMIT" | "TOTAL_NODE_LIMIT" | "STALL_NODE_LIMIT" | "TIME_LIMIT" | "MEM_LIMIT" | "GAP_LIMIT" | "SOL_LIMIT" | "BEST_SOL_LIMIT" | "RESTART_LIMIT" | "OPTIMAL" | "INFEASIBLE" | "UNBOUNDED" | "INF_OR_UNBD" | "TERMINATE" | "INVALID_SOLVER_PARAMETERS";

export type GScipSolvingStats = {
  bestObjective?: number;
  bestBound?: number;
  primalSimplexIterations?: MathOptResultInt64;
  dualSimplexIterations?: MathOptResultInt64;
  barrierIterations?: MathOptResultInt64;
  totalLpIterations?: MathOptResultInt64;
  nodeCount?: MathOptResultInt64;
  firstLpRelaxationBound?: number;
  rootNodeBound?: number;
  deterministicTime?: number;
};

export type math_opt_OsqpOutput = {
  initializedUnderlyingSolver?: boolean;
};

export type math_opt_SolveResultProto = {
  termination?: math_opt_TerminationProto;
  solutions?: Array<math_opt_SolutionProto>;
  primalRays?: Array<math_opt_PrimalRayProto>;
  dualRays?: Array<math_opt_DualRayProto>;
  solveStats?: math_opt_SolveStatsProto;
  gscipOutput?: GScipOutput;
  osqpOutput?: math_opt_OsqpOutput;
  pdlpOutput?: math_opt_SolveResultProto_PdlpOutput;
};

export type math_opt_TerminationProto = {
  reason?: number | math_opt_TerminationReasonProto_Name;
  limit?: number | math_opt_LimitProto_Name;
  detail?: string;
  problemStatus?: math_opt_ProblemStatusProto;
  objectiveBounds?: math_opt_ObjectiveBoundsProto;
};

export enum math_opt_TerminationReasonProto {
  TERMINATION_REASON_UNSPECIFIED = 0,
  TERMINATION_REASON_OPTIMAL = 1,
  TERMINATION_REASON_INFEASIBLE = 2,
  TERMINATION_REASON_UNBOUNDED = 3,
  TERMINATION_REASON_INFEASIBLE_OR_UNBOUNDED = 4,
  TERMINATION_REASON_IMPRECISE = 5,
  TERMINATION_REASON_FEASIBLE = 9,
  TERMINATION_REASON_NO_SOLUTION_FOUND = 6,
  TERMINATION_REASON_NUMERICAL_ERROR = 7,
  TERMINATION_REASON_OTHER_ERROR = 8,
}
export type math_opt_TerminationReasonProto_Name = "TERMINATION_REASON_UNSPECIFIED" | "TERMINATION_REASON_OPTIMAL" | "TERMINATION_REASON_INFEASIBLE" | "TERMINATION_REASON_UNBOUNDED" | "TERMINATION_REASON_INFEASIBLE_OR_UNBOUNDED" | "TERMINATION_REASON_IMPRECISE" | "TERMINATION_REASON_FEASIBLE" | "TERMINATION_REASON_NO_SOLUTION_FOUND" | "TERMINATION_REASON_NUMERICAL_ERROR" | "TERMINATION_REASON_OTHER_ERROR";

export enum math_opt_LimitProto {
  LIMIT_UNSPECIFIED = 0,
  LIMIT_UNDETERMINED = 1,
  LIMIT_ITERATION = 2,
  LIMIT_TIME = 3,
  LIMIT_NODE = 4,
  LIMIT_SOLUTION = 5,
  LIMIT_MEMORY = 6,
  LIMIT_CUTOFF = 12,
  LIMIT_OBJECTIVE = 7,
  LIMIT_NORM = 8,
  LIMIT_INTERRUPTED = 9,
  LIMIT_SLOW_PROGRESS = 10,
  LIMIT_OTHER = 11,
}
export type math_opt_LimitProto_Name = "LIMIT_UNSPECIFIED" | "LIMIT_UNDETERMINED" | "LIMIT_ITERATION" | "LIMIT_TIME" | "LIMIT_NODE" | "LIMIT_SOLUTION" | "LIMIT_MEMORY" | "LIMIT_CUTOFF" | "LIMIT_OBJECTIVE" | "LIMIT_NORM" | "LIMIT_INTERRUPTED" | "LIMIT_SLOW_PROGRESS" | "LIMIT_OTHER";

export type math_opt_ProblemStatusProto = {
  primalStatus?: number | math_opt_FeasibilityStatusProto_Name;
  dualStatus?: number | math_opt_FeasibilityStatusProto_Name;
  primalOrDualInfeasible?: boolean;
};

export enum math_opt_FeasibilityStatusProto {
  FEASIBILITY_STATUS_UNSPECIFIED = 0,
  FEASIBILITY_STATUS_UNDETERMINED = 1,
  FEASIBILITY_STATUS_FEASIBLE = 2,
  FEASIBILITY_STATUS_INFEASIBLE = 3,
}
export type math_opt_FeasibilityStatusProto_Name = "FEASIBILITY_STATUS_UNSPECIFIED" | "FEASIBILITY_STATUS_UNDETERMINED" | "FEASIBILITY_STATUS_FEASIBLE" | "FEASIBILITY_STATUS_INFEASIBLE";

export type math_opt_ObjectiveBoundsProto = {
  primalBound?: number;
  dualBound?: number;
};

export type math_opt_SolutionProto = {
  primalSolution?: math_opt_PrimalSolutionProto;
  dualSolution?: math_opt_DualSolutionProto;
  basis?: math_opt_BasisProto;
};

export type math_opt_PrimalSolutionProto = {
  variableValues?: math_opt_SparseDoubleVectorProto;
  objectiveValue?: number;
  auxiliaryObjectiveValues?: Record<string, number>;
  feasibilityStatus?: number | math_opt_SolutionStatusProto_Name;
};

export type math_opt_SparseDoubleVectorProto = {
  ids?: Array<MathOptResultInt64>;
  values?: Array<number>;
};

export enum math_opt_SolutionStatusProto {
  SOLUTION_STATUS_UNSPECIFIED = 0,
  SOLUTION_STATUS_UNDETERMINED = 1,
  SOLUTION_STATUS_FEASIBLE = 2,
  SOLUTION_STATUS_INFEASIBLE = 3,
}
export type math_opt_SolutionStatusProto_Name = "SOLUTION_STATUS_UNSPECIFIED" | "SOLUTION_STATUS_UNDETERMINED" | "SOLUTION_STATUS_FEASIBLE" | "SOLUTION_STATUS_INFEASIBLE";

export type math_opt_DualSolutionProto = {
  dualValues?: math_opt_SparseDoubleVectorProto;
  quadraticDualValues?: math_opt_SparseDoubleVectorProto;
  reducedCosts?: math_opt_SparseDoubleVectorProto;
  objectiveValue?: number;
  feasibilityStatus?: number | math_opt_SolutionStatusProto_Name;
};

export type math_opt_BasisProto = {
  constraintStatus?: math_opt_SparseBasisStatusVector;
  variableStatus?: math_opt_SparseBasisStatusVector;
  basicDualFeasibility?: number | math_opt_SolutionStatusProto_Name;
};

export type math_opt_SparseBasisStatusVector = {
  ids?: Array<MathOptResultInt64>;
  values?: Array<number | math_opt_BasisStatusProto_Name>;
};

export enum math_opt_BasisStatusProto {
  BASIS_STATUS_UNSPECIFIED = 0,
  BASIS_STATUS_FREE = 1,
  BASIS_STATUS_AT_LOWER_BOUND = 2,
  BASIS_STATUS_AT_UPPER_BOUND = 3,
  BASIS_STATUS_FIXED_VALUE = 4,
  BASIS_STATUS_BASIC = 5,
}
export type math_opt_BasisStatusProto_Name = "BASIS_STATUS_UNSPECIFIED" | "BASIS_STATUS_FREE" | "BASIS_STATUS_AT_LOWER_BOUND" | "BASIS_STATUS_AT_UPPER_BOUND" | "BASIS_STATUS_FIXED_VALUE" | "BASIS_STATUS_BASIC";

export type math_opt_PrimalRayProto = {
  variableValues?: math_opt_SparseDoubleVectorProto;
};

export type math_opt_DualRayProto = {
  dualValues?: math_opt_SparseDoubleVectorProto;
  reducedCosts?: math_opt_SparseDoubleVectorProto;
};

export type math_opt_SolveStatsProto = {
  solveTime?: MathOptDuration;
  bestPrimalBound?: number;
  bestDualBound?: number;
  problemStatus?: math_opt_ProblemStatusProto;
  simplexIterations?: MathOptResultInt64;
  barrierIterations?: MathOptResultInt64;
  firstOrderIterations?: MathOptResultInt64;
  nodeCount?: MathOptResultInt64;
};

export type MathOptDuration = {
  seconds?: MathOptResultInt64;
  nanos?: number;
};

export type math_opt_SolveResultProto_PdlpOutput = {
  convergenceInformation?: pdlp_ConvergenceInformation;
};

export type pdlp_ConvergenceInformation = {
  candidateType?: number | pdlp_PointType_Name;
  primalObjective?: number;
  dualObjective?: number;
  correctedDualObjective?: number;
  lInfPrimalResidual?: number;
  l2PrimalResidual?: number;
  lInfComponentwisePrimalResidual?: number;
  lInfDualResidual?: number;
  l2DualResidual?: number;
  lInfComponentwiseDualResidual?: number;
  lInfPrimalVariable?: number;
  l2PrimalVariable?: number;
  lInfDualVariable?: number;
  l2DualVariable?: number;
};

export enum pdlp_PointType {
  POINT_TYPE_UNSPECIFIED = 0,
  POINT_TYPE_CURRENT_ITERATE = 1,
  POINT_TYPE_ITERATE_DIFFERENCE = 2,
  POINT_TYPE_AVERAGE_ITERATE = 3,
  POINT_TYPE_NONE = 4,
  POINT_TYPE_PRESOLVER_SOLUTION = 5,
  POINT_TYPE_FEASIBILITY_POLISHING_SOLUTION = 6,
}
export type pdlp_PointType_Name = "POINT_TYPE_UNSPECIFIED" | "POINT_TYPE_CURRENT_ITERATE" | "POINT_TYPE_ITERATE_DIFFERENCE" | "POINT_TYPE_AVERAGE_ITERATE" | "POINT_TYPE_NONE" | "POINT_TYPE_PRESOLVER_SOLUTION" | "POINT_TYPE_FEASIBILITY_POLISHING_SOLUTION";
