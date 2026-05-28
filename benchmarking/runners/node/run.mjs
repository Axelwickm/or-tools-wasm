#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';

import {
  CpModel,
  CpSolver,
  CpSolverStatus,
  terminateLoadedRuntimeThreads,
  weightedSum,
} from 'or-tools-wasm/cp-sat';
import {
  DefaultRoutingSearchParameters,
  FirstSolutionStrategy,
  initRouting,
  RoutingIndexManager,
  RoutingModel,
} from 'or-tools-wasm/routing';
import { initMPSolver, MPSolver } from 'or-tools-wasm/mp-solver';
import { initMathOpt, MathOpt } from 'or-tools-wasm/mathopt';
import {
  initKnapsack,
  KnapsackSolver,
  KnapsackSolverType,
} from 'or-tools-wasm/knapsack';
import {
  initNetworkFlow,
  SimpleMaxFlow,
  SimpleMaxFlowStatus,
} from 'or-tools-wasm/network-flow';

const HEADER = [
  'git_sha',
  'ortools_version',
  'implementation',
  'environment',
  'suite',
  'solver',
  'problem',
  'requested_threads',
  'run',
  'status',
  'objective',
  'execution_ms',
];

const RUNTIME_ENV = globalThis.process?.env ?? globalThis.Deno?.env?.toObject?.() ?? {};
const RUNTIME_ARGV = globalThis.process?.argv ?? ['deno', 'run', ...(globalThis.Deno?.args ?? [])];
const IMPLEMENTATION = RUNTIME_ENV.BENCH_IMPLEMENTATION ?? 'wasm-node';
const ENVIRONMENT = RUNTIME_ENV.BENCH_ENVIRONMENT ?? 'node-local';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 2; index < argv.length; index++) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    args.set(key.slice(2), argv[index + 1]);
    index++;
  }
  return args;
}

const repoRoot = resolve(new URL('../../../', import.meta.url).pathname);

function gitSha() {
  if (RUNTIME_ENV.BENCH_GIT_SHA) return RUNTIME_ENV.BENCH_GIT_SHA;
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

async function ortoolsVersion() {
  const text = await readFile(resolve(repoRoot, 'Version.txt'), 'utf8');
  const major = text.match(/^OR_TOOLS_MAJOR=(\d+)/m)?.[1] ?? 'unknown';
  const minor = text.match(/^OR_TOOLS_MINOR=(\d+)/m)?.[1] ?? 'unknown';
  return `${major}.${minor}`;
}

function deterministicPoints(count) {
  const points = [];
  let state = 0x5eed;
  for (let index = 0; index < count; index++) {
    state = (Math.imul(1103515245, state) + 12345) & 0x7fffffff;
    const x = state % 10000;
    state = (Math.imul(1103515245, state) + 12345) & 0x7fffffff;
    const y = state % 10000;
    points.push([x, y]);
  }
  return points;
}

function deterministicValue(index, modulus, offset = 1) {
  return (((Math.imul(index, 1103515245) + 12345) & 0x7fffffff) % modulus) + offset;
}

function statusName(status, enumObject) {
  if (typeof status === 'string' && Number.isNaN(Number(status))) {
    return status;
  }
  if (Object.prototype.hasOwnProperty.call(enumObject, status)) {
    return String(enumObject[status]);
  }
  const numericStatus = Number(String(status));
  if (Number.isFinite(numericStatus) && Object.prototype.hasOwnProperty.call(enumObject, numericStatus)) {
    return String(enumObject[numericStatus]);
  }
  for (const [key, value] of Object.entries(enumObject)) {
    if (value === status) return key;
  }
  return String(status);
}

async function solveCpSat(problem, threads) {
  const model = new CpModel();
  const variableCount = Number(problem.variables);
  const constraintCount = Number(problem.constraints);
  const selected = Array.from({ length: variableCount }, (_, index) => model.newBoolVar(`x${index}`));

  for (let row = 0; row < constraintCount; row++) {
    model.addLinearConstraint(
      weightedSum(selected, selected.map((_, column) => deterministicValue(row * variableCount + column, 17, 1))),
      0,
      Math.floor(25 * variableCount / constraintCount),
    );
  }

  model.maximize(weightedSum(
    selected,
    selected.map((_, index) => deterministicValue(index, 101, 1)),
  ));

  const solver = new CpSolver();
  solver.parameters.maxTimeInSeconds = Number(problem.timeLimitSeconds ?? 5);
  solver.parameters.numSearchWorkers = threads;
  const status = await solver.solve(model);
  const name = statusName(status, CpSolverStatus);
  let objective = '';
  if (name === 'OPTIMAL' || name === 'FEASIBLE') {
    objective = String(solver.objectiveValue());
  }
  return [name, objective];
}

async function solveRouting(problem, threads) {
  void threads;
  await initRouting();
  const points = deterministicPoints(Number(problem.size));
  const manager = new RoutingIndexManager(points.length, 1, 0);
  const routing = new RoutingModel(manager);
  try {
    const transit = routing.RegisterTransitCallback((fromIndex, toIndex) => {
      const fromNode = manager.IndexToNode(fromIndex);
      const toNode = manager.IndexToNode(toIndex);
      const [ax, ay] = points[fromNode];
      const [bx, by] = points[toNode];
      return Math.round(Math.hypot(ax - bx, ay - by));
    });
    routing.SetArcCostEvaluatorOfAllVehicles(transit);
    const params = DefaultRoutingSearchParameters();
    params.firstSolutionStrategy = FirstSolutionStrategy.PATH_CHEAPEST_ARC;
    if (params.timeLimit) params.timeLimit.seconds = Number(problem.timeLimitSeconds ?? 5);
    const assignment = await routing.SolveWithParameters(params);
    if (!assignment) return ['NO_SOLUTION', ''];
    return ['OK', String(assignment.ObjectiveValue())];
  } finally {
    routing.delete();
    manager.delete();
  }
}

async function solveMpsolver(problem, threads) {
  await initMPSolver();
  const variableCount = Number(problem.variables);
  const constraintCount = Number(problem.constraints);
  const solver = MPSolver.CreateSolver('SAT');
  if (!solver) return ['UNAVAILABLE', ''];

  try {
    solver.SetNumThreads(threads);
    const variables = Array.from({ length: variableCount }, (_, index) => solver.BoolVar(`x${index}`));
    for (let row = 0; row < constraintCount; row++) {
      const constraint = solver.RowConstraint(-solver.infinity(), 25 * variableCount / constraintCount, `c${row}`);
      variables.forEach((variable, column) => {
        constraint.SetCoefficient(variable, deterministicValue(row * variableCount + column, 17, 1));
      });
    }

    const objective = solver.Objective();
    variables.forEach((variable, column) => {
      objective.SetCoefficient(variable, deterministicValue(column, 101, 1));
    });
    objective.SetMaximization();

    const result = await solver.SolveWithProto({
      timeLimitSeconds: Number(problem.timeLimitSeconds ?? 5),
      solverSpecificParameters: `num_workers: ${threads}`,
    });
    if (!result.loaded) return ['LOAD_FAILED', ''];
    const status = String(result.response.status ?? 'UNKNOWN');
    const objectiveValue = objective.Value();
    return [status, Number.isFinite(objectiveValue) ? String(objectiveValue) : ''];
  } finally {
    solver.delete();
  }
}

async function solveMathOpt(problem, threads) {
  await initMathOpt();
  const variableCount = Number(problem.variables);
  const constraintCount = Number(problem.constraints);
  const model = MathOpt.Model(problem.problem);
  const variables = Array.from({ length: variableCount }, (_, index) =>
    model.addVariable({ lowerBound: 0, upperBound: 1, name: `x${index}` })
  );

  for (let row = 0; row < constraintCount; row++) {
    model.addLinearConstraint({
      upperBound: variableCount * 0.38,
      terms: variables.map((variable, column) => ({
        variable,
        coefficient: deterministicValue(row * variableCount + column, 13, 1) / 13,
      })),
    });
  }

  model.maximize(variables.map((variable, column) => ({
    variable,
    coefficient: deterministicValue(column, 97, 1),
  })));
  const result = await MathOpt.solve(model, {
    solverType: MathOpt.SolverType.GLOP,
    threads,
    timeLimitSeconds: Number(problem.timeLimitSeconds ?? 5),
    glop: new MathOpt.GlopParameters({ usePreprocessing: true, useScaling: true }),
  });
  return [String(result.terminationReason), String(result.objectiveValue ?? '')];
}

async function solveKnapsack(problem, threads) {
  void threads;
  await initKnapsack();
  const itemCount = Number(problem.items);
  const dimensionCount = Number(problem.dimensions);
  const values = Array.from({ length: itemCount }, (_, index) => deterministicValue(index, 500, 50));
  const weights = Array.from({ length: dimensionCount }, (_, dimension) =>
    Array.from({ length: itemCount }, (_, index) => deterministicValue(dimension * itemCount + index, 40, 1))
  );
  const capacities = weights.map((row) => Math.floor(row.reduce((total, value) => total + value, 0) / 3));

  const solver = new KnapsackSolver(
    KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER,
    problem.problem,
  );
  solver.init(values, weights, capacities);
  const objective = await solver.solve();
  return [solver.is_solution_optimal() ? 'OPTIMAL' : 'FEASIBLE', String(objective)];
}

async function solveMaxFlow(problem, threads) {
  void threads;
  await initNetworkFlow();
  const layers = Number(problem.layers);
  const width = Number(problem.width);
  const source = 0;
  const sink = layers * width + 1;
  const tails = [];
  const heads = [];
  const capacities = [];
  const addArc = (tail, head, capacity) => {
    tails.push(tail);
    heads.push(head);
    capacities.push(capacity);
  };

  for (let node = 0; node < width; node++) {
    addArc(source, 1 + node, deterministicValue(node, 60, 10));
  }
  for (let layer = 0; layer < layers - 1; layer++) {
    const base = 1 + layer * width;
    const nextBase = 1 + (layer + 1) * width;
    for (let node = 0; node < width; node++) {
      for (const offset of [0, 1, 5]) {
        addArc(
          base + node,
          nextBase + ((node + offset) % width),
          deterministicValue(layer * width * 3 + node * 3 + offset, 40, 5),
        );
      }
    }
  }
  const lastBase = 1 + (layers - 1) * width;
  for (let node = 0; node < width; node++) {
    addArc(lastBase + node, sink, deterministicValue(node + 1000, 60, 10));
  }

  const maxFlow = new SimpleMaxFlow();
  maxFlow.add_arcs_with_capacity(tails, heads, capacities);
  const status = await maxFlow.solve(source, sink);
  return [
    statusName(status, SimpleMaxFlowStatus),
    status === SimpleMaxFlow.OPTIMAL ? String(maxFlow.optimal_flow()) : '',
  ];
}

const SOLVERS = {
  cp_sat: solveCpSat,
  routing: solveRouting,
  mpsolver_sat: solveMpsolver,
  mathopt_glop: solveMathOpt,
  knapsack: solveKnapsack,
  max_flow: solveMaxFlow,
};

async function runProblem(problem, threads) {
  const start = performance.now();
  try {
    const [status, objective] = await SOLVERS[problem.solver](problem, threads);
    return [status, objective, performance.now() - start];
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return [`ERROR: ${message}`, '', performance.now() - start];
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function main() {
  const args = parseArgs(RUNTIME_ARGV);
  const configPath = resolve(args.get('config') ?? resolve(repoRoot, 'benchmarking/suites.json'));
  const outPath = args.get('out');
  if (!outPath) throw new Error('--out is required');

  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const runs = Number(args.get('runs') ?? config.runs ?? 1);
  const warmupRuns = Number(args.get('warmup-runs') ?? config.warmupRuns ?? 1);
  const sha = gitSha();
  const version = await ortoolsVersion();
  const rows = [];

  for (const problem of config.problems) {
    for (const threads of config.threads ?? [1]) {
      for (let warmup = 0; warmup < Math.max(0, warmupRuns); warmup++) {
        await runProblem(problem, Number(threads));
      }
      for (let run = 1; run <= runs; run++) {
        const [status, objective, elapsedMs] = await runProblem(problem, Number(threads));
        rows.push({
          git_sha: sha,
          ortools_version: version,
          implementation: IMPLEMENTATION,
          environment: ENVIRONMENT,
          suite: problem.suite,
          solver: problem.solver,
          problem: problem.problem,
          requested_threads: threads,
          run,
          status,
          objective,
          execution_ms: elapsedMs.toFixed(3),
        });
      }
    }
  }

  const lines = [
    HEADER.join(','),
    ...rows.map((row) => HEADER.map((key) => csvEscape(row[key])).join(',')),
  ];
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${lines.join('\n')}\n`);
}

try {
  await main();
} finally {
  await terminateLoadedRuntimeThreads();
}
