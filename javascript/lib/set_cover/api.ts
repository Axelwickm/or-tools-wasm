import { CloudExecutor } from '../cloud_executor.js';
import {
  resolveExecutorConfiguration,
  type ExecutorSelection,
  type ResolvedExecutorConfiguration,
} from '../executor_configuration.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { SolverWorkerExecutor, type SolverWorkerLike } from '../worker_helpers.js';
import { DirectSetCoverExecutor } from './direct_executor.js';
import {
  setCoverProtocol,
  type SetCoverAlgorithm,
  type SetCoverExecutor,
  type SetCoverOperation,
} from './protocol.js';
import type { SolverJobEvent } from '../solver_executor.js';

export enum ConsistencyLevel {
  COST_AND_COVERAGE = 1,
  FREE_AND_UNCOVERED = 2,
  REDUNDANCY = 3,
}

export type SetCoverModelProto = {
  subset: Array<{ cost: number; element: number[] }>;
  name?: string;
};

export type SetCoverSolutionResponse = {
  status?: number;
  numSubsets?: number;
  subset: number[];
  cost?: number;
  costLowerBound?: number;
  toString(): string;
};

export type SetCoverEvent = SolverJobEvent;
export type SetCoverSolveOptions = {
  executor?: ExecutorSelection;
  onEvent?: (event: SetCoverEvent) => void | Promise<void>;
  signal?: AbortSignal;
};

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

async function createSetCoverWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-set-cover' },
  );
}

const directExecutor = new DirectSetCoverExecutor();
const workerExecutor = new SolverWorkerExecutor(setCoverProtocol, createSetCoverWorker);

function createSetCoverExecutor(selection: ExecutorSelection = 'auto'): SetCoverExecutor {
  return createResolvedExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedExecutor(configuration: ResolvedExecutorConfiguration): SetCoverExecutor {
  switch (configuration.type) {
    case 'direct': return directExecutor;
    case 'worker': return workerExecutor;
    case 'server': return new SolverServerExecutor(setCoverProtocol, configuration);
    case 'cloud': return new CloudExecutor('set-cover', { test: configuration.test });
  }
}

function abortError(signal: AbortSignal) {
  if (signal.reason instanceof Error) return signal.reason;
  if (signal.reason !== undefined) return new Error(String(signal.reason));
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The Set Cover solve was aborted.', 'AbortError');
  }
  const error = new Error('The Set Cover solve was aborted.');
  error.name = 'AbortError';
  return error;
}

function assertSubsetIndex(index: number, numSubsets: number, label = 'subset') {
  if (!Number.isInteger(index) || index < 0 || index >= numSubsets) {
    throw new Error(`SetCover: ${label} ${index} is out of range.`);
  }
}

function createSolutionResponse(subsets: number[], cost: number, numSubsets: number): SetCoverSolutionResponse {
  const response = {
    status: 2,
    numSubsets,
    subset: [...subsets],
    cost,
    toString() {
      return JSON.stringify({
        status: this.status,
        numSubsets: this.numSubsets,
        subset: this.subset,
        cost: this.cost,
      });
    },
  };
  return response;
}

function stats(values: number[]) {
  if (!values.length) {
    return new SetCoverModelStats(0, 0, 0, 0, 0);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  return new SetCoverModelStats(
    sorted[0],
    sorted[sorted.length - 1],
    sorted[Math.floor(sorted.length / 2)],
    mean,
    Math.sqrt(variance),
  );
}

function deciles(values: number[]) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return Array.from({ length: 11 }, (_, index) => sorted[Math.min(sorted.length - 1, Math.floor((index * (sorted.length - 1)) / 10))]);
}

async function runNativeSetCover(operation: SetCoverOperation, options: SetCoverSolveOptions = {}) {
  if (options.signal?.aborted) throw abortError(options.signal);
  const executor = createSetCoverExecutor(options.executor);
  let callbackError: unknown = null;
  const onEvent = async (event: SetCoverEvent) => {
    if (callbackError) return;
    try {
      await options.onEvent?.(event);
    } catch (error) {
      callbackError = error;
    }
  };
  const job = executor.execute(operation, { onEvent });
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
    if (callbackError) throw callbackError;
    if (aborted) throw aborted;
    return result;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}

export class SetCoverModelStats {
  constructor(
    public min: number,
    public max: number,
    public median: number,
    public mean: number,
    public stddev: number,
  ) {}

  toString() {
    return `${this.min}, ${this.max}, ${this.median}, ${this.mean}, ${this.stddev}`;
  }

  toVerboseString() {
    return `min: ${this.min}, max: ${this.max}, median: ${this.median}, mean: ${this.mean}, stddev: ${this.stddev}`;
  }
}

export class SetCoverModel {
  private modelName = 'SetCoverModel';
  private costs: number[] = [];
  private subsetElements: number[][] = [];
  private rowElements: number[][] = [];
  private validRows = false;

  get name() {
    return this.modelName;
  }

  get numElements() {
    let max = -1;
    for (const subset of this.subsetElements) {
      for (const element of subset) max = Math.max(max, element);
    }
    return max + 1;
  }

  get numSubsets() {
    return this.subsetElements.length;
  }

  get numNonzeros() {
    return this.subsetElements.reduce((sum, subset) => sum + subset.length, 0);
  }

  get fillRate() {
    const denominator = this.numElements * this.numSubsets;
    return denominator === 0 ? 0 : this.numNonzeros / denominator;
  }

  get subsetCosts() {
    return [...this.costs];
  }

  get columns() {
    return this.subsetElements.map((subset) => [...subset]);
  }

  get rows() {
    if (!this.validRows) this.createSparseRowView();
    return this.rowElements.map((row) => [...row]);
  }

  get rowViewIsValid() {
    return this.validRows;
  }

  get allSubsets() {
    return this.subsetRange();
  }

  subsetRange() {
    return Array.from({ length: this.numSubsets }, (_, index) => index);
  }

  elementRange() {
    return Array.from({ length: this.numElements }, (_, index) => index);
  }

  setName(name: string) {
    this.modelName = name;
  }

  addEmptySubset(cost: number) {
    if (!Number.isFinite(cost)) throw new Error('SetCoverModel.addEmptySubset: cost must be finite.');
    this.costs.push(cost);
    this.subsetElements.push([]);
    this.validRows = false;
  }

  addElementToLastSubset(element: number) {
    if (!this.subsetElements.length) {
      throw new Error('SetCoverModel.addElementToLastSubset: no subset exists.');
    }
    this.addElementToSubset(element, this.subsetElements.length - 1);
  }

  setSubsetCost(subset: number, cost: number) {
    assertSubsetIndex(subset, this.numSubsets);
    if (!Number.isFinite(cost)) throw new Error('SetCoverModel.setSubsetCost: cost must be finite.');
    this.costs[subset] = cost;
  }

  addElementToSubset(element: number, subset: number) {
    assertSubsetIndex(subset, this.numSubsets);
    if (!Number.isInteger(element) || element < 0) {
      throw new Error('SetCoverModel.addElementToSubset: element must be a non-negative integer.');
    }
    this.subsetElements[subset].push(element);
    this.validRows = false;
  }

  createSparseRowView() {
    this.rowElements = Array.from({ length: this.numElements }, () => []);
    this.subsetElements.forEach((subset, subsetIndex) => {
      for (const element of subset) {
        this.rowElements[element]?.push(subsetIndex);
      }
    });
    this.rowElements.forEach((row) => row.sort((a, b) => a - b));
    this.validRows = true;
  }

  sortElementsInSubsets() {
    this.subsetElements.forEach((subset) => subset.sort((a, b) => a - b));
    this.validRows = false;
  }

  computeFeasibility() {
    const covered = new Set<number>();
    for (const subset of this.subsetElements) {
      for (const element of subset) covered.add(element);
    }
    for (let element = 0; element < this.numElements; element++) {
      if (!covered.has(element)) return false;
    }
    return this.numElements > 0 || this.numSubsets > 0;
  }

  resizeNumSubsets(numSubsets: number) {
    while (this.numSubsets < numSubsets) this.addEmptySubset(0);
  }

  exportModelAsProto(): SetCoverModelProto {
    return {
      name: this.modelName,
      subset: this.subsetElements.map((element, index) => ({ cost: this.costs[index], element: [...element].sort((a, b) => a - b) })),
    };
  }

  importModelFromProto(proto: SetCoverModelProto) {
    this.modelName = proto.name ?? 'SetCoverModel';
    this.costs = proto.subset.map((subset) => subset.cost ?? 0);
    this.subsetElements = proto.subset.map((subset) => [...(subset.element ?? [])]);
    this.validRows = false;
  }

  computeCostStats() {
    return stats(this.costs);
  }

  computeRowStats() {
    return stats(this.rows.map((row) => row.length));
  }

  computeColumnStats() {
    return stats(this.subsetElements.map((subset) => subset.length));
  }

  computeRowDeciles() {
    return deciles(this.rows.map((row) => row.length));
  }

  computeColumnDeciles() {
    return deciles(this.subsetElements.map((subset) => subset.length));
  }

}

function createSetCoverOperation(
  model: SetCoverModel,
  selected: boolean[],
  focus: boolean[] | null,
  algorithm: SetCoverAlgorithm,
  maxIterations: number,
): SetCoverOperation {
  const starts: number[] = [0];
  const elements: number[] = [];
  for (const subset of model.columns) {
    elements.push(...subset);
    starts.push(elements.length);
  }
  return {
    type: 'nextSolution',
    algorithm,
    costs: model.subsetCosts,
    starts,
    elements,
    selected,
    focus,
    maxIterations,
  };
}

export class SetCoverDecision {
  constructor(
    private readonly subsetIndex = 0,
    private readonly decisionValue = true,
  ) {}

  subset() {
    return this.subsetIndex;
  }

  decision() {
    return this.decisionValue;
  }
}

export class SetCoverInvariant {
  private selected: boolean[] = [];
  private solutionTrace: SetCoverDecision[] = [];
  private currentCost = 0;
  private currentCoverage: number[] = [];
  private freeElements: number[] = [];
  private coverageLe1Elements: number[] = [];
  private redundant: boolean[] = [];
  private uncoveredElements = 0;

  constructor(private currentModel: SetCoverModel) {
    this.initialize();
  }

  initialize() {
    this.selected = Array.from({ length: this.currentModel.numSubsets }, () => false);
    this.solutionTrace = [];
    this.recompute();
  }

  clear() {
    this.initialize();
  }

  model() {
    return this.currentModel;
  }

  setModel(model: SetCoverModel) {
    this.currentModel = model;
    this.initialize();
  }

  cost() {
    return this.currentCost;
  }

  numUncoveredElements() {
    return this.uncoveredElements;
  }

  isSelected() {
    return [...this.selected];
  }

  numFreeElements() {
    return [...this.freeElements];
  }

  numCoverageLe1Elements() {
    return [...this.coverageLe1Elements];
  }

  coverage() {
    return [...this.currentCoverage];
  }

  computeCoverageInFocus(focus: number[]) {
    const coverage = Array.from({ length: this.currentModel.numElements }, () => 0);
    const columns = this.currentModel.columns;
    for (const subset of focus) {
      assertSubsetIndex(subset, this.currentModel.numSubsets);
      for (const element of columns[subset]) coverage[element]++;
    }
    return coverage;
  }

  isRedundant() {
    return [...this.redundant];
  }

  trace() {
    return [...this.solutionTrace];
  }

  clearTrace() {
    this.solutionTrace = [];
  }

  compressTrace() {
    this.solutionTrace = this.selected
      .map((value, subset) => value ? new SetCoverDecision(subset, true) : null)
      .filter((value): value is SetCoverDecision => value !== null);
  }

  loadSolution(solution: boolean[]) {
    if (solution.length !== this.currentModel.numSubsets) {
      throw new Error('SetCoverInvariant.loadSolution: solution length must match numSubsets.');
    }
    this.selected = [...solution];
    this.solutionTrace = solution
      .map((value, subset) => value ? new SetCoverDecision(subset, true) : null)
      .filter((value): value is SetCoverDecision => value !== null);
    this.recompute();
  }

  checkConsistency(_consistency: ConsistencyLevel) {
    this.recompute();
    return this.currentCoverage.length === this.currentModel.numElements &&
      this.selected.length === this.currentModel.numSubsets;
  }

  computeIsRedundant(subset: number) {
    assertSubsetIndex(subset, this.currentModel.numSubsets);
    return this.currentModel.columns[subset].every((element) => this.currentCoverage[element] > 1);
  }

  recompute() {
    const columns = this.currentModel.columns;
    const costs = this.currentModel.subsetCosts;
    this.currentCoverage = Array.from({ length: this.currentModel.numElements }, () => 0);
    this.currentCost = 0;
    this.selected.forEach((value, subset) => {
      if (!value) return;
      this.currentCost += costs[subset] ?? 0;
      for (const element of columns[subset] ?? []) this.currentCoverage[element]++;
    });
    this.uncoveredElements = this.currentCoverage.filter((value) => value === 0).length;
    this.freeElements = columns.map((subset) => subset.filter((element) => this.currentCoverage[element] === 0).length);
    this.coverageLe1Elements = columns.map((subset) => subset.filter((element) => this.currentCoverage[element] <= 1).length);
    this.redundant = columns.map((subset) => subset.every((element) => this.currentCoverage[element] > 1));
  }

  select(subset: number, _consistency: ConsistencyLevel) {
    assertSubsetIndex(subset, this.currentModel.numSubsets);
    if (this.selected[subset]) return false;
    this.selected[subset] = true;
    this.solutionTrace.push(new SetCoverDecision(subset, true));
    this.recompute();
    return true;
  }

  deselect(subset: number, _consistency: ConsistencyLevel) {
    assertSubsetIndex(subset, this.currentModel.numSubsets);
    if (!this.selected[subset]) return false;
    this.selected[subset] = false;
    this.solutionTrace.push(new SetCoverDecision(subset, false));
    this.recompute();
    return true;
  }

  exportSolutionAsProto() {
    const subsets = this.selected.flatMap((value, subset) => value ? [subset] : []);
    return createSolutionResponse(subsets, this.currentCost, this.currentModel.numSubsets);
  }

  importSolutionFromProto(proto: SetCoverSolutionResponse) {
    const selected = Array.from({ length: this.currentModel.numSubsets }, () => false);
    for (const subset of proto.subset ?? []) {
      assertSubsetIndex(subset, this.currentModel.numSubsets);
      selected[subset] = true;
    }
    this.loadSolution(selected);
  }

}

const activeSetCoverInvariants = new WeakSet<SetCoverInvariant>();

function beginSetCoverSolve(invariant: SetCoverInvariant) {
  if (activeSetCoverInvariants.has(invariant)) {
    throw new RuntimeError('A Set Cover solve is already in progress for this invariant.');
  }
  activeSetCoverInvariants.add(invariant);
}

function finishSetCoverSolve(invariant: SetCoverInvariant) {
  activeSetCoverInvariants.delete(invariant);
}

abstract class SetCoverSolutionGenerator {
  private maxIterations = Number.POSITIVE_INFINITY;

  constructor(
    protected readonly invariant: SetCoverInvariant,
    private readonly algorithm: SetCoverAlgorithm,
    private readonly generatorName: string,
  ) {}

  setMaxIterations(maxIterations: number) {
    this.maxIterations = maxIterations;
  }

  async nextSolution(focus?: number[] | boolean[], options: SetCoverSolveOptions = {}) {
    beginSetCoverSolve(this.invariant);
    try {
      const model = this.invariant.model();
      let focusMask: boolean[] | null = null;
      if (Array.isArray(focus)) {
        if (focus.every((value) => typeof value === 'boolean')) {
          focusMask = [...focus as boolean[]];
        } else {
          focusMask = Array.from({ length: model.numSubsets }, () => false);
          for (const subset of focus as number[]) {
            assertSubsetIndex(subset, model.numSubsets);
            focusMask[subset] = true;
          }
        }
      }
      const result = await runNativeSetCover(createSetCoverOperation(
        model,
        this.invariant.isSelected(),
        focusMask,
        this.algorithm,
        this.maxIterations,
      ), options);
      this.invariant.loadSolution(result.selected);
      return result.nextSolution;
    } finally {
      finishSetCoverSolve(this.invariant);
    }
  }

  name() {
    return this.generatorName;
  }
}

export class TrivialSolutionGenerator extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'trivial', 'TrivialGenerator');
  }
}

export class RandomSolutionGenerator extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'random', 'RandomGenerator');
  }
}

export class GreedySolutionGenerator extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'greedy', 'GreedyGenerator');
  }
}

export class ElementDegreeSolutionGenerator extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'elementDegree', 'ElementDegreeGenerator');
  }
}

export class LazyElementDegreeSolutionGenerator extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'lazyElementDegree', 'LazyElementDegreeGenerator');
  }
}

export class SteepestSearch extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'steepest', 'SteepestSearch');
  }
}

export class GuidedLocalSearch extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'guidedLocal', 'GuidedLocalSearch');
  }
}

export class TabuList {
  private values: number[] = [];
  private index = 0;

  constructor(private listSize: number) {
    this.init(listSize);
  }

  size() {
    return this.listSize;
  }

  init(size: number) {
    this.listSize = size;
    this.values = [];
    this.index = 0;
  }

  add(value: number) {
    if (this.values.length < this.listSize) {
      this.values.push(value);
      return;
    }
    this.values[this.index] = value;
    this.index = (this.index + 1) % Math.max(1, this.listSize);
  }

  contains(value: number) {
    return this.values.includes(value);
  }
}

export class GuidedTabuSearch extends SetCoverSolutionGenerator {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'guidedTabu', 'GuidedTabuSearch');
  }
}
