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

export type SetCoverOperation = {
  type: 'nextSolution';
  algorithm: SetCoverAlgorithm;
  costs: number[];
  starts: number[];
  elements: number[];
  selected: boolean[];
  focus: boolean[] | null;
  maxIterations: number;
};

export type SetCoverResult = {
  nextSolution: boolean;
  cost: number;
  numUncoveredElements: number;
  selected: boolean[];
  coverage: number[];
  numFreeElements: number[];
  numCoverageLe1Elements: number[];
  isRedundant: boolean[];
};

export type SetCoverExecutor = SolverExecutor<SetCoverOperation, SetCoverResult, never>;
export type SetCoverJob = SolverJob<SetCoverResult>;

const bridgeAlgorithm: Record<SetCoverAlgorithm, BridgeSetCoverOperation> = {
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
  Object.entries(bridgeAlgorithm).map(([algorithm, value]) => [value, algorithm as SetCoverAlgorithm]),
);

function encodeOperation(operation: SetCoverOperation): Uint8Array {
  return toBinary(SetCoverBridgeRequestSchema, create(SetCoverBridgeRequestSchema, {
    operation: bridgeAlgorithm[operation.algorithm],
    costs: operation.costs,
    starts: operation.starts,
    elements: operation.elements,
    selected: operation.selected,
    focus: operation.focus ?? [],
    hasFocus: operation.focus !== null,
    maxIterations: operation.maxIterations,
  }));
}

function decodeOperation(payload: Uint8Array): SetCoverOperation {
  const request = fromBinary(SetCoverBridgeRequestSchema, payload);
  const algorithm = algorithmByBridge.get(request.operation);
  if (!algorithm) throw new Error('Set Cover bridge request has no valid operation.');
  return {
    type: 'nextSolution',
    algorithm,
    costs: request.costs,
    starts: request.starts,
    elements: request.elements,
    selected: request.selected,
    focus: request.hasFocus ? request.focus : null,
    maxIterations: request.maxIterations,
  };
}

function encodeResult(result: SetCoverResult): Uint8Array {
  return toBinary(SetCoverBridgeResponseSchema, create(SetCoverBridgeResponseSchema, result));
}

function decodeResult(payload: Uint8Array): SetCoverResult {
  const result = fromBinary(SetCoverBridgeResponseSchema, payload);
  return {
    nextSolution: result.nextSolution,
    cost: result.cost,
    numUncoveredElements: result.numUncoveredElements,
    selected: result.selected,
    coverage: result.coverage,
    numFreeElements: result.numFreeElements,
    numCoverageLe1Elements: result.numCoverageLe1Elements,
    isRedundant: result.isRedundant,
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
