import type { ExecutorFixtureMode, SharedCase, SharedCaseResult } from '../../../harness/shared_case.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  passedCase,
  serverExecutorConfiguration,
  solverJobStates,
} from '../../../harness/shared_case.ts';
import { setCoverExecutionOptions, setSetCoverMode } from './execution.ts';

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
  addEmptySubset(cost: number): void;
  addElementToLastSubset(element: number): void;
  addElementToSubset(element: number, subset: number): void;
  sortElementsInSubsets(): void;
  computeFeasibility(): boolean;
  exportModelAsProto(): unknown;
  importModelFromProto(proto: unknown): void;
};

type SetCoverInvariantLike = {
  cost(): number;
  numUncoveredElements(): number;
  checkConsistency(consistency: number): boolean;
  exportSolutionAsProto(): { toString(): string };
  importSolutionFromProto(proto: unknown): void;
};

type SetCoverGeneratorLike = {
  nextSolution(focus?: number[] | boolean[], options?: {
    executor?: 'direct' | 'worker' | ReturnType<typeof serverExecutorConfiguration>;
    onEvent?: (event: { type: string; status?: { state: number } }) => void;
  }): Promise<boolean>;
  setMaxIterations(maxIterations: number): void;
};

export type SetCoverApi = {
  SetCoverModel: { new(): SetCoverModelLike };
  SetCoverInvariant: { new(model: any): SetCoverInvariantLike };
  TrivialSolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  RandomSolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  GreedySolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  ElementDegreeSolutionGenerator: { new(invariant: any): SetCoverGeneratorLike };
  SteepestSearch: { new(invariant: any): SetCoverGeneratorLike };
  GuidedLocalSearch: { new(invariant: any): SetCoverGeneratorLike };
  ConsistencyLevel: {
    COST_AND_COVERAGE: number;
    FREE_AND_UNCOVERED: number;
  };
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
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_save_reload_twice assertion-by-assertion.
  const model = createKnightsCoverModel(api, 3, 3);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_save_reload_twice (${mode}) greedy nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_save_reload_twice (${mode}) greedy consistency`);
  const greedyProto = inv.exportSolutionAsProto();

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_save_reload_twice (${mode}) steepest nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_save_reload_twice (${mode}) steepest consistency`);
  const steepestProto = inv.exportSolutionAsProto();

  inv.importSolutionFromProto(greedyProto);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_save_reload_twice (${mode}) reloaded steepest nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_save_reload_twice (${mode}) reloaded steepest consistency`);
  const reloadedProto = inv.exportSolutionAsProto();
  assert(
    steepestProto.toString() === reloadedProto.toString(),
    `SetCoverTest.test_save_reload_twice (${mode}) proto string equality`,
  );
  return { cost: inv.cost(), numUncoveredElements: inv.numUncoveredElements() };
}

async function runInitialValues(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_initial_values assertion-by-assertion.
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
  assert(inv.checkConsistency(api.ConsistencyLevel.COST_AND_COVERAGE), `SetCoverTest.test_initial_values (${mode}) trivial consistency`);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_initial_values (${mode}) greedy nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_initial_values (${mode}) greedy consistency`);

  assertNumber(inv.numUncoveredElements(), 0, `SetCoverTest.test_initial_values (${mode}) numUncoveredElements`);
  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_initial_values (${mode}) steepest nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.COST_AND_COVERAGE), `SetCoverTest.test_initial_values (${mode}) steepest consistency`);
  return { cost: inv.cost(), numUncoveredElements: inv.numUncoveredElements() };
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
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_greedy assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_greedy (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_greedy (${mode}) greedy nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_greedy (${mode}) greedy consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_greedy (${mode}) steepest nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_greedy (${mode}) steepest consistency`);
  return { cost: inv.cost(), numUncoveredElements: inv.numUncoveredElements() };
}

async function runKnightsCoverDegree(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_degree assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_degree (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const degree = new api.ElementDegreeSolutionGenerator(inv);
  assert(await degree.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_degree (${mode}) degree nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.COST_AND_COVERAGE), `SetCoverTest.test_knights_cover_degree (${mode}) degree consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_degree (${mode}) steepest nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_degree (${mode}) steepest consistency`);
  return { cost: inv.cost(), numUncoveredElements: inv.numUncoveredElements() };
}

async function runKnightsCoverGls(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_gls assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_gls (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_gls (${mode}) greedy nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_gls (${mode}) greedy consistency`);

  const gls = new api.GuidedLocalSearch(inv);
  gls.setMaxIterations(500);
  assert(await gls.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_gls (${mode}) gls nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_gls (${mode}) gls consistency`);
  return { cost: inv.cost(), numUncoveredElements: inv.numUncoveredElements() };
}

async function runKnightsCoverRandom(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_random assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_random (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const random = new api.RandomSolutionGenerator(inv);
  assert(await random.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_random (${mode}) random nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.COST_AND_COVERAGE), `SetCoverTest.test_knights_cover_random (${mode}) random consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_random (${mode}) steepest nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_random (${mode}) steepest consistency`);
  return { cost: inv.cost(), numUncoveredElements: inv.numUncoveredElements() };
}

async function runKnightsCoverTrivial(api: SetCoverApi, mode: ExecutorFixtureMode): Promise<SetCoverCaseData> {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_trivial assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.computeFeasibility(), `SetCoverTest.test_knights_cover_trivial (${mode}) computeFeasibility`);
  const inv = new api.SetCoverInvariant(model);

  const trivial = new api.TrivialSolutionGenerator(inv);
  assert(await trivial.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_trivial (${mode}) trivial nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.COST_AND_COVERAGE), `SetCoverTest.test_knights_cover_trivial (${mode}) trivial consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.setMaxIterations(500);
  assert(await steepest.nextSolution(undefined, setCoverExecutionOptions()), `SetCoverTest.test_knights_cover_trivial (${mode}) steepest nextSolution`);
  assert(inv.checkConsistency(api.ConsistencyLevel.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_trivial (${mode}) steepest consistency`);
  return { cost: inv.cost(), numUncoveredElements: inv.numUncoveredElements() };
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
  return results;
}
