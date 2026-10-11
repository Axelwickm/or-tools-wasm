import { setCoverTraceCases } from '../../or-tools-wasm/set_cover/trace_limits.ts';
import { setCoverNumericalCases } from '../../or-tools-wasm/set_cover/numerical.ts';
import { assertCaseMatrix } from '../../../harness/shared_case.ts';
import type { ExecutorFixtureMode, SharedCase, SharedCaseResult } from '../../../harness/shared_case.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  passedCase,
  serverExecutorConfiguration,
  solverJobStates,
} from '../../../harness/shared_case.ts';
import { setCoverExecutionOptions, setSetCoverMode } from './execution.ts';
import { runSetCoverWorkerLifecycleCase } from '../../or-tools-wasm/set_cover/worker_lifecycle.ts';

export type SetCoverCaseResult = {
  cost: number;
  numUncoveredElements: number;
} & SharedCaseResult<ExecutorFixtureMode>;

type SetCoverCaseData = {
  cost: number;
  numUncoveredElements: number;
};

type SetCoverModelLike = {
  name: string;
  numElements: number;
  numSubsets: number;
  subsetCosts: number[];
  columns: number[][];
  rows: number[][];
  rowViewIsValid: boolean;
  computeCostStats(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<{ min: number; max: number; median: number; mean: number; stddev: number; iqr: number }>;
  computeRowStats(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<{ min: number; max: number; median: number; mean: number; stddev: number; iqr: number }>;
  computeColumnStats(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<{ min: number; max: number; median: number; mean: number; stddev: number; iqr: number }>;
  computeRowDeciles(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<number[]>;
  computeColumnDeciles(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<number[]>;
  addEmptySubset(cost: number): void;
  setSubsetCost(subset: number, cost: number): void;
  addElementToLastSubset(element: number): void;
  addElementToSubset(element: number, subset: number): void;
  sortElementsInSubsets(): void;
  computeFeasibility(): boolean;
  exportModelAsProto(): unknown;
  importModelFromProto(proto: unknown): void;
};

type SetCoverInvariantLike = {
  cost(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<number>;
  numUncoveredElements(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<number>;
  loadSolution(solution: boolean[]): void;
  computeIsRedundant(subset: number, options?: ReturnType<typeof setCoverExecutionOptions>): Promise<boolean>;
  exportSolutionAsProto(options?: ReturnType<typeof setCoverExecutionOptions>): Promise<{ toString(): string; status?: number; costLowerBound?: number; numSubsets?: number }>;
  importSolutionFromProto(proto: unknown): void;
};

type SetCoverGeneratorLike = {
  nextSolution(focus?: number[] | boolean[], options?: {
    executor?: 'direct' | 'worker' | ReturnType<typeof serverExecutorConfiguration>;
    signal?: AbortSignal;
    onEvent?: (event: { type: string; status?: { state: number } }) => void | Promise<void>;
  }): Promise<boolean>;
  setMaxIterations(maxIterations: number): void;
  setTimeLimitInSeconds(seconds: number): unknown;
};

type SetCoverGuidedLike = SetCoverGeneratorLike & {
  initialize(options?: ReturnType<typeof setCoverExecutionOptions> & { onEvent?: (event: { type: string; status?: { state: number } }) => void | Promise<void> }): Promise<void>;
  close(): Promise<void>;
};

type SetCoverGuidedTabuLike = SetCoverGuidedLike & {
  setLagrangianFactor(value: number): void;
  getLagrangianFactor(options?: ReturnType<typeof setCoverExecutionOptions> & { signal?: AbortSignal }): Promise<number>;
  setEpsilon(value: number): void;
  getEpsilon(options?: ReturnType<typeof setCoverExecutionOptions> & { signal?: AbortSignal }): Promise<number>;
  setPenaltyFactor(value: number): void;
  getPenaltyFactor(options?: ReturnType<typeof setCoverExecutionOptions> & { signal?: AbortSignal }): Promise<number>;
  setTabuListSize(value: number): void;
  getTabuListSize(options?: ReturnType<typeof setCoverExecutionOptions> & { signal?: AbortSignal }): Promise<number>;
};

export type SetCoverApi = {
  SetCover: {
    solve(model: any, options?: ReturnType<typeof setCoverExecutionOptions>):
      Promise<{ hasSolution: boolean; cost: number; numUncoveredElements: number }>;
  };
  SetCoverModel: { new(): SetCoverModelLike };
  SetCoverInvariant: { new(model: any): SetCoverInvariantLike };
  TrivialSolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  RandomSolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  GreedySolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  ElementDegreeSolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  SteepestSearch: { new(invariant: any): SetCoverGeneratorLike };
  GuidedLocalSearch: { new(invariant: any): SetCoverGuidedLike };
  terminateLoadedRuntimeThreads(): Promise<void>;
  GuidedTabuSearch: { new(invariant: any): SetCoverGuidedTabuLike };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNumber(actual: number, expected: number, message: string) {
  assert(actual === expected, `${message}: expected ${expected}, got ${actual}`);
}

function assertArray(actual: unknown[], expected: unknown[], message: string) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

function createInitialCoverModel(api: SetCoverApi) {
  const model = new api.SetCoverModel();
  model.addEmptySubset(1.0);
  model.addElementToLastSubset(0);
  model.addEmptySubset(1.0);
  model.addElementToLastSubset(1);
  model.addElementToLastSubset(2);
  model.addEmptySubset(1.0);
  model.addElementToLastSubset(1);
  model.addEmptySubset(1.0);
  model.addElementToLastSubset(2);
  return model;
}

function createKnightsCoverModel(api: SetCoverApi, numRows: number, numCols: number) {
  const model = new api.SetCoverModel();
  const knightRowMove = [2, 1, -1, -2, -2, -1, 1, 2];
  const knightColMove = [1, 2, 2, 1, -1, -2, -2, -1];

  for (let row = 0; row < numRows; ++row) {
    for (let col = 0; col < numCols; ++col) {
      model.addEmptySubset(1.0);
      model.addElementToLastSubset(row * numCols + col);

      for (let i = 0; i < 8; ++i) {
        const newRow = row + knightRowMove[i];
        const newCol = col + knightColMove[i];
        if (0 <= newRow && newRow < numRows && 0 <= newCol && newCol < numCols) {
          model.addElementToLastSubset(newRow * numCols + newCol);
        }
      }
    }
  }

  return model;
}

async function runSaveReload(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_save_reload assertion-by-assertion.
  const model = createKnightsCoverModel(api, 10, 10);
  model.sortElementsInSubsets();
  const proto = model.exportModelAsProto();
  const reloaded = new api.SetCoverModel();
  reloaded.importModelFromProto(proto);

  assertNumber(model.numSubsets, reloaded.numSubsets, `SetCoverTest.test_save_reload (${mode}) numSubsets`);
  assertNumber(model.numElements, reloaded.numElements, `SetCoverTest.test_save_reload (${mode}) numElements`);
  assertArray(model.subsetCosts, reloaded.subsetCosts, `SetCoverTest.test_save_reload (${mode}) subsetCosts`);
  assertArray(model.columns, reloaded.columns, `SetCoverTest.test_save_reload (${mode}) columns`);
  if (model.rowViewIsValid && reloaded.rowViewIsValid) {
    assertArray(model.rows, reloaded.rows, `SetCoverTest.test_save_reload (${mode}) rows`);
  }
  return { cost: 0, numUncoveredElements: 0 };
}

async function runSaveReloadTwice(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: binding variant - native consistency assertions excluded; other upstream assertions retained.
  // mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_save_reload_twice (remaining assertions).
  const model = createKnightsCoverModel(api, 3, 3);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_save_reload_twice (${mode}) greedy nextSolution`);
  const greedyProto = await inv.exportSolutionAsProto(setCoverExecutionOptions());

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_save_reload_twice (${mode}) steepest nextSolution`);
  const steepestProto = await inv.exportSolutionAsProto(setCoverExecutionOptions());

  inv.importSolutionFromProto(greedyProto);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_save_reload_twice (${mode}) reloaded steepest nextSolution`);
  const reloadedProto = await inv.exportSolutionAsProto(setCoverExecutionOptions());
  assert(
    steepestProto.toString() === reloadedProto.toString(),
    `SetCoverTest.test_save_reload_twice (${mode}) proto string equality`,
  );
  return { cost: await inv.cost(setCoverExecutionOptions()), numUncoveredElements: await inv.numUncoveredElements(setCoverExecutionOptions()) };
}

async function runInitialValues(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: binding variant - native consistency assertions excluded; other upstream assertions retained.
  // mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_initial_values (remaining assertions).
  const model = createInitialCoverModel(api);
  assert(model.computeFeasibility(), `SetCoverTest.test_initial_values (${mode}) computeFeasibility`);

  const inv = new api.SetCoverInvariant(model);
  const trivial = new api.TrivialSolutionGenerator(inv);
  const states: number[] = [];
  assert(await trivial.nextSolution(undefined, {
    ...setCoverExecutionOptions(),
    onEvent(event) {
      if (event.type === 'status' && event.status) states.push(event.status.state);
    },
  }), `SetCoverTest.test_initial_values (${mode}) trivial nextSolution`);
  assert(states.includes(solverJobStates.RUNNING), `Set Cover (${mode}) did not emit RUNNING status`);
  assert(states.includes(solverJobStates.SUCCEEDED), `Set Cover (${mode}) did not emit SUCCEEDED status`);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_initial_values (${mode}) greedy nextSolution`);

  assertNumber(await inv.numUncoveredElements(setCoverExecutionOptions()), 0, `SetCoverTest.test_initial_values (${mode}) numUncoveredElements`);
  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_initial_values (${mode}) steepest nextSolution`);
  return { cost: await inv.cost(setCoverExecutionOptions()), numUncoveredElements: await inv.numUncoveredElements(setCoverExecutionOptions()) };
}

async function runInfeasible(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_infeasible assertion-by-assertion.
  const model = new api.SetCoverModel();
  model.addEmptySubset(1.0);
  model.addElementToLastSubset(0);
  model.addEmptySubset(1.0);
  model.addElementToLastSubset(3);
  assert(!model.computeFeasibility(), `SetCoverTest.test_infeasible (${mode}) computeFeasibility`);
  return { cost: 0, numUncoveredElements: 0 };
}

async function runKnightsCoverCreation(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_creation assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_creation (${mode}) computeFeasibility`);
  return { cost: 0, numUncoveredElements: 0 };
}

async function runKnightsCoverGreedy(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: binding variant - native consistency assertions excluded; other upstream assertions retained.
  // mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_greedy (remaining assertions).
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_greedy (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_greedy (${mode}) greedy nextSolution`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_greedy (${mode}) steepest nextSolution`);
  return { cost: await inv.cost(setCoverExecutionOptions()), numUncoveredElements: await inv.numUncoveredElements(setCoverExecutionOptions()) };
}

async function runKnightsCoverDegree(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: binding variant - native consistency assertions excluded; other upstream assertions retained.
  // mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_degree (remaining assertions).
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_degree (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const degree = new api.ElementDegreeSolutionGenerator(inv);
  assert(await degree.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_degree (${mode}) degree nextSolution`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_degree (${mode}) steepest nextSolution`);
  return { cost: await inv.cost(setCoverExecutionOptions()), numUncoveredElements: await inv.numUncoveredElements(setCoverExecutionOptions()) };
}

async function runKnightsCoverGls(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: binding variant - native consistency assertions excluded; other upstream assertions retained.
  // mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_gls (remaining assertions).
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_gls (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_gls (${mode}) greedy nextSolution`);

  const gls = new api.GuidedLocalSearch(inv);
  try {
    gls.setMaxIterations(500);
    assert(await gls.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_gls (${mode}) gls nextSolution`);
    return { cost: await inv.cost(setCoverExecutionOptions()), numUncoveredElements: await inv.numUncoveredElements(setCoverExecutionOptions()) };
  } finally { await gls.close(); }
}

async function runKnightsCoverRandom(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: binding variant - native consistency assertions excluded; other upstream assertions retained.
  // mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_random (remaining assertions).
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_random (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const random = new api.RandomSolutionGenerator(inv);
  assert(await random.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_random (${mode}) random nextSolution`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_random (${mode}) steepest nextSolution`);
  return { cost: await inv.cost(setCoverExecutionOptions()), numUncoveredElements: await inv.numUncoveredElements(setCoverExecutionOptions()) };
}

async function runKnightsCoverTrivial(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: binding variant - native consistency assertions excluded; other upstream assertions retained.
  // mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_trivial (remaining assertions).
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_trivial (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const trivial = new api.TrivialSolutionGenerator(inv);
  assert(await trivial.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_trivial (${mode}) trivial nextSolution`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_trivial (${mode}) steepest nextSolution`);
  return { cost: await inv.cost(setCoverExecutionOptions()), numUncoveredElements: await inv.numUncoveredElements(setCoverExecutionOptions()) };
}

type SetCoverCase = SharedCase<SetCoverApi, SetCoverCaseData, ExecutorFixtureMode>;

const setCoverSource = 'ortools/set_cover/python/set_cover_test.py';

export const setCoverCases: SetCoverCase[] = [
  {
    id: 'set_cover.set_cover_test.test_save_reload',
    name: 'SetCoverTest.test_save_reload',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_save_reload',
    tags: ['python-parity'],
    run: (api, context) => runSaveReload(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_save_reload_twice',
    name: 'SetCoverTest.test_save_reload_twice',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_save_reload_twice',
    tags: ['python-parity'],
    run: (api, context) => runSaveReloadTwice(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_initial_values',
    name: 'SetCoverTest.test_initial_values',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_initial_values',
    tags: ['python-parity'],
    run: (api, context) => runInitialValues(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_infeasible',
    name: 'SetCoverTest.test_infeasible',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_infeasible',
    tags: ['python-parity'],
    run: (api, context) => runInfeasible(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_knights_cover_creation',
    name: 'SetCoverTest.test_knights_cover_creation',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_knights_cover_creation',
    tags: ['python-parity'],
    run: (api, context) => runKnightsCoverCreation(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_knights_cover_greedy',
    name: 'SetCoverTest.test_knights_cover_greedy',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_knights_cover_greedy',
    tags: ['python-parity'],
    run: (api, context) => runKnightsCoverGreedy(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_knights_cover_degree',
    name: 'SetCoverTest.test_knights_cover_degree',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_knights_cover_degree',
    tags: ['python-parity'],
    run: (api, context) => runKnightsCoverDegree(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_knights_cover_gls',
    name: 'SetCoverTest.test_knights_cover_gls',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_knights_cover_gls',
    tags: ['python-parity'],
    run: (api, context) => runKnightsCoverGls(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_knights_cover_random',
    name: 'SetCoverTest.test_knights_cover_random',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_knights_cover_random',
    tags: ['python-parity'],
    run: (api, context) => runKnightsCoverRandom(api, context.mode ?? 'direct'),
  },
  {
    id: 'set_cover.set_cover_test.test_knights_cover_trivial',
    name: 'SetCoverTest.test_knights_cover_trivial',
    solver: 'set-cover',
    source: setCoverSource,
    upstream: 'SetCoverTest.test_knights_cover_trivial',
    tags: ['python-parity'],
    run: (api, context) => runKnightsCoverTrivial(api, context.mode ?? 'direct'),
  },
];

setCoverCases.push({
  id: 'set_cover.native.model_and_invariant_contract', name: 'SetCoverInvariant.model_and_invariant_contract',
  solver: 'set-cover', source: 'ortools/set_cover/set_cover_model.cc; ortools/set_cover/set_cover_invariant.cc',
  upstream: 'SetSubsetCost; ComputeIsRedundant; ExportSolutionAsProto', tags: ['python-parity', 'gap-regression'],
  async run(api) {
    const model = new api.SetCoverModel();
    model.setSubsetCost(4, 3);
    assert(model.numSubsets === 5 && model.subsetCosts[0] === 0, 'sparse subset cost setter grows storage with zero costs');
    model.addElementToSubset(0, 5);
    model.addElementToSubset(0, 4);
    assertNumber(model.numSubsets, 6, 'sparse element setter grows subset storage');
    const invariant = new api.SetCoverInvariant(model);
    invariant.loadSolution([false, false, false, false, true, false]);
    assert(await invariant.computeIsRedundant(5, setCoverExecutionOptions()), 'unselected subset already covered is redundant at a fresh inspection');
    assert(!(await invariant.computeIsRedundant(4, setCoverExecutionOptions())), 'the only selected cover is not redundant');
    const response = await invariant.exportSolutionAsProto(setCoverExecutionOptions());
    assert(response.status === undefined, 'native solution export does not fabricate feasibility status');
    assert(response.costLowerBound === 0 && response.numSubsets === 6, 'native solution export includes lower bound and model size');
    model.setSubsetCost(4, 7);
    assert(await invariant.cost(setCoverExecutionOptions()) === 7, 'native inspection reads updated model costs');
    return { cost: 7, numUncoveredElements: 0 };
  },
});

setCoverCases.push({
  id: 'set_cover.native.steepest_iteration_budget', name: 'SteepestSearch.iteration_budget', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_heuristics.cc', upstream: 'SteepestSearch::NextSolution', tags: ['python-parity', 'gap-regression'],
  async run(api) {
    const model = new api.SetCoverModel();
    model.addEmptySubset(1); model.addElementToLastSubset(0);
    model.addEmptySubset(2); model.addElementToLastSubset(0);
    const invariant = new api.SetCoverInvariant(model); invariant.loadSolution([true, true]);
    const search = new api.SteepestSearch(invariant);
    search.setMaxIterations(0); await search.nextSolution(undefined, setCoverExecutionOptions());
    assert(await invariant.cost(setCoverExecutionOptions()) === 3, 'zero iteration budget must preserve redundant starting cover');
    search.setMaxIterations(1); await search.nextSolution(undefined, setCoverExecutionOptions());
    assert(await invariant.cost(setCoverExecutionOptions()) === 1, 'one iteration must remove the expensive redundant subset');
    return { cost: await invariant.cost(setCoverExecutionOptions()), numUncoveredElements: await invariant.numUncoveredElements(setCoverExecutionOptions()) };
  },
});

setCoverCases.push({
  id: 'set_cover.native.statistics_deciles', name: 'SetCoverModel.native_statistics_deciles', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_model.cc', upstream: 'SetCoverModel::ComputeCostStats/ComputeRowStats/ComputeColumnStats/ComputeRowDeciles/ComputeColumnDeciles',
  tags: ['gap-regression', 'model-statistics'],
  async run(api) {
    const options = setCoverExecutionOptions(), model = new api.SetCoverModel();
    [0, 0, 2, 4].forEach((cost, subset) => { model.addEmptySubset(cost); for (let element = 0; element < [0, 1, 2, 4][subset]; ++element) model.addElementToLastSubset(element); });
    const pending = model.computeCostStats(options); model.setSubsetCost(0, 10);
    const costs = await pending;
    assertNumber(costs.min, 0, 'Statistics snapshot model data'); assertNumber(costs.max, 4, 'Maximum');
    assertNumber(costs.mean, 1.5, 'Mean includes zeros'); assertNumber(costs.median, 2, 'Native median');
    assertNumber(costs.stddev, 1, 'Native stddev excludes zero samples'); assertNumber(costs.iqr, 4, 'Native interquartile range');
    model.setSubsetCost(0, 0);
    const rows = await model.computeRowStats(options), columns = await model.computeColumnStats(options);
    assertNumber(rows.mean, 1.75, 'Row-size mean'); assertNumber(columns.mean, 1.75, 'Column-size mean');
    assertNumber(rows.min, 1, 'Row sizes'); assertNumber(columns.min, 0, 'Empty columns retained');
    assertArray(await model.computeRowDeciles(options), [0, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'Small native row deciles');
    assertArray(await model.computeColumnDeciles(options), Array(10).fill(0), 'Small native column deciles');
    const larger = new api.SetCoverModel();
    for (let column = 0; column < 20; ++column) { larger.addEmptySubset(column); for (let row = 0; row < column; ++row) larger.addElementToLastSubset(row); }
    assertArray(await larger.computeColumnDeciles(options), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], 'Native integer decile step');
    assertArray(await larger.computeRowDeciles(options), [0, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'Actual row distribution');
    const zero = new api.SetCoverModel(); zero.addEmptySubset(0);
    assertNumber((await zero.computeCostStats(options)).stddev, 0, 'All-zero native stddev');
    assertNumber((await zero.computeColumnStats(options)).stddev, 0, 'Zero-size column statistics');
    const overflow = new api.SetCoverModel(); overflow.addEmptySubset(1e200); overflow.addEmptySubset(2e200);
    assert(Number.isNaN((await overflow.computeCostStats(options)).stddev), 'Native nonfinite statistics survive transport');
    const empty = new api.SetCoverModel();
    for (const query of [() => empty.computeCostStats(options), () => empty.computeRowStats(options), () => empty.computeColumnStats(options),
      () => empty.computeRowDeciles(options), () => empty.computeColumnDeciles(options), () => zero.computeRowStats(options)]) {
      let rejected = false; try { await query(); } catch { rejected = true; }
      assert(rejected, 'Empty samples must reject safely');
    }
    const malformed = new api.SetCoverModel();
    for (const element of [-1, 2147483647]) {
      let rejected = false;
      try { malformed.importModelFromProto({ subset: [{ cost: 1, element: [element] }] }); } catch { rejected = true; }
      assert(rejected, 'Invalid imported element IDs must reject before unsafe native row indexing');
    }
    assertNumber((await model.computeCostStats(options)).mean, 1.5, 'Native query recovery');
    return { cost: 6, numUncoveredElements: 0 };
  },
});

setCoverCases.push({
  id: 'set_cover.native.guided_tabu_tuning', name: 'GuidedTabuSearch.native_tuning', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_heuristics.h; ortools/set_cover/set_cover_heuristics.cc',
  upstream: 'GuidedTabuSearch::Set/GetLagrangianFactor, Set/GetEpsilon, Set/GetPenaltyFactor, Set/GetTabuListSize', tags: ['native-contract', 'gap-regression'],
  async run(api) {
    const options = setCoverExecutionOptions(), model = createInitialCoverModel(api);
    const invariant = new api.SetCoverInvariant(model);
    const search = new api.GuidedTabuSearch(invariant);
    try {
      assert(await search.getLagrangianFactor(options) === 100 && await search.getEpsilon(options) === 1e-6 &&
        await search.getPenaltyFactor(options) === 0.3 && await search.getTabuListSize(options) === 17, 'Fresh getters return native defaults');
      assert(await invariant.numUncoveredElements(options) === model.numElements, 'Reading tuning performs no search');
      search.setEpsilon(0);
      assert(await search.getEpsilon(options) === 0 && await search.getPenaltyFactor(options) === 0.3, 'Explicit zero and partial native defaults survive transport');
      search.setLagrangianFactor(7.25); search.setPenaltyFactor(0.625); search.setTabuListSize(5);
      assert(await search.getLagrangianFactor(options) === 7.25 && await search.getPenaltyFactor(options) === 0.625 &&
        await search.getTabuListSize(options) === 5, 'Correctly named getters read all native settings');
      const pending = search.getPenaltyFactor(options); search.setPenaltyFactor(0.75);
      assert(await pending === 0.625 && await search.getPenaltyFactor(options) === 0.75, 'Queries capture settings before awaiting');
      const greedy = new api.GreedySolutionGenerator(invariant);
      assert(await greedy.nextSolution(undefined, options), 'Start from a feasible cover');
      const before = (await invariant.exportSolutionAsProto(options)).toString();
      await search.getEpsilon(options);
      assert((await invariant.exportSolutionAsProto(options)).toString() === before, 'Tuning reads preserve the current cover');
      search.setMaxIterations(50);
      assert(await search.nextSolution(undefined, options) && await invariant.numUncoveredElements(options) === 0,
        'Configured native guided tabu search returns a feasible cover');
      const fresh = new api.GuidedTabuSearch(invariant);
      assert(await fresh.getPenaltyFactor(options) === 0.3 && await fresh.getTabuListSize(options) === 17, 'Settings are isolated between generators');
      for (const [setter, values] of [
        [(value: number) => search.setEpsilon(value), [NaN, Infinity]],
        [(value: number) => search.setPenaltyFactor(value), [NaN, -Infinity]],
        [(value: number) => search.setLagrangianFactor(value), [NaN, Infinity]],
        [(value: number) => search.setTabuListSize(value), [0, -1, 1.5, 2147483648]],
      ] as const) {
        for (const value of values) { let rejected = false; try { setter(value); } catch (error) { rejected = error instanceof RangeError; } assert(rejected, 'Unsafe settings reject before native allocation/search'); }
      }
      assert(await search.getTabuListSize(options) === 5 && await search.getPenaltyFactor(options) === 0.75, 'Rejected setters preserve previous configuration');
      const controller = new AbortController(); controller.abort();
      let aborted = false;
      try { await search.getPenaltyFactor({ ...options, signal: controller.signal }); }
      catch (error) { aborted = error instanceof Error && error.name === 'AbortError'; if (!aborted) throw error; }
      assert(aborted && await search.getPenaltyFactor(options) === 0.75, 'Aborted getter recovers without configuration loss');
      return { cost: await invariant.cost(options), numUncoveredElements: 0 };
    } finally { await search.close(); }
  },
});


async function rejects(action: () => Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
  try { await action(); } catch (error) {
    assert(error instanceof Error && pattern.test(error.message), `${message}: ${String(error)}`);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

setCoverCases.push({
  id: 'set_cover.native.guided_sessions', name: 'GuidedSearch.continued_native_session', solver: 'set-cover',
  source: 'ortools/set_cover/set_cover_heuristics.h; ortools/set_cover/set_cover_heuristics.cc',
  upstream: 'GuidedLocalSearch/GuidedTabuSearch::Initialize, NextSolution', tags: ['native-contract', 'gap-regression'],
  async run(api) {
    const options = setCoverExecutionOptions();
    for (const Generator of [api.GuidedLocalSearch, api.GuidedTabuSearch]) {
      const model = createInitialCoverModel(api), invariant = new api.SetCoverInvariant(model);
      await new api.GreedySolutionGenerator(invariant).nextSolution(undefined, options);
      const search = new Generator(invariant);
      try {
        search.setMaxIterations(8);
        await search.initialize(options);
        for (let pass = 0; pass < 3; pass++) {
          assert(await search.nextSolution(), 'Default calls reuse the session executor');
          assert(await invariant.numUncoveredElements(options) === 0, 'Continued native search preserves coverage');
        }
        search.setTimeLimitInSeconds(0);
        assert(await search.nextSolution(), 'Native persistent generator does not enforce time limits');
        assert(await invariant.numUncoveredElements(options) === 0, 'Time setting does not override native coverage');
        search.setTimeLimitInSeconds(Infinity);
        await rejects(() => search.nextSolution(undefined, { executor: options.executor === 'worker' ? 'direct' : 'worker' }), /original executor/, 'Sessions cannot migrate executors');
        assert(await search.nextSolution(), 'Executor mismatch does not destroy the session');
        invariant.loadSolution(Array(model.numSubsets).fill(true));
        await rejects(() => search.nextSolution(), /initialize/, 'External cover changes require explicit initialization');
        await search.initialize();
        assert(await search.nextSolution(), 'Native initializer reloads the supplied cover');
        model.setSubsetCost(0, model.subsetCosts[0] + 1);
        await rejects(() => search.initialize(), /model was modified/, 'Model edits require a new native generator');
      } finally { await search.close(); }
      await search.close();
      await rejects(() => search.nextSolution(), /closed/, 'Closed sessions reject search');
      await rejects(() => search.initialize(), /closed/, 'Closed sessions reject initialization');
    }
    return { cost: 0, numUncoveredElements: 0 };
  },
});

setCoverCases.push({
  id: 'set_cover.native.guided_session_observers', name: 'GuidedSearch.observers_and_close', solver: 'set-cover',
  source: 'javascript/lib/set_cover/api.ts; javascript/lib/solver_job.ts',
  upstream: 'Persistent native search ownership and event handling', tags: ['native-contract', 'gap-regression'],
  async run(api) {
    const options = setCoverExecutionOptions(), model = createInitialCoverModel(api), invariant = new api.SetCoverInvariant(model);
    await new api.GreedySolutionGenerator(invariant).nextSolution(undefined, options);
    const search = new api.GuidedTabuSearch(invariant);
    search.setMaxIterations(4);
    try {
      await search.initialize(options);
      let checked = false;
      await search.nextSolution(undefined, { onEvent: async () => {
        if (checked) return;
        checked = true;
        await rejects(() => search.close(), /inside its event handler/, 'Observer cleanup rejects instead of deadlocking');
        await rejects(() => search.getPenaltyFactor(), /operation in progress/, 'Overlapping session operations reject');
      } });
      assert(checked, 'Observer was invoked');
      const pending = search.nextSolution();
      const closing = search.close();
      await pending;
      await closing;
      await rejects(() => search.getPenaltyFactor(), /closed/, 'Close waits for in-flight work and closes getters');
    } finally { await search.close(); }
    const failing = new api.GuidedTabuSearch(invariant);
    try {
      await failing.initialize(options);
      failing.setMaxIterations(4);
      await rejects(() => failing.nextSolution(undefined, { onEvent: () => { throw new Error('guided observer marker'); } }), /guided observer marker/, 'Observer failures propagate and allow cleanup');
    } finally { await failing.close(); }
    return { cost: await invariant.cost(options), numUncoveredElements: 0 };
  },
});

setCoverCases.push({
  id: 'set_cover.native.guided_session_stale_result', name: 'GuidedSearch.stale_result_discard', solver: 'set-cover',
  source: 'javascript/lib/set_cover/api.ts', upstream: 'Native session model and invariant ownership', tags: ['native-contract', 'gap-regression'],
  async run(api) {
    const options = setCoverExecutionOptions();
    for (const modifyModel of [false, true]) {
      const model = createInitialCoverModel(api), invariant = new api.SetCoverInvariant(model);
      await new api.GreedySolutionGenerator(invariant).nextSolution(undefined, options);
      const search = new api.GuidedTabuSearch(invariant);
      try {
        let changed = false;
        await rejects(() => search.initialize({ ...options, onEvent: () => {
          if (changed) return;
          changed = true;
          if (modifyModel) model.setSubsetCost(0, model.subsetCosts[0] + 1);
          else invariant.loadSolution(Array(model.numSubsets).fill(false));
        } }), modifyModel ? /model was modified/ : /stale result was discarded/, 'Creation discards stale native snapshots');
        assert(changed, 'Mutation observer ran');
        if (!modifyModel) assert(await invariant.numUncoveredElements(options) === model.numElements, 'Stale result does not overwrite external cover edits');
      } finally { await search.close(); }
    }
    return { cost: 0, numUncoveredElements: 0 };
  },
});

setCoverCases.push({
  id: 'set_cover.native.guided_session_runtime', name: 'GuidedSearch.runtime_ownership', solver: 'set-cover',
  source: 'javascript/lib/set_cover/api.ts; javascript/lib/worker_helpers.ts',
  upstream: 'Native guided generator lifetime', tags: ['native-contract', 'gap-regression'],
  async run(api, context) {
    const options = setCoverExecutionOptions(), model = createInitialCoverModel(api), invariant = new api.SetCoverInvariant(model);
    await new api.GreedySolutionGenerator(invariant).nextSolution(undefined, options);
    const old = new api.GuidedTabuSearch(invariant);
    await old.initialize(options);
    const freshInvariant = new api.SetCoverInvariant(model);
    freshInvariant.loadSolution(Array(model.numSubsets).fill(true));
    const fresh = new api.GuidedTabuSearch(freshInvariant);
    fresh.setMaxIterations(4);
    try {
      if (context.mode === 'worker') await runSetCoverWorkerLifecycleCase(api);
      else if (context.mode === 'direct') await api.terminateLoadedRuntimeThreads();
      await fresh.initialize(options);
      fresh.setPenaltyFactor(0.75);
      if (context.mode !== 'server') await rejects(() => old.nextSolution(), /runtime was replaced/, 'Old handles cannot run in a replacement runtime');
      else {
        old.setPenaltyFactor(0.5);
        assert(await old.getPenaltyFactor() === 0.5, 'Separate native server sessions own their tuning');
      }
      await old.close();
      assert(await fresh.getPenaltyFactor() === 0.75 && await fresh.nextSolution(), 'Stale or independent cleanup preserves the fresh session');
    } finally { await old.close(); await fresh.close(); }
    return { cost: await invariant.cost(options), numUncoveredElements: 0 };
  },
});

// Native contracts remain in or-tools-wasm; this common runner registers them
// so all fixtures execute the same cases without claiming Python parity.
setCoverCases.push(...setCoverTraceCases as unknown as SetCoverCase[]);
setCoverCases.push(...setCoverNumericalCases as unknown as SetCoverCase[]);

export async function runSetCoverCases(
  api: SetCoverApi,
  options: { modes?: readonly ExecutorFixtureMode[] } = {},
): Promise<SetCoverCaseResult[]> {
  const results: SetCoverCaseResult[] = [];
  const modes = options.modes ?? executorFixtureModes;
  if (modes.includes('server')) await assertServerExecutorIsRunning();
  for (const mode of modes) {
    setSetCoverMode(mode);
    for (const testCase of setCoverCases) {
      const result = await testCase.run(api, { mode });
      results.push(passedCase({ ...testCase, name: `${testCase.name} (${mode})` }, { mode }, result));
    }
  }
  setSetCoverMode('direct');
  assertCaseMatrix(results, setCoverCases, modes);
  return results;
}
