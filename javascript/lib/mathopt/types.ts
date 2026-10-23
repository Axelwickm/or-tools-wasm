import type { SolverJobEvent } from '../solver_executor.js';
import type { MathOptLogEvent } from './protocol.js';
import type { MathOptVariable } from './variable.js';
import type { MathOptLinearConstraint, MathOptObjective } from './model.js';
import type { IntValue } from '../int64.js';
import type { math_opt_LinearExpressionProto } from '../generated/mathopt_model_types.js';
import type {
  MathOptLinearExpression, MathOptQuadraticExpression, MathOptBoundedExpression,
  MathOptLowerBoundedExpression, MathOptUpperBoundedExpression,
} from './expressions.js';
import type {
  MathOptSolverType, MathOptSolveInterrupter, MathOptModelSolveParameters,
  MathOptLPAlgorithm, MathOptEmphasis, GScipParameters, GlopParameters,
  PdlpParameters, GlpkParameters, MathOptSparseVectorFilter, MathOptSolutionHint,
  MathOptObjectiveParameters, GScipEmphasis, GScipMetaParamValue, PdlpOptimalityNorm,
  PdlpSchedulerType, PdlpRestartStrategy, PdlpLinesearchRule,
} from './parameters.js';
import type { ExecutorSelection } from '../executor_configuration.js';
import type { MathOptCallbackRegistration, MathOptCallback } from './callbacks.js';
import type { SatParameters } from '../generated/sat_parameters.js';
import type {
  math_opt_SolveResultProto, GScipOutput, math_opt_OsqpOutput,
  math_opt_SolveResultProto_PdlpOutput,
} from '../generated/mathopt_result_types.js';
import type { glop_GlopParameters, pdlp_PrimalDualHybridGradientParams } from '../generated/pdlp_types.js';

export type MathOptEvent = SolverJobEvent | MathOptLogEvent;

export type MathOptLinearTerm = {
  variable: MathOptVariable;
  coefficient: number;
};

export type MathOptLinearConstraintMatrixEntry = {
  linearConstraint: MathOptLinearConstraint;
  variable: MathOptVariable;
  coefficient: number;
};

export type MathOptQuadraticTerm = {
  firstVariable: MathOptVariable;
  secondVariable: MathOptVariable;
  coefficient: number;
};

export type MathOptLinearExpressionBounds = { lowerBound: number; upperBound: number };

export type MathOptRobustCoefficient = {
  variable: MathOptVariable;
  coefficient: MathOptLinearExpressionInput;
};

export type MathOptRobustCoefficientProto = {
  variableId: IntValue;
  coefficient: math_opt_LinearExpressionProto;
};

export type MathOptLinearExpressionInput =
  | number
  | MathOptVariable
  | MathOptLinearTerm
  | MathOptLinearExpression;

export type MathOptQuadraticExpressionInput =
  | MathOptLinearExpressionInput
  | MathOptQuadraticTerm
  | MathOptQuadraticExpression;

export type MathOptLinearConstraintOptions = {
  lowerBound?: number;
  upperBound?: number;
  terms?: MathOptLinearTerm[];
  expression?: MathOptLinearExpressionInput;
  name?: string;
};

export type MathOptQuadraticConstraintOptions = Omit<MathOptLinearConstraintOptions, 'expression'> & {
  expression?: MathOptQuadraticExpressionInput;
  quadraticTerms?: MathOptQuadraticTerm[];
};

export type MathOptSosConstraintOptions = { weights?: Iterable<number>; name?: string };

export type MathOptSosConstraintKind = 'sos1' | 'sos2';

export type MathOptSecondOrderConeConstraintOptions = { name?: string };

export type MathOptIndicatorConstraintOptions = {
  indicator?: MathOptVariable;
  activateOnZero?: boolean;
  impliedConstraint?: MathOptBoundedExpression<MathOptLinearExpression>
    | MathOptLowerBoundedExpression<MathOptLinearExpression>
    | MathOptUpperBoundedExpression<MathOptLinearExpression>;
  lowerBound?: number;
  upperBound?: number;
  expression?: MathOptLinearExpressionInput;
  terms?: MathOptLinearTerm[];
  name?: string;
};

export type MathOptVariableOptions = {
  lowerBound?: number;
  upperBound?: number;
  integer?: boolean;
  name?: string;
};

export type MathOptAuxiliaryObjectiveOptions = {
  priority: IntValue;
  name?: string;
  expression?: MathOptLinearExpressionInput;
  isMaximize?: boolean;
};

export type MathOptModelOptions = { primaryObjectiveName?: string };

export type MathOptObjectiveParametersOptions = {
  objectiveDegradationAbsoluteTolerance?: number;
  objectiveDegradationRelativeTolerance?: number;
  timeLimitSeconds?: number;
};

export type MathOptConversionOptions = Pick<MathOptSolveOptions, 'executor' | 'signal' | 'onEvent'>;

export type MathOptResultParseOptions = MathOptConversionOptions & Pick<MathOptSolveOptions, 'modelParameters'>;

export type MathOptMpsExportOptions = MathOptConversionOptions & { removeNames?: boolean };

export type MathOptSolveOptions = {
  executor?: ExecutorSelection;
  solverType?: MathOptSolverType | keyof typeof MathOptSolverType;
  removeNames?: boolean;
  interrupter?: MathOptSolveInterrupter | MathOptSolveInterrupterLike;
  callbackRegistration?: MathOptCallbackRegistration | Uint8Array;
  callback?: MathOptCallback;
  messageCallback?: (messages: string[]) => void;
  modelParameters?: Uint8Array | MathOptModelSolveParameters | MathOptModelSolveParametersOptions;
  timeLimitSeconds?: number;
  threads?: number;
  iterationLimit?: IntValue;
  nodeLimit?: IntValue;
  cutoffLimit?: number;
  objectiveLimit?: number;
  bestBoundLimit?: number;
  solutionLimit?: number;
  enableOutput?: boolean;
  randomSeed?: number;
  absoluteGapTolerance?: number;
  relativeGapTolerance?: number;
  solutionPoolSize?: number;
  lpAlgorithm?: MathOptLPAlgorithm | keyof typeof MathOptLPAlgorithm;
  presolve?: MathOptEmphasis | keyof typeof MathOptEmphasis;
  cuts?: MathOptEmphasis | keyof typeof MathOptEmphasis;
  heuristics?: MathOptEmphasis | keyof typeof MathOptEmphasis;
  scaling?: MathOptEmphasis | keyof typeof MathOptEmphasis;
  gscip?: GScipParameters | GScipParametersOptions | Uint8Array;
  glop?: GlopParameters | GlopParametersOptions | Uint8Array;
  cpSat?: SatParameters | Uint8Array;
  pdlp?: PdlpParameters | PdlpParametersOptions | Uint8Array;
  glpk?: GlpkParameters | GlpkParametersOptions | Uint8Array;
  onEvent?: (event: MathOptEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export type MathOptProtoSolveOptions = Omit<MathOptSolveOptions, 'removeNames'>;

export type MathOptInfeasibleSubsystemOptions = Pick<MathOptSolveOptions, 'executor' | 'solverType' | 'interrupter' |
  'messageCallback' | 'timeLimitSeconds' | 'nodeLimit' | 'threads' | 'enableOutput' | 'randomSeed' | 'gscip' | 'onEvent' | 'signal'>;

export type MathOptIncrementalInfeasibleSubsystemOptions = Omit<MathOptInfeasibleSubsystemOptions, 'executor' | 'solverType'>;

export type MathOptSolveResultProto = math_opt_SolveResultProto;

export type MathOptProtoSolveResult = {
  bytes: Uint8Array;
  response: MathOptSolveResultProto;
  messages: string[];
};

export type MathOptSparseVectorFilterOptions<TElement = unknown> = {
  skipZeroValues?: boolean;
  filterByIds?: boolean;
  ids?: Array<number | bigint>;
  elements?: TElement[];
};

export type MathOptSparseVectorFilterInput<TElement = unknown> =
  | MathOptSparseVectorFilter<TElement>
  | MathOptSparseVectorFilterOptions<TElement>
  | TElement[]
  | Array<number | bigint>;

export type MathOptSolutionHintOptions = {
  variableValues?: Array<{ variable: MathOptVariable; value: number }>;
  dualValues?: Array<{ linearConstraint: MathOptLinearConstraint; value: number }>;
};

export type MathOptModelSolveParametersOptions = {
  variableValuesFilter?: MathOptSparseVectorFilterInput<MathOptVariable>;
  dualValuesFilter?: MathOptSparseVectorFilterInput<MathOptLinearConstraint>;
  quadraticDualValuesFilter?: MathOptSparseVectorFilterInput<number | bigint>;
  reducedCostsFilter?: MathOptSparseVectorFilterInput<MathOptVariable>;
  initialBasis?: Uint8Array;
  solutionHints?: Array<MathOptSolutionHint | MathOptSolutionHintOptions | Uint8Array>;
  branchingPriorities?: Array<{ variable: MathOptVariable; priority: number }>;
  lazyLinearConstraints?: Array<MathOptLinearConstraint | number | bigint>;
  objectiveParameters?: ReadonlyMap<MathOptObjective, MathOptObjectiveParameters | MathOptObjectiveParametersOptions | Uint8Array>;
};

export type MathOptSolveInterrupterLike = {
  readonly interrupted?: boolean;
  isInterrupted?(): boolean;
  readonly signal?: AbortSignal;
};

export type MathOptSolveStats = {
  solveTimeSeconds: number | null;
  simplexIterations: bigint;
  barrierIterations: bigint;
  firstOrderIterations: bigint;
  nodeCount: bigint;
};

export type MathOptSolveResult = {
  terminationReason: string;
  terminationDetail: string;
  solveStats: MathOptSolveStats;
  gscipSpecificOutput: GScipOutput | null;
  osqpSpecificOutput: math_opt_OsqpOutput | null;
  pdlpSpecificOutput: math_opt_SolveResultProto_PdlpOutput | null;
  terminationLimit: string | null;
  solveTimeSeconds: number | null;
  primalBound: number | null;
  dualBound: number | null;
  primalStatus: string | null;
  dualStatus: string | null;
  primalOrDualInfeasible: boolean;
  objectiveValue: number | null;
  hasSolution: boolean;
  value(variable: MathOptVariable): number;
  variableValuesById: Record<number, number>;
  solutions: MathOptSolutionResult[];
  primalRays: MathOptPrimalRayResult[];
  dualRays: MathOptDualRayResult[];
  messages: string[];
  rawResponse: Uint8Array;
  toProtoBytes(): Uint8Array;
};

export type MathOptPrimalSolutionResult = {
  objectiveValue: number | null;
  variableValuesById: Record<number, number>;
  auxiliaryObjectiveValuesById: Record<number, number>;
  feasibilityStatus: string;
};

export type MathOptDualSolutionResult = {
  objectiveValue: number | null;
  dualValuesById: Record<number, number>;
  quadraticDualValuesById: Record<number, number>;
  reducedCostsById: Record<number, number>;
  feasibilityStatus: string;
};

export type MathOptPrimalRayResult = {
  variableValuesById: Record<number, number>;
};

export type MathOptDualRayResult = {
  dualValuesById: Record<number, number>;
  reducedCostsById: Record<number, number>;
};

export type MathOptBasisResult = {
  variableStatusById: Record<number, string>;
  constraintStatusById: Record<number, string>;
  basicDualFeasibility: string;
};

export type MathOptSolutionResult = {
  primalSolution: MathOptPrimalSolutionResult | null;
  dualSolution: MathOptDualSolutionResult | null;
  basis: MathOptBasisResult | null;
};

export type GScipParametersOptions = {
  emphasis?: GScipEmphasis | keyof typeof GScipEmphasis;
  heuristics?: GScipMetaParamValue | keyof typeof GScipMetaParamValue;
  presolve?: GScipMetaParamValue | keyof typeof GScipMetaParamValue;
  separating?: GScipMetaParamValue | keyof typeof GScipMetaParamValue;
  boolParams?: Record<string, boolean>;
  intParams?: Record<string, number>;
  longParams?: Record<string, number | bigint>;
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

export type GlopParametersOptions = glop_GlopParameters;

export type PdlpParametersOptions = Omit<pdlp_PrimalDualHybridGradientParams,
  'terminationCriteria' | 'schedulerType' | 'restartStrategy' | 'linesearchRule'> & {
  terminationCriteria?: Omit<NonNullable<pdlp_PrimalDualHybridGradientParams['terminationCriteria']>, 'optimalityNorm'> & {
    optimalityNorm?: NonNullable<pdlp_PrimalDualHybridGradientParams['terminationCriteria']>['optimalityNorm'] | keyof typeof PdlpOptimalityNorm;
  };
  schedulerType?: pdlp_PrimalDualHybridGradientParams['schedulerType'] | keyof typeof PdlpSchedulerType;
  restartStrategy?: pdlp_PrimalDualHybridGradientParams['restartStrategy'] | keyof typeof PdlpRestartStrategy;
  linesearchRule?: pdlp_PrimalDualHybridGradientParams['linesearchRule'] | keyof typeof PdlpLinesearchRule;
};

export type GlpkParametersOptions = {
  computeUnboundRaysIfPossible?: boolean;
};

export type MathOptIncrementalSolverOptions = Omit<
  MathOptSolveOptions,
  'solverType'
>;

export type MathOptIncrementalSolveOptions = Omit<
  MathOptSolveOptions,
  'solverType' | 'executor' | 'removeNames'
>;

export type MathOptProtoIncrementalSolverOptions = Omit<MathOptProtoSolveOptions, 'solverType'>;

export type MathOptProtoIncrementalSolveOptions = Omit<MathOptProtoSolveOptions, 'solverType' | 'executor'>;

export type MathOptProtoUpdateOptions = Pick<MathOptSolveOptions, 'signal' | 'onEvent'>;
