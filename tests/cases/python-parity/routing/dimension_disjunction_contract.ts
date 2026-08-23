type RoutingIndexManagerLike = {
  numVehicles: number;
  IndexToNode(index: number): number;
  NodeToIndex(node: number): number;
  GetNumberOfVehicles(): number;
  GetNumberOfIndices(): number;
  delete(): void;
};

type RoutingDimensionLike = {
  CumulVar?(index: number): unknown;
  Min?(index: unknown): number;
};

type RoutingAssignmentLike = {
  ObjectiveValue(): number;
  Value(index: unknown): number;
  Min?(index: unknown): number;
};

type RoutingModelLike = {
  RegisterTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  RegisterTransitMatrix(matrix: number[][]): number;
  SetArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  SolveWithParameters(parameters: { firstSolutionStrategy?: number }): Promise<RoutingAssignmentLike | null>;
  Start(vehicle: number): number;
  IsEnd(index: number): boolean;
  NextVar(index: number): number;
  GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  status(): number;
  AddDimension?: (transitCallbackIndex: number, slack: number, capacity: number, fixStartCumulToZero: boolean, name: string) => [number, boolean] | number;
  AddDimensionWithVehicleCapacity?: (
    transitCallbackIndex: number,
    slack: number,
    vehicleCapacities: number[],
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  AddDimensionWithVehicleTransits?: (
    transitCallbackIndices: number[] | number,
    slack: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  AddConstantDimension?: (constantValue: number, capacity: number, fixStartCumulToZero: boolean, name: string) => [number, boolean] | number;
  AddVectorDimension?: (values: number[], capacity: number, fixStartCumulToZero: boolean, name: string) => [number, boolean] | number;
  AddMatrixDimension?: (matrix: number[][], capacity: number, fixStartCumulToZero: boolean, name: string) => [number, boolean] | number;
  GetDimensionOrDie?: (name: string) => RoutingDimensionLike | null;
  AddDisjunction?: (disjunction: number[], penalty?: number) => void;
  delete(): void;
};

type RoutingApi = {
  DefaultRoutingSearchParameters(): { firstSolutionStrategy?: number };
  FirstSolutionStrategy?: {
    FIRST_UNBOUND_MIN_VALUE: number;
  };
  initRouting(): Promise<void>;
  RoutingIndexManager: new (numLocations: number, numVehicles: number, depot: number) => RoutingIndexManagerLike;
  RoutingModel: new (manager: RoutingIndexManagerLike) => RoutingModelLike;
};

type RoutingCase = {
  name: string;
  source: string;
  run(routingApi: RoutingApi): Promise<string>;
};

const PYTHON_SOURCE = 'ortools/constraint_solver/python/pywraprouting_test.py';
const ROUTING_NOT_SOLVED = 0;
const ROUTING_SUCCESS = 1;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(value: unknown, expected: number, message: string) {
  assert(typeof value === 'number', `${message}: expected number, got ${String(value)}`);
  assert(value === expected, `${message}: expected ${expected}, got ${value}`);
}

function distance(manager: { IndexToNode(index: number): number }, fromIndex: number, toIndex: number) {
  return manager.IndexToNode(fromIndex) + manager.IndexToNode(toIndex);
}

function firstUnboundStrategy(api: RoutingApi): number {
  return api.FirstSolutionStrategy?.FIRST_UNBOUND_MIN_VALUE ?? 12;
}

function readDimensionValue(assignment: RoutingAssignmentLike, cumulVar: unknown) {
  if (typeof assignment.Min === 'function') {
    return assignment.Min(cumulVar);
  }
  return assignment.Value(cumulVar);
}

function assertCreated(result: [number, boolean] | number | boolean | undefined, caseName: string, methodName: string): void {
  if (Array.isArray(result)) {
    assert(result[1], `${caseName}: ${methodName} should report success`);
    return;
  }
  assert(result === true || typeof result === 'number', `${caseName}: ${methodName} should report success`);
}

function extractDimensionSuccess(result: [number, boolean] | number | undefined): [number, boolean] {
  if (Array.isArray(result)) {
    return result;
  }
  return [typeof result === 'number' ? result : -1, result !== undefined];
}

function inspectTspRoute(
  manager: RoutingIndexManagerLike,
  routing: RoutingModelLike,
  assignment: RoutingAssignmentLike,
) {
  const route: number[] = [];
  let index = routing.Start(0);
  let routeDistance = 0;
  while (!routing.IsEnd(index)) {
    const next = assignment.Value(routing.NextVar(index));
    route.push(manager.IndexToNode(next));
    routeDistance += routing.GetArcCostForVehicle(index, next, 0);
    index = next;
  }
  return { routeDistance, route };
}

function inspectDimensionCumul(
  caseName: string,
  manager: RoutingIndexManagerLike,
  routing: RoutingModelLike,
  assignment: RoutingAssignmentLike,
  dimension: RoutingDimensionLike,
  nextDelta: (fromIndex: number, toIndex: number) => number,
) {
  let node = routing.Start(0);
  let cumul = 0;
  while (!routing.IsEnd(node)) {
    assert(typeof dimension.CumulVar === 'function', `${caseName}: GetDimensionOrDie returned an object without CumulVar`);
    const cumulVar = dimension.CumulVar(node);
    assertNumber(readDimensionValue(assignment, cumulVar), cumul, `${caseName}: cumul mismatch at index ${node}`);
    const next = assignment.Value(routing.NextVar(node));
    cumul += nextDelta(node, next);
    node = next;
  }
}

export const dimensionDisjunctionContractCases: RoutingCase[] = [
  {
    name: 'TestPyWrapRoutingModel.testDimensionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDimensionTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const addDimension = (routing as { AddDimension?: RoutingModelLike['AddDimension'] }).AddDimension;
        // TODO: `AddDimension` is not available in the current TS routing API.
        if (typeof addDimension !== 'function') {
          return `TODO: ${caseName} requires AddDimension support in TS bindings`;
        }
        assertCreated(addDimension.call(routing, transitIdx, 90, 90, true, 'distance'), caseName, 'AddDimension');

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        // TODO: `GetDimensionOrDie` is not available in the current TS routing API.
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const distanceDimension = getDimensionOrDie.call(routing, 'distance');
        assert(distanceDimension, `${caseName}: missing distance dimension`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);

        inspectDimensionCumul(caseName, manager, routing, assignment, distanceDimension, (from, to) => distance(manager, from, to));
        assertNumber(assignment.ObjectiveValue(), 90, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDimensionWithVehicleCapacitiesTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDimensionWithVehicleCapacitiesTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const addDimensionWithVehicleCapacity = (
          routing as { AddDimensionWithVehicleCapacity?: RoutingModelLike['AddDimensionWithVehicleCapacity'] }
        ).AddDimensionWithVehicleCapacity;
        // TODO: `AddDimensionWithVehicleCapacity` is not available in the current TS routing API.
        if (typeof addDimensionWithVehicleCapacity !== 'function') {
          return `TODO: ${caseName} requires AddDimensionWithVehicleCapacity support in TS bindings`;
        }
        assertCreated(
          addDimensionWithVehicleCapacity.call(routing, transitIdx, 90, [90], true, 'distance'),
          caseName,
          'AddDimensionWithVehicleCapacity',
        );

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const distanceDimension = getDimensionOrDie.call(routing, 'distance');
        assert(distanceDimension, `${caseName}: missing distance dimension`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);
        inspectDimensionCumul(caseName, manager, routing, assignment, distanceDimension, (from, to) => distance(manager, from, to));
        assertNumber(assignment.ObjectiveValue(), 90, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const addDimensionWithVehicleTransits = (
          routing as { AddDimensionWithVehicleTransits?: RoutingModelLike['AddDimensionWithVehicleTransits'] }
        ).AddDimensionWithVehicleTransits;
        // TODO: `AddDimensionWithVehicleTransits` is not available in the current TS routing API.
        if (typeof addDimensionWithVehicleTransits !== 'function') {
          return `TODO: ${caseName} requires AddDimensionWithVehicleTransits support in TS bindings`;
        }
        assertCreated(
          addDimensionWithVehicleTransits.call(routing, [transitIdx], 90, 90, true, 'distance'),
          caseName,
          'AddDimensionWithVehicleTransits',
        );

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const distanceDimension = getDimensionOrDie.call(routing, 'distance');
        assert(distanceDimension, `${caseName}: missing distance dimension`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);
        inspectDimensionCumul(caseName, manager, routing, assignment, distanceDimension, (from, to) => distance(manager, from, to));
        assertNumber(assignment.ObjectiveValue(), 90, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP matches upstream per-vehicle transit callbacks and cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 3, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const one = () => 1;
        const two = () => 2;
        const three = () => 3;
        const distanceCallbacks = [
          routing.RegisterTransitCallback(one),
          routing.RegisterTransitCallback(two),
          routing.RegisterTransitCallback(three),
        ];

        const addDimensionWithVehicleTransits = (
          routing as { AddDimensionWithVehicleTransits?: RoutingModelLike['AddDimensionWithVehicleTransits'] }
        ).AddDimensionWithVehicleTransits;
        if (typeof addDimensionWithVehicleTransits !== 'function') {
          return `TODO: ${caseName} requires AddDimensionWithVehicleTransits support in TS bindings`;
        }
        assertCreated(
          addDimensionWithVehicleTransits.call(routing, distanceCallbacks, 90, 90, true, 'distance'),
          caseName,
          'AddDimensionWithVehicleTransits',
        );

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const distanceDimension = getDimensionOrDie.call(routing, 'distance');
        assert(distanceDimension, `${caseName}: missing distance dimension`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);

        for (let vehicle = 0; vehicle < manager.numVehicles; vehicle++) {
          let node = routing.Start(vehicle);
          let cumul = 0;
          while (!routing.IsEnd(node)) {
            assert(typeof distanceDimension.CumulVar === 'function', `${caseName}: GetDimensionOrDie returned an object without CumulVar`);
            const cumulVar = distanceDimension.CumulVar(node);
            assertNumber(
              readDimensionValue(assignment, cumulVar),
              cumul,
              `${caseName}: vehicle ${vehicle} cumul mismatch at index ${node}`,
            );
            const next = assignment.Value(routing.NextVar(node));
            cumul += vehicle + 1;
            node = next;
          }
        }
        assertNumber(assignment.ObjectiveValue(), 90, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testConstantDimensionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testConstantDimensionTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 3, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const addConstantDimension = (routing as { AddConstantDimension?: RoutingModelLike['AddConstantDimension'] }).AddConstantDimension;
        // TODO: `AddConstantDimension` is not available in the current TS routing API.
        if (typeof addConstantDimension !== 'function') {
          return `TODO: ${caseName} requires AddConstantDimension support in TS bindings`;
        }
        const [constantId, addOk] = extractDimensionSuccess(addConstantDimension.call(routing, 1, 100, true, 'count'));
        assert(addOk, `${caseName}: AddConstantDimension should report success`);
        assert(constantId === transitIdx + 1, `${caseName}: expected dimension id ${transitIdx + 1}, got ${constantId}`);

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const countDimension = getDimensionOrDie.call(routing, 'count');
        assert(countDimension, `${caseName}: missing count dimension`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);

        let node = routing.Start(0);
        let count = 0;
        while (!routing.IsEnd(node)) {
          assert(typeof countDimension.CumulVar === 'function', `${caseName}: GetDimensionOrDie returned an object without CumulVar`);
          const cumulVar = countDimension.CumulVar(node);
          assertNumber(readDimensionValue(assignment, cumulVar), count, `${caseName}: count mismatch at index ${node}`);
          count += 1;
          node = assignment.Value(routing.NextVar(node));
        }
        assertNumber(count, 10, `${caseName}: expected all 10 nodes`);
        assertNumber(assignment.ObjectiveValue(), 90, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testVectorDimensionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testVectorDimensionTSP matches upstream id, status, objective, and cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testVectorDimensionTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const values = Array.from({ length: 10 }, (_, index) => index);
        const addVectorDimension = (routing as { AddVectorDimension?: RoutingModelLike['AddVectorDimension'] }).AddVectorDimension;
        // TODO: `AddVectorDimension` is not available in the current TS routing API.
        if (typeof addVectorDimension !== 'function') {
          return `TODO: ${caseName} requires AddVectorDimension support in TS bindings`;
        }
        const [unaryTransitId, addOk] = extractDimensionSuccess(addVectorDimension.call(routing, values, 100, true, 'vector'));
        assert(addOk, `${caseName}: AddVectorDimension should report success`);
        assert(unaryTransitId === transitIdx + 1, `${caseName}: expected unary transit id ${transitIdx + 1}, got ${unaryTransitId}`);

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const vectorDimension = getDimensionOrDie.call(routing, 'vector');
        assert(vectorDimension, `${caseName}: missing vector dimension`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);

        let node = routing.Start(0);
        let cumul = 0;
        while (!routing.IsEnd(node)) {
          assert(typeof vectorDimension.CumulVar === 'function', `${caseName}: GetDimensionOrDie returned an object without CumulVar`);
          const cumulVar = vectorDimension.CumulVar(node);
          assertNumber(readDimensionValue(assignment, cumulVar), cumul, `${caseName}: cumul mismatch at index ${node}`);
          const next = assignment.Value(routing.NextVar(node));
          cumul += values[manager.IndexToNode(node)];
          node = next;
        }

        assertNumber(assignment.ObjectiveValue(), 90, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testMatrixDimensionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testMatrixDimensionTSP matches upstream id, status, objective, and cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testMatrixDimensionTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const cost = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(cost);

        const values = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, () => row));
        const addMatrixDimension = (routing as { AddMatrixDimension?: RoutingModelLike['AddMatrixDimension'] }).AddMatrixDimension;
        // TODO: `AddMatrixDimension` is not available in the current TS routing API.
        if (typeof addMatrixDimension !== 'function') {
          return `TODO: ${caseName} requires AddMatrixDimension support in TS bindings`;
        }
        const [transitId, addOk] = extractDimensionSuccess(addMatrixDimension.call(routing, values, 100, true, 'matrix'));
        assert(addOk, `${caseName}: AddMatrixDimension should report success`);
        assert(transitId === cost + 1, `${caseName}: expected matrix transit id ${cost + 1}, got ${transitId}`);

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const dimension = getDimensionOrDie.call(routing, 'matrix');
        assert(dimension, `${caseName}: missing matrix dimension`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);

        let index = routing.Start(0);
        let cumul = 0;
        while (!routing.IsEnd(index)) {
          assert(typeof dimension.CumulVar === 'function', `${caseName}: GetDimensionOrDie returned an object without CumulVar`);
          const cumulVar = dimension.CumulVar(index);
          assertNumber(readDimensionValue(assignment, cumulVar), cumul, `${caseName}: cumul mismatch at index ${index}`);
          const node = manager.IndexToNode(index);
          cumul += values[node][node];
          index = assignment.Value(routing.NextVar(index));
        }

        assertNumber(assignment.ObjectiveValue(), 20, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testMatrixDimensionVRP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testMatrixDimensionVRP matches upstream matrix registration, id, status, objective, and per-vehicle cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testMatrixDimensionVRP';
      await routingApi.initRouting();
        const manager = new routingApi.RoutingIndexManager(5, 2, 0);
        const routing = new routingApi.RoutingModel(manager);
        try {
        const matrix = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => row + col));
        const transitIdx = routing.RegisterTransitMatrix(matrix);
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const addMatrixDimension = (routing as { AddMatrixDimension?: RoutingModelLike['AddMatrixDimension'] }).AddMatrixDimension;
        if (typeof addMatrixDimension !== 'function') {
          return `TODO: ${caseName} requires AddMatrixDimension support in TS bindings`;
        }
        const [matrixTransitId, addOk] = extractDimensionSuccess(addMatrixDimension.call(routing, matrix, 10, true, 'matrix'));
        assert(addOk, `${caseName}: AddMatrixDimension should report success`);
        assert(matrixTransitId === transitIdx + 1, `${caseName}: expected matrix transit id ${transitIdx + 1}, got ${matrixTransitId}`);

        const getDimensionOrDie = (routing as { GetDimensionOrDie?: RoutingModelLike['GetDimensionOrDie'] }).GetDimensionOrDie;
        if (typeof getDimensionOrDie !== 'function') {
          return `TODO: ${caseName} requires GetDimensionOrDie support in TS bindings`;
        }
        const dimension = getDimensionOrDie.call(routing, 'matrix');
        assert(dimension, `${caseName}: missing matrix dimension`);
        assert(typeof dimension.CumulVar === 'function', `${caseName}: GetDimensionOrDie returned an object without CumulVar`);

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);
        assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
        for (let vehicle = 0; vehicle < manager.GetNumberOfVehicles(); vehicle++) {
          let index = routing.Start(vehicle);
          let cumul = 0;
          while (!routing.IsEnd(index)) {
            const cumulVar = dimension.CumulVar(index);
            assertNumber(readDimensionValue(assignment, cumulVar), cumul, `${caseName}: vehicle ${vehicle} cumul mismatch at ${index}`);
            const previousIndex = index;
            index = assignment.Value(routing.NextVar(index));
            cumul += matrix[manager.IndexToNode(previousIndex)][manager.IndexToNode(index)];
          }
        }
        assertNumber(assignment.ObjectiveValue(), 20, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDisjunctionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDisjunctionTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const addDisjunction = (routing as { AddDisjunction?: RoutingModelLike['AddDisjunction'] }).AddDisjunction;
        // TODO: `AddDisjunction` is not available in the current TS routing API.
        if (typeof addDisjunction !== 'function') {
          return `TODO: ${caseName} requires AddDisjunction support in TS bindings`;
        }
        const disjunctions = [
          [manager.NodeToIndex(1), manager.NodeToIndex(2)],
          [manager.NodeToIndex(3)],
          [manager.NodeToIndex(4)],
          [manager.NodeToIndex(5)],
          [manager.NodeToIndex(6)],
          [manager.NodeToIndex(7)],
          [manager.NodeToIndex(8)],
          [manager.NodeToIndex(9)],
        ];
        for (const disjunction of disjunctions) {
          addDisjunction.call(routing, disjunction);
        }

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);

        let node = routing.Start(0);
        let count = 0;
        while (!routing.IsEnd(node)) {
          count += 1;
          node = assignment.Value(routing.NextVar(node));
        }
        assertNumber(count, 9, `${caseName} expected 9 visited nodes`);
        assertNumber(assignment.ObjectiveValue(), 86, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDisjunctionPenaltyTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDisjunctionPenaltyTSP';
      await routingApi.initRouting();
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      try {
        const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
        routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

        const addDisjunction = (routing as { AddDisjunction?: RoutingModelLike['AddDisjunction'] }).AddDisjunction;
        if (typeof addDisjunction !== 'function') {
          return `TODO: ${caseName} requires AddDisjunction support in TS bindings`;
        }

        const disjunctions: Array<[number[], number]> = [
          [ [manager.NodeToIndex(1), manager.NodeToIndex(2)], 1000 ],
          [ [manager.NodeToIndex(3)], 1000 ],
          [ [manager.NodeToIndex(4)], 1000 ],
          [ [manager.NodeToIndex(5)], 1000 ],
          [ [manager.NodeToIndex(6)], 1000 ],
          [ [manager.NodeToIndex(7)], 1000 ],
          [ [manager.NodeToIndex(8)], 1000 ],
          [ [manager.NodeToIndex(9)], 0 ],
        ];
        for (const [disjunction, penalty] of disjunctions) {
          addDisjunction.call(routing, disjunction, penalty);
        }

        const searchParameters = routingApi.DefaultRoutingSearchParameters();
        searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
        const assignment = await routing.SolveWithParameters(searchParameters);
        assert(assignment, `${caseName} did not return a solution`);

        let node = routing.Start(0);
        let count = 0;
        while (!routing.IsEnd(node)) {
          count += 1;
          node = assignment.Value(routing.NextVar(node));
        }
        assertNumber(count, 8, `${caseName} expected 8 visited nodes`);
        assertNumber(assignment.ObjectiveValue(), 68, `${caseName} objectiveValue`);
        return `${caseName} PASS`;
      } finally {
        routing.delete();
        manager.delete();
      }
    },
  },
];
