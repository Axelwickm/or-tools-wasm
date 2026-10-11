// Generated from vendored MathOpt callback schemas by scripts/generate_mathopt_callback_types.mjs.
export type MathOptCallbackInt64 = number | bigint;

export type MathOptCallbackDataProto = {
  event?: number | MathOptCallbackEventProto_Name;
  primalSolutionVector?: MathOptSparseDoubleVectorProto;
  runtime?: MathOptDuration;
  presolveStats?: MathOptCallbackDataProto_PresolveStats;
  simplexStats?: MathOptCallbackDataProto_SimplexStats;
  barrierStats?: MathOptCallbackDataProto_BarrierStats;
  mipStats?: MathOptCallbackDataProto_MipStats;
};

export enum MathOptCallbackEventProto {
  CALLBACK_EVENT_UNSPECIFIED = 0,
  CALLBACK_EVENT_PRESOLVE = 1,
  CALLBACK_EVENT_SIMPLEX = 2,
  CALLBACK_EVENT_MIP = 3,
  CALLBACK_EVENT_MIP_SOLUTION = 4,
  CALLBACK_EVENT_MIP_NODE = 5,
  CALLBACK_EVENT_BARRIER = 6,
}
export type MathOptCallbackEventProto_Name = "CALLBACK_EVENT_UNSPECIFIED" | "CALLBACK_EVENT_PRESOLVE" | "CALLBACK_EVENT_SIMPLEX" | "CALLBACK_EVENT_MIP" | "CALLBACK_EVENT_MIP_SOLUTION" | "CALLBACK_EVENT_MIP_NODE" | "CALLBACK_EVENT_BARRIER";

export type MathOptSparseDoubleVectorProto = {
  ids?: Array<MathOptCallbackInt64>;
  values?: Array<number>;
};

export type MathOptDuration = {
  seconds?: MathOptCallbackInt64;
  nanos?: number;
};

export type MathOptCallbackDataProto_PresolveStats = {
  removedVariables?: MathOptCallbackInt64;
  removedConstraints?: MathOptCallbackInt64;
  boundChanges?: MathOptCallbackInt64;
  coefficientChanges?: MathOptCallbackInt64;
};

export type MathOptCallbackDataProto_SimplexStats = {
  iterationCount?: MathOptCallbackInt64;
  objectiveValue?: number;
  primalInfeasibility?: number;
  dualInfeasibility?: number;
  isPertubated?: boolean;
};

export type MathOptCallbackDataProto_BarrierStats = {
  iterationCount?: number;
  primalObjective?: number;
  dualObjective?: number;
  complementarity?: number;
  primalInfeasibility?: number;
  dualInfeasibility?: number;
};

export type MathOptCallbackDataProto_MipStats = {
  primalBound?: number;
  dualBound?: number;
  exploredNodes?: MathOptCallbackInt64;
  openNodes?: MathOptCallbackInt64;
  simplexIterations?: MathOptCallbackInt64;
  numberOfSolutionsFound?: number;
  cuttingPlanesInLp?: number;
};

export type MathOptCallbackResultProto = {
  terminate?: boolean;
  cuts?: Array<MathOptCallbackResultProto_GeneratedLinearConstraint>;
  suggestedSolutions?: Array<MathOptSparseDoubleVectorProto>;
};

export type MathOptCallbackResultProto_GeneratedLinearConstraint = {
  linearExpression?: MathOptSparseDoubleVectorProto;
  lowerBound?: number;
  upperBound?: number;
  isLazy?: boolean;
};

export type MathOptCallbackRegistrationProto = {
  requestRegistration?: Array<number | MathOptCallbackEventProto_Name>;
  mipSolutionFilter?: MathOptSparseVectorFilterProto;
  mipNodeFilter?: MathOptSparseVectorFilterProto;
  addCuts?: boolean;
  addLazyConstraints?: boolean;
};

export type MathOptSparseVectorFilterProto = {
  skipZeroValues?: boolean;
  filterByIds?: boolean;
  filteredIds?: Array<MathOptCallbackInt64>;
};
