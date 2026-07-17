export type SolveRequest = {
  type: 'solve';
  id: number;
  modelBytes: Uint8Array;
  paramsBytes?: Uint8Array;
  callbackFlags?: number;
};

export type ValidateRequest = {
  type: 'validate';
  id: number;
  modelBytes: Uint8Array;
};

export type SchemaRequest = {
  type: 'getSchemas';
  id: number;
  schema: 'cp_sat' | 'mp_solver';
};

export type RoutingSolveRequest = {
  type: 'routingSolve';
  id: number;
  numLocations: number;
  numVehicles: number;
  starts: number[];
  ends: number[];
  firstSolutionStrategy: number;
  solutionLimit: number;
  transitMatrix: BigInt64Array;
  transitMatrixDimension: number;
  operations: RoutingModelOperation[];
  dimensionNames: string[];
};

export type RoutingModelOperation =
  | {
      type: 'addDimension';
      transitMatrix: BigInt64Array;
      slackMax: number;
      capacity: number;
      fixStartCumulToZero: boolean;
      name: string;
    }
  | {
      type: 'addDimensionWithVehicleCapacity';
      transitMatrix: BigInt64Array;
      slackMax: number;
      capacities: number[];
      fixStartCumulToZero: boolean;
      name: string;
    }
  | {
      type: 'addDimensionWithVehicleTransits';
      transitMatrices: BigInt64Array[];
      slackMax: number;
      capacity: number;
      fixStartCumulToZero: boolean;
      name: string;
    }
  | {
      type: 'addConstantDimension';
      value: number;
      capacity: number;
      fixStartCumulToZero: boolean;
      name: string;
    }
  | {
      type: 'addVectorDimension';
      values: number[];
      capacity: number;
      fixStartCumulToZero: boolean;
      name: string;
    }
  | {
      type: 'addMatrixDimension';
      matrix: number[][];
      capacity: number;
      fixStartCumulToZero: boolean;
      name: string;
    }
  | {
      type: 'addDisjunction';
      indices: number[];
      penalty?: number;
    }
  | {
      type: 'addPickupAndDelivery';
      pickup: number;
      delivery: number;
    };

export type CancelSolve = {
  type: 'cancel_solve';
  id: number;
  targetId?: number;
};

export type RoutingSolveResult = {
  status: number;
  objectiveValue: number;
  nextValues: number[];
  starts: number[];
  ends: number[];
  dimensionCumulValues: Record<string, number[]>;
};

export type MPSolverSolveRequest = {
  type: 'mpSolverSolve';
  id: number;
  requestBytes: Uint8Array;
  numThreads?: number;
};

export type GraphSolveRequest =
  | {
      type: 'graphSolve';
      id: number;
      algorithm: 'maxFlow';
      tails: number[];
      heads: number[];
      capacities: number[];
      source: number;
      sink: number;
    }
  | {
      type: 'graphSolve';
      id: number;
      algorithm: 'minCostFlow';
      tails: number[];
      heads: number[];
      capacities: number[];
      unitCosts: number[];
      supplies: number[];
      solveMaxFlowWithMinCost: boolean;
    }
  | {
      type: 'graphSolve';
      id: number;
      algorithm: 'linearSumAssignment';
      leftNodes: number[];
      rightNodes: number[];
      costs: number[];
    };

export type SetCoverRequest = {
  type: 'setCover';
  id: number;
  operation: 'trivial' | 'greedy' | 'elementDegree' | 'lazyElementDegree' | 'random' | 'steepest' | 'guidedLocal' | 'guidedTabu';
  costs: number[];
  starts: number[];
  elements: number[];
  selected: boolean[];
  focus: boolean[] | null;
  maxIterations: number;
};

export type MathOptSolveRequest = {
  type: 'mathOptSolve';
  id: number;
  requestBytes: Uint8Array;
  useInterrupter?: boolean;
  interruptAtStart?: boolean;
};

export type MathOptInitRequest = {
  type: 'mathOptInit';
  id: number;
};

export type MathOptIncrementalRequest =
  | {
      type: 'mathOptIncrementalCreate';
      id: number;
      requestBytes: Uint8Array;
    }
  | {
      type: 'mathOptIncrementalSolve';
      id: number;
      handle: number;
      requestBytes: Uint8Array;
      updateBytes?: Uint8Array;
      useInterrupter?: boolean;
      interruptAtStart?: boolean;
    }
  | {
      type: 'mathOptIncrementalDelete';
      id: number;
      handle: number;
    };

export type PdlpRequest = {
  type: 'pdlp';
  id: number;
  operation: 'validate' | 'isLinear' | 'fromMpModel' | 'toMpModel' | 'solve';
  bytes: Uint8Array;
  relaxIntegerVariables?: boolean;
  includeNames?: boolean;
};

export type WorkerRequest =
  | SolveRequest
  | ValidateRequest
  | SchemaRequest
  | RoutingSolveRequest
  | MPSolverSolveRequest
  | GraphSolveRequest
  | SetCoverRequest
  | MathOptInitRequest
  | MathOptSolveRequest
  | MathOptIncrementalRequest
  | PdlpRequest
  | CancelSolve;

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'solveResult'; id: number; bytes: Uint8Array }
  | { type: 'solveCallback'; id: number; eventType: 'solution'; bytes: Uint8Array }
  | { type: 'solveCallback'; id: number; eventType: 'bestBound'; bound: number }
  | { type: 'solveCallback'; id: number; eventType: 'log'; message: string }
  | { type: 'validateResult'; id: number; ok: boolean; message: string }
  | { type: 'schemaResult'; id: number; schema: 'cp_sat'; schemas: { cp_model: string; sat_parameters: string } }
  | { type: 'schemaResult'; id: number; schema: 'mp_solver'; schemas: { linear_solver: string; optional_boolean: string } }
  | { type: 'routingSolveResult'; id: number; result: RoutingSolveResult | null }
  | { type: 'mpSolverSolveResult'; id: number; bytes: Uint8Array }
  | { type: 'graphSolveResult'; id: number; result: string }
  | { type: 'setCoverResult'; id: number; result: string }
  | { type: 'mathOptInitResult'; id: number }
  | { type: 'mathOptSolveResult'; id: number; bytes: Uint8Array }
  | { type: 'mathOptIncrementalResult'; id: number; bytes: Uint8Array }
  | { type: 'mathOptIncrementalDeleted'; id: number }
  | { type: 'pdlpResult'; id: number; bytes: Uint8Array; value?: number }
  | { type: 'solved_cancelled'; id: number }
  | { type: 'error'; id: number; error: string };
