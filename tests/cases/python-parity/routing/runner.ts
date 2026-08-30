import { routingContractCases } from './index.ts';
import type { ExecutorFixtureMode } from '../../../harness/shared_case.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
} from '../../../harness/shared_case.ts';
import { setRoutingMode } from './execution.ts';

export type RoutingCaseResult = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: ExecutorFixtureMode;
  ok: boolean;
  objective: number;
  route: number[];
  routeDistance: number;
};

type RoutingIndexManagerLike = {
  numLocations: number;
  numVehicles: number;
  indexToNode(index: number): number;
  nodeToIndex(node: number): number;
  getNumberOfNodes(): number;
  getNumberOfVehicles(): number;
  getNumberOfIndices(): number;
  getStartIndex(vehicle: number): number;
  getEndIndex(vehicle: number): number;
};

type RoutingAssignmentLike = {
  objectiveValue(): number;
  value(index: unknown): number;
  min(index: unknown): number;
};

type RoutingModelLike = {
  registerTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  registerTransitMatrix(matrix: number[][]): number;
  registerUnaryTransitCallback(callback: (fromIndex: number) => number): number;
  registerUnaryTransitVector(values: number[]): number;
  setArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  solve(options?: unknown): Promise<RoutingAssignmentLike | null>;
  solveWithParameters(parameters: { firstSolutionStrategy?: number; solutionLimit?: number }): Promise<RoutingAssignmentLike | null>;
  solveFromAssignmentWithParameters(assignment: RoutingAssignmentLike, parameters: { firstSolutionStrategy?: number; solutionLimit?: number }): Promise<RoutingAssignmentLike | null>;
  readAssignmentFromRoutes(routes: number[][], ignoreInactiveIndices: boolean): RoutingAssignmentLike;
  closeModelWithParameters(parameters: { firstSolutionStrategy?: number; solutionLimit?: number }): void;
  getNumberOfDecisionsInFirstSolution(parameters: { firstSolutionStrategy?: number; solutionLimit?: number }): number;
  getNumberOfRejectsInFirstSolution(parameters: { firstSolutionStrategy?: number; solutionLimit?: number }): number;
  getAutomaticFirstSolutionStrategy(): number;
  addAtSolutionCallback(callback: (() => void) | { __call__(): void }): void;
  costVar(): { max(): number };
  addDimension(transitIndex: number, slackMax: number, capacity: number, fixStartCumulToZero: boolean, name: string): boolean;
  addDimensionWithVehicleCapacity(transitIndex: number, slackMax: number, capacities: number[], fixStartCumulToZero: boolean, name: string): boolean;
  addDimensionWithVehicleTransits(transitIndices: number[], slackMax: number, capacity: number, fixStartCumulToZero: boolean, name: string): boolean;
  addConstantDimension(value: number, capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean];
  addVectorDimension(values: number[], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean];
  addMatrixDimension(matrix: number[][], capacity: number, fixStartCumulToZero: boolean, name: string): [number, boolean];
  addDisjunction(indices: number[], penalty?: number): number;
  addPickupAndDelivery(pickup: number, delivery: number): void;
  getDimensionOrDie(name: string): {
    cumulVar(index: number): unknown;
    hasSoftSpanUpperBounds(): boolean;
    setSoftSpanUpperBoundForVehicle(boundCost: { bound: number; cost: number }, vehicle: number): void;
    getSoftSpanUpperBoundForVehicle(vehicle: number): { bound: number; cost: number };
    hasQuadraticCostSoftSpanUpperBounds(): boolean;
    setQuadraticCostSoftSpanUpperBoundForVehicle(boundCost: { bound: number; cost: number }, vehicle: number): void;
    getQuadraticCostSoftSpanUpperBoundForVehicle(vehicle: number): { bound: number; cost: number };
  };
  start(vehicle: number): number;
  end(vehicle: number): number;
  isEnd(index: number): boolean;
  nextVar(index: number): number;
  getArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  status(): number;
  vehicles(): number;
  solver(): {
    parameters(): { tracePropagation: boolean };
    localSearchProfile(): string;
    add(...constraints: unknown[]): void;
  };
};

export type RoutingApi = {
  defaultRoutingSearchParameters(): { firstSolutionStrategy?: number; solutionLimit?: number; localSearchOperators?: Record<string, unknown>; localSearchMetaheuristic?: number };
  defaultRoutingModelParameters(): {
    solverParameters: {
      copyFrom(value: unknown): void;
      tracePropagation: boolean;
      profileLocalSearch: boolean;
    };
  };
  findErrorInRoutingSearchParameters(parameters: unknown): string;
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

export async function runRoutingCases(
  routingApi: RoutingApi,
  options: {
    modes?: readonly ExecutorFixtureMode[];
    onProgress?: (caseName: string, mode: string) => void;
  } = {},
): Promise<RoutingCaseResult[]> {
  const results: RoutingCaseResult[] = [];
  const modes = options.modes ?? executorFixtureModes;
  if (modes.includes('server')) await assertServerExecutorIsRunning();

  for (const mode of modes) {
    setRoutingMode(mode);
    for (const routingCase of routingContractCases) {
      options.onProgress?.(routingCase.name, mode);
      const message = await routingCase.run(routingApi as never);
      assert(!message.startsWith('TODO:'), message);
      assert(message.endsWith('PASS'), `${routingCase.name} (${mode}) failed: ${message}`);
      results.push({
        id: routingCase.id,
        name: `${routingCase.name} (${mode})`,
        solver: routingCase.solver,
        source: routingCase.source,
        upstream: routingCase.upstream,
        tags: routingCase.tags,
        mode,
        ok: true,
        objective: 0,
        route: [],
        routeDistance: 0,
      });
    }
  }
  return results;
}
