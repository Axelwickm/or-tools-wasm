import type { OrToolsWasmModule } from './wasm_module_types.js';
import { loadSetCoverRuntime } from './runtime_loader.js';
import type { WorkerResponse } from './worker_protocol.js';
import {
  isWorkerBridgeEnabled,
  nextWorkerBridgeRequestId,
  postWorkerRequest,
  setWorkerBridgeEnabled,
  shouldUseWorkerBridge,
} from './worker_bridge.js';

type CReturn = 'number' | 'string' | undefined;

type SetCoverExports = {
  nextSolutionSerialized(
    costsPtr: number,
    startsPtr: number,
    elementsPtr: number,
    numSubsets: number,
    numElementsData: number,
    selectedPtr: number,
    focusPtr: number,
    operation: number,
    maxIterations: number,
  ): string;
};

export enum ConsistencyLevel {
  COST_AND_COVERAGE = 1,
  FREE_AND_UNCOVERED = 2,
  REDUNDANCY = 3,
}

export const consistency_level = ConsistencyLevel;

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

type NativeSetCoverResult =
  | { ok: false; error: string }
  | {
      ok: true;
      nextSolution: boolean;
      cost: number;
      numUncoveredElements: number;
      selected: boolean[];
      coverage: number[];
      numFreeElements: number[];
      numCoverageLe1Elements: number[];
      isRedundant: boolean[];
    };

type NativeSetCoverOperation =
  | 'trivial'
  | 'greedy'
  | 'elementDegree'
  | 'lazyElementDegree'
  | 'random'
  | 'steepest'
  | 'guidedLocal'
  | 'guidedTabu';

type SetCoverSolvePayload = {
  operation: NativeSetCoverOperation;
  costs: number[];
  starts: number[];
  elements: number[];
  selected: boolean[];
  focus: boolean[] | null;
  maxIterations: number;
};

const operationCode: Record<NativeSetCoverOperation, number> = {
  trivial: 0,
  greedy: 1,
  elementDegree: 2,
  lazyElementDegree: 3,
  random: 4,
  steepest: 5,
  guidedLocal: 6,
  guidedTabu: 7,
};

let setCoverModulePromise: Promise<OrToolsWasmModule> | null = null;
let setCoverModule: OrToolsWasmModule | null = null;
let setCoverExports: SetCoverExports | null = null;

function wrap<T extends (...args: never[]) => unknown>(
  module: OrToolsWasmModule,
  name: string,
  returnType: CReturn,
  argTypes: string[],
): T {
  return module.cwrap(name, returnType, argTypes) as unknown as T;
}

function createSetCoverExports(module: OrToolsWasmModule): SetCoverExports {
  return {
    nextSolutionSerialized: wrap(module, 'set_cover_next_solution_serialized', 'string', [
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
    ]),
  };
}

export async function initSetCover(): Promise<void> {
  setCoverModulePromise ??= loadSetCoverRuntime().then((module) => {
    setCoverModule = module;
    setCoverExports = createSetCoverExports(module);
    return module;
  });
  await setCoverModulePromise;
}

function currentModule() {
  if (!setCoverModule) {
    throw new Error('Set Cover runtime has not been initialized. Call initSetCover() first.');
  }
  return setCoverModule;
}

function currentExports() {
  if (!setCoverExports) {
    throw new Error('Set Cover runtime has not been initialized. Call initSetCover() first.');
  }
  return setCoverExports;
}

function copyFloat64ToHeap(module: OrToolsWasmModule, values: number[]) {
  if (!values.length) return 0;
  const ptr = module._malloc(values.length * Float64Array.BYTES_PER_ELEMENT);
  new Float64Array(module.HEAPU8.buffer, ptr, values.length).set(values);
  return ptr;
}

function boolsToNumbers(values: boolean[]) {
  return values.map((value) => value ? 1 : 0);
}

function parseNativeResult(serialized: string): Extract<NativeSetCoverResult, { ok: true }> {
  const result = JSON.parse(serialized) as NativeSetCoverResult;
  if (!result.ok) {
    throw new Error(result.error || 'SetCover: native operation failed.');
  }
  return result;
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

async function runNativeSetCover(payload: SetCoverSolvePayload) {
  if (shouldUseWorkerBridge()) {
    const response = await postWorkerRequest<Extract<WorkerResponse, { type: 'setCoverResult' }>>({
      type: 'setCover',
      id: nextWorkerBridgeRequestId(),
      ...payload,
    });
    return parseNativeResult(response.result);
  }

  await initSetCover();
  const module = currentModule();
  const exports = currentExports();
  const costsPtr = copyFloat64ToHeap(module, payload.costs);
  const startsPtr = copyFloat64ToHeap(module, payload.starts);
  const elementsPtr = copyFloat64ToHeap(module, payload.elements);
  const selectedPtr = copyFloat64ToHeap(module, boolsToNumbers(payload.selected));
  const focusPtr = payload.focus ? copyFloat64ToHeap(module, boolsToNumbers(payload.focus)) : 0;
  try {
    return parseNativeResult(exports.nextSolutionSerialized(
      costsPtr,
      startsPtr,
      elementsPtr,
      payload.costs.length,
      payload.elements.length,
      selectedPtr,
      focusPtr,
      operationCode[payload.operation],
      payload.maxIterations,
    ));
  } finally {
    if (costsPtr) module._free(costsPtr);
    if (startsPtr) module._free(startsPtr);
    if (elementsPtr) module._free(elementsPtr);
    if (selectedPtr) module._free(selectedPtr);
    if (focusPtr) module._free(focusPtr);
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

  get to_string() {
    return `${this.min}, ${this.max}, ${this.median}, ${this.mean}, ${this.stddev}`;
  }

  get to_verbose_string() {
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

  get num_elements() {
    let max = -1;
    for (const subset of this.subsetElements) {
      for (const element of subset) max = Math.max(max, element);
    }
    return max + 1;
  }

  get num_subsets() {
    return this.subsetElements.length;
  }

  get num_nonzeros() {
    return this.subsetElements.reduce((sum, subset) => sum + subset.length, 0);
  }

  get fill_rate() {
    const denominator = this.num_elements * this.num_subsets;
    return denominator === 0 ? 0 : this.num_nonzeros / denominator;
  }

  get subset_costs() {
    return [...this.costs];
  }

  get columns() {
    return this.subsetElements.map((subset) => [...subset]);
  }

  get rows() {
    if (!this.validRows) this.create_sparse_row_view();
    return this.rowElements.map((row) => [...row]);
  }

  get row_view_is_valid() {
    return this.validRows;
  }

  get all_subsets() {
    return this.SubsetRange();
  }

  SubsetRange() {
    return Array.from({ length: this.num_subsets }, (_, index) => index);
  }

  ElementRange() {
    return Array.from({ length: this.num_elements }, (_, index) => index);
  }

  set_name(name: string) {
    this.modelName = name;
  }

  add_empty_subset(cost: number) {
    if (!Number.isFinite(cost)) throw new Error('SetCoverModel.add_empty_subset: cost must be finite.');
    this.costs.push(cost);
    this.subsetElements.push([]);
    this.validRows = false;
  }

  add_element_to_last_subset(element: number) {
    if (!this.subsetElements.length) {
      throw new Error('SetCoverModel.add_element_to_last_subset: no subset exists.');
    }
    this.add_element_to_subset(element, this.subsetElements.length - 1);
  }

  set_subset_cost(subset: number, cost: number) {
    assertSubsetIndex(subset, this.num_subsets);
    if (!Number.isFinite(cost)) throw new Error('SetCoverModel.set_subset_cost: cost must be finite.');
    this.costs[subset] = cost;
  }

  add_element_to_subset(element: number, subset: number) {
    assertSubsetIndex(subset, this.num_subsets);
    if (!Number.isInteger(element) || element < 0) {
      throw new Error('SetCoverModel.add_element_to_subset: element must be a non-negative integer.');
    }
    this.subsetElements[subset].push(element);
    this.validRows = false;
  }

  create_sparse_row_view() {
    this.rowElements = Array.from({ length: this.num_elements }, () => []);
    this.subsetElements.forEach((subset, subsetIndex) => {
      for (const element of subset) {
        this.rowElements[element]?.push(subsetIndex);
      }
    });
    this.rowElements.forEach((row) => row.sort((a, b) => a - b));
    this.validRows = true;
  }

  sort_elements_in_subsets() {
    this.subsetElements.forEach((subset) => subset.sort((a, b) => a - b));
    this.validRows = false;
  }

  compute_feasibility() {
    const covered = new Set<number>();
    for (const subset of this.subsetElements) {
      for (const element of subset) covered.add(element);
    }
    for (let element = 0; element < this.num_elements; element++) {
      if (!covered.has(element)) return false;
    }
    return this.num_elements > 0 || this.num_subsets > 0;
  }

  resize_num_subsets(numSubsets: number) {
    while (this.num_subsets < numSubsets) this.add_empty_subset(0);
  }

  reserve_num_elements_in_subset(_numElements: number, subset: number) {
    assertSubsetIndex(subset, this.num_subsets);
  }

  export_model_as_proto(): SetCoverModelProto {
    return {
      name: this.modelName,
      subset: this.subsetElements.map((element, index) => ({ cost: this.costs[index], element: [...element].sort((a, b) => a - b) })),
    };
  }

  import_model_from_proto(proto: SetCoverModelProto) {
    this.modelName = proto.name ?? 'SetCoverModel';
    this.costs = proto.subset.map((subset) => subset.cost ?? 0);
    this.subsetElements = proto.subset.map((subset) => [...(subset.element ?? [])]);
    this.validRows = false;
  }

  compute_cost_stats() {
    return stats(this.costs);
  }

  compute_row_stats() {
    return stats(this.rows.map((row) => row.length));
  }

  compute_column_stats() {
    return stats(this.subsetElements.map((subset) => subset.length));
  }

  compute_row_deciles() {
    return deciles(this.rows.map((row) => row.length));
  }

  compute_column_deciles() {
    return deciles(this.subsetElements.map((subset) => subset.length));
  }

  _nativePayload(selected: boolean[], focus: boolean[] | null, operation: NativeSetCoverOperation, maxIterations: number): SetCoverSolvePayload {
    const starts: number[] = [0];
    const elements: number[] = [];
    for (const subset of this.subsetElements) {
      elements.push(...subset);
      starts.push(elements.length);
    }
    return {
      operation,
      costs: [...this.costs],
      starts,
      elements,
      selected,
      focus,
      maxIterations,
    };
  }
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
    this.selected = Array.from({ length: this.currentModel.num_subsets }, () => false);
    this.solutionTrace = [];
    this.recompute();
  }

  clear() {
    this.initialize();
  }

  model() {
    return this.currentModel;
  }

  get model_property() {
    return this.currentModel;
  }

  set model_property(model: SetCoverModel) {
    this.currentModel = model;
    this.initialize();
  }

  cost() {
    return this.currentCost;
  }

  num_uncovered_elements() {
    return this.uncoveredElements;
  }

  is_selected() {
    return [...this.selected];
  }

  num_free_elements() {
    return [...this.freeElements];
  }

  num_coverage_le_1_elements() {
    return [...this.coverageLe1Elements];
  }

  coverage() {
    return [...this.currentCoverage];
  }

  compute_coverage_in_focus(focus: number[]) {
    const coverage = Array.from({ length: this.currentModel.num_elements }, () => 0);
    const columns = this.currentModel.columns;
    for (const subset of focus) {
      assertSubsetIndex(subset, this.currentModel.num_subsets);
      for (const element of columns[subset]) coverage[element]++;
    }
    return coverage;
  }

  is_redundant() {
    return [...this.redundant];
  }

  trace() {
    return [...this.solutionTrace];
  }

  clear_trace() {
    this.solutionTrace = [];
  }

  clear_removability_information() {}

  newly_removable_subsets() {
    return [];
  }

  newly_non_removable_subsets() {
    return [];
  }

  compress_trace() {
    this.solutionTrace = this.selected
      .map((value, subset) => value ? new SetCoverDecision(subset, true) : null)
      .filter((value): value is SetCoverDecision => value !== null);
  }

  load_solution(solution: boolean[]) {
    if (solution.length !== this.currentModel.num_subsets) {
      throw new Error('SetCoverInvariant.load_solution: solution length must match num_subsets.');
    }
    this.selected = [...solution];
    this.solutionTrace = solution
      .map((value, subset) => value ? new SetCoverDecision(subset, true) : null)
      .filter((value): value is SetCoverDecision => value !== null);
    this.recompute();
  }

  check_consistency(_consistency: ConsistencyLevel) {
    this.recompute();
    return this.currentCoverage.length === this.currentModel.num_elements &&
      this.selected.length === this.currentModel.num_subsets;
  }

  compute_is_redundant(subset: number) {
    assertSubsetIndex(subset, this.currentModel.num_subsets);
    return this.currentModel.columns[subset].every((element) => this.currentCoverage[element] > 1);
  }

  recompute() {
    const columns = this.currentModel.columns;
    const costs = this.currentModel.subset_costs;
    this.currentCoverage = Array.from({ length: this.currentModel.num_elements }, () => 0);
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
    assertSubsetIndex(subset, this.currentModel.num_subsets);
    if (this.selected[subset]) return false;
    this.selected[subset] = true;
    this.solutionTrace.push(new SetCoverDecision(subset, true));
    this.recompute();
    return true;
  }

  deselect(subset: number, _consistency: ConsistencyLevel) {
    assertSubsetIndex(subset, this.currentModel.num_subsets);
    if (!this.selected[subset]) return false;
    this.selected[subset] = false;
    this.solutionTrace.push(new SetCoverDecision(subset, false));
    this.recompute();
    return true;
  }

  export_solution_as_proto() {
    const subsets = this.selected.flatMap((value, subset) => value ? [subset] : []);
    return createSolutionResponse(subsets, this.currentCost, this.currentModel.num_subsets);
  }

  import_solution_from_proto(proto: SetCoverSolutionResponse) {
    const selected = Array.from({ length: this.currentModel.num_subsets }, () => false);
    for (const subset of proto.subset ?? []) {
      assertSubsetIndex(subset, this.currentModel.num_subsets);
      selected[subset] = true;
    }
    this.load_solution(selected);
  }

  _applyNativeResult(result: Extract<NativeSetCoverResult, { ok: true }>) {
    this.selected = [...result.selected];
    this.currentCost = result.cost;
    this.uncoveredElements = result.numUncoveredElements;
    this.currentCoverage = [...result.coverage];
    this.freeElements = [...result.numFreeElements];
    this.coverageLe1Elements = [...result.numCoverageLe1Elements];
    this.redundant = [...result.isRedundant];
    this.compress_trace();
  }

  _nativeSelected() {
    return [...this.selected];
  }
}

abstract class SetCoverSolutionGenerator {
  private maxIterations = Number.POSITIVE_INFINITY;

  constructor(
    protected readonly invariant: SetCoverInvariant,
    private readonly operation: NativeSetCoverOperation,
    private readonly generatorName: string,
  ) {}

  set_max_iterations(maxIterations: number) {
    this.maxIterations = maxIterations;
  }

  async next_solution(focus?: number[] | boolean[]) {
    const model = this.invariant.model();
    let focusMask: boolean[] | null = null;
    if (Array.isArray(focus)) {
      if (focus.every((value) => typeof value === 'boolean')) {
        focusMask = [...focus as boolean[]];
      } else {
        focusMask = Array.from({ length: model.num_subsets }, () => false);
        for (const subset of focus as number[]) {
          assertSubsetIndex(subset, model.num_subsets);
          focusMask[subset] = true;
        }
      }
    }
    const result = await runNativeSetCover(model._nativePayload(
      this.invariant._nativeSelected(),
      focusMask,
      this.operation,
      this.maxIterations,
    ));
    this.invariant._applyNativeResult(result);
    return result.nextSolution;
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

  initialize() {}
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
  private lagrangianFactor = 100;
  private epsilon = 1e-6;
  private penaltyFactor = 0.3;
  private tabuListSize = 17;

  constructor(invariant: SetCoverInvariant) {
    super(invariant, 'guidedTabu', 'GuidedTabuSearch');
  }

  initialize() {}

  set_lagrangian_factor(factor: number) {
    this.lagrangianFactor = factor;
  }

  get_lagrangian_factor() {
    return this.lagrangianFactor;
  }

  set_epsilon(value: number) {
    this.epsilon = value;
  }

  get_epsilon() {
    return this.epsilon;
  }

  set_penalty_factor(factor: number) {
    this.penaltyFactor = factor;
  }

  get_penalty_factor() {
    return this.penaltyFactor;
  }

  set_tabu_list_size(size: number) {
    this.tabuListSize = size;
  }

  get_tabu_list_size() {
    return this.tabuListSize;
  }
}

export function clear_random_subsets(numSubsetsOrFocus: number | number[], invariantOrNumSubsets: SetCoverInvariant | number, maybeInvariant?: SetCoverInvariant) {
  const invariant = typeof numSubsetsOrFocus === 'number' ? invariantOrNumSubsets as SetCoverInvariant : maybeInvariant;
  const numSubsets = typeof numSubsetsOrFocus === 'number' ? numSubsetsOrFocus : invariantOrNumSubsets as number;
  if (!invariant) throw new Error('clear_random_subsets: invariant is required.');
  const selected = invariant.is_selected();
  const chosen: number[] = [];
  for (let subset = 0; subset < selected.length && chosen.length < numSubsets; subset++) {
    if (selected[subset]) {
      invariant.deselect(subset, ConsistencyLevel.COST_AND_COVERAGE);
      chosen.push(subset);
    }
  }
  return chosen;
}

export const clear_most_covered_elements = clear_random_subsets;

export function read_set_cover_proto(_filename: string, _binary?: boolean): SetCoverModel {
  throw new Error('read_set_cover_proto is not available in the browser-oriented wasm runtime. Use import_model_from_proto().');
}

export function write_set_cover_proto(_model: SetCoverModel, _filename: string, _binary?: boolean): void {
  throw new Error('write_set_cover_proto is not available in the browser-oriented wasm runtime. Use export_model_as_proto().');
}

export function read_set_cover_solution_proto(_filename: string, _binary?: boolean): SetCoverSolutionResponse {
  throw new Error('read_set_cover_solution_proto is not available in the browser-oriented wasm runtime. Use import_solution_from_proto().');
}

export function write_set_cover_solution_proto(_model: SetCoverModel, _solution: boolean[], _filename: string, _binary?: boolean): void {
  throw new Error('write_set_cover_solution_proto is not available in the browser-oriented wasm runtime. Use export_solution_as_proto().');
}

export const read_orlib_scp = read_set_cover_proto;
export const read_orlib_rail = read_set_cover_proto;
export const read_fimi_dat = read_set_cover_proto;
export const write_orlib_scp = write_set_cover_proto;
export const write_orlib_rail = write_set_cover_proto;
export const write_set_cover_solution_text = write_set_cover_solution_proto;
export const read_set_cover_solution_text = read_set_cover_solution_proto;

export { isWorkerBridgeEnabled, setWorkerBridgeEnabled };
