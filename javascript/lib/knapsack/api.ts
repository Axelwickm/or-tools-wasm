import { CloudExecutor } from '../cloud_executor.js';
import type { ExecutorSelection, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { executeSolverJob } from '../solver_job.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { DirectKnapsackExecutor } from './direct_executor.js';
import { knapsackProtocol, type KnapsackExecutor } from './protocol.js';
import { toInt64, type IntValue } from '../int64.js';

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
  executor?: ExecutorSelection;
  onEvent?: (event: KnapsackEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

async function createKnapsackWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-knapsack' },
  );
}

const directExecutor = new DirectKnapsackExecutor();
const workerExecutor = new SolverWorkerExecutor(knapsackProtocol, createKnapsackWorker);

function createKnapsackExecutor(selection: ExecutorSelection = 'auto'): KnapsackExecutor {
  return createResolvedExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): KnapsackExecutor {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new SolverServerExecutor(knapsackProtocol, configuration);
    case 'cloud': return new CloudExecutor('knapsack', { test: configuration.test });
  }
}

function abortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  if (signal.reason !== undefined) return new Error(String(signal.reason));
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The Knapsack solve was aborted.', 'AbortError');
  }
  const error = new Error('The Knapsack solve was aborted.');
  error.name = 'AbortError';
  return error;
}

function normalizeInput(profits: IntValue[], weights: IntValue[][], capacities: IntValue[]) {
  if (profits.length === 0 || weights.length === 0) {
    throw new Error('KnapsackSolver.init: profits and weights must not be empty.');
  }
  if (weights.length !== capacities.length) {
    throw new Error('KnapsackSolver.init: weights dimensions must match capacities length.');
  }
  if (weights.some((dimension) => dimension.length !== profits.length)) {
    throw new Error('KnapsackSolver.init: each weight dimension must match profits length.');
  }
  const normalize = (values: IntValue[], label: string) =>
    values.map((value, index) => toInt64(value, `KnapsackSolver.init: ${label}[${index}]`));
  return {
    profits: normalize(profits, 'profits'),
    capacities: normalize(capacities, 'capacities'),
    weights: weights.map((values, index) => normalize(values, `weights[${index}]`)),
  };
}

export class KnapsackSolver {
  private profits: bigint[] = [];
  private weights: bigint[][] = [];
  private capacities: bigint[] = [];
  private useReduction = true;
  private timeLimitSeconds = 0;
  private solutionContains: boolean[] = [];
  private solutionOptimal = false;
  private solving = false;

  constructor(
    private readonly solverType: KnapsackSolverType,
    private readonly solverName: string,
  ) {
    if (!Object.values(KnapsackSolverType).includes(solverType)) {
      throw new Error(`KnapsackSolver: unknown solver type ${solverType}.`);
    }
  }

  init(profits: IntValue[], weights: IntValue[][], capacities: IntValue[]): void {
    const normalized = normalizeInput(profits, weights, capacities);
    this.profits = normalized.profits;
    this.weights = normalized.weights;
    this.capacities = normalized.capacities;
    this.solutionContains = [];
    this.solutionOptimal = false;
  }

  async solve(options: KnapsackSolveOptions = {}): Promise<bigint> {
    if (this.solving) {
      throw new RuntimeError('KnapsackSolver.solve() is already in progress.');
    }
    this.solving = true;
    try {
      return await this.solveOnce(options);
    } finally {
      this.solving = false;
    }
  }

  private async solveOnce(options: KnapsackSolveOptions): Promise<bigint> {
    const executor = createKnapsackExecutor(options.executor);
    const operation = {
      solverType: this.solverType,
      name: this.solverName,
      useReduction: this.useReduction,
      timeLimitSeconds: this.timeLimitSeconds,
      profits: this.profits,
      weights: this.weights,
      capacities: this.capacities,
    };
    const result = await executeSolverJob(executor, operation, {
      signal: options.signal,
      abortError,
      onEvent: options.onEvent,
    });
    this.solutionContains = [...result.contains];
    this.solutionOptimal = result.optimal;
    return result.profit;
  }

  bestSolutionContains(itemId: number): boolean { return this.solutionContains[itemId] === true; }
  isSolutionOptimal(): boolean { return this.solutionOptimal; }
  setUseReduction(useReduction: boolean): void { this.useReduction = useReduction; }
  setTimeLimit(timeLimitSeconds: number): void {
    if (!Number.isFinite(timeLimitSeconds) || timeLimitSeconds < 0) {
      throw new Error('KnapsackSolver.setTimeLimit: time limit must be finite and non-negative.');
    }
    this.timeLimitSeconds = timeLimitSeconds;
  }
  getName(): string { return this.solverName; }
}
