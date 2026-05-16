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
  objectiveValue: number;
  nextValues: number[];
  starts: number[];
  ends: number[];
  dimensionCumulValues: Record<string, number[]>;
};

export type WorkerRequest = SolveRequest | ValidateRequest | SchemaRequest | RoutingSolveRequest | CancelSolve;

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'solveResult'; id: number; bytes: Uint8Array }
  | { type: 'solveCallback'; id: number; eventType: 'solution'; bytes: Uint8Array }
  | { type: 'solveCallback'; id: number; eventType: 'bestBound'; bound: number }
  | { type: 'solveCallback'; id: number; eventType: 'log'; message: string }
  | { type: 'validateResult'; id: number; ok: boolean; message: string }
  | { type: 'schemaResult'; id: number; schemas: { cp_model: string; sat_parameters: string } }
  | { type: 'routingSolveResult'; id: number; result: RoutingSolveResult | null }
  | { type: 'solved_cancelled'; id: number }
  | { type: 'error'; id: number; error: string };
