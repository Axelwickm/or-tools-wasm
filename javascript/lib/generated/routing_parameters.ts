// Generated from vendored routing parameter schemas by scripts/generate_routing_parameters.mjs.
import type { SatParameters } from './sat_parameters.js';
export type RoutingProtoInt64 = number | bigint;

export type RoutingSearchParameters = {
  firstSolutionStrategy?: number | FirstSolutionStrategy_Value_Name;
  useUnfilteredFirstSolutionStrategy?: boolean;
  savingsParameters?: SavingsParameters;
  globalCheapestInsertionFirstSolutionParameters?: GlobalCheapestInsertionParameters;
  globalCheapestInsertionLsOperatorParameters?: GlobalCheapestInsertionParameters;
  localCheapestInsertionParameters?: LocalCheapestInsertionParameters;
  localCheapestCostInsertionParameters?: LocalCheapestInsertionParameters;
  christofidesUseMinimumMatching?: boolean;
  firstSolutionOptimizationPeriod?: number;
  localSearchOperators?: RoutingSearchParameters_LocalSearchNeighborhoodOperators;
  lsOperatorNeighborsRatio?: number;
  lsOperatorMinNeighbors?: number;
  useMultiArmedBanditConcatenateOperators?: boolean;
  multiArmedBanditCompoundOperatorMemoryCoefficient?: number;
  multiArmedBanditCompoundOperatorExplorationCoefficient?: number;
  maxSwapActiveChainSize?: number;
  relocateExpensiveChainNumArcsToConsider?: number;
  heuristicExpensiveChainLnsNumArcsToConsider?: number;
  heuristicCloseNodesLnsNumNodes?: number;
  localSearchMetaheuristic?: number | LocalSearchMetaheuristic_Value_Name;
  localSearchMetaheuristics?: Array<number | LocalSearchMetaheuristic_Value_Name>;
  numMaxLocalOptimaBeforeMetaheuristicSwitch?: number;
  guidedLocalSearchLambdaCoefficient?: number;
  guidedLocalSearchResetPenaltiesOnNewBestSolution?: boolean;
  guidedLocalSearchPenalizeWithVehicleClasses?: boolean;
  useGuidedLocalSearchPenaltiesInLocalSearchOperators?: boolean;
  useDepthFirstSearch?: boolean;
  useCp?: number | OptionalBoolean_Name;
  useCpSat?: number | OptionalBoolean_Name;
  useGeneralizedCpSat?: number | OptionalBoolean_Name;
  satParameters?: SatParameters;
  reportIntermediateCpSatSolutions?: boolean;
  fallbackToCpSatSizeThreshold?: number;
  continuousSchedulingSolver?: number | RoutingSearchParameters_SchedulingSolver_Name;
  mixedIntegerSchedulingSolver?: number | RoutingSearchParameters_SchedulingSolver_Name;
  disableSchedulingBewareThisMayDegradePerformance?: boolean;
  optimizationStep?: number;
  numberOfSolutionsToCollect?: number;
  solutionLimit?: RoutingProtoInt64;
  timeLimit?: RoutingDuration;
  lnsTimeLimit?: RoutingDuration;
  secondaryLsTimeLimitRatio?: number;
  improvementLimitParameters?: RoutingSearchParameters_ImprovementSearchLimitParameters;
  useFullPropagation?: boolean;
  logSearch?: boolean;
  logCostScalingFactor?: number;
  logCostOffset?: number;
  logTag?: string;
  useIteratedLocalSearch?: boolean;
  iteratedLocalSearchParameters?: IteratedLocalSearchParameters;
};

export enum FirstSolutionStrategy_Value {
  UNSET = 0,
  AUTOMATIC = 15,
  PATH_CHEAPEST_ARC = 3,
  PATH_MOST_CONSTRAINED_ARC = 4,
  EVALUATOR_STRATEGY = 5,
  SAVINGS = 10,
  PARALLEL_SAVINGS = 17,
  SWEEP = 11,
  CHRISTOFIDES = 13,
  ALL_UNPERFORMED = 6,
  BEST_INSERTION = 7,
  PARALLEL_CHEAPEST_INSERTION = 8,
  SEQUENTIAL_CHEAPEST_INSERTION = 14,
  LOCAL_CHEAPEST_INSERTION = 9,
  LOCAL_CHEAPEST_COST_INSERTION = 16,
  GLOBAL_CHEAPEST_ARC = 1,
  LOCAL_CHEAPEST_ARC = 2,
  FIRST_UNBOUND_MIN_VALUE = 12,
}
export type FirstSolutionStrategy_Value_Name = "UNSET" | "AUTOMATIC" | "PATH_CHEAPEST_ARC" | "PATH_MOST_CONSTRAINED_ARC" | "EVALUATOR_STRATEGY" | "SAVINGS" | "PARALLEL_SAVINGS" | "SWEEP" | "CHRISTOFIDES" | "ALL_UNPERFORMED" | "BEST_INSERTION" | "PARALLEL_CHEAPEST_INSERTION" | "SEQUENTIAL_CHEAPEST_INSERTION" | "LOCAL_CHEAPEST_INSERTION" | "LOCAL_CHEAPEST_COST_INSERTION" | "GLOBAL_CHEAPEST_ARC" | "LOCAL_CHEAPEST_ARC" | "FIRST_UNBOUND_MIN_VALUE";

export type SavingsParameters = {
  neighborsRatio?: number;
  maxMemoryUsageBytes?: number;
  addReverseArcs?: boolean;
  arcCoefficient?: number;
};

export type GlobalCheapestInsertionParameters = {
  farthestSeedsRatio?: number;
  neighborsRatio?: number;
  minNeighbors?: number;
  useNeighborsRatioForInitialization?: boolean;
  addUnperformedEntries?: boolean;
};

export type LocalCheapestInsertionParameters = {
  pickupDeliveryStrategy?: number | LocalCheapestInsertionParameters_PairInsertionStrategy_Name;
  insertionSortingProperties?: Array<number | LocalCheapestInsertionParameters_InsertionSortingProperty_Name>;
};

export enum LocalCheapestInsertionParameters_PairInsertionStrategy {
  AUTOMATIC = 0,
  BEST_PICKUP_THEN_BEST_DELIVERY = 1,
  BEST_PICKUP_DELIVERY_PAIR = 2,
  BEST_PICKUP_DELIVERY_PAIR_MULTITOUR = 3,
}
export type LocalCheapestInsertionParameters_PairInsertionStrategy_Name = "AUTOMATIC" | "BEST_PICKUP_THEN_BEST_DELIVERY" | "BEST_PICKUP_DELIVERY_PAIR" | "BEST_PICKUP_DELIVERY_PAIR_MULTITOUR";

export enum LocalCheapestInsertionParameters_InsertionSortingProperty {
  SORTING_PROPERTY_UNSPECIFIED = 0,
  SORTING_PROPERTY_ALLOWED_VEHICLES = 1,
  SORTING_PROPERTY_PENALTY = 2,
  SORTING_PROPERTY_PENALTY_OVER_ALLOWED_VEHICLES_RATIO = 3,
  SORTING_PROPERTY_HIGHEST_AVG_ARC_COST_TO_VEHICLE_START_ENDS = 4,
  SORTING_PROPERTY_LOWEST_AVG_ARC_COST_TO_VEHICLE_START_ENDS = 5,
  SORTING_PROPERTY_LOWEST_MIN_ARC_COST_TO_VEHICLE_START_ENDS = 6,
  SORTING_PROPERTY_HIGHEST_DIMENSION_USAGE = 7,
  SORTING_PROPERTY_RANDOM = 8,
}
export type LocalCheapestInsertionParameters_InsertionSortingProperty_Name = "SORTING_PROPERTY_UNSPECIFIED" | "SORTING_PROPERTY_ALLOWED_VEHICLES" | "SORTING_PROPERTY_PENALTY" | "SORTING_PROPERTY_PENALTY_OVER_ALLOWED_VEHICLES_RATIO" | "SORTING_PROPERTY_HIGHEST_AVG_ARC_COST_TO_VEHICLE_START_ENDS" | "SORTING_PROPERTY_LOWEST_AVG_ARC_COST_TO_VEHICLE_START_ENDS" | "SORTING_PROPERTY_LOWEST_MIN_ARC_COST_TO_VEHICLE_START_ENDS" | "SORTING_PROPERTY_HIGHEST_DIMENSION_USAGE" | "SORTING_PROPERTY_RANDOM";

export type RoutingSearchParameters_LocalSearchNeighborhoodOperators = {
  useRelocate?: number | OptionalBoolean_Name;
  useRelocatePair?: number | OptionalBoolean_Name;
  useLightRelocatePair?: number | OptionalBoolean_Name;
  useRelocateNeighbors?: number | OptionalBoolean_Name;
  useRelocateSubtrip?: number | OptionalBoolean_Name;
  useExchange?: number | OptionalBoolean_Name;
  useExchangePair?: number | OptionalBoolean_Name;
  useExchangeSubtrip?: number | OptionalBoolean_Name;
  useCross?: number | OptionalBoolean_Name;
  useCrossExchange?: number | OptionalBoolean_Name;
  useRelocateExpensiveChain?: number | OptionalBoolean_Name;
  useTwoOpt?: number | OptionalBoolean_Name;
  useOrOpt?: number | OptionalBoolean_Name;
  useLinKernighan?: number | OptionalBoolean_Name;
  useTspOpt?: number | OptionalBoolean_Name;
  useMakeActive?: number | OptionalBoolean_Name;
  useRelocateAndMakeActive?: number | OptionalBoolean_Name;
  useExchangeAndMakeActive?: number | OptionalBoolean_Name;
  useExchangePathStartEndsAndMakeActive?: number | OptionalBoolean_Name;
  useMakeInactive?: number | OptionalBoolean_Name;
  useMakeChainInactive?: number | OptionalBoolean_Name;
  useSwapActive?: number | OptionalBoolean_Name;
  useSwapActiveChain?: number | OptionalBoolean_Name;
  useExtendedSwapActive?: number | OptionalBoolean_Name;
  useShortestPathSwapActive?: number | OptionalBoolean_Name;
  useShortestPathTwoOpt?: number | OptionalBoolean_Name;
  useNodePairSwapActive?: number | OptionalBoolean_Name;
  usePathLns?: number | OptionalBoolean_Name;
  useFullPathLns?: number | OptionalBoolean_Name;
  useTspLns?: number | OptionalBoolean_Name;
  useInactiveLns?: number | OptionalBoolean_Name;
  useGlobalCheapestInsertionPathLns?: number | OptionalBoolean_Name;
  useLocalCheapestInsertionPathLns?: number | OptionalBoolean_Name;
  useRelocatePathGlobalCheapestInsertionInsertUnperformed?: number | OptionalBoolean_Name;
  useGlobalCheapestInsertionExpensiveChainLns?: number | OptionalBoolean_Name;
  useLocalCheapestInsertionExpensiveChainLns?: number | OptionalBoolean_Name;
  useGlobalCheapestInsertionCloseNodesLns?: number | OptionalBoolean_Name;
  useLocalCheapestInsertionCloseNodesLns?: number | OptionalBoolean_Name;
  useGlobalCheapestInsertionVisitTypesLns?: number | OptionalBoolean_Name;
  useLocalCheapestInsertionVisitTypesLns?: number | OptionalBoolean_Name;
};

export enum OptionalBoolean {
  BOOL_UNSPECIFIED = 0,
  BOOL_FALSE = 2,
  BOOL_TRUE = 3,
}
export type OptionalBoolean_Name = "BOOL_UNSPECIFIED" | "BOOL_FALSE" | "BOOL_TRUE";

export enum LocalSearchMetaheuristic_Value {
  UNSET = 0,
  AUTOMATIC = 6,
  GREEDY_DESCENT = 1,
  GUIDED_LOCAL_SEARCH = 2,
  SIMULATED_ANNEALING = 3,
  TABU_SEARCH = 4,
  GENERIC_TABU_SEARCH = 5,
}
export type LocalSearchMetaheuristic_Value_Name = "UNSET" | "AUTOMATIC" | "GREEDY_DESCENT" | "GUIDED_LOCAL_SEARCH" | "SIMULATED_ANNEALING" | "TABU_SEARCH" | "GENERIC_TABU_SEARCH";

export enum RoutingSearchParameters_SchedulingSolver {
  SCHEDULING_UNSET = 0,
  SCHEDULING_GLOP = 1,
  SCHEDULING_CP_SAT = 2,
}
export type RoutingSearchParameters_SchedulingSolver_Name = "SCHEDULING_UNSET" | "SCHEDULING_GLOP" | "SCHEDULING_CP_SAT";

export type RoutingDuration = {
  seconds?: RoutingProtoInt64;
  nanos?: number;
};

export type RoutingSearchParameters_ImprovementSearchLimitParameters = {
  improvementRateCoefficient?: number;
  improvementRateSolutionsDistance?: number;
};

export type IteratedLocalSearchParameters = {
  perturbationStrategy?: number | PerturbationStrategy_Value_Name;
  ruinRecreateParameters?: RuinRecreateParameters;
  improvePerturbedSolution?: boolean;
  referenceSolutionAcceptanceStrategy?: AcceptanceStrategy;
  bestSolutionAcceptanceStrategy?: AcceptanceStrategy;
};

export enum PerturbationStrategy_Value {
  UNSET = 0,
  RUIN_AND_RECREATE = 1,
}
export type PerturbationStrategy_Value_Name = "UNSET" | "RUIN_AND_RECREATE";

export type RuinRecreateParameters = {
  ruinStrategies?: Array<RuinStrategy>;
  ruinCompositionStrategy?: number | RuinCompositionStrategy_Value_Name;
  recreateStrategy?: RecreateStrategy;
  routeSelectionNeighborsRatio?: number;
  routeSelectionMinNeighbors?: number;
  routeSelectionMaxNeighbors?: number;
};

export type RuinStrategy = {
  spatiallyCloseRoutes?: SpatiallyCloseRoutesRuinStrategy;
  randomWalk?: RandomWalkRuinStrategy;
  sisr?: SISRRuinStrategy;
};

export type SpatiallyCloseRoutesRuinStrategy = {
  numRuinedRoutes?: number;
};

export type RandomWalkRuinStrategy = {
  numRemovedVisits?: number;
};

export type SISRRuinStrategy = {
  maxRemovedSequenceSize?: number;
  avgNumRemovedVisits?: number;
  bypassFactor?: number;
};

export enum RuinCompositionStrategy_Value {
  UNSET = 0,
  RUN_ALL_SEQUENTIALLY = 1,
  RUN_ALL_RANDOMLY = 2,
  RUN_ONE_RANDOMLY = 3,
}
export type RuinCompositionStrategy_Value_Name = "UNSET" | "RUN_ALL_SEQUENTIALLY" | "RUN_ALL_RANDOMLY" | "RUN_ONE_RANDOMLY";

export type RecreateStrategy = {
  heuristic?: number | FirstSolutionStrategy_Value_Name;
  parameters?: RecreateParameters;
};

export type RecreateParameters = {
  localCheapestInsertion?: LocalCheapestInsertionParameters;
  savings?: SavingsParameters;
  globalCheapestInsertion?: GlobalCheapestInsertionParameters;
};

export type AcceptanceStrategy = {
  greedyDescent?: GreedyDescentAcceptanceStrategy;
  simulatedAnnealing?: SimulatedAnnealingAcceptanceStrategy;
  allNodesPerformed?: AllNodesPerformedAcceptanceStrategy;
  moreNodesPerformed?: MoreNodesPerformedAcceptanceStrategy;
  absencesBased?: AbsencesBasedAcceptanceStrategy;
};

export type GreedyDescentAcceptanceStrategy = {
};

export type SimulatedAnnealingAcceptanceStrategy = {
  coolingScheduleStrategy?: number | CoolingScheduleStrategy_Value_Name;
  initialTemperature?: number;
  finalTemperature?: number;
  automaticTemperatures?: boolean;
};

export enum CoolingScheduleStrategy_Value {
  UNSET = 0,
  EXPONENTIAL = 1,
  LINEAR = 2,
}
export type CoolingScheduleStrategy_Value_Name = "UNSET" | "EXPONENTIAL" | "LINEAR";

export type AllNodesPerformedAcceptanceStrategy = {
};

export type MoreNodesPerformedAcceptanceStrategy = {
};

export type AbsencesBasedAcceptanceStrategy = {
  removeRouteWithLowestAbsences?: boolean;
};

export type RoutingModelParameters = {
  solverParameters?: ConstraintSolverParameters;
  reduceVehicleCostModel?: boolean;
  maxCallbackCacheSize?: number;
};

export type ConstraintSolverParameters = {
  compressTrail?: number | ConstraintSolverParameters_TrailCompression_Name;
  trailBlockSize?: number;
  arraySplitSize?: number;
  storeNames?: boolean;
  nameCastVariables?: boolean;
  nameAllVariables?: boolean;
  profilePropagation?: boolean;
  profileFile?: string;
  profileLocalSearch?: boolean;
  printLocalSearchProfile?: boolean;
  tracePropagation?: boolean;
  traceSearch?: boolean;
  printModel?: boolean;
  printModelStats?: boolean;
  printAddedConstraints?: boolean;
  disableSolve?: boolean;
  useSmallTable?: boolean;
  useCumulativeEdgeFinder?: boolean;
  useCumulativeTimeTable?: boolean;
  useCumulativeTimeTableSync?: boolean;
  useSequenceHighDemandTasks?: boolean;
  useAllPossibleDisjunctions?: boolean;
  maxEdgeFinderSize?: number;
  diffnUseCumulative?: boolean;
  useElementRmq?: boolean;
  skipLocallyOptimalPaths?: boolean;
  checkSolutionPeriod?: number;
};

export enum ConstraintSolverParameters_TrailCompression {
  NO_COMPRESSION = 0,
  COMPRESS_WITH_ZLIB = 1,
}
export type ConstraintSolverParameters_TrailCompression_Name = "NO_COMPRESSION" | "COMPRESS_WITH_ZLIB";
