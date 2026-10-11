import { callbackHandler, encodeMathOptCallbackRegistration, type MathOptCallback, type MathOptCallbackRegistration } from './callbacks.js';
import { decodeMathOptModel, encodeMathOptModelProto, encodeMathOptModelUpdateProto, decodeMathOptModelProto, type MathOptModelProto, type MathOptModelUpdateProto, type ImportedLinearTerm, type ImportedQuadraticTerm } from './model_proto.js';
export type { MathOptModelProto, MathOptModelUpdateProto } from './model_proto.js';
import { decodeMathOptSolveResult } from './result_proto.js';
import { encodeMathOptResultProto, decodeMathOptResultProto, mathOptResultProtoKind,
  type MathOptSolutionProtoKind, type MathOptSolutionProtoMap, type MathOptResultMetadataProtoKind,
  type MathOptResultMetadataProtoMap, type MathOptConvertedProto } from './result_proto.js';
export type { MathOptSolutionProtoKind, MathOptSolutionProtoMap, MathOptResultMetadataProtoKind,
  MathOptResultMetadataProtoMap, MathOptConvertedProto } from './result_proto.js';
import type { GScipOutput, math_opt_OsqpOutput, math_opt_SolveResultProto, math_opt_SolveResultProto_PdlpOutput, math_opt_SolutionProto, math_opt_PrimalSolutionProto, math_opt_DualSolutionProto, math_opt_BasisProto, math_opt_PrimalRayProto, math_opt_DualRayProto } from '../generated/mathopt_result_types.js';
import { encodeGlopParameters, encodePdlpParameters } from '../pdlp/proto.js';
import type { glop_GlopParameters, pdlp_PrimalDualHybridGradientParams } from '../generated/pdlp_types.js';
import { CloudExecutor } from '../cloud_executor.js';
import {
  resolveExecutorConfiguration,
  type ExecutorSelection,
  type ResolvedExecutorConfiguration,
} from '../executor_configuration.js';
import {
  type SolverJobEvent,
  type SolverResourceRequest,
} from '../solver_executor.js';
import { executeSolverJob, createAbortError } from '../solver_job.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import {
  SolverWorkerExecutor,
  type SolverWorkerLike,
} from '../worker_helpers.js';
import { satParametersProtoSchema } from '../generated/cp_sat_schemas.js';
import type { SatParameters } from '../generated/sat_parameters.js';
import { DirectMathOptExecutor } from './direct_executor.js';
import {
  mathOptProtocol,
  type MathOptExecutor,
  type MathOptOperation,
  type MathOptLogEvent,
} from './protocol.js';
import * as protobufModule from 'protobufjs';
import { toIndex, toInt64, type IntValue } from '../int64.js';
import { normalizeProtobufInput, encodeProtobufBigInts } from '../protobufjs_helpers.js';

type WireValue = Uint8Array;
type ProtobufType = import('protobufjs').Type;

let satParametersType: ProtobufType | undefined;

function getSatParametersType(): ProtobufType {
  return satParametersType ??= protobufModule
    .parse(satParametersProtoSchema)
    .root
    .lookupType('operations_research.sat.SatParameters');
}

async function createMathOptWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-mathopt' },
  );
}

const directMathOptExecutor = new DirectMathOptExecutor();
const workerMathOptExecutor = new SolverWorkerExecutor(
  mathOptProtocol,
  createMathOptWorker,
  operation => (operation.type === 'solve' || operation.type === 'incrementalSolve') && operation.useInterrupter,
);

function createMathOptExecutor(selection: ExecutorSelection = 'auto'): MathOptExecutor {
  return createResolvedMathOptExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedMathOptExecutor(
  configuration: ResolvedExecutorConfiguration,
): MathOptExecutor {
  switch (configuration.type) {
    case 'direct': return directMathOptExecutor;
    case 'worker': return workerMathOptExecutor;
    case 'server': return new SolverServerExecutor(mathOptProtocol, configuration);
    case 'cloud': return new CloudExecutor('mathopt', { test: configuration.test });
  }
}

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

async function convertMathOptResultProto<K extends MathOptSolutionProtoKind | MathOptResultMetadataProtoKind>(
  kind: K, input: Uint8Array | (MathOptSolutionProtoMap & MathOptResultMetadataProtoMap)[K],
  model: Uint8Array, options: MathOptConversionOptions,
): Promise<MathOptConvertedProto<(MathOptSolutionProtoMap & MathOptResultMetadataProtoMap)[K]>> {
  const bytes = encodeMathOptResultProto(kind, input);
  const result = await executeSolverJob(createMathOptExecutor(options.executor),
    { type: 'convertResult', kind: mathOptResultProtoKind(kind), model, input: bytes }, options);
  if ('validationError' in result) throw new Error(result.validationError);
  if (!('validatedResult' in result)) throw new Error('MathOpt executor returned the wrong result conversion response.');
  return { bytes: new Uint8Array(result.validatedResult), proto: decodeMathOptResultProto(kind, result.validatedResult) };
}
export type MathOptMpsExportOptions = MathOptConversionOptions & { removeNames?: boolean };

export async function modelProtoToMps(model: Uint8Array | MathOptModelProto, options: MathOptConversionOptions = {}): Promise<string> {
  const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'modelProtoToMps', model: encodeMathOptModelProto(model) }, options);
  if (!('mps' in result)) throw new Error('MathOpt executor returned the wrong MPS export response.');
  return result.mps;
}
export async function mpsToModelProto(mps: string, options: MathOptConversionOptions = {}): Promise<MathOptModelProto> {
  if (typeof mps !== 'string') throw new TypeError('MPS input must be a string.');
  const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'mpsToModelProto', mps }, options);
  if (!('model' in result)) throw new Error('MathOpt executor returned the wrong MPS import response.');
  return decodeMathOptModelProto(result.model);
}

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

type MathOptObjectiveData = {
  maximize: boolean;
  linearTerms: MathOptLinearTerm[];
  quadraticTerms: MathOptQuadraticTerm[];
  offset: number;
};

type AuxiliaryObjectiveData = {
  id: number;
  name: string;
  priority: bigint;
  deleted: boolean;
  objective: MathOptObjectiveData;
};

type MathOptVariableSnapshot = {
  id: number;
  lowerBound: number;
  upperBound: number;
  integer: boolean;
  name: string;
  deleted: boolean;
};

type MathOptLinearConstraintSnapshot = {
  id: number;
  lowerBound: number;
  upperBound: number;
  terms: Array<{ variableId: number; coefficient: number }>;
  name: string;
  deleted: boolean;
};

type MathOptQuadraticConstraintSnapshot = {
  id: number;
  lowerBound: number;
  upperBound: number;
  linearTerms: MathOptObjectiveSnapshot['linearTerms'];
  quadraticTerms: MathOptObjectiveSnapshot['quadraticTerms'];
  name: string;
  deleted: boolean;
};

type MathOptIndicatorConstraintSnapshot = {
  id: number;
  indicatorId?: number;
  activateOnZero: boolean;
  lowerBound: number;
  upperBound: number;
  terms: Array<{ variableId: number; coefficient: number }>;
  name: string;
  deleted: boolean;
};

type MathOptObjectiveSnapshot = {
  name: string;
  priority: bigint;
  maximize: boolean;
  offset: number;
  linearTerms: Array<{ variableId: number; coefficient: number }>;
  quadraticTerms: Array<{ firstVariableId: number; secondVariableId: number; coefficient: number }>;
};

type MathOptModelSnapshot = {
  variables: MathOptVariableSnapshot[];
  linearConstraints: MathOptLinearConstraintSnapshot[];
  indicatorConstraints: MathOptIndicatorConstraintSnapshot[];
  quadraticConstraints: MathOptQuadraticConstraintSnapshot[];
  objective: MathOptObjectiveSnapshot;
  auxiliaryObjectives: Array<MathOptObjectiveSnapshot & { id: number; deleted: boolean }>;
};

type VariableData = {
  id: number;
  lowerBound: number;
  upperBound: number;
  integer: boolean;
  name: string;
  deleted: boolean;
};

type LinearConstraintData = {
  id: number;
  lowerBound: number;
  upperBound: number;
  terms: MathOptLinearTerm[];
  name: string;
  deleted: boolean;
};

type QuadraticConstraintData = {
  id: number;
  lowerBound: number;
  upperBound: number;
  linearTerms: MathOptLinearTerm[];
  quadraticTerms: MathOptQuadraticTerm[];
  name: string;
  deleted: boolean;
};

type IndicatorConstraintData = {
  id: number;
  indicator?: MathOptVariable;
  activateOnZero: boolean;
  lowerBound: number;
  upperBound: number;
  terms: MathOptLinearTerm[];
  name: string;
  deleted: boolean;
};

type MathOptSolveInterrupterState = {
  useInterrupter: boolean;
  interrupted: boolean;
};

export enum MathOptSolverType {
  GSCIP = 1,
  GUROBI = 2,
  GLOP = 3,
  CP_SAT = 4,
  PDLP = 5,
  GLPK = 6,
  OSQP = 7,
  ECOS = 8,
  SCS = 9,
  HIGHS = 10,
  SANTORINI = 11,
  XPRESS = 13,
}

export enum MathOptLPAlgorithm {
  UNSPECIFIED = 0,
  PRIMAL_SIMPLEX = 1,
  DUAL_SIMPLEX = 2,
  BARRIER = 3,
  FIRST_ORDER = 4,
}

export enum MathOptEmphasis {
  UNSPECIFIED = 0,
  OFF = 1,
  LOW = 2,
  MEDIUM = 3,
  HIGH = 4,
  VERY_HIGH = 5,
}

export enum GScipEmphasis {
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

export enum GScipMetaParamValue {
  DEFAULT_META_PARAM_VALUE = 0,
  AGGRESSIVE = 1,
  FAST = 2,
  OFF = 3,
}

export enum PdlpOptimalityNorm {
  UNSPECIFIED = 0,
  L_INF = 1,
  L2 = 2,
  L_INF_COMPONENTWISE = 3,
}

export enum PdlpSchedulerType {
  UNSPECIFIED = 0,
  GOOGLE_THREADPOOL = 1,
  EIGEN_THREADPOOL = 3,
}

export enum PdlpRestartStrategy {
  UNSPECIFIED = 0,
  NO_RESTARTS = 1,
  EVERY_MAJOR_ITERATION = 2,
  ADAPTIVE_HEURISTIC = 3,
  ADAPTIVE_DISTANCE_BASED = 4,
}

export enum PdlpLinesearchRule {
  UNSPECIFIED = 0,
  ADAPTIVE_LINESEARCH_RULE = 1,
  MALITSKY_POCK_LINESEARCH_RULE = 2,
  CONSTANT_STEP_SIZE_RULE = 3,
}

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

export class GScipParameters {
  constructor(readonly options: GScipParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    const options = this.options;
    return message([
      enumField(1, options.emphasis, GScipEmphasis),
      enumField(2, options.heuristics, GScipMetaParamValue),
      enumField(3, options.presolve, GScipMetaParamValue),
      enumField(4, options.separating, GScipMetaParamValue),
      ...mapFields(5, options.boolParams, fieldBool),
      ...mapFields(6, options.intParams, (field, value) => optionalInt32Field(field, value)),
      ...mapFields(7, options.longParams, fieldVarint),
      ...mapFields(8, options.realParams, fieldDouble),
      ...mapFields(9, options.charParams, fieldString),
      ...mapFields(10, options.stringParams, fieldString),
      optionalBoolField(11, options.silenceOutput),
      optionalBoolField(12, options.printDetailedSolvingStats),
      optionalBoolField(13, options.printScipModel),
      optionalStringField(14, options.searchLogsFilename),
      optionalStringField(15, options.detailedSolvingStatsFilename),
      optionalStringField(16, options.scipModelFilename),
      optionalInt32Field(17, options.numSolutions),
      optionalDoubleField(18, options.objectiveLimit),
    ]);
  }
}

export type GlopParametersOptions = glop_GlopParameters;

export class GlopParameters {
  constructor(readonly options: GlopParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    return encodeGlopParameters(this.options);
  }
}

export type PdlpParametersOptions = Omit<pdlp_PrimalDualHybridGradientParams,
  'terminationCriteria' | 'schedulerType' | 'restartStrategy' | 'linesearchRule'> & {
  terminationCriteria?: Omit<NonNullable<pdlp_PrimalDualHybridGradientParams['terminationCriteria']>, 'optimalityNorm'> & {
    optimalityNorm?: NonNullable<pdlp_PrimalDualHybridGradientParams['terminationCriteria']>['optimalityNorm'] | keyof typeof PdlpOptimalityNorm;
  };
  schedulerType?: pdlp_PrimalDualHybridGradientParams['schedulerType'] | keyof typeof PdlpSchedulerType;
  restartStrategy?: pdlp_PrimalDualHybridGradientParams['restartStrategy'] | keyof typeof PdlpRestartStrategy;
  linesearchRule?: pdlp_PrimalDualHybridGradientParams['linesearchRule'] | keyof typeof PdlpLinesearchRule;
};

export class PdlpParameters {
  constructor(readonly options: PdlpParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    // Retain the existing shortened enum names alongside native protobuf names.
    const alias = (value: unknown, values: Record<string, string | number>) =>
      typeof value === 'string' && typeof values[value] === 'number' ? values[value] : value;
    return encodePdlpParameters({
      ...this.options,
      schedulerType: alias(this.options.schedulerType, PdlpSchedulerType),
      restartStrategy: alias(this.options.restartStrategy, PdlpRestartStrategy),
      linesearchRule: alias(this.options.linesearchRule, PdlpLinesearchRule),
      terminationCriteria: this.options.terminationCriteria && {
        ...this.options.terminationCriteria,
        optimalityNorm: alias(this.options.terminationCriteria.optimalityNorm, PdlpOptimalityNorm),
      },
    } as pdlp_PrimalDualHybridGradientParams);
  }
}

export type GlpkParametersOptions = {
  computeUnboundRaysIfPossible?: boolean;
};

export class GlpkParameters {
  readonly computeUnboundRaysIfPossible?: boolean;

  constructor(options: GlpkParametersOptions = {}) {
    this.computeUnboundRaysIfPossible = options.computeUnboundRaysIfPossible;
  }

  toProtoBytes(): Uint8Array {
    return message([
      this.computeUnboundRaysIfPossible === undefined
        ? empty()
        : fieldBool(1, this.computeUnboundRaysIfPossible),
    ]);
  }
}

export class MathOptSolveInterrupter {
  private interruptedValue = false;
  private readonly interruptionController = new AbortController();
  get signal(): AbortSignal { return this.interruptionController.signal; }

  interrupt(): void {
    this.interruptedValue = true;
    this.interruptionController.abort();
  }

  get interrupted(): boolean {
    return this.interruptedValue;
  }

  isInterrupted(): boolean {
    return this.interruptedValue;
  }

}

export class MathOptSparseVectorFilter<TElement = never> {
  constructor(readonly options: MathOptSparseVectorFilterOptions<TElement> = {}) {}

  toProtoBytes(model?: MathOptModel): Uint8Array {
    return encodeSparseVectorFilter(this.options, model);
  }
}

export class MathOptSolutionHint {
  constructor(readonly options: MathOptSolutionHintOptions = {}) {}

  toProtoBytes(model?: MathOptModel): Uint8Array {
    const { variableValues, dualValues } = this.options;
    for (const term of variableValues ?? []) parameterElementId(term.variable, model);
    for (const term of dualValues ?? []) parameterElementId(term.linearConstraint, model);
    return message([
      fieldMessageIfPresent(1, variableValues === undefined ? null : encodeSparseDoubleVector(
        variableValues.map(({ variable, value }) => ({ variable, coefficient: value })))),
      fieldMessageIfPresent(2, dualValues === undefined
        ? null
        : encodeLinearConstraintDoubleVector(dualValues)),
    ]);
  }
}

export class MathOptObjectiveParameters {
  constructor(readonly options: MathOptObjectiveParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    return message([
      this.options.objectiveDegradationAbsoluteTolerance === undefined ? empty()
        : fieldDouble(7, this.options.objectiveDegradationAbsoluteTolerance),
      this.options.objectiveDegradationRelativeTolerance === undefined ? empty()
        : fieldDouble(8, this.options.objectiveDegradationRelativeTolerance),
      fieldDurationSeconds(9, this.options.timeLimitSeconds),
    ]);
  }
}

export class MathOptModelSolveParameters {
  constructor(readonly options: MathOptModelSolveParametersOptions = {}) {}

  toProtoBytes(model?: MathOptModel): Uint8Array {
    const options = this.options;
    const lazyLinearConstraintIds = options.lazyLinearConstraints?.map((constraint) =>
      parameterElementId(constraint, model)
    );
    for (const term of options.branchingPriorities ?? []) parameterElementId(term.variable, model);
    const objectives: Uint8Array[] = [];
    for (const [objective, parameters] of options.objectiveParameters ?? []) {
      if (model) model.assertOwnsObjective(objective); else objective.assertLive();
      const bytes = parameters instanceof Uint8Array ? new Uint8Array(parameters)
        : (parameters instanceof MathOptObjectiveParameters ? parameters : new MathOptObjectiveParameters(parameters)).toProtoBytes();
      const id = objectiveIds.get(objective);
      objectives.push(id !== undefined
        ? fieldMessage(8, message([fieldVarint(1, id), fieldMessage(2, bytes)]))
        : fieldMessage(7, bytes));
    }
    return message([
      fieldMessageIfPresent(1, modelFilterBytes(options.variableValuesFilter, model)),
      fieldMessageIfPresent(2, modelFilterBytes(options.dualValuesFilter, model)),
      fieldMessageIfPresent(10, modelFilterBytes(options.quadraticDualValuesFilter, model)),
      fieldMessageIfPresent(3, modelFilterBytes(options.reducedCostsFilter, model)),
      fieldMessageIfPresent(4, options.initialBasis),
      ...(options.solutionHints ?? []).map((hint) => fieldMessage(5, solutionHintBytes(hint, model))),
      fieldMessageIfPresent(6, options.branchingPriorities === undefined
        ? null
        : encodeVariableInt32Vector(options.branchingPriorities)),
      fieldPackedVarintsIfPresent(9, lazyLinearConstraintIds),
      ...objectives,
    ]);
  }

  static onlySomePrimalVariables(variables: MathOptVariable[]): MathOptModelSolveParameters {
    return new MathOptModelSolveParameters({
      variableValuesFilter: { elements: variables, filterByIds: true },
    });
  }

}

export class MathOptQuadraticTermKey {
  readonly firstVariable: MathOptVariable;
  readonly secondVariable: MathOptVariable;

  constructor(firstVariable: MathOptVariable, secondVariable: MathOptVariable) {
    if (firstVariable.model !== secondVariable.model) {
      throw new Error('Quadratic term variables belong to different MathOpt models.');
    }
    if (firstVariable.id <= secondVariable.id) {
      this.firstVariable = firstVariable;
      this.secondVariable = secondVariable;
    } else {
      this.firstVariable = secondVariable;
      this.secondVariable = firstVariable;
    }
  }

  equals(other: MathOptQuadraticTermKey): boolean {
    return this.firstVariable.equals(other.firstVariable)
      && this.secondVariable.equals(other.secondVariable);
  }

  toString(): string {
    return `${this.firstVariable.toString()} * ${this.secondVariable.toString()}`;
  }
}

export class MathOptLinearExpression {
  readonly offset: number;
  readonly terms: ReadonlyMap<MathOptVariable, number>;

  constructor(terms: Iterable<MathOptLinearTerm> = [], offset = 0) {
    const merged = new Map<MathOptVariable, number>();
    const keys = new Map<VariableData, MathOptVariable>();
    for (const term of terms) {
      if (!isLinearTerm(term)) {
        throw new TypeError('unsupported type in iterable argument');
      }
      const record = variableRecords.get(term.variable)!;
      const existing = keys.get(record);
      const next = (existing ? merged.get(existing) ?? 0 : 0) + term.coefficient;
      if (existing) merged.delete(existing);
      if (next !== 0) merged.set(term.variable, next);
      keys.set(record, term.variable);
    }
    this.terms = readonlyMap(merged);
    this.offset = offset;
  }

  add(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    const rhs = asFlatLinearExpression(input);
    return new MathOptLinearExpression([
      ...linearTermEntries(this),
      ...linearTermEntries(rhs),
    ], this.offset + rhs.offset);
  }

  subtract(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    return this.add(asFlatLinearExpression(input).multiply(-1));
  }

  multiply(coefficient: number): MathOptLinearExpression {
    return new MathOptLinearExpression(
      linearTermEntries(this).map((term) => ({
        variable: term.variable,
        coefficient: term.coefficient * coefficient,
      })),
      this.offset * coefficient,
    );
  }

  toString(): string {
    return formatExpression(this.offset, linearTermEntries(this), []);
  }

  evaluate(variableValues: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>): number {
    return evaluateExpression(this, variableValues);
  }
}

export class MathOptQuadraticExpression {
  readonly offset: number;
  readonly linearTerms: ReadonlyMap<MathOptVariable, number>;
  readonly quadraticTerms: ReadonlyMap<MathOptQuadraticTermKey, number>;

  constructor(
    linearTerms: Iterable<MathOptLinearTerm> = [],
    quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
    offset = 0,
  ) {
    this.linearTerms = new MathOptLinearExpression(linearTerms).terms;
    const merged = new Map<MathOptQuadraticTermKey, number>();
    const keys = new Map<VariableData, Map<VariableData, MathOptQuadraticTermKey>>();
    for (const term of quadraticTerms) {
      if (!isQuadraticTerm(term)) {
        throw new TypeError('unsupported type in iterable argument');
      }
      const key = new MathOptQuadraticTermKey(term.firstVariable, term.secondVariable);
      const first = variableRecords.get(key.firstVariable)!;
      const second = variableRecords.get(key.secondVariable)!;
      let row = keys.get(first);
      if (!row) keys.set(first, row = new Map());
      const existing = row.get(second);
      const next = (existing ? merged.get(existing) ?? 0 : 0) + term.coefficient;
      if (existing) merged.delete(existing);
      if (next !== 0) merged.set(key, next);
      row.set(second, key);
    }
    this.quadraticTerms = readonlyMap(merged);
    this.offset = offset;
  }

  add(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
    const rhs = asFlatQuadraticExpression(input);
    return new MathOptQuadraticExpression(
      [...linearTermEntriesFromMap(this.linearTerms), ...linearTermEntriesFromMap(rhs.linearTerms)],
      [...quadraticTermEntries(this), ...quadraticTermEntries(rhs)],
      this.offset + rhs.offset,
    );
  }

  subtract(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
    return this.add(asFlatQuadraticExpression(input).multiply(-1));
  }

  multiply(coefficient: number): MathOptQuadraticExpression {
    return new MathOptQuadraticExpression(
      linearTermEntriesFromMap(this.linearTerms).map((term) => ({
        variable: term.variable,
        coefficient: term.coefficient * coefficient,
      })),
      quadraticTermEntries(this).map((term) => ({
        firstVariable: term.firstVariable,
        secondVariable: term.secondVariable,
        coefficient: term.coefficient * coefficient,
      })),
      this.offset * coefficient,
    );
  }

  evaluate(variableValues: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>): number {
    return evaluateExpression(this, variableValues);
  }

  toString(): string {
    return formatExpression(this.offset, linearTermEntriesFromMap(this.linearTerms), quadraticTermEntries(this));
  }
}

export class MathOptBoundedExpression<TExpression = unknown> {
  constructor(
    readonly lowerBound: number,
    readonly expression: TExpression,
    readonly upperBound: number,
  ) {}

  toString(): string {
    return `${formatBound(this.lowerBound)} <= ${String(this.expression)} <= ${formatBound(this.upperBound)}`;
  }
}

export class MathOptLowerBoundedExpression<TExpression = unknown> {
  readonly upperBound = Number.POSITIVE_INFINITY;

  constructor(
    readonly lowerBound: number,
    readonly expression: TExpression,
  ) {}

  toBoundedExpression(upperBound: number): MathOptBoundedExpression<TExpression> {
    return new MathOptBoundedExpression(this.lowerBound, this.expression, upperBound);
  }

  toString(): string {
    return `${String(this.expression)} >= ${formatBound(this.lowerBound)}`;
  }
}

export class MathOptUpperBoundedExpression<TExpression = unknown> {
  readonly lowerBound = Number.NEGATIVE_INFINITY;

  constructor(
    readonly expression: TExpression,
    readonly upperBound: number,
  ) {}

  toBoundedExpression(lowerBound: number): MathOptBoundedExpression<TExpression> {
    return new MathOptBoundedExpression(lowerBound, this.expression, this.upperBound);
  }

  toString(): string {
    return `${String(this.expression)} <= ${formatBound(this.upperBound)}`;
  }
}

const terminationReasonNames: Record<number, string> = {
  0: 'TERMINATION_REASON_UNSPECIFIED',
  1: 'TERMINATION_REASON_OPTIMAL',
  2: 'TERMINATION_REASON_INFEASIBLE',
  3: 'TERMINATION_REASON_UNBOUNDED',
  4: 'TERMINATION_REASON_INFEASIBLE_OR_UNBOUNDED',
  5: 'TERMINATION_REASON_IMPRECISE',
  6: 'TERMINATION_REASON_NO_SOLUTION_FOUND',
  7: 'TERMINATION_REASON_NUMERICAL_ERROR',
  8: 'TERMINATION_REASON_OTHER_ERROR',
  9: 'TERMINATION_REASON_FEASIBLE',
};

const terminationLimitNames: Record<number, string> = {
  0: 'LIMIT_UNSPECIFIED',
  1: 'LIMIT_UNDETERMINED',
  2: 'LIMIT_ITERATION',
  3: 'LIMIT_TIME',
  4: 'LIMIT_NODE',
  5: 'LIMIT_SOLUTION',
  6: 'LIMIT_MEMORY',
  7: 'LIMIT_OBJECTIVE',
  8: 'LIMIT_NORM',
  9: 'LIMIT_INTERRUPTED',
  10: 'LIMIT_SLOW_PROGRESS',
  11: 'LIMIT_OTHER',
  12: 'LIMIT_CUTOFF',
};

const solutionStatusNames: Record<number, string> = {
  0: 'SOLUTION_STATUS_UNSPECIFIED',
  1: 'SOLUTION_STATUS_UNDETERMINED',
  2: 'SOLUTION_STATUS_FEASIBLE',
  3: 'SOLUTION_STATUS_INFEASIBLE',
};

const feasibilityStatusNames: Record<number, string> = {
  0: 'FEASIBILITY_STATUS_UNSPECIFIED',
  1: 'FEASIBILITY_STATUS_UNDETERMINED',
  2: 'FEASIBILITY_STATUS_FEASIBLE',
  3: 'FEASIBILITY_STATUS_INFEASIBLE',
};

const basisStatusNames: Record<number, string> = {
  0: 'BASIS_STATUS_UNSPECIFIED',
  1: 'BASIS_STATUS_FREE',
  2: 'BASIS_STATUS_AT_LOWER_BOUND',
  3: 'BASIS_STATUS_AT_UPPER_BOUND',
  4: 'BASIS_STATUS_FIXED_VALUE',
  5: 'BASIS_STATUS_BASIC',
};

// Objective handles share model storage without exposing mutable records as API.
type ObjectiveAccess = {
  getData(id?: number): MathOptObjectiveData;
  setData(id: number | undefined, data: MathOptObjectiveData): void;
  name(id?: number): string;
  priority(id?: number): bigint;
  setPriority(id: number | undefined, value: IntValue): void;
};
const objectiveAccess = new WeakMap<MathOptModel, ObjectiveAccess>();
function objectiveStorage(model: MathOptModel): ObjectiveAccess {
  const access = objectiveAccess.get(model);
  if (!access) throw new TypeError('Objective requires a MathOpt model.');
  return access;
}
function copyObjectiveData(data: MathOptObjectiveData): MathOptObjectiveData {
  return { ...data, linearTerms: data.linearTerms.map(term => ({ ...term })),
    quadraticTerms: data.quadraticTerms.map(term => ({ ...term })) };
}

let snapshotModel: (model: MathOptModel) => MathOptModelSnapshot;

export class MathOptModel {
  readonly name: string;
  private readonly variableData = new Map<number, VariableData>();
  private nextVariableId = 0;
  private readonly constraints = new Map<number, LinearConstraintData>();
  private nextLinearConstraintId = 0;
  private readonly indicatorConstraintData = new Map<number, IndicatorConstraintData>();
  private nextIndicatorConstraintId = 0;
  private readonly quadraticConstraintData = new Map<number, QuadraticConstraintData>();
  private nextQuadraticConstraintId = 0;
  private objectiveDataValue: MathOptObjectiveData = {
    maximize: false,
    linearTerms: [],
    quadraticTerms: [],
    offset: 0,
  };
  private primaryObjectiveNameValue = '';
  private primaryObjectivePriority = 0n;
  private readonly auxiliaryObjectiveData = new Map<number, AuxiliaryObjectiveData>();
  private nextAuxiliaryObjectiveId = 0;
  private readonly updateTrackers = new Set<MathOptUpdateTracker>();
  readonly objective: MathOptObjective;

  static { snapshotModel = model => model.snapshot(); }

  constructor(name = '', options: MathOptModelOptions = {}) {
    this.name = name;
    this.primaryObjectiveNameValue = options.primaryObjectiveName ?? '';
    objectiveAccess.set(this, {
      getData: id => this.getObjectiveData(id), setData: (id, data) => this.setObjectiveData(id, data),
      name: id => this.objectiveName(id), priority: id => this.objectivePriority(id),
      setPriority: (id, value) => this.setObjectivePriority(id, value),
    });
    this.objective = createMathOptObjective(this);
  }

  static async fromModelProto(input: Uint8Array | MathOptModelProto, options: MathOptConversionOptions = {}): Promise<MathOptModel> {
    const bytes = encodeMathOptModelProto(input);
    const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'validateModel', model: bytes }, options);
    if (!('validationError' in result)) throw new Error('MathOpt executor returned the wrong validation response.');
    if (result.validationError) throw new Error(result.validationError);
    const data = decodeMathOptModel(bytes);
    const model = new MathOptModel(data.name);
    const variables = new Map<number, MathOptVariable>();
    for (const variable of data.variables) {
      model.ensureNextVariableIdAtLeast(variable.id);
      variables.set(variable.id, model.addVariable(variable));
    }
    const variableForId = (id: number): MathOptVariable => {
      const variable = variables.get(id);
      if (!variable) throw new Error(`Imported MathOpt model references missing variable ${id}.`);
      return variable;
    };
    const linearTerms = (terms: ImportedLinearTerm[]): MathOptLinearTerm[] => terms.map(term =>
      ({ variable: variableForId(term.variableId), coefficient: term.coefficient }));
    const quadraticTerms = (terms: ImportedQuadraticTerm[]): MathOptQuadraticTerm[] => terms.map(term =>
      ({ firstVariable: variableForId(term.firstVariableId), secondVariable: variableForId(term.secondVariableId), coefficient: term.coefficient }));
    for (const row of data.linearConstraints) {
      model.ensureNextLinearConstraintIdAtLeast(row.id);
      model.addLinearConstraint({ ...row, terms: linearTerms(row.terms) });
    }
    model.setObjectiveData(undefined, { maximize: data.objective.maximize, offset: data.objective.offset,
      linearTerms: linearTerms(data.objective.linearTerms), quadraticTerms: quadraticTerms(data.objective.quadraticTerms) });
    model.primaryObjectiveNameValue = data.objective.name;
    model.primaryObjectivePriority = data.objective.priority;
    for (const objective of data.auxiliaryObjectives) {
      if (objective.quadraticTerms.length) throw new Error('Quadratic auxiliary objectives are not supported by the editable model; use solveProto.');
      model.ensureNextAuxiliaryObjectiveIdAtLeast(objective.id);
      model.addAuxiliaryObjective({ priority: objective.priority, name: objective.name,
        isMaximize: objective.maximize, expression: new MathOptLinearExpression(linearTerms(objective.linearTerms), objective.offset) });
    }
    for (const constraint of data.quadraticConstraints) {
      model.ensureNextQuadraticConstraintIdAtLeast(constraint.id);
      model.addQuadraticConstraint({ ...constraint,
        terms: linearTerms(constraint.linearTerms), quadraticTerms: quadraticTerms(constraint.quadraticTerms) });
    }
    for (const constraint of data.indicatorConstraints) {
      model.ensureNextIndicatorConstraintIdAtLeast(constraint.id);
      model.addIndicatorConstraint({ ...constraint, terms: linearTerms(constraint.terms),
        indicator: constraint.indicatorId === undefined ? undefined : variableForId(constraint.indicatorId) });
    }
    return model;
  }

  addAuxiliaryObjective(options: MathOptAuxiliaryObjectiveOptions): MathOptAuxiliaryObjective {
    if (this.nextAuxiliaryObjectiveId >= Number.MAX_SAFE_INTEGER) throw new RangeError('Auxiliary objective ID exceeds the safe integer API range.');
    const priority = objectivePriority(options.priority);
    const objective = linearObjectiveData(options.isMaximize ?? false, options.expression ?? 0, 0);
    this.validateObjectiveData(objective);
    const id = this.nextAuxiliaryObjectiveId++;
    this.auxiliaryObjectiveData.set(id, { id, name: options.name ?? '', priority, deleted: false, objective });
    return createMathOptAuxiliaryObjective(this, id);
  }

  addMaximizationObjective(expr: MathOptLinearExpressionInput, options: Pick<MathOptAuxiliaryObjectiveOptions, 'priority' | 'name'>): MathOptAuxiliaryObjective {
    return this.addAuxiliaryObjective({ ...options, expression: expr, isMaximize: true });
  }

  addMinimizationObjective(expr: MathOptLinearExpressionInput, options: Pick<MathOptAuxiliaryObjectiveOptions, 'priority' | 'name'>): MathOptAuxiliaryObjective {
    return this.addAuxiliaryObjective({ ...options, expression: expr, isMaximize: false });
  }

  auxiliaryObjectives(): MathOptAuxiliaryObjective[] {
    return [...this.auxiliaryObjectiveData.values()].filter(data => !data.deleted)
      .map(data => createMathOptAuxiliaryObjective(this, data.id));
  }

  getAuxiliaryObjective(id: number): MathOptAuxiliaryObjective | undefined {
    return this.hasAuxiliaryObjective(id) ? createMathOptAuxiliaryObjective(this, id) : undefined;
  }

  hasAuxiliaryObjective(id: number): boolean {
    const data = this.auxiliaryObjectiveData.get(id);
    return data !== undefined && !data.deleted;
  }

  getNumAuxiliaryObjectives(): number { return this.auxiliaryObjectives().length; }
  getNextAuxiliaryObjectiveId(): number { return this.nextAuxiliaryObjectiveId; }
  ensureNextAuxiliaryObjectiveIdAtLeast(id: number): void {
    this.nextAuxiliaryObjectiveId = Math.max(this.nextAuxiliaryObjectiveId, toIndex(id, 'MathOpt next auxiliary objective ID'));
  }

  deleteAuxiliaryObjective(objective: MathOptAuxiliaryObjective): void {
    this.assertOwnsObjective(objective);
    this.auxiliaryObjectiveData.get(objective.id)!.deleted = true;
  }

  assertOwnsObjective(objective: MathOptObjective): void {
    if (!objectiveIds.has(objective) || objective.model !== this) throw new Error('Objective belongs to a different MathOpt model or is not registered.');
    objective.assertLive();
  }

  private auxiliaryData(id: number): AuxiliaryObjectiveData {
    const data = this.auxiliaryObjectiveData.get(id);
    if (!data || data.deleted) throw new Error(`Auxiliary objective ${id} has been deleted or does not exist.`);
    return data;
  }

  private getObjectiveData(id?: number): MathOptObjectiveData {
    return id === undefined ? this.objectiveDataValue : this.auxiliaryData(id).objective;
  }

  private setObjectiveData(id: number | undefined, value: MathOptObjectiveData): void {
    this.validateObjectiveData(value);
    if (id === undefined) this.objectiveDataValue = copyObjectiveData(value);
    else {
      const data = this.auxiliaryData(id);
      if (value.quadraticTerms.length) throw new Error('Quadratic auxiliary objectives are not supported.');
      data.objective = copyObjectiveData(value);
    }
  }

  private objectiveName(id?: number): string {
    return id === undefined ? this.primaryObjectiveNameValue : this.auxiliaryData(id).name;
  }

  private objectivePriority(id?: number): bigint {
    return id === undefined ? this.primaryObjectivePriority : this.auxiliaryData(id).priority;
  }

  private setObjectivePriority(id: number | undefined, value: IntValue): void {
    const priority = objectivePriority(value);
    if (id === undefined) this.primaryObjectivePriority = priority;
    else this.auxiliaryData(id).priority = priority;
  }

  addUpdateTracker(): MathOptUpdateTracker {
    let checkpoint = this.snapshot();
    const assertActive = () => {
      if (!this.updateTrackers.has(tracker)) throw new Error('MathOpt update tracker has been removed.');
    };
    const tracker = createUpdateTracker(options => {
      assertActive();
      return encodeModelUpdate(checkpoint, this.snapshot(), options);
    }, () => { assertActive(); checkpoint = this.snapshot(); });
    this.updateTrackers.add(tracker);
    return tracker;
  }

  removeUpdateTracker(tracker: MathOptUpdateTracker): void {
    if (!this.updateTrackers.delete(tracker))
      throw new Error('MathOpt update tracker belongs to another model or has been removed.');
  }

  addVariable(options: MathOptVariableOptions = {}): MathOptVariable {
    if (this.nextVariableId >= Number.MAX_SAFE_INTEGER) throw new RangeError('Variable ID exceeds the safe integer API range.');
    const id = this.nextVariableId;
    const variable: VariableData = {
      id,
      lowerBound: options.lowerBound ?? Number.NEGATIVE_INFINITY,
      upperBound: options.upperBound ?? Number.POSITIVE_INFINITY,
      integer: options.integer ?? false,
      name: options.name ?? '',
      deleted: false,
    };
    this.variableData.set(id, variable);
    ++this.nextVariableId;
    return createMathOptVariable(this, variable);
  }

  addIntegerVariable(options: Omit<MathOptVariableOptions, 'integer'> = {}): MathOptVariable {
    return this.addVariable({ ...options, integer: true });
  }

  addBinaryVariable(options: Omit<MathOptVariableOptions, 'lowerBound' | 'upperBound' | 'integer'> = {}): MathOptVariable {
    return this.addVariable({ ...options, lowerBound: 0, upperBound: 1, integer: true });
  }

  addLinearConstraint(
    options: Partial<MathOptLinearConstraintOptions> | MathOptBoundedExpression<MathOptLinearExpression> | MathOptLowerBoundedExpression<MathOptLinearExpression> | MathOptUpperBoundedExpression<MathOptLinearExpression> = {},
  ): MathOptLinearConstraint {
    if (this.nextLinearConstraintId >= Number.MAX_SAFE_INTEGER) throw new RangeError('Linear constraint ID exceeds the safe integer API range.');
    const id = this.nextLinearConstraintId;
    const normalizedOptions = this.normalizeLinearConstraintOptions(options);
    const expression = normalizedOptions.expression === undefined
      ? new MathOptLinearExpression(normalizedOptions.terms ?? [])
      : asFlatLinearExpression(normalizedOptions.expression).add(new MathOptLinearExpression(normalizedOptions.terms ?? []));
    if (!Number.isFinite(expression.offset)) {
      throw new Error('linear constraint expression has an infinite offset.');
    }
    const constraint: LinearConstraintData = {
      id,
      lowerBound: (normalizedOptions.lowerBound ?? Number.NEGATIVE_INFINITY) - expression.offset,
      upperBound: (normalizedOptions.upperBound ?? Number.POSITIVE_INFINITY) - expression.offset,
      terms: linearTermEntries(expression),
      name: normalizedOptions.name ?? '',
      deleted: false,
    };
    for (const term of constraint.terms) this.assertOwnsVariable(term.variable);
    this.constraints.set(id, constraint);
    ++this.nextLinearConstraintId;
    return createMathOptLinearConstraint(this, constraint);
  }

  addQuadraticConstraint(
    options: MathOptQuadraticConstraintOptions
      | MathOptBoundedExpression<MathOptQuadraticExpressionInput>
      | MathOptLowerBoundedExpression<MathOptQuadraticExpressionInput>
      | MathOptUpperBoundedExpression<MathOptQuadraticExpressionInput> = {},
  ): MathOptQuadraticConstraint {
    let normalized: MathOptQuadraticConstraintOptions;
    if (options instanceof MathOptBoundedExpression) normalized = {
      lowerBound: options.lowerBound, upperBound: options.upperBound, expression: options.expression,
    };
    else if (options instanceof MathOptLowerBoundedExpression) normalized = {
      lowerBound: options.lowerBound, expression: options.expression,
    };
    else if (options instanceof MathOptUpperBoundedExpression) normalized = {
      upperBound: options.upperBound, expression: options.expression,
    };
    else {
      if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError('Quadratic constraint requires bounds and an expression.');
      }
      normalized = options;
    }
    const expression = asFlatQuadraticExpression(normalized.expression ?? 0)
      .add(new MathOptQuadraticExpression(normalized.terms ?? [], normalized.quadraticTerms ?? []));
    if (!Number.isFinite(expression.offset)) throw new Error('Quadratic constraint has a non-finite offset.');
    const linearTerms = linearTermEntriesFromMap(expression.linearTerms);
    const quadraticTerms = quadraticTermEntries(expression);
    for (const term of linearTerms) this.assertOwnsVariable(term.variable);
    for (const term of quadraticTerms) {
      this.assertOwnsVariable(term.firstVariable);
      this.assertOwnsVariable(term.secondVariable);
    }
    if (this.nextQuadraticConstraintId >= Number.MAX_SAFE_INTEGER) throw new RangeError(
      'Quadratic constraint ID exceeds the safe integer API range.');
    const id = this.nextQuadraticConstraintId++;
    const data: QuadraticConstraintData = {
      id, lowerBound: (normalized.lowerBound ?? -Infinity) - expression.offset,
      upperBound: (normalized.upperBound ?? Infinity) - expression.offset,
      linearTerms, quadraticTerms, name: normalized.name ?? '', deleted: false,
    };
    this.quadraticConstraintData.set(id, data);
    return createMathOptQuadraticConstraint(this, data);
  }

  quadraticConstraints(): MathOptQuadraticConstraint[] {
    return [...this.quadraticConstraintData.values()].filter(data => !data.deleted)
      .map(data => createMathOptQuadraticConstraint(this, data));
  }
  getNumQuadraticConstraints(): number { return this.quadraticConstraints().length; }
  getNextQuadraticConstraintId(): number { return this.nextQuadraticConstraintId; }
  ensureNextQuadraticConstraintIdAtLeast(id: number): void {
    if (!Number.isSafeInteger(id) || id < 0) throw new RangeError('Quadratic constraint ID must be a nonnegative safe integer.');
    this.nextQuadraticConstraintId = Math.max(this.nextQuadraticConstraintId, id);
  }
  hasQuadraticConstraint(id: number): boolean { return !!this.getQuadraticConstraint(id); }
  getQuadraticConstraint(id: number): MathOptQuadraticConstraint | undefined {
    const data = this.quadraticConstraintData.get(id);
    return data && !data.deleted ? createMathOptQuadraticConstraint(this, data) : undefined;
  }
  deleteQuadraticConstraint(constraint: MathOptQuadraticConstraint): void {
    const record = quadraticConstraintRecords.get(constraint);
    if (!record || constraint.model !== this || this.quadraticConstraintData.get(constraint.id) !== record)
      throw new Error('Quadratic constraint belongs to a different MathOpt model or is not registered.');
    constraint.assertLive();
    record.deleted = true;
  }

  addIndicatorConstraint(options: MathOptIndicatorConstraintOptions = {}): MathOptIndicatorConstraint {
    const normalizedOptions = this.normalizeIndicatorConstraintOptions(options);
    if (normalizedOptions.indicator) {
      this.assertOwnsVariable(normalizedOptions.indicator);
    }
    const expression = normalizedOptions.expression === undefined
      ? new MathOptLinearExpression(normalizedOptions.terms ?? [])
      : asFlatLinearExpression(normalizedOptions.expression).add(new MathOptLinearExpression(normalizedOptions.terms ?? []));
    if (!Number.isFinite(expression.offset)) {
      throw new Error('indicator constraint expression has an infinite offset.');
    }
    const constraint: IndicatorConstraintData = {
      id: this.nextIndicatorConstraintId,
      indicator: normalizedOptions.indicator,
      activateOnZero: normalizedOptions.activateOnZero ?? false,
      lowerBound: (normalizedOptions.lowerBound ?? Number.NEGATIVE_INFINITY) - expression.offset,
      upperBound: (normalizedOptions.upperBound ?? Number.POSITIVE_INFINITY) - expression.offset,
      terms: linearTermEntries(expression),
      name: normalizedOptions.name ?? '',
      deleted: false,
    };
    for (const term of constraint.terms) this.assertOwnsVariable(term.variable);
    if (this.nextIndicatorConstraintId >= Number.MAX_SAFE_INTEGER) throw new RangeError(
      'Indicator constraint ID exceeds the safe integer API range.');
    this.indicatorConstraintData.set(constraint.id, constraint);
    this.nextIndicatorConstraintId++;
    return createMathOptIndicatorConstraint(this, constraint);
  }

  indicatorConstraints(): MathOptIndicatorConstraint[] {
    return [...this.indicatorConstraintData.values()].filter(data => !data.deleted)
      .map(data => createMathOptIndicatorConstraint(this, data));
  }

  getNumIndicatorConstraints(): number { return this.indicatorConstraints().length; }
  getNextIndicatorConstraintId(): number { return this.nextIndicatorConstraintId; }

  ensureNextIndicatorConstraintIdAtLeast(id: number): void {
    if (!Number.isSafeInteger(id) || id < 0) throw new RangeError('Indicator constraint ID must be a nonnegative safe integer.');
    this.nextIndicatorConstraintId = Math.max(this.nextIndicatorConstraintId, id);
  }

  hasIndicatorConstraint(id: number): boolean { return !!this.getIndicatorConstraint(id); }

  getIndicatorConstraint(id: number): MathOptIndicatorConstraint | undefined {
    const index = toIndex(id, 'Indicator constraint ID');
    const data = this.indicatorConstraintData.get(index);
    if (data && !data.deleted) return createMathOptIndicatorConstraint(this, data);
    return undefined;
  }

  deleteIndicatorConstraint(constraint: MathOptIndicatorConstraint): void {
    const record = indicatorConstraintRecords.get(constraint);
    if (!record || constraint.model !== this || this.indicatorConstraintData.get(constraint.id) !== record)
      throw new Error('Indicator constraint does not belong to this MathOpt model.');
    constraint.assertLive();
    record.deleted = true;
  }

  private normalizeLinearConstraintOptions(
    options: Partial<MathOptLinearConstraintOptions> | MathOptBoundedExpression<MathOptLinearExpression> | MathOptLowerBoundedExpression<MathOptLinearExpression> | MathOptUpperBoundedExpression<MathOptLinearExpression>,
  ): Partial<MathOptLinearConstraintOptions> {
    if (options instanceof MathOptBoundedExpression) {
      return { lowerBound: options.lowerBound, upperBound: options.upperBound, expression: options.expression };
    }
    if (options instanceof MathOptLowerBoundedExpression) {
      return { lowerBound: options.lowerBound, upperBound: Number.POSITIVE_INFINITY, expression: options.expression };
    }
    if (options instanceof MathOptUpperBoundedExpression) {
      return { lowerBound: Number.NEGATIVE_INFINITY, upperBound: options.upperBound, expression: options.expression };
    }
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`Unsupported type for bounded_expr argument: ${mathOptOperandType(options)}`);
    }
    return {
      ...options,
      lowerBound: options.lowerBound,
      upperBound: options.upperBound,
      expression: options.expression,
    };
  }

  private normalizeIndicatorConstraintOptions(options: MathOptIndicatorConstraintOptions): {
    indicator?: MathOptVariable;
    activateOnZero?: boolean;
    lowerBound?: number;
    upperBound?: number;
    terms?: MathOptLinearTerm[];
    expression?: MathOptLinearExpressionInput;
    name?: string;
  } {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError(`Unsupported type for indicator constraint options: ${mathOptOperandType(options)}`);
    }
    const implied = options.impliedConstraint;
    if (implied instanceof MathOptBoundedExpression) {
      return {
        indicator: options.indicator,
        activateOnZero: options.activateOnZero,
        lowerBound: implied.lowerBound,
        upperBound: implied.upperBound,
        expression: implied.expression,
        name: options.name,
      };
    }
    if (implied instanceof MathOptLowerBoundedExpression) {
      return {
        indicator: options.indicator,
        activateOnZero: options.activateOnZero,
        lowerBound: implied.lowerBound,
        upperBound: Number.POSITIVE_INFINITY,
        expression: implied.expression,
        name: options.name,
      };
    }
    if (implied instanceof MathOptUpperBoundedExpression) {
      return {
        indicator: options.indicator,
        activateOnZero: options.activateOnZero,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: implied.upperBound,
        expression: implied.expression,
        name: options.name,
      };
    }
    return {
      indicator: options.indicator,
      activateOnZero: options.activateOnZero,
      lowerBound: options.lowerBound,
      upperBound: options.upperBound,
      expression: options.expression,
      terms: options.terms,
      name: options.name,
    };
  }

  deleteVariable(variable: MathOptVariable): void {
    this.assertOwnsVariable(variable);
    if (variableRecords.get(variable)!.deleted) {
      throw new Error(`Variable ${variable.id} has already been deleted.`);
    }
    variableRecords.get(variable)!.deleted = true;
    for (const constraint of this.constraints.values()) {
      constraint.terms = constraint.terms.filter((term) => term.variable.id !== variable.id);
    }
    for (const constraint of this.indicatorConstraintData.values()) {
      constraint.terms = constraint.terms.filter((term) => term.variable.id !== variable.id);
      if (constraint.indicator?.id === variable.id) {
        constraint.indicator = undefined;
      }
    }
    for (const constraint of this.quadraticConstraintData.values()) {
      constraint.linearTerms = constraint.linearTerms.filter(term => term.variable.id !== variable.id);
      constraint.quadraticTerms = constraint.quadraticTerms.filter(term =>
        term.firstVariable.id !== variable.id && term.secondVariable.id !== variable.id);
    }
    this.objectiveDataValue.linearTerms = this.objectiveDataValue.linearTerms.filter((term) => term.variable.id !== variable.id);
    this.objectiveDataValue.quadraticTerms = this.objectiveDataValue.quadraticTerms.filter((term) => {
      return term.firstVariable.id !== variable.id && term.secondVariable.id !== variable.id;
    });
    for (const data of this.auxiliaryObjectiveData.values()) {
      data.objective.linearTerms = data.objective.linearTerms.filter(term => term.variable.id !== variable.id);
    }
  }

  deleteLinearConstraint(constraint: MathOptLinearConstraint): void {
    this.assertOwnsConstraint(constraint);
    if (linearConstraintRecords.get(constraint)!.deleted) {
      throw new Error(`Linear constraint ${constraint.id} has already been deleted.`);
    }
    linearConstraintRecords.get(constraint)!.deleted = true;
  }

  variables(): MathOptVariable[] {
    return [...this.variableData.values()]
      .filter((variable) => !variable.deleted)
      .map((variable) => createMathOptVariable(this, variable));
  }

  getNumVariables(): number {
    return this.variables().length;
  }

  getNextVariableId(): number {
    return this.nextVariableId;
  }

  ensureNextVariableIdAtLeast(id: number): void {
    this.nextVariableId = Math.max(this.nextVariableId, toIndex(id, 'MathOpt next variable ID'));
  }

  hasVariable(id: number): boolean {
    return !!this.getVariable(id);
  }

  getVariable(id: number): MathOptVariable | undefined {
    const variable = this.variableData.get(id);
    if (variable && !variable.deleted) return createMathOptVariable(this, variable);
    return undefined;
  }

  linearConstraints(): MathOptLinearConstraint[] {
    return [...this.constraints.values()]
      .filter((constraint) => !constraint.deleted)
      .map((constraint) => createMathOptLinearConstraint(this, constraint));
  }

  getNumLinearConstraints(): number {
    return this.linearConstraints().length;
  }

  getNextLinearConstraintId(): number {
    return this.nextLinearConstraintId;
  }

  ensureNextLinearConstraintIdAtLeast(id: number): void {
    this.nextLinearConstraintId = Math.max(this.nextLinearConstraintId, toIndex(id, 'MathOpt next linear constraint ID'));
  }

  hasLinearConstraint(id: number): boolean {
    return !!this.getLinearConstraint(id);
  }

  getLinearConstraint(id: number): MathOptLinearConstraint | undefined {
    const constraint = this.constraints.get(id);
    if (constraint && !constraint.deleted) return createMathOptLinearConstraint(this, constraint);
    return undefined;
  }

  maximize(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setObjectiveData(undefined, objectiveData(true, terms, offset));
  }

  minimize(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setObjectiveData(undefined, objectiveData(false, terms, offset));
  }

  maximizeLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setLinearObjective(terms, true, offset);
  }

  minimizeLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setLinearObjective(terms, false, offset);
  }

  setObjective(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], isMaximize: boolean, offset = 0): void {
    this.setObjectiveData(undefined, objectiveData(isMaximize, terms, offset));
  }

  setLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], isMaximize: boolean, offset = 0): void {
    this.setObjectiveData(undefined, linearObjectiveData(isMaximize, terms, offset));
  }

  columnNonzeros(variable: MathOptVariable): MathOptLinearConstraint[] {
    this.assertOwnsVariable(variable);
    variable.assertLive();
    return [...this.constraints.values()]
      .filter((constraint) => !constraint.deleted && constraint.terms.some((term) => term.variable.id === variable.id && term.coefficient !== 0))
      .map((constraint) => createMathOptLinearConstraint(this, constraint));
  }

  rowNonzeros(constraint: MathOptLinearConstraint): MathOptVariable[] {
    this.assertOwnsConstraint(constraint);
    constraint.assertLive();
    return constraint.terms().map((term) => term.variable);
  }

  linearConstraintMatrixEntries(): MathOptLinearConstraintMatrixEntry[] {
    return [...this.constraints.values()]
      .filter((constraint) => !constraint.deleted)
      .flatMap((constraint) => {
        const linearConstraint = createMathOptLinearConstraint(this, constraint);
        return constraint.terms
          .filter((term) => term.coefficient !== 0)
          .map((term) => ({
            linearConstraint,
            variable: term.variable,
            coefficient: term.coefficient,
          }));
      });
  }

  private validateObjectiveData(value: MathOptObjectiveData): void {
    for (const term of value.linearTerms) this.assertOwnsVariable(term.variable);
    for (const term of value.quadraticTerms) {
      this.assertOwnsVariable(term.firstVariable);
      this.assertOwnsVariable(term.secondVariable);
    }
  }

  private snapshot(): MathOptModelSnapshot {
    return {
      variables: [...this.variableData.values()].map((variable) => ({ ...variable })),
      linearConstraints: [...this.constraints.values()].map((constraint) => ({
        id: constraint.id,
        lowerBound: constraint.lowerBound,
        upperBound: constraint.upperBound,
        terms: constraint.terms.map((term) => ({
          variableId: term.variable.id,
          coefficient: term.coefficient,
        })),
        name: constraint.name,
        deleted: constraint.deleted,
      })),
      quadraticConstraints: [...this.quadraticConstraintData.values()].map(data => ({
        id: data.id, lowerBound: data.lowerBound, upperBound: data.upperBound,
        name: data.name, deleted: data.deleted,
        linearTerms: data.linearTerms.map(term => ({ variableId: term.variable.id, coefficient: term.coefficient })),
        quadraticTerms: data.quadraticTerms.map(term => ({
          firstVariableId: Math.min(term.firstVariable.id, term.secondVariable.id),
          secondVariableId: Math.max(term.firstVariable.id, term.secondVariable.id), coefficient: term.coefficient,
        })),
      })),
      indicatorConstraints: [...this.indicatorConstraintData.values()].map((constraint) => ({
        id: constraint.id,
        indicatorId: constraint.indicator?.id,
        activateOnZero: constraint.activateOnZero,
        lowerBound: constraint.lowerBound,
        upperBound: constraint.upperBound,
        terms: constraint.terms.map((term) => ({
          variableId: term.variable.id,
          coefficient: term.coefficient,
        })),
        name: constraint.name,
        deleted: constraint.deleted,
      })),
      objective: objectiveSnapshot(this.objectiveDataValue, this.primaryObjectiveNameValue, this.primaryObjectivePriority),
      auxiliaryObjectives: [...this.auxiliaryObjectiveData.values()].map(data =>
        ({ id: data.id, deleted: data.deleted, ...objectiveSnapshot(data.objective, data.name, data.priority) })),
    };
  }

  assertOwnsVariable(variable: MathOptVariable): void {
    const record = variableRecords.get(variable);
    if (!record || variable.model !== this || this.variableData.get(variable.id) !== record) {
      throw new Error('Variable belongs to a different MathOpt model or is not registered.');
    }
    variable.assertLive();
  }

  assertOwnsConstraint(constraint: MathOptLinearConstraint): void {
    const record = linearConstraintRecords.get(constraint);
    if (!record || constraint.model !== this || this.constraints.get(constraint.id) !== record) {
      throw new Error('Linear constraint belongs to a different MathOpt model or is not registered.');
    }
    constraint.assertLive();
  }

  async exportMps(options: MathOptMpsExportOptions = {}): Promise<string> {
    const { removeNames, ...execution } = options;
    return modelProtoToMps(this.encodeModelProto({ removeNames }), execution);
  }

  static async fromMps(mps: string, options: MathOptConversionOptions = {}): Promise<MathOptModel> {
    return MathOptModel.fromModelProto(await mpsToModelProto(mps, options), options);
  }

  encodeModelProto(options: { removeNames?: boolean } = {}): Uint8Array {
    return encodeModelSnapshot(this.name, this.snapshot(), options);
  }

}

let createUpdateTracker: (exportUpdate: MathOptUpdateTracker['exportUpdate'], advanceCheckpoint: () => void) => MathOptUpdateTracker;

export class MathOptUpdateTracker {
  private constructor(
    readonly exportUpdate: (options?: { removeNames?: boolean }) => Uint8Array | null,
    readonly advanceCheckpoint: () => void,
  ) {}

  static { createUpdateTracker = (exportUpdate, advanceCheckpoint) => new MathOptUpdateTracker(exportUpdate, advanceCheckpoint); }
}

const variableRecords = new WeakMap<MathOptVariable, VariableData>();
const linearConstraintRecords = new WeakMap<MathOptLinearConstraint, LinearConstraintData>();
const quadraticConstraintRecords = new WeakMap<MathOptQuadraticConstraint, QuadraticConstraintData>();
const indicatorConstraintRecords = new WeakMap<MathOptIndicatorConstraint, IndicatorConstraintData>();

let createMathOptVariable: (model: MathOptModel, data: VariableData) => MathOptVariable;

export class MathOptVariable {
  private constructor(readonly model: MathOptModel, private readonly data: VariableData) { variableRecords.set(this, data); }
  static { createMathOptVariable = (model, data) => new MathOptVariable(model, data); }

  get id(): number {
    return this.data.id;
  }

  get name(): string {
    this.assertLive();
    return this.data.name;
  }

  get lowerBound(): number {
    this.assertLive();
    return this.data.lowerBound;
  }

  set lowerBound(value: number) {
    this.assertLive();
    this.data.lowerBound = value;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  set upperBound(value: number) {
    this.assertLive();
    this.data.upperBound = value;
  }

  get integer(): boolean {
    this.assertLive();
    return this.data.integer;
  }

  set integer(value: boolean) {
    this.assertLive();
    this.data.integer = value;
  }

  equals(other: MathOptVariable): boolean {
    return this.model === other.model && this.id === other.id;
  }

  toString(): string {
    this.assertLive();
    return this.name || `variable_${this.id}`;
  }

  assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Variable ${this.id} has been deleted.`);
    }
  }
}

let createMathOptLinearConstraint: (model: MathOptModel, data: LinearConstraintData) => MathOptLinearConstraint;

export class MathOptLinearConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: LinearConstraintData) { linearConstraintRecords.set(this, data); }
  static { createMathOptLinearConstraint = (model, data) => new MathOptLinearConstraint(model, data); }

  get id(): number {
    return this.data.id;
  }

  get name(): string {
    this.assertLive();
    return this.data.name;
  }

  get lowerBound(): number {
    this.assertLive();
    return this.data.lowerBound;
  }

  set lowerBound(value: number) {
    this.assertLive();
    this.data.lowerBound = value;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  set upperBound(value: number) {
    this.assertLive();
    this.data.upperBound = value;
  }

  setCoefficient(variable: MathOptVariable, coefficient: number): void {
    this.assertLive();
    this.model.assertOwnsVariable(variable);
    const existingIndex = this.data.terms.findIndex((term) => term.variable.id === variable.id);
    if (coefficient === 0) {
      if (existingIndex >= 0) this.data.terms.splice(existingIndex, 1);
      return;
    }
    const term = { variable, coefficient };
    if (existingIndex >= 0) {
      this.data.terms[existingIndex] = term;
    } else {
      this.data.terms.push(term);
    }
  }

  getCoefficient(variable: MathOptVariable): number {
    this.assertLive();
    this.model.assertOwnsVariable(variable);
    return this.data.terms.find((term) => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  terms(): MathOptLinearTerm[] {
    this.assertLive();
    return this.data.terms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  asBoundedLinearExpression(): MathOptBoundedExpression<MathOptLinearExpression> {
    this.assertLive();
    return new MathOptBoundedExpression(
      this.lowerBound,
      new MathOptLinearExpression(this.terms()),
      this.upperBound,
    );
  }

  equals(other: MathOptLinearConstraint): boolean {
    return this.model === other.model && this.id === other.id;
  }

  toString(): string {
    this.assertLive();
    return this.name || `linear_constraint_${this.id}`;
  }

  assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Linear constraint ${this.id} has been deleted.`);
    }
  }
}

let createMathOptQuadraticConstraint: (model: MathOptModel, data: QuadraticConstraintData) => MathOptQuadraticConstraint;

export class MathOptQuadraticConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: QuadraticConstraintData) { quadraticConstraintRecords.set(this, data); }
  static { createMathOptQuadraticConstraint = (model, data) => new MathOptQuadraticConstraint(model, data); }
  get id(): number { return this.data.id; }
  get name(): string { this.assertLive(); return this.data.name; }
  get lowerBound(): number { this.assertLive(); return this.data.lowerBound; }
  get upperBound(): number { this.assertLive(); return this.data.upperBound; }
  linearTerms(): MathOptLinearTerm[] { this.assertLive(); return this.data.linearTerms.map(term => ({ ...term })); }
  quadraticTerms(): MathOptQuadraticTerm[] { this.assertLive(); return this.data.quadraticTerms.map(term => ({ ...term })); }
  getLinearCoefficient(variable: MathOptVariable): number {
    this.assertLive(); this.model.assertOwnsVariable(variable);
    return this.data.linearTerms.find(term => term.variable.id === variable.id)?.coefficient ?? 0;
  }
  getQuadraticCoefficient(first: MathOptVariable, second: MathOptVariable): number {
    this.assertLive(); this.model.assertOwnsVariable(first); this.model.assertOwnsVariable(second);
    return this.data.quadraticTerms.find(term =>
      (term.firstVariable.id === first.id && term.secondVariable.id === second.id)
      || (term.firstVariable.id === second.id && term.secondVariable.id === first.id))?.coefficient ?? 0;
  }
  assertLive(): void {
    if (this.data.deleted) throw new Error(`Quadratic constraint ${this.id} has been deleted.`);
  }
  equals(other: unknown): boolean {
    return other instanceof MathOptQuadraticConstraint && other.model === this.model && other.id === this.id;
  }
}

let createMathOptIndicatorConstraint: (model: MathOptModel, data: IndicatorConstraintData) => MathOptIndicatorConstraint;

export class MathOptIndicatorConstraint {
  private constructor(readonly model: MathOptModel, private readonly data: IndicatorConstraintData) { indicatorConstraintRecords.set(this, data); }
  static { createMathOptIndicatorConstraint = (model, data) => new MathOptIndicatorConstraint(model, data); }

  get id(): number {
    return this.data.id;
  }

  get name(): string {
    this.assertLive();
    return this.data.name;
  }

  get indicator(): MathOptVariable | undefined {
    this.assertLive();
    return this.data.indicator;
  }

  get activateOnZero(): boolean {
    this.assertLive();
    return this.data.activateOnZero;
  }

  get lowerBound(): number {
    this.assertLive();
    return this.data.lowerBound;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  terms(): MathOptLinearTerm[] {
    this.assertLive();
    return this.data.terms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  getCoefficient(variable: MathOptVariable): number {
    this.assertLive();
    this.model.assertOwnsVariable(variable);
    return this.data.terms.find(term => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  getImpliedConstraint(): MathOptBoundedExpression<MathOptLinearExpression> {
    this.assertLive();
    return boundedExpression(this.lowerBound, new MathOptLinearExpression(this.terms()), this.upperBound);
  }

  equals(other: unknown): boolean {
    return other instanceof MathOptIndicatorConstraint && other.model === this.model && other.id === this.id;
  }

  assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Indicator constraint ${this.id} has been deleted.`);
    }
  }
}

const objectiveIds = new WeakMap<MathOptObjective, number | undefined>();
let createMathOptObjective: (model: MathOptModel) => MathOptObjective;
let createMathOptAuxiliaryObjective: (model: MathOptModel, id: number) => MathOptAuxiliaryObjective;

export class MathOptObjective {
  protected constructor(readonly model: MathOptModel, private readonly auxiliaryId?: number) {
    objectiveIds.set(this, auxiliaryId);
  }
  static { createMathOptObjective = model => new MathOptObjective(model); }

  private get data(): MathOptObjectiveData { return objectiveStorage(this.model).getData(this.auxiliaryId); }
  private set data(value: MathOptObjectiveData) { objectiveStorage(this.model).setData(this.auxiliaryId, value); }

  assertLive(): void {
    if (!objectiveIds.has(this)) throw new Error('Objective is not registered.');
    objectiveStorage(this.model).getData(this.auxiliaryId);
  }

  get priority(): bigint { return objectiveStorage(this.model).priority(this.auxiliaryId); }
  set priority(value: IntValue) { objectiveStorage(this.model).setPriority(this.auxiliaryId, value); }

  get isMaximize(): boolean {
    return this.data.maximize;
  }

  set isMaximize(value: boolean) {
    this.data.maximize = value;
  }

  get offset(): number {
    return this.data.offset;
  }

  set offset(value: number) {
    this.data.offset = value;
  }

  get name(): string {
    return objectiveStorage(this.model).name(this.auxiliaryId);
  }

  clear(): void {
    this.data = { maximize: this.isMaximize, linearTerms: [], quadraticTerms: [], offset: 0 };
  }

  setLinearCoefficient(variable: MathOptVariable, coefficient: number): void {
    this.model.assertOwnsVariable(variable);
    const terms = this.data.linearTerms;
    const index = terms.findIndex(term => term.variable.id === variable.id);
    if (coefficient === 0) {
      if (index >= 0) terms.splice(index, 1);
    } else if (index >= 0) terms[index] = { variable, coefficient };
    else terms.push({ variable, coefficient });
  }

  getLinearCoefficient(variable: MathOptVariable): number {
    this.model.assertOwnsVariable(variable);
    return this.data.linearTerms.find((term) => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  linearTerms(): MathOptLinearTerm[] {
    return this.data.linearTerms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  setQuadraticCoefficient(firstVariable: MathOptVariable, secondVariable: MathOptVariable, coefficient: number): void {
    this.model.assertOwnsVariable(firstVariable);
    this.model.assertOwnsVariable(secondVariable);
    const terms = this.data.quadraticTerms;
    if (this.auxiliaryId !== undefined && coefficient !== 0) throw new Error('Quadratic auxiliary objectives are not supported.');
    const key = new MathOptQuadraticTermKey(firstVariable, secondVariable);
    const index = terms.findIndex(term =>
      Math.min(term.firstVariable.id, term.secondVariable.id) === key.firstVariable.id &&
      Math.max(term.firstVariable.id, term.secondVariable.id) === key.secondVariable.id);
    if (coefficient === 0) {
      if (index >= 0) terms.splice(index, 1);
    } else {
      const term = { firstVariable: key.firstVariable, secondVariable: key.secondVariable, coefficient };
      if (index >= 0) terms[index] = term;
      else terms.push(term);
    }
  }

  getQuadraticCoefficient(firstVariable: MathOptVariable, secondVariable: MathOptVariable): number {
    this.model.assertOwnsVariable(firstVariable);
    this.model.assertOwnsVariable(secondVariable);
    const key = new MathOptQuadraticTermKey(firstVariable, secondVariable);
    return this.data.quadraticTerms.find(term =>
      Math.min(term.firstVariable.id, term.secondVariable.id) === key.firstVariable.id &&
      Math.max(term.firstVariable.id, term.secondVariable.id) === key.secondVariable.id)?.coefficient ?? 0;
  }

  quadraticTerms(): MathOptQuadraticTerm[] {
    return this.data.quadraticTerms.filter(term => term.coefficient !== 0).map(term => ({ ...term }));
  }

  asLinearExpression(): MathOptLinearExpression {
    if (!this.isLinear()) throw new TypeError('Cannot get a quadratic objective as a linear expression.');
    return new MathOptLinearExpression(this.linearTerms(), this.offset);
  }

  asQuadraticExpression(): MathOptQuadraticExpression {
    return new MathOptQuadraticExpression(this.linearTerms(), this.quadraticTerms(), this.offset);
  }

  isLinear(): boolean { return this.quadraticTerms().length === 0; }

  setToLinearExpression(expr: MathOptLinearExpressionInput): void {
    this.data = linearObjectiveData(this.isMaximize, expr, 0);
  }

  setToExpression(expr: MathOptQuadraticExpressionInput): void {
    this.data = objectiveData(this.isMaximize, expr, 0);
  }

  add(expr: MathOptQuadraticExpressionInput): void {
    this.setToExpression(this.asQuadraticExpression().add(expr));
  }

  addLinear(expr: MathOptLinearExpressionInput): void {
    this.add(asFlatLinearExpression(expr));
  }

  equals(other: unknown): boolean {
    return other instanceof MathOptObjective && this.model === other.model && this.auxiliaryId === other.auxiliaryId;
  }
}

export class MathOptAuxiliaryObjective extends MathOptObjective {
  private constructor(model: MathOptModel, readonly id: number) { super(model, id); }
  static { createMathOptAuxiliaryObjective = (model, id) => new MathOptAuxiliaryObjective(model, id); }

  override setQuadraticCoefficient(_first: MathOptVariable, _second: MathOptVariable, _coefficient: number): never {
    throw new Error('Quadratic auxiliary objectives are not supported.');
  }
}

function findVariableKey(map: ReadonlyMap<MathOptVariable, number>, variable: MathOptVariable): MathOptVariable | undefined {
  for (const key of map.keys()) {
    if (key.equals(variable)) return key;
  }
  return undefined;
}

function formatBound(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return 'inf';
  if (value === Number.NEGATIVE_INFINITY) return '-inf';
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function formatExpressionNumber(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function formatSignedTerm(coefficient: number, body: string): string {
  const sign = coefficient < 0 ? '-' : '+';
  return ` ${sign} ${formatExpressionNumber(Math.abs(coefficient))} * ${body}`;
}

function compareVariables(lhs: MathOptVariable, rhs: MathOptVariable): number {
  return lhs.toString().localeCompare(rhs.toString()) || lhs.id - rhs.id;
}

function formatExpression(
  offset: number,
  linearTerms: MathOptLinearTerm[],
  quadraticTerms: MathOptQuadraticTerm[],
): string {
  let result = formatExpressionNumber(offset);
  for (const term of [...linearTerms].filter((term) => term.coefficient !== 0).sort((lhs, rhs) => compareVariables(lhs.variable, rhs.variable))) {
    result += formatSignedTerm(term.coefficient, term.variable.toString());
  }
  for (const term of [...quadraticTerms]
    .filter((term) => term.coefficient !== 0)
    .sort((lhs, rhs) => compareVariables(lhs.firstVariable, rhs.firstVariable) || compareVariables(lhs.secondVariable, rhs.secondVariable))) {
    result += formatSignedTerm(term.coefficient, `${term.firstVariable.toString()} * ${term.secondVariable.toString()}`);
  }
  return result;
}

function linearTermEntries(expression: MathOptLinearExpression): MathOptLinearTerm[] {
  return linearTermEntriesFromMap(expression.terms);
}

function linearTermEntriesFromMap(map: ReadonlyMap<MathOptVariable, number>): MathOptLinearTerm[] {
  return [...map.entries()].map(([variable, coefficient]) => ({ variable, coefficient }));
}

function readonlyMap<TKey, TValue>(map: Map<TKey, TValue>): ReadonlyMap<TKey, TValue> {
  const view: ReadonlyMap<TKey, TValue> = Object.freeze({
    get size() { return map.size; },
    get: (key: TKey) => map.get(key), has: (key: TKey) => map.has(key),
    entries: () => map.entries(), keys: () => map.keys(), values: () => map.values(),
    [Symbol.iterator]: () => map[Symbol.iterator](),
    forEach: (callback: (value: TValue, key: TKey, map: ReadonlyMap<TKey, TValue>) => void, thisArg?: unknown) =>
      map.forEach((value, key) => callback.call(thisArg, value, key, view)),
  });
  return view;
}

function quadraticTermEntries(expression: MathOptQuadraticExpression): MathOptQuadraticTerm[] {
  return [...expression.quadraticTerms.entries()].map(([key, coefficient]) => ({
    firstVariable: key.firstVariable,
    secondVariable: key.secondVariable,
    coefficient,
  }));
}

function isLinearTerm(input: unknown): input is MathOptLinearTerm {
  return typeof input === 'object'
    && input !== null
    && 'variable' in input
    && 'coefficient' in input;
}

function isQuadraticTerm(input: unknown): input is MathOptQuadraticTerm {
  return typeof input === 'object'
    && input !== null
    && 'firstVariable' in input
    && 'secondVariable' in input
    && 'coefficient' in input;
}

export function linearTerm(variable: MathOptVariable, coefficient = 1): MathOptLinearTerm {
  return { variable, coefficient };
}

export function quadraticTerm(
  firstVariable: MathOptVariable,
  secondVariable: MathOptVariable,
  coefficient = 1,
): MathOptQuadraticTerm {
  return { firstVariable, secondVariable, coefficient };
}

export function linearExpression(
  terms: Iterable<MathOptLinearTerm> = [],
  offset = 0,
): MathOptLinearExpression {
  return new MathOptLinearExpression(terms, offset);
}

export function quadraticExpression(
  linearTerms: Iterable<MathOptLinearTerm> = [],
  quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
  offset = 0,
): MathOptQuadraticExpression {
  return new MathOptQuadraticExpression(linearTerms, quadraticTerms, offset);
}

export function asFlatLinearExpression(input: MathOptLinearExpressionInput): MathOptLinearExpression {
  if (typeof input === 'number') return new MathOptLinearExpression([], input);
  if (input instanceof MathOptLinearExpression) return input;
  if (input instanceof MathOptVariable) return new MathOptLinearExpression([{ variable: input, coefficient: 1 }]);
  if (isLinearTerm(input)) return new MathOptLinearExpression([input]);
  throw new TypeError('Unsupported MathOpt linear expression input.');
}

export function asFlatQuadraticExpression(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
  if (input instanceof MathOptQuadraticExpression) return input;
  if (isQuadraticTerm(input)) return new MathOptQuadraticExpression([], [input]);
  const linear = asFlatLinearExpression(input);
  return new MathOptQuadraticExpression(linearTermEntries(linear), [], linear.offset);
}

export function fastSum(inputs: Iterable<MathOptQuadraticExpressionInput>): MathOptLinearExpression | MathOptQuadraticExpression {
  const linearTerms: MathOptLinearTerm[] = [];
  const quadraticTerms: MathOptQuadraticTerm[] = [];
  let offset = 0;
  let hasQuadratic = false;
  for (const input of inputs) {
    hasQuadratic ||= input instanceof MathOptQuadraticExpression || isQuadraticTerm(input);
    const expression = asFlatQuadraticExpression(input);
    for (const [variable, coefficient] of expression.linearTerms) linearTerms.push({ variable, coefficient });
    for (const [key, coefficient] of expression.quadraticTerms) quadraticTerms.push({
      firstVariable: key.firstVariable, secondVariable: key.secondVariable, coefficient,
    });
    offset += expression.offset;
  }
  return hasQuadratic ? new MathOptQuadraticExpression(linearTerms, quadraticTerms, offset)
    : new MathOptLinearExpression(linearTerms, offset);
}

export function multiplyLinearExpressions(
  lhs: MathOptLinearExpressionInput,
  rhs: MathOptLinearExpressionInput,
): MathOptQuadraticExpression {
  const lhsFlat = asFlatLinearExpression(lhs);
  const rhsFlat = asFlatLinearExpression(rhs);
  const linearTerms: MathOptLinearTerm[] = [];
  const quadraticTerms: MathOptQuadraticTerm[] = [];

  for (const term of linearTermEntries(lhsFlat)) {
    if (rhsFlat.offset !== 0) {
      linearTerms.push({
        variable: term.variable,
        coefficient: term.coefficient * rhsFlat.offset,
      });
    }
    for (const rhsTerm of linearTermEntries(rhsFlat)) {
      quadraticTerms.push({
        firstVariable: term.variable,
        secondVariable: rhsTerm.variable,
        coefficient: term.coefficient * rhsTerm.coefficient,
      });
    }
  }
  if (lhsFlat.offset !== 0) {
    for (const term of linearTermEntries(rhsFlat)) {
      linearTerms.push({
        variable: term.variable,
        coefficient: lhsFlat.offset * term.coefficient,
      });
    }
  }

  return new MathOptQuadraticExpression(linearTerms, quadraticTerms, lhsFlat.offset * rhsFlat.offset);
}

export function evaluateExpression(
  expression: MathOptQuadraticExpressionInput,
  variableValues: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>,
): number {
  const values = (variable: MathOptVariable) => {
    if (typeof (variableValues as ReadonlyMap<unknown, number>).get === 'function') {
      const typedValues = variableValues as ReadonlyMap<MathOptVariable, number>;
      const directValue = typedValues.get(variable);
      if (directValue !== undefined) return directValue;
      const matchingVariable = findVariableKey(typedValues, variable);
      return (matchingVariable ? typedValues.get(matchingVariable) : undefined) ?? 0;
    }
    const record = variableValues as Record<number | string, number>;
    return record[variable.id] ?? record[variable.name] ?? 0;
  };
  const flat = asFlatQuadraticExpression(expression);
  let result = flat.offset;
  for (const [variable, coefficient] of flat.linearTerms) {
    result += coefficient * values(variable);
  }
  for (const [key, coefficient] of flat.quadraticTerms) {
    result += coefficient * values(key.firstVariable) * values(key.secondVariable);
  }
  return result;
}

export function boundedExpression<TExpression>(
  lowerBound: number,
  expression: TExpression,
  upperBound: number,
): MathOptBoundedExpression<TExpression> {
  return new MathOptBoundedExpression(lowerBound, expression, upperBound);
}

export function lowerBoundedExpression<TExpression>(
  lowerBound: number,
  expression: TExpression,
): MathOptLowerBoundedExpression<TExpression> {
  return new MathOptLowerBoundedExpression(lowerBound, expression);
}

export function upperBoundedExpression<TExpression>(
  expression: TExpression,
  upperBound: number,
): MathOptUpperBoundedExpression<TExpression> {
  return new MathOptUpperBoundedExpression(expression, upperBound);
}

export function eq(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
  if (!isQuadraticExpressionInput(lhs) || !isQuadraticExpressionInput(rhs)) {
    throw new TypeError(`unsupported operand type(s) for ==: '${mathOptOperandType(lhs)}' and '${mathOptOperandType(rhs)}'`);
  }
  if (typeof lhs === 'number' && typeof rhs !== 'number') {
    return boundedExpression(
      lhs,
      isQuadraticOnlyInput(rhs) ? asFlatQuadraticExpression(rhs) : asFlatLinearExpression(rhs as MathOptLinearExpressionInput),
      lhs,
    );
  }
  if (typeof rhs === 'number') {
    return boundedExpression(
      rhs,
      isQuadraticOnlyInput(lhs) ? asFlatQuadraticExpression(lhs) : asFlatLinearExpression(lhs as MathOptLinearExpressionInput),
      rhs,
    );
  }
  const expression = isQuadraticOnlyInput(lhs) || isQuadraticOnlyInput(rhs)
    ? (
      isQuadraticOnlyInput(lhs)
        ? asFlatQuadraticExpression(lhs).subtract(rhs)
        : asFlatQuadraticExpression(rhs).subtract(lhs)
    )
    : asFlatLinearExpression(lhs as MathOptLinearExpressionInput).subtract(rhs as MathOptLinearExpressionInput);
  return boundedExpression(0, expression, 0);
}

function isLinearExpressionInput(input: unknown): input is MathOptLinearExpressionInput {
  return typeof input === 'number'
    || input instanceof MathOptVariable
    || input instanceof MathOptLinearExpression
    || isLinearTerm(input);
}

function isQuadraticExpressionInput(input: unknown): input is MathOptQuadraticExpressionInput {
  return isLinearExpressionInput(input)
    || input instanceof MathOptQuadraticExpression
    || isQuadraticTerm(input);
}

function isQuadraticOnlyInput(...inputs: MathOptQuadraticExpressionInput[]): boolean {
  return inputs.some((input) => input instanceof MathOptQuadraticExpression || isQuadraticTerm(input));
}

function mathOptOperandType(input: unknown): string {
  if (input instanceof MathOptVariable) return 'Variable';
  if (input instanceof MathOptLinearExpression) return 'LinearExpression';
  if (input instanceof MathOptQuadraticExpression) return 'QuadraticExpression';
  if (input instanceof MathOptBoundedExpression) return 'BoundedExpression';
  if (input instanceof MathOptLowerBoundedExpression) return 'LowerBoundedExpression';
  if (input instanceof MathOptUpperBoundedExpression) return 'UpperBoundedExpression';
  if (isLinearTerm(input)) return 'LinearTerm';
  if (isQuadraticTerm(input)) return 'QuadraticTerm';
  if (typeof input === 'string') return 'str';
  return typeof input;
}

export function le(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): MathOptUpperBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
  | MathOptLowerBoundedExpression<MathOptQuadraticExpression>
  | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
  if (lhs instanceof MathOptBoundedExpression || rhs instanceof MathOptBoundedExpression) {
    throw new TypeError('Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.');
  }
  if (!isQuadraticExpressionInput(lhs) || !isQuadraticExpressionInput(rhs)) {
    throw new TypeError(`unsupported operand type(s) for <=: '${mathOptOperandType(lhs)}' and '${mathOptOperandType(rhs)}'`);
  }
  if (typeof lhs === 'number' && typeof rhs !== 'number') {
    return lowerBoundedExpression(
      lhs,
      isQuadraticOnlyInput(rhs) ? asFlatQuadraticExpression(rhs) : asFlatLinearExpression(rhs as MathOptLinearExpressionInput),
    );
  }
  if (typeof rhs === 'number') {
    return upperBoundedExpression(
      isQuadraticOnlyInput(lhs) ? asFlatQuadraticExpression(lhs) : asFlatLinearExpression(lhs as MathOptLinearExpressionInput),
      rhs,
    );
  }
  if (isQuadraticOnlyInput(lhs) && !isQuadraticOnlyInput(rhs)) {
    return boundedExpression(Number.NEGATIVE_INFINITY, asFlatQuadraticExpression(lhs).subtract(rhs), 0);
  }
  if (!isQuadraticOnlyInput(lhs) && isQuadraticOnlyInput(rhs)) {
    return boundedExpression(0, asFlatQuadraticExpression(rhs).subtract(lhs), Number.POSITIVE_INFINITY);
  }
  return boundedExpression(
    Number.NEGATIVE_INFINITY,
    isQuadraticOnlyInput(lhs, rhs)
      ? asFlatQuadraticExpression(lhs).subtract(rhs)
      : asFlatLinearExpression(lhs as MathOptLinearExpressionInput).subtract(rhs as MathOptLinearExpressionInput),
    0,
  );
}

export function ge(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): MathOptLowerBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
  | MathOptUpperBoundedExpression<MathOptQuadraticExpression>
  | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
  if (lhs instanceof MathOptBoundedExpression || rhs instanceof MathOptBoundedExpression) {
    throw new TypeError('Chained bounded expressions are ambiguous; use (a <= b) <= c with explicit completion helpers.');
  }
  if (!isQuadraticExpressionInput(lhs) || !isQuadraticExpressionInput(rhs)) {
    throw new TypeError(`unsupported operand type(s) for >=: '${mathOptOperandType(lhs)}' and '${mathOptOperandType(rhs)}'`);
  }
  if (typeof lhs === 'number' && typeof rhs !== 'number') {
    return upperBoundedExpression(
      isQuadraticOnlyInput(rhs) ? asFlatQuadraticExpression(rhs) : asFlatLinearExpression(rhs as MathOptLinearExpressionInput),
      lhs,
    );
  }
  if (typeof rhs === 'number') {
    return lowerBoundedExpression(
      rhs,
      isQuadraticOnlyInput(lhs) ? asFlatQuadraticExpression(lhs) : asFlatLinearExpression(lhs as MathOptLinearExpressionInput),
    );
  }
  if (isQuadraticOnlyInput(lhs) && !isQuadraticOnlyInput(rhs)) {
    return boundedExpression(0, asFlatQuadraticExpression(lhs).subtract(rhs), Number.POSITIVE_INFINITY);
  }
  if (!isQuadraticOnlyInput(lhs) && isQuadraticOnlyInput(rhs)) {
    return boundedExpression(Number.NEGATIVE_INFINITY, asFlatQuadraticExpression(rhs).subtract(lhs), 0);
  }
  return boundedExpression(
    0,
    isQuadraticOnlyInput(lhs, rhs)
      ? asFlatQuadraticExpression(lhs).subtract(rhs)
      : asFlatLinearExpression(lhs as MathOptLinearExpressionInput).subtract(rhs as MathOptLinearExpressionInput),
    Number.POSITIVE_INFINITY,
  );
}

export function completeUpperBound<TExpression>(
  lowerBounded: MathOptLowerBoundedExpression<TExpression>,
  upperBound: number,
): MathOptBoundedExpression<TExpression> {
  if (!(lowerBounded instanceof MathOptLowerBoundedExpression)) {
    throw new TypeError(`unsupported operand type(s) for <=: '${mathOptOperandType(lowerBounded)}' and 'float'`);
  }
  return lowerBounded.toBoundedExpression(upperBound);
}

export function completeLowerBound<TExpression>(
  lowerBound: number,
  upperBounded: MathOptUpperBoundedExpression<TExpression>,
): MathOptBoundedExpression<TExpression> {
  if (!(upperBounded instanceof MathOptUpperBoundedExpression)) {
    throw new TypeError(`unsupported operand type(s) for >=: '${mathOptOperandType(upperBounded)}' and 'float'`);
  }
  return upperBounded.toBoundedExpression(lowerBound);
}

export type MathOptIncrementalSolverOptions = Omit<
  MathOptSolveOptions,
  'solverType'
>;

export type MathOptIncrementalSolveOptions = Omit<
  MathOptSolveOptions,
  'solverType' | 'executor' | 'removeNames'
>;

class MathOptRuntimeLostError extends Error {
  constructor() {
    super('MathOpt IncrementalSolver runtime was replaced; close it and create a new solver.');
    this.name = 'MathOptRuntimeLostError';
  }
}

abstract class MathOptIncrementalSession<TOptions extends MathOptIncrementalSolveOptions> {
  private readonly initPromise: Promise<number>;
  private handle: number | null = null;
  private runtime: object | undefined;
  private state: 'open' | 'failed' | 'closing' | 'closed' = 'open';
  private activeOperation: Promise<unknown> | null = null;
  private closePromise: Promise<void> | null = null;
  private callbackDepth = 0;
  private readonly executor: MathOptExecutor;
  readonly options: TOptions;

  constructor(request: () => Uint8Array, readonly solverType: MathOptSolverType | keyof typeof MathOptSolverType,
      options: TOptions & { executor?: ExecutorSelection }) {
    const { executor, ...solveOptions } = options;
    this.executor = createMathOptExecutor(executor);
    this.options = solveOptions as TOptions;
    this.initPromise = this.create(request);
    // Retain eager creation failures for solve/update, without an unhandled rejection.
    void this.initPromise.catch(() => {});
  }

  private async create(requestFactory: () => Uint8Array): Promise<number> {
    const request = requestFactory();
    let handle = 0;
    await executeMathOptRequest(this.executor, { type: 'incrementalCreate', request }, this.withLifecycleEvent(this.options), responseBytes => {
      const response = readMessage(responseBytes);
      const statusBytes = response.messages.get(3)?.[0];
      if (statusBytes) throw new Error(messageString(readMessage(statusBytes), 2) ?? 'MathOpt incremental solver creation failed.');
      const handleText = messageString(response, 2);
      handle = handleText === undefined ? 0 : toIndex(BigInt(handleText), 'MathOpt incremental solver handle');
      if (handle <= 0) throw new Error('MathOpt incremental solver creation returned no solver handle.');
      this.handle = handle;
    }, runtime => { this.runtime = runtime; });
    return handle;
  }

  protected run<T>(action: (handle: number) => Promise<T>): Promise<T> {
    if (this.state === 'failed') return Promise.reject(new Error('MathOpt IncrementalSolver is unusable after a failed operation; close it and create a new solver.'));
    if (this.state !== 'open') return Promise.reject(new Error('MathOpt IncrementalSolver is closed or closing.'));
    if (this.activeOperation) return Promise.reject(new Error('MathOpt IncrementalSolver already has a solve or update in progress.'));
    let operation!: Promise<T>;
    operation = (async () => {
      let handle: number;
      try { handle = await this.initPromise; } catch (error) { this.fail(); throw error; }
      return action(handle);
    })().finally(() => { if (this.activeOperation === operation) this.activeOperation = null; });
    this.activeOperation = operation;
    return operation;
  }

  protected fail(): void { if (this.state === 'open') this.state = 'failed'; }

  protected async nativeSolve<T>(handle: number, request: Uint8Array, options: MathOptSolveOptions,
      decode: (bytes: Uint8Array) => T, modelUpdate?: Uint8Array): Promise<T> {
    // A cancellation before dispatch cannot change native session state.
    if (options.signal?.aborted) throw createAbortError(options.signal);
    const callbackRegistration = solveCallbackRegistration(options);
    const interrupterState = solveInterrupterState(options);
    let result!: T;
    let committed = false;
    try {
      await executeMathOptRequest(this.executor, {
        type: 'incrementalSolve', handle: BigInt(handle), request, modelUpdate,
        useInterrupter: interrupterState.useInterrupter, interruptAtStart: interrupterState.interrupted,
        callbackRegistration, streamMessages: Boolean(options.messageCallback || options.onEvent),
      }, this.withLifecycleEvent(options), bytes => { result = decode(bytes); committed = true; }, runtime => this.assertRuntime(runtime));
    } catch (error) { if (!committed) this.fail(); throw error; }
    return result;
  }

  protected async nativeUpdate(handle: number, modelUpdate: Uint8Array, options: MathOptProtoUpdateOptions): Promise<boolean> {
    if (options.signal?.aborted) throw createAbortError(options.signal);
    let updated = false, committed = false;
    try {
      await executeSolverJob(this.executor, { type: 'incrementalUpdate', handle: BigInt(handle), modelUpdate }, {
        signal: options.signal, onEvent: this.withLifecycleEvent(options).onEvent,
        onDispatch: runtime => this.assertRuntime(runtime),
        onSuccess: result => {
          if (!('updated' in result)) throw new Error('MathOpt executor returned the wrong update response.');
          updated = result.updated;
          if (!updated) this.fail();
          committed = true;
        },
      });
    } catch (error) { if (!committed) this.fail(); throw error; }
    return updated;
  }

  close(): Promise<void> {
    if (this.callbackDepth > 0) return Promise.reject(new Error('MathOpt IncrementalSolver cannot be closed while one of its callbacks is running.'));
    if (this.state === 'closed') return Promise.resolve();
    if (this.closePromise) return this.closePromise;
    this.state = 'closing';
    let attempt!: Promise<void>;
    attempt = this.closeOnce().then(() => {
      this.handle = null; this.runtime = undefined; this.state = 'closed';
    }).finally(() => { if (this.closePromise === attempt) this.closePromise = null; });
    this.closePromise = attempt;
    return attempt;
  }

  private async closeOnce(): Promise<void> {
    await this.initPromise.catch(() => undefined);
    await this.activeOperation?.catch(() => undefined);
    if (this.handle === null) return;
    try {
      await executeMathOptRequest(this.executor, { type: 'incrementalDelete', handle: BigInt(this.handle) },
        { threads: this.options.threads }, undefined, runtime => this.assertRuntime(runtime));
    } catch (error) {
      // Never use a stale handle against its replacement runtime.
      if (!(error instanceof MathOptRuntimeLostError)) throw error;
    }
  }

  private assertRuntime(runtime: object): void { if (runtime !== this.runtime) throw new MathOptRuntimeLostError(); }

  private withLifecycleEvent<T extends MathOptSolveOptions>(options: T): T {
    if (!options.onEvent && !options.callback && !options.messageCallback) return options;
    const { onEvent, callback, messageCallback } = options;
    return { ...options,
      callback: callback ? data => {
        this.callbackDepth++;
        try { return callback(data); } finally { this.callbackDepth--; }
      } : undefined,
      messageCallback: messageCallback ? messages => {
        this.callbackDepth++;
        try { return messageCallback(messages); } finally { this.callbackDepth--; }
      } : undefined,
      onEvent: onEvent ? async event => {
        this.callbackDepth++;
        try { await onEvent(event); } finally { this.callbackDepth--; }
      } : undefined,
    };
  }
}

export class MathOptIncrementalSolver extends MathOptIncrementalSession<MathOptIncrementalSolveOptions> {
  private checkpoint: MathOptModelSnapshot;
  private readonly removeNames: boolean;

  constructor(readonly model: MathOptModel, solverType: MathOptSolverType | keyof typeof MathOptSolverType = MathOptSolverType.GLOP,
      options: MathOptIncrementalSolverOptions = {}) {
    const checkpoint = snapshotModel(model);
    super(() => encodeSolveRequest(model, { ...options, solverType },
      encodeModelSnapshot(model.name, checkpoint, options)), solverType, options);
    this.checkpoint = checkpoint;
    this.removeNames = options.removeNames ?? false;
  }

  async solve(options: MathOptIncrementalSolveOptions = {}): Promise<MathOptSolveResult> {
    if ('removeNames' in options) throw new TypeError('MathOpt IncrementalSolver removeNames is fixed at construction.');
    const merged = { ...this.options, ...options, solverType: this.solverType, removeNames: this.removeNames };
    const submitted = snapshotModel(this.model);
    const request = encodeSolveRequest(this.model, merged, encodeModelSnapshot(this.model.name, submitted, merged));
    const names = captureResultIds(this.model);
    return this.run(handle => {
      const update = encodeModelUpdate(this.checkpoint, submitted, { removeNames: this.removeNames });
      return this.nativeSolve(handle, request, merged, bytes => {
        const result = decodeSolveResponse(bytes, this.model, names);
        this.checkpoint = submitted;
        return result;
      }, update ?? undefined);
    });
  }

}

export type MathOptProtoIncrementalSolverOptions = Omit<MathOptProtoSolveOptions, 'solverType'>;
export type MathOptProtoIncrementalSolveOptions = Omit<MathOptProtoSolveOptions, 'solverType' | 'executor'>;
export type MathOptProtoUpdateOptions = Pick<MathOptSolveOptions, 'signal' | 'onEvent'>;

export class MathOptProtoIncrementalSolver extends MathOptIncrementalSession<MathOptProtoIncrementalSolveOptions> {
  constructor(model: Uint8Array | MathOptModelProto, solverType: MathOptSolverType | keyof typeof MathOptSolverType = MathOptSolverType.GLOP,
      options: MathOptProtoIncrementalSolverOptions = {}) {
    assertRawMathOptOptions(options);
    super(() => encodeSolveRequest(encodeMathOptModelProto(model), { ...options, solverType }), solverType, options);
  }

  async solve(options: MathOptProtoIncrementalSolveOptions = {}): Promise<MathOptProtoSolveResult> {
    const merged = { ...this.options, ...options, solverType: this.solverType };
    assertRawMathOptOptions(merged);
    const request = encodeSolveRequest(new Uint8Array(), merged);
    return this.run(handle => this.nativeSolve(handle, request, merged, decodeProtoSolveResponse));
  }

  async update(modelUpdate: Uint8Array | MathOptModelUpdateProto, options: MathOptProtoUpdateOptions = {}): Promise<boolean> {
    const bytes = encodeMathOptModelUpdateProto(modelUpdate);
    const merged = { signal: this.options.signal, onEvent: this.options.onEvent, ...options };
    return this.run(handle => this.nativeUpdate(handle, bytes, merged));
  }
}

export class MathOpt {
  static readonly SolverType = MathOptSolverType;
  static readonly LPAlgorithm = MathOptLPAlgorithm;
  static readonly Emphasis = MathOptEmphasis;
  static readonly GScipEmphasis = GScipEmphasis;
  static readonly GScipMetaParamValue = GScipMetaParamValue;
  static readonly GScipParameters = GScipParameters;
  static readonly GlopParameters = GlopParameters;
  static readonly PdlpParameters = PdlpParameters;
  static readonly PdlpOptimalityNorm = PdlpOptimalityNorm;
  static readonly PdlpSchedulerType = PdlpSchedulerType;
  static readonly PdlpRestartStrategy = PdlpRestartStrategy;
  static readonly PdlpLinesearchRule = PdlpLinesearchRule;
  static readonly GlpkParameters = GlpkParameters;
  static readonly SolveInterrupter = MathOptSolveInterrupter;
  static readonly ModelSolveParameters = MathOptModelSolveParameters;
  static readonly ObjectiveParameters = MathOptObjectiveParameters;
  static readonly SparseVectorFilter = MathOptSparseVectorFilter;
  static readonly SolutionHint = MathOptSolutionHint;
  static readonly IncrementalSolver = MathOptIncrementalSolver;
  static readonly ProtoIncrementalSolver = MathOptProtoIncrementalSolver;
  static readonly LinearExpression = MathOptLinearExpression;
  static readonly QuadraticExpression = MathOptQuadraticExpression;
  static readonly QuadraticTermKey = MathOptQuadraticTermKey;
  static readonly BoundedExpression = MathOptBoundedExpression;
  static readonly LowerBoundedExpression = MathOptLowerBoundedExpression;
  static readonly UpperBoundedExpression = MathOptUpperBoundedExpression;

  static Model(name = '', options: MathOptModelOptions = {}): MathOptModel {
    return new MathOptModel(name, options);
  }

  static async solve(model: MathOptModel, options: MathOptSolveOptions = {}): Promise<MathOptSolveResult> {
    options = { ...options };
    const requestBytes = MathOpt.encodeSolveRequest(model, options);
    const names = captureResultIds(model);
    const responseBytes = await executeMathOptSolve(requestBytes, options);
    const result = decodeSolveResponse(responseBytes, model, names);
    return result;
  }

  static async solveProto(model: Uint8Array | MathOptModelProto, options: MathOptProtoSolveOptions = {}): Promise<MathOptProtoSolveResult> {
    assertRawMathOptOptions(options);
    const requestBytes = encodeSolveRequest(encodeMathOptModelProto(model), options);
    return decodeProtoSolveResponse(await executeMathOptSolve(requestBytes, options));
  }

  // Parse native SolveResultProto bytes, as returned by a persisted/native solve.
  static async parseSolveResult(resultProto: Uint8Array, model: MathOptModel, options: MathOptResultParseOptions = {}): Promise<MathOptSolveResult> {
    const source = new Uint8Array(resultProto);
    const request = encodeSolveRequest(model, { modelParameters: options.modelParameters });
    const names = captureResultIds(model);
    const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'validateResult', request, result: source }, options);
    if ('validationError' in result) throw new Error(result.validationError);
    if (!('validatedResult' in result)) throw new Error('MathOpt executor returned the wrong result validation response.');
    return decodeSolveResponse(fieldMessage(1, result.validatedResult), model, names);
  }

  static async convertSolutionProto<K extends MathOptSolutionProtoKind>(kind: K,
    input: Uint8Array | MathOptSolutionProtoMap[K], model: MathOptModel | Uint8Array | MathOptModelProto,
    options: MathOptConversionOptions = {}): Promise<MathOptConvertedProto<MathOptSolutionProtoMap[K]>> {
    return convertMathOptResultProto(kind, input,
      model instanceof MathOptModel ? model.encodeModelProto() : encodeMathOptModelProto(model), options);
  }

  static async convertResultProto<K extends MathOptResultMetadataProtoKind>(kind: K,
    input: Uint8Array | MathOptResultMetadataProtoMap[K], options: MathOptConversionOptions = {}):
    Promise<MathOptConvertedProto<MathOptResultMetadataProtoMap[K]>> {
    return convertMathOptResultProto(kind, input, new Uint8Array(), options);
  }

  static encodeSolveRequest(model: MathOptModel, options: MathOptSolveOptions = {}): Uint8Array {
    return encodeSolveRequest(model, options);
  }

  static linearTerm(variable: MathOptVariable, coefficient = 1): MathOptLinearTerm {
    return linearTerm(variable, coefficient);
  }

  static quadraticTerm(firstVariable: MathOptVariable, secondVariable: MathOptVariable, coefficient = 1): MathOptQuadraticTerm {
    return quadraticTerm(firstVariable, secondVariable, coefficient);
  }

  static linearExpression(terms: Iterable<MathOptLinearTerm> = [], offset = 0): MathOptLinearExpression {
    return linearExpression(terms, offset);
  }

  static quadraticExpression(
    linearTerms: Iterable<MathOptLinearTerm> = [],
    quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
    offset = 0,
  ): MathOptQuadraticExpression {
    return quadraticExpression(linearTerms, quadraticTerms, offset);
  }

  static asFlatLinearExpression(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    return asFlatLinearExpression(input);
  }

  static asFlatQuadraticExpression(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
    return asFlatQuadraticExpression(input);
  }

  static fastSum(inputs: Iterable<MathOptQuadraticExpressionInput>): MathOptLinearExpression | MathOptQuadraticExpression {
    return fastSum(inputs);
  }

  static multiplyLinearExpressions(
    lhs: MathOptLinearExpressionInput,
    rhs: MathOptLinearExpressionInput,
  ): MathOptQuadraticExpression {
    return multiplyLinearExpressions(lhs, rhs);
  }

  static evaluateExpression(
    expression: MathOptQuadraticExpressionInput,
    variableValues: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>,
  ): number {
    return evaluateExpression(expression, variableValues);
  }

  static boundedExpression<TExpression>(
    lowerBound: number,
    expression: TExpression,
    upperBound: number,
  ): MathOptBoundedExpression<TExpression> {
    return boundedExpression(lowerBound, expression, upperBound);
  }

  static lowerBoundedExpression<TExpression>(
    lowerBound: number,
    expression: TExpression,
  ): MathOptLowerBoundedExpression<TExpression> {
    return lowerBoundedExpression(lowerBound, expression);
  }

  static upperBoundedExpression<TExpression>(
    expression: TExpression,
    upperBound: number,
  ): MathOptUpperBoundedExpression<TExpression> {
    return upperBoundedExpression(expression, upperBound);
  }

  static eq(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return eq(lhs, rhs);
  }

  static le(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptUpperBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
    | MathOptLowerBoundedExpression<MathOptQuadraticExpression>
    | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return le(lhs, rhs);
  }

  static ge(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptLowerBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
    | MathOptUpperBoundedExpression<MathOptQuadraticExpression>
    | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return ge(lhs, rhs);
  }

  static completeUpperBound<TExpression>(
    lowerBounded: MathOptLowerBoundedExpression<TExpression>,
    upperBound: number,
  ): MathOptBoundedExpression<TExpression> {
    return completeUpperBound(lowerBounded, upperBound);
  }

  static completeLowerBound<TExpression>(
    lowerBound: number,
    upperBounded: MathOptUpperBoundedExpression<TExpression>,
  ): MathOptBoundedExpression<TExpression> {
    return completeLowerBound(lowerBound, upperBounded);
  }
}

function mathOptRequestedThreads(request: Uint8Array): number {
  const solve = readMessage(request);
  const type = Number(solve.varints.get(1)?.[0] ?? BigInt(MathOptSolverType.GLOP));
  const parameters = readMessage(solve.messages.get(4)?.[0] ?? empty());
  const integer = (message: DecodedMessage, field: number): number | undefined => {
    const values = message.varints.get(field);
    const value = values?.[values.length - 1]; // Native protobuf parsing keeps the last scalar.
    return value === undefined ? undefined : Number(BigInt.asIntN(32, value));
  };
  const common = integer(parameters, 4) ?? 1;
  if (type === MathOptSolverType.CP_SAT) {
    const sat = readMessage(parameters.messages.get(15)?.[0] ?? empty());
    const modern = integer(sat, getSatParametersType().fields.numWorkers.id) ?? (integer(parameters, 4) === undefined ? 0 : common);
    if (modern !== 0) return modern;
    return integer(sat, getSatParametersType().fields.numSearchWorkers.id) || common;
  }
  if (type === MathOptSolverType.PDLP)
    return integer(readMessage(parameters.messages.get(16)?.[0] ?? empty()), 2) ?? common;
  if (type === MathOptSolverType.GLOP)
    return integer(readMessage(parameters.messages.get(14)?.[0] ?? empty()), 44) ?? common;
  if (type === MathOptSolverType.GSCIP) {
    const gscip = readMessage(parameters.messages.get(12)?.[0] ?? empty());
    for (const entry of [...(gscip.messages.get(6) ?? [])].reverse()) {
      const parameter = readMessage(entry);
      if (messageString(parameter, 1) === 'parallel/maxnthreads') return integer(parameter, 2) ?? 0;
    }
  }
  return common;
}

async function executeMathOptRequest(
  executor: MathOptExecutor,
  operation: MathOptOperation,
  options: Pick<MathOptSolveOptions, 'threads' | 'onEvent' | 'signal' | 'interrupter' | 'callback' | 'messageCallback'>,
  onSuccess?: (response: Uint8Array) => void | Promise<void>,
  onDispatch?: (runtime: object) => void,
): Promise<Uint8Array> {
  const resources: SolverResourceRequest = {
    threads: operation.type === 'solve' || operation.type === 'incrementalSolve'
      ? mathOptRequestedThreads(operation.request)
      : 1,
  };
  const response = await executeSolverJob(executor, operation, {
    showCloudNotice: !(executor instanceof SolverServerExecutor)
      && (operation.type === 'solve' || operation.type === 'incrementalSolve'),
    resources,
    onDispatch,
    onEvent: options.onEvent,
    onEventSync: event => {
      if (event.type !== 'log' || !options.messageCallback) return;
      const returned = options.messageCallback(event.messages) as unknown;
      if (returned && typeof (returned as { then?: unknown }).then === 'function') {
        void Promise.resolve(returned).catch(() => {});
        throw new TypeError('MathOpt message callbacks must return synchronously; use onEvent for asynchronous observers.');
      }
    },
    onCallback: options.callback ? callbackHandler(options.callback) : undefined,
    onSuccess: (response) => {
      if (!('response' in response)) throw new Error('MathOpt executor returned a conversion result for a solve operation.');
      return onSuccess?.(response.response);
    },
    signal: options.signal,
    interruptSignal: options.interrupter?.signal,
  });
  if (!('response' in response)) throw new Error('MathOpt executor returned the wrong solve response.');
  return response.response;
}


function assertRawMathOptOptions(options: MathOptProtoSolveOptions): void {
  if ((options as MathOptSolveOptions).removeNames) throw new TypeError('Raw MathOpt solving sends the supplied model unchanged; remove names from the input proto instead.');
}

async function executeMathOptSolve(request: Uint8Array, options: MathOptSolveOptions): Promise<Uint8Array> {
  const interrupterState = solveInterrupterState(options);
  return executeMathOptRequest(createMathOptExecutor(options.executor), {
    type: 'solve', request,
    useInterrupter: interrupterState.useInterrupter,
    interruptAtStart: interrupterState.interrupted,
    callbackRegistration: solveCallbackRegistration(options),
    streamMessages: Boolean(options.messageCallback || options.onEvent),
  }, options);
}

function encodeSolveRequest(
  model: MathOptModel | Uint8Array,
  options: MathOptSolveOptions,
  modelProto?: Uint8Array,
): Uint8Array {
  const solverType = typeof options.solverType === 'string'
    ? MathOptSolverType[options.solverType]
    : options.solverType ?? MathOptSolverType.GLOP;
  if (solverType === MathOptSolverType.GLPK && options.threads !== undefined && options.threads !== 1) {
    throw new Error('GLPK does not support multi-threaded MathOpt solves; use threads: 1 or omit threads.');
  }
  const parameters = encodeMathOptSolveParameters(options);
  const modelParameters = modelParametersBytes(options.modelParameters, model instanceof Uint8Array ? undefined : model);
  const removeNames = options.removeNames ?? false;
  return message([
    fieldVarint(1, solverType),
    fieldMessage(2, modelProto ?? (model instanceof Uint8Array ? model : model.encodeModelProto({ removeNames }))),
    fieldMessageIfPresent(4, parameters),
    fieldMessageIfPresent(5, modelParameters),
  ]);
}

function encodeMathOptSolveParameters(options: MathOptSolveOptions): Uint8Array | null {
  const enableOutput = options.enableOutput ?? (solveMessageCallback(options) ? true : undefined);
  const fields = [
    fieldDurationSeconds(1, options.timeLimitSeconds),
    optionalVarintField(2, options.iterationLimit),
    optionalBoolField(3, enableOutput),
    optionalInt32Field(4, options.threads),
    optionalInt32Field(5, options.randomSeed),
    enumField(6, options.lpAlgorithm, MathOptLPAlgorithm),
    enumField(7, options.presolve, MathOptEmphasis),
    enumField(8, options.cuts, MathOptEmphasis),
    enumField(9, options.heuristics, MathOptEmphasis),
    enumField(10, options.scaling, MathOptEmphasis),
    fieldMessageIfPresent(12, backendParametersBytes(options.gscip, GScipParameters)),
    fieldMessageIfPresent(14, backendParametersBytes(options.glop, GlopParameters)),
    fieldMessageIfPresent(15, encodeSatParameters(options.cpSat)),
    fieldMessageIfPresent(16, backendParametersBytes(options.pdlp, PdlpParameters)),
    optionalDoubleField(17, options.relativeGapTolerance),
    optionalDoubleField(18, options.absoluteGapTolerance),
    optionalDoubleField(20, options.cutoffLimit),
    optionalDoubleField(21, options.objectiveLimit),
    optionalDoubleField(22, options.bestBoundLimit),
    optionalInt32Field(23, options.solutionLimit),
    optionalVarintField(24, options.nodeLimit),
    optionalInt32Field(25, options.solutionPoolSize),
    fieldMessageIfPresent(26, backendParametersBytes(options.glpk, GlpkParameters)),
  ];
  const encoded = message(fields);
  return encoded.length > 0 ? encoded : null;
}

function objectivePriority(value: IntValue): bigint {
  const priority = toInt64(value, 'MathOpt objective priority');
  if (priority < 0n) throw new RangeError('MathOpt objective priority must be nonnegative.');
  return priority;
}

function objectiveSnapshot(data: MathOptObjectiveData, name: string, priority: bigint): MathOptObjectiveSnapshot {
  return { name, priority, maximize: data.maximize, offset: data.offset,
    linearTerms: data.linearTerms.map(term => ({ variableId: term.variable.id, coefficient: term.coefficient })),
    quadraticTerms: data.quadraticTerms.map(term => ({
      firstVariableId: Math.min(term.firstVariable.id, term.secondVariable.id),
      secondVariableId: Math.max(term.firstVariable.id, term.secondVariable.id), coefficient: term.coefficient,
    })) };
}

function encodeObjectiveSnapshot(data: MathOptObjectiveSnapshot, options: { removeNames?: boolean }): Uint8Array {
  return message([
    options.removeNames || !data.name ? empty() : fieldString(5, data.name),
    data.priority === 0n ? empty() : fieldVarint(6, data.priority),
    fieldBool(1, data.maximize), fieldDouble(2, data.offset),
    fieldMessage(3, encodeSparseDoubleVectorById(data.linearTerms)),
    fieldMessage(4, encodeSparseDoubleMatrix(data.quadraticTerms.map(term =>
      ({ rowId: term.firstVariableId, columnId: term.secondVariableId, coefficient: term.coefficient })))),
  ]);
}

function objectiveData(
  maximize: boolean,
  terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[],
  offset: number,
): MathOptObjectiveData {
  const expression = Array.isArray(terms)
    ? new MathOptLinearExpression(terms, offset)
    : asFlatQuadraticExpression(terms).add(offset);
  if (expression instanceof MathOptLinearExpression) {
    return {
      maximize,
      linearTerms: linearTermEntries(expression),
      quadraticTerms: [],
      offset: expression.offset,
    };
  }
  return {
    maximize,
    linearTerms: linearTermEntriesFromMap(expression.linearTerms),
    quadraticTerms: quadraticTermEntries(expression),
    offset: expression.offset,
  };
}

function linearObjectiveData(
  maximize: boolean,
  terms: MathOptLinearExpressionInput | MathOptLinearTerm[],
  offset: number,
): MathOptObjectiveData {
  const expression = Array.isArray(terms)
    ? new MathOptLinearExpression(terms, offset)
    : asFlatLinearExpression(terms).add(offset);
  return {
    maximize,
    linearTerms: linearTermEntries(expression),
    quadraticTerms: [],
    offset: expression.offset,
  };
}

function encodeSparseDoubleVector(terms: MathOptLinearTerm[]): Uint8Array {
  const sortedTerms = [...terms].sort((a, b) => a.variable.id - b.variable.id);
  return message([
    fieldPackedVarints(1, sortedTerms.map((term) => term.variable.id)),
    fieldPackedDoubles(2, sortedTerms.map((term) => term.coefficient)),
  ]);
}

function encodeLinearConstraintDoubleVector(terms: Array<{ linearConstraint: MathOptLinearConstraint; value: number }>): Uint8Array {
  const sortedTerms = [...terms].sort((a, b) => a.linearConstraint.id - b.linearConstraint.id);
  return message([
    fieldPackedVarints(1, sortedTerms.map((term) => term.linearConstraint.id)),
    fieldPackedDoubles(2, sortedTerms.map((term) => term.value)),
  ]);
}

function encodeVariableInt32Vector(terms: Array<{ variable: MathOptVariable; priority: number }>): Uint8Array {
  const sortedTerms = [...terms].sort((a, b) => a.variable.id - b.variable.id);
  return message([
    fieldPackedVarints(1, sortedTerms.map((term) => term.variable.id)),
    fieldPackedVarints(2, sortedTerms.map((term) => term.priority)),
  ]);
}

function encodeSparseDoubleMatrix(
  terms: Array<{ rowId: number; columnId: number; coefficient: number }>,
): Uint8Array {
  const sortedTerms = [...terms].sort((a, b) => a.rowId - b.rowId || a.columnId - b.columnId);
  return message([
    fieldPackedVarints(1, sortedTerms.map((term) => term.rowId)),
    fieldPackedVarints(2, sortedTerms.map((term) => term.columnId)),
    fieldPackedDoubles(3, sortedTerms.map((term) => term.coefficient)),
  ]);
}

function encodeModelUpdate(
  previous: MathOptModelSnapshot,
  current: MathOptModelSnapshot,
  options: { removeNames?: boolean } = {},
): Uint8Array | null {
  const previousVariables = new Map(previous.variables.map((variable) => [variable.id, variable]));
  const currentVariables = new Map(current.variables.map((variable) => [variable.id, variable]));
  const previousConstraints = new Map(previous.linearConstraints.map((constraint) => [constraint.id, constraint]));
  const currentConstraints = new Map(current.linearConstraints.map((constraint) => [constraint.id, constraint]));
  const previousIndicators = new Map(previous.indicatorConstraints.map((constraint) => [constraint.id, constraint]));
  const currentIndicators = new Map(current.indicatorConstraints.map((constraint) => [constraint.id, constraint]));

  const deletedVariableIds = previous.variables
    .filter((variable) => !variable.deleted && currentVariables.get(variable.id)?.deleted)
    .map((variable) => variable.id);
  const deletedLinearConstraintIds = previous.linearConstraints
    .filter((constraint) => !constraint.deleted && currentConstraints.get(constraint.id)?.deleted)
    .map((constraint) => constraint.id);
  const deletedIndicatorConstraintIds = previous.indicatorConstraints
    .filter((constraint) => !constraint.deleted && currentIndicators.get(constraint.id)?.deleted)
    .map((constraint) => constraint.id);

  const newVariables = current.variables.filter((variable) => {
    const previous = previousVariables.get(variable.id);
    return !variable.deleted && (!previous || previous.deleted);
  });
  const newLinearConstraints = current.linearConstraints.filter((constraint) => {
    const previous = previousConstraints.get(constraint.id);
    return !constraint.deleted && (!previous || previous.deleted);
  });
  const newIndicatorConstraints = current.indicatorConstraints.filter((constraint) => {
    const previous = previousIndicators.get(constraint.id);
    return !constraint.deleted && (!previous || previous.deleted);
  });

  const previousQuadratics = new Map(previous.quadraticConstraints.map(data => [data.id, data]));
  const currentQuadratics = new Map(current.quadraticConstraints.map(data => [data.id, data]));
  const deletedQuadratics = previous.quadraticConstraints
    .filter(data => !data.deleted && currentQuadratics.get(data.id)?.deleted).map(data => data.id).sort((a, b) => a - b);
  const quadraticUpdate = message([
    deletedQuadratics.length ? fieldPackedVarints(1, deletedQuadratics) : empty(),
    ...current.quadraticConstraints.filter(data => !data.deleted && !previousQuadratics.has(data.id))
      .map(data => fieldMessage(2, message([fieldVarint(1, data.id), fieldMessage(2, encodeQuadraticConstraintSnapshot(data, options))]))),
  ]);
  const variableLowerUpdates = changedValues(previous.variables, current.variables, (item) => item.lowerBound);
  const variableUpperUpdates = changedValues(previous.variables, current.variables, (item) => item.upperBound);
  const variableIntegerUpdates = changedValues(previous.variables, current.variables, (item) => item.integer);
  const linearLowerUpdates = changedValues(previous.linearConstraints, current.linearConstraints, (item) => item.lowerBound);
  const linearUpperUpdates = changedValues(previous.linearConstraints, current.linearConstraints, (item) => item.upperBound);
  const liveVariableIds = new Set(current.variables.filter(variable => !variable.deleted).map(variable => variable.id));
  const matrixUpdates = changedMatrixEntries(previous.linearConstraints, current.linearConstraints)
    .filter(entry => liveVariableIds.has(entry.columnId));
  // Native variable deletion already removes its coefficients. Updates must
  // not refer to IDs removed in the same ModelUpdateProto.
  const survivingObjective = (objective: MathOptObjectiveSnapshot): MathOptObjectiveSnapshot => ({ ...objective,
    linearTerms: objective.linearTerms.filter(term => liveVariableIds.has(term.variableId)),
    quadraticTerms: objective.quadraticTerms.filter(term =>
      liveVariableIds.has(term.firstVariableId) && liveVariableIds.has(term.secondVariableId)),
  });
  const objectiveUpdate = encodeObjectiveUpdate(survivingObjective(previous.objective), current.objective);
  const previousAuxiliary = new Map(previous.auxiliaryObjectives.map(data => [data.id, data]));
  const currentAuxiliary = new Map(current.auxiliaryObjectives.map(data => [data.id, data]));
  const deletedAuxiliaryIds = previous.auxiliaryObjectives.filter(data =>
    !data.deleted && currentAuxiliary.get(data.id)?.deleted).map(data => data.id).sort((a, b) => a - b);
  const auxiliaryUpdate = message([
    deletedAuxiliaryIds.length ? fieldPackedVarints(1, deletedAuxiliaryIds) : empty(),
    ...current.auxiliaryObjectives.filter(data => !data.deleted && !previousAuxiliary.has(data.id)).map(data =>
      fieldMessage(2, message([fieldVarint(1, data.id), fieldMessage(2, encodeObjectiveSnapshot(data, options))]))),
    ...current.auxiliaryObjectives.flatMap(data => {
      const previous = previousAuxiliary.get(data.id);
      if (data.deleted || !previous || previous.deleted) return [];
      const update = encodeObjectiveUpdate(survivingObjective(previous), data);
      return update ? [fieldMessage(3, message([fieldVarint(1, data.id), fieldMessage(2, update)]))] : [];
    }),
  ]);

  const indicatorUpdate = message([
    deletedIndicatorConstraintIds.length ? fieldPackedVarints(1, deletedIndicatorConstraintIds.sort((a, b) => a - b)) : empty(),
    ...newIndicatorConstraints.map((constraint) => fieldMessage(2, message([
      fieldVarint(1, constraint.id),
      fieldMessage(2, encodeIndicatorConstraintSnapshot(constraint, options)),
    ]))),
  ]);

  const encoded = message([
    deletedVariableIds.length ? fieldPackedVarints(1, deletedVariableIds.sort((a, b) => a - b)) : empty(),
    deletedLinearConstraintIds.length ? fieldPackedVarints(2, deletedLinearConstraintIds.sort((a, b) => a - b)) : empty(),
    fieldMessageIfPresent(3, message([
      vectorUpdate(1, variableLowerUpdates, fieldPackedDoubles),
      vectorUpdate(2, variableUpperUpdates, fieldPackedDoubles),
      vectorUpdate(3, variableIntegerUpdates, fieldPackedBools),
    ])),
    fieldMessageIfPresent(4, message([
      vectorUpdate(1, linearLowerUpdates, fieldPackedDoubles),
      vectorUpdate(2, linearUpperUpdates, fieldPackedDoubles),
    ])),
    fieldMessageIfPresent(5, encodeVariablesSnapshot(newVariables, options)),
    fieldMessageIfPresent(6, encodeLinearConstraintsSnapshot(newLinearConstraints, options)),
    fieldMessageIfPresent(7, objectiveUpdate),
    fieldMessageIfPresent(8, matrixUpdates.length ? encodeSparseDoubleMatrix(matrixUpdates) : null),
    fieldMessageIfPresent(9, quadraticUpdate.length ? quadraticUpdate : null),
    fieldMessageIfPresent(12, indicatorUpdate.length ? indicatorUpdate : null),
    fieldMessageIfPresent(13, auxiliaryUpdate.length ? auxiliaryUpdate : null),
  ]);
  return encoded.length > 0 ? encoded : null;
}

function encodeModelSnapshot(name: string, snapshot: MathOptModelSnapshot,
  options: { removeNames?: boolean } = {}): Uint8Array {
  const entries = snapshot.linearConstraints.filter(row => !row.deleted).flatMap(row =>
    row.terms.filter(term => term.coefficient !== 0).map(term => ({
      rowId: row.id, columnId: term.variableId, coefficient: term.coefficient,
    })));
  return message([
    options.removeNames ? empty() : fieldString(1, name),
    fieldMessage(2, encodeVariablesSnapshot(snapshot.variables, options) ?? empty()),
    fieldMessage(3, encodeObjectiveSnapshot(snapshot.objective, options)),
    fieldMessage(4, encodeLinearConstraintsSnapshot(snapshot.linearConstraints, options) ?? empty()),
    fieldMessage(5, encodeSparseDoubleMatrix(entries)),
    ...snapshot.indicatorConstraints.filter(data => !data.deleted).map(data =>
      fieldMessage(9, message([fieldVarint(1, data.id), fieldMessage(2, encodeIndicatorConstraintSnapshot(data, options))]))),
    ...snapshot.quadraticConstraints.filter(data => !data.deleted).map(data =>
      fieldMessage(6, message([fieldVarint(1, data.id), fieldMessage(2, encodeQuadraticConstraintSnapshot(data, options))]))),
    ...snapshot.auxiliaryObjectives.filter(data => !data.deleted).map(data =>
      fieldMessage(10, message([fieldVarint(1, data.id), fieldMessage(2, encodeObjectiveSnapshot(data, options))]))),
  ]);
}

function encodeVariablesSnapshot(
  variables: MathOptVariableSnapshot[],
  options: { removeNames?: boolean } = {},
): Uint8Array | null {
  const active = [...variables].filter((variable) => !variable.deleted).sort((a, b) => a.id - b.id);
  if (active.length === 0) return null;
  return message([
    fieldPackedVarints(1, active.map((variable) => variable.id)),
    fieldPackedDoubles(2, active.map((variable) => variable.lowerBound)),
    fieldPackedDoubles(3, active.map((variable) => variable.upperBound)),
    fieldPackedBools(4, active.map((variable) => variable.integer)),
    ...(options.removeNames ? [] : active.map((variable) => fieldString(5, variable.name))),
  ]);
}

function encodeLinearConstraintsSnapshot(
  constraints: MathOptLinearConstraintSnapshot[],
  options: { removeNames?: boolean } = {},
): Uint8Array | null {
  const active = [...constraints].filter((constraint) => !constraint.deleted).sort((a, b) => a.id - b.id);
  if (active.length === 0) return null;
  return message([
    fieldPackedVarints(1, active.map((constraint) => constraint.id)),
    fieldPackedDoubles(2, active.map((constraint) => constraint.lowerBound)),
    fieldPackedDoubles(3, active.map((constraint) => constraint.upperBound)),
    ...(options.removeNames ? [] : active.map((constraint) => fieldString(4, constraint.name))),
  ]);
}

function encodeQuadraticConstraintSnapshot(data: MathOptQuadraticConstraintSnapshot,
    options: { removeNames?: boolean } = {}): Uint8Array {
  return message([
    fieldMessage(1, encodeSparseDoubleVectorById(data.linearTerms)),
    fieldMessage(2, encodeSparseDoubleMatrix(data.quadraticTerms.map(term => ({
      rowId: term.firstVariableId, columnId: term.secondVariableId, coefficient: term.coefficient,
    })))),
    fieldDouble(3, data.lowerBound), fieldDouble(4, data.upperBound),
    options.removeNames ? empty() : fieldString(5, data.name),
  ]);
}

function encodeIndicatorConstraintSnapshot(
  constraint: MathOptIndicatorConstraintSnapshot,
  options: { removeNames?: boolean } = {},
): Uint8Array {
  return message([
    constraint.indicatorId === undefined ? empty() : fieldVarint(1, constraint.indicatorId),
    constraint.activateOnZero ? fieldBool(6, true) : empty(),
    fieldMessage(2, encodeSparseDoubleVectorById(constraint.terms)),
    fieldDouble(3, constraint.lowerBound),
    fieldDouble(4, constraint.upperBound),
    options.removeNames ? empty() : fieldString(5, constraint.name),
  ]);
}

function encodeSparseDoubleVectorById(terms: Array<{ variableId: number; coefficient: number }>): Uint8Array {
  // Zero values in updates remove existing coefficients and must be retained.
  const sortedTerms = [...terms].sort((a, b) => a.variableId - b.variableId);
  return message([
    fieldPackedVarints(1, sortedTerms.map((term) => term.variableId)),
    fieldPackedDoubles(2, sortedTerms.map((term) => term.coefficient)),
  ]);
}

function changedValues<T extends { id: number; deleted: boolean }, TValue extends number | boolean>(
  previous: T[],
  current: T[],
  value: (item: T) => TValue,
): Array<{ id: number; value: TValue }> {
  const currentById = new Map(current.map((item) => [item.id, item]));
  return previous.flatMap((oldItem) => {
    if (oldItem.deleted) return [];
    const newItem = currentById.get(oldItem.id);
    if (!newItem || newItem.deleted) return [];
    return Object.is(value(oldItem), value(newItem)) ? [] : [{ id: oldItem.id, value: value(newItem) }];
  });
}

function vectorUpdate<TValue extends number | boolean>(
  field: number,
  updates: Array<{ id: number; value: TValue }>,
  encodeValues: (field: number, values: any[]) => Uint8Array,
): Uint8Array {
  if (updates.length === 0) return empty();
  const sorted = [...updates].sort((a, b) => a.id - b.id);
  return fieldMessage(field, message([
    fieldPackedVarints(1, sorted.map((update) => update.id)),
    encodeValues(2, sorted.map((update) => update.value)),
  ]));
}

function changedMatrixEntries(
  previous: MathOptLinearConstraintSnapshot[],
  current: MathOptLinearConstraintSnapshot[],
): Array<{ rowId: number; columnId: number; coefficient: number }> {
  const previousById = new Map(previous.map((constraint) => [constraint.id, constraint]));
  const updates: Array<{ rowId: number; columnId: number; coefficient: number }> = [];
  for (const constraint of current) {
    if (constraint.deleted) continue;
    const previousConstraint = previousById.get(constraint.id);
    const previousTerms = termsByVariableId(previousConstraint && !previousConstraint.deleted ? previousConstraint.terms : []);
    const currentTerms = termsByVariableId(constraint.terms);
    const variableIds = new Set([...previousTerms.keys(), ...currentTerms.keys()]);
    for (const variableId of variableIds) {
      const oldCoefficient = previousTerms.get(variableId) ?? 0;
      const newCoefficient = currentTerms.get(variableId) ?? 0;
      if (!Object.is(oldCoefficient, newCoefficient)) {
        updates.push({ rowId: constraint.id, columnId: variableId, coefficient: newCoefficient });
      }
    }
  }
  return updates;
}

function termsByVariableId(terms: Array<{ variableId: number; coefficient: number }>): Map<number, number> {
  const result = new Map<number, number>();
  for (const term of terms) {
    result.set(term.variableId, (result.get(term.variableId) ?? 0) + term.coefficient);
  }
  return result;
}

function encodeObjectiveUpdate(previous: MathOptObjectiveSnapshot, current: MathOptObjectiveSnapshot): Uint8Array | null {
  const linearUpdates = changedTermMap(
    previous.linearTerms.map((term) => [term.variableId, term.coefficient] as const),
    current.linearTerms.map((term) => [term.variableId, term.coefficient] as const),
  );
  const quadraticUpdates = changedQuadraticTermMap(previous.quadraticTerms, current.quadraticTerms);
  const encoded = message([
    previous.maximize === current.maximize ? empty() : fieldBool(1, current.maximize),
    previous.priority === current.priority ? empty() : fieldVarint(5, current.priority),
    Object.is(previous.offset, current.offset) ? empty() : fieldDouble(2, current.offset),
    fieldMessageIfPresent(3, linearUpdates.length ? encodeSparseDoubleVectorById(
      linearUpdates.map((term) => ({ variableId: term.id, coefficient: term.coefficient })),
    ) : null),
    fieldMessageIfPresent(4, quadraticUpdates.length ? encodeSparseDoubleMatrix(
      quadraticUpdates.map((term) => ({ rowId: term.firstVariableId, columnId: term.secondVariableId, coefficient: term.coefficient })),
    ) : null),
  ]);
  return encoded.length > 0 ? encoded : null;
}

function changedTermMap(
  previousEntries: Array<readonly [number, number]>,
  currentEntries: Array<readonly [number, number]>,
): Array<{ id: number; coefficient: number }> {
  const previous = new Map(previousEntries);
  const current = new Map(currentEntries);
  const ids = new Set([...previous.keys(), ...current.keys()]);
  const updates: Array<{ id: number; coefficient: number }> = [];
  for (const id of ids) {
    const oldCoefficient = previous.get(id) ?? 0;
    const newCoefficient = current.get(id) ?? 0;
    if (!Object.is(oldCoefficient, newCoefficient)) updates.push({ id, coefficient: newCoefficient });
  }
  return updates;
}

function changedQuadraticTermMap(
  previousTerms: MathOptObjectiveSnapshot['quadraticTerms'],
  currentTerms: MathOptObjectiveSnapshot['quadraticTerms'],
): MathOptObjectiveSnapshot['quadraticTerms'] {
  const key = (term: { firstVariableId: number; secondVariableId: number }) => `${term.firstVariableId}:${term.secondVariableId}`;
  const previous = new Map(previousTerms.map((term) => [key(term), term]));
  const current = new Map(currentTerms.map((term) => [key(term), term]));
  const keys = new Set([...previous.keys(), ...current.keys()]);
  const updates: MathOptObjectiveSnapshot['quadraticTerms'] = [];
  for (const termKey of keys) {
    const oldTerm = previous.get(termKey);
    const newTerm = current.get(termKey);
    const coefficient = newTerm?.coefficient ?? 0;
    if (!Object.is(oldTerm?.coefficient ?? 0, coefficient)) {
      const [firstVariableId, secondVariableId] = termKey.split(':').map(Number);
      updates.push({ firstVariableId, secondVariableId, coefficient });
    }
  }
  return updates;
}

type MathOptResultIds = { variables: Set<number>; constraints: Set<number>; quadratic: Set<number>; auxiliary: Set<number> };

function captureResultIds(model: MathOptModel): MathOptResultIds {
  return {
    variables: new Set(model.variables().map(variable => variable.id)),
    constraints: new Set(model.linearConstraints().map(constraint => constraint.id)),
    quadratic: new Set(model.quadraticConstraints().map(constraint => constraint.id)),
    auxiliary: new Set(model.auxiliaryObjectives().map(objective => objective.id)),
  };
}

function assertResultId(ids: ReadonlySet<number>, id: number): void {
  if (!ids.has(id)) throw new RangeError(`MathOpt result contains unknown model ID ${id}.`);
}

function solveResponseParts(bytes: Uint8Array): { resultBytes: Uint8Array; messages: string[] } {
  const response = readMessage(bytes);
  const messages = (response.messages.get(2) ?? []).map(bytes => new TextDecoder().decode(bytes));
  const statusBytes = response.messages.get(3)?.[0];
  if (statusBytes) {
    const status = readMessage(statusBytes);
    const messageText = messageString(status, 2) ?? 'MathOpt solve failed.';
    throw new Error(messageText);
  }

  const resultBytes = response.messages.get(1)?.[0];
  if (!resultBytes) {
    throw new Error('MathOpt solve returned no result.');
  }
  return { resultBytes, messages };
}

function decodeProtoSolveResponse(bytes: Uint8Array): MathOptProtoSolveResult {
  const { resultBytes, messages } = solveResponseParts(bytes);
  return { bytes: new Uint8Array(resultBytes), response: decodeMathOptSolveResult(resultBytes), messages };
}

function enumLabel(value: number | string | undefined, names: Record<number, string>, prefix: string): string {
  return typeof value === 'string' ? value : names[value ?? 0] ?? `${prefix}_${value ?? 0}`;
}

function resultVector<T>(vector: { ids?: Array<number | bigint>; values?: T[] } | undefined,
    modelIds: ReadonlySet<number>): Record<number, T> {
  const ids = vector?.ids ?? [], values = vector?.values ?? [];
  if (ids.length !== values.length) throw new Error('MathOpt sparse vector has mismatched IDs and values.');
  return Object.fromEntries(ids.map((id, index) => {
    const key = toIndex(id, 'MathOpt result ID');
    assertResultId(modelIds, key);
    return [key, values[index]];
  }));
}

function decodeSolveResponse(bytes: Uint8Array, model: MathOptModel, names: MathOptResultIds = captureResultIds(model)): MathOptSolveResult {
  const { resultBytes: input, messages } = solveResponseParts(bytes);
  const resultBytes = new Uint8Array(input);
  const result = decodeMathOptSolveResult(resultBytes, false);
  const stats = result.solveStats, termination = result.termination;
  const problemStatus = termination?.problemStatus ?? stats?.problemStatus;
  const duration = stats?.solveTime;
  const solveTimeSeconds = duration ? Number(duration.seconds ?? 0) + (duration.nanos ?? 0) / 1e9 : null;
  const solutions = (result.solutions ?? []).map(solution => decodeSolution(solution, names));
  const firstPrimalSolution = solutions.find(solution => solution.primalSolution?.feasibilityStatus === 'SOLUTION_STATUS_FEASIBLE')?.primalSolution ?? null;
  const answerValuesById = { ...(firstPrimalSolution?.variableValuesById ?? {}) };
  const limit = enumLabel(termination?.limit, terminationLimitNames, 'LIMIT');
  return {
    terminationReason: enumLabel(termination?.reason, terminationReasonNames, 'TERMINATION_REASON'),
    terminationLimit: limit === 'LIMIT_UNSPECIFIED' ? null : limit,
    terminationDetail: termination?.detail ?? '', solveTimeSeconds,
    solveStats: { solveTimeSeconds, simplexIterations: BigInt(stats?.simplexIterations ?? 0),
      barrierIterations: BigInt(stats?.barrierIterations ?? 0), firstOrderIterations: BigInt(stats?.firstOrderIterations ?? 0), nodeCount: BigInt(stats?.nodeCount ?? 0) },
    gscipSpecificOutput: result.gscipOutput ?? null, osqpSpecificOutput: result.osqpOutput ?? null,
    pdlpSpecificOutput: result.pdlpOutput ?? null,
    primalBound: termination?.objectiveBounds?.primalBound ?? (termination?.objectiveBounds ? 0 : stats?.bestPrimalBound ?? null),
    dualBound: termination?.objectiveBounds?.dualBound ?? (termination?.objectiveBounds ? 0 : stats?.bestDualBound ?? null),
    primalStatus: problemStatus ? enumLabel(problemStatus.primalStatus, feasibilityStatusNames, 'FEASIBILITY_STATUS') : null,
    dualStatus: problemStatus ? enumLabel(problemStatus.dualStatus, feasibilityStatusNames, 'FEASIBILITY_STATUS') : null,
    primalOrDualInfeasible: problemStatus?.primalOrDualInfeasible ?? false,
    objectiveValue: firstPrimalSolution?.objectiveValue ?? null, hasSolution: firstPrimalSolution !== null,
    value(variable: MathOptVariable): number {
      if (!firstPrimalSolution) throw new Error('Solve result has no feasible solution.');
      if (variable.model !== model) throw new Error('Variable belongs to a different MathOpt model.');
      const value = answerValuesById[variable.id];
      if (value === undefined) throw new Error('Solve result has no value for this variable.');
      return value;
    },
    variableValuesById: firstPrimalSolution?.variableValuesById ?? {},
    solutions, primalRays: (result.primalRays ?? []).map(ray => decodePrimalRay(ray, names)),
    dualRays: (result.dualRays ?? []).map(ray => decodeDualRay(ray, names)), messages,
    rawResponse: new Uint8Array(bytes), toProtoBytes: () => new Uint8Array(resultBytes),
  };
}

function decodeSolution(solution: math_opt_SolutionProto, model: MathOptResultIds): MathOptSolutionResult {
  return { primalSolution: solution.primalSolution ? decodePrimalSolution(solution.primalSolution, model) : null,
    dualSolution: solution.dualSolution ? decodeDualSolution(solution.dualSolution, model) : null,
    basis: solution.basis ? decodeBasis(solution.basis, model) : null };
}
function decodePrimalSolution(primal: math_opt_PrimalSolutionProto, model: MathOptResultIds): MathOptPrimalSolutionResult {
  const values = resultVector(primal.variableValues, model.variables);
  const auxiliary = Object.entries(primal.auxiliaryObjectiveValues ?? {}).map(([id, value]) => {
    const key = toIndex(BigInt(id), 'MathOpt auxiliary objective ID');
    assertResultId(model.auxiliary, key);
    return [key, value];
  });
  return { objectiveValue: primal.objectiveValue ?? 0, variableValuesById: values,
    auxiliaryObjectiveValuesById: Object.fromEntries(auxiliary),
    feasibilityStatus: enumLabel(primal.feasibilityStatus, solutionStatusNames, 'SOLUTION_STATUS') };
}
function decodeDualSolution(dual: math_opt_DualSolutionProto, model: MathOptResultIds): MathOptDualSolutionResult {
  const values = resultVector(dual.dualValues, model.constraints);
  const reduced = resultVector(dual.reducedCosts, model.variables);
  const quadratic = resultVector(dual.quadraticDualValues, model.quadratic);
  return { objectiveValue: dual.objectiveValue ?? null, dualValuesById: values,
    quadraticDualValuesById: quadratic,
    reducedCostsById: reduced,
    feasibilityStatus: enumLabel(dual.feasibilityStatus, solutionStatusNames, 'SOLUTION_STATUS') };
}
function decodePrimalRay(ray: math_opt_PrimalRayProto, model: MathOptResultIds): MathOptPrimalRayResult {
  const values = resultVector(ray.variableValues, model.variables);
  return { variableValuesById: values };
}
function decodeDualRay(ray: math_opt_DualRayProto, model: MathOptResultIds): MathOptDualRayResult {
  const values = resultVector(ray.dualValues, model.constraints);
  const reduced = resultVector(ray.reducedCosts, model.variables);
  return { dualValuesById: values, reducedCostsById: reduced };
}
function decodeBasis(basis: math_opt_BasisProto, model: MathOptResultIds): MathOptBasisResult {
  const convert = (vector: math_opt_BasisProto['variableStatus']) => ({ ids: vector?.ids,
    values: vector?.values?.map(value => enumLabel(value, basisStatusNames, 'BASIS_STATUS')) });
  const variables = resultVector(convert(basis.variableStatus), model.variables);
  const constraints = resultVector(convert(basis.constraintStatus), model.constraints);
  return { variableStatusById: variables,
    constraintStatusById: constraints,
    basicDualFeasibility: enumLabel(basis.basicDualFeasibility, solutionStatusNames, 'SOLUTION_STATUS') };
}

type DecodedMessage = {
  varints: Map<number, bigint[]>;
  messages: Map<number, Uint8Array[]>;
};

function messageString(message: DecodedMessage, field: number): string | undefined {
  const values = message.messages.get(field);
  const payload = values?.[values.length - 1];
  return payload === undefined ? undefined : new TextDecoder().decode(payload);
}

function readMessage(bytes: Uint8Array): DecodedMessage {
  const decoded: DecodedMessage = {
    varints: new Map(),
    messages: new Map(),
  };
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    offset = key.offset;
    const field = toIndex(key.value >> 3n, 'protobuf field number', 536_870_911);
    const wire = toIndex(key.value & 7n, 'protobuf wire type', 7);
    if (wire === 0) {
      const value = readVarint(bytes, offset);
      offset = value.offset;
      pushMap(decoded.varints, field, value.value);
    } else if (wire === 1) {
      offset += 8;
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const end = offset + toIndex(length.value, 'protobuf field length', bytes.length - offset);
      const payload = bytes.subarray(offset, end);
      offset = end;
      pushMap(decoded.messages, field, payload);
    } else if (wire === 5) {
      offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wire}.`);
    }
    if (offset > bytes.length) throw new Error('Unexpected end of protobuf field.');
  }
  return decoded;
}

function pushMap<T>(map: Map<number, T[]>, key: number, value: T): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

function readVarint(bytes: Uint8Array, start: number): { value: bigint; offset: number } {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  throw new Error('Unexpected end of varint.');
}

function message(fields: WireValue[]): Uint8Array {
  return concat(fields.filter((field) => field.length > 0));
}

function empty(): Uint8Array {
  return new Uint8Array();
}

function fieldVarint(field: number, value: number | bigint): Uint8Array {
  return concat([writeVarint(BigInt(field << 3)), writeVarint(toInt64(value, `MathOpt field ${field}`))]);
}

function fieldBool(field: number, value: boolean): Uint8Array {
  return fieldVarint(field, value ? 1 : 0);
}

function fieldDouble(field: number, value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return concat([writeVarint(BigInt((field << 3) | 1)), bytes]);
}

function fieldString(field: number, value: string): Uint8Array {
  return fieldLengthDelimited(field, new TextEncoder().encode(value));
}

function fieldMessage(field: number, value: Uint8Array): Uint8Array {
  return fieldLengthDelimited(field, value);
}

function fieldMessageIfPresent(field: number, value: Uint8Array | null | undefined): Uint8Array {
  return value && value.length > 0 ? fieldMessage(field, value) : empty();
}

function optionalInt32Field(field: number, value: number | undefined): Uint8Array {
  if (value === undefined) return empty();
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new RangeError(`MathOpt field ${field} must fit int32.`);
  return fieldVarint(field, value);
}

function optionalVarintField(field: number, value: number | bigint | undefined): Uint8Array {
  return value === undefined ? empty() : fieldVarint(field, value);
}

function optionalBoolField(field: number, value: boolean | undefined): Uint8Array {
  return value === undefined ? empty() : fieldBool(field, value);
}

function optionalDoubleField(field: number, value: number | undefined): Uint8Array {
  return value === undefined ? empty() : fieldDouble(field, value);
}

function optionalStringField(field: number, value: string | undefined): Uint8Array {
  return value === undefined ? empty() : fieldString(field, value);
}

function fieldPackedVarints(field: number, values: Array<number | bigint>): Uint8Array {
  return fieldLengthDelimited(field, concat(values.map((value) => writeVarint(toInt64(value, `MathOpt field ${field}`)))));
}

function fieldPackedVarintsIfPresent(field: number, values: Array<number | bigint> | undefined): Uint8Array {
  return values === undefined ? empty() : fieldPackedVarints(field, values);
}

function fieldPackedBools(field: number, values: boolean[]): Uint8Array {
  return fieldPackedVarints(field, values.map((value) => value ? 1 : 0));
}

function fieldPackedDoubles(field: number, values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat64(index * 8, value, true));
  return fieldLengthDelimited(field, bytes);
}

function fieldLengthDelimited(field: number, payload: Uint8Array): Uint8Array {
  return concat([
    writeVarint(BigInt((field << 3) | 2)),
    writeVarint(BigInt(payload.length)),
    payload,
  ]);
}

function fieldDurationSeconds(field: number, seconds: number | undefined): Uint8Array {
  if (seconds === undefined) return empty();
  let wholeSeconds = Math.trunc(seconds);
  let nanos = Math.round((seconds - wholeSeconds) * 1_000_000_000);
  if (Math.abs(nanos) === 1_000_000_000) {
    wholeSeconds += Math.sign(nanos);
    nanos = 0;
  }
  return fieldMessage(field, message([
    fieldVarint(1, wholeSeconds),
    nanos === 0 ? empty() : fieldVarint(2, nanos),
  ]));
}

function enumField<T extends Record<string, string | number>>(
  field: number,
  value: number | keyof T | undefined,
  enumObject: T,
): Uint8Array {
  if (value === undefined) return empty();
  return optionalInt32Field(field, enumValue(value, enumObject));
}

function enumValue<T extends Record<string, string | number>>(
  value: number | keyof T,
  enumObject: T,
): number {
  if (typeof value === 'number') return value;
  const resolved = enumObject[value as string];
  if (typeof resolved !== 'number') {
    throw new Error(`Unknown enum value: ${String(value)}`);
  }
  return resolved;
}

function mapFields<T>(
  field: number,
  values: Record<string, T> | undefined,
  encodeValue: (field: number, value: T) => Uint8Array,
): Uint8Array[] {
  if (!values) return [];
  return Object.entries(values).map(([key, value]) => fieldMessage(field, message([
    fieldString(1, key),
    encodeValue(2, value),
  ])));
}

function modelParametersBytes(
  value: MathOptModelSolveParameters | MathOptModelSolveParametersOptions | Uint8Array | undefined,
  model?: MathOptModel,
): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof (value as { toProtoBytes?: unknown }).toProtoBytes === 'function') {
    return (value as MathOptModelSolveParameters).toProtoBytes(model);
  }
  return new MathOptModelSolveParameters(value as MathOptModelSolveParametersOptions).toProtoBytes(model);
}

function solveMessageCallback(options: MathOptSolveOptions): ((messages: string[]) => void) | undefined {
  return options.messageCallback;
}

function solveInterrupterState(options: MathOptSolveOptions): MathOptSolveInterrupterState {
  const interrupter = options.interrupter;
  if (!interrupter) {
    return { useInterrupter: Boolean(options.signal), interrupted: false };
  }
  const interrupted = typeof interrupter.isInterrupted === 'function'
    ? interrupter.isInterrupted()
    : interrupter.interrupted === true;
  if (interrupter.signal?.aborted) return { useInterrupter: true, interrupted: true };
  return { useInterrupter: true, interrupted };
}

function parameterElementId(element: unknown, model?: MathOptModel): number | bigint {
  if (typeof element === 'number' || typeof element === 'bigint') return element;
  if (element instanceof MathOptVariable) (model ?? element.model).assertOwnsVariable(element);
  else if (element instanceof MathOptLinearConstraint) (model ?? element.model).assertOwnsConstraint(element);
  else throw new TypeError('MathOpt parameter elements must be variable/constraint handles or numeric IDs.');
  return element.id;
}

function solutionHintBytes(value: MathOptSolutionHint | MathOptSolutionHintOptions | Uint8Array, model?: MathOptModel): Uint8Array {
  if (value instanceof Uint8Array) return value;
  return (value instanceof MathOptSolutionHint ? value : new MathOptSolutionHint(value)).toProtoBytes(model);
}

function modelFilterBytes<TElement>(value: MathOptSparseVectorFilterInput<TElement> | undefined, model?: MathOptModel): Uint8Array | null {
  if (value === undefined) return null;
  const options = value instanceof MathOptSparseVectorFilter ? value.options
    : Array.isArray(value) ? { elements: value } : value;
  return encodeSparseVectorFilter<unknown>(options, model);
}

function encodeSparseVectorFilter<TElement>(options: MathOptSparseVectorFilterOptions<TElement>, model?: MathOptModel): Uint8Array {
  if (options.ids !== undefined && options.elements !== undefined)
    throw new TypeError('Specify either sparse filter ids or elements, not both.');
  const ids = options.ids ?? options.elements?.map(element => parameterElementId(element, model));
  return message([
    optionalBoolField(1, options.skipZeroValues),
    optionalBoolField(2, options.filterByIds ?? (ids === undefined ? undefined : true)),
    ids?.length ? fieldPackedVarints(3, ids) : empty(),
  ]);
}

function backendParametersBytes<TOptions, TParameters extends { toProtoBytes(): Uint8Array }>(
  value: TParameters | TOptions | Uint8Array | undefined,
  ctor: new (options: TOptions) => TParameters,
): Uint8Array | null {
  if (value === undefined) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof (value as { toProtoBytes?: unknown }).toProtoBytes === 'function') {
    return (value as TParameters).toProtoBytes();
  }
  return new ctor(value as TOptions).toProtoBytes();
}


function encodeSatParameters(
  parameters: SatParameters | Uint8Array | undefined,
): Uint8Array | null {
  if (parameters === undefined) return null;
  if (parameters instanceof Uint8Array) return parameters;
  const type = getSatParametersType();
  const value = encodeProtobufBigInts(normalizeProtobufInput(parameters, type), type) as Record<string, unknown>;
  const error = type.verify(value);
  if (error) throw new TypeError(`SatParameters: ${error}`);
  return new Uint8Array(type.encode(type.create(value)).finish());
}

function writeVarint(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let current = BigInt.asUintN(64, value);
  do {
    let byte = Number(current & 0x7fn);
    current >>= 7n;
    if (current !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (current !== 0n);
  return new Uint8Array(bytes);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function solveCallbackRegistration(options: MathOptSolveOptions): Uint8Array | undefined {
  if (options.callback !== undefined && typeof options.callback !== 'function') throw new TypeError('MathOpt callback must be a function.');
  if ((options.callback !== undefined) !== (options.callbackRegistration !== undefined)) throw new TypeError('MathOpt callback and callbackRegistration must be supplied together.');
  return options.callbackRegistration === undefined ? undefined : encodeMathOptCallbackRegistration(options.callbackRegistration);
}
