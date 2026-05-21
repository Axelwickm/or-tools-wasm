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
};

export type KnapsackSolveRequest = {
  type: 'knapsackSolve';
  id: number;
  solverType: number;
  name: string;
  useReduction: boolean;
  timeLimitSeconds: number;
  profits: number[];
  weights: number[][];
  capacities: number[];
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
  | KnapsackSolveRequest
  | GraphSolveRequest
  | SetCoverRequest
  | MathOptSolveRequest
  | PdlpRequest
  | CancelSolve;

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'solveResult'; id: number; bytes: Uint8Array }
  | { type: 'solveCallback'; id: number; eventType: 'solution'; bytes: Uint8Array }
  | { type: 'solveCallback'; id: number; eventType: 'bestBound'; bound: number }
  | { type: 'solveCallback'; id: number; eventType: 'log'; message: string }
  | { type: 'validateResult'; id: number; ok: boolean; message: string }
  | { type: 'schemaResult'; id: number; schemas: { cp_model: string; sat_parameters: string; linear_solver: string; optional_boolean: string } }
  | { type: 'routingSolveResult'; id: number; result: RoutingSolveResult | null }
  | { type: 'mpSolverSolveResult'; id: number; bytes: Uint8Array }
  | { type: 'knapsackSolveResult'; id: number; result: string }
  | { type: 'graphSolveResult'; id: number; result: string }
  | { type: 'setCoverResult'; id: number; result: string }
  | { type: 'mathOptSolveResult'; id: number; bytes: Uint8Array }
  | { type: 'pdlpResult'; id: number; bytes: Uint8Array; value?: number }
  | { type: 'solved_cancelled'; id: number }
  | { type: 'error'; id: number; error: string };
