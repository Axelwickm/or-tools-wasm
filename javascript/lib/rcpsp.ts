import {
  CpSat,
  CpModel,
  CpSolver,
  CpSolverStatus,
  type CpSolverStatus_Name,
  type BoolVar,
  type IntVar,
  type IntervalVar,
  type SatParameters,
} from './cp-sat.js';
import type { ExecutorConfiguration } from './executor_configuration.js';
import {
  configureServerBridge,
  getServerBridgeUrl,
  isServerBridgeEnabled,
  isWorkerBridgeAvailable,
  isWorkerBridgeEnabled,
  setServerBridgeEnabled,
  setServerBridgeUrl,
  setWorkerBridgeEnabled,
  terminateWorkerBridge,
} from './worker_bridge.js';
import type { ServerBridgeOptions } from './worker_bridge.js';
import { terminateLoadedRuntimeThreads } from './runtime_loader.js';

export type RcpspResourceProto = {
  maxCapacity?: number;
  max_capacity?: number;
  minCapacity?: number;
  min_capacity?: number;
  renewable?: boolean;
  unitCost?: number;
  unit_cost?: number;
  name?: string;
};

export type RcpspRecipeProto = {
  duration?: number;
  demands?: number[];
  resources?: number[];
};

export type RcpspTaskProto = {
  name?: string;
  successors?: number[];
  recipes?: RcpspRecipeProto[];
};

export type RcpspProblemProto = {
  resources?: RcpspResourceProto[];
  tasks?: RcpspTaskProto[];
  isConsumerProducer?: boolean;
  is_consumer_producer?: boolean;
  isResourceInvestment?: boolean;
  is_resource_investment?: boolean;
  isRcpspMax?: boolean;
  is_rcpsp_max?: boolean;
  deadline?: number;
  horizon?: number;
  releaseDate?: number;
  release_date?: number;
  tardinessCost?: number;
  tardiness_cost?: number;
  mpmTime?: number;
  mpm_time?: number;
  seed?: number;
  basedata?: string;
  dueDate?: number;
  due_date?: number;
  name?: string;
};

export type RcpspActivityInput = {
  name?: string;
  duration: number;
  demands?: Record<string, number> | number[];
  successors?: string[];
};

export type RcpspResourceInput = {
  name: string;
  capacity: number;
  renewable?: boolean;
};

export type RcpspScheduleTask = {
  id: number;
  name: string;
  start: number;
  end: number;
  duration: number;
  selectedRecipe: number;
  demands: number[];
  successors: number[];
};

export type RcpspSolveResult = {
  status: CpSolverStatus | CpSolverStatus_Name;
  statusName: string;
  makespan: number | null;
  objectiveValue: number | null;
  tasks: RcpspScheduleTask[];
  response: ReturnType<CpSolver['response']>;
  model: CpModel;
  starts: IntVar[];
  ends: IntVar[];
  makespanVar: IntVar;
};

type BuiltModel = {
  model: CpModel;
  starts: IntVar[];
  ends: IntVar[];
  makespanVar: IntVar;
  recipePresence: Array<Array<BoolVar | true>>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asInteger(value: unknown, label: string) {
  assert(Number.isInteger(value), `${label} must be an integer`);
  return value as number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function maxCapacity(resource: RcpspResourceProto) {
  return resource.maxCapacity ?? resource.max_capacity ?? 0;
}

function minCapacity(resource: RcpspResourceProto) {
  return resource.minCapacity ?? resource.min_capacity ?? 0;
}

function unitCost(resource: RcpspResourceProto) {
  return resource.unitCost ?? resource.unit_cost ?? 0;
}

function normalizeRecipe(recipe: RcpspRecipeProto, numResources: number): Required<RcpspRecipeProto> {
  const duration = asInteger(recipe.duration ?? 0, 'recipe duration');
  assert(duration >= 0, 'recipe duration must be non-negative');
  const demands = recipe.demands ? [...recipe.demands] : Array(numResources).fill(0) as number[];
  const resources = recipe.resources ? [...recipe.resources] : demands.map((_, index) => index);
  assert(demands.length === resources.length, 'recipe demands and resources must have the same length');
  for (const demand of demands) asInteger(demand, 'recipe demand');
  for (const resource of resources) {
    asInteger(resource, 'recipe resource index');
    assert(resource >= 0 && resource < numResources, `recipe resource index ${resource} is out of range`);
  }
  return { duration, demands, resources };
}

function normalizeProblem(proto: RcpspProblemProto): RcpspProblemProto {
  const resources = (proto.resources ?? []).map((resource, index) => ({
    name: resource.name ?? `R${index + 1}`,
    maxCapacity: asInteger(maxCapacity(resource), `resource ${index} capacity`),
    minCapacity: asInteger(minCapacity(resource), `resource ${index} min capacity`),
    renewable: resource.renewable ?? true,
    unitCost: asInteger(unitCost(resource), `resource ${index} unit cost`),
  }));
  const tasks = (proto.tasks ?? []).map((task, index) => ({
    name: task.name ?? `task_${index}`,
    successors: [...(task.successors ?? [])],
    recipes: (task.recipes?.length ? task.recipes : [{ duration: 0, demands: [] }])
      .map((recipe) => normalizeRecipe(recipe, resources.length)),
  }));
  for (const [index, task] of tasks.entries()) {
    for (const successor of task.successors ?? []) {
      asInteger(successor, `task ${index} successor`);
      assert(successor >= 0 && successor < tasks.length, `task ${index} successor ${successor} is out of range`);
    }
  }
  return {
    name: proto.name ?? 'rcpsp',
    basedata: proto.basedata ?? '',
    seed: proto.seed ?? 0,
    horizon: proto.horizon ?? computeHorizon({ tasks }),
    deadline: proto.deadline ?? 0,
    releaseDate: proto.releaseDate ?? proto.release_date ?? 0,
    dueDate: proto.dueDate ?? proto.due_date ?? 0,
    tardinessCost: proto.tardinessCost ?? proto.tardiness_cost ?? 0,
    mpmTime: proto.mpmTime ?? proto.mpm_time ?? 0,
    isConsumerProducer: proto.isConsumerProducer ?? proto.is_consumer_producer ?? false,
    isResourceInvestment: proto.isResourceInvestment ?? proto.is_resource_investment ?? false,
    isRcpspMax: proto.isRcpspMax ?? proto.is_rcpsp_max ?? false,
    resources,
    tasks,
  };
}

function recipeDemandByResource(recipe: Required<RcpspRecipeProto>, resourceIndex: number) {
  let demand = 0;
  for (const [index, resource] of recipe.resources.entries()) {
    if (resource === resourceIndex) demand += recipe.demands[index];
  }
  return demand;
}

function computeHorizon(problem: Pick<RcpspProblemProto, 'tasks'>) {
  let horizon = 0;
  for (const task of problem.tasks ?? []) {
    const maxDuration = Math.max(0, ...(task.recipes ?? []).map((recipe) => recipe.duration ?? 0));
    horizon += maxDuration;
  }
  return horizon;
}

function readNumberAfterColon(line: string) {
  const match = /:\s*(-?\d+)/.exec(line);
  return match ? Number(match[1]) : null;
}

function numericTokens(line: string) {
  return Array.from(line.matchAll(/-?\d+/g), (match) => Number(match[0]));
}

function parseSingleModePsplib(text: string): RcpspProblemProto {
  const lines = text.split(/\r?\n/);
  const horizon = lines.map(readNumberAfterColon).find((value, index) => value !== null && /horizon/i.test(lines[index])) ?? 0;
  let jobs = 0;
  let renewableResources = 0;
  let basedata = '';
  let seed = 0;
  for (const line of lines) {
    if (/file with basedata/i.test(line)) basedata = line.split(':').slice(1).join(':').trim();
    if (/initial value random generator/i.test(line)) seed = readNumberAfterColon(line) ?? 0;
    if (/jobs \(incl\. supersource\/sink \)/i.test(line)) jobs = readNumberAfterColon(line) ?? 0;
    if (/- renewable/i.test(line)) renewableResources = readNumberAfterColon(line) ?? 0;
  }
  assert(jobs > 0, 'RCPSP parser expected a jobs count');
  assert(renewableResources >= 0, 'RCPSP parser expected renewable resource count');

  const precedenceStart = lines.findIndex((line) => /PRECEDENCE RELATIONS/i.test(line));
  const requestsStart = lines.findIndex((line) => /REQUESTS\/DURATIONS/i.test(line));
  const availabilityStart = lines.findIndex((line) => /RESOURCEAVAILABILITIES/i.test(line));
  assert(precedenceStart >= 0 && requestsStart > precedenceStart && availabilityStart > requestsStart, 'unsupported RCPSP text format');

  const tasks: RcpspTaskProto[] = Array.from({ length: jobs }, (_, index) => ({
    name: `job_${index + 1}`,
    successors: [],
    recipes: [],
  }));

  for (const line of lines.slice(precedenceStart, requestsStart)) {
    const values = numericTokens(line);
    if (values.length < 3) continue;
    const [job, _modes, numSuccessors, ...successors] = values;
    if (job < 1 || job > jobs) continue;
    tasks[job - 1].successors = successors.slice(0, numSuccessors).map((successor) => successor - 1);
  }

  for (const line of lines.slice(requestsStart, availabilityStart)) {
    const values = numericTokens(line);
    if (values.length < 3 + renewableResources) continue;
    const [job, _mode, duration, ...demands] = values;
    if (job < 1 || job > jobs) continue;
    tasks[job - 1].recipes = [{
      duration,
      demands: demands.slice(0, renewableResources),
      resources: Array.from({ length: renewableResources }, (_, index) => index),
    }];
  }

  const availabilityLine = lines.slice(availabilityStart).find((line) => numericTokens(line).length === renewableResources);
  assert(availabilityLine, 'RCPSP parser expected resource capacities');
  const capacities = numericTokens(availabilityLine);
  return normalizeProblem({
    name: basedata || 'psplib',
    basedata,
    seed,
    horizon: horizon || computeHorizon({ tasks }),
    resources: capacities.map((capacity, index) => ({
      name: `R${index + 1}`,
      maxCapacity: capacity,
      renewable: true,
    })),
    tasks,
  });
}

export class RcpspProblem {
  private readonly problem: RcpspProblemProto;

  constructor(problem: RcpspProblemProto = {}) {
    this.problem = normalizeProblem(problem);
  }

  static fromProto(proto: RcpspProblemProto) {
    return new RcpspProblem(proto);
  }

  static from_proto(proto: RcpspProblemProto) {
    return RcpspProblem.fromProto(proto);
  }

  static fromPsplib(text: string) {
    return new RcpspProblem(parseSingleModePsplib(text));
  }

  static from_psplib(text: string) {
    return RcpspProblem.fromPsplib(text);
  }

  get name() {
    return this.problem.name ?? '';
  }

  get resources() {
    return clone(this.problem.resources ?? []);
  }

  get tasks() {
    return clone(this.problem.tasks ?? []);
  }

  get horizon() {
    return this.problem.horizon ?? computeHorizon(this.problem);
  }

  exportModelAsProto() {
    return clone(this.problem);
  }

  export_model_as_proto() {
    return this.exportModelAsProto();
  }

  toCpSatModel() {
    return buildCpSatModel(this.problem).model;
  }

  to_cp_sat_model() {
    return this.toCpSatModel();
  }

  async solve(params: SatParameters = {}): Promise<RcpspSolveResult> {
    const built = buildCpSatModel(this.problem);
    const solver = new CpSolver();
    const status = await solver.solve(built.model, params);
    const response = solver.response();
    const statusName = solver.statusName(status);
    const successful = statusName === 'OPTIMAL' || statusName === 'FEASIBLE';
    const tasks = successful ? extractSchedule(this.problem, solver, built) : [];
    return {
      status: status ?? CpSolverStatus.UNKNOWN,
      statusName,
      makespan: successful ? solver.value(built.makespanVar) : null,
      objectiveValue: successful ? solver.objectiveValue() : null,
      tasks,
      response,
      model: built.model,
      starts: built.starts,
      ends: built.ends,
      makespanVar: built.makespanVar,
    };
  }
}

export class RcpspModelBuilder {
  private readonly resourceNames: string[] = [];
  private readonly resources: RcpspResourceProto[] = [];
  private readonly activities: RcpspActivityInput[] = [];

  constructor(private readonly name = 'rcpsp') {}

  addResource(input: RcpspResourceInput) {
    assert(!this.resourceNames.includes(input.name), `duplicate RCPSP resource ${input.name}`);
    this.resourceNames.push(input.name);
    this.resources.push({
      name: input.name,
      maxCapacity: asInteger(input.capacity, `resource ${input.name} capacity`),
      renewable: input.renewable ?? true,
    });
    return this;
  }

  add_resource(input: RcpspResourceInput) {
    return this.addResource(input);
  }

  addActivity(input: RcpspActivityInput) {
    assert(input.name, 'activity name is required');
    assert(!this.activities.some((activity) => activity.name === input.name), `duplicate RCPSP activity ${input.name}`);
    this.activities.push({ ...input });
    return this;
  }

  add_activity(input: RcpspActivityInput) {
    return this.addActivity(input);
  }

  build() {
    const taskNames = ['source', ...this.activities.map((activity) => activity.name ?? ''), 'sink'];
    const taskIndex = new Map(taskNames.map((name, index) => [name, index]));
    const tasks: RcpspTaskProto[] = taskNames.map((name) => ({
      name,
      successors: [],
      recipes: [{ duration: 0, demands: Array(this.resources.length).fill(0), resources: this.resources.map((_, index) => index) }],
    }));

    for (const activity of this.activities) {
      const index = taskIndex.get(activity.name ?? '');
      assert(index !== undefined, `unknown RCPSP activity ${activity.name}`);
      const demands = Array(this.resources.length).fill(0) as number[];
      if (Array.isArray(activity.demands)) {
        for (const [resource, demand] of activity.demands.entries()) {
          demands[resource] = demand;
        }
      } else {
        for (const [resourceName, demand] of Object.entries(activity.demands ?? {})) {
          const resource = this.resourceNames.indexOf(resourceName);
          assert(resource >= 0, `unknown RCPSP resource ${resourceName}`);
          demands[resource] = demand;
        }
      }
      tasks[index].recipes = [{
        duration: activity.duration,
        demands,
        resources: this.resources.map((_, resource) => resource),
      }];
      tasks[index].successors = (activity.successors ?? []).map((successor) => {
        const successorIndex = taskIndex.get(successor);
        assert(successorIndex !== undefined, `unknown RCPSP successor ${successor}`);
        return successorIndex;
      });
    }

    const nonSourceTasks = tasks.slice(1, -1);
    tasks[0].successors = nonSourceTasks
      .map((_, offset) => offset + 1)
      .filter((candidate) => !tasks.some((task) => task.successors?.includes(candidate)));
    const sink = tasks.length - 1;
    for (let index = 1; index < sink; index += 1) {
      if (!tasks[index].successors?.length) tasks[index].successors = [sink];
    }

    return new RcpspProblem({
      name: this.name,
      resources: this.resources,
      tasks,
      horizon: computeHorizon({ tasks }),
    });
  }
}

export class RcpspParser {
  private currentProblem = new RcpspProblem();

  parseString(text: string) {
    this.currentProblem = RcpspProblem.fromPsplib(text);
    return true;
  }

  parse_string(text: string) {
    return this.parseString(text);
  }

  parse_file(_fileName: string): boolean {
    throw new Error('RcpspParser.parse_file is not available in the browser-oriented wasm runtime. Use parse_string().');
  }

  parseFile(fileName: string) {
    return this.parse_file(fileName);
  }

  problem() {
    return this.currentProblem.exportModelAsProto();
  }
}

export async function initRcpsp(): Promise<void> {}

export function setExecutor(configuration: ExecutorConfiguration): void {
  CpSat.setExecutor(configuration);
}

export function importRcpspProblemFromProto(proto: RcpspProblemProto) {
  return RcpspProblem.fromProto(proto);
}

export function import_rcpsp_problem_from_proto(proto: RcpspProblemProto) {
  return importRcpspProblemFromProto(proto);
}

export function exportRcpspProblemToProto(problem: RcpspProblem) {
  return problem.exportModelAsProto();
}

export function export_rcpsp_problem_to_proto(problem: RcpspProblem) {
  return exportRcpspProblemToProto(problem);
}

function buildCpSatModel(problemProto: RcpspProblemProto): BuiltModel {
  const problem = normalizeProblem(problemProto);
  assert(!(problem.isConsumerProducer ?? problem.is_consumer_producer), 'consumer/producer RCPSP is not supported by the CP-SAT builder yet');
  assert(!(problem.isResourceInvestment ?? problem.is_resource_investment), 'resource-investment RCPSP is not supported by the CP-SAT builder yet');
  assert(!(problem.isRcpspMax ?? problem.is_rcpsp_max), 'RCPSP/Max delays are not supported by the CP-SAT builder yet');

  const horizon = problem.horizon ?? computeHorizon(problem);
  const model = new CpModel();
  model.name = problem.name ?? 'rcpsp';
  const tasks = problem.tasks ?? [];
  const resources = problem.resources ?? [];
  const starts = tasks.map((task, index) => model.newIntVar(0, horizon, `${task.name ?? `task_${index}`}_start`));
  const ends = tasks.map((task, index) => model.newIntVar(0, horizon, `${task.name ?? `task_${index}`}_end`));
  const recipePresence: Array<Array<BoolVar | true>> = [];
  const intervalsByResource: IntervalVar[][] = resources.map(() => []);
  const demandsByResource: number[][] = resources.map(() => []);

  for (const [taskIndex, task] of tasks.entries()) {
    const recipes = (task.recipes ?? []).map((recipe) => normalizeRecipe(recipe, resources.length));
    assert(recipes.length > 0, `task ${taskIndex} must have at least one recipe`);
    const presences = recipes.length > 1 ? recipes.map((_, recipeIndex) => model.newBoolVar(`task_${taskIndex}_recipe_${recipeIndex}`)) : [];
    recipePresence[taskIndex] = presences.length ? presences : recipes.map(() => true);
    if (presences.length) model.addExactlyOne(presences);

    for (const [recipeIndex, recipe] of recipes.entries()) {
      const intervalName = `${task.name ?? `task_${taskIndex}`}_recipe_${recipeIndex}`;
      const interval = presences.length
        ? model.newOptionalIntervalVar(starts[taskIndex], recipe.duration, ends[taskIndex], presences[recipeIndex], intervalName)
        : model.newIntervalVar(starts[taskIndex], recipe.duration, ends[taskIndex], intervalName);
      for (const [resourceIndex, resource] of resources.entries()) {
        const demand = recipeDemandByResource(recipe, resourceIndex);
        if (demand > 0 && resource.renewable !== false) {
          intervalsByResource[resourceIndex].push(interval);
          demandsByResource[resourceIndex].push(demand);
        }
      }
    }
  }

  for (const [taskIndex, task] of tasks.entries()) {
    for (const successor of task.successors ?? []) {
      model.add(ends[taskIndex].le(starts[successor]));
    }
  }

  for (const [resourceIndex, resource] of resources.entries()) {
    if (intervalsByResource[resourceIndex].length) {
      model.addCumulative(intervalsByResource[resourceIndex], demandsByResource[resourceIndex], maxCapacity(resource));
    }
  }

  const makespanVar = model.newIntVar(0, horizon, 'makespan');
  const sinkIndex = tasks.length - 1;
  model.addMaxEquality(makespanVar, sinkIndex >= 0 ? [ends[sinkIndex]] : ends);
  model.minimize(makespanVar);
  return { model, starts, ends, makespanVar, recipePresence };
}

function extractSchedule(problemProto: RcpspProblemProto, solver: CpSolver, built: BuiltModel): RcpspScheduleTask[] {
  const problem = normalizeProblem(problemProto);
  return (problem.tasks ?? []).map((task, id) => {
    const recipes = (task.recipes ?? []).map((recipe) => normalizeRecipe(recipe, problem.resources?.length ?? 0));
    const selectedRecipe = Math.max(0, built.recipePresence[id].findIndex((presence) => presence === true || solver.booleanValue(presence)));
    const recipe = recipes[selectedRecipe];
    return {
      id,
      name: task.name ?? `task_${id}`,
      start: solver.value(built.starts[id]),
      end: solver.value(built.ends[id]),
      duration: recipe.duration,
      selectedRecipe,
      demands: (problem.resources ?? []).map((_, resource) => recipeDemandByResource(recipe, resource)),
      successors: [...(task.successors ?? [])],
    };
  });
}

export {
  configureServerBridge,
  getServerBridgeUrl,
  isServerBridgeEnabled,
  isWorkerBridgeAvailable,
  isWorkerBridgeEnabled,
  setServerBridgeEnabled,
  setServerBridgeUrl,
  setWorkerBridgeEnabled,
  type ServerBridgeOptions,
  terminateLoadedRuntimeThreads,
  terminateWorkerBridge,
};
