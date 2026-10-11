import { routingExecutionOptions } from './execution.ts';

type Assignment = { objectiveValue(): bigint; localSearchProfile: string | null };
type Model = {
  registerTransitCallback(callback: (from: number, to: number) => number): number;
  setArcCostEvaluatorOfAllVehicles(index: number): void;
  solveWithParameters(parameters: Record<string, unknown>, options: unknown): Promise<Assignment | null>;
  solveFromAssignmentWithParameters(assignment: Assignment, parameters: Record<string, unknown>, options: unknown): Promise<Assignment | null>;
};
type Api = {
  RoutingIndexManager: new (nodes: number, vehicles: number, depot: number) => unknown;
  RoutingModel: new (manager: unknown, parameters?: Record<string, unknown>) => Model;
  defaultRoutingModelParameters(): { solverParameters?: { profileLocalSearch?: boolean; arraySplitSize?: number } };
};
function model(api: Api): Model {
  const routing = new api.RoutingModel(new api.RoutingIndexManager(27, 1, 0));
  const callback = routing.registerTransitCallback((from, to) => from === to ? 0 : 1 + ((from * 37 + to * 19 + from * to) % 103));
  routing.setArcCostEvaluatorOfAllVehicles(callback);
  return routing;
}
const source = 'ortools/constraint_solver/routing_parameters.proto';
const budget = { localSearchMetaheuristic: 'GUIDED_LOCAL_SEARCH', timeLimit: { seconds: 0n, nanos: 50000000 }, solutionLimit: 2147483648n };

export const searchParametersContractCases = [
  {
    name: 'RoutingSearchParameters.timeLimitStopsGuidedSearch', source,
    async run(api: Api) {
      const routing = model(api);
      const started = Date.now();
      const assignment = await routing.solveWithParameters({ ...budget, localSearchOperators: { useTwoOpt: 'BOOL_FALSE' }, satParameters: { noOverlap2dBooleanRelationsLimit: 7, subsolverParams: [{ name: 'routing-fixture', useEnergeticReasoningInNoOverlap2d: true }] }, globalCheapestInsertionLsOperatorParameters: { useNeighborsRatioForInitialization: false } }, routingExecutionOptions());
      if (!assignment || assignment.objectiveValue() <= 0n) throw new Error('Bounded routing search did not return an incumbent');
      if (Date.now() - started > 5000) throw new Error('Routing guided search exceeded the external time bound');
      return 'RoutingSearchParameters.timeLimitStopsGuidedSearch PASS';
    },
  },
  {
    name: 'RoutingSearchParameters.timeLimitAppliesToWarmStart', source,
    async run(api: Api) {
      const routing = model(api);
      const seed = await routing.solveWithParameters({ solutionLimit: 1 }, routingExecutionOptions());
      if (!seed) throw new Error('Routing seed has no solution');
      const started = Date.now();
      const assignment = await routing.solveFromAssignmentWithParameters(seed, budget, routingExecutionOptions());
      if (!assignment || assignment.objectiveValue() > seed.objectiveValue()) throw new Error('Bounded warm start failed to preserve or improve its seed');
      if (Date.now() - started > 5000) throw new Error('Routing warm start exceeded the external time bound');
      return 'RoutingSearchParameters.timeLimitAppliesToWarmStart PASS';
    },
  },
  {
    name: 'RoutingSearchParameters.explicitZeroIsValidated', source: 'ortools/constraint_solver/python/pywraprouting_test.py',
    async run(api: Api) {
      const routing = model(api);
      try {
        await routing.solveWithParameters({ localSearchOperators: { useCross: 0 } }, routingExecutionOptions());
      } catch (error) {
        if (!String(error).includes('cross')) throw error;
        return 'RoutingSearchParameters.explicitZeroIsValidated PASS';
      }
      throw new Error('Explicit BOOL_UNSPECIFIED was ignored instead of failing native parameter validation');
    },
  },
];

searchParametersContractCases.push({
  name: 'RoutingModelParameters.nativeProfileAndSparseDefaults',
  source: 'ortools/constraint_solver/python/pywraprouting_test.py',
  async run(api: Api) {
    const parameters = api.defaultRoutingModelParameters();
    parameters.solverParameters = { profileLocalSearch: true, arraySplitSize: 8 };
    const routing = new api.RoutingModel(new api.RoutingIndexManager(10, 1, 0), {
      ...parameters, reduceVehicleCostModel: false, maxCallbackCacheSize: 0,
    });
    const callback = routing.registerTransitCallback((from, to) => from === to ? 0 : 1 + ((from * 37 + to * 19) % 103));
    routing.setArcCostEvaluatorOfAllVehicles(callback);
    const assignment = await routing.solveWithParameters({ solutionLimit: 3n }, routingExecutionOptions());
    if (!assignment || assignment.objectiveValue() <= 0n) throw new Error('Configured Routing model failed to solve');
    const profile = assignment.localSearchProfile;
    if (!profile || !profile.includes('Local search') || profile.includes('not exposed')) throw new Error('Expected actual native local-search statistics');
    return 'RoutingModelParameters.nativeProfileAndSparseDefaults PASS';
  },
}, {
  name: 'RoutingModelParameters.invalidBlockSizeRejected',
  source: 'ortools/constraint_solver/solver_parameters.proto',
  async run(api: Api) {
    const routing = new api.RoutingModel(new api.RoutingIndexManager(4, 1, 0), { solverParameters: { arraySplitSize: 0 } });
    try { await routing.solveWithParameters({}, routingExecutionOptions()); }
    catch (error) {
      if (!String(error).includes('RoutingModelParameters')) throw error;
      return 'RoutingModelParameters.invalidBlockSizeRejected PASS';
    }
    throw new Error('Invalid model block size was ignored');
  },
});
