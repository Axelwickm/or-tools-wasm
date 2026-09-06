type RoutingApi = {
  defaultRoutingSearchParameters(): { firstSolutionStrategy?: number };
  FirstSolutionStrategy?: {
    FIRST_UNBOUND_MIN_VALUE?: number;
  };
  RoutingIndexManager: new (...args: unknown[]) => RoutingIndexManagerLike;
  RoutingModel: new (manager: RoutingIndexManagerLike) => RoutingModelLike;
};

type RoutingIndexManagerLike = {
  indexToNode(index: number): number;
  getNumberOfIndices(): number;
};

type RoutingAssignmentLike = {
  objectiveValue(): bigint;
  value(index: number): number;
};

type RoutingModelLike = {
  registerTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  registerTransitMatrix(matrix: number[][]): number;
  registerUnaryTransitCallback(callback: (fromIndex: number) => number): number;
  registerUnaryTransitVector(values: number[]): number;
  setArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  solve(options?: unknown): Promise<RoutingAssignmentLike | null>;
  solveWithParameters(
    parameters?: { firstSolutionStrategy?: number },
    options?: unknown,
  ): Promise<RoutingAssignmentLike | null>;
  start(vehicle: number): number;
  isEnd(index: number): boolean;
  nextVar(index: number): number;
  getArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): bigint;
  status(): number;
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
  assert(value === expected || value === BigInt(expected), `${message}: expected ${expected}, got ${String(value)}`);
}

function extractRoute(
  manager: RoutingIndexManagerLike,
  routing: RoutingModelLike,
  assignment: RoutingAssignmentLike,
  vehicle: number,
): number[] {
  const route: number[] = [];
  let index = routing.start(vehicle);
  while (!routing.isEnd(index)) {
    const next = assignment.value(routing.nextVar(index));
    route.push(manager.indexToNode(next));
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
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const matrix = [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]];

      const transitIdx = routing.registerTransitMatrix(matrix);
      assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
      assertNumber(assignment?.objectiveValue(), 15, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testUnaryTransitCallback',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testUnaryTransitCallback matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testUnaryTransitCallback';
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const unaryDistance = (fromIndex: number) => manager.indexToNode(fromIndex);

      const transitIdx = routing.registerUnaryTransitCallback(unaryDistance);
      assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
      assertNumber(assignment?.objectiveValue(), 10, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testUnaryTransitLambda',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testUnaryTransitLambda matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testUnaryTransitLambda';
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const unaryLambda = (_fromIndex: number) => 1;

      const transitIdx = routing.registerUnaryTransitCallback(unaryLambda);
      assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
      assertNumber(assignment?.objectiveValue(), 5, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testUnaryTransitVector',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testUnaryTransitVector matches upstream callback index, status, solve, and objective assertions.
      const caseName = 'TestPyWrapRoutingModel.testUnaryTransitVector';
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const vector = Array.from({ length: 10 }, (_, index) => index);

      const transitIdx = routing.registerUnaryTransitVector(vector);
      assert(transitIdx === 1, `${caseName} expected first callback index 1, got ${transitIdx}`);
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solve(routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
      assertNumber(assignment?.objectiveValue(), 45, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testVRP',
    source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testVRP';
      const manager = new (routingApi.RoutingIndexManager as new (...args: unknown[]) => RoutingIndexManagerLike)(
        10,
        2,
        [0, 1],
        [1, 0],
      );
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => {
        const fromNode = manager.indexToNode(fromIndex);
        const toNode = manager.indexToNode(toIndex);
        return fromNode + toNode;
      });
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const parameters = routingApi.defaultRoutingSearchParameters();
      parameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(parameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(assignment?.objectiveValue(), 89, `${caseName} objectiveValue`);

      const route = extractRoute(manager, routing, assignment, 1);
      assertRoute([2, 4, 6, 8, 3, 5, 7, 9, 0], route, caseName);
      assert(
        routing.isEnd(assignment.value(routing.nextVar(routing.start(0)))),
        `${caseName} expected vehicle 0 to be empty`,
      );
      return `${caseName} PASS`;
    },
  },
];
import { routingExecutionOptions } from './execution.ts';
