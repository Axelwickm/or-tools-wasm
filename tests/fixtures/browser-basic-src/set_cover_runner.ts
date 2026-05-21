export type SetCoverCaseResult = {
  name: string;
  ok: boolean;
  cost: number;
  numUncoveredElements: number;
};

type SetCoverModelLike = {
  name: string;
  num_elements: number;
  num_subsets: number;
  subset_costs: number[];
  columns: number[][];
  rows: number[][];
  row_view_is_valid: boolean;
  add_empty_subset(cost: number): void;
  add_element_to_last_subset(element: number): void;
  add_element_to_subset(element: number, subset: number): void;
  sort_elements_in_subsets(): void;
  compute_feasibility(): boolean;
  export_model_as_proto(): unknown;
  import_model_from_proto(proto: unknown): void;
};

type SetCoverInvariantLike = {
  cost(): number;
  num_uncovered_elements(): number;
  check_consistency(consistency: number): boolean;
  export_solution_as_proto(): { toString(): string };
  import_solution_from_proto(proto: unknown): void;
};

type SetCoverGeneratorLike = {
  next_solution(): Promise<boolean>;
  set_max_iterations(maxIterations: number): void;
};

export type SetCoverApi = {
  initSetCover(): Promise<void>;
  SetCoverModel: { new(): SetCoverModelLike };
  SetCoverInvariant: { new(model: SetCoverModelLike): SetCoverInvariantLike };
  TrivialSolutionGenerator: { new(invariant: SetCoverInvariantLike): SetCoverGeneratorLike };
  RandomSolutionGenerator: { new(invariant: SetCoverInvariantLike): SetCoverGeneratorLike };
  GreedySolutionGenerator: { new(invariant: SetCoverInvariantLike): SetCoverGeneratorLike };
  ElementDegreeSolutionGenerator: { new(invariant: SetCoverInvariantLike): SetCoverGeneratorLike };
  SteepestSearch: { new(invariant: SetCoverInvariantLike): SetCoverGeneratorLike };
  GuidedLocalSearch: { new(invariant: SetCoverInvariantLike): SetCoverGeneratorLike };
  consistency_level: {
    COST_AND_COVERAGE: number;
    FREE_AND_UNCOVERED: number;
  };
  setWorkerBridgeEnabled: (enabled: boolean) => void;
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
  model.add_empty_subset(1.0);
  model.add_element_to_last_subset(0);
  model.add_empty_subset(1.0);
  model.add_element_to_last_subset(1);
  model.add_element_to_last_subset(2);
  model.add_empty_subset(1.0);
  model.add_element_to_last_subset(1);
  model.add_empty_subset(1.0);
  model.add_element_to_last_subset(2);
  return model;
}

function createKnightsCoverModel(api: SetCoverApi, numRows: number, numCols: number) {
  const model = new api.SetCoverModel();
  const knightRowMove = [2, 1, -1, -2, -2, -1, 1, 2];
  const knightColMove = [1, 2, 2, 1, -1, -2, -2, -1];

  for (let row = 0; row < numRows; ++row) {
    for (let col = 0; col < numCols; ++col) {
      model.add_empty_subset(1.0);
      model.add_element_to_last_subset(row * numCols + col);

      for (let i = 0; i < 8; ++i) {
        const newRow = row + knightRowMove[i];
        const newCol = col + knightColMove[i];
        if (0 <= newRow && newRow < numRows && 0 <= newCol && newCol < numCols) {
          model.add_element_to_last_subset(newRow * numCols + newCol);
        }
      }
    }
  }

  return model;
}

async function runSaveReload(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_save_reload assertion-by-assertion.
  const model = createKnightsCoverModel(api, 10, 10);
  model.sort_elements_in_subsets();
  const proto = model.export_model_as_proto();
  const reloaded = new api.SetCoverModel();
  reloaded.import_model_from_proto(proto);

  assertNumber(model.num_subsets, reloaded.num_subsets, `SetCoverTest.test_save_reload (${mode}) num_subsets`);
  assertNumber(model.num_elements, reloaded.num_elements, `SetCoverTest.test_save_reload (${mode}) num_elements`);
  assertArray(model.subset_costs, reloaded.subset_costs, `SetCoverTest.test_save_reload (${mode}) subset_costs`);
  assertArray(model.columns, reloaded.columns, `SetCoverTest.test_save_reload (${mode}) columns`);
  if (model.row_view_is_valid && reloaded.row_view_is_valid) {
    assertArray(model.rows, reloaded.rows, `SetCoverTest.test_save_reload (${mode}) rows`);
  }
  return { name: `SetCoverTest.test_save_reload (${mode})`, ok: true, cost: 0, numUncoveredElements: 0 };
}

async function runSaveReloadTwice(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_save_reload_twice assertion-by-assertion.
  const model = createKnightsCoverModel(api, 3, 3);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.next_solution(), `SetCoverTest.test_save_reload_twice (${mode}) greedy next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_save_reload_twice (${mode}) greedy consistency`);
  const greedyProto = inv.export_solution_as_proto();

  const steepest = new api.SteepestSearch(inv);
  steepest.set_max_iterations(500);
  assert(await steepest.next_solution(), `SetCoverTest.test_save_reload_twice (${mode}) steepest next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_save_reload_twice (${mode}) steepest consistency`);
  const steepestProto = inv.export_solution_as_proto();

  inv.import_solution_from_proto(greedyProto);
  steepest.set_max_iterations(500);
  assert(await steepest.next_solution(), `SetCoverTest.test_save_reload_twice (${mode}) reloaded steepest next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_save_reload_twice (${mode}) reloaded steepest consistency`);
  const reloadedProto = inv.export_solution_as_proto();
  assert(
    steepestProto.toString() === reloadedProto.toString(),
    `SetCoverTest.test_save_reload_twice (${mode}) proto string equality`,
  );
  return { name: `SetCoverTest.test_save_reload_twice (${mode})`, ok: true, cost: inv.cost(), numUncoveredElements: inv.num_uncovered_elements() };
}

async function runInitialValues(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_initial_values assertion-by-assertion.
  const model = createInitialCoverModel(api);
  assert(model.compute_feasibility(), `SetCoverTest.test_initial_values (${mode}) compute_feasibility`);

  const inv = new api.SetCoverInvariant(model);
  const trivial = new api.TrivialSolutionGenerator(inv);
  assert(await trivial.next_solution(), `SetCoverTest.test_initial_values (${mode}) trivial next_solution`);
  assert(inv.check_consistency(api.consistency_level.COST_AND_COVERAGE), `SetCoverTest.test_initial_values (${mode}) trivial consistency`);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.next_solution(), `SetCoverTest.test_initial_values (${mode}) greedy next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_initial_values (${mode}) greedy consistency`);

  assertNumber(inv.num_uncovered_elements(), 0, `SetCoverTest.test_initial_values (${mode}) num_uncovered_elements`);
  const steepest = new api.SteepestSearch(inv);
  steepest.set_max_iterations(500);
  assert(await steepest.next_solution(), `SetCoverTest.test_initial_values (${mode}) steepest next_solution`);
  assert(inv.check_consistency(api.consistency_level.COST_AND_COVERAGE), `SetCoverTest.test_initial_values (${mode}) steepest consistency`);
  return { name: `SetCoverTest.test_initial_values (${mode})`, ok: true, cost: inv.cost(), numUncoveredElements: inv.num_uncovered_elements() };
}

async function runInfeasible(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_infeasible assertion-by-assertion.
  const model = new api.SetCoverModel();
  model.add_empty_subset(1.0);
  model.add_element_to_last_subset(0);
  model.add_empty_subset(1.0);
  model.add_element_to_last_subset(3);
  assert(!model.compute_feasibility(), `SetCoverTest.test_infeasible (${mode}) compute_feasibility`);
  return { name: `SetCoverTest.test_infeasible (${mode})`, ok: true, cost: 0, numUncoveredElements: 0 };
}

async function runKnightsCoverCreation(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_creation assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.compute_feasibility(), `SetCoverTest.test_knights_cover_creation (${mode}) compute_feasibility`);
  return { name: `SetCoverTest.test_knights_cover_creation (${mode})`, ok: true, cost: 0, numUncoveredElements: 0 };
}

async function runKnightsCoverGreedy(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_greedy assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.compute_feasibility(), `SetCoverTest.test_knights_cover_greedy (${mode}) compute_feasibility`);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.next_solution(), `SetCoverTest.test_knights_cover_greedy (${mode}) greedy next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_greedy (${mode}) greedy consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.set_max_iterations(500);
  assert(await steepest.next_solution(), `SetCoverTest.test_knights_cover_greedy (${mode}) steepest next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_greedy (${mode}) steepest consistency`);
  return { name: `SetCoverTest.test_knights_cover_greedy (${mode})`, ok: true, cost: inv.cost(), numUncoveredElements: inv.num_uncovered_elements() };
}

async function runKnightsCoverDegree(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_degree assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.compute_feasibility(), `SetCoverTest.test_knights_cover_degree (${mode}) compute_feasibility`);
  const inv = new api.SetCoverInvariant(model);

  const degree = new api.ElementDegreeSolutionGenerator(inv);
  assert(await degree.next_solution(), `SetCoverTest.test_knights_cover_degree (${mode}) degree next_solution`);
  assert(inv.check_consistency(api.consistency_level.COST_AND_COVERAGE), `SetCoverTest.test_knights_cover_degree (${mode}) degree consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.set_max_iterations(500);
  assert(await steepest.next_solution(), `SetCoverTest.test_knights_cover_degree (${mode}) steepest next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_degree (${mode}) steepest consistency`);
  return { name: `SetCoverTest.test_knights_cover_degree (${mode})`, ok: true, cost: inv.cost(), numUncoveredElements: inv.num_uncovered_elements() };
}

async function runKnightsCoverGls(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_gls assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.compute_feasibility(), `SetCoverTest.test_knights_cover_gls (${mode}) compute_feasibility`);
  const inv = new api.SetCoverInvariant(model);

  const greedy = new api.GreedySolutionGenerator(inv);
  assert(await greedy.next_solution(), `SetCoverTest.test_knights_cover_gls (${mode}) greedy next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_gls (${mode}) greedy consistency`);

  const gls = new api.GuidedLocalSearch(inv);
  gls.set_max_iterations(500);
  assert(await gls.next_solution(), `SetCoverTest.test_knights_cover_gls (${mode}) gls next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_gls (${mode}) gls consistency`);
  return { name: `SetCoverTest.test_knights_cover_gls (${mode})`, ok: true, cost: inv.cost(), numUncoveredElements: inv.num_uncovered_elements() };
}

async function runKnightsCoverRandom(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_random assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.compute_feasibility(), `SetCoverTest.test_knights_cover_random (${mode}) compute_feasibility`);
  const inv = new api.SetCoverInvariant(model);

  const random = new api.RandomSolutionGenerator(inv);
  assert(await random.next_solution(), `SetCoverTest.test_knights_cover_random (${mode}) random next_solution`);
  assert(inv.check_consistency(api.consistency_level.COST_AND_COVERAGE), `SetCoverTest.test_knights_cover_random (${mode}) random consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.set_max_iterations(500);
  assert(await steepest.next_solution(), `SetCoverTest.test_knights_cover_random (${mode}) steepest next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_random (${mode}) steepest consistency`);
  return { name: `SetCoverTest.test_knights_cover_random (${mode})`, ok: true, cost: inv.cost(), numUncoveredElements: inv.num_uncovered_elements() };
}

async function runKnightsCoverTrivial(api: SetCoverApi, mode: 'direct' | 'worker') {
  // TEMP: parity - mirrors ortools/set_cover/python/set_cover_test.py
  // SetCoverTest.test_knights_cover_trivial assertion-by-assertion.
  const model = createKnightsCoverModel(api, 16, 16);
  assert(model.compute_feasibility(), `SetCoverTest.test_knights_cover_trivial (${mode}) compute_feasibility`);
  const inv = new api.SetCoverInvariant(model);

  const trivial = new api.TrivialSolutionGenerator(inv);
  assert(await trivial.next_solution(), `SetCoverTest.test_knights_cover_trivial (${mode}) trivial next_solution`);
  assert(inv.check_consistency(api.consistency_level.COST_AND_COVERAGE), `SetCoverTest.test_knights_cover_trivial (${mode}) trivial consistency`);

  const steepest = new api.SteepestSearch(inv);
  steepest.set_max_iterations(500);
  assert(await steepest.next_solution(), `SetCoverTest.test_knights_cover_trivial (${mode}) steepest next_solution`);
  assert(inv.check_consistency(api.consistency_level.FREE_AND_UNCOVERED), `SetCoverTest.test_knights_cover_trivial (${mode}) steepest consistency`);
  return { name: `SetCoverTest.test_knights_cover_trivial (${mode})`, ok: true, cost: inv.cost(), numUncoveredElements: inv.num_uncovered_elements() };
}

export async function runSetCoverCases(api: SetCoverApi): Promise<SetCoverCaseResult[]> {
  await api.initSetCover();
  const results: SetCoverCaseResult[] = [];
  for (const mode of ['direct', 'worker'] as const) {
    api.setWorkerBridgeEnabled(mode === 'worker');
    results.push(await runSaveReload(api, mode));
    results.push(await runSaveReloadTwice(api, mode));
    results.push(await runInitialValues(api, mode));
    results.push(await runInfeasible(api, mode));
    results.push(await runKnightsCoverCreation(api, mode));
    results.push(await runKnightsCoverGreedy(api, mode));
    results.push(await runKnightsCoverDegree(api, mode));
    results.push(await runKnightsCoverGls(api, mode));
    results.push(await runKnightsCoverRandom(api, mode));
    results.push(await runKnightsCoverTrivial(api, mode));
  }
  api.setWorkerBridgeEnabled(false);
  return results;
}
