// Generated from vendored MPSolver model/request/response schemas by scripts/generate_mp_solver_types.mjs.
export type MPSolverProtoInt64 = number | bigint;

export type MPModelRequest = {
  model?: MPModelProto;
  solverType?: number | MPModelRequest_SolverType_Name;
  solverTimeLimitSeconds?: number;
  enableInternalSolverOutput?: boolean;
  solverSpecificParameters?: string;
  ignoreSolverSpecificParametersFailure?: boolean;
  modelDelta?: MPModelDeltaProto;
  populateAdditionalSolutionsUpTo?: number;
};

export type MPModelProto = {
  variable?: ReadonlyArray<MPVariableProto>;
  constraint?: ReadonlyArray<MPConstraintProto>;
  generalConstraint?: ReadonlyArray<MPGeneralConstraintProto>;
  maximize?: boolean;
  objectiveOffset?: number;
  quadraticObjective?: MPQuadraticObjective;
  name?: string;
  solutionHint?: PartialVariableAssignment;
  annotation?: ReadonlyArray<MPModelProto_Annotation>;
};

export type MPVariableProto = {
  lowerBound?: number;
  upperBound?: number;
  objectiveCoefficient?: number;
  isInteger?: boolean;
  name?: string;
  branchingPriority?: number;
};

export type MPConstraintProto = {
  varIndex?: ReadonlyArray<number>;
  coefficient?: ReadonlyArray<number>;
  lowerBound?: number;
  upperBound?: number;
  name?: string;
  isLazy?: boolean;
};

export type MPGeneralConstraintProto = {
  name?: string;
  indicatorConstraint?: MPIndicatorConstraint;
  sosConstraint?: MPSosConstraint;
  quadraticConstraint?: MPQuadraticConstraint;
  absConstraint?: MPAbsConstraint;
  andConstraint?: MPArrayConstraint;
  orConstraint?: MPArrayConstraint;
  minConstraint?: MPArrayWithConstantConstraint;
  maxConstraint?: MPArrayWithConstantConstraint;
};

export type MPIndicatorConstraint = {
  varIndex?: number;
  varValue?: number;
  constraint?: MPConstraintProto;
};

export type MPSosConstraint = {
  type?: number | MPSosConstraint_Type_Name;
  varIndex?: ReadonlyArray<number>;
  weight?: ReadonlyArray<number>;
};

export enum MPSosConstraint_Type {
  SOS1_DEFAULT = 0,
  SOS2 = 1,
}
export type MPSosConstraint_Type_Name = "SOS1_DEFAULT" | "SOS2";

export type MPQuadraticConstraint = {
  varIndex?: ReadonlyArray<number>;
  coefficient?: ReadonlyArray<number>;
  qvar1Index?: ReadonlyArray<number>;
  qvar2Index?: ReadonlyArray<number>;
  qcoefficient?: ReadonlyArray<number>;
  lowerBound?: number;
  upperBound?: number;
};

export type MPAbsConstraint = {
  varIndex?: number;
  resultantVarIndex?: number;
};

export type MPArrayConstraint = {
  varIndex?: ReadonlyArray<number>;
  resultantVarIndex?: number;
};

export type MPArrayWithConstantConstraint = {
  varIndex?: ReadonlyArray<number>;
  constant?: number;
  resultantVarIndex?: number;
};

export type MPQuadraticObjective = {
  qvar1Index?: ReadonlyArray<number>;
  qvar2Index?: ReadonlyArray<number>;
  coefficient?: ReadonlyArray<number>;
};

export type PartialVariableAssignment = {
  varIndex?: ReadonlyArray<number>;
  varValue?: ReadonlyArray<number>;
};

export type MPModelProto_Annotation = {
  targetType?: number | MPModelProto_Annotation_TargetType_Name;
  targetIndex?: number;
  targetName?: string;
  payloadKey?: string;
  payloadValue?: string;
};

export enum MPModelProto_Annotation_TargetType {
  VARIABLE_DEFAULT = 0,
  CONSTRAINT = 1,
  GENERAL_CONSTRAINT = 2,
}
export type MPModelProto_Annotation_TargetType_Name = "VARIABLE_DEFAULT" | "CONSTRAINT" | "GENERAL_CONSTRAINT";

export enum MPModelRequest_SolverType {
  CLP_LINEAR_PROGRAMMING = 0,
  GLOP_LINEAR_PROGRAMMING = 2,
  GLPK_LINEAR_PROGRAMMING = 1,
  GUROBI_LINEAR_PROGRAMMING = 6,
  XPRESS_LINEAR_PROGRAMMING = 101,
  CPLEX_LINEAR_PROGRAMMING = 10,
  HIGHS_LINEAR_PROGRAMMING = 15,
  SCIP_MIXED_INTEGER_PROGRAMMING = 3,
  GLPK_MIXED_INTEGER_PROGRAMMING = 4,
  CBC_MIXED_INTEGER_PROGRAMMING = 5,
  GUROBI_MIXED_INTEGER_PROGRAMMING = 7,
  XPRESS_MIXED_INTEGER_PROGRAMMING = 102,
  CPLEX_MIXED_INTEGER_PROGRAMMING = 11,
  HIGHS_MIXED_INTEGER_PROGRAMMING = 16,
  BOP_INTEGER_PROGRAMMING = 12,
  SAT_INTEGER_PROGRAMMING = 14,
  PDLP_LINEAR_PROGRAMMING = 8,
  KNAPSACK_MIXED_INTEGER_PROGRAMMING = 13,
}
export type MPModelRequest_SolverType_Name = "CLP_LINEAR_PROGRAMMING" | "GLOP_LINEAR_PROGRAMMING" | "GLPK_LINEAR_PROGRAMMING" | "GUROBI_LINEAR_PROGRAMMING" | "XPRESS_LINEAR_PROGRAMMING" | "CPLEX_LINEAR_PROGRAMMING" | "HIGHS_LINEAR_PROGRAMMING" | "SCIP_MIXED_INTEGER_PROGRAMMING" | "GLPK_MIXED_INTEGER_PROGRAMMING" | "CBC_MIXED_INTEGER_PROGRAMMING" | "GUROBI_MIXED_INTEGER_PROGRAMMING" | "XPRESS_MIXED_INTEGER_PROGRAMMING" | "CPLEX_MIXED_INTEGER_PROGRAMMING" | "HIGHS_MIXED_INTEGER_PROGRAMMING" | "BOP_INTEGER_PROGRAMMING" | "SAT_INTEGER_PROGRAMMING" | "PDLP_LINEAR_PROGRAMMING" | "KNAPSACK_MIXED_INTEGER_PROGRAMMING";

export type MPModelDeltaProto = {
  baselineModelFilePath?: string;
  variableOverrides?: Record<string, MPVariableProto>;
  constraintOverrides?: Record<string, MPConstraintProto>;
};

export type MPSolutionResponse = {
  status?: number | MPSolverResponseStatus_Name;
  statusStr?: string;
  objectiveValue?: number;
  bestObjectiveBound?: number;
  variableValue?: Array<number>;
  solveInfo?: MPSolveInfo;
  solverSpecificInfo?: Uint8Array;
  dualValue?: Array<number>;
  reducedCost?: Array<number>;
  additionalSolutions?: Array<MPSolution>;
};

export enum MPSolverResponseStatus {
  MPSOLVER_OPTIMAL = 0,
  MPSOLVER_FEASIBLE = 1,
  MPSOLVER_INFEASIBLE = 2,
  MPSOLVER_UNBOUNDED = 3,
  MPSOLVER_ABNORMAL = 4,
  MPSOLVER_NOT_SOLVED = 6,
  MPSOLVER_MODEL_IS_VALID = 97,
  MPSOLVER_CANCELLED_BY_USER = 98,
  MPSOLVER_UNKNOWN_STATUS = 99,
  MPSOLVER_MODEL_INVALID = 5,
  MPSOLVER_MODEL_INVALID_SOLUTION_HINT = 84,
  MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS = 85,
  MPSOLVER_SOLVER_TYPE_UNAVAILABLE = 7,
  MPSOLVER_INCOMPATIBLE_OPTIONS = 113,
}
export type MPSolverResponseStatus_Name = "MPSOLVER_OPTIMAL" | "MPSOLVER_FEASIBLE" | "MPSOLVER_INFEASIBLE" | "MPSOLVER_UNBOUNDED" | "MPSOLVER_ABNORMAL" | "MPSOLVER_NOT_SOLVED" | "MPSOLVER_MODEL_IS_VALID" | "MPSOLVER_CANCELLED_BY_USER" | "MPSOLVER_UNKNOWN_STATUS" | "MPSOLVER_MODEL_INVALID" | "MPSOLVER_MODEL_INVALID_SOLUTION_HINT" | "MPSOLVER_MODEL_INVALID_SOLVER_PARAMETERS" | "MPSOLVER_SOLVER_TYPE_UNAVAILABLE" | "MPSOLVER_INCOMPATIBLE_OPTIONS";

export type MPSolveInfo = {
  solveWallTimeSeconds?: number;
  solveUserTimeSeconds?: number;
};

export type MPSolution = {
  objectiveValue?: number;
  variableValue?: Array<number>;
};
