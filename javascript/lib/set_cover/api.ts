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
  type SetCoverSearchOperation,
  type SetCoverResult as SetCoverBridgeResult,
  type GuidedTabuParameters,
} from './protocol.js';
import type { SolverJobEvent } from '../solver_executor.js';
import { executeSolverJob, createAbortError } from '../solver_job.js';

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

export type SetCoverOneShotOptions = SetCoverSolveOptions & {
  algorithm?: SetCoverAlgorithm;
  maxIterations?: number;
  /** Forwarded to native OR-Tools; the pinned heuristics do not enforce this setting. */
  timeLimitSeconds?: number;
};

/** Snapshot returned by a one-shot solve; iterative generators remain separate. */
let createSetCoverResult: (result: SetCoverBridgeResult) => SetCoverResult;

export class SetCoverResult {
  readonly cost: number;
  readonly numUncoveredElements: number;
  readonly hasSolution: boolean;
  private readonly selected: readonly boolean[];

  private constructor(result: SetCoverBridgeResult) {
    this.cost = result.cost;
    this.numUncoveredElements = result.numUncoveredElements;
    this.hasSolution = result.numUncoveredElements === 0;
    this.selected = [...result.selected];
  }

  static { createSetCoverResult = result => new SetCoverResult(result); }

  contains(subset: number): boolean {
    assertSubsetIndex(subset, this.selected.length);
    return this.selected[subset];
  }

  selectedSubsets(): number[] {
    return this.selected.flatMap((value, index) => value ? [index] : []);
  }
}

export const SetCover = {
  async solve(model: SetCoverModel, options: SetCoverOneShotOptions = {}): Promise<SetCoverResult> {
    const { algorithm = 'greedy', maxIterations = Number.POSITIVE_INFINITY, timeLimitSeconds = Number.POSITIVE_INFINITY, ...execution } = options;
    const selected = Array.from({ length: model.numSubsets }, () => false);
    return createSetCoverResult(await runNativeSetCover(
      createSetCoverOperation(model, selected, null, algorithm, maxIterations, timeLimitSeconds), execution,
    ));
  },
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


function assertSubsetIndex(index: number, numSubsets: number, label = 'subset') {
  if (!Number.isInteger(index) || index < 0 || index >= numSubsets) {
    throw new Error(`SetCover: ${label} ${index} is out of range.`);
  }
}

function createSolutionResponse(subsets: number[], cost: number, numSubsets: number, costLowerBound: number): SetCoverSolutionResponse {
  const response = {
    costLowerBound,
    numSubsets,
    subset: [...subsets],
    cost,
    toString() {
      return JSON.stringify({
        costLowerBound: this.costLowerBound,
        numSubsets: this.numSubsets,
        subset: this.subset,
        cost: this.cost,
      });
    },
  };
  return response;
}

async function runNativeSetCover(operation: SetCoverOperation, options: SetCoverSolveOptions = {}, onSuccess?: (result: SetCoverBridgeResult) => void) {
  const executor = createSetCoverExecutor(options.executor);
  return executeSolverJob(executor, operation, {
    showCloudNotice: !(executor instanceof SolverServerExecutor),
    signal: options.signal,
    onEvent: options.onEvent,
    onSuccess,
  });
}

export class SetCoverModelStats {
  constructor(
    public min: number,
    public max: number,
    public median: number,
    public mean: number,
    public stddev: number,
    public iqr = 0,
  ) {}

  toString() {
    return `${this.min}, ${this.max}, ${this.median}, ${this.mean}, ${this.stddev}, ${this.iqr}`;
  }

  toVerboseString() {
    return `min: ${this.min}, max: ${this.max}, median: ${this.median}, mean: ${this.mean}, stddev: ${this.stddev}, iqr: ${this.iqr}`;
  }
}

const modelVersions = new WeakMap<SetCoverModel, number>();
const invariantVersions = new WeakMap<SetCoverInvariant, number>();
const invariantCommits = new WeakMap<SetCoverInvariant, (result: SetCoverBridgeResult) => void>();
function bumpVersion<T extends object>(versions: WeakMap<T, number>, object: T): void { versions.set(object, (versions.get(object) ?? 0) + 1); }
function modelIndex(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= 0x7fffffff)
    throw new RangeError(`Set Cover ${label} must be a nonnegative index below 2147483647.`);
}
function subsetCost(cost: number): void {
  if (!Number.isFinite(cost)) throw new RangeError('Set Cover subset cost must be finite.');
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
    subsetCost(cost);
    modelIndex(this.numSubsets, 'subset');
    this.costs.push(cost);
    this.subsetElements.push([]);
    bumpVersion(modelVersions, this);
    this.validRows = false;
  }

  addElementToLastSubset(element: number) {
    if (!this.subsetElements.length) {
      throw new Error('SetCoverModel.addElementToLastSubset: no subset exists.');
    }
    this.addElementToSubset(element, this.subsetElements.length - 1);
  }

  setSubsetCost(subset: number, cost: number) {
    modelIndex(subset, 'subset');
    subsetCost(cost);
    while (this.numSubsets <= subset) this.addEmptySubset(0);
    this.costs[subset] = cost;
    bumpVersion(modelVersions, this);
  }

  addElementToSubset(element: number, subset: number) {
    modelIndex(subset, 'subset');
    modelIndex(element, 'element');
    while (this.numSubsets <= subset) this.addEmptySubset(0);
    this.subsetElements[subset].push(element);
    bumpVersion(modelVersions, this);
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
    bumpVersion(modelVersions, this);
  }

  computeFeasibility() {
    const numElements = this.numElements;
    const covered = new Set<number>();
    for (const subset of this.subsetElements) {
      for (const element of subset) covered.add(element);
    }
    for (let element = 0; element < numElements; element++) {
      if (!covered.has(element)) return false;
    }
    return numElements > 0 || this.numSubsets > 0;
  }

  resizeNumSubsets(numSubsets: number) {
    if (!Number.isInteger(numSubsets) || numSubsets < 0 || numSubsets > 0x7fffffff)
      throw new RangeError('Set Cover subset count must be a nonnegative int32.');
    while (this.numSubsets < numSubsets) this.addEmptySubset(0);
  }

  exportModelAsProto(): SetCoverModelProto {
    return {
      name: this.modelName,
      subset: this.subsetElements.map((element, index) => ({ cost: this.costs[index], element: [...element].sort((a, b) => a - b) })),
    };
  }

  importModelFromProto(proto: SetCoverModelProto) {
    if (proto.subset.length > 0x7fffffff) throw new RangeError('Set Cover subset count exceeds int32.');
    const costs = proto.subset.map((subset) => {
      const cost = subset.cost ?? 0; subsetCost(cost); return cost;
    });
    const elements = proto.subset.map((subset) => {
      const column = [...(subset.element ?? [])];
      for (const element of column) modelIndex(element, 'element');
      return column;
    });
    this.modelName = proto.name ?? 'SetCoverModel';
    this.costs = costs;
    this.subsetElements = elements;
    this.validRows = false;
    bumpVersion(modelVersions, this);
  }

  computeCostStats(options: SetCoverSolveOptions = {}) { return this.computeStatistics(0, options); }
  computeRowStats(options: SetCoverSolveOptions = {}) { return this.computeStatistics(1, options); }
  computeColumnStats(options: SetCoverSolveOptions = {}) { return this.computeStatistics(2, options); }
  computeRowDeciles(options: SetCoverSolveOptions = {}) { return this.computeDeciles(3, options); }
  computeColumnDeciles(options: SetCoverSolveOptions = {}) { return this.computeDeciles(4, options); }

  private statisticsOperation(kind: number): SetCoverOperation {
    return { type: 'statistics', kind, ...serializeSetCoverModel(this) };
  }

  private async computeStatistics(kind: number, options: SetCoverSolveOptions): Promise<SetCoverModelStats> {
    const { statistics } = await runNativeSetCover(this.statisticsOperation(kind), options);
    if (!statistics) throw new Error('Set Cover executor returned no statistics.');
    return new SetCoverModelStats(statistics.min, statistics.max, statistics.median, statistics.mean, statistics.stddev, statistics.iqr);
  }

  private async computeDeciles(kind: number, options: SetCoverSolveOptions): Promise<number[]> {
    const { deciles } = await runNativeSetCover(this.statisticsOperation(kind), options);
    if (!deciles) throw new Error('Set Cover executor returned no deciles.');
    return deciles.map(Number);
  }

}

function validateMaxIterations(value: number) {
  if (value !== Infinity && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError('SetCover: max iterations must be a non-negative safe integer or positive infinity.');
  }
}

function validateTimeLimit(value: number): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new RangeError('SetCover: time limit must be non-negative seconds or positive infinity.');
  }
}

function serializeSetCoverModel(model: SetCoverModel) {
  const starts: number[] = [0];
  const elements: number[] = [];
  for (const subset of model.columns) {
    for (const element of subset) elements.push(element);
    starts.push(elements.length);
  }
  return { costs: model.subsetCosts, starts, elements };
}

function createSetCoverOperation(
  model: SetCoverModel,
  selected: boolean[],
  focus: boolean[] | null,
  algorithm: SetCoverSearchOperation['algorithm'],
  maxIterations: number,
  timeLimitSeconds = Number.POSITIVE_INFINITY,
  modelSnapshot = serializeSetCoverModel(model),
): SetCoverSearchOperation {
  validateTimeLimit(timeLimitSeconds);
  validateMaxIterations(maxIterations);
  return {
    type: 'nextSolution',
    algorithm,
    ...modelSnapshot,
    selected,
    focus,
    maxIterations,
    timeLimitSeconds,
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

/** Native inspection of one submitted model/selection snapshot. */
export type SetCoverInspection = {
  cost: number;
  costLowerBound?: number;
  numUncoveredElements: number;
  selected: boolean[];
  coverage: number[];
  numFreeElements: number[];
  numCoverageLe1Elements: number[];
  isRedundant: boolean[];
  computedRedundancy?: boolean[];
};

export class SetCoverInvariant {
  private selected: boolean[] = [];
  private solutionTrace: SetCoverDecision[] = [];

  constructor(private currentModel: SetCoverModel) {
    this.initialize();
    invariantCommits.set(this, result => {
      this.loadSolution(result.selected);
      if (result.trace) this.solutionTrace = result.trace.map(item => new SetCoverDecision(item.subset, item.selected));
    });
  }

  initialize() {
    this.selected = Array.from({ length: this.currentModel.numSubsets }, () => false);
    this.solutionTrace = [];
    bumpVersion(invariantVersions, this);
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

  async inspect(options: SetCoverSolveOptions = {}): Promise<SetCoverInspection> {
    const operation = createSetCoverOperation(this.currentModel, this.isSelected(), null, 'inspect', Infinity, Infinity);
    const result = await runNativeSetCover(operation, options);
    return {
      cost: result.cost, costLowerBound: result.costLowerBound,
      numUncoveredElements: result.numUncoveredElements,
      selected: [...result.selected], coverage: [...result.coverage],
      numFreeElements: [...result.numFreeElements], numCoverageLe1Elements: [...result.numCoverageLe1Elements],
      isRedundant: [...result.isRedundant],
      ...(result.computedRedundancy ? { computedRedundancy: [...result.computedRedundancy] } : {}),
    };
  }

  async cost(options: SetCoverSolveOptions = {}) { return (await this.inspect(options)).cost; }
  async numUncoveredElements(options: SetCoverSolveOptions = {}) { return (await this.inspect(options)).numUncoveredElements; }
  isSelected() { return [...this.selected]; }
  async numFreeElements(options: SetCoverSolveOptions = {}) { return (await this.inspect(options)).numFreeElements; }
  async numCoverageLe1Elements(options: SetCoverSolveOptions = {}) { return (await this.inspect(options)).numCoverageLe1Elements; }
  async coverage(options: SetCoverSolveOptions = {}) { return (await this.inspect(options)).coverage; }
  async isRedundant(options: SetCoverSolveOptions = {}) { return (await this.inspect(options)).isRedundant; }

  async computeCoverageInFocus(focus: number[], options: SetCoverSolveOptions = {}) {
    const indices = Array.from(focus, subset => { assertSubsetIndex(subset, this.currentModel.numSubsets); return subset; });
    const operation = createSetCoverOperation(this.currentModel, this.isSelected(), null, 'inspect', Infinity, Infinity);
    operation.focusIndices = indices;
    const result = await runNativeSetCover(operation, options);
    if (!result.focusCoverage) throw new Error('Set Cover executor returned no native focus coverage.');
    return result.focusCoverage;
  }

  trace() {
    return [...this.solutionTrace];
  }

  clearTrace() {
    this.solutionTrace = [];
    bumpVersion(invariantVersions, this);
  }

  async compressTrace(options: SetCoverSolveOptions = {}): Promise<void> {
    beginSetCoverSolve(this);
    const model = this.currentModel;
    const modelVersion = modelVersions.get(model) ?? 0;
    const invariantVersion = invariantVersions.get(this) ?? 0;
    const trace = this.solutionTrace.map(item => ({ subset: item.subset(), selected: item.decision() }));
    try {
      await runNativeSetCover({ type: 'compressTrace', numSubsets: model.numSubsets, trace }, options, result => {
        if (this.currentModel !== model || (modelVersions.get(model) ?? 0) !== modelVersion ||
            (invariantVersions.get(this) ?? 0) !== invariantVersion) throw new Error('Set Cover invariant or model was modified during trace compression; its stale result was discarded.');
        if (!result.trace) throw new Error('Set Cover executor returned no compressed trace.');
        this.solutionTrace = result.trace.map(item => new SetCoverDecision(item.subset, item.selected));
        bumpVersion(invariantVersions, this);
      });
    } finally { finishSetCoverSolve(this); }
  }

  loadSolution(solution: boolean[]) {
    if (solution.length !== this.currentModel.numSubsets) {
      throw new Error('SetCoverInvariant.loadSolution: solution length must match numSubsets.');
    }
    this.selected = [...solution];
    this.solutionTrace = solution
      .map((value, subset) => value ? new SetCoverDecision(subset, true) : null)
      .filter((value): value is SetCoverDecision => value !== null);
    bumpVersion(invariantVersions, this);
  }

  async computeIsRedundant(subset: number, options: SetCoverSolveOptions = {}) {
    assertSubsetIndex(subset, this.currentModel.numSubsets);
    const result = await this.inspect(options);
    if (!result.computedRedundancy) throw new Error('Set Cover executor returned no native redundancy result.');
    return result.computedRedundancy[subset];
  }

  select(subset: number) {
    assertSubsetIndex(subset, this.currentModel.numSubsets);
    if (this.selected[subset]) return false;
    this.selected[subset] = true;
    this.solutionTrace.push(new SetCoverDecision(subset, true));
    bumpVersion(invariantVersions, this);
    return true;
  }

  deselect(subset: number) {
    assertSubsetIndex(subset, this.currentModel.numSubsets);
    if (!this.selected[subset]) return false;
    this.selected[subset] = false;
    this.solutionTrace.push(new SetCoverDecision(subset, false));
    bumpVersion(invariantVersions, this);
    return true;
  }

  async exportSolutionAsProto(options: SetCoverSolveOptions = {}) {
    const result = await this.inspect(options);
    if (result.costLowerBound === undefined) throw new Error('Set Cover executor returned no native solution lower bound.');
    return createSolutionResponse(result.selected.flatMap((selected, subset) => selected ? [subset] : []), result.cost, result.selected.length, result.costLowerBound);
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
  private timeLimitSeconds = Number.POSITIVE_INFINITY;
  protected guidedTabuParameters?: Partial<GuidedTabuParameters>;

  constructor(
    protected readonly invariant: SetCoverInvariant,
    protected readonly algorithm: SetCoverAlgorithm,
    private readonly generatorName: string,
  ) {}

  setMaxIterations(maxIterations: number) {
    validateMaxIterations(maxIterations);
    this.maxIterations = maxIterations;
  }

  /** Stores the native setting; the pinned heuristics do not enforce time limits. */
  setTimeLimitInSeconds(seconds: number) {
    validateTimeLimit(seconds);
    this.timeLimitSeconds = seconds;
    return this;
  }

  resetLimits() {
    this.maxIterations = Number.POSITIVE_INFINITY;
    this.timeLimitSeconds = Number.POSITIVE_INFINITY;
    return this;
  }

  protected executeSearch(operation: SetCoverSearchOperation, options: SetCoverSolveOptions): Promise<SetCoverBridgeResult> {
    const model = this.invariant.model();
    const modelVersion = modelVersions.get(model) ?? 0;
    const invariantVersion = invariantVersions.get(this.invariant) ?? 0;
    return runNativeSetCover(operation, options, result => {
      if (this.invariant.model() !== model || (modelVersions.get(model) ?? 0) !== modelVersion ||
          (invariantVersions.get(this.invariant) ?? 0) !== invariantVersion)
        throw new Error('Set Cover invariant or model was modified during search; its stale result was discarded.');
      invariantCommits.get(this.invariant)!(result);
    });
  }

  protected modelSnapshot() { return serializeSetCoverModel(this.invariant.model()); }

  async nextSolution(focus?: number[] | boolean[], options: SetCoverSolveOptions = {}) {
    beginSetCoverSolve(this.invariant);
    try {
      const model = this.invariant.model();
      let focusMask: boolean[] | null = null;
      if (Array.isArray(focus)) {
        if (focus.length > 0 && focus.every((value) => typeof value === 'boolean')) {
          if (focus.length !== model.numSubsets) {
            throw new RangeError('SetCover: Boolean focus must contain one value per subset.');
          }
          focusMask = [...focus as boolean[]];
        } else {
          focusMask = Array.from({ length: model.numSubsets }, () => false);
          for (const subset of focus as number[]) {
            assertSubsetIndex(subset, model.numSubsets);
            focusMask[subset] = true;
          }
        }
      }
      const operation = createSetCoverOperation(
        model,
        this.invariant.isSelected(),
        focusMask,
        this.algorithm,
        this.maxIterations,
        this.timeLimitSeconds,
        this.modelSnapshot(),
      );
      if (this.guidedTabuParameters) operation.guidedTabuParameters = { ...this.guidedTabuParameters };
      const result = await this.executeSearch(operation, options);
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

class SetCoverRuntimeLostError extends Error {
  constructor() { super('Set Cover guided search runtime was replaced; close this instance and create a new one.'); }
}

type TuningVersions = Partial<Record<keyof GuidedTabuParameters, number>>;

abstract class SetCoverGuidedSearch extends SetCoverSolutionGenerator {
  private executor?: SetCoverExecutor;
  private configuration?: ResolvedExecutorConfiguration;
  private handle?: bigint;
  private runtime?: object;
  private model?: SetCoverModel;
  private modelVersion = 0;
  private invariantVersion = 0;
  private state: 'open' | 'failed' | 'closing' | 'closed' = 'open';
  private active?: Promise<unknown>;
  private closePromise?: Promise<void>;
  private callbackDepth = 0;
  protected tuningVersions: TuningVersions = {};
  private appliedTuningVersions: TuningVersions = {};
  protected tuningVersion = 0;

  protected override modelSnapshot() {
    return this.handle === undefined ? super.modelSnapshot() : { costs: [], starts: [], elements: [] };
  }

  private bind(options: SetCoverSolveOptions): SetCoverExecutor {
    if (!this.configuration) {
      const configuration = resolveExecutorConfiguration(options.executor);
      this.configuration = configuration.type === 'server' ? { ...configuration, headers: configuration.headers && { ...configuration.headers } } : { ...configuration };
      this.executor = createResolvedExecutor(this.configuration);
    } else if (options.executor !== undefined) {
      const candidate = resolveExecutorConfiguration(options.executor), current = this.configuration;
      const same = candidate.type === current.type && (candidate.type !== 'server' || current.type === 'server' &&
        String(candidate.url) === String(current.url) && candidate.authToken === current.authToken && candidate.fetch === current.fetch &&
        candidate.statusIntervalMs === current.statusIntervalMs && JSON.stringify(Object.entries(candidate.headers ?? {}).sort()) === JSON.stringify(Object.entries(current.headers ?? {}).sort()));
      if (!same) throw new Error('Set Cover guided search is bound to its original executor; close it and create a new instance to change executors.');
    }
    return this.executor!;
  }

  private launch<T>(options: SetCoverSolveOptions, action: () => Promise<T>): Promise<T> {
    if (this.state !== 'open') return Promise.reject(new Error(`Set Cover guided search is ${this.state}; close it and create a new instance.`));
    if (this.active) return Promise.reject(new Error('Set Cover guided search already has an operation in progress.'));
    if (options.signal?.aborted) return Promise.reject(createAbortError(options.signal));
    let pending!: Promise<T>;
    pending = action().finally(() => { if (this.active === pending) this.active = undefined; });
    this.active = pending;
    return pending;
  }

  private capture() {
    const model = this.invariant.model();
    return { model, modelVersion: modelVersions.get(model) ?? 0, invariantVersion: invariantVersions.get(this.invariant) ?? 0,
      parameters: { ...this.guidedTabuParameters }, tuningVersions: { ...this.tuningVersions } };
  }

  private assertModel(): void {
    if (this.model && (this.model !== this.invariant.model() || this.modelVersion !== (modelVersions.get(this.model) ?? 0))) {
      throw new Error('Set Cover guided search model was modified; close it and create a new instance.');
    }
  }

  private assertRuntime(runtime: object): void { if (runtime !== this.runtime) throw new SetCoverRuntimeLostError(); }

  private changes(snapshot: ReturnType<SetCoverGuidedSearch['capture']>): Partial<GuidedTabuParameters> {
    const changes: Partial<GuidedTabuParameters> = {};
    for (const key of Object.keys(snapshot.tuningVersions) as Array<keyof GuidedTabuParameters>) {
      if (snapshot.tuningVersions[key] !== this.appliedTuningVersions[key]) changes[key] = snapshot.parameters[key];
    }
    return changes;
  }

  private lifecycleOptions(options: SetCoverSolveOptions): SetCoverSolveOptions {
    const onEvent = options.onEvent;
    if (!onEvent) return options;
    return { ...options, onEvent: async event => { this.callbackDepth++; try { await onEvent(event); } finally { this.callbackDepth--; } } };
  }

  private async execute(operation: SetCoverOperation, options: SetCoverSolveOptions, onSuccess: (result: SetCoverBridgeResult) => void, create = false): Promise<SetCoverBridgeResult> {
    let committed = false;
    try {
      const executor = this.bind(options);
      return await executeSolverJob(executor, operation, {
        showCloudNotice: !(executor instanceof SolverServerExecutor),
        signal: options.signal,
        onDispatch: runtime => { if (create) this.runtime = runtime; else this.assertRuntime(runtime); },
        onEvent: this.lifecycleOptions(options).onEvent,
        onSuccess: result => { onSuccess(result); committed = true; },
      });
    } catch (error) {
      if (!committed && this.state === 'open') this.state = 'failed';
      throw error;
    }
  }

  private async ensureSession(operation: SetCoverSearchOperation, options: SetCoverSolveOptions,
      snapshot: ReturnType<SetCoverGuidedSearch['capture']>): Promise<void> {
    if (this.handle !== undefined) { this.assertModel(); return; }
    await this.execute({ ...operation, type: 'sessionCreate', focus: null }, options, result => {
      if (!result.sessionHandle) throw new Error('Set Cover guided search creation returned no handle.');
      this.handle = result.sessionHandle;
      this.model = snapshot.model; this.modelVersion = snapshot.modelVersion;
      this.invariantVersion = snapshot.invariantVersion;
      this.appliedTuningVersions = { ...snapshot.tuningVersions };
      this.commit(result, snapshot);
      snapshot.invariantVersion = this.invariantVersion;
    }, true);
  }

  private commit(result: SetCoverBridgeResult, snapshot: ReturnType<SetCoverGuidedSearch['capture']>): void {
    this.assertModel();
    if ((invariantVersions.get(this.invariant) ?? 0) !== snapshot.invariantVersion) throw new Error('Set Cover invariant was modified during guided search; its stale result was discarded.');
    invariantCommits.get(this.invariant)!(result);
    this.invariantVersion = invariantVersions.get(this.invariant) ?? 0;
    this.appliedTuningVersions = { ...snapshot.tuningVersions };
  }

  protected override executeSearch(operation: SetCoverSearchOperation, options: SetCoverSolveOptions): Promise<SetCoverBridgeResult> {
    const snapshot = this.capture();
    return this.launch(options, async () => {
      this.bind(options); this.assertModel();
      if (this.handle !== undefined && this.invariantVersion !== snapshot.invariantVersion) throw new Error('Set Cover invariant changed outside this guided search; call initialize() to load the current cover.');
      await this.ensureSession(operation, options, snapshot);
      return this.execute({ type: 'sessionNext', handle: this.handle!, focus: operation.focus, maxIterations: operation.maxIterations,
        timeLimitSeconds: operation.timeLimitSeconds, guidedTabuParameters: this.changes(snapshot) }, options, result => this.commit(result, snapshot));
    });
  }

  async initialize(options: SetCoverSolveOptions = {}): Promise<void> {
    beginSetCoverSolve(this.invariant);
    try {
      const snapshot = this.capture();
      const operation = createSetCoverOperation(snapshot.model, this.invariant.isSelected(), null, this.algorithm, 0, Infinity, this.modelSnapshot());
      if (this.algorithm === 'guidedTabu') operation.guidedTabuParameters = snapshot.parameters;
      await this.launch(options, async () => {
        this.bind(options); this.assertModel();
        const existed = this.handle !== undefined;
        await this.ensureSession(operation, options, snapshot);
        if (existed) await this.execute({ type: 'sessionInitialize', handle: this.handle!, selected: operation.selected,
          guidedTabuParameters: this.changes(snapshot) }, options, result => this.commit(result, snapshot));
      });
    } finally { finishSetCoverSolve(this.invariant); }
  }

  protected readGuidedTabuParameters(options: SetCoverSolveOptions): Promise<GuidedTabuParameters> {
    const snapshot = this.capture();
    return this.launch(options, async () => {
      if (this.handle === undefined) {
        const result = await runNativeSetCover({ type: 'guidedTabuParameters', parameters: snapshot.parameters }, this.lifecycleOptions(options));
        if (!result.guidedTabuParameters) throw new Error('SetCover executor did not return native guided tabu parameters.');
        return result.guidedTabuParameters;
      }
      this.bind(options); this.assertModel();
      const result = await this.execute({ type: 'guidedTabuParameters', handle: this.handle, parameters: this.changes(snapshot) }, options,
        () => { this.appliedTuningVersions = { ...snapshot.tuningVersions }; });
      if (!result.guidedTabuParameters) throw new Error('SetCover executor did not return native guided tabu parameters.');
      return result.guidedTabuParameters;
    });
  }

  close(): Promise<void> {
    if (this.callbackDepth) return Promise.reject(new Error('Set Cover guided search cannot be closed inside its event handler.'));
    if (this.state === 'closed') return Promise.resolve();
    if (this.closePromise) return this.closePromise;
    this.state = 'closing';
    this.closePromise = (async () => {
      await this.active?.catch(() => undefined);
      if (this.handle !== undefined) {
        try {
          await executeSolverJob(this.executor!, { type: 'sessionDelete', handle: this.handle }, { showCloudNotice: false, onDispatch: runtime => this.assertRuntime(runtime) });
        } catch (error) { if (!(error instanceof SetCoverRuntimeLostError)) throw error; }
      }
      this.handle = undefined; this.runtime = undefined; this.model = undefined;
      this.executor = undefined; this.configuration = undefined; this.state = 'closed';
    })().finally(() => { this.closePromise = undefined; });
    return this.closePromise;
  }
}

export class GuidedLocalSearch extends SetCoverGuidedSearch {
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'guidedLocal', 'GuidedLocalSearch');
  }
}

export class GuidedTabuSearch extends SetCoverGuidedSearch {
  protected override guidedTabuParameters: Partial<GuidedTabuParameters> = {};
  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'guidedTabu', 'GuidedTabuSearch');
  }

  private setParameter(key: 'lagrangianFactor' | 'epsilon' | 'penaltyFactor', value: number): void {
    if (!Number.isFinite(value)) throw new RangeError('SetCover: guided tabu parameters must be finite.');
    this.guidedTabuParameters[key] = value;
    this.tuningVersions[key] = ++this.tuningVersion;
  }


  setLagrangianFactor(factor: number): void { this.setParameter('lagrangianFactor', factor); }
  async getLagrangianFactor(options: SetCoverSolveOptions = {}): Promise<number> { return (await this.readGuidedTabuParameters(options)).lagrangianFactor; }
  setEpsilon(epsilon: number): void { this.setParameter('epsilon', epsilon); }
  async getEpsilon(options: SetCoverSolveOptions = {}): Promise<number> { return (await this.readGuidedTabuParameters(options)).epsilon; }
  setPenaltyFactor(factor: number): void { this.setParameter('penaltyFactor', factor); }
  async getPenaltyFactor(options: SetCoverSolveOptions = {}): Promise<number> { return (await this.readGuidedTabuParameters(options)).penaltyFactor; }
  setTabuListSize(size: number): void {
    if (!Number.isInteger(size) || size <= 0 || size > 0x7fffffff) throw new RangeError('SetCover: tabu list size must be a positive int32.');
    this.guidedTabuParameters.tabuListSize = size;
    this.tuningVersions.tabuListSize = ++this.tuningVersion;
  }
  async getTabuListSize(options: SetCoverSolveOptions = {}): Promise<number> { return (await this.readGuidedTabuParameters(options)).tabuListSize; }
}
