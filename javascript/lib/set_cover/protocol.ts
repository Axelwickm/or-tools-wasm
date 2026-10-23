import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import type { SolverBridgeCodec } from '../solver_bridge.js';
import type { SolverExecutor, SolverJob } from '../solver_executor.js';
import {
  SetCoverBridgeRequestSchema,
  SetCoverBridgeResponseSchema,
  SetCoverOperation as BridgeSetCoverOperation,
} from '../generated/bridge/set_cover_pb.js';

export type SetCoverAlgorithm =
  | 'trivial'
  | 'greedy'
  | 'elementDegree'
  | 'lazyElementDegree'
  | 'random'
  | 'steepest'
  | 'lazySteepest'
  | 'guidedLocal'
  | 'guidedTabu';

export type GuidedTabuParameters = {
  lagrangianFactor: number;
  epsilon: number;
  penaltyFactor: number;
  tabuListSize: number;
};

export type SetCoverSearchOperation = {
  type: 'nextSolution' | 'sessionCreate';
  algorithm: SetCoverAlgorithm | 'inspect';
  focusIndices?: number[];
  costs: number[];
  starts: number[];
  elements: number[];
  selected: boolean[];
  focus: boolean[] | null;
  maxIterations: number;
  timeLimitSeconds?: number;
  guidedTabuParameters?: Partial<GuidedTabuParameters>;
};

export type SetCoverLagrangianBound = { lowerBound: number; reducedCosts: number[]; multipliers: number[] };

export type SetCoverOperation = SetCoverSearchOperation | {
  type: 'cft'; costs: number[]; starts: number[]; elements: number[]; selected?: boolean[];
} | {
  type: 'mip'; costs: number[]; starts: number[]; elements: number[]; selected: boolean[];
  focusIndices?: number[]; lpRelaxation: boolean; timeLimitSeconds: number;
} | {
  type: 'lagrangianBound'; costs: number[]; starts: number[]; elements: number[]; upperBound: number;
} | {
  type: 'readModel'; input: Uint8Array; format: number;
} | {
  type: 'writeModel'; costs: number[]; starts: number[]; elements: number[]; format: number;
} | {
  type: 'compressTrace'; numSubsets: number; trace: Array<{ subset: number; selected: boolean }>;
} | {
  type: 'statistics'; kind: number; costs: number[]; starts: number[]; elements: number[];
} | { type: 'guidedTabuParameters'; parameters: Partial<GuidedTabuParameters>; handle?: bigint }
  | { type: 'sessionNext'; handle: bigint; focus: boolean[] | null; maxIterations: number; timeLimitSeconds?: number; guidedTabuParameters?: Partial<GuidedTabuParameters> }
  | { type: 'sessionInitialize'; handle: bigint; selected: boolean[]; guidedTabuParameters?: Partial<GuidedTabuParameters> }
  | { type: 'sessionStatistics'; handle: bigint }
  | { type: 'sessionDelete'; handle: bigint } | SetCoverMutationOperation;

export type SetCoverMutationOperation = {
  costs: number[]; starts: number[]; elements: number[]; selected: boolean[];
} & (SetCoverPerturbationOperation
  | { type: 'updateSelection'; subset: number; select: boolean });

type SetCoverPerturbationOperation = {
  [K in 'clearRandomSubsets' | 'clearMostCoveredElements']: { type: K; numSubsets: number; focusIndices?: number[] }
}['clearRandomSubsets' | 'clearMostCoveredElements'];

export type SetCoverRemovability = {
  changed: boolean;
  newlyRemovableSubsets: number[];
  newlyNonRemovableSubsets: number[];
};

export type SetCoverResult = {
  cftDual?: SetCoverLagrangianBound;
  mip?: { subproblemStatus: number; objectiveValue?: number };
  lagrangianBound?: SetCoverLagrangianBound;
  runTimeSeconds?: number;
  runTimeMicroseconds?: number;
  modelProtoJson?: string;
  text?: string;
  sessionHandle?: bigint;
  trace?: Array<{ subset: number; selected: boolean }>;
  guidedTabuParameters?: GuidedTabuParameters;
  statistics?: { min: number; max: number; median: number; mean: number; stddev: number; iqr: number };
  deciles?: bigint[];
  nextSolution: boolean;
  cost: number;
  numUncoveredElements: number;
  selected: boolean[];
  coverage: number[];
  numFreeElements: number[];
  numCoverageLe1Elements: number[];
  isRedundant: boolean[];
  computedRedundancy?: boolean[];
  costLowerBound?: number;
  focusCoverage?: number[];
  removability?: SetCoverRemovability;
  perturbationFocus?: number[];
};

export type SetCoverExecutor = SolverExecutor<SetCoverOperation, SetCoverResult, never>;
export type SetCoverJob = SolverJob<SetCoverResult>;

const bridgeAlgorithm: Record<SetCoverSearchOperation['algorithm'], BridgeSetCoverOperation> = {
  inspect: BridgeSetCoverOperation.INSPECT,
  trivial: BridgeSetCoverOperation.TRIVIAL,
  greedy: BridgeSetCoverOperation.GREEDY,
  elementDegree: BridgeSetCoverOperation.ELEMENT_DEGREE,
  lazyElementDegree: BridgeSetCoverOperation.LAZY_ELEMENT_DEGREE,
  random: BridgeSetCoverOperation.RANDOM,
  steepest: BridgeSetCoverOperation.STEEPEST,
  lazySteepest: BridgeSetCoverOperation.LAZY_STEEPEST,
  guidedLocal: BridgeSetCoverOperation.GUIDED_LOCAL,
  guidedTabu: BridgeSetCoverOperation.GUIDED_TABU,
};

const algorithmByBridge = new Map(
  Object.entries(bridgeAlgorithm).map(([algorithm, value]) => [value, algorithm as SetCoverSearchOperation['algorithm']]),
);

function encodeOperation(operation: SetCoverOperation): Uint8Array {
  if (operation.type === 'cft') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    ...operation, operation: BridgeSetCoverOperation.CFT,
  }));
  if (operation.type === 'mip') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    ...operation, operation: BridgeSetCoverOperation.MIP, hasFocus: operation.focusIndices !== undefined,
  }));
  if (operation.type === 'lagrangianBound') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    operation: BridgeSetCoverOperation.LAGRANGIAN_BOUND, costs: operation.costs, starts: operation.starts,
    elements: operation.elements, upperBound: operation.upperBound,
  }));
  if (operation.type === 'sessionStatistics') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, { operation: BridgeSetCoverOperation.SESSION_STATISTICS, sessionHandle: operation.handle }));
  if (operation.type === 'readModel' || operation.type === 'writeModel') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    operation: operation.type === 'readModel' ? BridgeSetCoverOperation.READ_MODEL : BridgeSetCoverOperation.WRITE_MODEL,
    format: operation.format,
    ...(operation.type === 'readModel' ? { input: operation.input } : { costs: operation.costs, starts: operation.starts, elements: operation.elements }),
  }));
  if (operation.type === 'clearRandomSubsets' || operation.type === 'clearMostCoveredElements' || operation.type === 'updateSelection') {
    return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
      operation: operation.type === 'clearRandomSubsets' ? BridgeSetCoverOperation.CLEAR_RANDOM_SUBSETS :
        operation.type === 'clearMostCoveredElements' ? BridgeSetCoverOperation.CLEAR_MOST_COVERED_ELEMENTS : BridgeSetCoverOperation.UPDATE_SELECTION,
      costs: operation.costs, starts: operation.starts, elements: operation.elements, selected: operation.selected,
      ...(operation.type === 'updateSelection' ? { subsetIndex: operation.subset, subsetSelected: operation.select } :
        { perturbationCount: operation.numSubsets, focusIndices: operation.focusIndices, hasFocus: operation.focusIndices !== undefined }),
    }));
  }
  if (operation.type === 'compressTrace') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    operation: BridgeSetCoverOperation.COMPRESS_TRACE, numSubsets: operation.numSubsets, trace: { decisions: operation.trace },
  }));
  if (operation.type === 'guidedTabuParameters') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    operation: BridgeSetCoverOperation.GUIDED_TABU_PARAMETERS, guidedTabuParameters: operation.parameters, sessionHandle: operation.handle,
  }));
  if (operation.type === 'sessionDelete' || operation.type === 'sessionInitialize' || operation.type === 'sessionNext') {
    return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
      operation: operation.type === 'sessionDelete' ? BridgeSetCoverOperation.SESSION_DELETE :
        operation.type === 'sessionInitialize' ? BridgeSetCoverOperation.SESSION_INITIALIZE : BridgeSetCoverOperation.SESSION_NEXT,
      sessionHandle: operation.handle,
      ...(operation.type !== 'sessionDelete' ? { guidedTabuParameters: operation.guidedTabuParameters } : {}),
      ...(operation.type === 'sessionInitialize' ? { selected: operation.selected } : {}),
      ...(operation.type === 'sessionNext' ? { focus: operation.focus ?? [], hasFocus: operation.focus !== null,
        maxIterations: operation.maxIterations, timeLimitSeconds: operation.timeLimitSeconds } : {}),
    }));
  }
  if (operation.type === 'statistics') return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    operation: BridgeSetCoverOperation.STATISTICS, statisticsKind: operation.kind,
    costs: operation.costs, starts: operation.starts, elements: operation.elements,
  }));
  return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    operation: operation.type === 'sessionCreate' ? BridgeSetCoverOperation.SESSION_CREATE : bridgeAlgorithm[operation.algorithm],
    sessionAlgorithm: operation.type === 'sessionCreate' ? bridgeAlgorithm[operation.algorithm] : undefined,
    costs: operation.costs,
    starts: operation.starts,
    elements: operation.elements,
    selected: operation.selected,
    focus: operation.focus ?? [],
    hasFocus: operation.focusIndices !== undefined || operation.focus !== null,
    focusIndices: operation.focusIndices,
    maxIterations: operation.maxIterations,
    timeLimitSeconds: operation.timeLimitSeconds,
    guidedTabuParameters: operation.guidedTabuParameters,
  }));
}

function decodeOperation(payload: Uint8Array): SetCoverOperation {
  const request = fromBinary(SetCoverBridgeRequestSchema, payload);
  if (request.operation === BridgeSetCoverOperation.CFT) return { type: 'cft', costs: request.costs, starts: request.starts, elements: request.elements,
    ...(request.selected.length ? { selected: request.selected } : {}) };
  if (request.operation === BridgeSetCoverOperation.MIP) return {
    type: 'mip', costs: request.costs, starts: request.starts, elements: request.elements, selected: request.selected,
    focusIndices: request.hasFocus ? request.focusIndices : undefined, lpRelaxation: request.lpRelaxation, timeLimitSeconds: request.timeLimitSeconds ?? 0,
  };
  if (request.operation === BridgeSetCoverOperation.LAGRANGIAN_BOUND) return {
    type: 'lagrangianBound', costs: request.costs, starts: request.starts, elements: request.elements, upperBound: request.upperBound,
  };
  if (request.operation === BridgeSetCoverOperation.SESSION_STATISTICS) return { type: 'sessionStatistics', handle: request.sessionHandle };
  if (request.operation === BridgeSetCoverOperation.READ_MODEL) return { type: 'readModel', input: request.input, format: request.format };
  if (request.operation === BridgeSetCoverOperation.WRITE_MODEL) return { type: 'writeModel', costs: request.costs, starts: request.starts, elements: request.elements, format: request.format };
  if (request.operation === BridgeSetCoverOperation.CLEAR_RANDOM_SUBSETS ||
      request.operation === BridgeSetCoverOperation.CLEAR_MOST_COVERED_ELEMENTS || request.operation === BridgeSetCoverOperation.UPDATE_SELECTION) {
    const model = { costs: request.costs, starts: request.starts, elements: request.elements, selected: request.selected };
    return request.operation === BridgeSetCoverOperation.UPDATE_SELECTION ?
      { ...model, type: 'updateSelection', subset: request.subsetIndex, select: request.subsetSelected } :
      { ...model, type: request.operation === BridgeSetCoverOperation.CLEAR_RANDOM_SUBSETS ? 'clearRandomSubsets' : 'clearMostCoveredElements',
        numSubsets: request.perturbationCount, ...(request.hasFocus ? { focusIndices: request.focusIndices } : {}) };
  }
  if (request.operation === BridgeSetCoverOperation.COMPRESS_TRACE) return {
    type: 'compressTrace', numSubsets: request.numSubsets, trace: request.trace?.decisions ?? [],
  };
  if (request.operation === BridgeSetCoverOperation.GUIDED_TABU_PARAMETERS) return {
    type: 'guidedTabuParameters', parameters: request.guidedTabuParameters ?? {}, handle: request.sessionHandle || undefined,
  };
  if (request.operation === BridgeSetCoverOperation.SESSION_DELETE) return { type: 'sessionDelete', handle: request.sessionHandle };
  if (request.operation === BridgeSetCoverOperation.SESSION_INITIALIZE) return {
    type: 'sessionInitialize', handle: request.sessionHandle, selected: request.selected, guidedTabuParameters: request.guidedTabuParameters,
  };
  if (request.operation === BridgeSetCoverOperation.SESSION_NEXT) return {
    type: 'sessionNext', handle: request.sessionHandle, focus: request.hasFocus ? request.focus : null,
    maxIterations: request.maxIterations, timeLimitSeconds: request.timeLimitSeconds ?? Infinity, guidedTabuParameters: request.guidedTabuParameters,
  };
  if (request.operation === BridgeSetCoverOperation.STATISTICS) return {
    type: 'statistics', kind: request.statisticsKind, costs: request.costs, starts: request.starts, elements: request.elements,
  };
  const algorithm = algorithmByBridge.get(request.operation === BridgeSetCoverOperation.SESSION_CREATE ? request.sessionAlgorithm : request.operation);
  if (!algorithm) throw new Error('Set Cover bridge request has no valid operation.');
  return {
    type: request.operation === BridgeSetCoverOperation.SESSION_CREATE ? 'sessionCreate' : 'nextSolution',
    algorithm,
    costs: request.costs,
    starts: request.starts,
    elements: request.elements,
    selected: request.selected,
    focus: algorithm === 'inspect' ? null : request.hasFocus ? request.focus : null,
    ...(algorithm === 'inspect' && request.hasFocus ? { focusIndices: request.focusIndices } : {}),
    maxIterations: request.maxIterations,
    timeLimitSeconds: request.timeLimitSeconds ?? Number.POSITIVE_INFINITY,
    guidedTabuParameters: request.guidedTabuParameters,
  };
}

function encodeResult(result: SetCoverResult): Uint8Array {
  return toBinary(SetCoverBridgeResponseSchema, create(SetCoverBridgeResponseSchema, {
    ...result, trace: result.trace ? { decisions: result.trace } : undefined,
  }));
}

function decodeResult(payload: Uint8Array): SetCoverResult {
  const result = fromBinary(SetCoverBridgeResponseSchema, payload);
  return {
    cftDual: result.cftDual,
    mip: result.mip,
    lagrangianBound: result.lagrangianBound,
    runTimeSeconds: result.runTimeSeconds, runTimeMicroseconds: result.runTimeMicroseconds,
    sessionHandle: result.sessionHandle || undefined,
    modelProtoJson: result.modelProtoJson, text: result.text,
    trace: result.trace?.decisions.map(({ subset, selected }) => ({ subset, selected })),
    guidedTabuParameters: result.guidedTabuParameters as GuidedTabuParameters | undefined,
    statistics: result.statistics, deciles: result.deciles,
    nextSolution: result.nextSolution,
    cost: result.cost,
    numUncoveredElements: result.numUncoveredElements,
    selected: result.selected,
    coverage: result.coverage,
    numFreeElements: result.numFreeElements,
    numCoverageLe1Elements: result.numCoverageLe1Elements,
    isRedundant: result.isRedundant,
    computedRedundancy: result.computedRedundancy, costLowerBound: result.costLowerBound, focusCoverage: result.focusCoverage,
    removability: result.removability && { changed: result.removability.changed,
      newlyRemovableSubsets: result.removability.newlyRemovableSubsets, newlyNonRemovableSubsets: result.removability.newlyNonRemovableSubsets },
    perturbationFocus: result.perturbationFocus,
  };
}

export const setCoverProtocol: SolverBridgeCodec<SetCoverOperation, SetCoverResult, never> = {
  solver: 'set-cover',
  label: 'Set Cover',
  encodeRequest: encodeOperation,
  decodeRequest: decodeOperation,
  encodeResult,
  decodeResult,
};
