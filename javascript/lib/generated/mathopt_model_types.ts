// Generated from vendored MathOpt model schemas by scripts/generate_mathopt_model_types.mjs.
export type MathOptModelInt64 = number | bigint;

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
  ids?: Array<MathOptModelInt64>;
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
  priority?: MathOptModelInt64;
};

export type math_opt_SparseDoubleVectorProto = {
  ids?: Array<MathOptModelInt64>;
  values?: Array<number>;
};

export type math_opt_SparseDoubleMatrixProto = {
  rowIds?: Array<MathOptModelInt64>;
  columnIds?: Array<MathOptModelInt64>;
  coefficients?: Array<number>;
};

export type math_opt_LinearConstraintsProto = {
  ids?: Array<MathOptModelInt64>;
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
  ids?: Array<MathOptModelInt64>;
  coefficients?: Array<number>;
  offset?: number;
};

export type math_opt_SosConstraintProto = {
  expressions?: Array<math_opt_LinearExpressionProto>;
  weights?: Array<number>;
  name?: string;
};

export type math_opt_IndicatorConstraintProto = {
  indicatorId?: MathOptModelInt64;
  activateOnZero?: boolean;
  expression?: math_opt_SparseDoubleVectorProto;
  lowerBound?: number;
  upperBound?: number;
  name?: string;
};

export type math_opt_ModelUpdateProto = {
  deletedVariableIds?: Array<MathOptModelInt64>;
  deletedLinearConstraintIds?: Array<MathOptModelInt64>;
  variableUpdates?: math_opt_VariableUpdatesProto;
  linearConstraintUpdates?: math_opt_LinearConstraintUpdatesProto;
  newVariables?: math_opt_VariablesProto;
  newLinearConstraints?: math_opt_LinearConstraintsProto;
  objectiveUpdates?: math_opt_ObjectiveUpdatesProto;
  auxiliaryObjectivesUpdates?: math_opt_AuxiliaryObjectivesUpdatesProto;
  linearConstraintMatrixUpdates?: math_opt_SparseDoubleMatrixProto;
  quadraticConstraintUpdates?: math_opt_QuadraticConstraintUpdatesProto;
  secondOrderConeConstraintUpdates?: math_opt_SecondOrderConeConstraintUpdatesProto;
  sos1ConstraintUpdates?: math_opt_SosConstraintUpdatesProto;
  sos2ConstraintUpdates?: math_opt_SosConstraintUpdatesProto;
  indicatorConstraintUpdates?: math_opt_IndicatorConstraintUpdatesProto;
};

export type math_opt_VariableUpdatesProto = {
  lowerBounds?: math_opt_SparseDoubleVectorProto;
  upperBounds?: math_opt_SparseDoubleVectorProto;
  integers?: math_opt_SparseBoolVectorProto;
};

export type math_opt_SparseBoolVectorProto = {
  ids?: Array<MathOptModelInt64>;
  values?: Array<boolean>;
};

export type math_opt_LinearConstraintUpdatesProto = {
  lowerBounds?: math_opt_SparseDoubleVectorProto;
  upperBounds?: math_opt_SparseDoubleVectorProto;
};

export type math_opt_ObjectiveUpdatesProto = {
  directionUpdate?: boolean;
  offsetUpdate?: number;
  linearCoefficients?: math_opt_SparseDoubleVectorProto;
  quadraticCoefficients?: math_opt_SparseDoubleMatrixProto;
  priorityUpdate?: MathOptModelInt64;
};

export type math_opt_AuxiliaryObjectivesUpdatesProto = {
  deletedObjectiveIds?: Array<MathOptModelInt64>;
  newObjectives?: Record<string, math_opt_ObjectiveProto>;
  objectiveUpdates?: Record<string, math_opt_ObjectiveUpdatesProto>;
};

export type math_opt_QuadraticConstraintUpdatesProto = {
  deletedConstraintIds?: Array<MathOptModelInt64>;
  newConstraints?: Record<string, math_opt_QuadraticConstraintProto>;
};

export type math_opt_SecondOrderConeConstraintUpdatesProto = {
  deletedConstraintIds?: Array<MathOptModelInt64>;
  newConstraints?: Record<string, math_opt_SecondOrderConeConstraintProto>;
};

export type math_opt_SosConstraintUpdatesProto = {
  deletedConstraintIds?: Array<MathOptModelInt64>;
  newConstraints?: Record<string, math_opt_SosConstraintProto>;
};

export type math_opt_IndicatorConstraintUpdatesProto = {
  deletedConstraintIds?: Array<MathOptModelInt64>;
  newConstraints?: Record<string, math_opt_IndicatorConstraintProto>;
};
