// Generated from vendored PDLP parameter and result schemas by scripts/generate_pdlp_types.mjs.
export type PdlpProtoInt64 = number | bigint;

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
  maxNumberOfIterations?: PdlpProtoInt64;
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

export type pdlp_SolveLog = {
  instanceName?: string;
  params?: pdlp_PrimalDualHybridGradientParams;
  terminationReason?: number | pdlp_TerminationReason_Name;
  terminationString?: string;
  iterationCount?: number;
  preprocessingTimeSec?: number;
  solveTimeSec?: number;
  solutionStats?: pdlp_IterationStats;
  solutionType?: number | pdlp_PointType_Name;
  iterationStats?: Array<pdlp_IterationStats>;
  originalProblemStats?: pdlp_QuadraticProgramStats;
  preprocessedProblemStats?: pdlp_QuadraticProgramStats;
  feasibilityPolishingDetails?: Array<pdlp_FeasibilityPolishingDetails>;
};

export enum pdlp_TerminationReason {
  TERMINATION_REASON_UNSPECIFIED = 0,
  TERMINATION_REASON_OPTIMAL = 1,
  TERMINATION_REASON_PRIMAL_INFEASIBLE = 2,
  TERMINATION_REASON_DUAL_INFEASIBLE = 3,
  TERMINATION_REASON_TIME_LIMIT = 4,
  TERMINATION_REASON_ITERATION_LIMIT = 5,
  TERMINATION_REASON_KKT_MATRIX_PASS_LIMIT = 8,
  TERMINATION_REASON_INTERRUPTED_BY_USER = 12,
  TERMINATION_REASON_NUMERICAL_ERROR = 6,
  TERMINATION_REASON_INVALID_PROBLEM = 9,
  TERMINATION_REASON_INVALID_INITIAL_SOLUTION = 13,
  TERMINATION_REASON_INVALID_PARAMETER = 10,
  TERMINATION_REASON_OTHER = 7,
  TERMINATION_REASON_PRIMAL_OR_DUAL_INFEASIBLE = 11,
}
export type pdlp_TerminationReason_Name = "TERMINATION_REASON_UNSPECIFIED" | "TERMINATION_REASON_OPTIMAL" | "TERMINATION_REASON_PRIMAL_INFEASIBLE" | "TERMINATION_REASON_DUAL_INFEASIBLE" | "TERMINATION_REASON_TIME_LIMIT" | "TERMINATION_REASON_ITERATION_LIMIT" | "TERMINATION_REASON_KKT_MATRIX_PASS_LIMIT" | "TERMINATION_REASON_INTERRUPTED_BY_USER" | "TERMINATION_REASON_NUMERICAL_ERROR" | "TERMINATION_REASON_INVALID_PROBLEM" | "TERMINATION_REASON_INVALID_INITIAL_SOLUTION" | "TERMINATION_REASON_INVALID_PARAMETER" | "TERMINATION_REASON_OTHER" | "TERMINATION_REASON_PRIMAL_OR_DUAL_INFEASIBLE";

export type pdlp_IterationStats = {
  iterationNumber?: number;
  convergenceInformation?: Array<pdlp_ConvergenceInformation>;
  infeasibilityInformation?: Array<pdlp_InfeasibilityInformation>;
  pointMetadata?: Array<pdlp_PointMetadata>;
  cumulativeKktMatrixPasses?: number;
  cumulativeRejectedSteps?: number;
  cumulativeTimeSec?: number;
  restartUsed?: number | pdlp_RestartChoice_Name;
  stepSize?: number;
  primalWeight?: number;
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

export type pdlp_InfeasibilityInformation = {
  maxPrimalRayInfeasibility?: number;
  primalRayLinearObjective?: number;
  primalRayQuadraticNorm?: number;
  maxDualRayInfeasibility?: number;
  dualRayObjective?: number;
  candidateType?: number | pdlp_PointType_Name;
};

export type pdlp_PointMetadata = {
  pointType?: number | pdlp_PointType_Name;
  randomPrimalProjections?: Array<number>;
  randomDualProjections?: Array<number>;
  activePrimalVariableCount?: PdlpProtoInt64;
  activeDualVariableCount?: PdlpProtoInt64;
  activePrimalVariableChange?: PdlpProtoInt64;
  activeDualVariableChange?: PdlpProtoInt64;
};

export enum pdlp_RestartChoice {
  RESTART_CHOICE_UNSPECIFIED = 0,
  RESTART_CHOICE_NO_RESTART = 1,
  RESTART_CHOICE_WEIGHTED_AVERAGE_RESET = 2,
  RESTART_CHOICE_RESTART_TO_AVERAGE = 3,
}
export type pdlp_RestartChoice_Name = "RESTART_CHOICE_UNSPECIFIED" | "RESTART_CHOICE_NO_RESTART" | "RESTART_CHOICE_WEIGHTED_AVERAGE_RESET" | "RESTART_CHOICE_RESTART_TO_AVERAGE";

export type pdlp_QuadraticProgramStats = {
  numVariables?: PdlpProtoInt64;
  numConstraints?: PdlpProtoInt64;
  constraintMatrixColMinLInfNorm?: number;
  constraintMatrixRowMinLInfNorm?: number;
  constraintMatrixNumNonzeros?: PdlpProtoInt64;
  constraintMatrixAbsMax?: number;
  constraintMatrixAbsMin?: number;
  constraintMatrixAbsAvg?: number;
  constraintMatrixL2Norm?: number;
  combinedBoundsMax?: number;
  combinedBoundsMin?: number;
  combinedBoundsAvg?: number;
  combinedBoundsL2Norm?: number;
  combinedVariableBoundsMax?: number;
  combinedVariableBoundsMin?: number;
  combinedVariableBoundsAvg?: number;
  combinedVariableBoundsL2Norm?: number;
  variableBoundGapsNumFinite?: PdlpProtoInt64;
  variableBoundGapsMax?: number;
  variableBoundGapsMin?: number;
  variableBoundGapsAvg?: number;
  variableBoundGapsL2Norm?: number;
  objectiveVectorAbsMax?: number;
  objectiveVectorAbsMin?: number;
  objectiveVectorAbsAvg?: number;
  objectiveVectorL2Norm?: number;
  objectiveMatrixNumNonzeros?: PdlpProtoInt64;
  objectiveMatrixAbsMax?: number;
  objectiveMatrixAbsMin?: number;
  objectiveMatrixAbsAvg?: number;
  objectiveMatrixL2Norm?: number;
};

export type pdlp_FeasibilityPolishingDetails = {
  polishingPhaseType?: number | pdlp_PolishingPhaseType_Name;
  mainIterationCount?: number;
  params?: pdlp_PrimalDualHybridGradientParams;
  terminationReason?: number | pdlp_TerminationReason_Name;
  iterationCount?: number;
  solveTimeSec?: number;
  solutionStats?: pdlp_IterationStats;
  solutionType?: number | pdlp_PointType_Name;
  iterationStats?: Array<pdlp_IterationStats>;
};

export enum pdlp_PolishingPhaseType {
  POLISHING_PHASE_TYPE_UNSPECIFIED = 0,
  POLISHING_PHASE_TYPE_PRIMAL_FEASIBILITY = 1,
  POLISHING_PHASE_TYPE_DUAL_FEASIBILITY = 2,
}
export type pdlp_PolishingPhaseType_Name = "POLISHING_PHASE_TYPE_UNSPECIFIED" | "POLISHING_PHASE_TYPE_PRIMAL_FEASIBILITY" | "POLISHING_PHASE_TYPE_DUAL_FEASIBILITY";
