import type {
  GScipParametersOptions, GlopParametersOptions, PdlpParametersOptions,
  GlpkParametersOptions, MathOptSparseVectorFilterOptions, MathOptSolutionHintOptions,
  MathOptObjectiveParametersOptions, MathOptModelSolveParametersOptions, MathOptSolveOptions,
  MathOptSparseVectorFilterInput,
} from './types.js';
import { encodeGScipParameters } from './result_proto.js';
import { encodeGlopParameters, encodePdlpParameters } from '../pdlp/proto.js';
import type { pdlp_PrimalDualHybridGradientParams } from '../generated/pdlp_types.js';
import { encodeMathOptRpc, mathOptDuration, mathOptRpcType } from './rpc_proto.js';
import { type MathOptModel, objectiveId, MathOptLinearConstraint } from './model.js';
import { sparseVectorProto, vectorUpdateProto } from './model_snapshot.js';
import { MathOptVariable } from './variable.js';
import type { SatParameters } from '../generated/sat_parameters.js';
import { encodeProtobufBigInts, normalizeProtobufInput } from '../protobufjs_helpers.js';
import { encodeMathOptCallbackRegistration } from './callbacks.js';

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

export class GScipParameters {
  constructor(readonly options: GScipParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    return encodeGScipParameters(this.options);
  }
}

export class GlopParameters {
  constructor(readonly options: GlopParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    return encodeGlopParameters(this.options);
  }
}

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

export class GlpkParameters {
  readonly computeUnboundRaysIfPossible?: boolean;

  constructor(options: GlpkParametersOptions = {}) {
    this.computeUnboundRaysIfPossible = options.computeUnboundRaysIfPossible;
  }

  toProtoBytes(): Uint8Array {
    return encodeMathOptRpc('GlpkParametersProto', { computeUnboundRaysIfPossible: this.computeUnboundRaysIfPossible });
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
    return encodeMathOptRpc('SolutionHintProto', {
      variableValues: variableValues !== undefined ? sparseVectorProto(variableValues.map(({ variable, value }) =>
        ({ variableId: variable.id, coefficient: value }))) : undefined,
      dualValues: dualValues !== undefined ? sparseVectorProto(dualValues.map(({ linearConstraint, value }) =>
        ({ variableId: linearConstraint.id, coefficient: value }))) : undefined,
    });
  }
}

export class MathOptObjectiveParameters {
  constructor(readonly options: MathOptObjectiveParametersOptions = {}) {}

  toProtoBytes(): Uint8Array {
    return encodeMathOptRpc('ObjectiveParametersProto', {
      objectiveDegradationAbsoluteTolerance: this.options.objectiveDegradationAbsoluteTolerance,
      objectiveDegradationRelativeTolerance: this.options.objectiveDegradationRelativeTolerance,
      timeLimit: mathOptDuration(this.options.timeLimitSeconds),
    });
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
    let primaryObjectiveParameters: Uint8Array | undefined;
    const auxiliaryObjectiveParameters: Record<string, Uint8Array> = {};
    for (const [objective, parameters] of options.objectiveParameters ?? []) {
      if (model) model.assertOwnsObjective(objective); else objective.assertLive();
      const bytes = parameters instanceof Uint8Array ? new Uint8Array(parameters)
        : (parameters instanceof MathOptObjectiveParameters ? parameters : new MathOptObjectiveParameters(parameters)).toProtoBytes();
      const id = objectiveId(objective);
      if (id === undefined) primaryObjectiveParameters = bytes;
      else auxiliaryObjectiveParameters[id] = bytes;
    }
    const priorities = options.branchingPriorities?.map(term => ({ id: term.variable.id, value: term.priority }));
    return encodeMathOptRpc('ModelSolveParametersProto', {
      variableValuesFilter: nonemptyBytes(modelFilterBytes(options.variableValuesFilter, model)),
      dualValuesFilter: nonemptyBytes(modelFilterBytes(options.dualValuesFilter, model)),
      quadraticDualValuesFilter: nonemptyBytes(modelFilterBytes(options.quadraticDualValuesFilter, model)),
      reducedCostsFilter: nonemptyBytes(modelFilterBytes(options.reducedCostsFilter, model)),
      initialBasis: nonemptyBytes(options.initialBasis),
      solutionHints: options.solutionHints?.map(hint => solutionHintBytes(hint, model)),
      branchingPriorities: priorities === undefined ? undefined : encodeMathOptRpc('SparseInt32VectorProto', vectorUpdateProto(priorities) ?? {}),
      lazyLinearConstraintIds,
      primaryObjectiveParameters, auxiliaryObjectiveParameters,
    }, true);
  }

  static onlySomePrimalVariables(variables: MathOptVariable[]): MathOptModelSolveParameters {
    return new MathOptModelSolveParameters({
      variableValuesFilter: { elements: variables, filterByIds: true },
    });
  }

}

export function encodeSolveRequest(
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
  return encodeMathOptRpc('SolveRequest', {
    solverType,
    model: modelProto ?? (model instanceof Uint8Array ? model : model.encodeModelProto({ removeNames: options.removeNames })),
    parameters: nonemptyBytes(encodeMathOptSolveParameters(options)),
    modelParameters: nonemptyBytes(modelParametersBytes(options.modelParameters, model instanceof Uint8Array ? undefined : model)),
  }, true);
}

function encodeMathOptSolveParameters(options: MathOptSolveOptions): Uint8Array | null {
  const duration = mathOptDuration(options.timeLimitSeconds);
  const encoded = encodeMathOptRpc('SolveParametersProto', {
    timeLimit: duration === undefined ? undefined : encodeMathOptRpc('google.protobuf.Duration', duration),
    iterationLimit: options.iterationLimit,
    enableOutput: options.enableOutput ?? (solveMessageCallback(options) ? true : undefined),
    threads: options.threads, randomSeed: options.randomSeed,
    lpAlgorithm: options.lpAlgorithm === undefined ? undefined : enumValue(options.lpAlgorithm, MathOptLPAlgorithm),
    presolve: options.presolve === undefined ? undefined : enumValue(options.presolve, MathOptEmphasis),
    cuts: options.cuts === undefined ? undefined : enumValue(options.cuts, MathOptEmphasis),
    heuristics: options.heuristics === undefined ? undefined : enumValue(options.heuristics, MathOptEmphasis),
    scaling: options.scaling === undefined ? undefined : enumValue(options.scaling, MathOptEmphasis),
    gscip: nonemptyBytes(backendParametersBytes(options.gscip, GScipParameters)),
    glop: nonemptyBytes(backendParametersBytes(options.glop, GlopParameters)),
    cpSat: nonemptyBytes(encodeSatParameters(options.cpSat)),
    pdlp: nonemptyBytes(backendParametersBytes(options.pdlp, PdlpParameters)),
    glpk: nonemptyBytes(backendParametersBytes(options.glpk, GlpkParameters)),
    relativeGapTolerance: options.relativeGapTolerance, absoluteGapTolerance: options.absoluteGapTolerance,
    cutoffLimit: options.cutoffLimit, objectiveLimit: options.objectiveLimit, bestBoundLimit: options.bestBoundLimit,
    solutionLimit: options.solutionLimit, nodeLimit: options.nodeLimit, solutionPoolSize: options.solutionPoolSize,
  }, true);
  return encoded.length ? encoded : null;
}

function nonemptyBytes(bytes: Uint8Array | null | undefined): Uint8Array | undefined {
  return bytes?.length ? bytes : undefined;
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

export function solveInterrupterState(options: MathOptSolveOptions): MathOptSolveInterrupterState {
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
  return encodeMathOptRpc('SparseVectorFilterProto', {
    skipZeroValues: options.skipZeroValues,
    filterByIds: options.filterByIds ?? (ids === undefined ? undefined : true),
    filteredIds: ids,
  });
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
  const type = mathOptRpcType('operations_research.sat.SatParameters');
  const value = encodeProtobufBigInts(normalizeProtobufInput(parameters, type), type) as Record<string, unknown>;
  const error = type.verify(value);
  if (error) throw new TypeError(`SatParameters: ${error}`);
  return new Uint8Array(type.encode(type.create(value)).finish());
}

export function solveCallbackRegistration(options: MathOptSolveOptions): Uint8Array | undefined {
  if (options.callback !== undefined && typeof options.callback !== 'function') throw new TypeError('MathOpt callback must be a function.');
  if ((options.callback !== undefined) !== (options.callbackRegistration !== undefined)) throw new TypeError('MathOpt callback and callbackRegistration must be supplied together.');
  return options.callbackRegistration === undefined ? undefined : encodeMathOptCallbackRegistration(options.callbackRegistration);
}
