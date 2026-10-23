// Generated from vendored MathOpt result and RPC schemas by scripts/generate_mathopt_result_types.mjs.
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

export type math_opt_ComputeInfeasibleSubsystemResultProto = {
  feasibility?: number | math_opt_FeasibilityStatusProto_Name;
  infeasibleSubsystem?: math_opt_ModelSubsetProto;
  isMinimal?: boolean;
};

export type math_opt_ModelSubsetProto = {
  variableBounds?: Record<string, math_opt_ModelSubsetProto_Bounds>;
  variableIntegrality?: Array<MathOptResultInt64>;
  linearConstraints?: Record<string, math_opt_ModelSubsetProto_Bounds>;
  quadraticConstraints?: Record<string, math_opt_ModelSubsetProto_Bounds>;
  secondOrderConeConstraints?: Array<MathOptResultInt64>;
  sos1Constraints?: Array<MathOptResultInt64>;
  sos2Constraints?: Array<MathOptResultInt64>;
  indicatorConstraints?: Array<MathOptResultInt64>;
};

export type math_opt_ModelSubsetProto_Bounds = {
  lower?: boolean;
  upper?: boolean;
};

export type math_opt_SolveRequest = {
  solverType?: number | math_opt_SolverTypeProto_Name;
  model?: math_opt_ModelProto;
  resources?: math_opt_SolverResourcesProto;
  initializer?: math_opt_SolverInitializerProto;
  parameters?: math_opt_SolveParametersProto;
  modelParameters?: math_opt_ModelSolveParametersProto;
};

export enum math_opt_SolverTypeProto {
  SOLVER_TYPE_UNSPECIFIED = 0,
  SOLVER_TYPE_GSCIP = 1,
  SOLVER_TYPE_GUROBI = 2,
  SOLVER_TYPE_GLOP = 3,
  SOLVER_TYPE_CP_SAT = 4,
  SOLVER_TYPE_PDLP = 5,
  SOLVER_TYPE_GLPK = 6,
  SOLVER_TYPE_OSQP = 7,
  SOLVER_TYPE_ECOS = 8,
  SOLVER_TYPE_SCS = 9,
  SOLVER_TYPE_HIGHS = 10,
  SOLVER_TYPE_SANTORINI = 11,
  SOLVER_TYPE_XPRESS = 13,
}
export type math_opt_SolverTypeProto_Name = "SOLVER_TYPE_UNSPECIFIED" | "SOLVER_TYPE_GSCIP" | "SOLVER_TYPE_GUROBI" | "SOLVER_TYPE_GLOP" | "SOLVER_TYPE_CP_SAT" | "SOLVER_TYPE_PDLP" | "SOLVER_TYPE_GLPK" | "SOLVER_TYPE_OSQP" | "SOLVER_TYPE_ECOS" | "SOLVER_TYPE_SCS" | "SOLVER_TYPE_HIGHS" | "SOLVER_TYPE_SANTORINI" | "SOLVER_TYPE_XPRESS";

export type math_opt_ModelProto = {
  name?: string;
  variables?: math_opt_VariablesProto;
  objective?: math_opt_ObjectiveProto;
  auxiliaryObjectives?: Record<string, math_opt_ObjectiveProto>;
  linearConstraints?: math_opt_LinearConstraintsProto;
  linearConstraintMatrix?: math_opt_SparseDoubleMatrixProto;
  quadraticConstraints?: Record<string, math_opt_QuadraticConstraintProto>;
  secondOrderConeConstraints?: Record<string, math_opt_SecondOrderConeConstraintProto>;
  sos1Constraints?: Record<string, math_opt_SosConstraintProto>;
  sos2Constraints?: Record<string, math_opt_SosConstraintProto>;
  indicatorConstraints?: Record<string, math_opt_IndicatorConstraintProto>;
};

export type math_opt_VariablesProto = {
  ids?: Array<MathOptResultInt64>;
  lowerBounds?: Array<number>;
  upperBounds?: Array<number>;
  integers?: Array<boolean>;
  names?: Array<string>;
};

export type math_opt_ObjectiveProto = {
  maximize?: boolean;
  offset?: number;
  linearCoefficients?: math_opt_SparseDoubleVectorProto;
  quadraticCoefficients?: math_opt_SparseDoubleMatrixProto;
  name?: string;
  priority?: MathOptResultInt64;
};

export type math_opt_SparseDoubleMatrixProto = {
  rowIds?: Array<MathOptResultInt64>;
  columnIds?: Array<MathOptResultInt64>;
  coefficients?: Array<number>;
};

export type math_opt_LinearConstraintsProto = {
  ids?: Array<MathOptResultInt64>;
  lowerBounds?: Array<number>;
  upperBounds?: Array<number>;
  names?: Array<string>;
};

export type math_opt_QuadraticConstraintProto = {
  linearTerms?: math_opt_SparseDoubleVectorProto;
  quadraticTerms?: math_opt_SparseDoubleMatrixProto;
  lowerBound?: number;
  upperBound?: number;
  name?: string;
};

export type math_opt_SecondOrderConeConstraintProto = {
  upperBound?: math_opt_LinearExpressionProto;
  argumentsToNorm?: Array<math_opt_LinearExpressionProto>;
  name?: string;
};

export type math_opt_LinearExpressionProto = {
  ids?: Array<MathOptResultInt64>;
  coefficients?: Array<number>;
  offset?: number;
};

export type math_opt_SosConstraintProto = {
  expressions?: Array<math_opt_LinearExpressionProto>;
  weights?: Array<number>;
  name?: string;
};

export type math_opt_IndicatorConstraintProto = {
  indicatorId?: MathOptResultInt64;
  activateOnZero?: boolean;
  expression?: math_opt_SparseDoubleVectorProto;
  lowerBound?: number;
  upperBound?: number;
  name?: string;
};

export type math_opt_SolverResourcesProto = {
  cpu?: number;
  ram?: number;
};

export type math_opt_SolverInitializerProto = {
  gurobi?: math_opt_GurobiInitializerProto;
  xpress?: math_opt_XpressInitializerProto;
};

export type math_opt_GurobiInitializerProto = {
  isvKey?: math_opt_GurobiInitializerProto_ISVKey;
};

export type math_opt_GurobiInitializerProto_ISVKey = {
  name?: string;
  applicationName?: string;
  expiration?: number;
  key?: string;
};

export type math_opt_XpressInitializerProto = {
  extractNames?: boolean;
};

export type math_opt_SolveParametersProto = {
  timeLimit?: MathOptDuration;
  iterationLimit?: MathOptResultInt64;
  nodeLimit?: MathOptResultInt64;
  cutoffLimit?: number;
  objectiveLimit?: number;
  bestBoundLimit?: number;
  solutionLimit?: number;
  enableOutput?: boolean;
  threads?: number;
  randomSeed?: number;
  absoluteGapTolerance?: number;
  relativeGapTolerance?: number;
  solutionPoolSize?: number;
  lpAlgorithm?: number | math_opt_LPAlgorithmProto_Name;
  presolve?: number | math_opt_EmphasisProto_Name;
  cuts?: number | math_opt_EmphasisProto_Name;
  heuristics?: number | math_opt_EmphasisProto_Name;
  scaling?: number | math_opt_EmphasisProto_Name;
  gscip?: GScipParameters;
  gurobi?: math_opt_GurobiParametersProto;
  glop?: glop_GlopParameters;
  cpSat?: sat_SatParameters;
  pdlp?: pdlp_PrimalDualHybridGradientParams;
  osqp?: math_opt_OsqpSettingsProto;
  glpk?: math_opt_GlpkParametersProto;
  highs?: math_opt_HighsOptionsProto;
  xpress?: math_opt_XpressParametersProto;
};

export enum math_opt_LPAlgorithmProto {
  LP_ALGORITHM_UNSPECIFIED = 0,
  LP_ALGORITHM_PRIMAL_SIMPLEX = 1,
  LP_ALGORITHM_DUAL_SIMPLEX = 2,
  LP_ALGORITHM_BARRIER = 3,
  LP_ALGORITHM_FIRST_ORDER = 4,
}
export type math_opt_LPAlgorithmProto_Name = "LP_ALGORITHM_UNSPECIFIED" | "LP_ALGORITHM_PRIMAL_SIMPLEX" | "LP_ALGORITHM_DUAL_SIMPLEX" | "LP_ALGORITHM_BARRIER" | "LP_ALGORITHM_FIRST_ORDER";

export enum math_opt_EmphasisProto {
  EMPHASIS_UNSPECIFIED = 0,
  EMPHASIS_OFF = 1,
  EMPHASIS_LOW = 2,
  EMPHASIS_MEDIUM = 3,
  EMPHASIS_HIGH = 4,
  EMPHASIS_VERY_HIGH = 5,
}
export type math_opt_EmphasisProto_Name = "EMPHASIS_UNSPECIFIED" | "EMPHASIS_OFF" | "EMPHASIS_LOW" | "EMPHASIS_MEDIUM" | "EMPHASIS_HIGH" | "EMPHASIS_VERY_HIGH";

export type GScipParameters = {
  emphasis?: number | GScipParameters_Emphasis_Name;
  heuristics?: number | GScipParameters_MetaParamValue_Name;
  presolve?: number | GScipParameters_MetaParamValue_Name;
  separating?: number | GScipParameters_MetaParamValue_Name;
  boolParams?: Record<string, boolean>;
  intParams?: Record<string, number>;
  longParams?: Record<string, MathOptResultInt64>;
  realParams?: Record<string, number>;
  charParams?: Record<string, string>;
  stringParams?: Record<string, string>;
  silenceOutput?: boolean;
  printDetailedSolvingStats?: boolean;
  printScipModel?: boolean;
  searchLogsFilename?: string;
  detailedSolvingStatsFilename?: string;
  scipModelFilename?: string;
  numSolutions?: number;
  objectiveLimit?: number;
};

export enum GScipParameters_Emphasis {
  DEFAULT_EMPHASIS = 0,
  COUNTER = 1,
  CP_SOLVER = 2,
  EASY_CIP = 3,
  FEASIBILITY = 4,
  HARD_LP = 5,
  OPTIMALITY = 6,
  PHASE_FEAS = 7,
  PHASE_IMPROVE = 8,
  PHASE_PROOF = 9,
}
export type GScipParameters_Emphasis_Name = "DEFAULT_EMPHASIS" | "COUNTER" | "CP_SOLVER" | "EASY_CIP" | "FEASIBILITY" | "HARD_LP" | "OPTIMALITY" | "PHASE_FEAS" | "PHASE_IMPROVE" | "PHASE_PROOF";

export enum GScipParameters_MetaParamValue {
  DEFAULT_META_PARAM_VALUE = 0,
  AGGRESSIVE = 1,
  FAST = 2,
  OFF = 3,
}
export type GScipParameters_MetaParamValue_Name = "DEFAULT_META_PARAM_VALUE" | "AGGRESSIVE" | "FAST" | "OFF";

export type math_opt_GurobiParametersProto = {
  parameters?: Array<math_opt_GurobiParametersProto_Parameter>;
};

export type math_opt_GurobiParametersProto_Parameter = {
  name?: string;
  value?: string;
};

export type glop_GlopParameters = {
  scalingMethod?: number | glop_GlopParameters_ScalingAlgorithm_Name;
  feasibilityRule?: number | glop_GlopParameters_PricingRule_Name;
  optimizationRule?: number | glop_GlopParameters_PricingRule_Name;
  refactorizationThreshold?: number;
  recomputeReducedCostsThreshold?: number;
  recomputeEdgesNormThreshold?: number;
  primalFeasibilityTolerance?: number;
  dualFeasibilityTolerance?: number;
  ratioTestZeroThreshold?: number;
  harrisToleranceRatio?: number;
  smallPivotThreshold?: number;
  minimumAcceptablePivot?: number;
  dropTolerance?: number;
  useScaling?: boolean;
  costScaling?: number | glop_GlopParameters_CostScalingAlgorithm_Name;
  initialBasis?: number | glop_GlopParameters_InitialBasisHeuristic_Name;
  useTransposedMatrix?: boolean;
  basisRefactorizationPeriod?: number;
  dynamicallyAdjustRefactorizationPeriod?: boolean;
  solveDualProblem?: number | glop_GlopParameters_SolverBehavior_Name;
  dualizerThreshold?: number;
  solutionFeasibilityTolerance?: number;
  provideStrongOptimalGuarantee?: boolean;
  changeStatusToImprecise?: boolean;
  maxNumberOfReoptimizations?: number;
  luFactorizationPivotThreshold?: number;
  maxTimeInSeconds?: number;
  maxDeterministicTime?: number;
  maxNumberOfIterations?: MathOptResultInt64;
  markowitzZlatevParameter?: number;
  markowitzSingularityThreshold?: number;
  useDualSimplex?: boolean;
  allowSimplexAlgorithmChange?: boolean;
  devexWeightsResetPeriod?: number;
  usePreprocessing?: boolean;
  useMiddleProductFormUpdate?: boolean;
  initializeDevexWithColumnNorms?: boolean;
  exploitSingletonColumnInInitialBasis?: boolean;
  dualSmallPivotThreshold?: number;
  preprocessorZeroTolerance?: number;
  objectiveLowerLimit?: number;
  objectiveUpperLimit?: number;
  degenerateMinistepFactor?: number;
  randomSeed?: number;
  useAbslRandom?: boolean;
  numOmpThreads?: number;
  perturbCostsInDualSimplex?: boolean;
  useDedicatedDualFeasibilityAlgorithm?: boolean;
  relativeCostPerturbation?: number;
  relativeMaxCostPerturbation?: number;
  initialConditionNumberThreshold?: number;
  logSearchProgress?: boolean;
  logToStdout?: boolean;
  crossoverBoundSnappingDistance?: number;
  pushToVertex?: boolean;
  useImpliedFreePreprocessor?: boolean;
  maxValidMagnitude?: number;
  dropMagnitude?: number;
  dualPricePrioritizeNorm?: boolean;
};

export enum glop_GlopParameters_ScalingAlgorithm {
  DEFAULT = 0,
  EQUILIBRATION = 1,
  LINEAR_PROGRAM = 2,
}
export type glop_GlopParameters_ScalingAlgorithm_Name = "DEFAULT" | "EQUILIBRATION" | "LINEAR_PROGRAM";

export enum glop_GlopParameters_PricingRule {
  DANTZIG = 0,
  STEEPEST_EDGE = 1,
  DEVEX = 2,
}
export type glop_GlopParameters_PricingRule_Name = "DANTZIG" | "STEEPEST_EDGE" | "DEVEX";

export enum glop_GlopParameters_CostScalingAlgorithm {
  NO_COST_SCALING = 0,
  CONTAIN_ONE_COST_SCALING = 1,
  MEAN_COST_SCALING = 2,
  MEDIAN_COST_SCALING = 3,
}
export type glop_GlopParameters_CostScalingAlgorithm_Name = "NO_COST_SCALING" | "CONTAIN_ONE_COST_SCALING" | "MEAN_COST_SCALING" | "MEDIAN_COST_SCALING";

export enum glop_GlopParameters_InitialBasisHeuristic {
  NONE = 0,
  BIXBY = 1,
  TRIANGULAR = 2,
  MAROS = 3,
}
export type glop_GlopParameters_InitialBasisHeuristic_Name = "NONE" | "BIXBY" | "TRIANGULAR" | "MAROS";

export enum glop_GlopParameters_SolverBehavior {
  ALWAYS_DO = 0,
  NEVER_DO = 1,
  LET_SOLVER_DECIDE = 2,
}
export type glop_GlopParameters_SolverBehavior_Name = "ALWAYS_DO" | "NEVER_DO" | "LET_SOLVER_DECIDE";

export type sat_SatParameters = {
  name?: string;
  preferredVariableOrder?: number | sat_SatParameters_VariableOrder_Name;
  initialPolarity?: number | sat_SatParameters_Polarity_Name;
  usePhaseSaving?: boolean;
  polarityRephaseIncrement?: number;
  polarityExploitLsHints?: boolean;
  randomPolarityRatio?: number;
  randomBranchesRatio?: number;
  useErwaHeuristic?: boolean;
  initialVariablesActivity?: number;
  alsoBumpVariablesInConflictReasons?: boolean;
  minimizationAlgorithm?: number | sat_SatParameters_ConflictMinimizationAlgorithm_Name;
  binaryMinimizationAlgorithm?: number | sat_SatParameters_BinaryMinizationAlgorithm_Name;
  subsumptionDuringConflictAnalysis?: boolean;
  extraSubsumptionDuringConflictAnalysis?: boolean;
  decisionSubsumptionDuringConflictAnalysis?: boolean;
  eagerlySubsumeLastNConflicts?: number;
  subsumeDuringVivification?: boolean;
  useChronologicalBacktracking?: boolean;
  maxBackjumpLevels?: number;
  chronologicalBacktrackMinConflicts?: number;
  clauseCleanupPeriod?: number;
  clauseCleanupPeriodIncrement?: number;
  clauseCleanupTarget?: number;
  clauseCleanupRatio?: number;
  clauseCleanupLbdBound?: number;
  clauseCleanupLbdTier1?: number;
  clauseCleanupLbdTier2?: number;
  clauseCleanupOrdering?: number | sat_SatParameters_ClauseOrdering_Name;
  pbCleanupIncrement?: number;
  pbCleanupRatio?: number;
  variableActivityDecay?: number;
  maxVariableActivityValue?: number;
  glucoseMaxDecay?: number;
  glucoseDecayIncrement?: number;
  glucoseDecayIncrementPeriod?: number;
  clauseActivityDecay?: number;
  maxClauseActivityValue?: number;
  restartAlgorithms?: Array<number | sat_SatParameters_RestartAlgorithm_Name>;
  defaultRestartAlgorithms?: string;
  restartPeriod?: number;
  restartRunningWindowSize?: number;
  restartDlAverageRatio?: number;
  restartLbdAverageRatio?: number;
  useBlockingRestart?: boolean;
  blockingRestartWindowSize?: number;
  blockingRestartMultiplier?: number;
  numConflictsBeforeStrategyChanges?: number;
  strategyChangeIncreaseRatio?: number;
  maxTimeInSeconds?: number;
  maxDeterministicTime?: number;
  maxNumDeterministicBatches?: number;
  maxNumberOfConflicts?: MathOptResultInt64;
  maxMemoryInMb?: MathOptResultInt64;
  absoluteGapLimit?: number;
  relativeGapLimit?: number;
  randomSeed?: number;
  permuteVariableRandomly?: boolean;
  permutePresolveConstraintOrder?: boolean;
  useAbslRandom?: boolean;
  logSearchProgress?: boolean;
  logSubsolverStatistics?: boolean;
  logPrefix?: string;
  logToStdout?: boolean;
  logToResponse?: boolean;
  usePbResolution?: boolean;
  minimizeReductionDuringPbResolution?: boolean;
  countAssumptionLevelsInLbd?: boolean;
  presolveBveThreshold?: number;
  filterSatPostsolveClauses?: boolean;
  presolveBveClauseWeight?: number;
  probingDeterministicTimeLimit?: number;
  presolveProbingDeterministicTimeLimit?: number;
  presolveBlockedClause?: boolean;
  presolveUseBva?: boolean;
  presolveBvaThreshold?: number;
  maxPresolveIterations?: number;
  cpModelPresolve?: boolean;
  cpModelProbingLevel?: number;
  cpModelUseSatPresolve?: boolean;
  loadAtMostOnesInSatPresolve?: boolean;
  removeFixedVariablesEarly?: boolean;
  detectTableWithCost?: boolean;
  tableCompressionLevel?: number;
  expandAlldiffConstraints?: boolean;
  maxAlldiffDomainSize?: number;
  expandReservoirConstraints?: boolean;
  maxDomainSizeForLinear2Expansion?: number;
  expandReservoirUsingCircuit?: boolean;
  encodeCumulativeAsReservoir?: boolean;
  maxLinMaxSizeForExpansion?: number;
  disableConstraintExpansion?: boolean;
  encodeComplexLinearConstraintWithInteger?: boolean;
  mergeNoOverlapWorkLimit?: number;
  mergeAtMostOneWorkLimit?: number;
  presolveSubstitutionLevel?: number;
  presolveExtractIntegerEnforcement?: boolean;
  presolveInclusionWorkLimit?: MathOptResultInt64;
  ignoreNames?: boolean;
  inferAllDiffs?: boolean;
  findBigLinearOverlap?: boolean;
  findClausesThatAreExactlyOne?: boolean;
  useSatInprocessing?: boolean;
  inprocessingDtimeRatio?: number;
  inprocessingProbingDtime?: number;
  inprocessingMinimizationDtime?: number;
  inprocessingMinimizationUseConflictAnalysis?: boolean;
  inprocessingMinimizationUseAllOrderings?: boolean;
  inprocessingUseCongruenceClosure?: boolean;
  inprocessingUseSatSweeping?: boolean;
  numWorkers?: number;
  numSearchWorkers?: number;
  numFullSubsolvers?: number;
  subsolvers?: Array<string>;
  extraSubsolvers?: Array<string>;
  ignoreSubsolvers?: Array<string>;
  filterSubsolvers?: Array<string>;
  subsolverParams?: Array<sat_SatParameters>;
  interleaveSearch?: boolean;
  interleaveBatchSize?: number;
  shareObjectiveBounds?: boolean;
  shareLevelZeroBounds?: boolean;
  shareLinear2Bounds?: boolean;
  shareBinaryClauses?: boolean;
  shareGlueClauses?: boolean;
  minimizeSharedClauses?: boolean;
  shareGlueClausesDtime?: number;
  checkLratProof?: boolean;
  checkMergedLratProof?: boolean;
  outputLratProof?: boolean;
  checkDratProof?: boolean;
  outputDratProof?: boolean;
  maxDratTimeInSeconds?: number;
  debugPostsolveWithFullSolver?: boolean;
  debugMaxNumPresolveOperations?: number;
  debugCrashOnBadHint?: boolean;
  debugCrashIfPresolveBreaksHint?: boolean;
  debugCrashIfLratCheckFails?: boolean;
  useOptimizationHints?: boolean;
  coreMinimizationLevel?: number;
  findMultipleCores?: boolean;
  coverOptimization?: boolean;
  maxSatAssumptionOrder?: number | sat_SatParameters_MaxSatAssumptionOrder_Name;
  maxSatReverseAssumptionOrder?: boolean;
  maxSatStratification?: number | sat_SatParameters_MaxSatStratificationAlgorithm_Name;
  propagationLoopDetectionFactor?: number;
  usePrecedencesInDisjunctiveConstraint?: boolean;
  transitivePrecedencesWorkLimit?: number;
  maxSizeToCreatePrecedenceLiteralsInDisjunctive?: number;
  useStrongPropagationInDisjunctive?: boolean;
  useDynamicPrecedenceInDisjunctive?: boolean;
  useDynamicPrecedenceInCumulative?: boolean;
  useOverloadCheckerInCumulative?: boolean;
  useConservativeScaleOverloadChecker?: boolean;
  useTimetableEdgeFindingInCumulative?: boolean;
  maxNumIntervalsForTimetableEdgeFinding?: number;
  useHardPrecedencesInCumulative?: boolean;
  exploitAllPrecedences?: boolean;
  useDisjunctiveConstraintInCumulative?: boolean;
  noOverlap_2dBooleanRelationsLimit?: number;
  useTimetablingInNoOverlap_2d?: boolean;
  useEnergeticReasoningInNoOverlap_2d?: boolean;
  useAreaEnergeticReasoningInNoOverlap_2d?: boolean;
  useTryEdgeReasoningInNoOverlap_2d?: boolean;
  maxPairsPairwiseReasoningInNoOverlap_2d?: number;
  maximumRegionsToSplitInDisconnectedNoOverlap_2d?: number;
  useLinear3ForNoOverlap_2dPrecedences?: boolean;
  useDualSchedulingHeuristics?: boolean;
  useAllDifferentForCircuit?: boolean;
  routingCutSubsetSizeForBinaryRelationBound?: number;
  routingCutSubsetSizeForTightBinaryRelationBound?: number;
  routingCutSubsetSizeForExactBinaryRelationBound?: number;
  routingCutSubsetSizeForShortestPathsBound?: number;
  routingCutDpEffort?: number;
  routingCutMaxInfeasiblePathLength?: number;
  searchBranching?: number | sat_SatParameters_SearchBranching_Name;
  hintConflictLimit?: number;
  repairHint?: boolean;
  fixVariablesToTheirHintedValue?: boolean;
  useProbingSearch?: boolean;
  useExtendedProbing?: boolean;
  probingNumCombinationsLimit?: number;
  shavingDeterministicTimeInProbingSearch?: number;
  shavingSearchDeterministicTime?: number;
  shavingSearchThreshold?: MathOptResultInt64;
  useObjectiveLbSearch?: boolean;
  useObjectiveShavingSearch?: boolean;
  variablesShavingLevel?: number;
  pseudoCostReliabilityThreshold?: MathOptResultInt64;
  optimizeWithCore?: boolean;
  optimizeWithLbTreeSearch?: boolean;
  saveLpBasisInLbTreeSearch?: boolean;
  binarySearchNumConflicts?: number;
  optimizeWithMaxHs?: boolean;
  useFeasibilityJump?: boolean;
  useLsOnly?: boolean;
  feasibilityJumpDecay?: number;
  feasibilityJumpLinearizationLevel?: number;
  feasibilityJumpRestartFactor?: number;
  feasibilityJumpBatchDtime?: number;
  feasibilityJumpVarRandomizationProbability?: number;
  feasibilityJumpVarPerburbationRangeRatio?: number;
  feasibilityJumpEnableRestarts?: boolean;
  feasibilityJumpMaxExpandedConstraintSize?: number;
  numViolationLs?: number;
  violationLsPerturbationPeriod?: number;
  violationLsCompoundMoveProbability?: number;
  sharedTreeNumWorkers?: number;
  useSharedTreeSearch?: boolean;
  sharedTreeWorkerMinRestartsPerSubtree?: number;
  sharedTreeWorkerEnableTrailSharing?: boolean;
  sharedTreeWorkerEnablePhaseSharing?: boolean;
  sharedTreeOpenLeavesPerWorker?: number;
  sharedTreeMaxNodesPerWorker?: number;
  sharedTreeSplitStrategy?: number | sat_SatParameters_SharedTreeSplitStrategy_Name;
  sharedTreeBalanceTolerance?: number;
  sharedTreeSplitMinDtime?: number;
  enumerateAllSolutions?: boolean;
  keepAllFeasibleSolutionsInPresolve?: boolean;
  fillTightenedDomainsInResponse?: boolean;
  fillAdditionalSolutionsInResponse?: boolean;
  instantiateAllVariables?: boolean;
  autoDetectGreaterThanAtLeastOneOf?: boolean;
  stopAfterFirstSolution?: boolean;
  stopAfterPresolve?: boolean;
  stopAfterRootPropagation?: boolean;
  lnsInitialDifficulty?: number;
  lnsInitialDeterministicLimit?: number;
  useLns?: boolean;
  useLnsOnly?: boolean;
  solutionPoolSize?: number;
  solutionPoolDiversityLimit?: number;
  alternativePoolSize?: number;
  useRinsLns?: boolean;
  useFeasibilityPump?: boolean;
  useLbRelaxLns?: boolean;
  lbRelaxNumWorkersThreshold?: number;
  fpRounding?: number | sat_SatParameters_FPRoundingMethod_Name;
  diversifyLnsParams?: boolean;
  randomizeSearch?: boolean;
  searchRandomVariablePoolSize?: MathOptResultInt64;
  pushAllTasksTowardStart?: boolean;
  useOptionalVariables?: boolean;
  useExactLpReason?: boolean;
  useCombinedNoOverlap?: boolean;
  atMostOneMaxExpansionSize?: number;
  catchSigintSignal?: boolean;
  useImpliedBounds?: boolean;
  polishLpSolution?: boolean;
  lpPrimalTolerance?: number;
  lpDualTolerance?: number;
  convertIntervals?: boolean;
  symmetryLevel?: number;
  useSymmetryInLp?: boolean;
  keepSymmetryInPresolve?: boolean;
  symmetryDetectionDeterministicTimeLimit?: number;
  newLinearPropagation?: boolean;
  linearSplitSize?: number;
  linearizationLevel?: number;
  booleanEncodingLevel?: number;
  maxDomainSizeWhenEncodingEqNeqConstraints?: number;
  maxNumCuts?: number;
  cutLevel?: number;
  onlyAddCutsAtLevelZero?: boolean;
  addObjectiveCut?: boolean;
  addCgCuts?: boolean;
  addMirCuts?: boolean;
  addZeroHalfCuts?: boolean;
  addCliqueCuts?: boolean;
  addRltCuts?: boolean;
  maxAllDiffCutSize?: number;
  addLinMaxCuts?: boolean;
  maxIntegerRoundingScaling?: number;
  addLpConstraintsLazily?: boolean;
  rootLpIterations?: number;
  minOrthogonalityForLpConstraints?: number;
  maxCutRoundsAtLevelZero?: number;
  maxConsecutiveInactiveCount?: number;
  cutMaxActiveCountValue?: number;
  cutActiveCountDecay?: number;
  cutCleanupTarget?: number;
  newConstraintsBatchSize?: number;
  exploitIntegerLpSolution?: boolean;
  exploitAllLpSolution?: boolean;
  exploitBestSolution?: boolean;
  exploitRelaxationSolution?: boolean;
  exploitObjective?: boolean;
  detectLinearizedProduct?: boolean;
  useNewIntegerConflictResolution?: boolean;
  create_1uipBooleanDuringIcr?: boolean;
  mipMaxBound?: number;
  mipVarScaling?: number;
  mipScaleLargeDomain?: boolean;
  mipAutomaticallyScaleVariables?: boolean;
  onlySolveIp?: boolean;
  mipWantedPrecision?: number;
  mipMaxActivityExponent?: number;
  mipCheckPrecision?: number;
  mipComputeTrueObjectiveBound?: boolean;
  mipMaxValidMagnitude?: number;
  mipTreatHighMagnitudeBoundsAsInfinity?: boolean;
  mipDropTolerance?: number;
  mipPresolveLevel?: number;
};

export enum sat_SatParameters_VariableOrder {
  IN_ORDER = 0,
  IN_REVERSE_ORDER = 1,
  IN_RANDOM_ORDER = 2,
}
export type sat_SatParameters_VariableOrder_Name = "IN_ORDER" | "IN_REVERSE_ORDER" | "IN_RANDOM_ORDER";

export enum sat_SatParameters_Polarity {
  POLARITY_TRUE = 0,
  POLARITY_FALSE = 1,
  POLARITY_RANDOM = 2,
}
export type sat_SatParameters_Polarity_Name = "POLARITY_TRUE" | "POLARITY_FALSE" | "POLARITY_RANDOM";

export enum sat_SatParameters_ConflictMinimizationAlgorithm {
  NONE = 0,
  SIMPLE = 1,
  RECURSIVE = 2,
}
export type sat_SatParameters_ConflictMinimizationAlgorithm_Name = "NONE" | "SIMPLE" | "RECURSIVE";

export enum sat_SatParameters_BinaryMinizationAlgorithm {
  NO_BINARY_MINIMIZATION = 0,
  BINARY_MINIMIZATION_FROM_UIP = 1,
  BINARY_MINIMIZATION_FROM_UIP_AND_DECISIONS = 5,
}
export type sat_SatParameters_BinaryMinizationAlgorithm_Name = "NO_BINARY_MINIMIZATION" | "BINARY_MINIMIZATION_FROM_UIP" | "BINARY_MINIMIZATION_FROM_UIP_AND_DECISIONS";

export enum sat_SatParameters_ClauseOrdering {
  CLAUSE_ACTIVITY = 0,
  CLAUSE_LBD = 1,
}
export type sat_SatParameters_ClauseOrdering_Name = "CLAUSE_ACTIVITY" | "CLAUSE_LBD";

export enum sat_SatParameters_RestartAlgorithm {
  NO_RESTART = 0,
  LUBY_RESTART = 1,
  DL_MOVING_AVERAGE_RESTART = 2,
  LBD_MOVING_AVERAGE_RESTART = 3,
  FIXED_RESTART = 4,
}
export type sat_SatParameters_RestartAlgorithm_Name = "NO_RESTART" | "LUBY_RESTART" | "DL_MOVING_AVERAGE_RESTART" | "LBD_MOVING_AVERAGE_RESTART" | "FIXED_RESTART";

export enum sat_SatParameters_MaxSatAssumptionOrder {
  DEFAULT_ASSUMPTION_ORDER = 0,
  ORDER_ASSUMPTION_BY_DEPTH = 1,
  ORDER_ASSUMPTION_BY_WEIGHT = 2,
}
export type sat_SatParameters_MaxSatAssumptionOrder_Name = "DEFAULT_ASSUMPTION_ORDER" | "ORDER_ASSUMPTION_BY_DEPTH" | "ORDER_ASSUMPTION_BY_WEIGHT";

export enum sat_SatParameters_MaxSatStratificationAlgorithm {
  STRATIFICATION_NONE = 0,
  STRATIFICATION_DESCENT = 1,
  STRATIFICATION_ASCENT = 2,
}
export type sat_SatParameters_MaxSatStratificationAlgorithm_Name = "STRATIFICATION_NONE" | "STRATIFICATION_DESCENT" | "STRATIFICATION_ASCENT";

export enum sat_SatParameters_SearchBranching {
  AUTOMATIC_SEARCH = 0,
  FIXED_SEARCH = 1,
  PORTFOLIO_SEARCH = 2,
  LP_SEARCH = 3,
  PSEUDO_COST_SEARCH = 4,
  PORTFOLIO_WITH_QUICK_RESTART_SEARCH = 5,
  HINT_SEARCH = 6,
  PARTIAL_FIXED_SEARCH = 7,
  RANDOMIZED_SEARCH = 8,
}
export type sat_SatParameters_SearchBranching_Name = "AUTOMATIC_SEARCH" | "FIXED_SEARCH" | "PORTFOLIO_SEARCH" | "LP_SEARCH" | "PSEUDO_COST_SEARCH" | "PORTFOLIO_WITH_QUICK_RESTART_SEARCH" | "HINT_SEARCH" | "PARTIAL_FIXED_SEARCH" | "RANDOMIZED_SEARCH";

export enum sat_SatParameters_SharedTreeSplitStrategy {
  SPLIT_STRATEGY_AUTO = 0,
  SPLIT_STRATEGY_DISCREPANCY = 1,
  SPLIT_STRATEGY_OBJECTIVE_LB = 2,
  SPLIT_STRATEGY_BALANCED_TREE = 3,
  SPLIT_STRATEGY_FIRST_PROPOSAL = 4,
}
export type sat_SatParameters_SharedTreeSplitStrategy_Name = "SPLIT_STRATEGY_AUTO" | "SPLIT_STRATEGY_DISCREPANCY" | "SPLIT_STRATEGY_OBJECTIVE_LB" | "SPLIT_STRATEGY_BALANCED_TREE" | "SPLIT_STRATEGY_FIRST_PROPOSAL";

export enum sat_SatParameters_FPRoundingMethod {
  NEAREST_INTEGER = 0,
  LOCK_BASED = 1,
  ACTIVE_LOCK_BASED = 3,
  PROPAGATION_ASSISTED = 2,
}
export type sat_SatParameters_FPRoundingMethod_Name = "NEAREST_INTEGER" | "LOCK_BASED" | "ACTIVE_LOCK_BASED" | "PROPAGATION_ASSISTED";

export type pdlp_PrimalDualHybridGradientParams = {
  terminationCriteria?: pdlp_TerminationCriteria;
  numThreads?: number;
  numShards?: number;
  schedulerType?: number | pdlp_SchedulerType_Name;
  recordIterationStats?: boolean;
  verbosityLevel?: number;
  logIntervalSeconds?: number;
  majorIterationFrequency?: number;
  terminationCheckFrequency?: number;
  restartStrategy?: number | pdlp_PrimalDualHybridGradientParams_RestartStrategy_Name;
  primalWeightUpdateSmoothing?: number;
  initialPrimalWeight?: number;
  presolveOptions?: pdlp_PrimalDualHybridGradientParams_PresolveOptions;
  lInfRuizIterations?: number;
  l2NormRescaling?: boolean;
  sufficientReductionForRestart?: number;
  necessaryReductionForRestart?: number;
  linesearchRule?: number | pdlp_PrimalDualHybridGradientParams_LinesearchRule_Name;
  adaptiveLinesearchParameters?: pdlp_AdaptiveLinesearchParams;
  malitskyPockParameters?: pdlp_MalitskyPockParams;
  initialStepSizeScaling?: number;
  randomProjectionSeeds?: Array<number>;
  infiniteConstraintBoundThreshold?: number;
  handleSomePrimalGradientsOnFiniteBoundsAsResiduals?: boolean;
  useDiagonalQpTrustRegionSolver?: boolean;
  diagonalQpTrustRegionSolverTolerance?: number;
  useFeasibilityPolishing?: boolean;
  applyFeasibilityPolishingAfterLimitsReached?: boolean;
  applyFeasibilityPolishingIfSolverIsInterrupted?: boolean;
};

export type pdlp_TerminationCriteria = {
  optimalityNorm?: number | pdlp_OptimalityNorm_Name;
  simpleOptimalityCriteria?: pdlp_TerminationCriteria_SimpleOptimalityCriteria;
  detailedOptimalityCriteria?: pdlp_TerminationCriteria_DetailedOptimalityCriteria;
  epsOptimalAbsolute?: number;
  epsOptimalRelative?: number;
  epsPrimalInfeasible?: number;
  epsDualInfeasible?: number;
  timeSecLimit?: number;
  iterationLimit?: number;
  kktMatrixPassLimit?: number;
};

export enum pdlp_OptimalityNorm {
  OPTIMALITY_NORM_UNSPECIFIED = 0,
  OPTIMALITY_NORM_L_INF = 1,
  OPTIMALITY_NORM_L2 = 2,
  OPTIMALITY_NORM_L_INF_COMPONENTWISE = 3,
}
export type pdlp_OptimalityNorm_Name = "OPTIMALITY_NORM_UNSPECIFIED" | "OPTIMALITY_NORM_L_INF" | "OPTIMALITY_NORM_L2" | "OPTIMALITY_NORM_L_INF_COMPONENTWISE";

export type pdlp_TerminationCriteria_SimpleOptimalityCriteria = {
  epsOptimalAbsolute?: number;
  epsOptimalRelative?: number;
};

export type pdlp_TerminationCriteria_DetailedOptimalityCriteria = {
  epsOptimalPrimalResidualAbsolute?: number;
  epsOptimalPrimalResidualRelative?: number;
  epsOptimalDualResidualAbsolute?: number;
  epsOptimalDualResidualRelative?: number;
  epsOptimalObjectiveGapAbsolute?: number;
  epsOptimalObjectiveGapRelative?: number;
};

export enum pdlp_SchedulerType {
  SCHEDULER_TYPE_UNSPECIFIED = 0,
  SCHEDULER_TYPE_GOOGLE_THREADPOOL = 1,
  SCHEDULER_TYPE_EIGEN_THREADPOOL = 3,
}
export type pdlp_SchedulerType_Name = "SCHEDULER_TYPE_UNSPECIFIED" | "SCHEDULER_TYPE_GOOGLE_THREADPOOL" | "SCHEDULER_TYPE_EIGEN_THREADPOOL";

export enum pdlp_PrimalDualHybridGradientParams_RestartStrategy {
  RESTART_STRATEGY_UNSPECIFIED = 0,
  NO_RESTARTS = 1,
  EVERY_MAJOR_ITERATION = 2,
  ADAPTIVE_HEURISTIC = 3,
  ADAPTIVE_DISTANCE_BASED = 4,
}
export type pdlp_PrimalDualHybridGradientParams_RestartStrategy_Name = "RESTART_STRATEGY_UNSPECIFIED" | "NO_RESTARTS" | "EVERY_MAJOR_ITERATION" | "ADAPTIVE_HEURISTIC" | "ADAPTIVE_DISTANCE_BASED";

export type pdlp_PrimalDualHybridGradientParams_PresolveOptions = {
  useGlop?: boolean;
  glopParameters?: glop_GlopParameters;
};

export enum pdlp_PrimalDualHybridGradientParams_LinesearchRule {
  LINESEARCH_RULE_UNSPECIFIED = 0,
  ADAPTIVE_LINESEARCH_RULE = 1,
  MALITSKY_POCK_LINESEARCH_RULE = 2,
  CONSTANT_STEP_SIZE_RULE = 3,
}
export type pdlp_PrimalDualHybridGradientParams_LinesearchRule_Name = "LINESEARCH_RULE_UNSPECIFIED" | "ADAPTIVE_LINESEARCH_RULE" | "MALITSKY_POCK_LINESEARCH_RULE" | "CONSTANT_STEP_SIZE_RULE";

export type pdlp_AdaptiveLinesearchParams = {
  stepSizeReductionExponent?: number;
  stepSizeGrowthExponent?: number;
};

export type pdlp_MalitskyPockParams = {
  stepSizeDownscalingFactor?: number;
  linesearchContractionFactor?: number;
  stepSizeInterpolation?: number;
};

export type math_opt_OsqpSettingsProto = {
  rho?: number;
  sigma?: number;
  scaling?: MathOptResultInt64;
  adaptiveRho?: boolean;
  adaptiveRhoInterval?: MathOptResultInt64;
  adaptiveRhoTolerance?: number;
  adaptiveRhoFraction?: number;
  maxIter?: MathOptResultInt64;
  epsAbs?: number;
  epsRel?: number;
  epsPrimInf?: number;
  epsDualInf?: number;
  alpha?: number;
  delta?: number;
  polish?: boolean;
  polishRefineIter?: MathOptResultInt64;
  verbose?: boolean;
  scaledTermination?: boolean;
  checkTermination?: MathOptResultInt64;
  warmStart?: boolean;
  timeLimit?: number;
};

export type math_opt_GlpkParametersProto = {
  computeUnboundRaysIfPossible?: boolean;
};

export type math_opt_HighsOptionsProto = {
  stringOptions?: Record<string, string>;
  doubleOptions?: Record<string, number>;
  intOptions?: Record<string, number>;
  boolOptions?: Record<string, boolean>;
};

export type math_opt_XpressParametersProto = {
  parameters?: Array<math_opt_XpressParametersProto_Parameter>;
};

export type math_opt_XpressParametersProto_Parameter = {
  name?: string;
  value?: string;
};

export type math_opt_ModelSolveParametersProto = {
  variableValuesFilter?: math_opt_SparseVectorFilterProto;
  dualValuesFilter?: math_opt_SparseVectorFilterProto;
  quadraticDualValuesFilter?: math_opt_SparseVectorFilterProto;
  reducedCostsFilter?: math_opt_SparseVectorFilterProto;
  initialBasis?: math_opt_BasisProto;
  solutionHints?: Array<math_opt_SolutionHintProto>;
  branchingPriorities?: math_opt_SparseInt32VectorProto;
  primaryObjectiveParameters?: math_opt_ObjectiveParametersProto;
  auxiliaryObjectiveParameters?: Record<string, math_opt_ObjectiveParametersProto>;
  lazyLinearConstraintIds?: Array<MathOptResultInt64>;
};

export type math_opt_SparseVectorFilterProto = {
  skipZeroValues?: boolean;
  filterByIds?: boolean;
  filteredIds?: Array<MathOptResultInt64>;
};

export type math_opt_SolutionHintProto = {
  variableValues?: math_opt_SparseDoubleVectorProto;
  dualValues?: math_opt_SparseDoubleVectorProto;
};

export type math_opt_SparseInt32VectorProto = {
  ids?: Array<MathOptResultInt64>;
  values?: Array<number>;
};

export type math_opt_ObjectiveParametersProto = {
  objectiveDegradationAbsoluteTolerance?: number;
  objectiveDegradationRelativeTolerance?: number;
  timeLimit?: MathOptDuration;
};

export type math_opt_SolveResponse = {
  result?: math_opt_SolveResultProto;
  status?: math_opt_StatusProto;
  messages?: Array<string>;
};

export type math_opt_StatusProto = {
  code?: number;
  message?: string;
};
