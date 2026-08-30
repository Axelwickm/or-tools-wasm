type RoutingApi = {
  defaultRoutingSearchParameters(): { firstSolutionStrategy?: number };
  FirstSolutionStrategy: {
    PATH_CHEAPEST_ARC: number;
    FIRST_UNBOUND_MIN_VALUE: number;
  };
  RoutingIndexManager: new (...args: unknown[]) => RoutingIndexManagerLike;
  RoutingModel: new (manager: RoutingIndexManagerLike) => RoutingModelLike;
};

type RoutingIndexManagerLike = {
  indexToNode(index: number): number;
  getNumberOfNodes(): number;
  getNumberOfVehicles(): number;
  getNumberOfIndices(): number;
  getStartIndex(vehicle: number): number;
  getEndIndex(vehicle: number): number;
};

type RoutingModelLike = {
  registerTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  setArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  solve(options?: unknown): Promise<RoutingAssignmentLike | null>;
  solveWithParameters(
    parameters: { firstSolutionStrategy?: number },
    options?: unknown,
  ): Promise<RoutingAssignmentLike | null>;
  start(vehicle: number): number;
  end(vehicle: number): number;
  isEnd(index: number): boolean;
  nextVar(index: number): number;
  getArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  status(): number;
};

type RoutingAssignmentLike = {
  objectiveValue(): number;
  value(index: number): number;
};

type RoutingCase = {
  name: string;
  source: string;
  run(routingApi: RoutingApi): Promise<string>;
};

const PYTHON_SOURCE = 'ortools/constraint_solver/python/pywraprouting_test.py';
const EXPECTED_TSP_OBJECTIVE = 90;
const ROUTING_NOT_SOLVED = 0;
const ROUTING_SUCCESS = 1;
const ROUTING_OPTIMAL = 7;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(value: unknown, expected: number, message: string) {
  assert(typeof value === 'number', `${message}: expected a numeric value`);
  assert(value === expected, `${message}: expected ${expected}, got ${value}`);
}

function assertArrayEquals(actual: number[], expected: number[], message: string) {
  assert(actual.length === expected.length, `${message}: length mismatch`);
  for (let i = 0; i < actual.length; i++) {
    assert(actual[i] === expected[i], `${message}: index ${i} mismatch`);
  }
}

function distance(manager: { indexToNode(index: number): number }, fromIndex: number, toIndex: number) {
  return manager.indexToNode(fromIndex) + manager.indexToNode(toIndex);
}

function inspectRoute(
  manager: { indexToNode(index: number): number },
  routing: {
    start(vehicle: number): number;
    isEnd(index: number): boolean;
    nextVar(index: number): number;
    getArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  },
  assignment: { value(index: number): number },
) {
  const route: number[] = [];
  let routeDistance = 0;
  let index = routing.start(0);
  while (!routing.isEnd(index)) {
    const nextIndex = assignment.value(routing.nextVar(index));
    route.push(manager.indexToNode(nextIndex));
    routeDistance += routing.getArcCostForVehicle(index, nextIndex, 0);
    index = nextIndex;
  }
  return { route, routeDistance };
}

export const basicContractCases: RoutingCase[] = [
  {
    name: 'TestPyWrapRoutingIndexManager.testCtor',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingIndexManager.testCtor matches upstream node, vehicle, index, start, and end assertions.
      const caseName = 'TestPyWrapRoutingIndexManager.testCtor';
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      assertNumber(manager.getNumberOfNodes(), 42, `${caseName} number of nodes`);
      assertNumber(manager.getNumberOfVehicles(), 3, `${caseName} number of vehicles`);
      assertNumber(manager.getNumberOfIndices(), 42 + 3 * 2 - 1, `${caseName} number of indices`);
      for (let vehicle = 0; vehicle < manager.getNumberOfVehicles(); vehicle++) {
        assertNumber(
          manager.indexToNode(manager.getStartIndex(vehicle)),
          7,
          `${caseName} vehicle ${vehicle} start node`,
        );
        assertNumber(manager.indexToNode(manager.getEndIndex(vehicle)), 7, `${caseName} vehicle ${vehicle} end node`);
      }
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingIndexManager.testCtorMultiDepotSame',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingIndexManager.testCtorMultiDepotSame matches upstream same-depot constructor assertions.
      const caseName = 'TestPyWrapRoutingIndexManager.testCtorMultiDepotSame';
      const manager = new routingApi.RoutingIndexManager(42, 3, [0, 0, 0], [0, 0, 0]);
      assertNumber(manager.getNumberOfNodes(), 42, `${caseName} number of nodes`);
      assertNumber(manager.getNumberOfVehicles(), 3, `${caseName} number of vehicles`);
      assertNumber(manager.getNumberOfIndices(), 42 + 3 * 2 - 1, `${caseName} number of indices`);
      for (let vehicle = 0; vehicle < manager.getNumberOfVehicles(); vehicle++) {
        assertNumber(
          manager.indexToNode(manager.getStartIndex(vehicle)),
          0,
          `${caseName} vehicle ${vehicle} start node`,
        );
        assertNumber(manager.indexToNode(manager.getEndIndex(vehicle)), 0, `${caseName} vehicle ${vehicle} end node`);
      }
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff matches upstream all-different multi-depot constructor assertions.
      const caseName = 'TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff';
      const manager = new routingApi.RoutingIndexManager(42, 3, [1, 2, 3], [4, 5, 6]);
      assertNumber(manager.getNumberOfNodes(), 42, `${caseName} number of nodes`);
      assertNumber(manager.getNumberOfVehicles(), 3, `${caseName} number of vehicles`);
      assertNumber(manager.getNumberOfIndices(), 42, `${caseName} number of indices`);
      for (let vehicle = 0; vehicle < manager.getNumberOfVehicles(); vehicle++) {
        assertNumber(
          manager.indexToNode(manager.getStartIndex(vehicle)),
          vehicle + 1,
          `${caseName} vehicle ${vehicle} start node`,
        );
        assertNumber(
          manager.indexToNode(manager.getEndIndex(vehicle)),
          vehicle + 4,
          `${caseName} vehicle ${vehicle} end node`,
        );
      }
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testCtor',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testCtor matches upstream model start/end assertions.
      const caseName = 'TestPyWrapRoutingModel.testCtor';
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      const routing = new routingApi.RoutingModel(manager);
      for (let vehicle = 0; vehicle < manager.getNumberOfVehicles(); vehicle++) {
        assertNumber(manager.indexToNode(routing.start(vehicle)), 7, `${caseName} vehicle ${vehicle} start node`);
        assertNumber(manager.indexToNode(routing.end(vehicle)), 7, `${caseName} vehicle ${vehicle} end node`);
      }
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testSolve',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testSolve matches upstream status, Solve, assignment truthiness, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testSolve';
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      const routing = new routingApi.RoutingModel(manager);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment !== null, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_OPTIMAL, `${caseName} final status`);
      assertNumber(assignment.objectiveValue(), 0, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testSolveMultiDepot',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testSolveMultiDepot matches upstream multi-depot status, Solve, assignment truthiness, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testSolveMultiDepot';
      const manager = new routingApi.RoutingIndexManager(42, 3, [1, 2, 3], [4, 5, 6]);
      const routing = new routingApi.RoutingModel(manager);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment !== null, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_OPTIMAL, `${caseName} final status`);
      assertNumber(assignment.objectiveValue(), 0, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testTransitCallback',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testTransitCallback matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testTransitCallback';
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      assertNumber(transitIdx, 1, `${caseName} first transit callback index`);
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment !== null, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
      assertNumber(assignment.objectiveValue(), 20, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testTransitLambda',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testTransitLambda matches upstream callback index, status, solve, assignment, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testTransitLambda';
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback(() => 1);
      assertNumber(transitIdx, 1, `${caseName} first transit callback index`);
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment !== null, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
      assertNumber(assignment.objectiveValue(), 5, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testTSP matches upstream strategy, status, solution, route, distance, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testTSP';
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = routingApi.FirstSolutionStrategy.FIRST_UNBOUND_MIN_VALUE;
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment !== null, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);

      const { route, routeDistance } = inspectRoute(manager, routing, assignment);
      assertArrayEquals(route, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0], `${caseName} route`);
      assertNumber(routeDistance, EXPECTED_TSP_OBJECTIVE, `${caseName} route distance`);
      assertNumber(assignment.objectiveValue(), EXPECTED_TSP_OBJECTIVE, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
];
import { routingExecutionOptions } from './execution.ts';
