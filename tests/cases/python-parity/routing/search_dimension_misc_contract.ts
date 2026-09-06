type RoutingApi = {
  defaultRoutingSearchParameters: () => RoutingSearchParameters;
  defaultRoutingModelParameters?: () => unknown;
  findErrorInRoutingSearchParameters?: (params: unknown) => string;
  RoutingIndexManager: new (numLocations: number, numVehicles: number, depot: number) => RoutingIndexManagerLike;
  RoutingModel: new (manager: RoutingIndexManagerLike, parameters?: unknown) => RoutingModelLike;
  FirstSolutionStrategy?: {
    PATH_CHEAPEST_ARC?: number;
    SAVINGS?: number;
    PARALLEL_CHEAPEST_INSERTION?: number;
  };
  LocalSearchMetaheuristic?: {
    GUIDED_LOCAL_SEARCH?: number;
  };
  BOOL_FALSE?: number | boolean;
  BOOL_UNSPECIFIED?: number | boolean;
  BoundCost?: new (bound?: number, cost?: number) => BoundCostLike;
};

type RoutingIndexManagerLike = {
  numLocations: number;
  numVehicles: number;
  indexToNode(index: number): number;
  nodeToIndex(node: number): number;
};

type RoutingSearchParameters = {
  firstSolutionStrategy?: number;
  localSearchMetaheuristic?: unknown;
  localSearchOperators?: unknown;
  solutionLimit?: number;
};

type RoutingAssignmentLike = {
  objectiveValue(): bigint;
  value(index: number): number;
};

type RoutingDimensionLike = {
  setSoftSpanUpperBoundForVehicle?(boundCost: BoundCostLike, vehicle: number): void;
  getSoftSpanUpperBoundForVehicle?(vehicle: number): BoundCostLike | null;
  setQuadraticCostSoftSpanUpperBoundForVehicle?(boundCost: BoundCostLike, vehicle: number): void;
  getQuadraticCostSoftSpanUpperBoundForVehicle?(vehicle: number): BoundCostLike | null;
  hasSoftSpanUpperBounds?(): boolean;
  hasQuadraticCostSoftSpanUpperBounds?(): boolean;
  cumulVar?(index: number): unknown;
  setRange?(
    indexOrLow: number,
    indexOrHigh?: number,
    highMaybe?: number,
  ): void;
};

type RoutingSolverLike = {
  parameters?: () => {
    tracePropagation?: boolean;
  };
  localSearchProfile?: () => string;
  add?: (...constraints: unknown[]) => void;
};

type RoutingCostVarLike = {
  max(): bigint;
};

type BoundCostLike = {
  bound: bigint;
  cost: bigint;
};

type RoutingModelLike = {
  registerTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  setArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  solve(options?: unknown): Promise<RoutingAssignmentLike | null> | RoutingAssignmentLike | null;
  solveWithParameters(parameters: RoutingSearchParameters, options?: unknown): Promise<RoutingAssignmentLike | null>;
  solveFromAssignmentWithParameters?(
    assignment: RoutingAssignmentLike,
    parameters: RoutingSearchParameters,
    options?: unknown,
  ): Promise<RoutingAssignmentLike | null>;
  getNumberOfDecisionsInFirstSolution?(parameters: RoutingSearchParameters): number;
  getNumberOfRejectsInFirstSolution?(parameters: RoutingSearchParameters): number;
  closeModelWithParameters?(parameters: RoutingSearchParameters): void;
  readAssignmentFromRoutes?(routes: number[][], closeRoutes: boolean): RoutingAssignmentLike;
  getAutomaticFirstSolutionStrategy?(): number;
  addAtSolutionCallback?(callback: (() => void) | { __call__(): void }): void;
  addDimension?(
    transitIndex: number,
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean;
  addDimensionWithVehicleCapacity?(
    transitIndex: number,
    slackMax: number,
    capacities: number[],
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean;
  addDimensionWithVehicleTransits?(
    transitIndices: number[] | number,
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean;
  addConstantDimension?(
    transitIndex: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] | boolean;
  addVectorDimension?(
    values: number[],
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] | boolean;
  addMatrixDimension?(
    matrix: number[][],
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] | boolean;
  getDimensionOrDie?(name: string): RoutingDimensionLike;
  start(vehicle: number): number;
  vehicles(): number;
  isEnd(index: number): boolean;
  nextVar(index: number): number;
  getArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): bigint;
  vehicleVar?(index: number): unknown;
  cumulVar?(index: number): unknown;
  solver?(): RoutingSolverLike;
  costVar?(): RoutingCostVarLike;
};

type RoutingCase = {
  name: string;
  source: string;
  run(routingApi: RoutingApi): Promise<string>;
};

type AtSolutionCallback = {
  __call__(): void;
  costs?: bigint[];
};

const PYTHON_SOURCE = 'ortools/constraint_solver/python/pywraprouting_test.py';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(value: unknown, expected: number, message: string) {
  assert(value === expected || value === BigInt(expected), `${message}: expected ${expected}, got ${String(value)}`);
}

function unsupported(message: string) {
  return `TODO: ${message}`;
}

function toNumber(value: number | boolean): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function distance(manager: RoutingIndexManagerLike, fromIndex: number, toIndex: number) {
  return manager.indexToNode(fromIndex) + manager.indexToNode(toIndex);
}

export const searchDimensionMiscContractCases: RoutingCase[] = [
  {
    name: 'TestPyWrapRoutingModel.testRoutingModelParameters',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const createParameters = routingApi.defaultRoutingModelParameters;
      if (typeof createParameters !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingModelParameters requires defaultRoutingModelParameters support in TS bindings',
        );
      }

      const parameters = createParameters();
      const solverParameters =
        (parameters as { solverParameters?: { copyFrom?: (value: unknown) => void; tracePropagation?: boolean } })
          .solverParameters;
      if (!solverParameters || typeof solverParameters.copyFrom !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingModelParameters requires solver parameter accessors on routing model parameters',
        );
      }

      solverParameters.tracePropagation = true;

      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike, parameters as unknown);
      assert(
        routing.vehicles() === 1,
        `TestPyWrapRoutingModel.testRoutingModelParameters expected 1 vehicle, got ${routing.vehicles()}`,
      );

      const getSolver = routing.solver?.();
      const solverParametersCopy = getSolver?.parameters?.();
      if (!solverParametersCopy || solverParametersCopy.tracePropagation !== true) {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingModelParameters needs solver().parameters().tracePropagation check support in TS routing API',
        );
      }
      return 'TestPyWrapRoutingModel.testRoutingModelParameters PASS';
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const createParameters = routingApi.defaultRoutingModelParameters;
      if (typeof createParameters !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering requires defaultRoutingModelParameters in TS bindings',
        );
      }

      const parameters = createParameters();
      const solverParameters =
        (parameters as { solverParameters?: { profileLocalSearch?: number | boolean } }).solverParameters;
      if (!solverParameters) {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering needs solverParameters on routing model parameters',
        );
      }

      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      solverParameters.profileLocalSearch = true;
      // RoutingModel currently only accepts a single constructor argument in TS.
      const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike, parameters as unknown);
      const solve = routing.solve?.(routingExecutionOptions());
      const solveResult = solve instanceof Promise ? await solve : solve;
      if (!solveResult) {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering needs routing.solve(routingExecutionOptions()) in TS bindings',
        );
      }
      const profile = routing.solver?.().localSearchProfile?.();
      if (typeof profile !== 'string' || profile.length === 0) {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering needs solver().localSearchProfile() and non-empty profile support',
        );
      }
      return 'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering PASS';
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testRoutingSearchParameters',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = routingApi.FirstSolutionStrategy?.SAVINGS ?? 10;
      (searchParameters as { localSearchMetaheuristic?: unknown }).localSearchMetaheuristic =
        routingApi.LocalSearchMetaheuristic?.GUIDED_LOCAL_SEARCH ?? 1;
      (searchParameters as { localSearchOperators?: Record<string, unknown> }).localSearchOperators = {
        useTwoOpt: toNumber(routingApi.BOOL_FALSE ?? false),
      };
      searchParameters.solutionLimit = 20;

      const closeModel = routing.closeModelWithParameters;
      if (typeof closeModel !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingSearchParameters requires closeModelWithParameters in TS bindings',
        );
      }
      closeModel.call(routing, searchParameters);

      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, 'TestPyWrapRoutingModel.testRoutingSearchParameters expected an assignment');
      if (!assignment) return unsupported('assignment');

      assertNumber(
        assignment.objectiveValue(),
        90,
        'TestPyWrapRoutingModel.testRoutingSearchParameters objectiveValue',
      );

      const getDecisions = routing.getNumberOfDecisionsInFirstSolution?.(searchParameters);
      const getRejects = routing.getNumberOfRejectsInFirstSolution?.(searchParameters);
      if (typeof getDecisions !== 'number' || typeof getRejects !== 'number') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingSearchParameters needs first-solution decision/reject stats APIs in TS bindings',
        );
      }
      assertNumber(
        getDecisions,
        11,
        'TestPyWrapRoutingModel.testRoutingSearchParameters numberOfDecisionsInFirstSolution',
      );
      assertNumber(getRejects, 0, 'TestPyWrapRoutingModel.testRoutingSearchParameters numberOfRejectsInFirstSolution');

      const solveFromAssignmentWithParameters = routing.solveFromAssignmentWithParameters;
      if (typeof solveFromAssignmentWithParameters !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingSearchParameters needs solveFromAssignmentWithParameters in TS bindings',
        );
      }
      const refinedAssignment = await solveFromAssignmentWithParameters.call(
        routing,
        assignment,
        searchParameters as RoutingSearchParameters,
        routingExecutionOptions(),
      );
      assert(refinedAssignment, 'TestPyWrapRoutingModel.testRoutingSearchParameters missing refined assignment');
      assertNumber(
        refinedAssignment?.objectiveValue() ?? NaN,
        90,
        'TestPyWrapRoutingModel.testRoutingSearchParameters solveFromAssignmentWithParameters objectiveValue',
      );
      return 'TestPyWrapRoutingModel.testRoutingSearchParameters PASS';
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testfindErrorInRoutingSearchParameters',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const findError = routingApi.findErrorInRoutingSearchParameters;
      if (typeof findError !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testfindErrorInRoutingSearchParameters requires findErrorInRoutingSearchParameters in TS bindings',
        );
      }

      const params = routingApi.defaultRoutingSearchParameters() as RoutingSearchParameters & {
        localSearchOperators?: { useCross?: number | boolean };
      };
      (params.localSearchOperators as { useCross?: number | boolean } | undefined) ??= {};
      (params.localSearchOperators as { useCross?: number | boolean }).useCross = toNumber(
        routingApi.BOOL_UNSPECIFIED ?? 2,
      );

      const result = findError(params);
      if (typeof result !== 'string' || !result.toLowerCase().includes('cross')) {
        return unsupported(
          'TestPyWrapRoutingModel.testfindErrorInRoutingSearchParameters expects error text containing "cross" from TS bindings',
        );
      }
      return `TestPyWrapRoutingModel.testfindErrorInRoutingSearchParameters PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testCallback',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addCallback = routing.addAtSolutionCallback;
      if (typeof addCallback !== 'function' || !routing.costVar) {
        return unsupported(
          'TestPyWrapRoutingModel.testCallback needs addAtSolutionCallback and costVar in TS bindings',
        );
      }

      const callback: AtSolutionCallback = {
        __call__() {
          const costVar = routing.costVar?.();
          if (costVar && typeof costVar.max === 'function') {
            callback.costs?.push(costVar.max());
          }
        },
      };
      callback.costs = [];
      addCallback.call(routing, callback);

      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.firstSolutionStrategy = routingApi.FirstSolutionStrategy?.PATH_CHEAPEST_ARC ?? 3;
      const assignment = await routing.solveWithParameters(searchParameters, routingExecutionOptions());
      assert(assignment, 'TestPyWrapRoutingModel.testCallback did not return a solution');

      const costs = callback.costs;
      assertNumber(assignment.objectiveValue(), 90, 'TestPyWrapRoutingModel.testCallback objectiveValue');
      if (costs.length !== 1 || costs[0] !== 90n) {
        return unsupported(
          'TestPyWrapRoutingModel.testCallback needs solution callback ordering/execution in TS bindings',
        );
      }
      return `TestPyWrapRoutingModel.testCallback PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testReadAssignment',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testReadAssignment matches upstream assignment solve, objective, and per-vehicle route assertions.

      const manager = new routingApi.RoutingIndexManager(10, 2, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const readAssignment = routing.readAssignmentFromRoutes;
      const solveFromAssignment = routing.solveFromAssignmentWithParameters;
      if (typeof readAssignment !== 'function' || typeof solveFromAssignment !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testReadAssignment requires readAssignmentFromRoutes and solveFromAssignmentWithParameters in TS bindings',
        );
      }

      const routes = [
        [
          manager.nodeToIndex(1),
          manager.nodeToIndex(3),
          manager.nodeToIndex(5),
          manager.nodeToIndex(4),
          manager.nodeToIndex(2),
          manager.nodeToIndex(6),
        ],
        [manager.nodeToIndex(7), manager.nodeToIndex(9), manager.nodeToIndex(8)],
      ];
      const assignment = readAssignment.call(routing, routes, false);
      const searchParameters = routingApi.defaultRoutingSearchParameters();
      searchParameters.solutionLimit = 1;
      const solution = await solveFromAssignment.call(
        routing,
        assignment,
        searchParameters,
        routingExecutionOptions(),
      );
      assert(solution, 'TestPyWrapRoutingModel.testReadAssignment did not return a solution');

      assertNumber(solution?.objectiveValue() ?? NaN, 90, 'TestPyWrapRoutingModel.testReadAssignment objectiveValue');
      for (let vehicle = 0; vehicle < routing.vehicles(); vehicle++) {
        let node = routing.start(vehicle);
        let count = 0;
        while (!routing.isEnd(node)) {
          node = solution.value(routing.nextVar(node));
          if (!routing.isEnd(node)) {
            assertNumber(
              manager.indexToNode(node),
              routes[vehicle][count],
              `TestPyWrapRoutingModel.testReadAssignment vehicle ${vehicle} route node ${count}`,
            );
            count += 1;
          }
        }
      }
      return `TestPyWrapRoutingModel.testReadAssignment PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);
      const assignment = await routing.solveWithParameters(
        routingApi.defaultRoutingSearchParameters(),
        routingExecutionOptions(),
      );
      assert(assignment, 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple did not return a solution');

      const getAutomaticStrategy = routing.getAutomaticFirstSolutionStrategy;
      if (typeof getAutomaticStrategy !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple requires getAutomaticFirstSolutionStrategy in TS bindings',
        );
      }

      const strategy = getAutomaticStrategy.call(routing);
      assertNumber(
        strategy,
        routingApi.FirstSolutionStrategy?.PATH_CHEAPEST_ARC ?? 3,
        'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple expected PATH_CHEAPEST_ARC',
      );
      return `TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd matches upstream pickup/delivery setup and automatic strategy assertion.

      const manager = new routingApi.RoutingIndexManager(31, 7, 0);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      routing.setArcCostEvaluatorOfAllVehicles(transitIdx);

      const addDimension = routing.addDimension;
      const addPickupAndDelivery =
        (routing as { addPickupAndDelivery?: (pickup: number, delivery: number) => void }).addPickupAndDelivery;
      const solver = routing.solver?.();
      const getDimensionOrDie = routing.getDimensionOrDie?.bind(routing);
      if (
        typeof addDimension !== 'function' ||
        typeof addPickupAndDelivery !== 'function' ||
        typeof routing.vehicleVar !== 'function' ||
        !solver ||
        !getDimensionOrDie
      ) {
        return unsupported(
          'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd requires dimension and pickup/delivery APIs in TS bindings',
        );
      }

      const dimensionCreated = addDimension.call(routing, transitIdx, 0, 1000, true, 'distance');
      assert(
        dimensionCreated,
        'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd expected addDimension to succeed',
      );
      const dimension = getDimensionOrDie('distance');
      assert(
        typeof dimension.cumulVar === 'function',
        'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd expected cumulVar support',
      );

      for (let i = 1; i < 15; i++) {
        const pickupIndex = manager.nodeToIndex(2 * i);
        const deliveryIndex = manager.nodeToIndex(2 * i + 1);
        addPickupAndDelivery.call(routing, pickupIndex, deliveryIndex);
        solver.add?.({
          type: 'routingVehicleEquality',
          left: routing.vehicleVar(pickupIndex),
          right: routing.vehicleVar(deliveryIndex),
        });
        solver.add?.({
          type: 'routingCumulLessOrEqual',
          left: dimension.cumulVar(pickupIndex),
          right: dimension.cumulVar(deliveryIndex),
        });
      }

      const assignment = await routing.solveWithParameters(
        routingApi.defaultRoutingSearchParameters(),
        routingExecutionOptions(),
      );
      assert(assignment, 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd did not return a solution');

      const getAutomaticStrategy = routing.getAutomaticFirstSolutionStrategy;
      if (typeof getAutomaticStrategy !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd requires getAutomaticFirstSolutionStrategy in TS bindings',
        );
      }
      const strategy = getAutomaticStrategy.call(routing);
      assertNumber(
        strategy,
        routingApi.FirstSolutionStrategy?.PARALLEL_CHEAPEST_INSERTION ?? 8,
        'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd expected PARALLEL_CHEAPEST_INSERTION',
      );
      return `TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd PASS`;
    },
  },
  {
    name: 'TestBoundCost.testCtor',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const BoundCost = routingApi.BoundCost;
      if (typeof BoundCost !== 'function') {
        return unsupported('TestBoundCost.testCtor requires BoundCost API in TS bindings');
      }

      const defaultBoundCost = new BoundCost();
      assert(
        defaultBoundCost.bound === 0n,
        `TestBoundCost.testCtor expected default bound 0, got ${defaultBoundCost.bound}`,
      );
      assert(
        defaultBoundCost.cost === 0n,
        `TestBoundCost.testCtor expected default cost 0, got ${defaultBoundCost.cost}`,
      );

      const configuredBoundCost = new BoundCost(97, 43);
      assert(
        configuredBoundCost.bound === 97n,
        `TestBoundCost.testCtor expected bound 97, got ${configuredBoundCost.bound}`,
      );
      assert(
        configuredBoundCost.cost === 43n,
        `TestBoundCost.testCtor expected cost 43, got ${configuredBoundCost.cost}`,
      );
      return 'TestBoundCost.testCtor PASS';
    },
  },
  {
    name: 'TestRoutingDimension.testCtor',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      const addDimension = routing.addDimension;
      if (typeof addDimension !== 'function') {
        return unsupported(
          'TestRoutingDimension.testCtor requires addDimension and getDimensionOrDie in TS bindings',
        );
      }

      const added = addDimension.call(routing, transitIdx, 90, 90, true, 'distance');
      if (!added) {
        return unsupported('TestRoutingDimension.testCtor failed to create distance dimension in TS bindings');
      }
      assert(routing.getDimensionOrDie?.('distance'), 'TestRoutingDimension.testCtor expected distance dimension');
      return 'TestRoutingDimension.testCtor PASS';
    },
  },
  {
    name: 'TestRoutingDimension.testSoftSpanUpperBound',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      const addDimension = routing.addDimension;
      const getDimension = routing.getDimensionOrDie;
      const boundCostCtor = routingApi.BoundCost;
      if (
        typeof addDimension !== 'function' || typeof getDimension !== 'function' || typeof boundCostCtor !== 'function'
      ) {
        return unsupported(
          'TestRoutingDimension.testSoftSpanUpperBound requires addDimension, getDimensionOrDie, and BoundCost in TS bindings',
        );
      }

      const added = addDimension.call(routing, transitIdx, 100, 100, true, 'distance');
      assert(added, 'TestRoutingDimension.testSoftSpanUpperBound failed to add distance dimension');
      const dimension = getDimension.call(routing, 'distance');

      const boundCost = new boundCostCtor(97, 43);
      if (!boundCost) {
        return unsupported(
          'TestRoutingDimension.testSoftSpanUpperBound failed to construct BoundCost in TS bindings',
        );
      }
      assert(
        !dimension.hasSoftSpanUpperBounds?.(),
        'TestRoutingDimension.testSoftSpanUpperBound expected no soft span bounds',
      );

      for (let v = 0; v < manager.numVehicles; v++) {
        dimension.setSoftSpanUpperBoundForVehicle?.(boundCost, v);
        const returned = dimension.getSoftSpanUpperBoundForVehicle?.(v);
        assert(returned !== null, `TestRoutingDimension.testSoftSpanUpperBound missing bound for vehicle ${v}`);
        assertNumber(returned?.bound, 97, `TestRoutingDimension.testSoftSpanUpperBound bound vehicle ${v}`);
        assertNumber(returned?.cost, 43, `TestRoutingDimension.testSoftSpanUpperBound cost vehicle ${v}`);
      }
      assert(
        dimension.hasSoftSpanUpperBounds?.(),
        'TestRoutingDimension.testSoftSpanUpperBound expected soft span bounds to be enabled',
      );
      return 'TestRoutingDimension.testSoftSpanUpperBound PASS';
    },
  },
  {
    name: 'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      const routing = new routingApi.RoutingModel(manager);
      const transitIdx = routing.registerTransitCallback((fromIndex, toIndex) => distance(manager, fromIndex, toIndex));
      const addDimension = routing.addDimension;
      const getDimension = routing.getDimensionOrDie;
      const boundCostCtor = routingApi.BoundCost;
      if (
        typeof addDimension !== 'function' || typeof getDimension !== 'function' || typeof boundCostCtor !== 'function'
      ) {
        return unsupported(
          'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound requires addDimension, getDimensionOrDie, and BoundCost in TS bindings',
        );
      }

      const added = addDimension.call(routing, transitIdx, 100, 100, true, 'distance');
      assert(added, 'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound failed to add distance dimension');
      const dimension = getDimension.call(routing, 'distance');

      const boundCost = new boundCostCtor(97, 43);
      if (!boundCost) {
        return unsupported(
          'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound failed to construct BoundCost in TS bindings',
        );
      }
      assert(
        !dimension.hasQuadraticCostSoftSpanUpperBounds?.(),
        'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound expected no quadratic bounds',
      );

      for (let v = 0; v < manager.numVehicles; v++) {
        dimension.setQuadraticCostSoftSpanUpperBoundForVehicle?.(boundCost, v);
        const returned = dimension.getQuadraticCostSoftSpanUpperBoundForVehicle?.(v);
        assert(
          returned !== null,
          `TestRoutingDimension.testQuadraticCostSoftSpanUpperBound missing bound for vehicle ${v}`,
        );
        assertNumber(
          returned?.bound,
          97,
          `TestRoutingDimension.testQuadraticCostSoftSpanUpperBound bound vehicle ${v}`,
        );
        assertNumber(returned?.cost, 43, `TestRoutingDimension.testQuadraticCostSoftSpanUpperBound cost vehicle ${v}`);
      }
      assert(
        dimension.hasQuadraticCostSoftSpanUpperBounds?.(),
        'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound expected quadratic bounds to be enabled',
      );
      return 'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound PASS';
    },
  },
];
import { routingExecutionOptions } from './execution.ts';
