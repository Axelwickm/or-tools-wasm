type RoutingApi = {
  DefaultRoutingSearchParameters(): { firstSolutionStrategy?: number };
  FirstSolutionStrategy?: {
    FIRST_UNBOUND_MIN_VALUE?: number;
  };
  initRouting(): Promise<void>;
  RoutingIndexManager: new (...args: unknown[]) => RoutingIndexManagerLike;
  RoutingModel: new (manager: RoutingIndexManagerLike) => RoutingModelLike;
};

type RoutingIndexManagerLike = {
  IndexToNode(index: number): number;
  GetNumberOfIndices(): number;
  delete(): void;
};

type RoutingAssignmentLike = {
  ObjectiveValue(): number;
  Value(index: number): number;
};

type RoutingModelLike = {
  RegisterTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  RegisterTransitMatrix(matrix: number[][]): number;
  RegisterUnaryTransitCallback(callback: (fromIndex: number) => number): number;
  RegisterUnaryTransitVector(values: number[]): number;
  SetArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  Solve(): Promise<RoutingAssignmentLike | null>;
  SolveWithParameters(parameters?: { firstSolutionStrategy?: number }): Promise<RoutingAssignmentLike | null>;
  Start(vehicle: number): number;
  IsEnd(index: number): boolean;
  NextVar(index: number): number;
  GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  status(): number;
  delete(): void;
};

type RoutingCase = {
  name: string;
  source: string;
  run(routingApi: RoutingApi): Promise<string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(value: unknown, expected: number, message: string) {
  assert(typeof value === 'number', `${message}: expected a numeric value`);
  assert(value === expected, `${message}: expected ${expected}, got ${value}`);
}

function extractRoute(
  manager: RoutingIndexManagerLike,
  routing: RoutingModelLike,
  assignment: RoutingAssignmentLike,
  vehicle: number,
): number[] {
  const route: number[] = [];
  let index = routing.Start(vehicle);
  while (!routing.IsEnd(index)) {
    const next = assignment.Value(routing.NextVar(index));
    route.push(manager.IndexToNode(next));
    index = next;
  }
  return route;
}

function assertRoute(expected: number[], actual: number[], caseName: string) {
  const expectedText = expected.join(',');
  const actualText = actual.join(',');
  assert(expectedText === actualText, `${caseName}: expected route ${expectedText}, got ${actualText}`);
}

function firstUnboundStrategy(api: RoutingApi): number {
  return api.FirstSolutionStrategy?.FIRST_UNBOUND_MIN_VALUE ?? 12;
}

const ROUTING_NOT_SOLVED = 0;
const ROUTING_SUCCESS = 1;

export const transitContractCases: RoutingCase[] = [
  {
    name: 'TestPyWrapRoutingModel.testTransitMatrix',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testTransitMatrix matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testTransitMatrix';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);

      try {
        const matrix = [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]];

        const transitIdx = routing.RegisterTransitMatrix(matrix);
        assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
        assertNumber(assignment?.ObjectiveValue(), 15, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testUnaryTransitCallback',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testUnaryTransitCallback matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testUnaryTransitCallback';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);

      try {
        const unaryDistance = (fromIndex: number) => manager.IndexToNode(fromIndex);

        const transitIdx = routing.RegisterUnaryTransitCallback(unaryDistance);
        assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
        assertNumber(assignment?.ObjectiveValue(), 10, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testUnaryTransitLambda',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testUnaryTransitLambda matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testUnaryTransitLambda';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);

      try {
        const unaryLambda = (_fromIndex: number) => 1;

        const transitIdx = routing.RegisterUnaryTransitCallback(unaryLambda);
        assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
        assertNumber(assignment?.ObjectiveValue(), 5, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testUnaryTransitVector',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testUnaryTransitVector matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testUnaryTransitVector';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);

      try {
        const vector = Array.from({ length: 10 }, (_, index) => index);

        const transitIdx = routing.RegisterUnaryTransitVector(vector);
        assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.Solve();
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
        assertNumber(assignment?.ObjectiveValue(), 45, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testVRP',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testVRP';
      await routingApi.initRouting();
      const manager = new (routingApi.RoutingIndexManager as new (...args: unknown[]) => RoutingIndexManagerLike)(10, 2, [0, 1], [1, 0]);
      const routing = new routingApi.RoutingModel(manager);

      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => {
          const fromNode = manager.IndexToNode(fromIndex);
          const toNode = manager.IndexToNode(toIndex);
          return fromNode + toNode;
        });
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const parameters = routingApi.DefaultRoutingSearchParameters();
        parameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(parameters);
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(assignment?.ObjectiveValue(), 89, `${caseName} objectiveValue`);

        const route = extractRoute(manager, routing, assignment, 1);
        assertRoute([2, 4, 6, 8, 3, 5, 7, 9, 0], route, caseName);
        assert(
          routing.IsEnd(assignment.Value(routing.NextVar(routing.Start(0)))),
          `${caseName} expected vehicle 0 to be empty`,
        );
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
];
