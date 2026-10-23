import type { MPSolver, MpResult, MPSolverProtoSolveResult } from '../lib/mp-solver.js';
import type { CpSat, CpModel } from '../lib/cp-sat.js';
import { test } from 'node:test';
import type { KnapsackResult, KnapsackSolver } from '../lib/knapsack.js';
import type {
  LinearSumAssignmentResult,
  MaxFlowResult,
  MinCostFlowResult,
  SimpleLinearSumAssignment,
  SimpleMaxFlow,
  SimpleMinCostFlow,
} from '../lib/network-flow.js';
import type { RoutingModel, RoutingResult, RoutingDimension } from '../lib/routing.js';
import type {
  MathOpt, MathOptVariable, MathOptPrimalValuesProto, MathOptModel, MathOptModelProto, MathOptConvertedProto, MathOptFeasibilityResult, MathOptProtoFeasibilityResult,
  MathOptIncrementalSolver, MathOptProtoIncrementalSolver,
  MathOptInfeasibleSubsystemResult, MathOptProtoInfeasibleSubsystemResult,
  MathOptIncrementalInfeasibleSubsystemOptions,
} from '../lib/mathopt.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;
type _CpSatCheck = Expect<Equal<ReturnType<typeof CpSat.solutionIsFeasible>, Promise<boolean>>>;
type _CpSatProtoCheck = Expect<Equal<ReturnType<typeof CpSat.solutionIsFeasibleProto>, Promise<boolean>>>;
type _CpModelCheck = Expect<Equal<ReturnType<CpModel['solutionIsFeasible']>, Promise<boolean>>>;

type _KnapsackSolve = Expect<Equal<ReturnType<KnapsackSolver['solve']>, Promise<KnapsackResult>>>;
type _MaxFlowSolve = Expect<Equal<ReturnType<SimpleMaxFlow['solve']>, Promise<MaxFlowResult>>>;
type _MinCostFlowSolve = Expect<Equal<ReturnType<SimpleMinCostFlow['solve']>, Promise<MinCostFlowResult>>>;
type _AssignmentSolve = Expect<Equal<
  ReturnType<SimpleLinearSumAssignment['solve']>,
  Promise<LinearSumAssignmentResult>
>>;
type _RoutingSolve = Expect<Equal<ReturnType<RoutingModel['solve']>, Promise<RoutingResult>>>;
type _RoutingSecondaryConfiguration = Expect<Equal<ReturnType<RoutingModel['setSecondaryModel']>, void>>;
type _RoutingIgnoreDisjunctions = Expect<Equal<ReturnType<RoutingModel['ignoreDisjunctionsAlreadyForcedToZero']>, void>>;
type _RoutingDisjunctionCardinality = Expect<Equal<ReturnType<RoutingModel['getDisjunctionMaxCardinality']>, Promise<bigint>>>;
type _RoutingConstrainedDisjunctions = Expect<Equal<ReturnType<RoutingModel['hasMaxCardinalityConstrainedDisjunctions']>, Promise<boolean>>>;
type _RoutingClassCount = Expect<Equal<ReturnType<RoutingModel['getCostClassesCount']>, Promise<number>>>;
type _RoutingClassCost = Expect<Equal<ReturnType<RoutingModel['getArcCostForClass']>, Promise<bigint>>>;
type _RoutingPenalty = Expect<Equal<ReturnType<RoutingModel['unperformedPenalty']>, Promise<bigint>>>;
type _RoutingClassifiedDimensions = Expect<Equal<ReturnType<RoutingModel['getUnaryDimensions']>, Promise<RoutingDimension[]>>>;
type _RoutingVisitPairs = Expect<Equal<ReturnType<RoutingModel['getPairIndicesOfType']>, Promise<number[]>>>;
type _RoutingVisitSingletons = Expect<Equal<ReturnType<RoutingModel['getSingleNodesOfType']>, Promise<number[]>>>;
type _RoutingUnary = Expect<Equal<ReturnType<RoutingDimension['isUnary']>, Promise<boolean>>>;
type _IncrementalIis = Expect<Equal<ReturnType<MathOptIncrementalSolver['computeInfeasibleSubsystem']>, Promise<MathOptInfeasibleSubsystemResult>>>;
type _ProtoIncrementalIis = Expect<Equal<ReturnType<MathOptProtoIncrementalSolver['computeInfeasibleSubsystem']>, Promise<MathOptProtoInfeasibleSubsystemResult>>>;

function retainedIisOptions(solver: MathOptIncrementalSolver, raw: MathOptProtoIncrementalSolver) {
  const options: MathOptIncrementalInfeasibleSubsystemOptions = { timeLimitSeconds: 1, nodeLimit: 10n };
  void solver.computeInfeasibleSubsystem(options);
  void raw.computeInfeasibleSubsystem(options);
  // @ts-expect-error The retained solver owns its executor.
  void solver.computeInfeasibleSubsystem({ executor: 'worker' });
  // @ts-expect-error The native backend is fixed at construction.
  void raw.computeInfeasibleSubsystem({ solverType: 'GSCIP' });
  // @ts-expect-error Optimization callbacks do not apply to IIS.
  void solver.computeInfeasibleSubsystem({ callback: () => ({}) });
}
void retainedIisOptions;

function removedSignatures(
  knapsack: KnapsackSolver,
  maxFlow: SimpleMaxFlow,
  routing: RoutingModel,
) {
  // @ts-expect-error solveResult was replaced by result-returning solve.
  void knapsack.solveResult();
  // @ts-expect-error positional max-flow solve arguments were replaced by one options object.
  void maxFlow.solve(0, 1, {});
  // @ts-expect-error solveResult was replaced by result-returning solve.
  void routing.solveResult();
}

void removedSignatures;

test('public solver objects expose result-returning solve methods', () => {});

function focusedPublicTypes(api: typeof import('../lib/routing.js'), routing: RoutingModel,
  model: import('../lib/mp-solver.js').MPSolverModelProto,
  response: import('../lib/mp-solver.js').MPSolverSolutionResponse,
  state: import('../lib/set-cover.js').SetCoverInspection,
  coverApi: typeof import('../lib/set-cover.js')) {
  // @ts-expect-error Assignments are produced by native solves/restoration.
  new api.Assignment(routing);
  // @ts-expect-error Dimensions are produced by their model.
  new api.RoutingDimension(routing, 'time');
  // @ts-expect-error Resource groups are produced by their model.
  new api.RoutingResourceGroup(routing, 0);
  // @ts-expect-error Resource serialization is internal.
  routing.getResourceGroup(0).snapshot();
  // @ts-expect-error One-shot results are produced by native solving.
  new coverApi.SetCoverResult({});
  // @ts-expect-error Only supported constraint types can be added.
  routing.addConstraints({});
  // @ts-expect-error The partial native solver facade was removed.
  routing.solver();
  // @ts-expect-error The model no longer exposes a last-solution objective.
  routing.costVar();
  // @ts-expect-error Model protos are distinct from solve requests.
  model.solverType = 0;
  // @ts-expect-error Nested proto fields are concrete generated types.
  model.variable = [{ lowerBoud: 0 }];
  // @ts-expect-error Solution vectors contain numeric values.
  response.variableValue = ['invalid'];
  // @ts-expect-error Inspection does not expose native session handles.
  state.sessionHandle;
  routing.addConstraints(routing.activeVar(1).eq(1), true);
  const request: import('../lib/mp-solver.js').MPSolverModelRequest = { model, solverType: 'GLOP_LINEAR_PROGRAMMING' };
  return request;
}
void focusedPublicTypes;

function internalConstructionTypes(
  cp: typeof import('../lib/cp-sat.js'),
  mp: typeof import('../lib/mp-solver.js'),
  bag: typeof import('../lib/knapsack.js'),
  flow: typeof import('../lib/network-flow.js'),
  math: typeof import('../lib/mathopt/api.js'),
  routing: typeof import('../lib/routing.js'),
) {
  const model = new cp.CpModel();
  model.validate({ executor: 'worker', signal: new AbortController().signal });
  // @ts-expect-error Results are created by solve operations.
  new cp.CpResult(model, null, 0, null);
  // @ts-expect-error Results are created by solve operations.
  new mp.MpResult(new mp.MpModel(), {}, 0, 0);
  // @ts-expect-error Results are created by solve operations.
  new bag.KnapsackResult({ profit: 0n, optimal: true, contains: [] }, 0);
  // @ts-expect-error Results are created by solve operations.
  new flow.MaxFlowResult({} as never);
  // @ts-expect-error Results are created by solve operations.
  new flow.MinCostFlowResult({} as never);
  // @ts-expect-error Results are created by solve operations.
  new flow.LinearSumAssignmentResult({} as never);
  const mathModel = new math.MathOptModel();
  // @ts-expect-error Handles are obtained from the model.
  new math.MathOptVariable(mathModel, {} as never);
  // @ts-expect-error Handles are obtained from the model.
  new math.MathOptLinearConstraint(mathModel, {} as never);
  // @ts-expect-error Handles are obtained from the model.
  new math.MathOptQuadraticConstraint(mathModel, {} as never);
  // @ts-expect-error Handles are obtained from the model.
  new math.MathOptIndicatorConstraint(mathModel, {} as never);
  const callback = new cp.CpSolverSolutionCallback();
  // @ts-expect-error Callback response injection is internal.
  callback._run({});
  // @ts-expect-error Callback cancellation plumbing is internal.
  callback._setStopSearchAction(null);
  // @ts-expect-error Routing parameter objects do not carry compatibility methods.
  routing.defaultRoutingModelParameters().solverParameters!.copyFrom({});
}
void internalConstructionTypes;

function mathOptCleanupTypes(math: typeof import('../lib/mathopt/api.js'), mp: typeof import('../lib/mp-solver.js')) {
  const model = math.MathOpt.Model();
  // @ts-expect-error Canonical builder option names only.
  model.addVariable({ lb: 0 });
  // @ts-expect-error Canonical builder option names only.
  model.addLinearConstraint({ expr: 1 });
  // @ts-expect-error Duplicate collection alias removed.
  model.variablesList();
  // @ts-expect-error Native snapshots stay internal.
  model.snapshot();
  // @ts-expect-error Trackers come from their model.
  new math.MathOptUpdateTracker();
  // @ts-expect-error Python equality coercion shims removed.
  math.MathOpt.variableEq(model.addVariable(), model.addVariable());
  // @ts-expect-error MPSolver handles come from the model or solver.
  new mp.MPVariable();
  // @ts-expect-error MPSolver handles come from the model or solver.
  new mp.MPConstraint();
  // @ts-expect-error MPSolver handles come from the model or solver.
  new mp.MPObjective();
}
void mathOptCleanupTypes;

function expressionBuilderTypes(math: typeof import('../lib/mathopt.js')) {
  const x = math.MathOpt.Model().addVariable();
  new math.MathOpt.LinearExpression([{ variable: x, coefficient: 2 }], 3);
  new math.MathOpt.QuadraticExpression([], [{ firstVariable: x, secondVariable: x, coefficient: 1 }], 3);
  // @ts-expect-error Constructors take term lists; use asFlatLinearExpression for conversion.
  new math.MathOpt.LinearExpression(2, 3);
  // @ts-expect-error A variable cannot replace the explicit linear term list.
  new math.MathOpt.QuadraticExpression(x, []);
  // @ts-expect-error Numeric IDs use records; maps require variable handles.
  math.MathOpt.evaluateExpression(x, new Map([[x.id, 2]]));
  math.MathOpt.evaluateExpression(x, new Map([[x, 2]]));
  math.MathOpt.evaluateExpression(x, { [x.id]: 2 });
}
void expressionBuilderTypes;

function finalCleanupTypes(math: typeof import('../lib/mathopt.js'), cp: typeof import('../lib/cp-sat.js'),
  result: import('../lib/rcpsp.js').RcpspSolveResult) {
  const model = math.MathOpt.Model();
  const x = model.addVariable();
  const expression: import('../lib/mathopt.js').MathOptLinearExpressionInput = x;
  const row: import('../lib/mathopt.js').MathOptLinearConstraintOptions = { expression };
  model.addLinearConstraint(row);
  new math.MathOptModelSolveParameters({ variableValuesFilter: new math.MathOptSparseVectorFilter({ ids: [] }),
    dualValuesFilter: new math.MathOptSparseVectorFilter(),
    solutionHints: [{ variableValues: [{ variable: x, value: 1 }] }] });
  // @ts-expect-error Objective handles come from the model.
  new math.MathOptObjective(model);
  // @ts-expect-error Auxiliary objectives come from the model.
  new math.MathOptAuxiliaryObjective(model, 0);
  // @ts-expect-error Use the general expression setter.
  model.objective.setToQuadraticExpression(x);
  // @ts-expect-error Use the general expression adder.
  model.objective.addQuadratic(x);
  // @ts-expect-error Unsupported inequality helpers were removed.
  math.ne(x, 1);
  // @ts-expect-error Unsupported inequality helpers were removed.
  math.MathOpt.ne(x, 1);
  // @ts-expect-error Read names from registered handles.
  model.variableName(x.id);
  // @ts-expect-error Hints carry solution values, not coefficients.
  new math.MathOptSolutionHint({ variableValues: [{ variable: x, coefficient: 1 }] });
  // @ts-expect-error Solve options do not accept an ignored tolerance.
  const options: import('../lib/mp-solver.js').MPSolverProtoSolveOptions = { tolerance: 1e-7 };
  const cpModel = new cp.CpModel();
  // @ts-expect-error Raw handles do not accept an ignored name.
  new cp.IntVar(cpModel, 0, 'ignored');
  // @ts-expect-error Raw handles do not accept an ignored name.
  new cp.IntervalVar(cpModel, 0, 'ignored');
  // @ts-expect-error RCPSP results contain answers; use problem.toCpSatModel() for a generated model.
  result.model;
  // @ts-expect-error Generated variable handles stay internal.
  result.capacityVars;
  return options;
}
void finalCleanupTypes;

function removedReviewApis(math: typeof import('../lib/mathopt.js'), solver: import('../lib/mp-solver.js').MPSolver) {
  const model = math.MathOpt.Model();
  // @ts-expect-error Missing elements consistently return undefined.
  model.getVariable(999, false);
  // @ts-expect-error Missing elements consistently return undefined.
  model.getLinearConstraint(999, false);
  // @ts-expect-error Missing elements consistently return undefined.
  model.getIndicatorConstraint(999, false);
  // @ts-expect-error Use the model's objective API.
  model.objectiveData;
  // @ts-expect-error Native enumeration belongs to an incremental session.
  solver.nextSolution();
}
void removedReviewApis;

type _PrimalFeasibility = Expect<Equal<ReturnType<typeof MathOpt.checkPrimalSolutionFeasibility>, Promise<MathOptFeasibilityResult>>>;
type _ProtoPrimalFeasibility = Expect<Equal<ReturnType<typeof MathOpt.checkPrimalSolutionFeasibilityProto>, Promise<MathOptProtoFeasibilityResult>>>;

type _VehicleClasses = Expect<Equal<ReturnType<RoutingModel['getVehicleClassesCount']>, Promise<number>>>;
type _VisitTypeComponents = Expect<Equal<ReturnType<RoutingModel['getVisitTypeComponents']>, Promise<number[][]>>>;

type _MPSolverCallbacks = Expect<Equal<ReturnType<MPSolver['supportsCallbacks']>, Promise<boolean>>>;
type _MPSolverMessageCallbacks = Expect<Equal<ReturnType<MPSolver['supportsMessageCallbacks']>, Promise<boolean>>>;

type _CustomRouteCost = Expect<Equal<ReturnType<RoutingModel['getRouteCost']>, Promise<bigint | null>>>;

type _SameVehicleIndices = Expect<Equal<ReturnType<RoutingModel['getSameVehicleIndicesOfIndex']>, Promise<number[]>>>;
type _EquivalentVehicles = Expect<Equal<ReturnType<RoutingModel['getVehiclesOfSameClass']>, Promise<number[]>>>;
type _EquivalentArcs = Expect<Equal<ReturnType<RoutingModel['getSameVehicleClassArcs']>, Promise<Array<[number, number]>>>>;
type _NodePrecedenceLayers = Expect<Equal<ReturnType<RoutingModel['getTopologicallySortedNodePrecedences']>, Promise<number[][][]>>>;

type _IndicatorMip = Expect<Equal<ReturnType<typeof MathOpt.formulateIndicatorConstraintAsMip>, Promise<MathOptModel>>>;
type _IndicatorMipProto = Expect<Equal<ReturnType<typeof MathOpt.formulateIndicatorConstraintAsMipProto>, Promise<MathOptConvertedProto<MathOptModelProto>>>>;

type _Robust = Expect<Equal<ReturnType<typeof MathOpt.addRobustConstraint>, Promise<MathOptModel>>>;
type _RobustProto = Expect<Equal<ReturnType<typeof MathOpt.addRobustConstraintProto>, Promise<MathOptConvertedProto<MathOptModelProto>>>>;

type _ImproveValues = Expect<Equal<ReturnType<typeof MathOpt.moveVariablesToTheirBestFeasibleValue>, Promise<ReadonlyMap<MathOptVariable, number>>>>;
type _ImproveValuesProto = Expect<Equal<ReturnType<typeof MathOpt.moveVariablesToTheirBestFeasibleValueProto>, Promise<MathOptConvertedProto<MathOptPrimalValuesProto>>>>;

type _ClampedResult = Expect<Equal<ReturnType<typeof MPSolver.clampSolutionWithinBounds>, Promise<MpResult>>>;
type _ClampedProto = Expect<Equal<ReturnType<typeof MPSolver.clampSolutionWithinBoundsProto>, Promise<MPSolverProtoSolveResult>>>;
