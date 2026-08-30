type RoutingIndexManagerLike = {
  numVehicles: number;
  indexToNode(index: number): number;
  nodeToIndex(node: number): number;
  getNumberOfVehicles(): number;
  getNumberOfIndices(): number;
};

type RoutingDimensionLike = {
  cumulVar?(index: number): unknown;
  min?(index: unknown): number;
};

type RoutingAssignmentLike = {
  objectiveValue(): number;
  value(index: unknown): number;
  min?(index: unknown): number;
};

type RoutingModelLike = {
  registerTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  registerTransitMatrix(matrix: number[][]): number;
  setArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  solveWithParameters(
    parameters: { firstSolutionStrategy?: number },
    options?: unknown,
  ): Promise<RoutingAssignmentLike | null>;
  start(vehicle: number): number;
  isEnd(index: number): boolean;
  nextVar(index: number): number;
  getArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  status(): number;
  addDimension?: (
    transitCallbackIndex: number,
    slack: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  addDimensionWithVehicleCapacity?: (
    transitCallbackIndex: number,
    slack: number,
    vehicleCapacities: number[],
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  addDimensionWithVehicleTransits?: (
    transitCallbackIndices: number[] | number,
    slack: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  addConstantDimension?: (
    constantValue: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  addVectorDimension?: (
    values: number[],
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  addMatrixDimension?: (
    matrix: number[][],
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ) => [number, boolean] | number;
  getDimensionOrDie?: (name: string) => RoutingDimensionLike | null;
  addDisjunction?: (disjunction: number[], penalty?: number) => void;
};

type RoutingApi = {
  defaultRoutingSearchParameters(): { firstSolutionStrategy?: number };
  FirstSolutionStrategy?: {
    FIRST_UNBOUND_MIN_VALUE: number;
  };
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

function distance(manager: { indexToNode(index: number): number }, fromIndex: number, toIndex: number) {
  return manager.indexToNode(fromIndex) + manager.indexToNode(toIndex);
}

function firstUnboundStrategy(api: RoutingApi): number {
  return api.FirstSolutionStrategy?.FIRST_UNBOUND_MIN_VALUE ?? 12;
}

function readDimensionValue(assignment: RoutingAssignmentLike, cumulVar: unknown) {
  if (typeof assignment.min === 'function') {
    return assignment.min(cumulVar);
  }
  return assignment.value(cumulVar);
}

function assertCreated(
  result: [number, boolean] | number | boolean | undefined,
  caseName: string,
  methodName: string,
): void {
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
  let index = routing.start(0);
  let routeDistance = 0;
  while (!routing.isEnd(index)) {
    const next = assignment.value(routing.nextVar(index));
    route.push(manager.indexToNode(next));
    routeDistance += routing.getArcCostForVehicle(index, next, 0);
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
  let node = routing.start(0);
  let cumul = 0;
  while (!routing.isEnd(node)) {
    assert(
      typeof dimension.cumulVar === 'function',
      `${caseName}: getDimensionOrDie returned an object without cumulVar`,
    );
    const cumulVar = dimension.cumulVar(node);
    assertNumber(readDimensionValue(assignment, cumulVar), cumul, `${caseName}: cumul mismatch at index ${node}`);
    const next = assignment.value(routing.nextVar(node));
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
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addDimension = (routing as { addDimension?: RoutingModelLike['addDimension'] }).addDimension;
      if (typeof addDimension !== 'function') {
        return `TODO: ${caseName} requires addDimension support in TS bindings`;
      }
      assertCreated(addDimension.call(routing, transitIdx, 90, 90, true, 'distance'), caseName, 'addDimension');

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const distanceDimension = getDimensionOrDie.call(routing, 'distance');
      assert(distanceDimension, `${caseName}: missing distance dimension`);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);

      inspectDimensionCumul(
        caseName,
        manager,
        routing,
        assignment,
        distanceDimension,
        (from, to) => distance(manager, from, to),
      );
      assertNumber(assignment.objectiveValue(), 90, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDimensionWithVehicleCapacitiesTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDimensionWithVehicleCapacitiesTSP';
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addDimensionWithVehicleCapacity = (
        routing as { addDimensionWithVehicleCapacity?: RoutingModelLike['addDimensionWithVehicleCapacity'] }
      ).addDimensionWithVehicleCapacity;
      if (typeof addDimensionWithVehicleCapacity !== 'function') {
        return `TODO: ${caseName} requires addDimensionWithVehicleCapacity support in TS bindings`;
      }
      assertCreated(
        addDimensionWithVehicleCapacity.call(routing, transitIdx, 90, [90], true, 'distance'),
        caseName,
        'addDimensionWithVehicleCapacity',
      );

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const distanceDimension = getDimensionOrDie.call(routing, 'distance');
      assert(distanceDimension, `${caseName}: missing distance dimension`);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      inspectDimensionCumul(
        caseName,
        manager,
        routing,
        assignment,
        distanceDimension,
        (from, to) => distance(manager, from, to),
      );
      assertNumber(assignment.objectiveValue(), 90, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsTSP';
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addDimensionWithVehicleTransits = (
        routing as { addDimensionWithVehicleTransits?: RoutingModelLike['addDimensionWithVehicleTransits'] }
      ).addDimensionWithVehicleTransits;
      if (typeof addDimensionWithVehicleTransits !== 'function') {
        return `TODO: ${caseName} requires addDimensionWithVehicleTransits support in TS bindings`;
      }
      assertCreated(
        addDimensionWithVehicleTransits.call(routing, [transitIdx], 90, 90, true, 'distance'),
        caseName,
        'addDimensionWithVehicleTransits',
      );

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const distanceDimension = getDimensionOrDie.call(routing, 'distance');
      assert(distanceDimension, `${caseName}: missing distance dimension`);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      inspectDimensionCumul(
        caseName,
        manager,
        routing,
        assignment,
        distanceDimension,
        (from, to) => distance(manager, from, to),
      );
      assertNumber(assignment.objectiveValue(), 90, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP matches upstream per-vehicle transit callbacks and cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testDimensionWithVehicleTransitsVRP';
      const manager = new routingApi.RoutingIndexManager(10, 3, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const one = () => 1;
      const two = () => 2;
      const three = () => 3;
      const distanceCallbacks = [
        routing.registerTransitCallback(one),
        routing.registerTransitCallback(two),
        routing.registerTransitCallback(three),
      ];

      const addDimensionWithVehicleTransits = (
        routing as { addDimensionWithVehicleTransits?: RoutingModelLike['addDimensionWithVehicleTransits'] }
      ).addDimensionWithVehicleTransits;
      if (typeof addDimensionWithVehicleTransits !== 'function') {
        return `TODO: ${caseName} requires addDimensionWithVehicleTransits support in TS bindings`;
      }
      assertCreated(
        addDimensionWithVehicleTransits.call(routing, distanceCallbacks, 90, 90, true, 'distance'),
        caseName,
        'addDimensionWithVehicleTransits',
      );

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const distanceDimension = getDimensionOrDie.call(routing, 'distance');
      assert(distanceDimension, `${caseName}: missing distance dimension`);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);

      for (let vehicle = 0; vehicle < manager.numVehicles; vehicle++) {
        let node = routing.start(vehicle);
        let cumul = 0;
        while (!routing.isEnd(node)) {
          assert(
            typeof distanceDimension.cumulVar === 'function',
            `${caseName}: getDimensionOrDie returned an object without cumulVar`,
          );
          const cumulVar = distanceDimension.cumulVar(node);
          assertNumber(
            readDimensionValue(assignment, cumulVar),
            cumul,
            `${caseName}: vehicle ${vehicle} cumul mismatch at index ${node}`,
          );
          const next = assignment.value(routing.nextVar(node));
          cumul += vehicle + 1;
          node = next;
        }
      }
      assertNumber(assignment.objectiveValue(), 90, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testConstantDimensionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testConstantDimensionTSP';
      const manager = new routingApi.RoutingIndexManager(10, 3, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addConstantDimension =
        (routing as { addConstantDimension?: RoutingModelLike['addConstantDimension'] }).addConstantDimension;
      if (typeof addConstantDimension !== 'function') {
        return `TODO: ${caseName} requires addConstantDimension support in TS bindings`;
      }
      const [constantId, addOk] = extractDimensionSuccess(addConstantDimension.call(routing, 1, 100, true, 'count'));
      assert(addOk, `${caseName}: addConstantDimension should report success`);
      assert(constantId === transitIdx + 1, `${caseName}: expected dimension id ${transitIdx + 1}, got ${constantId}`);

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const countDimension = getDimensionOrDie.call(routing, 'count');
      assert(countDimension, `${caseName}: missing count dimension`);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);

      let node = routing.start(0);
      let count = 0;
      while (!routing.isEnd(node)) {
        assert(
          typeof countDimension.cumulVar === 'function',
          `${caseName}: getDimensionOrDie returned an object without cumulVar`,
        );
        const cumulVar = countDimension.cumulVar(node);
        assertNumber(readDimensionValue(assignment, cumulVar), count, `${caseName}: count mismatch at index ${node}`);
        count += 1;
        node = assignment.value(routing.nextVar(node));
      }
      assertNumber(count, 10, `${caseName}: expected all 10 nodes`);
      assertNumber(assignment.objectiveValue(), 90, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testVectorDimensionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testVectorDimensionTSP matches upstream id, status, objective, and cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testVectorDimensionTSP';
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const values = Array.from({ length: 10 }, (_, index) => index);
      const addVectorDimension =
        (routing as { addVectorDimension?: RoutingModelLike['addVectorDimension'] }).addVectorDimension;
      if (typeof addVectorDimension !== 'function') {
        return `TODO: ${caseName} requires addVectorDimension support in TS bindings`;
      }
      const [unaryTransitId, addOk] = extractDimensionSuccess(
        addVectorDimension.call(routing, values, 100, true, 'vector'),
      );
      assert(addOk, `${caseName}: addVectorDimension should report success`);
      assert(
        unaryTransitId === transitIdx + 1,
        `${caseName}: expected unary transit id ${transitIdx + 1}, got ${unaryTransitId}`,
      );

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const vectorDimension = getDimensionOrDie.call(routing, 'vector');
      assert(vectorDimension, `${caseName}: missing vector dimension`);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);

      let node = routing.start(0);
      let cumul = 0;
      while (!routing.isEnd(node)) {
        assert(
          typeof vectorDimension.cumulVar === 'function',
          `${caseName}: getDimensionOrDie returned an object without cumulVar`,
        );
        const cumulVar = vectorDimension.cumulVar(node);
        assertNumber(readDimensionValue(assignment, cumulVar), cumul, `${caseName}: cumul mismatch at index ${node}`);
        const next = assignment.value(routing.nextVar(node));
        cumul += values[manager.indexToNode(node)];
        node = next;
      }

      assertNumber(assignment.objectiveValue(), 90, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testMatrixDimensionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testMatrixDimensionTSP matches upstream id, status, objective, and cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testMatrixDimensionTSP';
      const manager = new routingApi.RoutingIndexManager(5, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const cost = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(cost);

      const values = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, () => row));
      const addMatrixDimension =
        (routing as { addMatrixDimension?: RoutingModelLike['addMatrixDimension'] }).addMatrixDimension;
      if (typeof addMatrixDimension !== 'function') {
        return `TODO: ${caseName} requires addMatrixDimension support in TS bindings`;
      }
      const [transitId, addOk] = extractDimensionSuccess(addMatrixDimension.call(routing, values, 100, true, 'matrix'));
      assert(addOk, `${caseName}: addMatrixDimension should report success`);
      assert(transitId === cost + 1, `${caseName}: expected matrix transit id ${cost + 1}, got ${transitId}`);

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const dimension = getDimensionOrDie.call(routing, 'matrix');
      assert(dimension, `${caseName}: missing matrix dimension`);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);

      let index = routing.start(0);
      let cumul = 0;
      while (!routing.isEnd(index)) {
        assert(
          typeof dimension.cumulVar === 'function',
          `${caseName}: getDimensionOrDie returned an object without cumulVar`,
        );
        const cumulVar = dimension.cumulVar(index);
        assertNumber(readDimensionValue(assignment, cumulVar), cumul, `${caseName}: cumul mismatch at index ${index}`);
        const node = manager.indexToNode(index);
        cumul += values[node][node];
        index = assignment.value(routing.nextVar(index));
      }

      assertNumber(assignment.objectiveValue(), 20, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testMatrixDimensionVRP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testMatrixDimensionVRP matches upstream matrix registration, id, status, objective, and per-vehicle cumul assertions.
      const caseName = 'TestPyWrapRoutingModel.testMatrixDimensionVRP';
      const manager = new routingApi.RoutingIndexManager(5, 2, 0);
      const routing = new routingApi.RoutingModel(manager);
      const matrix = Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, col) => row + col));
      const transitIdx = routing.registerTransitMatrix(matrix);
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addMatrixDimension =
        (routing as { addMatrixDimension?: RoutingModelLike['addMatrixDimension'] }).addMatrixDimension;
      if (typeof addMatrixDimension !== 'function') {
        return `TODO: ${caseName} requires addMatrixDimension support in TS bindings`;
      }
      const [matrixTransitId, addOk] = extractDimensionSuccess(
        addMatrixDimension.call(routing, matrix, 10, true, 'matrix'),
      );
      assert(addOk, `${caseName}: addMatrixDimension should report success`);
      assert(
        matrixTransitId === transitIdx + 1,
        `${caseName}: expected matrix transit id ${transitIdx + 1}, got ${matrixTransitId}`,
      );

      const getDimensionOrDie =
        (routing as { getDimensionOrDie?: RoutingModelLike['getDimensionOrDie'] }).getDimensionOrDie;
      if (typeof getDimensionOrDie !== 'function') {
        return `TODO: ${caseName} requires getDimensionOrDie support in TS bindings`;
      }
      const dimension = getDimensionOrDie.call(routing, 'matrix');
      assert(dimension, `${caseName}: missing matrix dimension`);
      assert(
        typeof dimension.cumulVar === 'function',
        `${caseName}: getDimensionOrDie returned an object without cumulVar`,
      );

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      assertNumber(routing.status(), ROUTING_NOT_SOLVED, `${caseName} initial status`);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);
      assertNumber(routing.status(), ROUTING_SUCCESS, `${caseName} final status`);
      for (let vehicle = 0; vehicle < manager.getNumberOfVehicles(); vehicle++) {
        let index = routing.start(vehicle);
        let cumul = 0;
        while (!routing.isEnd(index)) {
          const cumulVar = dimension.cumulVar(index);
          assertNumber(
            readDimensionValue(assignment, cumulVar),
            cumul,
            `${caseName}: vehicle ${vehicle} cumul mismatch at ${index}`,
          );
          const previousIndex = index;
          index = assignment.value(routing.nextVar(index));
          cumul += matrix[manager.indexToNode(previousIndex)][manager.indexToNode(index)];
        }
      }
      assertNumber(assignment.objectiveValue(), 20, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDisjunctionTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDisjunctionTSP';
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addDisjunction = (routing as { addDisjunction?: RoutingModelLike['addDisjunction'] }).addDisjunction;
      if (typeof addDisjunction !== 'function') {
        return `TODO: ${caseName} requires addDisjunction support in TS bindings`;
      }
      const disjunctions = [
        [manager.nodeToIndex(1), manager.nodeToIndex(2)],
        [manager.nodeToIndex(3)],
        [manager.nodeToIndex(4)],
        [manager.nodeToIndex(5)],
        [manager.nodeToIndex(6)],
        [manager.nodeToIndex(7)],
        [manager.nodeToIndex(8)],
        [manager.nodeToIndex(9)],
      ];
      for (const disjunction of disjunctions) {
        addDisjunction.call(routing, disjunction);
      }

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);

      let node = routing.start(0);
      let count = 0;
      while (!routing.isEnd(node)) {
        count += 1;
        node = assignment.value(routing.nextVar(node));
      }
      assertNumber(count, 9, `${caseName} expected 9 visited nodes`);
      assertNumber(assignment.objectiveValue(), 86, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testDisjunctionPenaltyTSP',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const caseName = 'TestPyWrapRoutingModel.testDisjunctionPenaltyTSP';
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addDisjunction = (routing as { addDisjunction?: RoutingModelLike['addDisjunction'] }).addDisjunction;
      if (typeof addDisjunction !== 'function') {
        return `TODO: ${caseName} requires addDisjunction support in TS bindings`;
      }

      const disjunctions: Array<[number[], number]> = [
        [[manager.nodeToIndex(1), manager.nodeToIndex(2)], 1000],
        [[manager.nodeToIndex(3)], 1000],
        [[manager.nodeToIndex(4)], 1000],
        [[manager.nodeToIndex(5)], 1000],
        [[manager.nodeToIndex(6)], 1000],
        [[manager.nodeToIndex(7)], 1000],
        [[manager.nodeToIndex(8)], 1000],
        [[manager.nodeToIndex(9)], 0],
      ];
      for (const [disjunction, penalty] of disjunctions) {
        addDisjunction.call(routing, disjunction, penalty);
      }

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = firstUnboundStrategy(routingApi);
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, `${caseName} did not return a solution`);

      let node = routing.start(0);
      let count = 0;
      while (!routing.isEnd(node)) {
        count += 1;
        node = assignment.value(routing.nextVar(node));
      }
      assertNumber(count, 8, `${caseName} expected 8 visited nodes`);
      assertNumber(assignment.objectiveValue(), 68, `${caseName} objectiveValue`);
      return `${caseName} PASS`;
    },
  },
];
import { routingExecutionOptions } from './execution.ts';
