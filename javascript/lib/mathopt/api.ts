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
import { executeSolverJob } from '../solver_job.js';
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
} from './protocol.js';
import * as protobufModule from 'protobufjs';
import { toIndex } from '../int64.js';

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

export type MathOptEvent = SolverJobEvent;

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
  lb?: number;
  ub?: number;
  expr?: MathOptLinearExpressionInput;
  lowerBound?: number;
  upperBound?: number;
  terms?: MathOptLinearTerm[];
  expression?: MathOptLinearExpressionInput;
  name?: string;
};

export type MathOptIndicatorConstraintOptions = {
  indicator?: MathOptVariable;
  activateOnZero?: boolean;
  impliedConstraint?: MathOptBoundedExpression<MathOptLinearExpression>
    | MathOptLowerBoundedExpression<MathOptLinearExpression>
    | MathOptUpperBoundedExpression<MathOptLinearExpression>;
  lowerBound?: number;
  lb?: number;
  upperBound?: number;
  ub?: number;
  expression?: MathOptLinearExpressionInput;
  expr?: MathOptLinearExpressionInput;
  terms?: MathOptLinearTerm[];
  name?: string;
};

export type MathOptVariableOptions = {
  lb?: number;
  ub?: number;
  isInteger?: boolean;
  lowerBound?: number;
  upperBound?: number;
  integer?: boolean;
  name?: string;
};

export type MathOptSolveOptions = {
  executor?: ExecutorSelection;
  solverType?: MathOptSolverType | keyof typeof MathOptSolverType;
  removeNames?: boolean;
  interrupter?: MathOptSolveInterrupter | MathOptSolveInterrupterLike;
  messageCallback?: (messages: string[]) => void;
  modelParameters?: Uint8Array | MathOptModelSolveParameters | MathOptModelSolveParametersOptions;
  timeLimitSeconds?: number;
  threads?: number;
  iterationLimit?: number;
  nodeLimit?: number;
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
  cpSat?: Omit<SatParameters, 'numWorkers' | 'numSearchWorkers'> | Uint8Array;
  pdlp?: PdlpParameters | PdlpParametersOptions | Uint8Array;
  glpk?: GlpkParameters | GlpkParametersOptions | Uint8Array;
  onEvent?: (event: MathOptEvent) => void | Promise<void>;
  signal?: AbortSignal;
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
  variableValues?: MathOptLinearTerm[];
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
};

export type MathOptSolveInterrupterLike = {
  readonly interrupted?: boolean;
  isInterrupted?(): boolean;
};

export type MathOptSolveResult = {
  terminationReason: string;
  terminationLimit: string | null;
  solveTimeSeconds: number | null;
  primalBound: number | null;
  dualBound: number | null;
  primalStatus: string | null;
  dualStatus: string | null;
  primalOrDualInfeasible: boolean;
  objectiveValue: number | null;
  variableValues: Record<string, number>;
  variableValuesById: Record<number, number>;
  solutions: MathOptSolutionResult[];
  primalRays: MathOptPrimalRayResult[];
  dualRays: MathOptDualRayResult[];
  messages: string[];
  rawResponse: Uint8Array;
};

export type MathOptPrimalSolutionResult = {
  objectiveValue: number | null;
  variableValues: Record<string, number>;
  variableValuesById: Record<number, number>;
  feasibilityStatus: string;
};

export type MathOptDualSolutionResult = {
  objectiveValue: number | null;
  dualValues: Record<string, number>;
  dualValuesById: Record<number, number>;
  reducedCosts: Record<string, number>;
  reducedCostsById: Record<number, number>;
  feasibilityStatus: string;
};

export type MathOptPrimalRayResult = {
  variableValues: Record<string, number>;
  variableValuesById: Record<number, number>;
};

export type MathOptDualRayResult = {
  dualValues: Record<string, number>;
  dualValuesById: Record<number, number>;
  reducedCosts: Record<string, number>;
  reducedCostsById: Record<number, number>;
};

export type MathOptBasisResult = {
  variableStatus: Record<string, string>;
  variableStatusById: Record<number, string>;
  constraintStatus: Record<string, string>;
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
  maximize: boolean;
  offset: number;
  linearTerms: Array<{ variableId: number; coefficient: number }>;
  quadraticTerms: Array<{ firstVariableId: number; secondVariableId: number; coefficient: number }>;
};

type MathOptModelSnapshot = {
  variables: MathOptVariableSnapshot[];
  linearConstraints: MathOptLinearConstraintSnapshot[];
  indicatorConstraints: MathOptIndicatorConstraintSnapshot[];
  objective: MathOptObjectiveSnapshot;
};

export class MathOptVarEqVar {
  readonly firstVariable: MathOptVariable;
  readonly secondVariable: MathOptVariable;

  constructor(firstVariable: MathOptVariable, secondVariable: MathOptVariable) {
    if (firstVariable.model !== secondVariable.model) {
      throw new Error('Variables belong to different MathOpt models.');
    }
    this.firstVariable = firstVariable;
    this.secondVariable = secondVariable;
  }

  assertNotBoolean(): never {
    throw new TypeError('Cannot convert MathOpt variable equality expression to boolean.');
  }
}

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
      ...mapFields(6, options.intParams, fieldVarint),
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
      optionalVarintField(17, options.numSolutions),
      optionalDoubleField(18, options.objectiveLimit),
    ]);
  }
}

export type GlopParametersOptions = {
  useScaling?: boolean;
  maxTimeInSeconds?: number;
  useDualSimplex?: boolean;
  usePreprocessing?: boolean;
};

export class GlopParameters {
  constructor(readonly options: GlopParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    const options = this.options;
    return message([
      optionalBoolField(16, options.useScaling),
      optionalDoubleField(26, options.maxTimeInSeconds),
      optionalBoolField(31, options.useDualSimplex),
      optionalBoolField(34, options.usePreprocessing),
    ]);
  }
}

export type PdlpParametersOptions = {
  terminationCriteria?: {
    optimalityNorm?: PdlpOptimalityNorm | keyof typeof PdlpOptimalityNorm;
    iterationLimit?: number;
    timeSecLimit?: number;
    kktMatrixPassLimit?: number;
    epsPrimalInfeasible?: number;
    epsDualInfeasible?: number;
    simpleOptimalityCriteria?: {
      epsOptimalAbsolute?: number;
      epsOptimalRelative?: number;
    };
  };
  numShards?: number;
  schedulerType?: PdlpSchedulerType | keyof typeof PdlpSchedulerType;
  recordIterationStats?: boolean;
  verbosityLevel?: number;
  logIntervalSeconds?: number;
  majorIterationFrequency?: number;
  terminationCheckFrequency?: number;
  restartStrategy?: PdlpRestartStrategy | keyof typeof PdlpRestartStrategy;
  primalWeightUpdateSmoothing?: number;
  initialPrimalWeight?: number;
  lInfRuizIterations?: number;
  l2NormRescaling?: boolean;
  sufficientReductionForRestart?: number;
  necessaryReductionForRestart?: number;
  linesearchRule?: PdlpLinesearchRule | keyof typeof PdlpLinesearchRule;
  initialStepSizeScaling?: number;
  randomProjectionSeeds?: number[];
  infiniteConstraintBoundThreshold?: number;
  useDiagonalQpTrustRegionSolver?: boolean;
  diagonalQpTrustRegionSolverTolerance?: number;
  useFeasibilityPolishing?: boolean;
  applyFeasibilityPolishingAfterLimitsReached?: boolean;
  applyFeasibilityPolishingIfSolverIsInterrupted?: boolean;
};

export class PdlpParameters {
  constructor(readonly options: PdlpParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    const options = this.options;
    if ('numThreads' in options) {
      throw new Error('MathOpt PDLP thread count belongs in the top-level threads option.');
    }
    return message([
      fieldMessageIfPresent(1, encodePdlpTerminationCriteria(options.terminationCriteria)),
      optionalBoolField(3, options.recordIterationStats),
      optionalVarintField(4, options.majorIterationFrequency),
      optionalVarintField(5, options.terminationCheckFrequency),
      enumField(6, options.restartStrategy, PdlpRestartStrategy),
      optionalDoubleField(7, options.primalWeightUpdateSmoothing),
      optionalDoubleField(8, options.initialPrimalWeight),
      optionalVarintField(9, options.lInfRuizIterations),
      optionalBoolField(10, options.l2NormRescaling),
      optionalDoubleField(11, options.sufficientReductionForRestart),
      enumField(12, options.linesearchRule, PdlpLinesearchRule),
      optionalDoubleField(17, options.necessaryReductionForRestart),
      optionalDoubleField(25, options.initialStepSizeScaling),
      optionalVarintField(26, options.verbosityLevel),
      optionalVarintField(27, options.numShards),
      fieldPackedVarintsIfPresent(28, options.randomProjectionSeeds),
      optionalDoubleField(22, options.infiniteConstraintBoundThreshold),
      optionalBoolField(23, options.useDiagonalQpTrustRegionSolver),
      optionalDoubleField(24, options.diagonalQpTrustRegionSolverTolerance),
      optionalDoubleField(31, options.logIntervalSeconds),
      enumField(32, options.schedulerType, PdlpSchedulerType),
      optionalBoolField(30, options.useFeasibilityPolishing),
      optionalBoolField(33, options.applyFeasibilityPolishingAfterLimitsReached),
      optionalBoolField(34, options.applyFeasibilityPolishingIfSolverIsInterrupted),
    ]);
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

  interrupt(): void {
    this.interruptedValue = true;
  }

  get interrupted(): boolean {
    return this.interruptedValue;
  }

  isInterrupted(): boolean {
    return this.interruptedValue;
  }

}

export class MathOptSparseVectorFilter<TElement = unknown> {
  constructor(readonly options: MathOptSparseVectorFilterOptions<TElement> = {}) {}

  toProtoBytes(): Uint8Array {
    return encodeSparseVectorFilter(this.options);
  }
}

export class MathOptSolutionHint {
  constructor(readonly options: MathOptSolutionHintOptions = {}) {}

  toProtoBytes(): Uint8Array {
    const { variableValues, dualValues } = this.options;
    return message([
      fieldMessageIfPresent(1, variableValues === undefined ? null : encodeSparseDoubleVector(variableValues)),
      fieldMessageIfPresent(2, dualValues === undefined
        ? null
        : encodeLinearConstraintDoubleVector(dualValues)),
    ]);
  }
}

export class MathOptModelSolveParameters {
  constructor(readonly options: MathOptModelSolveParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    const options = this.options;
    const lazyLinearConstraintIds = options.lazyLinearConstraints?.map((constraint) =>
      typeof constraint === 'object' ? constraint.id : constraint
    );
    return message([
      fieldMessageIfPresent(1, modelFilterBytes(options.variableValuesFilter)),
      fieldMessageIfPresent(2, modelFilterBytes(options.dualValuesFilter)),
      fieldMessageIfPresent(10, modelFilterBytes(options.quadraticDualValuesFilter)),
      fieldMessageIfPresent(3, modelFilterBytes(options.reducedCostsFilter)),
      fieldMessageIfPresent(4, options.initialBasis),
      ...(options.solutionHints ?? []).map((hint) => fieldMessage(5, solutionHintBytes(hint))),
      fieldMessageIfPresent(6, options.branchingPriorities === undefined
        ? null
        : encodeVariableInt32Vector(options.branchingPriorities)),
      fieldPackedVarintsIfPresent(9, lazyLinearConstraintIds),
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

  constructor(terms: Iterable<MathOptLinearTerm> | MathOptLinearExpressionInput = [], offset = 0) {
    if (typeof terms === 'number') {
      this.terms = readonlyMap(new Map());
      this.offset = terms;
      return;
    }
    if (terms instanceof MathOptLinearExpression || terms instanceof MathOptVariable || isLinearTerm(terms)) {
      const expression = asFlatLinearExpression(terms);
      this.terms = expression.terms;
      this.offset = expression.offset + offset;
      return;
    }
    const merged = new Map<MathOptVariable, number>();
    for (const term of terms) {
      if (!isLinearTerm(term)) {
        throw new TypeError('unsupported type in iterable argument');
      }
      const existing = findVariableKey(merged, term.variable);
      const next = (existing ? merged.get(existing) ?? 0 : 0) + term.coefficient;
      if (existing) merged.delete(existing);
      if (next !== 0) merged.set(term.variable, next);
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

  evaluate(variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>): number {
    return evaluateExpression(this, variableValues);
  }
}

export class MathOptQuadraticExpression {
  readonly offset: number;
  readonly linearTerms: ReadonlyMap<MathOptVariable, number>;
  readonly quadraticTerms: ReadonlyMap<MathOptQuadraticTermKey, number>;

  constructor(
    linearTerms: Iterable<MathOptLinearTerm> | MathOptQuadraticExpressionInput = [],
    quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
    offset = 0,
  ) {
    if (
      typeof linearTerms === 'number'
      || linearTerms instanceof MathOptVariable
      || linearTerms instanceof MathOptLinearExpression
      || linearTerms instanceof MathOptQuadraticExpression
      || isLinearTerm(linearTerms)
      || isQuadraticTerm(linearTerms)
    ) {
      const expression = asFlatQuadraticExpression(linearTerms);
      this.linearTerms = expression.linearTerms;
      this.quadraticTerms = expression.quadraticTerms;
      this.offset = expression.offset + offset;
      return;
    }
    this.linearTerms = new MathOptLinearExpression(linearTerms).terms;
    const merged = new Map<MathOptQuadraticTermKey, number>();
    for (const term of quadraticTerms) {
      if (!isQuadraticTerm(term)) {
        throw new TypeError('unsupported type in iterable argument');
      }
      const key = new MathOptQuadraticTermKey(term.firstVariable, term.secondVariable);
      const existing = findQuadraticKey(merged, key);
      const next = (existing ? merged.get(existing) ?? 0 : 0) + term.coefficient;
      if (existing) merged.delete(existing);
      if (next !== 0) merged.set(key, next);
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

  evaluate(variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>): number {
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

  assertNotBoolean(): never {
    throw new TypeError('__bool__ is unsupported for two-sided or ranged linear inequality.');
  }

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

  assertNotBoolean(): never {
    throw new TypeError('__bool__ is unsupported for two-sided or ranged linear inequality.');
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

  assertNotBoolean(): never {
    throw new TypeError('__bool__ is unsupported for two-sided or ranged linear inequality.');
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

export class MathOptModel {
  readonly name: string;
  private readonly variableData: VariableData[] = [];
  private readonly constraints: LinearConstraintData[] = [];
  private readonly indicatorConstraints: IndicatorConstraintData[] = [];
  private objectiveDataValue: MathOptObjectiveData = {
    maximize: false,
    linearTerms: [],
    quadraticTerms: [],
    offset: 0,
  };
  readonly objective: MathOptObjective;

  constructor(name = '') {
    this.name = name;
    this.objective = new MathOptObjective(this);
  }

  addVariable(options: MathOptVariableOptions = {}): MathOptVariable {
    const id = this.variableData.length;
    const variable: VariableData = {
      id,
      lowerBound: options.lowerBound ?? options.lb ?? Number.NEGATIVE_INFINITY,
      upperBound: options.upperBound ?? options.ub ?? Number.POSITIVE_INFINITY,
      integer: options.integer ?? options.isInteger ?? false,
      name: options.name ?? '',
      deleted: false,
    };
    this.variableData.push(variable);
    return new MathOptVariable(this, variable);
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
    const id = this.constraints.length;
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
    this.constraints.push(constraint);
    return new MathOptLinearConstraint(this, constraint);
  }

  addIndicatorConstraint(options: MathOptIndicatorConstraintOptions = {}): MathOptIndicatorConstraint {
    const id = this.indicatorConstraints.length;
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
      id,
      indicator: normalizedOptions.indicator,
      activateOnZero: normalizedOptions.activateOnZero ?? false,
      lowerBound: (normalizedOptions.lowerBound ?? Number.NEGATIVE_INFINITY) - expression.offset,
      upperBound: (normalizedOptions.upperBound ?? Number.POSITIVE_INFINITY) - expression.offset,
      terms: linearTermEntries(expression),
      name: normalizedOptions.name ?? '',
      deleted: false,
    };
    this.indicatorConstraints.push(constraint);
    return new MathOptIndicatorConstraint(this, constraint);
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
      lowerBound: options.lowerBound ?? options.lb,
      upperBound: options.upperBound ?? options.ub,
      expression: options.expression ?? options.expr,
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
      lowerBound: options.lowerBound ?? options.lb,
      upperBound: options.upperBound ?? options.ub,
      expression: options.expression ?? options.expr,
      terms: options.terms,
      name: options.name,
    };
  }

  deleteVariable(variable: MathOptVariable): void {
    this.assertOwnsVariable(variable);
    if (variable.data.deleted) {
      throw new Error(`Variable ${variable.id} has already been deleted.`);
    }
    variable.data.deleted = true;
    for (const constraint of this.constraints) {
      constraint.terms = constraint.terms.filter((term) => term.variable.id !== variable.id);
    }
    for (const constraint of this.indicatorConstraints) {
      constraint.terms = constraint.terms.filter((term) => term.variable.id !== variable.id);
      if (constraint.indicator?.id === variable.id) {
        constraint.indicator = undefined;
      }
    }
    this.objectiveDataValue.linearTerms = this.objectiveDataValue.linearTerms.filter((term) => term.variable.id !== variable.id);
    this.objectiveDataValue.quadraticTerms = this.objectiveDataValue.quadraticTerms.filter((term) => {
      return term.firstVariable.id !== variable.id && term.secondVariable.id !== variable.id;
    });
  }

  deleteLinearConstraint(constraint: MathOptLinearConstraint): void {
    this.assertOwnsConstraint(constraint);
    if (constraint.data.deleted) {
      throw new Error(`Linear constraint ${constraint.id} has already been deleted.`);
    }
    constraint.data.deleted = true;
  }

  variablesList(): MathOptVariable[] {
    return this.variableData
      .filter((variable) => !variable.deleted)
      .map((variable) => new MathOptVariable(this, variable));
  }

  variables(): MathOptVariable[] {
    return this.variablesList();
  }

  getNumVariables(): number {
    return this.variablesList().length;
  }

  getNextVariableId(): number {
    return this.variableData.length;
  }

  ensureNextVariableIdAtLeast(id: number): void {
    while (this.variableData.length < id) {
      const placeholderId = this.variableData.length;
      this.variableData.push({
        id: placeholderId,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: Number.POSITIVE_INFINITY,
        integer: false,
        name: '',
        deleted: true,
      });
    }
  }

  hasVariable(id: number): boolean {
    return !!this.getVariable(id);
  }

  getVariable(id: number, validate = true): MathOptVariable | undefined {
    const variable = this.variableData[id];
    if (variable && !variable.deleted) return new MathOptVariable(this, variable);
    if (!validate) {
      return new MathOptVariable(this, variable ?? {
        id,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: Number.POSITIVE_INFINITY,
        integer: false,
        name: '',
        deleted: true,
      });
    }
    return undefined;
  }

  linearConstraints(): MathOptLinearConstraint[] {
    return this.constraints
      .filter((constraint) => !constraint.deleted)
      .map((constraint) => new MathOptLinearConstraint(this, constraint));
  }

  getNumLinearConstraints(): number {
    return this.linearConstraints().length;
  }

  getNextLinearConstraintId(): number {
    return this.constraints.length;
  }

  ensureNextLinearConstraintIdAtLeast(id: number): void {
    while (this.constraints.length < id) {
      const placeholderId = this.constraints.length;
      this.constraints.push({
        id: placeholderId,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: Number.POSITIVE_INFINITY,
        terms: [],
        name: '',
        deleted: true,
      });
    }
  }

  hasLinearConstraint(id: number): boolean {
    return !!this.getLinearConstraint(id);
  }

  getLinearConstraint(id: number, validate = true): MathOptLinearConstraint | undefined {
    const constraint = this.constraints[id];
    if (constraint && !constraint.deleted) return new MathOptLinearConstraint(this, constraint);
    if (!validate) {
      return new MathOptLinearConstraint(this, constraint ?? {
        id,
        lowerBound: Number.NEGATIVE_INFINITY,
        upperBound: Number.POSITIVE_INFINITY,
        terms: [],
        name: '',
        deleted: true,
      });
    }
    return undefined;
  }

  maximize(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.objectiveDataValue = objectiveData(true, terms, offset);
  }

  minimize(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.objectiveDataValue = objectiveData(false, terms, offset);
  }

  maximizeLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setLinearObjective(terms, true, offset);
  }

  minimizeLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], offset = 0): void {
    this.setLinearObjective(terms, false, offset);
  }

  setObjective(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], isMaximize: boolean, offset = 0): void {
    this.objectiveDataValue = objectiveData(isMaximize, terms, offset);
  }

  setLinearObjective(terms: MathOptLinearExpressionInput | MathOptLinearTerm[], isMaximize: boolean, offset = 0): void {
    this.objectiveDataValue = linearObjectiveData(isMaximize, terms, offset);
  }

  setQuadraticObjective(terms: MathOptQuadraticExpressionInput | MathOptLinearTerm[], isMaximize: boolean, offset = 0): void {
    this.setObjective(terms, isMaximize, offset);
  }

  columnNonzeros(variable: MathOptVariable): MathOptLinearConstraint[] {
    this.assertOwnsVariable(variable);
    variable.assertLive();
    return this.constraints
      .filter((constraint) => !constraint.deleted && constraint.terms.some((term) => term.variable.id === variable.id && term.coefficient !== 0))
      .map((constraint) => new MathOptLinearConstraint(this, constraint));
  }

  rowNonzeros(constraint: MathOptLinearConstraint): MathOptVariable[] {
    this.assertOwnsConstraint(constraint);
    constraint.assertLive();
    return constraint.terms().map((term) => term.variable);
  }

  linearConstraintMatrixEntries(): MathOptLinearConstraintMatrixEntry[] {
    return this.constraints
      .filter((constraint) => !constraint.deleted)
      .flatMap((constraint) => {
        const linearConstraint = new MathOptLinearConstraint(this, constraint);
        return constraint.terms
          .filter((term) => term.coefficient !== 0)
          .map((term) => ({
            linearConstraint,
            variable: term.variable,
            coefficient: term.coefficient,
          }));
      });
  }

  get objectiveData(): MathOptObjectiveData {
    return this.objectiveDataValue;
  }

  set objectiveData(value: MathOptObjectiveData) {
    this.objectiveDataValue = value;
  }

  variableName(id: number): string {
    return this.variableData[id]?.name ?? String(id);
  }

  linearConstraintName(id: number): string {
    return this.constraints[id]?.name ?? String(id);
  }

  snapshot(): MathOptModelSnapshot {
    return {
      variables: this.variableData.map((variable) => ({ ...variable })),
      linearConstraints: this.constraints.map((constraint) => ({
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
      indicatorConstraints: this.indicatorConstraints.map((constraint) => ({
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
      objective: {
        maximize: this.objectiveDataValue.maximize,
        offset: this.objectiveDataValue.offset,
        linearTerms: this.objectiveDataValue.linearTerms.map((term) => ({
          variableId: term.variable.id,
          coefficient: term.coefficient,
        })),
        quadraticTerms: this.objectiveDataValue.quadraticTerms.map((term) => ({
          firstVariableId: Math.min(term.firstVariable.id, term.secondVariable.id),
          secondVariableId: Math.max(term.firstVariable.id, term.secondVariable.id),
          coefficient: term.coefficient,
        })),
      },
    };
  }

  encodeModelUpdateSince(snapshot: MathOptModelSnapshot, options: { removeNames?: boolean } = {}): Uint8Array | null {
    return encodeModelUpdate(snapshot, this.snapshot(), options);
  }

  assertOwnsVariable(variable: MathOptVariable): void {
    if (variable.model !== this) {
      throw new Error('Variable belongs to a different MathOpt model.');
    }
    variable.assertLive();
  }

  assertOwnsConstraint(constraint: MathOptLinearConstraint): void {
    if (constraint.model !== this) {
      throw new Error('Linear constraint belongs to a different MathOpt model.');
    }
    constraint.assertLive();
  }

  encodeModelProto(options: { removeNames?: boolean } = {}): Uint8Array {
    const removeNames = options.removeNames ?? false;
    return message([
      removeNames ? empty() : fieldString(1, this.name),
      fieldMessage(2, this.encodeVariables({ removeNames })),
      fieldMessage(3, this.encodeObjective()),
      fieldMessage(4, this.encodeLinearConstraints({ removeNames })),
      fieldMessage(5, this.encodeLinearConstraintMatrix()),
      ...this.encodeIndicatorConstraints({ removeNames }),
    ]);
  }

  private encodeVariables(options: { removeNames?: boolean } = {}): Uint8Array {
    const activeVariables = this.variableData.filter((variable) => !variable.deleted);
    return message([
      fieldPackedVarints(1, activeVariables.map((variable) => variable.id)),
      fieldPackedDoubles(2, activeVariables.map((variable) => variable.lowerBound)),
      fieldPackedDoubles(3, activeVariables.map((variable) => variable.upperBound)),
      fieldPackedBools(4, activeVariables.map((variable) => variable.integer)),
      ...(options.removeNames ? [] : activeVariables.map((variable) => fieldString(5, variable.name))),
    ]);
  }

  private encodeObjective(): Uint8Array {
    return message([
      fieldBool(1, this.objectiveDataValue.maximize),
      fieldDouble(2, this.objectiveDataValue.offset),
      fieldMessage(3, encodeSparseDoubleVector(this.objectiveDataValue.linearTerms)),
      fieldMessage(4, encodeSparseDoubleMatrix(this.objectiveDataValue.quadraticTerms.map((term) => {
        const rowId = Math.min(term.firstVariable.id, term.secondVariable.id);
        const columnId = Math.max(term.firstVariable.id, term.secondVariable.id);
        return { rowId, columnId, coefficient: term.coefficient };
      }))),
    ]);
  }

  private encodeLinearConstraints(options: { removeNames?: boolean } = {}): Uint8Array {
    const activeConstraints = this.constraints.filter((constraint) => !constraint.deleted);
    return message([
      fieldPackedVarints(1, activeConstraints.map((constraint) => constraint.id)),
      fieldPackedDoubles(2, activeConstraints.map((constraint) => constraint.lowerBound)),
      fieldPackedDoubles(3, activeConstraints.map((constraint) => constraint.upperBound)),
      ...(options.removeNames ? [] : activeConstraints.map((constraint) => fieldString(4, constraint.name))),
    ]);
  }

  private encodeLinearConstraintMatrix(): Uint8Array {
    const entries = this.constraints.filter((constraint) => !constraint.deleted).flatMap((constraint) => {
      return [...constraint.terms]
        .filter((term) => term.coefficient !== 0)
        .sort((a, b) => a.variable.id - b.variable.id)
        .map((term) => ({
          rowId: constraint.id,
          columnId: term.variable.id,
          coefficient: term.coefficient,
        }));
    });
    return message([
      fieldPackedVarints(1, entries.map((entry) => entry.rowId)),
      fieldPackedVarints(2, entries.map((entry) => entry.columnId)),
      fieldPackedDoubles(3, entries.map((entry) => entry.coefficient)),
    ]);
  }

  private encodeIndicatorConstraints(options: { removeNames?: boolean } = {}): Uint8Array[] {
    const activeConstraints = this.indicatorConstraints.filter((constraint) => !constraint.deleted);
    return activeConstraints.map((constraint) => fieldMessage(9, message([
      fieldVarint(1, constraint.id),
      fieldMessage(2, message([
        constraint.indicator === undefined ? empty() : fieldVarint(1, constraint.indicator.id),
        constraint.activateOnZero ? fieldBool(6, true) : empty(),
        fieldMessage(2, encodeSparseDoubleVector(constraint.terms)),
        fieldDouble(3, constraint.lowerBound),
        fieldDouble(4, constraint.upperBound),
        options.removeNames ? empty() : fieldString(5, constraint.name),
      ])),
    ])));
  }
}

export class MathOptVariable {
  constructor(readonly model: MathOptModel, readonly data: VariableData) {}

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

export class MathOptLinearConstraint {
  constructor(readonly model: MathOptModel, readonly data: LinearConstraintData) {}

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
    return [...this.data.terms].filter((term) => term.coefficient !== 0);
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

export class MathOptIndicatorConstraint {
  constructor(readonly model: MathOptModel, readonly data: IndicatorConstraintData) {}

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
    return [...this.data.terms].filter((term) => term.coefficient !== 0);
  }

  assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Indicator constraint ${this.id} has been deleted.`);
    }
  }
}

export class MathOptObjective {
  constructor(private readonly model: MathOptModel) {}

  get isMaximize(): boolean {
    return this.model.objectiveData.maximize;
  }

  set isMaximize(value: boolean) {
    this.model.objectiveData = { ...this.model.objectiveData, maximize: value };
  }

  get offset(): number {
    return this.model.objectiveData.offset;
  }

  set offset(value: number) {
    this.model.objectiveData = { ...this.model.objectiveData, offset: value };
  }

  get name(): string {
    return '';
  }

  clear(): void {
    this.model.objectiveData = { maximize: false, linearTerms: [], quadraticTerms: [], offset: 0 };
  }

  setLinearCoefficient(variable: MathOptVariable, coefficient: number): void {
    this.model.assertOwnsVariable(variable);
    const terms = this.model.objectiveData.linearTerms.filter((term) => term.variable.id !== variable.id);
    if (coefficient !== 0) terms.push({ variable, coefficient });
    this.model.objectiveData = { ...this.model.objectiveData, linearTerms: terms };
  }

  getLinearCoefficient(variable: MathOptVariable): number {
    this.model.assertOwnsVariable(variable);
    return this.model.objectiveData.linearTerms.find((term) => term.variable.id === variable.id)?.coefficient ?? 0;
  }

  linearTerms(): MathOptLinearTerm[] {
    return [...this.model.objectiveData.linearTerms].filter((term) => term.coefficient !== 0);
  }

  setQuadraticCoefficient(firstVariable: MathOptVariable, secondVariable: MathOptVariable, coefficient: number): void {
    this.model.assertOwnsVariable(firstVariable);
    this.model.assertOwnsVariable(secondVariable);
    const key = new MathOptQuadraticTermKey(firstVariable, secondVariable);
    const terms = this.model.objectiveData.quadraticTerms.filter((term) => {
      return !new MathOptQuadraticTermKey(term.firstVariable, term.secondVariable).equals(key);
    });
    if (coefficient !== 0) terms.push({ firstVariable: key.firstVariable, secondVariable: key.secondVariable, coefficient });
    this.model.objectiveData = { ...this.model.objectiveData, quadraticTerms: terms };
  }

  getQuadraticCoefficient(firstVariable: MathOptVariable, secondVariable: MathOptVariable): number {
    this.model.assertOwnsVariable(firstVariable);
    this.model.assertOwnsVariable(secondVariable);
    const key = new MathOptQuadraticTermKey(firstVariable, secondVariable);
    return this.model.objectiveData.quadraticTerms.find((term) => {
      return new MathOptQuadraticTermKey(term.firstVariable, term.secondVariable).equals(key);
    })?.coefficient ?? 0;
  }

  quadraticTerms(): MathOptQuadraticTerm[] {
    return [...this.model.objectiveData.quadraticTerms].filter((term) => term.coefficient !== 0);
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

function findQuadraticKey(
  map: ReadonlyMap<MathOptQuadraticTermKey, number>,
  key: MathOptQuadraticTermKey,
): MathOptQuadraticTermKey | undefined {
  for (const existing of map.keys()) {
    if (existing.equals(key)) return existing;
  }
  return undefined;
}

function linearTermEntries(expression: MathOptLinearExpression): MathOptLinearTerm[] {
  return linearTermEntriesFromMap(expression.terms);
}

function linearTermEntriesFromMap(map: ReadonlyMap<MathOptVariable, number>): MathOptLinearTerm[] {
  return [...map.entries()].map(([variable, coefficient]) => ({ variable, coefficient }));
}

function readonlyMap<TKey, TValue>(map: Map<TKey, TValue>): ReadonlyMap<TKey, TValue> {
  return new Proxy(map, {
    get(target, property) {
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return () => {
          throw new TypeError('ReadonlyMap does not support item assignment');
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
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
  let linear = new MathOptLinearExpression();
  let quadratic = new MathOptQuadraticExpression();
  let hasQuadratic = false;
  for (const input of inputs) {
    if (input instanceof MathOptQuadraticExpression || isQuadraticTerm(input)) {
      hasQuadratic = true;
      quadratic = quadratic.add(input);
      continue;
    }
    if (hasQuadratic) {
      quadratic = quadratic.add(input);
    } else {
      linear = linear.add(input);
    }
  }
  return hasQuadratic ? quadratic.add(linear) : linear;
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
  variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>,
): number {
  const values = (variable: MathOptVariable) => {
    if (variableValues instanceof Map) {
      const typedValues = variableValues as ReadonlyMap<MathOptVariable, number>;
      const matchingVariable = findVariableKey(typedValues, variable);
      return typedValues.get(variable) ?? (matchingVariable ? typedValues.get(matchingVariable) : undefined) ?? 0;
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

export function ne(
  lhs: MathOptQuadraticExpressionInput,
  rhs: MathOptQuadraticExpressionInput,
): never {
  void lhs;
  void rhs;
  throw new TypeError('!= constraints are not supported');
}

export function variableEq(
  lhs: MathOptVariable,
  rhs: MathOptVariable,
): boolean | MathOptVarEqVar {
  if (lhs === rhs) return true;
  if (lhs.model !== rhs.model) return false;
  if (lhs.id === rhs.id) return true;
  return new MathOptVarEqVar(lhs, rhs);
}

export function variableNe(lhs: MathOptVariable, rhs: MathOptVariable): boolean {
  return variableEq(lhs, rhs) !== true;
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
  'solverType' | 'executor'
>;

export class MathOptIncrementalSolver {
  private readonly initPromise: Promise<number>;
  private checkpoint: MathOptModelSnapshot;
  private handle: number | null = null;
  private state: 'open' | 'failed' | 'closing' | 'closed' = 'open';
  private activeSolve: Promise<MathOptSolveResult> | null = null;
  private closePromise: Promise<void> | null = null;
  private callbackDepth = 0;
  private readonly executor: MathOptExecutor;
  readonly options: MathOptIncrementalSolveOptions;

  constructor(
    readonly model: MathOptModel,
    readonly solverType: MathOptSolverType | keyof typeof MathOptSolverType = MathOptSolverType.GLOP,
    options: MathOptIncrementalSolverOptions = {},
  ) {
    const { executor, ...solveOptions } = options;
    this.executor = createMathOptExecutor(executor);
    this.options = solveOptions;
    this.checkpoint = model.snapshot();
    if (!(options.removeNames ?? false)) {
      assertNoDuplicateNamesForIncrementalSolver(this.checkpoint);
    }
    this.initPromise = this.create();
  }

  private async create(): Promise<number> {
    const requestBytes = encodeSolveRequest(this.model, {
      ...this.options,
      solverType: this.solverType,
    });
    let handle = 0;
    await executeMathOptRequest(this.executor, {
      type: 'incrementalCreate',
      request: requestBytes,
    }, this.withLifecycleEvent(this.options), (responseBytes) => {
      const response = readMessage(responseBytes);
      const statusBytes = response.messages.get(3)?.[0];
      if (statusBytes) {
        const status = readMessage(statusBytes);
        throw new Error(status.strings.get(2)?.[0] ?? 'MathOpt incremental solver creation failed.');
      }
      const handleText = response.strings.get(2)?.[0];
      handle = handleText === undefined
        ? 0
        : toIndex(BigInt(handleText), 'MathOpt incremental solver handle');
      if (handle <= 0) {
        throw new Error('MathOpt incremental solver creation returned no solver handle.');
      }
      this.handle = handle;
    });
    return handle;
  }

  solve(options: MathOptIncrementalSolveOptions = {}): Promise<MathOptSolveResult> {
    if (this.state === 'failed') {
      return Promise.reject(new Error('MathOpt IncrementalSolver is unusable after a failed operation; close it and create a new solver.'));
    }
    if (this.state !== 'open') {
      return Promise.reject(new Error('MathOpt IncrementalSolver is closed or closing.'));
    }
    if (this.activeSolve) {
      return Promise.reject(new Error('MathOpt IncrementalSolver already has a solve in progress.'));
    }
    let operation!: Promise<MathOptSolveResult>;
    operation = this.solveOnce(options).finally(() => {
      if (this.activeSolve === operation) this.activeSolve = null;
    });
    this.activeSolve = operation;
    return operation;
  }

  private async solveOnce(options: MathOptIncrementalSolveOptions): Promise<MathOptSolveResult> {
    let handle: number;
    try {
      handle = await this.initPromise;
    } catch (error) {
      if (this.state === 'open') this.state = 'failed';
      throw error;
    }
    const mergedOptions: MathOptSolveOptions = {
      ...this.options,
      ...options,
      solverType: this.solverType,
    };
    const removeNames = mergedOptions.removeNames ?? false;
    const requestBytes = encodeSolveRequest(this.model, mergedOptions);
    const submittedCheckpoint = this.model.snapshot();
    const updateBytes = encodeModelUpdate(this.checkpoint, submittedCheckpoint, { removeNames });
    const interrupterState = solveInterrupterState(mergedOptions);
    let result: MathOptSolveResult | undefined;
    let operationCommitted = false;
    try {
      await executeMathOptRequest(this.executor, {
        type: 'incrementalSolve',
        handle: BigInt(handle),
        request: requestBytes,
        modelUpdate: updateBytes ?? undefined,
        useInterrupter: interrupterState.useInterrupter,
        interruptAtStart: interrupterState.interrupted,
      }, this.withLifecycleEvent(mergedOptions), (responseBytes) => {
        result = decodeSolveResponse(responseBytes, this.model);
        this.checkpoint = submittedCheckpoint;
        operationCommitted = true;
      });
    } catch (error) {
      if (!operationCommitted && this.state === 'open') this.state = 'failed';
      throw error;
    }
    if (!result) throw new Error('MathOpt incremental solve returned no result.');
    const messageCallback = solveMessageCallback(mergedOptions);
    if (messageCallback && result.messages.length > 0) {
      this.callbackDepth += 1;
      try {
        messageCallback(result.messages);
      } finally {
        this.callbackDepth -= 1;
      }
    }
    return result;
  }

  close(): Promise<void> {
    if (this.callbackDepth > 0) {
      return Promise.reject(new Error('MathOpt IncrementalSolver cannot be closed while one of its callbacks is running.'));
    }
    if (this.state === 'closed') return Promise.resolve();
    if (this.closePromise) return this.closePromise;
    this.state = 'closing';
    let attempt!: Promise<void>;
    attempt = this.closeOnce().then(() => {
      this.handle = null;
      this.state = 'closed';
    }).finally(() => {
      if (this.closePromise === attempt) this.closePromise = null;
    });
    this.closePromise = attempt;
    return attempt;
  }

  private async closeOnce(): Promise<void> {
    await this.initPromise.catch(() => undefined);
    const activeSolve = this.activeSolve;
    if (activeSolve) await activeSolve.catch(() => undefined);
    const handle = this.handle;
    if (handle === null) return;
    await executeMathOptRequest(this.executor, {
      type: 'incrementalDelete',
      handle: BigInt(handle),
    }, { threads: this.options.threads });
  }

  private withLifecycleEvent<T extends Pick<MathOptSolveOptions, 'threads' | 'onEvent' | 'signal'>>(options: T): T {
    if (!options.onEvent) return options;
    const onEvent = options.onEvent;
    return {
      ...options,
      onEvent: async (event: MathOptEvent) => {
        this.callbackDepth += 1;
        try {
          await onEvent(event);
        } finally {
          this.callbackDepth -= 1;
        }
      },
    };
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
  static readonly SparseVectorFilter = MathOptSparseVectorFilter;
  static readonly SolutionHint = MathOptSolutionHint;
  static readonly IncrementalSolver = MathOptIncrementalSolver;
  static readonly LinearExpression = MathOptLinearExpression;
  static readonly QuadraticExpression = MathOptQuadraticExpression;
  static readonly QuadraticTermKey = MathOptQuadraticTermKey;
  static readonly VarEqVar = MathOptVarEqVar;
  static readonly BoundedExpression = MathOptBoundedExpression;
  static readonly LowerBoundedExpression = MathOptLowerBoundedExpression;
  static readonly UpperBoundedExpression = MathOptUpperBoundedExpression;

  static Model(name = ''): MathOptModel {
    return new MathOptModel(name);
  }

  static async solve(model: MathOptModel, options: MathOptSolveOptions = {}): Promise<MathOptSolveResult> {
    const requestBytes = MathOpt.encodeSolveRequest(model, options);
    const interrupterState = solveInterrupterState(options);
    const responseBytes = await executeMathOptRequest(
      createMathOptExecutor(options.executor),
      {
        type: 'solve',
        request: requestBytes,
        useInterrupter: interrupterState.useInterrupter,
        interruptAtStart: interrupterState.interrupted,
      },
      options,
    );
    const result = decodeSolveResponse(responseBytes, model);
    const messageCallback = solveMessageCallback(options);
    if (messageCallback && result.messages.length > 0) {
      messageCallback(result.messages);
    }
    return result;
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
    variableValues: ReadonlyMap<unknown, number> | Record<number | string, number>,
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

  static ne(lhs: MathOptQuadraticExpressionInput, rhs: MathOptQuadraticExpressionInput): never {
    return ne(lhs, rhs);
  }

  static variableEq(lhs: MathOptVariable, rhs: MathOptVariable): boolean | MathOptVarEqVar {
    return variableEq(lhs, rhs);
  }

  static variableNe(lhs: MathOptVariable, rhs: MathOptVariable): boolean {
    return variableNe(lhs, rhs);
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

async function executeMathOptRequest(
  executor: MathOptExecutor,
  operation: MathOptOperation,
  options: Pick<MathOptSolveOptions, 'threads' | 'onEvent' | 'signal'>,
  onSuccess?: (response: Uint8Array) => void | Promise<void>,
): Promise<Uint8Array> {
  const resources: SolverResourceRequest = {
    threads: operation.type === 'solve' || operation.type === 'incrementalSolve'
      ? options.threads ?? 1
      : 1,
  };
  const response = await executeSolverJob(executor, operation, {
    resources,
    onEvent: options.onEvent,
    onSuccess: (response) => onSuccess?.(response.response),
    signal: options.signal,
    abortError: createAbortError,
  });
  return response.response;
}

function createAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error(
    signal.reason === undefined
      ? 'The MathOpt operation was aborted.'
      : String(signal.reason),
  );
  error.name = 'AbortError';
  return error;
}

function encodeSolveRequest(
  model: MathOptModel,
  options: MathOptSolveOptions,
): Uint8Array {
  const solverType = typeof options.solverType === 'string'
    ? MathOptSolverType[options.solverType]
    : options.solverType ?? MathOptSolverType.GLOP;
  if (solverType === MathOptSolverType.GLPK && options.threads !== undefined && options.threads !== 1) {
    throw new Error('GLPK does not support multi-threaded MathOpt solves; use threads: 1 or omit threads.');
  }
  const parameters = encodeMathOptSolveParameters(options);
  const modelParameters = modelParametersBytes(options.modelParameters);
  const removeNames = options.removeNames ?? false;
  return message([
    fieldVarint(1, solverType),
    fieldMessage(2, model.encodeModelProto({ removeNames })),
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
    optionalVarintField(4, options.threads),
    optionalVarintField(5, options.randomSeed),
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
    optionalVarintField(23, options.solutionLimit),
    optionalVarintField(24, options.nodeLimit),
    optionalVarintField(25, options.solutionPoolSize),
    fieldMessageIfPresent(26, backendParametersBytes(options.glpk, GlpkParameters)),
  ];
  const encoded = message(fields);
  return encoded.length > 0 ? encoded : null;
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

  const variableLowerUpdates = changedValues(previous.variables, current.variables, (item) => item.lowerBound);
  const variableUpperUpdates = changedValues(previous.variables, current.variables, (item) => item.upperBound);
  const variableIntegerUpdates = changedValues(previous.variables, current.variables, (item) => item.integer);
  const linearLowerUpdates = changedValues(previous.linearConstraints, current.linearConstraints, (item) => item.lowerBound);
  const linearUpperUpdates = changedValues(previous.linearConstraints, current.linearConstraints, (item) => item.upperBound);
  const matrixUpdates = changedMatrixEntries(previous.linearConstraints, current.linearConstraints);
  const objectiveUpdate = encodeObjectiveUpdate(previous.objective, current.objective);

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
    fieldMessageIfPresent(12, indicatorUpdate.length ? indicatorUpdate : null),
  ]);
  return encoded.length > 0 ? encoded : null;
}

function assertNoDuplicateNamesForIncrementalSolver(snapshot: MathOptModelSnapshot): void {
  const seen = new Set<string>();
  for (const name of [
    ...snapshot.variables.filter((variable) => !variable.deleted).map((variable) => variable.name),
    ...snapshot.linearConstraints.filter((constraint) => !constraint.deleted).map((constraint) => constraint.name),
    ...snapshot.indicatorConstraints.filter((constraint) => !constraint.deleted).map((constraint) => constraint.name),
  ]) {
    if (name === '') continue;
    if (seen.has(name)) {
      throw new Error(`duplicate name: ${name}`);
    }
    seen.add(name);
  }
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
  const sortedTerms = [...terms].filter((term) => term.coefficient !== 0).sort((a, b) => a.variableId - b.variableId);
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

function decodeSolveResponse(bytes: Uint8Array, model: MathOptModel): MathOptSolveResult {
  const response = readMessage(bytes);
  const messages = response.strings.get(2) ?? [];
  const statusBytes = response.messages.get(3)?.[0];
  if (statusBytes) {
    const status = readMessage(statusBytes);
    const messageText = status.strings.get(2)?.[0] ?? 'MathOpt solve failed.';
    throw new Error(messageText);
  }

  const resultBytes = response.messages.get(1)?.[0];
  if (!resultBytes) {
    throw new Error('MathOpt solve returned no result.');
  }

  const result = readMessage(resultBytes);
  const termination = result.messages.get(2)?.[0];
  const terminationMessage = termination ? readMessage(termination) : undefined;
  const terminationReasonNumber = terminationMessage ? Number(terminationMessage.varints.get(1)?.[0] ?? 0n) : 0;
  const terminationLimitNumber = terminationMessage ? Number(terminationMessage.varints.get(2)?.[0] ?? 0n) : 0;
  const objectiveBounds = terminationMessage?.messages.get(5)?.[0];
  const objectiveBoundsMessage = objectiveBounds ? readMessage(objectiveBounds) : undefined;
  const solveStatsBytes = result.messages.get(6)?.[0];
  const solveStats = solveStatsBytes ? readMessage(solveStatsBytes) : undefined;
  const primalBound = objectiveBoundsMessage?.doubles.get(2)?.[0] ?? solveStats?.doubles.get(2)?.[0] ?? null;
  const dualBound = objectiveBoundsMessage?.doubles.get(3)?.[0] ?? solveStats?.doubles.get(3)?.[0] ?? null;
  const problemStatusBytes = terminationMessage?.messages.get(4)?.[0];
  const statsProblemStatusBytes = solveStats?.messages.get(4)?.[0];
  const problemStatusMessage = problemStatusBytes
    ? readMessage(problemStatusBytes)
    : statsProblemStatusBytes
      ? readMessage(statsProblemStatusBytes)
      : undefined;
  const primalStatus = Number(problemStatusMessage?.varints.get(1)?.[0] ?? 0n);
  const dualStatus = Number(problemStatusMessage?.varints.get(2)?.[0] ?? 0n);
  const primalOrDualInfeasible = Boolean(Number(problemStatusMessage?.varints.get(3)?.[0] ?? 0n));
  const solveTime = solveStats?.messages.get(1)?.[0];
  const solveTimeSeconds = solveTime ? decodeDurationSeconds(solveTime) : null;
  const solutions = (result.messages.get(3) ?? []).map((solutionBytes) => decodeSolution(solutionBytes, model));
  const primalRays = (result.messages.get(4) ?? []).map((rayBytes) => decodePrimalRay(rayBytes, model));
  const dualRays = (result.messages.get(5) ?? []).map((rayBytes) => decodeDualRay(rayBytes, model));
  const firstPrimalSolution = solutions.find((solution) => solution.primalSolution !== null)?.primalSolution ?? null;
  const objectiveValue = firstPrimalSolution?.objectiveValue ?? null;
  const variableValues = firstPrimalSolution?.variableValues ?? {};
  const variableValuesById = firstPrimalSolution?.variableValuesById ?? {};

  const solveResult: MathOptSolveResult = {
    terminationReason: terminationReasonNames[terminationReasonNumber] ?? `TERMINATION_REASON_${terminationReasonNumber}`,
    terminationLimit: terminationLimitNumber === 0
      ? null
      : terminationLimitNames[terminationLimitNumber] ?? `LIMIT_${terminationLimitNumber}`,
    solveTimeSeconds,
    primalBound,
    dualBound,
    primalStatus: problemStatusMessage ? feasibilityStatusNames[primalStatus] ?? `FEASIBILITY_STATUS_${primalStatus}` : null,
    dualStatus: problemStatusMessage ? feasibilityStatusNames[dualStatus] ?? `FEASIBILITY_STATUS_${dualStatus}` : null,
    primalOrDualInfeasible,
    objectiveValue,
    variableValues,
    variableValuesById,
    solutions,
    primalRays,
    dualRays,
    messages,
    rawResponse: bytes,
  };
  return solveResult;
}

function decodeSolution(bytes: Uint8Array, model: MathOptModel): MathOptSolutionResult {
  const solution = readMessage(bytes);
  const primalBytes = solution.messages.get(1)?.[0];
  const dualBytes = solution.messages.get(2)?.[0];
  const basisBytes = solution.messages.get(3)?.[0];
  return {
    primalSolution: primalBytes ? decodePrimalSolution(primalBytes, model) : null,
    dualSolution: dualBytes ? decodeDualSolution(dualBytes, model) : null,
    basis: basisBytes ? decodeBasis(basisBytes, model) : null,
  };
}

function decodePrimalSolution(bytes: Uint8Array, model: MathOptModel): MathOptPrimalSolutionResult {
  const primal = readMessage(bytes);
  const variableValues = decodeSparseDoubleVector(
    primal.messages.get(1)?.[0],
    (id) => model.variableName(id),
  );
  return {
    objectiveValue: primal.doubles.get(2)?.[0] ?? null,
    variableValues: variableValues.byName,
    variableValuesById: variableValues.byId,
    feasibilityStatus: solutionStatusNames[Number(primal.varints.get(3)?.[0] ?? 0n)] ?? `SOLUTION_STATUS_${Number(primal.varints.get(3)?.[0] ?? 0n)}`,
  };
}

function decodeDualSolution(bytes: Uint8Array, model: MathOptModel): MathOptDualSolutionResult {
  const dual = readMessage(bytes);
  const dualValues = decodeSparseDoubleVector(
    dual.messages.get(1)?.[0],
    (id) => model.linearConstraintName(id),
  );
  const reducedCosts = decodeSparseDoubleVector(
    dual.messages.get(2)?.[0],
    (id) => model.variableName(id),
  );
  return {
    objectiveValue: dual.doubles.get(3)?.[0] ?? null,
    dualValues: dualValues.byName,
    dualValuesById: dualValues.byId,
    reducedCosts: reducedCosts.byName,
    reducedCostsById: reducedCosts.byId,
    feasibilityStatus: solutionStatusNames[Number(dual.varints.get(4)?.[0] ?? 0n)] ?? `SOLUTION_STATUS_${Number(dual.varints.get(4)?.[0] ?? 0n)}`,
  };
}

function decodePrimalRay(bytes: Uint8Array, model: MathOptModel): MathOptPrimalRayResult {
  const ray = readMessage(bytes);
  const variableValues = decodeSparseDoubleVector(
    ray.messages.get(1)?.[0],
    (id) => model.variableName(id),
  );
  return {
    variableValues: variableValues.byName,
    variableValuesById: variableValues.byId,
  };
}

function decodeDualRay(bytes: Uint8Array, model: MathOptModel): MathOptDualRayResult {
  const ray = readMessage(bytes);
  const dualValues = decodeSparseDoubleVector(
    ray.messages.get(1)?.[0],
    (id) => model.linearConstraintName(id),
  );
  const reducedCosts = decodeSparseDoubleVector(
    ray.messages.get(2)?.[0],
    (id) => model.variableName(id),
  );
  return {
    dualValues: dualValues.byName,
    dualValuesById: dualValues.byId,
    reducedCosts: reducedCosts.byName,
    reducedCostsById: reducedCosts.byId,
  };
}

function decodeBasis(bytes: Uint8Array, model: MathOptModel): MathOptBasisResult {
  const basis = readMessage(bytes);
  const constraintStatus = decodeSparseBasisStatusVector(
    basis.messages.get(1)?.[0],
    (id) => model.linearConstraintName(id),
  );
  const variableStatus = decodeSparseBasisStatusVector(
    basis.messages.get(2)?.[0],
    (id) => model.variableName(id),
  );
  const basicDualFeasibilityNumber = Number(basis.varints.get(3)?.[0] ?? 0n);
  return {
    variableStatus: variableStatus.byName,
    variableStatusById: variableStatus.byId,
    constraintStatus: constraintStatus.byName,
    constraintStatusById: constraintStatus.byId,
    basicDualFeasibility: solutionStatusNames[basicDualFeasibilityNumber] ?? `SOLUTION_STATUS_${basicDualFeasibilityNumber}`,
  };
}

function decodeDurationSeconds(bytes: Uint8Array): number {
  const duration = readMessage(bytes);
  const seconds = Number(duration.varints.get(1)?.[0] ?? 0n);
  const nanos = Number(duration.varints.get(2)?.[0] ?? 0n);
  return seconds + nanos / 1e9;
}

function decodeSparseBasisStatusVector(
  bytes: Uint8Array | undefined,
  nameForId: (id: number) => string,
): { byId: Record<number, string>; byName: Record<string, string> } {
  const byId: Record<number, string> = {};
  const byName: Record<string, string> = {};
  if (!bytes) return { byId, byName };
  const sparse = readMessage(bytes);
  const ids = sparse.packedVarints.get(1) ?? [];
  const values = sparse.packedVarints.get(2) ?? [];
  ids.forEach((id, index) => {
    const numericId = toIndex(id, 'MathOpt variable id');
    const statusNumber = Number(values[index] ?? 0n);
    const status = basisStatusNames[statusNumber] ?? `BASIS_STATUS_${statusNumber}`;
    byId[numericId] = status;
    byName[nameForId(numericId)] = status;
  });
  return { byId, byName };
}

function decodeSparseDoubleVector(
  bytes: Uint8Array | undefined,
  nameForId: (id: number) => string,
): { byId: Record<number, number>; byName: Record<string, number> } {
  const byId: Record<number, number> = {};
  const byName: Record<string, number> = {};
  if (!bytes) return { byId, byName };
  const sparse = readMessage(bytes);
  const ids = sparse.packedVarints.get(1) ?? [];
  const values = sparse.packedDoubles.get(2) ?? [];
  ids.forEach((id, index) => {
    const numericId = toIndex(id, 'MathOpt constraint id');
    const value = values[index] ?? 0;
    byId[numericId] = value;
    byName[nameForId(numericId)] = value;
  });
  return { byId, byName };
}

type DecodedMessage = {
  varints: Map<number, bigint[]>;
  strings: Map<number, string[]>;
  doubles: Map<number, number[]>;
  messages: Map<number, Uint8Array[]>;
  packedVarints: Map<number, bigint[]>;
  packedDoubles: Map<number, number[]>;
};

function readMessage(bytes: Uint8Array): DecodedMessage {
  const decoded: DecodedMessage = {
    varints: new Map(),
    strings: new Map(),
    doubles: new Map(),
    messages: new Map(),
    packedVarints: new Map(),
    packedDoubles: new Map(),
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
      const value = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true);
      offset += 8;
      pushMap(decoded.doubles, field, value);
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const end = offset + toIndex(length.value, 'protobuf field length', bytes.length - offset);
      const payload = bytes.slice(offset, end);
      offset = end;
      pushMap(decoded.messages, field, payload);
      const text = new TextDecoder().decode(payload);
      if (/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text)) {
        pushMap(decoded.strings, field, text);
      }
      try {
        pushMapValues(decoded.packedVarints, field, readPackedVarints(payload));
      } catch {
        // Length-delimited fields can also be nested messages or strings.
      }
      if (payload.length % 8 === 0) {
        try {
          pushMapValues(decoded.packedDoubles, field, readPackedDoubles(payload));
        } catch {
          // Treat invalid packed doubles as another length-delimited shape.
        }
      }
    } else if (wire === 5) {
      offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type ${wire}.`);
    }
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

function pushMapValues<T>(map: Map<number, T[]>, key: number, values: T[]): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(...values);
  } else {
    map.set(key, [...values]);
  }
}

function readPackedVarints(bytes: Uint8Array): bigint[] {
  const values: bigint[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const value = readVarint(bytes, offset);
    values.push(value.value);
    offset = value.offset;
  }
  return values;
}

function readPackedDoubles(bytes: Uint8Array): number[] {
  const values: number[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length; offset += 8) {
    values.push(view.getFloat64(offset, true));
  }
  return values;
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
  return concat([writeVarint(BigInt(field << 3)), writeVarint(BigInt(value))]);
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
  return fieldLengthDelimited(field, concat(values.map((value) => writeVarint(BigInt(value)))));
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
  const wholeSeconds = Math.trunc(seconds);
  const nanos = Math.round((seconds - wholeSeconds) * 1_000_000_000);
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
  return fieldVarint(field, enumValue(value, enumObject));
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
): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (typeof (value as { toProtoBytes?: unknown }).toProtoBytes === 'function') {
    return (value as MathOptModelSolveParameters).toProtoBytes();
  }
  return new MathOptModelSolveParameters(value as MathOptModelSolveParametersOptions).toProtoBytes();
}

function solveMessageCallback(options: MathOptSolveOptions): ((messages: string[]) => void) | undefined {
  return options.messageCallback;
}

function solveInterrupterState(options: MathOptSolveOptions): MathOptSolveInterrupterState {
  const interrupter = options.interrupter;
  if (!interrupter) {
    return { useInterrupter: false, interrupted: false };
  }
  const interrupted = typeof interrupter.isInterrupted === 'function'
    ? interrupter.isInterrupted()
    : interrupter.interrupted === true;
  return { useInterrupter: true, interrupted };
}

function solutionHintBytes(value: MathOptSolutionHint | MathOptSolutionHintOptions | Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof (value as { toProtoBytes?: unknown }).toProtoBytes === 'function') {
    return (value as MathOptSolutionHint).toProtoBytes();
  }
  return new MathOptSolutionHint(value as MathOptSolutionHintOptions).toProtoBytes();
}

function modelFilterBytes<TElement>(value: MathOptSparseVectorFilterInput<TElement> | undefined): Uint8Array | null {
  if (!value) return null;
  if (typeof (value as { toProtoBytes?: unknown }).toProtoBytes === 'function') {
    return (value as MathOptSparseVectorFilter<TElement>).toProtoBytes();
  }
  return encodeSparseVectorFilter(normalizeSparseVectorFilter(value));
}

function normalizeSparseVectorFilter<TElement>(
  value: MathOptSparseVectorFilterInput<TElement>,
): MathOptSparseVectorFilterOptions<TElement> {
  if (Array.isArray(value)) {
    return { elements: value as TElement[], filterByIds: true };
  }
  return value as MathOptSparseVectorFilterOptions<TElement>;
}

function encodeSparseVectorFilter<TElement>(options: MathOptSparseVectorFilterOptions<TElement>): Uint8Array {
  const elementIds = options.elements?.map((element) => {
    if (typeof element === 'number' || typeof element === 'bigint') return element;
    const id = (element as { id?: number | bigint }).id;
    if (id === undefined) throw new Error('MathOpt sparse filter elements must expose an id.');
    return id;
  });
  const ids = options.ids ?? elementIds ?? [];
  return message([
    optionalBoolField(1, options.skipZeroValues),
    optionalBoolField(2, options.filterByIds ?? (ids.length > 0 ? true : undefined)),
    ids.length === 0 ? empty() : fieldPackedVarints(3, ids),
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

function encodePdlpTerminationCriteria(criteria: PdlpParametersOptions['terminationCriteria'] | undefined): Uint8Array | null {
  if (!criteria) return null;
  const simple = criteria.simpleOptimalityCriteria;
  const encoded = message([
    enumField(1, criteria.optimalityNorm, PdlpOptimalityNorm),
    optionalDoubleField(4, criteria.epsPrimalInfeasible),
    optionalDoubleField(5, criteria.epsDualInfeasible),
    optionalDoubleField(6, criteria.timeSecLimit),
    optionalVarintField(7, criteria.iterationLimit),
    optionalDoubleField(8, criteria.kktMatrixPassLimit),
    simple
      ? fieldMessage(9, message([
        optionalDoubleField(1, simple.epsOptimalAbsolute),
        optionalDoubleField(2, simple.epsOptimalRelative),
      ]))
      : empty(),
  ]);
  return encoded.length > 0 ? encoded : null;
}

function encodeSatParameters(
  parameters: Omit<SatParameters, 'numWorkers' | 'numSearchWorkers'> | Uint8Array | undefined,
): Uint8Array | null {
  if (parameters === undefined) return null;
  if (parameters instanceof Uint8Array) return parameters;
  const params = parameters as SatParameters;
  if (
    params.numWorkers !== undefined ||
    params.numSearchWorkers !== undefined
  ) {
    throw new Error('MathOpt CP-SAT thread count belongs in the top-level threads option.');
  }
  const type = getSatParametersType();
  const unknownParameter = Object.keys(params).find(
    (name) => type.fields[name] === undefined,
  );
  if (unknownParameter) {
    throw new Error(`MathOpt.solve: unknown CP-SAT parameter "${unknownParameter}".`);
  }
  const validationError = type.verify(params);
  if (validationError) {
    throw new Error(`MathOpt.solve: ${validationError}`);
  }
  return type.encode(type.create(params)).finish();
}

function writeVarint(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let current = value;
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
