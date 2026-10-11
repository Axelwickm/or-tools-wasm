import type { SolveResultApis } from './solve_results.ts';
import { executorFixtureModes, serverExecutorConfiguration, type ExecutorFixtureMode, type SharedCase } from '../../harness/shared_case.ts';

// Fixed seeds make every failure reproducible across runtimes and executors.
function random(seed: number) {
  return (limit: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(seed / 4294967296 * limit);
  };
}
function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function execution(mode: ExecutorFixtureMode = 'direct') {
  return { executor: mode === 'server' ? serverExecutorConfiguration() : mode };
}
function close(actual: number, expected: number, label: string, tolerance = 1e-6) {
  check(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
}
async function rejects(action: () => unknown, label: string) {
  try { await action(); } catch { return; }
  throw new Error(`${label}: expected rejection`);
}

export const adversarialSolveCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [{
  id: 'routing.adversarial.dimension_names', name: 'Routing preserves arbitrary dimension names through native results and serialization', solver: 'routing',
  async run({ routing: api }, { mode }) {
    const manager = new api.RoutingIndexManager(3, 1, 0), model = new api.RoutingModel(manager);
    const transit = model.registerTransitCallback(() => 1);
    model.setArcCostEvaluatorOfAllVehicles(transit);
    const names = ['__proto__', 'constructor', 'toString', 'λ'];
    for (const name of names) model.addDimension(transit, 0, 100, true, name);
    const answer = await model.solve(execution(mode));
    check(answer.assignment, 'Routing returns an assignment');
    for (const name of names) {
      const end = model.getDimensionOrDie(name).cumulVar(model.end(0));
      check(answer.assignment.value(end) === 3n, `Dimension ${name} retains its value`);
      check(answer.assignment.min(end) === 3n && answer.assignment.max(end) === 3n, `Dimension ${name} retains both bounds`);
    }
    return {};
  },
}, {
  id: 'mathopt.adversarial.abort_reasons', name: 'MathOpt preserves caller cancellation reasons before and during native search', solver: 'mathopt',
  async run({ mathopt: api }, { mode }) {
    const model = api.MathOpt.Model(), x = model.addVariable({ lowerBound: 0, upperBound: 2 });
    model.maximize(x);
    for (const moment of ['before', 'event']) {
      const controller = new AbortController(), reason = new Error(`cancel ${moment}`);
      if (moment === 'before') controller.abort(reason);
      let caught = false, events = 0;
      try {
        await api.MathOpt.solve(model, { ...execution(mode), signal: controller.signal,
          onEvent: () => { if (++events === 1 && moment === 'event') controller.abort(reason); } });
      } catch (error) { caught = true; check(error === reason, `Cancellation ${moment} preserves the caller's Error`); }
      check(caught, `Cancellation ${moment} rejects`);
      check(moment === 'before' ? events === 0 : events > 0, 'Cancellation occurs at the intended point');
      close((await api.MathOpt.solve(model, execution(mode))).value(x), 2, 'Recovery after cancellation');
    }
    return {};
  },
}, {
  id: 'knapsack.adversarial.exhaustive', name: 'Seeded multidimensional knapsacks agree with exhaustive enumeration', solver: 'knapsack',
  async run({ knapsack: api }, { mode }) {
    const rng = random(0x91af);
    const solver = new api.KnapsackSolver(api.KnapsackSolverType.KNAPSACK_MULTIDIMENSION_BRANCH_AND_BOUND_SOLVER, '随机');
    for (let trial = 0; trial < 24; ++trial) {
      const n = 8, profits = Array.from({ length: n }, () => rng(12));
      const weights = Array.from({ length: 2 }, () => Array.from({ length: n }, () => rng(5)));
      const capacities = [rng(15), rng(15)];
      let optimum = 0;
      for (let mask = 0; mask < 1 << n; ++mask) {
        if (weights.some((row, d) => row.reduce((sum, value, i) => sum + ((mask >> i & 1) ? value : 0), 0) > capacities[d])) continue;
        optimum = Math.max(optimum, profits.reduce((sum, value, i) => sum + ((mask >> i & 1) ? value : 0), 0));
      }
      solver.init(profits, weights, capacities);
      const pending = solver.solve(execution(mode));
      // An unrelated reinitialization must not alter the submitted instance.
      solver.init([99], [[0], [0]], [0, 0]);
      const answer = await pending;
      check(answer.optimal && answer.profit === BigInt(optimum), `knapsack seed 0x91af trial ${trial}`);
      check(profits.reduce((sum, value, i) => sum + (answer.contains(i) ? value : 0), 0) === optimum, 'Reported knapsack selection has the expected profit');
      for (let d = 0; d < 2; ++d) check(weights[d].reduce((sum, value, i) => sum + (answer.contains(i) ? value : 0), 0) <= capacities[d], 'Reported knapsack selection is feasible');
    }
    return {};
  },
}, {
  id: 'network_flow.adversarial.cuts_and_assignments', name: 'Seeded flow and signed assignment results agree with exhaustive oracles', solver: 'network-flow',
  async run({ flow: api }, { mode }) {
    const rng = random(0x70ab);
    for (let trial = 0; trial < 20; ++trial) {
      const flow = new api.SimpleMaxFlow(), n = 5;
      const edges: { tail: number; head: number; capacity: number }[] = [];
      for (let tail = 0; tail < n; ++tail) for (let head = 0; head < n; ++head) if (tail !== head && rng(3)) {
        const capacity = rng(8); edges.push({ tail, head, capacity }); flow.addArcWithCapacity(tail, head, capacity);
      }
      // Preserve source/sink even if every sampled incident capacity is zero.
      edges.push({ tail: 0, head: n - 1, capacity: 0 }); flow.addArcWithCapacity(0, n - 1, 0);
      let cut = Infinity;
      for (let mask = 0; mask < 1 << n; ++mask) if ((mask & 1) && !(mask >> (n - 1) & 1)) {
        cut = Math.min(cut, edges.reduce((sum, edge) => sum + ((mask >> edge.tail & 1) && !(mask >> edge.head & 1) ? edge.capacity : 0), 0));
      }
      const answer = await flow.solve({ ...execution(mode), source: 0, sink: n - 1 });
      check(answer.status === api.SimpleMaxFlowStatus.OPTIMAL && answer.optimalFlow === BigInt(cut), `flow seed 0x70ab trial ${trial}`);
      const balance = Array<bigint>(n).fill(0n);
      edges.forEach((edge, index) => {
        const value = answer.flow(index);
        check(value >= 0n && value <= BigInt(edge.capacity), 'Flow respects each capacity');
        balance[edge.tail] -= value; balance[edge.head] += value;
      });
      check(balance[0] === -BigInt(cut) && balance[n - 1] === BigInt(cut) && balance.slice(1, -1).every(value => value === 0n), 'Flow conserves every internal node');
      const costs = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => rng(21) - 10));
      const assignment = new api.SimpleLinearSumAssignment();
      costs.forEach((row, i) => row.forEach((cost, j) => assignment.addArcWithCost(i, j, cost)));
      let optimum = Infinity;
      for (let a = 0; a < 4; ++a) for (let b = 0; b < 4; ++b) for (let c = 0; c < 4; ++c) for (let d = 0; d < 4; ++d) {
        if (new Set([a, b, c, d]).size === 4) optimum = Math.min(optimum, costs[0][a] + costs[1][b] + costs[2][c] + costs[3][d]);
      }
      const matched = await assignment.solve(execution(mode));
      check(matched.status === api.SimpleLinearSumAssignmentStatus.OPTIMAL && matched.optimalCost === BigInt(optimum), `assignment seed 0x70ab trial ${trial}`);
      check(new Set(costs.map((_, i) => matched.rightMate(i))).size === 4, 'Assignment uses each right node once');
      check(costs.reduce((sum, row, i) => sum + row[matched.rightMate(i)], 0) === optimum, 'Assignment mates reproduce reported cost');
    }
    return {};
  },
}, {
  id: 'mathopt.adversarial.edit_sessions', name: 'Seeded objective and bound edits agree with analytic box optima and fresh solves', solver: 'mathopt',
  async run({ mathopt: api }, { mode }) {
    const rng = random(0x51fe), model = api.MathOpt.Model('mutations 🧪');
    const names = ['', '__proto__', 'constructor', 'λ\0x', 'toString', 'hasOwnProperty'];
    const variables = names.map(name => model.addVariable({ name, lowerBound: -2, upperBound: 4 }));
    const coefficients = names.map(() => 0);
    const session = new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GLOP, { ...execution(mode), threads: 1 });
    const previous: { result: Awaited<ReturnType<typeof api.MathOpt.solve>>; objective: number; values: number[] }[] = [];
    try {
      for (let trial = 0; trial < 32; ++trial) {
        const index = rng(variables.length), variable = variables[index];
        variable.lowerBound = rng(7) - 4; variable.upperBound = variable.lowerBound + rng(6);
        coefficients[index] = rng(11) - 5;
        model.objective.setLinearCoefficient(model.getVariable(variable.id)!, coefficients[index]);
        model.objective.offset = rng(11) - 5; model.objective.isMaximize = Boolean(rng(2));
        const expected = model.objective.offset + variables.reduce((sum, v, i) => sum + coefficients[i] *
          ((coefficients[i] > 0) === model.objective.isMaximize ? v.upperBound : v.lowerBound), 0);
        const incremental = await session.solve(), fresh = await api.MathOpt.solve(model, { ...execution(mode), threads: 1 });
        close(incremental.objectiveValue!, expected, `incremental seed 0x51fe trial ${trial}`);
        close(fresh.objectiveValue!, expected, `fresh seed 0x51fe trial ${trial}`);
        const values = variables.map(v => incremental.value(v));
        variables.forEach((v, i) => check(values[i] >= v.lowerBound - 1e-6 && values[i] <= v.upperBound + 1e-6, 'Box solution respects current bounds'));
        close(model.objective.asLinearExpression().evaluate(new Map(variables.map((v, i) => [v, values[i]]))), expected, 'Public expression evaluation matches native objective');
        previous.push({ result: incremental, objective: expected, values });
        if (trial % 8 === 0) {
          const controller = new AbortController(); controller.abort(new Error('deliberate pre-abort'));
          await rejects(() => session.solve({ signal: controller.signal }), 'Pre-aborted session solve');
          await rejects(() => model.objective.setLinearCoefficient(api.MathOpt.Model().addVariable(), 1), 'Foreign variable');
        }
      }
      model.deleteVariable(variables[0]);
      await rejects(() => model.objective.setLinearCoefficient(variables[0], 1), 'Deleted variable');
      await session.solve();
      for (const old of previous) {
        close(old.result.objectiveValue!, old.objective, 'Previous objective remains unchanged');
        variables.forEach((v, i) => close(old.result.value(v), old.values[i], 'Previous values survive edits and deletion'));
      }
    } finally { await session.close(); }
    await session.close();
    await rejects(() => session.solve(), 'Closed incremental solver');
    return {};
  },
}, {
  id: 'mathopt.adversarial.rejected_inputs_and_observers', name: 'Invalid models and unusual observer failures preserve errors and allow recovery', solver: 'mathopt',
  async run({ mathopt: api }, { mode }) {
    const options = { ...execution(mode), threads: 1 };
    const model = api.MathOpt.Model(), x = model.addVariable({ lowerBound: 1, upperBound: 3 });
    model.maximize(x);
    const duplicate = api.MathOpt.Model();
    duplicate.addVariable({ name: 'same' }); duplicate.addVariable({ name: 'same' });
    await rejects(() => api.MathOpt.solve(duplicate, options), 'Duplicate native variable names');
    // Invalid wire tags, unterminated varints, and a length beyond the input.
    for (const bytes of [[0], [255], [10, 255, 255, 255, 255, 127], [18, 4, 8]]) {
      await rejects(() => api.MathOptModel.fromModelProto(Uint8Array.from(bytes), options), 'Malformed model bytes');
    }
    for (const failure of [undefined, null, false, 0, '', new Error('observer sentinel')]) {
      let caught = false, calls = 0;
      try {
        await api.MathOpt.solve(model, { ...options, onEvent: async () => { ++calls; throw failure; } });
      } catch (error) { caught = true; check(error === failure, 'Observer rejection preserves the exact thrown value'); }
      check(caught && calls === 1, 'A failed observer is invoked exactly once');
      const recovered = await api.MathOpt.solve(model, options);
      close(recovered.value(x), 3, 'Recovery after observer rejection');
    }
    const invalid = api.MathOpt.Model(); invalid.addVariable({ lowerBound: 3, upperBound: 1 });
    const session = new api.MathOpt.IncrementalSolver(invalid, api.MathOptSolverType.GLOP, options);
    try { await rejects(() => session.solve(), 'Invalid incremental model'); }
    finally { await session.close(); await session.close(); }
    const recovery = new api.MathOpt.IncrementalSolver(model, api.MathOptSolverType.GLOP, options);
    try { close((await recovery.solve()).value(x), 3, 'New session after failed construction and repeated close'); }
    finally { await recovery.close(); }
    return {};
  },
}, {
  id: 'cp_sat.adversarial.signed_binary_models', name: 'Seeded Boolean models with signed coefficients agree with exhaustive enumeration', solver: 'cp-sat',
  async run({ cpSat: api }, { mode }) {
    const rng = random(0xc5a7), solver = new api.CpSolver();
    for (let trial = 0; trial < 20; ++trial) {
      const model = new api.CpModel(), variables = Array.from({ length: 7 }, (_, i) => model.newBoolVar(`x${i}`));
      const costs = variables.map(() => rng(11) - 5), row = variables.map(() => rng(9) - 4);
      const lower = rng(7) - 3, upper = lower + rng(5);
      model.addLinearConstraint(api.LinearExpr.weightedSum(variables, row), lower, upper);
      model.maximize(api.LinearExpr.weightedSum(variables, costs));
      let optimum = -Infinity;
      for (let mask = 0; mask < 1 << variables.length; ++mask) {
        const total = row.reduce((sum, value, i) => sum + ((mask >> i & 1) ? value : 0), 0);
        if (total >= lower && total <= upper) optimum = Math.max(optimum, costs.reduce((sum, value, i) => sum + ((mask >> i & 1) ? value : 0), 0));
      }
      const status = await solver.solve(model, { ...execution(mode), numWorkers: 1 });
      check(status === (optimum === -Infinity ? 'INFEASIBLE' : 'OPTIMAL'), `CP-SAT seed 0xc5a7 trial ${trial} status`);
      if (optimum !== -Infinity) {
        const values = variables.map(variable => Number(solver.value(variable)));
        check(values.every(value => value === 0 || value === 1), 'Boolean solution is integral');
        close(costs.reduce((sum, value, i) => sum + value * values[i], 0), optimum, `CP-SAT seed 0xc5a7 trial ${trial}`);
        const activity = row.reduce((sum, value, i) => sum + value * values[i], 0);
        check(activity >= lower && activity <= upper, 'Boolean solution satisfies the signed row');
      }
    }
    return {};
  },
}];

export async function runPdlpAdversarialCases(api: typeof import('or-tools-wasm/pdlp')) {
  for (const mode of executorFixtureModes) {
    const rng = random(0x9d19);
    for (let trial = 0; trial < 16; ++trial) {
      const diagonal = Array.from({ length: 5 }, () => rng(5) + 1), costs = diagonal.map(() => rng(17) - 8);
      const lower = diagonal.map(() => rng(5) - 4), upper = lower.map(value => value + rng(6));
      const qp = new api.QuadraticProgram({ objectiveVector: costs, objectiveMatrixDiagonal: diagonal,
        variableLowerBounds: lower, variableUpperBounds: upper });
      const result = await api.Pdlp.solve(qp, { ...execution(mode), numThreads: 1,
        terminationCriteria: { timeSecLimit: 10, simpleOptimalityCriteria: { epsOptimalAbsolute: 1e-8, epsOptimalRelative: 1e-8 } } });
      check(result.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', `PDLP seed 0x9d19 trial ${trial}: ${result.solveLog.terminationReason}`);
      diagonal.forEach((value, i) => close(result.primalSolution[i], Math.min(upper[i], Math.max(lower[i], -costs[i] / value)), `PDLP trial ${trial} variable ${i}`, 1e-4));
    }
  }
}

export async function runRcpspAdversarialCases(api: typeof import('or-tools-wasm/rcpsp')) {
  for (const mode of executorFixtureModes) {
    const rng = random(0x7c95);
    for (let trial = 0; trial < 16; ++trial) {
      const durations = Array.from({ length: 8 }, () => rng(6)), successors = durations.map(() => [] as number[]);
      for (let i = 0; i < durations.length; ++i) for (let j = i + 1; j < durations.length; ++j) if (rng(4) === 0) successors[i].push(j);
      const ends = [...durations];
      for (let i = 0; i < durations.length; ++i) for (const j of successors[i]) ends[j] = Math.max(ends[j], ends[i] + durations[j]);
      const builder = new api.RcpspModelBuilder();
      builder.addResource({ name: 'crew', capacity: 8 });
      // Forward references and shuffled insertion order must preserve the DAG.
      for (const i of [7, 0, 6, 1, 5, 2, 4, 3]) builder.addActivity({ name: `t${i}`, duration: durations[i], demands: { crew: 1 }, successors: successors[i].map(j => `t${j}`) });
      const problem = builder.build(), before = problem.exportModelAsProto();
      const answer = await problem.solve({ ...execution(mode), numWorkers: 1 });
      check(answer.statusName === 'OPTIMAL' && answer.makespan === BigInt(Math.max(...ends)), `RCPSP seed 0x7c95 trial ${trial}`);
      check(JSON.stringify(problem.exportModelAsProto()) === JSON.stringify(before), 'Solving does not mutate the scheduling model');
      const tasks = new Map(answer.tasks.map(task => [task.name, task]));
      for (let i = 0; i < durations.length; ++i) for (const j of successors[i]) check(tasks.get(`t${i}`)!.end <= tasks.get(`t${j}`)!.start, 'Schedule respects every precedence edge');
    }
  }
}
