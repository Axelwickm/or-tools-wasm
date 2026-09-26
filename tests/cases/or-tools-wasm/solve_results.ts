import {
  assertCaseMatrix, executorFixtureModes, passedCase, serverExecutorConfiguration,
  type ExecutorFixtureMode, type SharedCase,
} from '../../harness/shared_case.ts';

export type SolveResultApis = {
  cpSat: typeof import('or-tools-wasm/cp-sat');
  mp: typeof import('or-tools-wasm/mp-solver');
  routing: typeof import('or-tools-wasm/routing');
  knapsack: typeof import('or-tools-wasm/knapsack');
  flow: typeof import('or-tools-wasm/network-flow');
  cover: typeof import('or-tools-wasm/set-cover');
  mathopt: typeof import('or-tools-wasm/mathopt');
};

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}

function throws(fn: () => unknown) {
  try { fn(); } catch (error) { if (error instanceof Error) return; throw error; }
  throw new Error('Expected value access to reject a result without a solution');
}

function execution(mode: ExecutorFixtureMode = 'direct') {
  return { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
}

export const solveResultCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [
  {
    id: 'solvers.solve.exact_int64', name: 'Knapsack, flow, and routing preserve exact int64 values', solver: 'network-flow',
    async run({ knapsack, flow, routing }, { mode }) {
      const exact = 9_007_199_254_740_993n;
      const options = execution(mode);
      const bag = new knapsack.KnapsackSolver(knapsack.KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER, 'exact');
      bag.init([exact], [[1]], [1]);
      equal((await bag.solve(options)).profit, exact);
      const network = new flow.SimpleMaxFlow();
      network.addArcWithCapacity(0, 1, exact);
      const result = await network.solve({ ...options, source: 0, sink: 1 });
      equal(result.status, flow.SimpleMaxFlowStatus.OPTIMAL);
      equal(result.optimalFlow, exact);
      equal(result.flow(0), exact);
      const cost = new flow.SimpleMinCostFlow();
      cost.addArcWithCapacityAndUnitCost(0, 1, exact, 1);
      cost.setNodeSupply(0, exact);
      cost.setNodeSupply(1, -exact);
      const costResult = await cost.solve(options);
      equal(costResult.optimalCost, exact);
      equal(costResult.flow(0), exact);
      const assignment = new flow.SimpleLinearSumAssignment();
      assignment.addArcWithCost(0, 0, exact);
      const assignmentResult = await assignment.solve(options);
      equal(assignmentResult.optimalCost, exact);
      equal(assignmentResult.assignmentCost(0), exact);
      const route = new routing.RoutingModel(new routing.RoutingIndexManager(2, 1, 0));
      route.setArcCostEvaluatorOfAllVehicles(route.registerTransitMatrix([[0n, exact], [0n, 0n]]));
      equal((await route.solve(options)).assignment?.objectiveValue(), exact);
      return {};
    },
  },
  {
    id: 'cp_sat.solve.result_contract', name: 'CP-SAT results survive model edits and infeasible solves', solver: 'cp-sat',
    async run({ cpSat: { CpSat, CpModel } }, { mode }) {
      const model = new CpModel();
      const x = model.newIntVar(0, 10, 'x');
      model.maximize(x);
      const options = { ...execution(mode), numWorkers: 1 };
      const first = await CpSat.solve(model, options);
      equal(first.hasSolution, true);
      equal(first.value(x), 10n);
      model.add(x.le(3));
      const second = await CpSat.solve(model, options);
      equal(second.value(x), 3n);
      model.add(x.ge(4));
      const failed = await CpSat.solve(model, options);
      equal(failed.hasSolution, false);
      equal(failed.objectiveValue, null);
      throws(() => failed.value(x));
      equal(first.value(x), 10n);
      equal(first.objectiveValue, 10);
      equal(second.value(x), 3n);
      return {};
    },
  },
  {
    id: 'mp_solver.solve.result_contract', name: 'MP results survive model edits and infeasible solves', solver: 'mp-solver',
    async run({ mp: { MpModel, MPSolver } }, { mode }) {
      const model = new MpModel();
      const x = model.addNumVariable(0, 10, 'x');
      model.objective().setCoefficient(x, 1);
      model.objective().setMaximization();
      const first = await MPSolver.solve(model, execution(mode));
      equal(first.hasSolution, true);
      equal(first.value(x), 10);
      model.addConstraint(0, 3).setCoefficient(x, 1);
      const second = await MPSolver.solve(model, execution(mode));
      equal(second.value(x), 3);
      model.addConstraint(4, 10).setCoefficient(x, 1);
      const failed = await MPSolver.solve(model, execution(mode));
      equal(failed.hasSolution, false);
      equal(failed.objectiveValue, null);
      throws(() => failed.value(x));
      equal(first.value(x), 10);
      equal(first.objectiveValue, 10);
      equal(second.value(x), 3);
      return {};
    },
  },
  {
    id: 'routing.solve.result_contract', name: 'Routing results survive later solves and infeasibility', solver: 'routing',
    async run({ routing: { RoutingIndexManager, RoutingModel } }, { mode }) {
      const model = new RoutingModel(new RoutingIndexManager(3, 1, 0));
      model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 1));
      model.addDimension(model.registerTransitCallback(() => 1), 0, 10, true, 'distance');
      const first = await model.solve(execution(mode));
      equal(first.hasSolution, true);
      equal(first.assignment?.objectiveValue(), 3n);
      const firstNext = first.assignment!.value(0);
      model.setArcCostEvaluatorOfAllVehicles(model.registerTransitCallback(() => 2));
      const second = await model.solve(execution(mode));
      equal(second.assignment?.objectiveValue(), 6n);
      const foreign = new RoutingModel(new RoutingIndexManager(3, 1, 0));
      foreign.addDimension(foreign.registerTransitCallback(() => 1), 0, 10, true, 'distance');
      equal(first.assignment!.value(model.getDimensionOrDie('distance').cumulVar(0)), 0n);
      throws(() => first.assignment!.value(foreign.getDimensionOrDie('distance').cumulVar(0)));
      model.addDimension(model.registerTransitCallback(() => 1), 0, 0, true, 'impossible');
      const failed = await model.solve(execution(mode));
      equal(failed.hasSolution, false);
      equal(failed.assignment, null);
      equal(first.hasSolution, true);
      equal(first.assignment?.objectiveValue(), 3n);
      equal(first.assignment?.value(0), firstNext);
      equal(second.assignment?.objectiveValue(), 6n);
      return {};
    },
  },
  {
    id: 'knapsack.solve.result_contract', name: 'Knapsack results survive reinitialization', solver: 'knapsack',
    async run({ knapsack: { KnapsackSolver, KnapsackSolverType } }, { mode }) {
      const bounded = new KnapsackSolver(KnapsackSolverType.KNAPSACK_64ITEMS_SOLVER, 'limits');
      bounded.setUseReduction(false);
      throws(() => bounded.init(Array(65).fill(1), [Array(65).fill(1)], [1]));
      throws(() => bounded.init([1], [[1], [1]], [1, 1]));
      bounded.init(Array(64).fill(1), [Array(64).fill(1)], [1]);
      equal((await bounded.solve(execution(mode))).profit, 1n);
      const model = new KnapsackSolver(KnapsackSolverType.KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER, 'results');
      model.init([5, 7], [[2, 3]], [3]);
      const first = await model.solve(execution(mode));
      model.init([5, 7], [[2, 3]], [2]);
      const second = await model.solve(execution(mode));
      equal(first.profit, 7n);
      equal(first.contains(1), true);
      equal(first.contains(0), false);
      equal(second.profit, 5n);
      equal(second.contains(0), true);
      equal(second.contains(1), false);
      return {};
    },
  },
  {
    id: 'network_flow.solve.result_contract', name: 'Flow and assignment results survive model edits', solver: 'network-flow',
    async run({ flow: { SimpleMaxFlow, SimpleMinCostFlow, SimpleLinearSumAssignment } }, { mode }) {
      const options = execution(mode);
      const flow = new SimpleMaxFlow();
      throws(() => flow.addArcWithCapacity(0, 1, NaN));
      equal(flow.numArcs(), 0);
      flow.addArcWithCapacity(0, 1, 4);
      const first = await flow.solve({ ...options, source: 0, sink: 1 });
      flow.setArcCapacity(0, 9);
      const second = await flow.solve({ ...options, source: 0, sink: 1 });
      equal(first.flow(0), 4n);
      equal(first.optimalFlow, 4n);
      equal(second.flow(0), 9n);
      const cost = new SimpleMinCostFlow();
      throws(() => cost.addArcWithCapacityAndUnitCost(0, 1, 4, NaN));
      equal(cost.numArcs(), 0);
      cost.addArcWithCapacityAndUnitCost(0, 1, 4, 2);
      cost.setNodeSupply(0, 4);
      cost.setNodeSupply(1, -4);
      const firstCost = await cost.solve(options);
      cost.setNodeSupply(0, 2);
      cost.setNodeSupply(1, -2);
      const secondCost = await cost.solve(options);
      equal(firstCost.optimalCost, 8n);
      equal(firstCost.flow(0), 4n);
      equal(secondCost.optimalCost, 4n);
      const assignment = new SimpleLinearSumAssignment();
      throws(() => assignment.addArcWithCost(0, 0, NaN));
      equal(assignment.numArcs(), 0);
      assignment.addArcWithCost(0, 0, 3);
      const firstAssignment = await assignment.solve(options);
      assignment.addArcWithCost(0, 0, 1);
      const secondAssignment = await assignment.solve(options);
      equal(firstAssignment.optimalCost, 3n);
      equal(firstAssignment.assignmentCost(0), 3n);
      equal(secondAssignment.optimalCost, 1n);
      return {};
    },
  },
  {
    id: 'set_cover.solve.result_contract', name: 'Set cover results survive cost changes', solver: 'set-cover',
    async run({ cover: { SetCover, SetCoverModel } }, { mode }) {
      const model = new SetCoverModel();
      model.addEmptySubset(2);
      model.addElementToLastSubset(0);
      model.addEmptySubset(5);
      model.addElementToLastSubset(0);
      const first = await SetCover.solve(model, execution(mode));
      model.setSubsetCost(1, 1);
      const second = await SetCover.solve(model, execution(mode));
      equal(first.hasSolution, true);
      equal(first.cost, 2);
      equal(first.contains(0), true);
      equal(first.contains(1), false);
      equal(second.cost, 1);
      equal(second.contains(1), true);
      return {};
    },
  },
  {
    id: 'mathopt.solve.result_contract', name: 'MathOpt accessors reject infeasible results', solver: 'mathopt',
    async run({ mathopt: { MathOpt } }, { mode }) {
      const model = MathOpt.Model();
      const x = model.addVariable({ lowerBound: 0, upperBound: 10, name: 'x' });
      model.maximize(x);
      const first = await MathOpt.solve(model, execution(mode));
      equal(first.hasSolution, true);
      equal(first.value(x), 10);
      first.variableValuesById[x.id] = 123;
      first.solutions.find((solution) => solution.primalSolution?.feasibilityStatus === 'SOLUTION_STATUS_FEASIBLE')!
        .primalSolution!.variableValuesById[x.id] = 456;
      equal(first.value(x), 10);
      model.addLinearConstraint({ expression: x, upperBound: -1 });
      const failed = await MathOpt.solve(model, execution(mode));
      equal(failed.hasSolution, false);
      equal(failed.objectiveValue, null);
      throws(() => failed.value(x));
      equal(first.value(x), 10);
      return {};
    },
  },
  {
    id: 'mp_solver.solve.parameter_transport', name: 'MP primal tolerance changes native feasibility', solver: 'mp-solver',
    async run({ mp: { MpModel, MPSolver, PresolveValues } }, { mode }) {
      // GLPK supports MPSolver primal tolerance; GLOP ignores that parameter.
      const model = new MpModel();
      const x = model.addNumVariable(0, 1, 'x');
      model.addConstraint(1.00001, Infinity).setCoefficient(x, 1);
      const options = { ...execution(mode), solverType: MPSolver.GLPK_LINEAR_PROGRAMMING };
      const loose = await MPSolver.solve(model, { ...options,
        parameters: { presolve: PresolveValues.PRESOLVE_OFF, primalTolerance: 1e-3 },
      });
      const tight = await MPSolver.solve(model, { ...options,
        parameters: { presolve: PresolveValues.PRESOLVE_OFF, primalTolerance: 1e-8 },
      });
      equal(loose.hasSolution, true);
      equal(tight.hasSolution, false);
      equal(tight.status, MPSolver.INFEASIBLE);
      return {};
    },
  },
];

export async function runSolveResultCases(
  apis: SolveResultApis,
  { modes = executorFixtureModes, solver }: { modes?: readonly ExecutorFixtureMode[]; solver?: string } = {},
) {
  const results = [];
  const cases = solveResultCases.filter((item) => !solver || item.solver === solver);
  for (const testCase of cases) {
    for (const mode of modes) {
      try {
        results.push(passedCase(testCase, { mode }, await testCase.run(apis, { mode })));
      } catch (error) {
        throw new Error(`${testCase.id} (${mode}): ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  assertCaseMatrix(results, cases, modes);
  return results;
}
