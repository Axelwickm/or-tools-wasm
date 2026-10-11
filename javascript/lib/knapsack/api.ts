import { CloudExecutor } from '../cloud_executor.js';
import type { ExecutorSelection, ResolvedExecutorConfiguration } from '../executor_configuration.js';
import { resolveExecutorConfiguration } from '../executor_configuration.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { executeSolverJob } from '../solver_job.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { DirectKnapsackExecutor } from './direct_executor.js';
import { knapsackProtocol, type KnapsackExecutor, type KnapsackResult as KnapsackBridgeResult } from './protocol.js';
import { INT64_MAX, toInt64, type IntValue } from '../int64.js';

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
  numWorkers?: number;
  executor?: ExecutorSelection;
  onEvent?: (event: KnapsackEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

let createKnapsackResult: (result: KnapsackBridgeResult, itemCount: number) => KnapsackResult;

/** A snapshot of one solve, independent of later solves or model changes. */
export class KnapsackResult {
  static { createKnapsackResult = (result, itemCount) => new KnapsackResult(result, itemCount); }

  readonly profit: bigint;
  readonly optimal: boolean;
  private readonly selected: readonly boolean[];

  private constructor(result: KnapsackBridgeResult, itemCount: number) {
    if (result.contains.length !== itemCount) throw new Error('Knapsack result must contain one selection flag per item.');
    this.profit = result.profit;
    this.optimal = result.optimal;
    this.selected = [...result.contains];
  }

  contains(item: number): boolean {
    if (!Number.isInteger(item) || item < 0 || item >= this.selected.length) {
      throw new RangeError(`Knapsack item ${item} is out of range.`);
    }
    return this.selected[item];
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


function normalizeInput(profits: IntValue[], weights: IntValue[][], capacities: IntValue[]) {
  if (weights.length === 0) {
    throw new Error('KnapsackSolver.init: at least one weight dimension is required.');
  }
  if (weights.length !== capacities.length) {
    throw new Error('KnapsackSolver.init: weights dimensions must match capacities length.');
  }
  if (weights.some((dimension) => dimension.length !== profits.length)) {
    throw new Error('KnapsackSolver.init: each weight dimension must match profits length.');
  }
  const normalize = (values: IntValue[], label: string, checkSum: boolean) => {
    const exact = values.map((value, index) => toInt64(value, `KnapsackSolver.init: ${label}[${index}]`));
    let sum = 0n;
    for (const value of exact) {
      if (value < 0n) throw new RangeError(`KnapsackSolver.init: ${label} must be nonnegative.`);
      if (checkSum) {
        sum += value;
        if (sum > INT64_MAX) throw new RangeError(`KnapsackSolver.init: ${label} sum must fit int64.`);
      }
    }
    return exact;
  };
  return {
    profits: normalize(profits, 'profits', true),
    capacities: normalize(capacities, 'capacities', false),
    weights: weights.map((values, index) => normalize(values, `weights[${index}]`, true)),
  };
}

function validateAlgorithmInput(type: KnapsackSolverType, profits: readonly bigint[], capacities: readonly bigint[], useReduction: boolean): void {
  if ((type === KnapsackSolverType.KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER
      || type === KnapsackSolverType.KNAPSACK_DIVIDE_AND_CONQUER_SOLVER) && capacities.includes(INT64_MAX)) {
    throw new RangeError('This Knapsack solver requires capacity below INT64_MAX (capacity + 1 must fit int64).');
  }
  if (type === KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER && profits.includes(INT64_MAX)) {
    throw new RangeError('Branch-and-bound Knapsack requires profits below INT64_MAX (profit + 1 must fit int64).');
  }
  if ([KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CBC_MIP_SOLVER,
    KnapsackSolverType.KNAPSACK_MULTIDIMENSION_SCIP_MIP_SOLVER,
    KnapsackSolverType.KNAPSACK_MULTIDIMENSION_XPRESS_MIP_SOLVER,
    KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CPLEX_MIP_SOLVER,
    KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER].includes(type)
      && Number(profits.reduce((sum, profit) => sum + profit, 0n)) >= 2 ** 63) {
    throw new RangeError("This Knapsack backend's floating-point objective must remain below 2^63.");
  }
  if (type === KnapsackSolverType.KNAPSACK_64ITEMS_SOLVER && profits.length === 0 && !useReduction) {
    throw new RangeError('The 64-item Knapsack solver requires reduction for an empty problem.');
  }
}

export class KnapsackSolver {
  private profits: bigint[] = [];
  private weights: bigint[][] = [];
  private capacities: bigint[] = [];
  private useReduction = true;
  private timeLimitSeconds = Infinity;


  constructor(
    private readonly solverType: KnapsackSolverType,
    private readonly solverName: string,
  ) {
    if (typeof solverType !== 'number' || !Object.values(KnapsackSolverType).includes(solverType)) {
      throw new Error(`KnapsackSolver: unknown solver type ${solverType}.`);
    }
  }

  init(profits: IntValue[], weights: IntValue[][], capacities: IntValue[]): void {
    const singleDimension = [KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER,
      KnapsackSolverType.KNAPSACK_64ITEMS_SOLVER,
      KnapsackSolverType.KNAPSACK_DYNAMIC_PROGRAMMING_SOLVER,
      KnapsackSolverType.KNAPSACK_DIVIDE_AND_CONQUER_SOLVER].includes(this.solverType);
    if (singleDimension && weights.length !== 1) {
      throw new RangeError('This Knapsack solver requires exactly one weight dimension.');
    }
    const limit = this.solverType === KnapsackSolverType.KNAPSACK_BRUTE_FORCE_SOLVER ? 30
      : this.solverType === KnapsackSolverType.KNAPSACK_64ITEMS_SOLVER ? 64 : Infinity;
    if (profits.length > limit) throw new RangeError(`This Knapsack solver supports at most ${limit} items.`);
    const normalized = normalizeInput(profits, weights, capacities);
    validateAlgorithmInput(this.solverType, normalized.profits, normalized.capacities, this.useReduction);
    this.profits = normalized.profits;
    this.weights = normalized.weights;
    this.capacities = normalized.capacities;
  }

  /** Solve once and return an answer independent of later solves or model changes. */
  async solve(options: KnapsackSolveOptions = {}): Promise<KnapsackResult> {
    const itemCount = this.profits.length;
    validateAlgorithmInput(this.solverType, this.profits, this.capacities, this.useReduction);
    const numWorkers = options.numWorkers ?? 1;
    if (!Number.isInteger(numWorkers) || numWorkers < 1 || numWorkers > 2_147_483_647) {
      throw new RangeError('Knapsack numWorkers must be a positive int32.');
    }
    if (numWorkers > 1 && this.solverType !== KnapsackSolverType.KNAPSACK_MULTIDIMENSION_CP_SAT_SOLVER) {
      throw new RangeError('Only CP-SAT Knapsack supports multiple workers.');
    }
    const executor = createKnapsackExecutor(options.executor);
    const operation = {
      solverType: this.solverType,
      numWorkers,
      name: this.solverName,
      useReduction: this.useReduction,
      timeLimitSeconds: this.timeLimitSeconds,
      profits: [...this.profits],
      weights: this.weights.map((dimension) => [...dimension]),
      capacities: [...this.capacities],
    };
    return createKnapsackResult(await executeSolverJob(executor, operation, {
      showCloudNotice: !(executor instanceof SolverServerExecutor),
      signal: options.signal,
      onEvent: options.onEvent,
      resources: { threads: numWorkers },
    }), itemCount);
  }

  setUseReduction(useReduction: boolean): void { this.useReduction = useReduction; }
  setTimeLimit(timeLimitSeconds: number): void {
    if (typeof timeLimitSeconds !== 'number' || Number.isNaN(timeLimitSeconds) || timeLimitSeconds < 0) {
      throw new Error('KnapsackSolver.setTimeLimit: time limit must be non-negative (positive infinity means unlimited).');
    }
    this.timeLimitSeconds = timeLimitSeconds;
  }
  getName(): string { return this.solverName; }
}
