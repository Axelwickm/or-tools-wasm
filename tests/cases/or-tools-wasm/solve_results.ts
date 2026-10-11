import { adversarialSolveCases } from './adversarial.ts';
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
  ...adversarialSolveCases,
  {
    id: 'mathopt.expressions.builders', name: 'MathOpt term constructors, summation and evaluation preserve all inputs', solver: 'mathopt',
    async run({ mathopt: { MathOpt } }) {
      const model = MathOpt.Model();
      const x = model.addVariable(), y = model.addVariable();
      const alias = model.getVariable(x.id)!;
      const linear = new MathOpt.LinearExpression([{ variable: x, coefficient: 2 }, { variable: alias, coefficient: -1 }], 3);
      equal(linear.terms.size, 1);
      equal(linear.evaluate(new Map([[x, 4]])), 7);
      equal(MathOpt.asFlatLinearExpression(2).add(3).offset, 5);
      const quadratic = new MathOpt.QuadraticExpression([{ variable: x, coefficient: 1 }], [
        { firstVariable: x, secondVariable: y, coefficient: 4 },
        { firstVariable: y, secondVariable: alias, coefficient: -1 },
      ], 3);
      equal(quadratic.quadraticTerms.size, 1);
      equal(quadratic.evaluate(new Map([[x, 2], [y, 4]])), 29);
      throws(() => Reflect.construct(MathOpt.LinearExpression, [2, 3]));
      throws(() => Reflect.construct(MathOpt.QuadraticExpression, [x, [{ firstVariable: x, secondVariable: x, coefficient: 4 }]]));
      equal(MathOpt.asFlatLinearExpression(linear), linear);
      equal(MathOpt.asFlatQuadraticExpression(quadratic), quadratic);
      const foreign = MathOpt.Model().addVariable();
      equal(new MathOpt.LinearExpression([{ variable: x, coefficient: 1 }, { variable: foreign, coefficient: 2 }]).terms.size, 2);
      const cancelled = MathOpt.fastSum([x, MathOpt.linearTerm(alias, -1), MathOpt.quadraticTerm(x, y),
        MathOpt.quadraticTerm(y, alias, -1), 2, 3]);
      equal(cancelled instanceof MathOpt.QuadraticExpression, true);
      equal(cancelled.evaluate(new Map()), 5);

      // Count work instead of asserting machine-dependent timing. Exact handle
      // lookup should not scan keys, and a large sum should not compare all pairs.
      const variables = Array.from({ length: 1024 }, () => model.addVariable());
      let comparisons = 0, consumed = 0;
      for (const variable of variables) {
        const equals = variable.equals.bind(variable);
        variable.equals = other => { comparisons++; return equals(other); };
      }
      function* inputs() { for (const variable of variables) { consumed++; yield variable; } }
      const sum = MathOpt.fastSum(inputs());
      equal(consumed, variables.length);
      equal(sum instanceof MathOpt.LinearExpression, true);
      const values = new Map(variables.map(variable => [variable, 1] as const));
      values.keys = () => { throw new Error('Exact handle evaluation must not scan map keys.'); };
      equal(sum.evaluate(values), variables.length);
      if (comparisons > variables.length) throw new Error(`Summation performed ${comparisons} handle comparisons.`);
      return {};
    },
  },
  {
    id: 'mathopt.parameters.ownership', name: 'MathOpt expressions and solve parameters preserve model ownership', solver: 'mathopt',
    async run({ mathopt: { MathOpt, MathOptModelSolveParameters, MathOptSolutionHint, MathOptSparseVectorFilter } }) {
      const model = MathOpt.Model();
      const x = model.addVariable();
      const row = model.addLinearConstraint();
      const other = MathOpt.Model();
      const foreign = other.addVariable();
      const foreignRow = other.addLinearConstraint();
      const expression = MathOpt.asFlatLinearExpression(x).multiply(2);
      const quadratic = MathOpt.multiplyLinearExpressions(expression, expression);
      for (const terms of [expression.terms, quadratic.linearTerms, quadratic.quadraticTerms]) {
        throws(() => (terms as Map<unknown, number>).clear());
        terms.forEach((_value, _key, view) => {
          equal(view, terms);
          throws(() => (view as Map<unknown, number>).clear());
        });
      }
      equal(expression.evaluate(new Map([[x, 1]])), 2);
      equal(expression.evaluate(expression.terms), 4);
      equal(quadratic.evaluate(new Map([[x, 1]])), 4);
      equal(x.equals(model.getVariable(x.id)!), true);
      equal(x.equals(foreign), false);
      equal(MathOpt.eq(x, x).lowerBound, 0);
      const rejected = [
        { variableValuesFilter: [foreign] },
        { reducedCostsFilter: { elements: [foreign] } },
        { variableValuesFilter: new MathOptSparseVectorFilter({ elements: [foreign] }) },
        { dualValuesFilter: [foreignRow] },
        { solutionHints: [{ variableValues: [{ variable: foreign, value: 1 }] }] },
        { solutionHints: [new MathOptSolutionHint({ dualValues: [{ linearConstraint: foreignRow, value: 1 }] })] },
        { branchingPriorities: [{ variable: foreign, priority: 1 }] },
        { lazyLinearConstraints: [foreignRow] },
      ];
      for (const parameters of rejected) throws(() => new MathOptModelSolveParameters(parameters).toProtoBytes(model));
      const valid = new MathOptModelSolveParameters({ variableValuesFilter: [x], dualValuesFilter: [row],
        solutionHints: [{ variableValues: [{ variable: x, value: 1 }], dualValues: [{ linearConstraint: row, value: 0 }] }],
        branchingPriorities: [{ variable: x, priority: 1 }], lazyLinearConstraints: [row] });
      valid.toProtoBytes(model);
      // Explicit IDs and bytes have no handle ownership; native code validates them.
      new MathOptModelSolveParameters({ variableValuesFilter: { ids: [foreign.id] },
        solutionHints: [new Uint8Array()], lazyLinearConstraints: [foreignRow.id] }).toProtoBytes(model);
      throws(() => new MathOptSparseVectorFilter({ ids: [], elements: [x] }).toProtoBytes());
      model.deleteVariable(x);
      throws(() => valid.toProtoBytes());
      throws(() => new MathOptSolutionHint({ variableValues: [{ variable: x, value: 1 }] }).toProtoBytes());
      model.deleteLinearConstraint(row);
      throws(() => new MathOptModelSolveParameters({ lazyLinearConstraints: [row] }).toProtoBytes());
      return {};
    },
  },
  {
    id: 'mathopt.solve.id_vectors', name: 'MathOpt keeps unnamed values and gives empty filters consistent semantics', solver: 'mathopt',
    async run({ mathopt: { MathOpt, MathOptSparseVectorFilter } }, { mode }) {
      const model = MathOpt.Model();
      const x = model.addVariable({ lowerBound: 1, upperBound: 1 });
      const y = model.addVariable({ lowerBound: 2, upperBound: 2 });
      model.minimize(MathOpt.fastSum([x, y]));
      const options = { ...execution(mode), solverType: 'GLOP' as const };
      const answer = await MathOpt.solve(model, options);
      equal(answer.value(x), 1);
      equal(answer.value(y), 2);
      equal(Object.keys(answer.variableValuesById).length, 2);
      equal(answer.solutions[0].primalSolution?.variableValuesById[y.id], 2);
      equal('variableValues' in answer, false);
      for (const filter of [[], { ids: [] }, { elements: [] }, new MathOptSparseVectorFilter({ ids: [] })]) {
        const filtered = await MathOpt.solve(model, { ...options, modelParameters: { variableValuesFilter: filter } });
        equal(filtered.hasSolution, true);
        equal(Object.keys(filtered.variableValuesById).length, 0);
        throws(() => filtered.value(x));
      }
      for (const filter of [{}, { ids: [], filterByIds: false }]) {
        equal((await MathOpt.solve(model, { ...options, modelParameters: { variableValuesFilter: filter } })).value(y), 2);
      }
      equal(answer.value(x), 1);
      return {};
    },
  },
  {
    id: 'cp_sat.solve.owned_diagnostics', name: 'CP-SAT responses and diagnostics are owned; validation respects execution options', solver: 'cp-sat',
    async run({ cpSat: { CpSat, CpModel, CpSolver } }, { mode }) {
      const model = new CpModel();
      const x = model.newIntVar(1, 1, 'x');
      const options = { ...execution(mode), numWorkers: 1 };
      equal(await model.validate(options), '');
      const solver = new CpSolver();
      await solver.solve(model, options);
      const copy = solver.response!;
      copy.solution![0] = 77n;
      copy.wallTime = -1;
      equal(solver.value(x), 1n);
      if (solver.wallTime < 0) throw new Error('Response mutation changed stored diagnostics');
      const result = await CpSat.solve(model, options);
      equal(result.statusName(), 'OPTIMAL');
      equal(result.wallTime, result.response!.wallTime ?? 0);
      equal(result.numConflicts, Number(result.response!.numConflicts ?? 0));
      const statistics = result.responseStats();
      if (!statistics.includes('CpSolverResponse summary')) throw new Error('Result lacks native statistics');
      const assumption = model.newBoolVar('assumption');
      model.add(assumption.eq(0));
      model.addAssumption(assumption);
      const infeasible = await CpSat.solve(model, options);
      equal(infeasible.statusName(), 'INFEASIBLE');
      equal(infeasible.sufficientAssumptionsForInfeasibility()[0], assumption.index);
      infeasible.sufficientAssumptionsForInfeasibility().push(999);
      equal(infeasible.sufficientAssumptionsForInfeasibility().length, 1);
      equal(result.responseStats(), statistics);
      equal(result.value(x), 1n);
      const controller = new AbortController();
      controller.abort();
      try {
        await model.validate({ ...execution(mode), signal: controller.signal });
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
        return {};
      }
      throw new Error('Pre-aborted model validation did not reject');
    },
  },
  {
    id: 'mathopt.handles.registration', name: 'MathOpt rejects forged handles and preserves registered handles', solver: 'mathopt',
    async run({ mathopt: { MathOptModel, MathOptQuadraticConstraint, MathOptIndicatorConstraint } }) {
      const model = new MathOptModel();
      const x = model.addVariable({ lowerBound: 0, upperBound: 1 });
      const row = model.addLinearConstraint({ lowerBound: 0, upperBound: 1 });
      const quadratic = model.addQuadraticConstraint({ lowerBound: 0, upperBound: 1 });
      const indicator = model.addIndicatorConstraint({ upperBound: 1 });
      const fakeVariable = Reflect.construct(x.constructor, [model,
        { id: x.id, lowerBound: 0, upperBound: 1, integer: false, name: '', deleted: false }]);
      throws(() => model.minimize(fakeVariable));
      const fakeRow = Reflect.construct(row.constructor, [model,
        { id: row.id, lowerBound: 0, upperBound: 1, terms: [], name: '', deleted: false }]);
      throws(() => model.deleteLinearConstraint(fakeRow));
      const fakeQuadratic = Reflect.construct(MathOptQuadraticConstraint, [model,
        { id: quadratic.id, lowerBound: 0, upperBound: 1, linearTerms: [], quadraticTerms: [], name: '', deleted: false }]);
      throws(() => model.deleteQuadraticConstraint(fakeQuadratic));
      const fakeIndicator = Reflect.construct(MathOptIndicatorConstraint, [model,
        { id: indicator.id, lowerBound: -Infinity, upperBound: 1, activateOnZero: false, terms: [], name: '', deleted: false }]);
      throws(() => model.deleteIndicatorConstraint(fakeIndicator));
      equal(model.hasVariable(x.id), true);
      equal(model.hasLinearConstraint(row.id), true);
      equal(model.hasQuadraticConstraint(quadratic.id), true);
      equal(model.hasIndicatorConstraint(indicator.id), true);
      model.minimize(model.getVariable(x.id)!);
      model.deleteLinearConstraint(model.getLinearConstraint(row.id)!);
      model.deleteQuadraticConstraint(model.getQuadraticConstraint(quadratic.id)!);
      model.deleteIndicatorConstraint(model.getIndicatorConstraint(indicator.id)!);
      equal(model.hasLinearConstraint(row.id), false);
      equal(model.hasQuadraticConstraint(quadratic.id), false);
      equal(model.hasIndicatorConstraint(indicator.id), false);
      return {};
    },
  },
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
      equal(first.bestObjectiveBound, null);
      model.addConstraint(0, 3).setCoefficient(x, 1);
      const second = await MPSolver.solve(model, execution(mode));
      equal(second.value(x), 3);
      model.addConstraint(4, 10).setCoefficient(x, 1);
      const failed = await MPSolver.solve(model, execution(mode));
      equal(failed.hasSolution, false);
      equal(failed.objectiveValue, null);
      equal(failed.bestObjectiveBound, null);
      equal(Object.prototype.hasOwnProperty.call(failed.response, 'objectiveValue'), false);
      throws(() => failed.value(x));
      equal(first.value(x), 10);
      equal(first.objectiveValue, 10);
      equal(second.value(x), 3);
      const legacy = MPSolver.createSolver('GLOP');
      if (!legacy) throw new Error('GLOP factory unavailable');
      const bounded = legacy.addNumVariable(0, 1, 'bounded');
      legacy.objective().setCoefficient(bounded, 1);
      legacy.objective().setMaximization();
      await legacy.solve(execution(mode));
      equal(legacy.objective().bestBound(), Number.NEGATIVE_INFINITY);
      legacy.objective().setMinimization();
      await legacy.solve(execution(mode));
      equal(legacy.objective().value(), 0);
      equal(legacy.objective().bestBound(), Number.POSITIVE_INFINITY);
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
    id: 'knapsack.solve.shared_mp_runtime', name: 'Knapsack and MPSolver coordinate their shared native runtime', solver: 'knapsack',
    async run({ knapsack, mp }, { mode }) {
      const bag = new knapsack.KnapsackSolver(knapsack.KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER, 'parallel bag');
      bag.init([3, 5, 9], [[2, 3, 5]], [5]);
      const model = new mp.MpModel('parallel integer model');
      const x = model.addIntVariable(0, 1, 'x');
      model.objective().setCoefficient(x, 7);
      model.objective().setMaximization();
      const options = execution(mode);
      const [packed, linear] = await Promise.all([
        bag.solve({ ...options, numWorkers: 4 }),
        mp.MPSolver.solve(model, { ...options, solverType: mp.MPSolver.SAT_INTEGER_PROGRAMMING, threads: 4 }),
      ]);
      equal(packed.profit, 9n);
      equal(packed.contains(2), true);
      equal(linear.objectiveValue, 7);
      equal(linear.value(x), 1);
      equal((await bag.solve(options)).profit, 9n);
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
    async run({ cover: { SetCover, SetCoverModel, SetCoverInvariant, GreedySolutionGenerator, GuidedLocalSearch } }, { mode }) {
      const model = new SetCoverModel();
      model.addEmptySubset(2);
      model.addElementToLastSubset(0);
      model.addEmptySubset(5);
      model.addElementToLastSubset(0);
      const first = await SetCover.solve(model, execution(mode));
      model.setSubsetCost(1, 1);
      const second = await SetCover.solve(model, execution(mode));
      equal(first.hasSolution, true);
      const limited = await SetCover.solve(model, { ...execution(mode), timeLimitSeconds: 0 });
      equal(limited.hasSolution, true);
      equal(limited.numUncoveredElements, 0);
      equal(limited.selectedSubsets().length, 1);
      equal(limited.cost, second.cost);
      equal(first.cost, 2);
      equal(first.contains(0), true);
      equal(first.contains(1), false);
      equal(second.cost, 1);
      equal(second.contains(1), true);
      const infeasible = new SetCoverModel();
      infeasible.addEmptySubset(1);
      infeasible.addElementToLastSubset(1); // Element zero cannot be covered.
      const partial = await SetCover.solve(infeasible, { ...execution(mode), algorithm: 'trivial' });
      equal(partial.numUncoveredElements, 1);
      equal(partial.hasSolution, false);
      const greedyPartial = await SetCover.solve(infeasible, execution(mode));
      equal(greedyPartial.hasSolution, false);
      equal(greedyPartial.numUncoveredElements, 1);
      equal(first.hasSolution, true);
      const invariant = new SetCoverInvariant(model);
      const generator = new GreedySolutionGenerator(invariant);
      equal(await generator.nextSolution([], execution(mode)), true);
      equal(await invariant.numUncoveredElements(execution(mode)), 1);
      let invalidFocusRejected = false;
      try { await generator.nextSolution([false], execution(mode)); }
      catch (error) { invalidFocusRejected = error instanceof RangeError; }
      equal(invalidFocusRejected, true);
      generator.setTimeLimitInSeconds(0);
      equal(await generator.nextSolution(undefined, execution(mode)), true);
      equal(await invariant.numUncoveredElements(execution(mode)), 0);
      generator.resetLimits();
      equal(await generator.nextSolution(undefined, execution(mode)), true);
      equal(await invariant.numUncoveredElements(execution(mode)), 0);
      const guided = new GuidedLocalSearch(invariant);
      guided.setMaxIterations(40);
      guided.setTimeLimitInSeconds(0);
      try {
        await guided.nextSolution(undefined, execution(mode));
        equal(await invariant.numUncoveredElements(execution(mode)), 0);
      } finally { await guided.close(); }
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
  {
    id: 'knapsack.solve.concurrent_snapshots', name: 'Knapsack jobs capture independent inputs and cancellation', solver: 'knapsack',
    async run({ knapsack: { KnapsackSolver, KnapsackSolverType } }, { mode }) {
      const solver = new KnapsackSolver(KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER, 'snapshots');
      solver.init([5, 9], [[1, 1]], [1]);
      const firstJob = solver.solve(execution(mode));
      solver.init([2, 4, 8], [[1, 1, 1]], [1]);
      const secondJob = solver.solve(execution(mode === 'direct' ? 'worker' : mode === 'worker' ? 'direct' : 'server'));
      const [first, second] = await Promise.all([firstJob, secondJob]);
      equal(first.profit, 9n); equal(first.contains(1), true); throws(() => first.contains(2));
      equal(second.profit, 8n); equal(second.contains(2), true);
      const controller = new AbortController(); controller.abort();
      const aborted = await Promise.allSettled([0, 1].map(() => solver.solve({ ...execution(mode), signal: controller.signal })));
      equal(aborted.every(result => result.status === 'rejected' && result.reason.name === 'AbortError'), true);
      return {};
    },
  },
  {
    id: 'network_flow.solve.concurrent_snapshots', name: 'Flow and assignment jobs capture independent inputs and cancellation', solver: 'network-flow',
    async run({ flow: { SimpleMaxFlow, SimpleMinCostFlow, SimpleLinearSumAssignment } }, { mode }) {
      const alternate = execution(mode === 'direct' ? 'worker' : mode === 'worker' ? 'direct' : 'server');
      const max = new SimpleMaxFlow(); max.addArcWithCapacity(0, 1, 10);
      const maxJob = max.solve({ ...execution(mode), source: 0, sink: 1 });
      max.setArcCapacity(0, 4);
      const maxAnswers = await Promise.all([maxJob, max.solve({ ...alternate, source: 0, sink: 1 })]);
      equal(maxAnswers[0].optimalFlow, 10n); equal(maxAnswers[1].optimalFlow, 4n);
      const min = new SimpleMinCostFlow(); min.addArcWithCapacityAndUnitCost(0, 1, 10, 3);
      min.setNodeSupply(0, 10); min.setNodeSupply(1, -10);
      const minJob = min.solve(execution(mode));
      min.setNodeSupply(0, 4); min.setNodeSupply(1, -4);
      const minAnswers = await Promise.all([minJob, min.solve(alternate)]);
      equal(minAnswers[0].optimalCost, 30n); equal(minAnswers[1].optimalCost, 12n);
      const assignment = new SimpleLinearSumAssignment(); assignment.addArcWithCost(0, 0, 2);
      const assignmentJob = assignment.solve(execution(mode));
      assignment.addArcWithCost(0, 0, 1);
      const assignmentAnswers = await Promise.all([assignmentJob, assignment.solve(alternate)]);
      equal(assignmentAnswers[0].optimalCost, 2n); equal(assignmentAnswers[1].optimalCost, 1n);
      const controller = new AbortController(); controller.abort();
      for (const solve of [
        () => max.solve({ ...execution(mode), source: 0, sink: 1, signal: controller.signal }),
        () => min.solve({ ...execution(mode), signal: controller.signal }),
        () => assignment.solve({ ...execution(mode), signal: controller.signal }),
      ]) {
        const aborted = await Promise.allSettled([solve(), solve()]);
        equal(aborted.every(result => result.status === 'rejected' && result.reason.name === 'AbortError'), true);
      }
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
