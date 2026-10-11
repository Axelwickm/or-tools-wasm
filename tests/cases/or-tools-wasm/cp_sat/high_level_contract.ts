import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  passedCase,
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
  type SharedCaseMetadata,
  type SharedCaseResult,
} from '../../../harness/shared_case.ts';

type HighLevelCpSatPackage = {
  CpModel: new () => any;
  CpSolver: new () => any;
  CpSolverSolutionCallback: new () => any;
  [name: string]: unknown;
};

export type CpSatHighLevelContractResult = SharedCaseResult<ExecutorFixtureMode> & {
  solverStatus?: string;
};

const reservoirCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.reservoir',
  name: 'CP-SAT high-level reservoir constraints',
  solver: 'cp-sat',
  source: 'javascript/lib/cp_sat/high_level_api.ts',
  tags: ['contract', 'high-level', 'reservoir'],
};

const typescriptHelpersCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.typescript_helpers',
  name: 'CP-SAT TypeScript-specific model helpers',
  solver: 'cp-sat',
  source: 'javascript/lib/cp_sat/high_level_api.ts',
  tags: ['contract', 'high-level', 'typescript-api'],
};

const solverResultsCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.solver_results',
  name: 'CP-SAT TypeScript-specific solver result helpers',
  solver: 'cp-sat',
  source: 'javascript/lib/cp_sat/high_level_api.ts',
  tags: ['contract', 'high-level', 'typescript-api'],
};

const expressionSurfaceCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.expression_surface',
  name: 'CP-SAT public expression and literal surface',
  solver: 'cp-sat',
  source: 'javascript/lib/cp_sat/high_level_api.ts',
  tags: ['contract', 'high-level', 'expressions'],
};

const exactIntegersCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.exact_integers',
  name: 'CP-SAT exact signed int64 values',
  solver: 'cp-sat',
  source: 'javascript/lib/cp_sat/high_level_api.ts',
  tags: ['contract', 'high-level', 'int64', 'bigint'],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(errorType: new (...args: any[]) => Error, fn: () => unknown, message: string) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof errorType, `${message}: expected ${errorType.name}, got ${String(error)}`);
    return;
  }
  throw new Error(`${message}: expected an exception`);
}

function executorForMode(mode: ExecutorFixtureMode) {
  return mode === 'server' ? serverExecutorConfiguration() : mode;
}

async function runReservoirCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const model = new api.CpModel();
  const fillTime = model.newIntVar(0, 0, 'fill_time');
  const drainTime = model.newIntVar(1, 1, 'drain_time');
  const reservoir = model.addReservoirConstraint(
    [fillTime, drainTime],
    [2, -2],
    0,
    2,
  );
  const reservoirProto = model.modelProto.constraints?.[reservoir.index]?.reservoir;
  assert(reservoirProto?.timeExprs?.length === 2, 'reservoir must contain both time expressions');
  assert(reservoirProto?.levelChanges?.length === 2, 'reservoir must contain both level changes');
  assert(reservoirProto?.activeLiterals === undefined, 'plain reservoir must not contain active literals');

  const inactive = model.newBoolVar('inactive');
  model.add(inactive.eq(0));
  const optionalReservoir = model.addReservoirConstraint(
    [fillTime],
    [3],
    0,
    0,
    [inactive],
  );
  const optionalProto = model.modelProto.constraints?.[optionalReservoir.index]?.reservoir;
  assert(optionalProto?.activeLiterals?.[0] === inactive.index, 'active reservoir must encode its literal');

  assertThrows(RangeError, () => model.addReservoirConstraint([0], [1], 1, 2), 'positive min level');
  assertThrows(RangeError, () => model.addReservoirConstraint([0], [-1], -2, -1), 'negative max level');
  assertThrows(RangeError, () => model.addReservoirConstraint([0], [1], 0, -1), 'reversed reservoir bounds');
  assertThrows(RangeError, () => model.addReservoirConstraint([0], [], 0, 1), 'reservoir arity');
  assertThrows(
    RangeError,
    () => model.addReservoirConstraint([0], [1], 0, 1, []),
    'active reservoir arity',
  );

  const solver = new api.CpSolver();
  const status = await solver.solve(model, { executor: executorForMode(mode), numWorkers: 1 });
  const solverStatus = solver.statusName(status);
  assert(solverStatus === 'OPTIMAL', `reservoir solve expected OPTIMAL, got ${solverStatus}`);
  return { solverStatus };
}

async function runTypescriptHelpersCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const model = new api.CpModel();
  model.name = 'original';
  const x = model.newIntVar(0, 3, 'x');
  const y = model.newIntVar(0, 3, 'y');
  const bool = model.newBoolVar('bool');
  const booleanDomainInt = model.newIntVar(0, 1, 'boolean_domain_int');
  assert(!x.isBoolean(), 'integer variable must not be classified as Boolean');
  assert(bool.isBoolean(), 'BoolVar must be classified as Boolean');
  assert(booleanDomainInt.isBoolean(), '0..1 integer variable must be classified as Boolean');
  assert(
    model.getBoolVarFromProtoIndex(booleanDomainInt.index).isBoolean(),
    'canonical proto-index lookup must recover a Boolean variable',
  );
  const snapshot = model.modelProto;
  snapshot.name = 'detached';
  snapshot.variables.push({ name: 'external', domain: [0, 1] });
  assert(model.name === 'original', 'mutating a modelProto snapshot must not change the model name');
  assert(model.modelProto.variables.length === 4, 'mutating a modelProto snapshot must not change model variables');
  const foreignModel = new api.CpModel();
  const foreignBool = foreignModel.newBoolVar('foreign_bool');
  assertThrows(
    Error,
    () => model.addAssumption(foreignBool),
    'assumption from another model',
  );
  assertThrows(
    Error,
    () => model.addAssumption(foreignBool.negated()),
    'negated assumption from another model',
  );
  assert(
    (model.modelProto.assumptions?.length ?? 0) === 0,
    'rejected foreign assumptions must not mutate the model',
  );
  model.addEquality(x, y);
  model.maximize(x);

  const solver = new api.CpSolver();
  const status = await solver.solve(model, { executor: executorForMode(mode), numWorkers: 1 });
  const solverStatus = solver.statusName(status);
  assert(solverStatus === 'OPTIMAL', `helper solve expected OPTIMAL, got ${solverStatus}`);
  assert(solver.value(x) === 3n && solver.value(y) === 3n, 'addEquality must enforce equal optimal values');
  return { solverStatus };
}

async function runSolverResultsCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const model = new api.CpModel();
  const x = model.newIntVar(0, 4, 'x');
  model.maximize(x);
  const solver = new api.CpSolver();
  assert(solver.response === null, 'response must be null before solve');
  assertThrows(Error, () => solver.bestObjectiveBound, 'bestObjectiveBound before solve');

  const status = await solver.solve(model, { executor: executorForMode(mode), numWorkers: 1 });
  const solverStatus = solver.statusName(status);
  assert(solverStatus === 'OPTIMAL', `result helper solve expected OPTIMAL, got ${solverStatus}`);
  assert(solver.response !== null, 'response must expose the decoded response after solve');
  assert(solver.bestObjectiveBound === 4, 'bestObjectiveBound must return the proven optimum');
  assert(solver.deterministicTime >= 0, 'deterministicTime must be nonnegative');
  assert(solver.userTime >= 0, 'userTime must be nonnegative');
  assert(solver.wallTime >= 0, 'wallTime must be nonnegative');
  assert(solver.numBooleans >= 0, 'numBooleans must be nonnegative');
  assert(solver.numConflicts >= 0, 'numConflicts must be nonnegative');
  assert(solver.numBranches >= 0, 'numBranches must be nonnegative');
  assert(solver.numIntegers >= 0, 'numIntegers must be nonnegative');
  assert(solver.numBinaryPropagations >= 0, 'numBinaryPropagations must be nonnegative');
  assert(solver.numIntegerPropagations >= 0, 'numIntegerPropagations must be nonnegative');
  assert(solver.solveLog === solver.response.solveLog, 'solveLog must expose the response log');
  return { solverStatus };
}

async function runExpressionSurfaceCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const model = new api.CpModel();
  const x = model.newIntVar(0, 3, 'x');
  const y = model.newIntVar(0, 3, 'y');
  const enabled = model.newBoolVar('enabled');
  const expression = x.plus(y.times(2)).plus(1);
  const expressionProto = expression.toProto();
  assert(expressionProto.vars?.length === 2, 'public expression proto must retain both variables');
  assert(expressionProto.coeffs?.[0] === 1, 'public expression proto must retain the x coefficient');
  assert(expressionProto.coeffs?.[1] === 2, 'public expression proto must retain the y coefficient');
  assert(expressionProto.offset === 1, 'public expression proto must retain its offset');

  model.add(expression.eq(4));
  model.addBoolAnd([enabled]);
  model.addBoolOr([false, enabled]);
  const interval = model.newIntervalVar(x, 1, x.plus(1), 'interval');
  assert(interval.startExpr() === x, 'interval start must reconstruct its public variable wrapper');
  assert(String(interval.sizeExpr()) === '1', 'interval size must reconstruct its public constant expression');
  assert(String(interval.endExpr()) === '(x + 1)', 'interval end must reconstruct its public affine expression');
  model.maximize(y);

  const solver = new api.CpSolver();
  const status = await solver.solve(model, { executor: executorForMode(mode), numWorkers: 1 });
  const solverStatus = solver.statusName(status);
  assert(solverStatus === 'OPTIMAL', `expression surface solve expected OPTIMAL, got ${solverStatus}`);
  assert(solver.value(x) === 1n && solver.value(y) === 1n, 'canonical expression must enforce x + 2y + 1 = 4');
  assert(solver.booleanValue(enabled), 'canonical Boolean literal must remain true');
  return { solverStatus };
}

async function runExactIntegersCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const exact = 9_007_199_254_740_993n;
  const asNumber = api.asNumber as ((value: number | bigint) => number) | undefined;
  assert(typeof asNumber === 'function', 'CP-SAT must export the checked asNumber helper');
  assert(asNumber(3n) === 3, 'asNumber must convert safe bigint values');
  assertThrows(RangeError, () => asNumber(exact), 'asNumber must reject unsafe bigint values');
  const model = new api.CpModel();
  const x = model.newIntVar(exact, exact, 'exact');
  model.add(x.plus(2n).minus(2n).eq(exact));

  const domain = model.modelProto.variables?.[x.index]?.domain;
  assert(domain?.[0] === exact && domain[1] === exact, 'modelProto must preserve exact bigint bounds');
  assertThrows(
    RangeError,
    () => model.newIntVar(Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1),
    'unsafe number bounds',
  );
  assertThrows(RangeError, () => model.newConstant(1n << 63n), 'integer above signed int64');
  assertThrows(RangeError, () => model.newConstant(-(1n << 63n) - 1n), 'integer below signed int64');

  class CaptureSolution extends api.CpSolverSolutionCallback {
    observed: bigint | null = null;

    onSolutionCallback() {
      this.observed = this.value(x);
    }
  }

  const callback = new CaptureSolution();
  const solver = new api.CpSolver();
  const status = await solver.solve(model, {
    executor: executorForMode(mode),
    numWorkers: 1,
    solutionCallback: callback,
  });
  const solverStatus = solver.statusName(status);
  assert(solverStatus === 'OPTIMAL', `exact integer solve expected OPTIMAL, got ${solverStatus}`);
  assert(solver.value(x) === exact, 'solver.value() must return the exact bigint solution');
  assert(typeof solver.value(x) === 'bigint', 'integer solver values must use bigint');
  assert(callback.observed === exact, 'solution callbacks must preserve exact bigint values');
  return { solverStatus };
}

const sparseDomainParametersCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.sparse_domain_parameters',
  name: 'CP-SAT normalized sparse domains and digit-bearing solver parameters',
  solver: 'cp-sat',
  source: 'ortools/util/python/sorted_interval_list_test.py',
  tags: ['contract', 'high-level', 'domain', 'parameters'],
};

async function runSparseDomainParametersCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const Domain = api.Domain as any;
  const domain = Domain.fromIntervals([[8, 10], [1, 3], [2, 4], [6, 5]]);
  assert(JSON.stringify(domain.flatIntervals) === JSON.stringify([1, 4, 8, 10]), 'sparse domain must normalize before model construction');
  const model = new api.CpModel();
  const x = model.newIntVarFromDomain(domain, 'sparse');
  model.add(x.ge(5));
  model.minimize(x);
  const solver = new api.CpSolver();
  const status = await solver.solve(model, {
    executor: executorForMode(mode), numWorkers: 1,
    useTimetablingInNoOverlap2d: true,
    noOverlap2dBooleanRelationsLimit: 4,
    create1uipBooleanDuringIcr: true,
    subsolverParams: [{ name: 'default', useEnergeticReasoningInNoOverlap2d: true }],
  });
  const solverStatus = solver.statusName(status);
  assert(solverStatus === 'OPTIMAL', `sparse domain solve expected OPTIMAL, got ${solverStatus}`);
  assert(solver.value(x) === 8n, 'solver must preserve the sparse-domain hole after normalization');
  return { solverStatus };
}

const modelReuseCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.model_reuse',
  name: 'CP-SAT objective and hint clearing preserve live model reuse',
  solver: 'cp-sat',
  source: 'javascript/lib/cp_sat/high_level_api.ts',
  tags: ['contract', 'high-level', 'model-reuse'],
};

async function runModelReuseCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const model = new api.CpModel();
  const x = model.newIntVar(0, 2, 'x');
  const solver = new api.CpSolver();
  for (const objective of [x, x.times(0.5)]) {
    model.maximize(objective);
    const optimized = await solver.solve(model, { executor: executorForMode(mode), numWorkers: 1 });
    assert(solver.statusName(optimized) === 'OPTIMAL' && solver.value(x) === 2n, 'optimization must find x=2 before objective removal');
    model.clearObjective();
    class CollectSolutions extends api.CpSolverSolutionCallback {
      values = new Set<bigint>();
      onSolutionCallback() { this.values.add(this.value(x)); }
    }
    const callback = new CollectSolutions();
    const feasible = await solver.solve(model, {
      executor: executorForMode(mode), numWorkers: 1, enumerateAllSolutions: true, solutionCallback: callback,
    });
    assert(solver.statusName(feasible) === 'OPTIMAL', 'cleared objective must permit solution enumeration');
    assert(callback.values.size === 3 && callback.values.has(0n) && callback.values.has(1n) && callback.values.has(2n),
      'objective clearing must recover all feasible values, for integer and floating objectives');
  }

  const hinted = new api.CpModel();
  const y = hinted.newIntVar(0, 1, 'hinted');
  hinted.addHint(y, 1);
  const first = await solver.solve(hinted, { executor: executorForMode(mode), numWorkers: 1, fixVariablesToTheirHintedValue: true });
  assert(solver.statusName(first) === 'OPTIMAL' && solver.value(y) === 1n, 'initial fixed hint must select y=1');
  hinted.clearHints();
  hinted.add(y.eq(0));
  const next = await solver.solve(hinted, { executor: executorForMode(mode), numWorkers: 1, fixVariablesToTheirHintedValue: true });
  assert(solver.statusName(next) === 'OPTIMAL' && solver.value(y) === 0n, 'cleared hint must not make the reused model infeasible');
  return { solverStatus: solver.statusName(next) };
}

const linearDomainCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.linear_domain',
  name: 'CP-SAT sparse expression domains, offsets and constant infeasibility',
  solver: 'cp-sat',
  source: 'ortools/sat/python/cp_model.py',
  tags: ['contract', 'high-level', 'domain'],
};

async function runLinearDomainCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const Domain = api.Domain as any;
  const model = new api.CpModel();
  const x = model.newIntVar(0, 10, 'x');
  model.addLinearExpressionInDomain(x.plus(3), Domain.fromValues([4, 11]));
  model.maximize(x);
  const solver = new api.CpSolver();
  const optimized = await solver.solve(model, { executor: executorForMode(mode), numWorkers: 1 });
  assert(solver.statusName(optimized) === 'OPTIMAL' && solver.value(x) === 8n, 'sparse expression constraint must preserve holes and subtract its offset');
  model.addLinearExpressionInDomain(5, Domain.fromValues([4, 6]));
  const impossible = await solver.solve(model, { executor: executorForMode(mode), numWorkers: 1 });
  assert(solver.statusName(impossible) === 'INFEASIBLE', 'a constant in a domain hole must make the model infeasible');
  return { solverStatus: solver.statusName(impossible) };
}

const cancellationCase: SharedCaseMetadata = {
  id: 'cp_sat.high_level.abort_and_event_mask',
  name: 'CP-SAT native cancellation, event masks and solver reuse',
  solver: 'cp-sat',
  source: 'javascript/lib/cp_sat/high_level_api.ts',
  tags: ['contract', 'high-level', 'cancellation'],
};

async function runCancellationCase(api: HighLevelCpSatPackage, mode: ExecutorFixtureMode) {
  const model = new api.CpModel();
  for (let i = 0; i < 40; ++i) model.newBoolVar(`choice_${i}`);
  const solver = new api.CpSolver();
  const controller = new AbortController();
  let solutions = 0;
  const started = performance.now();
  try {
    await solver.solve(model, {
      executor: executorForMode(mode), numWorkers: 1, enumerateAllSolutions: true,
      maxTimeInSeconds: 20, signal: controller.signal,
      onEvent(event: any) { if (event.type === 'solution' && ++solutions === 3) controller.abort(); },
    });
    throw new Error('AbortSignal must reject the solve');
  } catch (error) {
    assert(error instanceof Error && error.name === 'AbortError', 'AbortSignal must preserve AbortError');
  }
  assert(solutions >= 3, 'abort must occur during native search');
  assert(performance.now() - started < 10000, 'native cancellation must stop before the search time limit');
  assert(solver.response === null, 'failed solve must not retain an earlier response');
  const next = new api.CpModel(); const x = next.newIntVar(0, 2, 'x'); next.maximize(x);
  let maskedSolutions = 0;
  const status = await solver.solve(next, {
    executor: executorForMode(mode), numWorkers: 1, eventMask: { solution: false },
    onEvent(event: any) { if (event.type === 'solution') ++maskedSolutions; },
  });
  assert(solver.statusName(status) === 'OPTIMAL' && solver.value(x) === 2n, 'reuse after abort must return current optimum');
  assert(maskedSolutions === 0, 'internal graceful-stop observer must respect the user event mask');
  let capacityRejected = false;
  try {
    const oversizedStatus = await solver.solve(next, { executor: executorForMode(mode), numWorkers: 1_000_000 });
    capacityRejected = solver.statusName(oversizedStatus) === 'MODEL_INVALID';
  } catch (error) {
    capacityRejected = mode === 'server' && /capacity|threads|workers/i.test(String(error));
    if (!capacityRejected) throw error;
  }
  assert(capacityRejected, 'worker requests exceeding runtime capacity must reject safely');
  const recoveredStatus = await solver.solve(next, { executor: executorForMode(mode), numWorkers: 1 });
  assert(solver.statusName(recoveredStatus) === 'OPTIMAL' && solver.value(x) === 2n,
    'runtime must remain usable after an excessive worker request');
  class StopConvenience extends api.CpSolverSolutionCallback {
    count = 0;
    onSolutionCallback() { if (++this.count === 3) this.stopSearch(); }
  }
  const callback = new StopConvenience();
  const convenience = api.CpSat as { solve(model: unknown, options: unknown): Promise<any> };
  const stopped = await convenience.solve(model, {
    executor: executorForMode(mode), numWorkers: 1, enumerateAllSolutions: true,
    maxTimeInSeconds: 20, solutionCallback: callback,
  });
  assert(stopped.hasSolution && solver.statusName(stopped.status) === 'FEASIBLE', 'CpSat.solve must honor callback stopSearch');
  assert(callback.count === 3, 'convenience solve must stop at requested solution count');
  return { solverStatus: solver.statusName(status) };
}

export async function runCpSatHighLevelContractCases(
  api: HighLevelCpSatPackage,
): Promise<CpSatHighLevelContractResult[]> {
  const results: CpSatHighLevelContractResult[] = [];
  for (const mode of executorFixtureModes) {
    if (mode === 'server') await assertServerExecutorIsRunning();
    const context = { mode, params: { numWorkers: 1 } };
    results.push(passedCase(reservoirCase, context, await runReservoirCase(api, mode)));
    results.push(passedCase(typescriptHelpersCase, context, await runTypescriptHelpersCase(api, mode)));
    results.push(passedCase(solverResultsCase, context, await runSolverResultsCase(api, mode)));
    results.push(passedCase(expressionSurfaceCase, context, await runExpressionSurfaceCase(api, mode)));
    results.push(passedCase(exactIntegersCase, context, await runExactIntegersCase(api, mode)));
    results.push(passedCase(sparseDomainParametersCase, context, await runSparseDomainParametersCase(api, mode)));
    results.push(passedCase(modelReuseCase, context, await runModelReuseCase(api, mode)));
    results.push(passedCase(linearDomainCase, context, await runLinearDomainCase(api, mode)));
    if (mode !== 'direct') results.push(passedCase(cancellationCase, context, await runCancellationCase(api, mode)));
  }
  return results;
}
