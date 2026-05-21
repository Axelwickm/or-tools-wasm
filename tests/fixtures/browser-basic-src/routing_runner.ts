import { routingContractCases } from './cases/ortools/routing/index.ts';

export type RoutingCaseResult = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  ok: boolean;
  objective: number;
  route: number[];
  routeDistance: number;
};

type RoutingIndexManagerLike = {
  numLocations: number;
  numVehicles: number;
  IndexToNode(index: number): number;
  NodeToIndex(node: number): number;
  GetNumberOfNodes(): number;
  GetNumberOfVehicles(): number;
  GetNumberOfIndices(): number;
  GetStartIndex(vehicle: number): number;
  GetEndIndex(vehicle: number): number;
  delete(): void;
};

type RoutingAssignmentLike = {
  ObjectiveValue(): number;
  Value(index: unknown): number;
  Min(index: unknown): number;
};

type RoutingModelLike = {
  RegisterTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  RegisterTransitMatrix(matrix: number[][]): number;
  RegisterUnaryTransitCallback(callback: (fromIndex: number) => number): number;
  RegisterUnaryTransitVector(values: number[]): number;
  SetArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  Solve(): Promise<RoutingAssignmentLike | null>;
  SolveWithParameters(parameters: { firstSolutionStrategy?: number; solution_limit?: number }): Promise<RoutingAssignmentLike | null>;
  SolveFromAssignmentWithParameters(assignment: RoutingAssignmentLike, parameters: { firstSolutionStrategy?: number; solution_limit?: number }): Promise<RoutingAssignmentLike | null>;
  ReadAssignmentFromRoutes(routes: number[][], ignoreInactiveIndices: boolean): RoutingAssignmentLike;
  CloseModelWithParameters(parameters: { firstSolutionStrategy?: number; solution_limit?: number }): void;
  GetNumberOfDecisionsInFirstSolution(parameters: { firstSolutionStrategy?: number; solution_limit?: number }): number;
  GetNumberOfRejectsInFirstSolution(parameters: { firstSolutionStrategy?: number; solution_limit?: number }): number;
  GetAutomaticFirstSolutionStrategy(): number;
  AddAtSolutionCallback(callback: (() => void) | { __call__(): void }): void;
  CostVar(): { Max(): number };
  AddDimension(transitIndex: number, slackMax: number, capacity: number, fixStartCumulToZero: boolean, name: string): boolean;
  AddDimensionWithVehicleCapacity(transitIndex: number, slackMax: number, capacities: number[], fixStartCumulToZero: boolean, name: string): boolean;
  AddDimensionWithVehicleTransits(transitIndices: number[], slackMax: number, capacity: number, fixStartCumulToZero: boolean, name: string): boolean;
  AddConstantDimension(value: number, capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean];
  AddVectorDimension(values: number[], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean];
  AddMatrixDimension(matrix: number[][], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean];
  AddDisjunction(indices: number[], penalty?: number): number;
  AddPickupAndDelivery(pickup: number, delivery: number): void;
  GetDimensionOrDie(name: string): {
    CumulVar(index: number): unknown;
    HasSoftSpanUpperBounds(): boolean;
    SetSoftSpanUpperBoundForVehicle(boundCost: { bound: number; cost: number }, vehicle: number): void;
    GetSoftSpanUpperBoundForVehicle(vehicle: number): { bound: number; cost: number };
    HasQuadraticCostSoftSpanUpperBounds(): boolean;
    SetQuadraticCostSoftSpanUpperBoundForVehicle(boundCost: { bound: number; cost: number }, vehicle: number): void;
    GetQuadraticCostSoftSpanUpperBoundForVehicle(vehicle: number): { bound: number; cost: number };
  };
  Start(vehicle: number): number;
  End(vehicle: number): number;
  IsEnd(index: number): boolean;
  NextVar(index: number): number;
  GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  status(): number;
  vehicles(): number;
  solver(): {
    Parameters(): { trace_propagation: boolean };
    LocalSearchProfile(): string;
    Add(...constraints: unknown[]): void;
  };
  delete(): void;
};

export type RoutingApi = {
  DefaultRoutingSearchParameters(): { firstSolutionStrategy?: number; solution_limit?: number; local_search_operators?: Record<string, unknown>; local_search_metaheuristic?: number };
  DefaultRoutingModelParameters(): {
    solver_parameters: {
      CopyFrom(value: unknown): void;
      trace_propagation: boolean;
      profile_local_search: boolean;
    };
  };
  FindErrorInRoutingSearchParameters(parameters: unknown): string;
  FirstSolutionStrategy: {
    PATH_CHEAPEST_ARC: number;
    FIRST_UNBOUND_MIN_VALUE: number;
    SAVINGS: number;
    PARALLEL_CHEAPEST_INSERTION: number;
  };
  LocalSearchMetaheuristic: { GUIDED_LOCAL_SEARCH: number };
  BOOL_FALSE: number;
  BOOL_UNSPECIFIED: number;
  BoundCost: new (bound?: number, cost?: number) => { bound: number; cost: number };
  initRouting(): Promise<void>;
  RoutingIndexManager: new (
    numLocations: number,
    numVehicles: number,
    depotOrStarts: number | number[],
    maybeEnds?: number[],
  ) => RoutingIndexManagerLike;
  RoutingModel: new (manager: never, parameters?: unknown) => RoutingModelLike;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runRoutingCases(routingApi: RoutingApi): Promise<RoutingCaseResult[]> {
  await routingApi.initRouting();

  const results: RoutingCaseResult[] = [];

  for (const routingCase of routingContractCases) {
    const message = await routingCase.run(routingApi as never);
    assert(!message.startsWith('TODO:'), message);
    assert(message.endsWith('PASS'), `${routingCase.name} failed: ${message}`);
    results.push({
      id: routingCase.id,
      name: routingCase.name,
      solver: routingCase.solver,
      source: routingCase.source,
      upstream: routingCase.upstream,
      tags: routingCase.tags,
      ok: true,
      objective: 0,
      route: [],
      routeDistance: 0,
    });
  }

  return results;
}
