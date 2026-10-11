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

export type SetCoverOperation = SetCoverSearchOperation | {
  type: 'compressTrace'; numSubsets: number; trace: Array<{ subset: number; selected: boolean }>;
} | {
  type: 'statistics'; kind: number; costs: number[]; starts: number[]; elements: number[];
} | { type: 'guidedTabuParameters'; parameters: Partial<GuidedTabuParameters>; handle?: bigint }
  | { type: 'sessionNext'; handle: bigint; focus: boolean[] | null; maxIterations: number; timeLimitSeconds?: number; guidedTabuParameters?: Partial<GuidedTabuParameters> }
  | { type: 'sessionInitialize'; handle: bigint; selected: boolean[]; guidedTabuParameters?: Partial<GuidedTabuParameters> }
  | { type: 'sessionDelete'; handle: bigint };

export type SetCoverResult = {
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
  guidedLocal: BridgeSetCoverOperation.GUIDED_LOCAL,
  guidedTabu: BridgeSetCoverOperation.GUIDED_TABU,
};

const algorithmByBridge = new Map(
  Object.entries(bridgeAlgorithm).map(([algorithm, value]) => [value, algorithm as SetCoverSearchOperation['algorithm']]),
);

function encodeOperation(operation: SetCoverOperation): Uint8Array {
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
    sessionHandle: result.sessionHandle || undefined,
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
