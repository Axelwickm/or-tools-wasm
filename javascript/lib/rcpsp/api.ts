import { parsePsplib } from './psplib.js';
import {
  CpModel,
  LinearExpr,
  CpSolver,
  CpSolverStatus,
  CpSolverSolutionCallback,
  type CpSolverStatus_Name,
  type BoolVar,
  type CpSatEvent,
  type CpSatEventMask,
  type CpSatSolverParameters,
  type IntVar,
  type IntervalVar,
} from '../cp-sat.js';
import type { ExecutorSelection } from '../executor_configuration.js';

export type RcpspResourceProto = {
  maxCapacity?: number;
  minCapacity?: number;
  renewable?: boolean;
  unitCost?: number;
  name?: string;
};

export type RcpspRecipeProto = {
  duration?: number;
  demands?: number[];
  resources?: number[];
};

export type RcpspPerRecipeDelays = { minDelays?: number[] };
export type RcpspPerSuccessorDelays = { recipeDelays?: RcpspPerRecipeDelays[] };

export type RcpspTaskProto = {
  name?: string;
  successors?: number[];
  successorDelays?: RcpspPerSuccessorDelays[];
  recipes?: RcpspRecipeProto[];
};

export type RcpspProblemProto = {
  resources?: RcpspResourceProto[];
  tasks?: RcpspTaskProto[];
  isConsumerProducer?: boolean;
  isResourceInvestment?: boolean;
  isRcpspMax?: boolean;
  deadline?: number;
  horizon?: number;
  releaseDate?: number;
  tardinessCost?: number;
  mpmTime?: number;
  seed?: number;
  basedata?: string;
  dueDate?: number;
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
  start: bigint;
  end: bigint;
  duration: number;
  selectedRecipe: number;
  demands: number[];
  successors: number[];
};

export type RcpspSolveResult = {
  status: CpSolverStatus | CpSolverStatus_Name;
  statusName: string;
  makespan: bigint | null;
  objectiveValue: number | null;
  resourceCapacities: bigint[] | null;
  tasks: RcpspScheduleTask[];
  response: CpSolver['response'];
};

export type RcpspEvent =
  | Exclude<CpSatEvent, { type: 'solution' } | { type: 'bestBound' }>
  | {
    type: 'solution';
    makespan: bigint;
    objectiveValue: number;
    resourceCapacities: bigint[] | null;
    tasks: RcpspScheduleTask[];
  }
  | { type: 'bestBound'; bound: number };

export type RcpspEventMask = CpSatEventMask;

export type RcpspSolveOptions = CpSatSolverParameters & {
  executor?: ExecutorSelection;
  onEvent?: (event: RcpspEvent) => void | Promise<void>;
  eventMask?: RcpspEventMask;
  signal?: AbortSignal;
};

type BuiltModel = {
  model: CpModel;
  starts: IntVar[];
  ends: IntVar[];
  makespanVar: IntVar;
  recipePresence: Array<Array<BoolVar | true>>;
  capacityVars: IntVar[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function asInteger(value: unknown, label: string) {
  assert(Number.isSafeInteger(value), `${label} must be a safe integer`);
  return value as number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function normalizeProblem(proto: RcpspProblemProto) {
  const resources = (proto.resources ?? []).map((resource, index) => ({
    name: resource.name ?? `R${index + 1}`,
    maxCapacity: asInteger(resource.maxCapacity ?? 0, `resource ${index} capacity`),
    minCapacity: asInteger(resource.minCapacity ?? 0, `resource ${index} min capacity`),
    renewable: resource.renewable ?? true,
    unitCost: asInteger(resource.unitCost ?? 0, `resource ${index} unit cost`),
  }));
  const tasks = (proto.tasks ?? []).map((task, index) => ({
    name: task.name ?? `task_${index}`,
    successors: [...(task.successors ?? [])],
    successorDelays: (task.successorDelays ?? []).map(delays => ({
      recipeDelays: (delays.recipeDelays ?? []).map(recipe => ({
        minDelays: (recipe.minDelays ?? []).map(delay => asInteger(delay, `task ${index} minimum delay`)),
      })),
    })),
    recipes: (task.recipes?.length ? task.recipes : [{ duration: 0, demands: [] }])
      .map((recipe) => normalizeRecipe(recipe, resources.length)),
  }));
  for (const [index, task] of tasks.entries()) {
    for (const successor of task.successors) {
      asInteger(successor, `task ${index} successor`);
      assert(successor >= 0 && successor < tasks.length, `task ${index} successor ${successor} is out of range`);
    }
  }
  for (const [index, task] of tasks.entries()) {
    if (proto.isRcpspMax) {
      assert(task.successorDelays.length === task.successors.length,
        `task ${index} delay matrices must match successors`);
      for (const [edge, successor] of task.successors.entries()) {
        const rows = task.successorDelays[edge].recipeDelays;
        assert(rows.length === task.recipes.length, `task ${index} delay rows must match recipes`);
        for (const row of rows) assert(row.minDelays.length === tasks[successor].recipes.length,
          `task ${index} delay columns must match successor recipes`);
      }
    } else assert(task.successorDelays.length === 0,
      `task ${index} minimum delays require isRcpspMax`);
    if (!proto.isConsumerProducer) for (const recipe of task.recipes) {
      assert(recipe.demands.every(demand => demand >= 0), `task ${index} demands must be non-negative`);
    }
  }
  assert(!(proto.isConsumerProducer && proto.isResourceInvestment), 'Consumer/producer and resource investment are separate RCPSP variants');
  for (const [index, resource] of resources.entries()) {
    if (proto.isConsumerProducer) {
      assert(resource.minCapacity <= resource.maxCapacity, `resource ${index} minimum capacity exceeds maximum capacity`);
    } else {
      assert(resource.maxCapacity >= 0 || (proto.isResourceInvestment && resource.maxCapacity === -1),
        `resource ${index} capacity must be non-negative or -1 for unbounded investment capacity`);
      if (proto.isResourceInvestment) assert(resource.unitCost >= 0, `resource ${index} investment unit cost must be non-negative`);
    }
  }
  if (proto.isConsumerProducer) for (const [index, task] of tasks.entries())
    assert(task.recipes.every(recipe => recipe.duration === 0), `consumer/producer task ${index} duration must be zero`);
  const horizon = asInteger(proto.horizon ?? computeHorizon({ tasks }), 'RCPSP horizon');
  const deadline = asInteger(proto.deadline ?? 0, 'RCPSP deadline');
  assert(horizon >= 0 && deadline >= 0, 'RCPSP horizon and deadline must be non-negative');
  return {
    name: proto.name ?? 'rcpsp',
    basedata: proto.basedata ?? '',
    seed: proto.seed ?? 0,
    horizon,
    deadline,
    releaseDate: proto.releaseDate ?? 0,
    dueDate: proto.dueDate ?? 0,
    tardinessCost: proto.tardinessCost ?? 0,
    mpmTime: proto.mpmTime ?? 0,
    isConsumerProducer: proto.isConsumerProducer ?? false,
    isResourceInvestment: proto.isResourceInvestment ?? false,
    isRcpspMax: proto.isRcpspMax ?? false,
    resources,
    tasks,
  };
}

type NormalizedRcpspProblem = ReturnType<typeof normalizeProblem>;

function recipeDemandByResource(recipe: Required<RcpspRecipeProto>, resourceIndex: number) {
  let demand = 0;
  for (const [index, resource] of recipe.resources.entries()) {
    if (resource === resourceIndex) demand = asInteger(demand + recipe.demands[index], 'total recipe resource demand');
  }
  return demand;
}

function computeHorizon(problem: Pick<RcpspProblemProto, 'tasks'>) {
  let horizon = 0;
  for (const task of problem.tasks ?? []) {
    const maxDuration = (task.recipes ?? []).reduce((maximum, recipe) => Math.max(maximum, recipe.duration ?? 0), 0);
    horizon = asInteger(horizon + maxDuration, 'computed RCPSP horizon');
    for (const delays of task.successorDelays ?? []) {
      let maxDelay = 0;
      for (const row of delays.recipeDelays ?? []) for (const delay of row.minDelays ?? [])
        maxDelay = Math.max(maxDelay, delay);
      horizon = asInteger(horizon + maxDelay, 'computed RCPSP horizon');
    }
  }
  return horizon;
}

export class RcpspProblem {
  private readonly problem: NormalizedRcpspProblem;

  constructor(problem: RcpspProblemProto = {}) {
    this.problem = normalizeProblem(problem);
  }

  static fromProto(proto: RcpspProblemProto) {
    return new RcpspProblem(proto);
  }

  static fromPsplib(text: string) {
    return new RcpspProblem(parsePsplib(text));
  }

  get name() {
    return this.problem.name;
  }

  get resources() {
    return clone(this.problem.resources);
  }

  get tasks() {
    return clone(this.problem.tasks);
  }

  get horizon() {
    return this.problem.horizon;
  }

  exportModelAsProto() {
    return clone(this.problem);
  }

  toCpSatModel() {
    return buildCpSatModel(this.problem).model;
  }

  async solve(options: RcpspSolveOptions = {}): Promise<RcpspSolveResult> {
    const {
      executor,
      onEvent,
      eventMask: requestedEventMask,
      signal,
      ...params
    } = options;
    const built = buildCpSatModel(this.problem);
    const solver = new CpSolver();
    const eventMask = onEvent
      ? requestedEventMask ?? { solution: true, bestBound: true, log: true }
      : {};
    let intermediateSolution: Omit<Extract<RcpspEvent, { type: 'solution' }>, 'type'> | null = null;
    const solutionCallback = eventMask.solution
      ? new RcpspSolutionCallback(this.problem, built, (solution) => {
        intermediateSolution = solution;
      })
      : null;
    const status = await solver.solve(built.model, {
      ...params,
      executor,
      solutionCallback: solutionCallback ?? undefined,
      signal,
      eventMask,
      onEvent: onEvent
        ? async (event) => {
          if (event.type === 'solution') {
            assert(intermediateSolution, 'RCPSP solution callback did not produce a schedule');
            await onEvent({ type: 'solution', ...intermediateSolution });
          } else {
            await onEvent(event);
          }
        }
        : undefined,
    });
    const response = solver.response;
    const statusName = solver.statusName(status);
    const successful = statusName === 'OPTIMAL' || statusName === 'FEASIBLE';
    const tasks = successful ? extractSchedule(this.problem, solver, built) : [];
    return {
      status: status ?? CpSolverStatus.UNKNOWN,
      statusName,
      makespan: successful ? solver.value(built.makespanVar) : null,
      objectiveValue: successful ? solver.objectiveValue : null,
      resourceCapacities: successful && this.problem.isResourceInvestment ? built.capacityVars.map(variable => solver.value(variable)) : null,
      tasks,
      response,
    };
  }
}

class RcpspSolutionCallback extends CpSolverSolutionCallback {
  constructor(
    private readonly problem: NormalizedRcpspProblem,
    private readonly built: BuiltModel,
    private readonly emit: (solution: {
      makespan: bigint;
      objectiveValue: number;
      resourceCapacities: bigint[] | null;
      tasks: RcpspScheduleTask[];
    }) => void,
  ) {
    super();
  }

  override onSolutionCallback() {
    this.emit({
      makespan: this.value(this.built.makespanVar),
      objectiveValue: this.objectiveValue,
      resourceCapacities: this.problem.isResourceInvestment ? this.built.capacityVars.map(variable => this.value(variable)) : null,
      tasks: extractSchedule(this.problem, this, this.built),
    });
  }
}

export class RcpspModelBuilder {
  private readonly resourceNames: string[] = [];
  private readonly resources: RcpspResourceProto[] = [];
  private readonly activities: RcpspActivityInput[] = [];
  private readonly activityNames = new Set<string>();

  constructor(private readonly name = 'rcpsp') {}

  addResource(input: RcpspResourceInput) {
    assert(!this.resourceNames.includes(input.name), `duplicate RCPSP resource ${input.name}`);
    const capacity = asInteger(input.capacity, `resource ${input.name} capacity`);
    assert(capacity >= 0, `resource ${input.name} capacity must be non-negative`);
    this.resourceNames.push(input.name);
    this.resources.push({
      name: input.name,
      maxCapacity: capacity,
      renewable: input.renewable ?? true,
    });
    return this;
  }

  addActivity(input: RcpspActivityInput) {
    assert(input.name, 'activity name is required');
    assert(input.name !== 'source' && input.name !== 'sink', 'source and sink are reserved RCPSP activity names');
    assert(!this.activityNames.has(input.name), `duplicate RCPSP activity ${input.name}`);
    this.activities.push({ ...input, successors: input.successors && [...input.successors],
      demands: input.demands && (Array.isArray(input.demands) ? [...input.demands] : { ...input.demands }) });
    this.activityNames.add(input.name);
    return this;
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

    const hasPredecessor = new Set(tasks.flatMap(task => task.successors ?? []));
    tasks[0].successors = tasks.slice(1, -1)
      .map((_, offset) => offset + 1)
      .filter(candidate => !hasPredecessor.has(candidate));
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

function buildCpSatModel(problem: NormalizedRcpspProblem): BuiltModel {
  const horizon = problem.isResourceInvestment ? problem.deadline : problem.horizon;
  const model = new CpModel();
  model.name = problem.name;
  const tasks = problem.tasks;
  const resources = problem.resources;
  const starts = tasks.map((task, index) => model.newIntVar(0, horizon, `${task.name}_start`));
  const ends = tasks.map((task, index) => model.newIntVar(0, horizon, `${task.name}_end`));
  const recipePresence: Array<Array<BoolVar | true>> = [];
  const intervalsByResource: IntervalVar[][] = resources.map(() => []);
  const demandsByResource: number[][] = resources.map(() => []);
  const budgetDemandsByResource: Array<Array<LinearExpr | number>> = resources.map(() => []);
  const reservoirStarts: IntVar[][] = resources.map(() => []);
  const reservoirDemands: number[][] = resources.map(() => []);
  const reservoirActive: Array<Array<BoolVar | true>> = resources.map(() => []);
  const investmentCapacityBounds = resources.map(() => 0n);

  for (const [taskIndex, task] of tasks.entries()) {
    const recipes = task.recipes;
    const presences = recipes.length > 1 ? recipes.map((_, recipeIndex) => model.newBoolVar(`task_${taskIndex}_recipe_${recipeIndex}`)) : [];
    recipePresence[taskIndex] = presences.length ? presences : recipes.map(() => true);
    if (presences.length) model.addExactlyOne(presences);
    const maximumDemands = resources.map(() => 0);

    for (const [recipeIndex, recipe] of recipes.entries()) {
      const intervalName = `${task.name}_recipe_${recipeIndex}`;
      const interval = presences.length
        ? model.newOptionalIntervalVar(starts[taskIndex], recipe.duration, ends[taskIndex], presences[recipeIndex], intervalName)
        : model.newIntervalVar(starts[taskIndex], recipe.duration, ends[taskIndex], intervalName);
      for (const [resourceIndex, resource] of resources.entries()) {
        const demand = recipeDemandByResource(recipe, resourceIndex);
        maximumDemands[resourceIndex] = Math.max(maximumDemands[resourceIndex], demand);
        if (problem.isConsumerProducer) {
          if (demand !== 0) {
            reservoirStarts[resourceIndex].push(starts[taskIndex]);
            reservoirDemands[resourceIndex].push(demand);
            reservoirActive[resourceIndex].push(recipePresence[taskIndex][recipeIndex]);
          }
        } else if (!problem.isResourceInvestment && resource.renewable === false) {
          budgetDemandsByResource[resourceIndex].push(
            presences.length ? presences[recipeIndex].times(demand) : demand,
          );
        } else if (demand > 0) {
          intervalsByResource[resourceIndex].push(interval);
          demandsByResource[resourceIndex].push(demand);
        }
      }
    }
    if (problem.isResourceInvestment) for (const [resourceIndex, demand] of maximumDemands.entries())
      investmentCapacityBounds[resourceIndex] += BigInt(demand);
  }

  for (const [taskIndex, task] of tasks.entries()) {
    if ((problem.deadline) > 0) model.add(ends[taskIndex].le(problem.deadline));
    for (const [edge, successor] of (task.successors).entries()) {
      if (!problem.isRcpspMax) {
        model.add(ends[taskIndex].le(starts[successor]));
        continue;
      }
      for (const [recipe, delays] of task.successorDelays![edge].recipeDelays!.entries()) {
        for (const [successorRecipe, delay] of delays.minDelays!.entries()) {
          const constraint = model.add(starts[taskIndex].plus(delay).le(starts[successor]));
          const presences = [recipePresence[taskIndex][recipe], recipePresence[successor][successorRecipe]]
            .filter((presence): presence is BoolVar => presence !== true);
          if (presences.length) constraint.onlyEnforceIf(presences);
        }
      }
    }
  }

  const capacityVars: IntVar[] = [];
  for (const [resourceIndex, resource] of resources.entries()) {
    if (problem.isConsumerProducer) {
      // RCPSP checks levels for t >= 0 and permits bounds excluding zero.
      // Shift by a fixed event at t=0: L(t)-min must lie in [0,max-min].
      model.addReservoirConstraint([0, ...reservoirStarts[resourceIndex]],
        [-BigInt(resource.minCapacity), ...reservoirDemands[resourceIndex]],
        0, BigInt(resource.maxCapacity) - BigInt(resource.minCapacity),
        [true, ...reservoirActive[resourceIndex]]);
    } else if (problem.isResourceInvestment) {
      const upper = resource.maxCapacity === -1 ? investmentCapacityBounds[resourceIndex] : BigInt(resource.maxCapacity);
      const capacity = model.newIntVar(0, upper, `${resource.name}_capacity`);
      capacityVars.push(capacity);
      model.addCumulative(intervalsByResource[resourceIndex], demandsByResource[resourceIndex], capacity);
    } else if (resource.renewable === false) {
      model.add(LinearExpr.from(LinearExpr.sum(budgetDemandsByResource[resourceIndex])).le(resource.maxCapacity));
    } else if (intervalsByResource[resourceIndex].length) {
      model.addCumulative(intervalsByResource[resourceIndex], demandsByResource[resourceIndex], resource.maxCapacity);
    }
  }

  const makespanVar = model.newIntVar(0, horizon, 'makespan');
  if (ends.length) model.addMaxEquality(makespanVar, ends);
  else model.add(makespanVar.eq(0));
  model.minimize(problem.isResourceInvestment ? LinearExpr.weightedSum(capacityVars, resources.map(resource => resource.unitCost)) : makespanVar);
  return { model, starts, ends, makespanVar, recipePresence, capacityVars };
}

type RcpspSolutionReader = Pick<CpSolver, 'value' | 'booleanValue'>;

function extractSchedule(problem: NormalizedRcpspProblem, solver: RcpspSolutionReader, built: BuiltModel): RcpspScheduleTask[] {
  return (problem.tasks).map((task, id) => {
    const recipes = task.recipes;
    const selectedRecipe = Math.max(0, built.recipePresence[id].findIndex((presence) => presence === true || solver.booleanValue(presence)));
    const recipe = recipes[selectedRecipe];
    return {
      id,
      name: task.name,
      start: solver.value(built.starts[id]),
      end: solver.value(built.ends[id]),
      duration: recipe.duration,
      selectedRecipe,
      demands: (problem.resources).map((_, resource) => recipeDemandByResource(recipe, resource)),
      successors: [...(task.successors)],
    };
  });
}
