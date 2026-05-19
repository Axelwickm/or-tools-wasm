type RoutingApi = {
  DefaultRoutingSearchParameters(): { firstSolutionStrategy?: number };
  FirstSolutionStrategy: {
    PATH_CHEAPEST_ARC: number;
    FIRST_UNBOUND_MIN_VALUE: number;
  };
  initRouting(): Promise<void>;
  RoutingIndexManager: new (...args: unknown[]) => RoutingIndexManagerLike;
  RoutingModel: new (manager: RoutingIndexManagerLike) => RoutingModelLike;
};

type RoutingIndexManagerLike = {
  IndexToNode(index: number): number;
  GetNumberOfNodes(): number;
  GetNumberOfVehicles(): number;
  GetNumberOfIndices(): number;
  GetStartIndex(vehicle: number): number;
  GetEndIndex(vehicle: number): number;
  delete(): void;
};

type RoutingModelLike = {
  RegisterTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  SetArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  Solve(): Promise<RoutingAssignmentLike | null>;
  SolveWithParameters(parameters: { firstSolutionStrategy?: number }): Promise<RoutingAssignmentLike | null>;
  Start(vehicle: number): number;
  End(vehicle: number): number;
  IsEnd(index: number): boolean;
  NextVar(index: number): number;
  GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  status(): number;
  delete(): void;
};

type RoutingAssignmentLike = {
  ObjectiveValue(): number;
  Value(index: number): number;
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

function distance(manager: { IndexToNode(index: number): number }, fromIndex: number, toIndex: number) {
  return manager.IndexToNode(fromIndex) + manager.IndexToNode(toIndex);
}

function inspectRoute(
  manager: { IndexToNode(index: number): number },
  routing: {
    Start(vehicle: number): number;
    IsEnd(index: number): boolean;
    NextVar(index: number): number;
    GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  },
  assignment: { Value(index: number): number },
) {
  const route: number[] = [];
  let routeDistance = 0;
  let index = routing.Start(0);
  while (!routing.IsEnd(index)) {
    const nextIndex = assignment.Value(routing.NextVar(index));
    route.push(manager.IndexToNode(nextIndex));
    routeDistance += routing.GetArcCostForVehicle(index, nextIndex, 0);
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
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      try {
        assertNumber(manager.GetNumberOfNodes(), 42, `${caseName} number of nodes`);
        assertNumber(manager.GetNumberOfVehicles(), 3, `${caseName} number of vehicles`);
        assertNumber(manager.GetNumberOfIndices(), 42 + 3 * 2 - 1, `${caseName} number of indices`);
        for (let vehicle = 0; vehicle < manager.GetNumberOfVehicles(); vehicle++) {
          assertNumber(manager.IndexToNode(manager.GetStartIndex(vehicle)), 7, `${caseName} vehicle ${vehicle} start node`);
          assertNumber(manager.IndexToNode(manager.GetEndIndex(vehicle)), 7, `${caseName} vehicle ${vehicle} end node`);
        }
        return `${caseName} PASS`;
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingIndexManager.testCtorMultiDepotSame',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingIndexManager.testCtorMultiDepotSame matches upstream same-depot constructor assertions.
      const caseName = 'TestPyWrapRoutingIndexManager.testCtorMultiDepotSame';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(42, 3, [0, 0, 0], [0, 0, 0]);
      try {
        assertNumber(manager.GetNumberOfNodes(), 42, `${caseName} number of nodes`);
        assertNumber(manager.GetNumberOfVehicles(), 3, `${caseName} number of vehicles`);
        assertNumber(manager.GetNumberOfIndices(), 42 + 3 * 2 - 1, `${caseName} number of indices`);
        for (let vehicle = 0; vehicle < manager.GetNumberOfVehicles(); vehicle++) {
          assertNumber(manager.IndexToNode(manager.GetStartIndex(vehicle)), 0, `${caseName} vehicle ${vehicle} start node`);
          assertNumber(manager.IndexToNode(manager.GetEndIndex(vehicle)), 0, `${caseName} vehicle ${vehicle} end node`);
        }
        return `${caseName} PASS`;
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff matches upstream all-different multi-depot constructor assertions.
      const caseName = 'TestPyWrapRoutingIndexManager.testCtorMultiDepotAllDiff';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(42, 3, [1, 2, 3], [4, 5, 6]);
      try {
        assertNumber(manager.GetNumberOfNodes(), 42, `${caseName} number of nodes`);
        assertNumber(manager.GetNumberOfVehicles(), 3, `${caseName} number of vehicles`);
        assertNumber(manager.GetNumberOfIndices(), 42, `${caseName} number of indices`);
        for (let vehicle = 0; vehicle < manager.GetNumberOfVehicles(); vehicle++) {
          assertNumber(manager.IndexToNode(manager.GetStartIndex(vehicle)), vehicle + 1, `${caseName} vehicle ${vehicle} start node`);
          assertNumber(manager.IndexToNode(manager.GetEndIndex(vehicle)), vehicle + 4, `${caseName} vehicle ${vehicle} end node`);
        }
        return `${caseName} PASS`;
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testCtor',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testCtor matches upstream model start/end assertions.
      const caseName = 'TestPyWrapRoutingModel.testCtor';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      const routing = new routingApi.RoutingModel(manager);
      try {
        for (let vehicle = 0; vehicle < manager.GetNumberOfVehicles(); vehicle++) {
          assertNumber(manager.IndexToNode(routing.Start(vehicle)), 7, `${caseName} vehicle ${vehicle} start node`);
          assertNumber(manager.IndexToNode(routing.End(vehicle)), 7, `${caseName} vehicle ${vehicle} end node`);
        }
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testSolve',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testSolve matches upstream status, Solve, assignment truthiness, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testSolve';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      const routing = new routingApi.RoutingModel(manager);
      try {
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment !== null, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_OPTIMAL, `${caseName} final status`);
        assertNumber(assignment.ObjectiveValue(), 0, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testSolveMultiDepot',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testSolveMultiDepot matches upstream multi-depot status, Solve, assignment truthiness, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testSolveMultiDepot';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(42, 3, [1, 2, 3], [4, 5, 6]);
      const routing = new routingApi.RoutingModel(manager);
      try {
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment !== null, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_OPTIMAL, `${caseName} final status`);
        assertNumber(assignment.ObjectiveValue(), 0, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testTransitCallback',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testTransitCallback matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testTransitCallback';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        assertNumber(transitIdx, 1, `${caseName} first transit callback index`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment !== null, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
        assertNumber(assignment.ObjectiveValue(), 20, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testTransitLambda',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testTransitLambda matches upstream callback index, status, solve, assignment, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testTransitLambda';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback(() => 1);
        assertNumber(transitIdx, 1, `${caseName} first transit callback index`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment !== null, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
        assertNumber(assignment.ObjectiveValue(), 5, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testTSP matches upstream strategy, status, solution, route, distance, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = routingApi.FirstSolutionStrategy.FIRST_UNBOUND_MIN_VALUE;
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment !== null, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);

        const { route, routeDistance } = inspectRoute(manager, routing, assignment);
        assertArrayEquals(route, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0], `${caseName} route`);
        assertNumber(routeDistance, EXPECTED_TSP_OBJECTIVE, `${caseName} route distance`);
        assertNumber(assignment.ObjectiveValue(), EXPECTED_TSP_OBJECTIVE, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
];
