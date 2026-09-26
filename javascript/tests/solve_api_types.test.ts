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
import type { RoutingModel, RoutingResult } from '../lib/routing.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2)
    ? true
    : false;
type Expect<T extends true> = T;

type _KnapsackSolve = Expect<Equal<ReturnType<KnapsackSolver['solve']>, Promise<KnapsackResult>>>;
type _MaxFlowSolve = Expect<Equal<ReturnType<SimpleMaxFlow['solve']>, Promise<MaxFlowResult>>>;
type _MinCostFlowSolve = Expect<Equal<ReturnType<SimpleMinCostFlow['solve']>, Promise<MinCostFlowResult>>>;
type _AssignmentSolve = Expect<Equal<
  ReturnType<SimpleLinearSumAssignment['solve']>,
  Promise<LinearSumAssignmentResult>
>>;
type _RoutingSolve = Expect<Equal<ReturnType<RoutingModel['solve']>, Promise<RoutingResult>>>;

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
