import { create } from '@bufbuild/protobuf';
import type { ExecutorConfiguration, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import type { SolverJobEvent } from '../solver_executor.js';
import {
  KnapsackBridgeRequestSchema,
  KnapsackWeightDimensionSchema,
} from '../generated/bridge/knapsack_pb.js';
import { KnapsackExecutor, type KnapsackExecutorLike } from './executor.js';
import { KnapsackWorkerExecutor } from './worker_executor.js';
import { KnapsackServerExecutor } from './server_executor.js';

export enum KnapsackSolverType {
  KNAPSACK_BRUTE_FORCE_SOLVER = 0,
  KNAPSACK_64ITEMS_SOLVER = 1,
  KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER = 2,
  KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER = 3,
  KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER = 5,
  KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER = 6,
  KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER = 7,
  KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER = 8,
  KNAPSACK_DIVIDE_AND_CONQUER_SOLVER = 9,
  KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER = 10,
}

export type KnapsackEvent = SolverJobEvent;
export type KnapsackSolveOptions = {
  onEvent?: (event: KnapsackEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

const directExecutor = new KnapsackExecutor();
const workerExecutor = new KnapsackWorkerExecutor();
let executor: KnapsackExecutorLike = createExecutor({ type: 'auto' });

function createExecutor(configuration: ExecutorConfiguration): KnapsackExecutorLike {
  return createResolvedExecutor(resolveExecutorConfiguration(configuration));
}

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): KnapsackExecutorLike {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new KnapsackServerExecutor(configuration);
  }
}

function abortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error(signal.reason === undefined ? 'The Knapsack solve was aborted.' : String(signal.reason));
  error.name = 'AbortError';
  return error;
}

function validateInput(profits: number[], weights: number[][], capacities: number[]) {
  if (profits.length === 0 || weights.length === 0) {
    throw new Error('KnapsackSolver.init: profits and weights must not be empty.');
  }
  if (weights.length !== capacities.length) {
    throw new Error('KnapsackSolver.init: weights dimensions must match capacities length.');
  }
  if (weights.some((dimension) => dimension.length !== profits.length)) {
    throw new Error('KnapsackSolver.init: each weight dimension must match profits length.');
  }
  for (const [label, values] of [
    ['profits', profits],
    ['capacities', capacities],
    ...weights.map((values, index) => [`weights[${index}]`, values] as const),
  ] as const) {
    if (values.some((value) => !Number.isSafeInteger(value))) {
      throw new Error(`KnapsackSolver.init: ${label} must contain safe integers.`);
    }
  }
}

export class KnapsackSolver {
  static readonly SolverType = KnapsackSolverType;
  static readonly KNAPSACK_BRUTE_FORCE_SOLVER = KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER;
  static readonly KNAPSACK_64ITEMS_SOLVER = KnapsackSolverType.KNAPSACK_64ITEMS_SOLVER;
  static readonly KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER = KnapsackSolverType.KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER;
  static readonly KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER = KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER;
  static readonly KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER = KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER;
  static readonly KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER = KnapsackSolverType.KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER;
  static readonly KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER = KnapsackSolverType.KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER;
  static readonly KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER = KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER;
  static readonly KNAPSACK_DIVIDE_AND_CONQUER_SOLVER = KnapsackSolverType.KNAPSACK_DIVIDE_AND_CONQUER_SOLVER;
  static readonly KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER = KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER;

  static setExecutor(configuration: ExecutorConfiguration): void {
    executor = createExecutor(configuration);
  }

  private profits: number[] = [];
  private weights: number[][] = [];
  private capacities: number[] = [];
  private useReduction = true;
  private timeLimitSeconds = 0;
  private solutionContains: boolean[] = [];
  private solutionOptimal = false;

  constructor(
    private readonly solverType: KnapsackSolverType,
    private readonly solverName: string,
  ) {
    if (!Object.values(KnapsackSolverType).includes(solverType)) {
      throw new Error(`KnapsackSolver: unknown solver type ${solverType}.`);
    }
  }

  init(profits: number[], weights: number[][], capacities: number[]): void {
    validateInput(profits, weights, capacities);
    this.profits = [...profits];
    this.weights = weights.map((dimension) => [...dimension]);
    this.capacities = [...capacities];
    this.solutionContains = [];
    this.solutionOptimal = false;
  }

  Init(profits: number[], weights: number[][], capacities: number[]): void { this.init(profits, weights, capacities); }

  async solve(options: KnapsackSolveOptions = {}): Promise<number> {
    if (options.signal?.aborted) throw abortError(options.signal);
    const currentExecutor = executor;
    const request = create(KnapsackBridgeRequestSchema, {
      solverType: this.solverType,
      name: this.solverName,
      useReduction: this.useReduction,
      timeLimitSeconds: this.timeLimitSeconds,
      profits: this.profits,
      weights: this.weights.map((values) => create(KnapsackWeightDimensionSchema, { values })),
      capacities: this.capacities,
    });
    const job = currentExecutor.execute(request, { onEvent: options.onEvent ?? (() => {}) });
    let aborted: Error | null = null;
    const onAbort = () => {
      if (!options.signal) return;
      aborted = abortError(options.signal);
      void job.cancel().catch(() => {});
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    try {
      const result = await job.result;
      if (aborted) throw aborted;
      this.solutionContains = [...result.contains];
      this.solutionOptimal = result.optimal;
      return result.profit;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  Solve(options: KnapsackSolveOptions = {}): Promise<number> { return this.solve(options); }
  best_solution_contains(itemId: number): boolean { return this.solutionContains[itemId] === true; }
  BestSolutionContains(itemId: number): boolean { return this.best_solution_contains(itemId); }
  is_solution_optimal(): boolean { return this.solutionOptimal; }
  IsSolutionOptimal(): boolean { return this.is_solution_optimal(); }
  set_use_reduction(useReduction: boolean): void { this.useReduction = useReduction; }
  SetUseReduction(useReduction: boolean): void { this.set_use_reduction(useReduction); }
  set_time_limit(timeLimitSeconds: number): void {
    if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds < 0) {
      throw new Error('KnapsackSolver.set_time_limit: time limit must be finite and non-negative.');
    }
    this.timeLimitSeconds = timeLimitSeconds;
  }
  SetTimeLimit(timeLimitSeconds: number): void { this.set_time_limit(timeLimitSeconds); }
  getName(): string { return this.solverName; }
  GetName(): string { return this.getName(); }
}

export async function initKnapsack(): Promise<void> {
  await executor.load();
}

export function setExecutor(configuration: ExecutorConfiguration): void {
  KnapsackSolver.setExecutor(configuration);
}
