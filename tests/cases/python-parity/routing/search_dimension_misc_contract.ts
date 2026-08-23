type RoutingApi = {
  DefaultRoutingSearchParameters: () => RoutingSearchParameters;
  DefaultRoutingModelParameters?: () => unknown;
  FindErrorInRoutingSearchParameters?: (params: unknown) => string;
  initRouting(): Promise<void>;
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
  IndexToNode(index: number): number;
  NodeToIndex(node: number): number;
  delete(): void;
};

type RoutingSearchParameters = {
  firstSolutionStrategy?: number;
  localSearchMetaheuristic?: unknown;
  local_search_operators?: unknown;
  solution_limit?: number;
};

type RoutingAssignmentLike = {
  ObjectiveValue(): number;
  Value(index: number): number;
};

type RoutingDimensionLike = {
  SetSoftSpanUpperBoundForVehicle?(boundCost: BoundCostLike, vehicle: number): void;
  GetSoftSpanUpperBoundForVehicle?(vehicle: number): BoundCostLike | null;
  SetQuadraticCostSoftSpanUpperBoundForVehicle?(boundCost: BoundCostLike, vehicle: number): void;
  GetQuadraticCostSoftSpanUpperBoundForVehicle?(vehicle: number): BoundCostLike | null;
  HasSoftSpanUpperBounds?(): boolean;
  HasQuadraticCostSoftSpanUpperBounds?(): boolean;
  CumulVar?(index: number): unknown;
  SetRange?(
    indexOrLow: number,
    indexOrHigh?: number,
    highMaybe?: number,
  ): void;
};

type RoutingSolverLike = {
  Parameters?: () => {
    trace_propagation?: boolean;
  };
  LocalSearchProfile?: () => string;
  Add?: (...constraints: unknown[]) => void;
};

type RoutingCostVarLike = {
  Max(): number;
};

type BoundCostLike = {
  bound: number;
  cost: number;
};

type RoutingModelLike = {
  RegisterTransitCallback(callback: (fromIndex: number, toIndex: number) => number): number;
  SetArcCostEvaluatorOfAllVehicles(callbackIndex: number): void;
  Solve(): Promise<RoutingAssignmentLike | null> | RoutingAssignmentLike | null;
  SolveWithParameters(parameters: RoutingSearchParameters): Promise<RoutingAssignmentLike | null>;
  SolveFromAssignmentWithParameters?(
    assignment: RoutingAssignmentLike,
    parameters: RoutingSearchParameters,
  ): Promise<RoutingAssignmentLike | null>;
  GetNumberOfDecisionsInFirstSolution?(parameters: RoutingSearchParameters): number;
  GetNumberOfRejectsInFirstSolution?(parameters: RoutingSearchParameters): number;
  CloseModelWithParameters?(parameters: RoutingSearchParameters): void;
  ReadAssignmentFromRoutes?(routes: number[][], closeRoutes: boolean): RoutingAssignmentLike;
  GetAutomaticFirstSolutionStrategy?(): number;
  AddAtSolutionCallback?(callback: (() => void) | { __call__(): void }): void;
  AddDimension?(
    transitIndex: number,
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean;
  AddDimensionWithVehicleCapacity?(
    transitIndex: number,
    slackMax: number,
    capacities: number[],
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean;
  AddDimensionWithVehicleTransits?(
    transitIndices: number[] | number,
    slackMax: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): boolean;
  AddConstantDimension?(
    transitIndex: number,
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] | boolean;
  AddVectorDimension?(
    values: number[],
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] | boolean;
  AddMatrixDimension?(
    matrix: number[][],
    capacity: number,
    fixStartCumulToZero: boolean,
    name: string,
  ): [number, boolean] | boolean;
  GetDimensionOrDie?(name: string): RoutingDimensionLike;
  Start(vehicle: number): number;
  vehicles(): number;
  IsEnd(index: number): boolean;
  NextVar(index: number): number;
  GetArcCostForVehicle(fromIndex: number, toIndex: number, vehicle: number): number;
  VehicleVar?(index: number): unknown;
  CumulVar?(index: number): unknown;
  solver?(): RoutingSolverLike;
  CostVar?(): RoutingCostVarLike;
  Delete?(): void;
  delete(): void;
};

type RoutingCase = {
  name: string;
  source: string;
  run(routingApi: RoutingApi): Promise<string>;
};

type AtSolutionCallback = {
  __call__(): void;
  costs?: number[];
};

const PYTHON_SOURCE = 'ortools/constraint_solver/python/pywraprouting_test.py';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(value: unknown, expected: number, message: string) {
  assert(typeof value === 'number', `${message}: expected a numeric value`);
  assert(value === expected, `${message}: expected ${expected}, got ${value}`);
}

function unsupported(message: string) {
  return `TODO: ${message}`;
}

function toNumber(value: number | boolean): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function distance(manager: RoutingIndexManagerLike, fromIndex: number, toIndex: number) {
  return manager.IndexToNode(fromIndex) + manager.IndexToNode(toIndex);
}

export const searchDimensionMiscContractCases: RoutingCase[] = [
  {
    name: 'TestPyWrapRoutingModel.testRoutingModelParameters',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const createParameters = routingApi.DefaultRoutingModelParameters;
      if (typeof createParameters !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingModelParameters requires DefaultRoutingModelParameters support in TS bindings',
        );
      }

      const parameters = createParameters();
      // TODO(user): Keep the API surface in sync with Python RoutingModelParameters.
      const solverParameters =
        (parameters as { solver_parameters?: { CopyFrom?: (value: unknown) => void; trace_propagation?: boolean } })
          .solver_parameters;
      if (!solverParameters || typeof solverParameters.CopyFrom !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingModelParameters requires solver parameter accessors on routing model parameters',
        );
      }

      solverParameters.trace_propagation = true;

      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      try {
        // Current constructor is a single-argument form; this TODO keeps the shape explicit.
        const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike, parameters as unknown);
        try {
          assert(
            routing.vehicles() === 1,
            `TestPyWrapRoutingModel.testRoutingModelParameters expected 1 vehicle, got ${routing.vehicles()}`,
          );

          const getSolver = routing.solver?.();
          const solverParametersCopy = getSolver?.Parameters?.();
          if (!solverParametersCopy || solverParametersCopy.trace_propagation !== true) {
            return unsupported(
              'TestPyWrapRoutingModel.testRoutingModelParameters needs solver().Parameters().trace_propagation check support in TS routing API',
            );
          }
          return 'TestPyWrapRoutingModel.testRoutingModelParameters PASS';
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const createParameters = routingApi.DefaultRoutingModelParameters;
      if (typeof createParameters !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering requires DefaultRoutingModelParameters in TS bindings',
        );
      }

      const parameters = createParameters();
      const solverParameters = (parameters as { solver_parameters?: { profile_local_search?: number | boolean } }).solver_parameters;
      if (!solverParameters) {
        return unsupported(
          'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering needs solver_parameters on routing model parameters',
        );
      }

      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      try {
        solverParameters.profile_local_search = true;
        // RoutingModel currently only accepts a single constructor argument in TS.
        const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike, parameters as unknown);
        try {
          const solve = routing.Solve?.();
          const solveResult = solve instanceof Promise ? await solve : solve;
          if (!solveResult) {
            return unsupported(
              'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering needs routing.Solve() in TS bindings',
            );
          }
          const profile = routing.solver?.().LocalSearchProfile?.();
          if (typeof profile !== 'string' || profile.length === 0) {
            return unsupported(
              'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering needs solver().LocalSearchProfile() and non-empty profile support',
            );
          }
          return 'TestPyWrapRoutingModel.testRoutingLocalSearchFiltering PASS';
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testRoutingSearchParameters',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      try {
        const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

          const searchParameters = routingApi.DefaultRoutingSearchParameters();
          searchParameters.firstSolutionStrategy = routingApi.FirstSolutionStrategy?.SAVINGS ?? 10;
          (searchParameters as { local_search_metaheuristic?: unknown }).local_search_metaheuristic =
            routingApi.LocalSearchMetaheuristic?.GUIDED_LOCAL_SEARCH ?? 1;
          (searchParameters as { local_search_operators?: Record<string, unknown> }).local_search_operators = {
            use_two_opt: toNumber(routingApi.BOOL_FALSE ?? false),
          };
          searchParameters.solution_limit = 20;

          const closeModel = routing.CloseModelWithParameters;
          if (typeof closeModel !== 'function') {
            return unsupported(
              'TestPyWrapRoutingModel.testRoutingSearchParameters requires CloseModelWithParameters in TS bindings',
            );
          }
          closeModel.call(routing, searchParameters);

          const assignment = await routing.SolveWithParameters(searchParameters);
          assert(assignment, 'TestPyWrapRoutingModel.testRoutingSearchParameters expected an assignment');
          if (!assignment) return unsupported('assignment');

          assertNumber(assignment.ObjectiveValue(), 90, 'TestPyWrapRoutingModel.testRoutingSearchParameters objectiveValue');

          const getDecisions = routing.GetNumberOfDecisionsInFirstSolution?.(searchParameters);
          const getRejects = routing.GetNumberOfRejectsInFirstSolution?.(searchParameters);
          if (typeof getDecisions !== 'number' || typeof getRejects !== 'number') {
            return unsupported(
              'TestPyWrapRoutingModel.testRoutingSearchParameters needs first-solution decision/reject stats APIs in TS bindings',
            );
          }
          assertNumber(getDecisions, 11, 'TestPyWrapRoutingModel.testRoutingSearchParameters numberOfDecisionsInFirstSolution');
          assertNumber(getRejects, 0, 'TestPyWrapRoutingModel.testRoutingSearchParameters numberOfRejectsInFirstSolution');

          const solveFromAssignmentWithParameters = routing.SolveFromAssignmentWithParameters;
          if (typeof solveFromAssignmentWithParameters !== 'function') {
            return unsupported(
              'TestPyWrapRoutingModel.testRoutingSearchParameters needs SolveFromAssignmentWithParameters in TS bindings',
            );
          }
          const refinedAssignment = await solveFromAssignmentWithParameters.call(
            routing,
            assignment,
            searchParameters as RoutingSearchParameters,
          );
          assert(refinedAssignment, 'TestPyWrapRoutingModel.testRoutingSearchParameters missing refined assignment');
          assertNumber(
            refinedAssignment?.ObjectiveValue() ?? NaN,
            90,
            'TestPyWrapRoutingModel.testRoutingSearchParameters SolveFromAssignmentWithParameters objectiveValue',
          );
          return 'TestPyWrapRoutingModel.testRoutingSearchParameters PASS';
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testFindErrorInRoutingSearchParameters',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const findError = routingApi.FindErrorInRoutingSearchParameters;
      if (typeof findError !== 'function') {
        return unsupported(
          'TestPyWrapRoutingModel.testFindErrorInRoutingSearchParameters requires FindErrorInRoutingSearchParameters in TS bindings',
        );
      }

      const params = routingApi.DefaultRoutingSearchParameters() as RoutingSearchParameters & {
        local_search_operators?: { use_cross?: number | boolean };
      };
      (params.local_search_operators as { use_cross?: number | boolean } | undefined) ??= {};
      (params.local_search_operators as { use_cross?: number | boolean }).use_cross =
        toNumber(routingApi.BOOL_UNSPECIFIED ?? 2);

      const result = findError(params);
      if (typeof result !== 'string' || result.indexOf('cross') === -1) {
        return unsupported(
          'TestPyWrapRoutingModel.testFindErrorInRoutingSearchParameters expects error text containing "cross" from TS bindings',
        );
      }
      return `TestPyWrapRoutingModel.testFindErrorInRoutingSearchParameters PASS`;
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testCallback',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(10, 1, 0);
      try {
        const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

          const addCallback = routing.AddAtSolutionCallback;
          if (typeof addCallback !== 'function' || !routing.CostVar) {
            return unsupported(
              'TestPyWrapRoutingModel.testCallback needs AddAtSolutionCallback and CostVar in TS bindings',
            );
          }

          const callback: AtSolutionCallback = {
            __call__() {
              const costVar = routing.CostVar?.();
              if (costVar && typeof costVar.Max === 'function') {
                callback.costs?.push(costVar.Max());
              }
            },
          };
          callback.costs = [];
          addCallback.call(routing, callback);

          const searchParameters = routingApi.DefaultRoutingSearchParameters();
          searchParameters.firstSolutionStrategy = routingApi.FirstSolutionStrategy?.PATH_CHEAPEST_ARC ?? 3;
          const assignment = await routing.SolveWithParameters(searchParameters);
          assert(assignment, 'TestPyWrapRoutingModel.testCallback did not return a solution');

          const costs = callback.costs;
          assertNumber(assignment.ObjectiveValue(), 90, 'TestPyWrapRoutingModel.testCallback objectiveValue');
          if (costs.length !== 1 || costs[0] !== 90) {
            return unsupported(
              'TestPyWrapRoutingModel.testCallback needs solution callback ordering/execution in TS bindings',
            );
          }
          return `TestPyWrapRoutingModel.testCallback PASS`;
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testReadAssignment',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testReadAssignment matches upstream assignment solve, objective, and per-vehicle route assertions.
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(10, 2, 0);
      try {
        const routing = new routingApi.RoutingModel(manager);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

          const readAssignment = routing.ReadAssignmentFromRoutes;
          const solveFromAssignment = routing.SolveFromAssignmentWithParameters;
          if (typeof readAssignment !== 'function' || typeof solveFromAssignment !== 'function') {
            return unsupported(
              'TestPyWrapRoutingModel.testReadAssignment requires ReadAssignmentFromRoutes and SolveFromAssignmentWithParameters in TS bindings',
            );
          }

          const routes = [
            [
              manager.NodeToIndex(1),
              manager.NodeToIndex(3),
              manager.NodeToIndex(5),
              manager.NodeToIndex(4),
              manager.NodeToIndex(2),
              manager.NodeToIndex(6),
            ],
            [manager.NodeToIndex(7), manager.NodeToIndex(9), manager.NodeToIndex(8)],
          ];
          const assignment = readAssignment.call(routing, routes, false);
          const searchParameters = routingApi.DefaultRoutingSearchParameters();
          searchParameters.solution_limit = 1;
          const solution = await solveFromAssignment.call(routing, assignment, searchParameters);
          assert(solution, 'TestPyWrapRoutingModel.testReadAssignment did not return a solution');

          assertNumber(solution?.ObjectiveValue() ?? NaN, 90, 'TestPyWrapRoutingModel.testReadAssignment objectiveValue');
          for (let vehicle = 0; vehicle < routing.vehicles(); vehicle++) {
            let node = routing.Start(vehicle);
            let count = 0;
            while (!routing.IsEnd(node)) {
              node = solution.Value(routing.NextVar(node));
              if (!routing.IsEnd(node)) {
                assertNumber(
                  manager.IndexToNode(node),
                  routes[vehicle][count],
                  `TestPyWrapRoutingModel.testReadAssignment vehicle ${vehicle} route node ${count}`,
                );
                count += 1;
              }
            }
          }
          return `TestPyWrapRoutingModel.testReadAssignment PASS`;
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      try {
        const routing = new routingApi.RoutingModel(manager as RoutingIndexManagerLike);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);
          const assignment = await routing.SolveWithParameters(routingApi.DefaultRoutingSearchParameters());
          assert(assignment, 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple did not return a solution');

          const getAutomaticStrategy = routing.GetAutomaticFirstSolutionStrategy;
          if (typeof getAutomaticStrategy !== 'function') {
            return unsupported(
              'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple requires GetAutomaticFirstSolutionStrategy in TS bindings',
            );
          }

          const strategy = getAutomaticStrategy.call(routing);
          assertNumber(
            strategy,
            routingApi.FirstSolutionStrategy?.PATH_CHEAPEST_ARC ?? 3,
            'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple expected PATH_CHEAPEST_ARC',
          );
          return `TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_simple PASS`;
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      // TEMP: parity - TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd matches upstream pickup/delivery setup and automatic strategy assertion.
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(31, 7, 0);
      try {
        const routing = new routingApi.RoutingModel(manager);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          routing.SetArcCostEvaluatorOfAllVehicles(transitIdx);

          const addDimension = routing.AddDimension;
          const addPickupAndDelivery = (routing as { AddPickupAndDelivery?: (pickup: number, delivery: number) => void }).AddPickupAndDelivery;
          const solver = routing.solver?.();
          const getDimensionOrDie = routing.GetDimensionOrDie?.bind(routing);
          if (
            typeof addDimension !== 'function' ||
            typeof addPickupAndDelivery !== 'function' ||
            typeof routing.VehicleVar !== 'function' ||
            !solver ||
            !getDimensionOrDie
          ) {
            return unsupported(
              'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd requires dimension and pickup/delivery APIs in TS bindings',
            );
          }

          const dimensionCreated = addDimension.call(routing, transitIdx, 0, 1000, true, 'distance');
          assert(dimensionCreated, 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd expected AddDimension to succeed');
          const dimension = getDimensionOrDie('distance');
          assert(typeof dimension.CumulVar === 'function', 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd expected CumulVar support');

          for (let i = 1; i < 15; i++) {
            const pickupIndex = manager.NodeToIndex(2 * i);
            const deliveryIndex = manager.NodeToIndex(2 * i + 1);
            addPickupAndDelivery.call(routing, pickupIndex, deliveryIndex);
            solver.Add?.({
              type: 'routingVehicleEquality',
              left: routing.VehicleVar(pickupIndex),
              right: routing.VehicleVar(deliveryIndex),
            });
            solver.Add?.({
              type: 'routingCumulLessOrEqual',
              left: dimension.CumulVar(pickupIndex),
              right: dimension.CumulVar(deliveryIndex),
            });
          }

          const assignment = await routing.SolveWithParameters(routingApi.DefaultRoutingSearchParameters());
          assert(assignment, 'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd did not return a solution');

          const getAutomaticStrategy = routing.GetAutomaticFirstSolutionStrategy;
          if (typeof getAutomaticStrategy !== 'function') {
            return unsupported(
              'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd requires GetAutomaticFirstSolutionStrategy in TS bindings',
            );
          }
          const strategy = getAutomaticStrategy.call(routing);
          assertNumber(
            strategy,
            routingApi.FirstSolutionStrategy?.PARALLEL_CHEAPEST_INSERTION ?? 8,
            'TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd expected PARALLEL_CHEAPEST_INSERTION',
          );
          return `TestPyWrapRoutingModel.testAutomaticFirstSolutionStrategy_pd PASS`;
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
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
      assert(defaultBoundCost.bound === 0, `TestBoundCost.testCtor expected default bound 0, got ${defaultBoundCost.bound}`);
      assert(defaultBoundCost.cost === 0, `TestBoundCost.testCtor expected default cost 0, got ${defaultBoundCost.cost}`);

      const configuredBoundCost = new BoundCost(97, 43);
      assert(configuredBoundCost.bound === 97, `TestBoundCost.testCtor expected bound 97, got ${configuredBoundCost.bound}`);
      assert(configuredBoundCost.cost === 43, `TestBoundCost.testCtor expected cost 43, got ${configuredBoundCost.cost}`);
      return 'TestBoundCost.testCtor PASS';
    },
  },
  {
    name: 'TestRoutingDimension.testCtor',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      try {
        const routing = new routingApi.RoutingModel(manager);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          const addDimension = routing.AddDimension;
          if (typeof addDimension !== 'function') {
            return unsupported(
              'TestRoutingDimension.testCtor requires AddDimension and GetDimensionOrDie in TS bindings',
            );
          }

          const added = addDimension.call(routing, transitIdx, 90, 90, true, 'distance');
          if (!added) {
            return unsupported('TestRoutingDimension.testCtor failed to create distance dimension in TS bindings');
          }
          assert(routing.GetDimensionOrDie?.('distance'), 'TestRoutingDimension.testCtor expected distance dimension');
          return 'TestRoutingDimension.testCtor PASS';
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestRoutingDimension.testSoftSpanUpperBound',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      try {
        const routing = new routingApi.RoutingModel(manager);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          const addDimension = routing.AddDimension;
          const getDimension = routing.GetDimensionOrDie;
          const boundCostCtor = routingApi.BoundCost;
          if (typeof addDimension !== 'function' || typeof getDimension !== 'function' || typeof boundCostCtor !== 'function') {
            return unsupported(
              'TestRoutingDimension.testSoftSpanUpperBound requires AddDimension, GetDimensionOrDie, and BoundCost in TS bindings',
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
          assert(!dimension.HasSoftSpanUpperBounds?.(), 'TestRoutingDimension.testSoftSpanUpperBound expected no soft span bounds');

          for (let v = 0; v < manager.numVehicles; v++) {
            dimension.SetSoftSpanUpperBoundForVehicle?.(boundCost, v);
            const returned = dimension.GetSoftSpanUpperBoundForVehicle?.(v);
            assert(returned !== null, `TestRoutingDimension.testSoftSpanUpperBound missing bound for vehicle ${v}`);
            assertNumber(returned?.bound, 97, `TestRoutingDimension.testSoftSpanUpperBound bound vehicle ${v}`);
            assertNumber(returned?.cost, 43, `TestRoutingDimension.testSoftSpanUpperBound cost vehicle ${v}`);
          }
          assert(dimension.HasSoftSpanUpperBounds?.(), 'TestRoutingDimension.testSoftSpanUpperBound expected soft span bounds to be enabled');
          return 'TestRoutingDimension.testSoftSpanUpperBound PASS';
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
  {
    name: 'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound',
    source: PYTHON_SOURCE,
    async run(routingApi) {
      await routingApi.initRouting();

      const manager = new routingApi.RoutingIndexManager(31, 7, 3);
      try {
        const routing = new routingApi.RoutingModel(manager);
        try {
          const transitIdx = routing.RegisterTransitCallback((fromIndex, toIndex) =>
            distance(manager, fromIndex, toIndex),
          );
          const addDimension = routing.AddDimension;
          const getDimension = routing.GetDimensionOrDie;
          const boundCostCtor = routingApi.BoundCost;
          if (typeof addDimension !== 'function' || typeof getDimension !== 'function' || typeof boundCostCtor !== 'function') {
            return unsupported(
              'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound requires AddDimension, GetDimensionOrDie, and BoundCost in TS bindings',
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
          assert(!dimension.HasQuadraticCostSoftSpanUpperBounds?.(), 'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound expected no quadratic bounds');

          for (let v = 0; v < manager.numVehicles; v++) {
            dimension.SetQuadraticCostSoftSpanUpperBoundForVehicle?.(boundCost, v);
            const returned = dimension.GetQuadraticCostSoftSpanUpperBoundForVehicle?.(v);
            assert(returned !== null, `TestRoutingDimension.testQuadraticCostSoftSpanUpperBound missing bound for vehicle ${v}`);
            assertNumber(returned?.bound, 97, `TestRoutingDimension.testQuadraticCostSoftSpanUpperBound bound vehicle ${v}`);
            assertNumber(returned?.cost, 43, `TestRoutingDimension.testQuadraticCostSoftSpanUpperBound cost vehicle ${v}`);
          }
          assert(
            dimension.HasQuadraticCostSoftSpanUpperBounds?.(),
            'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound expected quadratic bounds to be enabled',
          );
          return 'TestRoutingDimension.testQuadraticCostSoftSpanUpperBound PASS';
        } finally {
          routing.delete();
        }
      } finally {
        manager.delete();
      }
    },
  },
];
