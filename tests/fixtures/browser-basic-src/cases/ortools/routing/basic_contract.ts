type RoutingIndexManagerLike = {
  numLocations: number;
  numVehicles: number;
  IndexToNode(index: number): number;
  GetNumberOfIndices(): number;
  delete(): void;
};

type RoutingModelLike = {
  RegisterTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  SetArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  SolveWithParameters(parameters: { firstSolutionStrategy?: number }): Promise<RoutingAssignmentLike | null>;
  Start(vehicle: number): number;
  IsEnd(index: number): boolean;
  NextVar(index: number): number;
  GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  delete(): void;
};

type RoutingAssignmentLike = {
  ObjectiveValue(): number;
  Value(index: number): number;
};

type RoutingApi = {
  DefaultRoutingSearchParameters(): { firstSolutionStrategy?: number };
  FirstSolutionStrategy: {
    PATH_CHEAPEST_ARC: number;
    FIRST_UNBOUND_MIN_VALUE: number;
  };
  initRouting(): Promise<void>;
  RoutingIndexManager: new (numLocations: number, numVehicles: number, depot: number) => RoutingIndexManagerLike;
  RoutingModel: new (manager: RoutingIndexManagerLike) => RoutingModelLike;
};

const PYTHON_SOURCE = 'ortools/constraint_solver/python/pywraprouting_test.py';
const EXPECTED_TSP_OBJECTIVE = 90;

export type RoutingApiContractCaseResult = {
  name: string;
  source: string;
  ok: boolean;
  objective: number;
  route?: number[];
  routeDistance?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertArrayEquals(actual: number[], expected: number[], message: string) {
  assert(actual.length === expected.length, `${message}: length mismatch`);
  for (let i = 0; i < actual.length; i++) {
    assert(actual[i] === expected[i], `${message}: index ${i} mismatch`);
  }
}

async function runCase(
  source: string,
  name: string,
  run: () => Promise<Pick<RoutingApiContractCaseResult, 'objective' | 'route' | 'routeDistance'>>,
) {
  try {
    const result = await run();
    return {
      name,
      source,
      ok: true,
      objective: result.objective,
      route: result.route,
      routeDistance: result.routeDistance,
    };
  } catch (error) {
    return {
      name,
      source,
      ok: false,
      objective: NaN,
      route: [],
      routeDistance: NaN,
    };
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

export async function runBasicRoutingApiContractCases(routingApi: RoutingApi) {
  await routingApi.initRouting();

  const cases: RoutingApiContractCaseResult[] = [];

  cases.push(
    await runCase(PYTHON_SOURCE, 'TestPyWrapRoutingIndexManager.testCtor', async () => {
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      try {
        // TODO(user): Python RoutingIndexManager.GetNumberOfNodes() is not exported; using manager.numLocations.
        assert(manager.numLocations === 42, `expected 42 nodes, got ${manager.numLocations}`);
        // TODO(user): Python RoutingIndexManager.GetNumberOfVehicles() is not exported; using manager.numVehicles.
        assert(manager.numVehicles === 3, `expected 3 vehicles, got ${manager.numVehicles}`);
        assert(manager.GetNumberOfIndices() === 42 + 3 * 2 - 1, `expected 47 indices, got ${manager.GetNumberOfIndices()}`);

        // TODO(user): Python RoutingIndexManager.GetStartIndex/GetEndIndex are missing in JS.
        // Cover start index visibility through the routing model API that is available.
        const routing = new routingApi.RoutingModel(manager);
        try {
          for (let v = 0; v < manager.numVehicles; v++) {
            assert(manager.IndexToNode(routing.Start(v)) === 7, `vehicle ${v} start node should be 7`);
            // TODO(user): Python RoutingModel.End() is not exported on the JS routing API.
          }
          return { objective: 0 };
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    }),
  );

  cases.push(
    await runCase(PYTHON_SOURCE, 'TestPyWrapRoutingModel.testCtor', async () => {
      const manager = new routingApi.RoutingIndexManager(42, 3, 7);
      const routing = new routingApi.RoutingModel(manager);
      try {
        for (let v = 0; v < manager.numVehicles; v++) {
          assert(manager.IndexToNode(routing.Start(v)) === 7, `vehicle ${v} start node should be 7`);
          // TODO(user): Python RoutingModel.End() is not exported on the JS routing API.
        }
        return { objective: 0 };
      } finally {
        routing.delete();
        manager.delete();
      }
    }),
  );

  cases.push(
    await runCase(PYTHON_SOURCE, 'TestPyWrapRoutingModel.testTransitCallback', async () => {
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => {
          return distance(manager, fromIndex, toIndex);
        });
        assert(transitIdx === 1, `expected first transit callback index 1, got ${transitIdx}`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        const assignment = await routing.SolveWithParameters(routingApi.DefaultRoutingSearchParameters());
        assert(assignment !== null, 'transit callback test did not find a solution');

        // TODO(user): Python asserts `model.status() === ROUTING_SUCCESS`; status() is not exposed in JS.
        const { routeDistance, route } = inspectRoute(manager, routing, assignment);
        assert(assignment.ObjectiveValue() === 20, `expected objective 20, got ${assignment.ObjectiveValue()}`);
        return { objective: assignment.ObjectiveValue(), route, routeDistance };
      } finally {
        routing.delete();
        manager.delete();
      }
    }),
  );

  cases.push(
    await runCase(PYTHON_SOURCE, 'TestPyWrapRoutingModel.testTransitLambda', async () => {
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback(() => 1);
        assert(transitIdx === 1, `expected first transit callback index 1, got ${transitIdx}`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        const assignment = await routing.SolveWithParameters(routingApi.DefaultRoutingSearchParameters());
        assert(assignment !== null, 'transit lambda test did not find a solution');

        // TODO(user): Python asserts `model.status() === ROUTING_SUCCESS`; status() is not exposed in JS.
        assert(assignment.ObjectiveValue() === 5, `expected objective 5, got ${assignment.ObjectiveValue()}`);
        return { objective: assignment.ObjectiveValue() };
      } finally {
        routing.delete();
        manager.delete();
      }
    }),
  );

  cases.push(
    await runCase(PYTHON_SOURCE, 'TestPyWrapRoutingModel.testTSP', async () => {
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager as never);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => {
          return distance(manager, fromIndex, toIndex);
        });
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = routingApi.FirstSolutionStrategy.FIRST_UNBOUND_MIN_VALUE;
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment !== null, 'TSP test did not find a solution');

        // TODO(user): Python checks `model.status() === ROUTING_SUCCESS`; status() is not exposed in JS.
        const { route, routeDistance } = inspectRoute(manager, routing, assignment);
        assertArrayEquals(route, [1, 2, 3, 4, 5, 6, 7, 8, 9, 0], 'expected TSP visit order');
        assert(assignment.ObjectiveValue() === EXPECTED_TSP_OBJECTIVE, `expected objective ${EXPECTED_TSP_OBJECTIVE}, got ${assignment.ObjectiveValue()}`);
        return { objective: assignment.ObjectiveValue(), routeDistance, route };
      } finally {
        routing.delete();
        manager.delete();
      }
    }),
  );

  return cases;
}
