import {
  withCpSatExecutor,
  type CpSatLike,
  type ProtoInt64,
} from '../../../harness/cpsat_types.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
} from '../../../harness/shared_case.ts';

type SubsolverCase = 'no_lp' | 'parallel_portfolio';

type RunOptions = {
  cases?: SubsolverCase[];
};

const MODEL = {
  variables: [
    { name: 'x', domain: [-10, 10] },
    { name: 'y', domain: [-10, 10] },
    { name: 'objective', domain: [-1000, 1000] },
  ],
  constraints: [{
    linear: {
      vars: [0, 1, 2],
      coeffs: [1, 2, -1],
      domain: [0, 0],
    },
  }],
  objective: {
    vars: [2],
    coeffs: [-1],
    scalingFactor: -1,
  },
};

const BASE_PARAMETERS = {
  cpModelPresolve: false,
  logSearchProgress: true,
  logToResponse: true,
  logToStdout: false,
  maxTimeInSeconds: 5,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isZero(value: ProtoInt64 | undefined) {
  if (typeof value === 'object') {
    return value.low === 0 && value.high === 0;
  }
  return Number(value) === 0;
}

async function solve(CpSat: CpSatLike, solverParameters: Record<string, unknown>) {
  const model = await CpSat.createModel(MODEL);
  const result = await CpSat.solve(model, {
    ...BASE_PARAMETERS,
    ...solverParameters,
  });
  assert(result.response, 'CP-SAT execution semantics test returned no response');
  return result.response;
}

async function runNoLpCase(CpSat: CpSatLike, mode: ExecutorFixtureMode) {
  const response = await solve(CpSat, {
    filterSubsolvers: ['no_lp'],
    numWorkers: 1,
  });
  assert(
    response.solveLog?.includes('1 full problem subsolver: [no_lp]'),
    `CP-SAT no_lp selection (${mode}) did not run no_lp:\n${response.solveLog ?? '<missing solve log>'}`,
  );
  assert(
    isZero(response.numLpIterations),
    `CP-SAT no_lp selection (${mode}) performed ${String(response.numLpIterations)} LP iterations`,
  );

  return {
    id: 'cp_sat.execution_semantics.selects_no_lp',
    name: `CP-SAT selects the no_lp subsolver (${mode})`,
    solver: 'cp-sat',
    tags: ['execution-semantics', 'subsolver'],
    mode,
    searchWorkers: 1,
    selectedSubsolvers: ['no_lp'],
    numLpIterations: 0,
    ok: true,
  };
}

async function runParallelPortfolioCase(CpSat: CpSatLike, mode: ExecutorFixtureMode) {
  const response = await solve(CpSat, {
    numWorkers: 4,
    randomSeed: 1,
  });
  const solveLog = response.solveLog ?? '';
  assert(
    /Starting search at .* with 4 workers\./.test(solveLog),
    `CP-SAT parallel portfolio (${mode}) did not start four workers:\n${solveLog}`,
  );
  const subsolverMatch = solveLog.match(/(\d+) full problem subsolvers: \[([^\]]+)\]/);
  assert(
    subsolverMatch && Number(subsolverMatch[1]) > 1,
    `CP-SAT parallel portfolio (${mode}) did not select multiple full problem subsolvers:\n${solveLog}`,
  );
  const selectedSubsolvers = subsolverMatch[2].split(',').map((name) => name.trim());
  assert(
    selectedSubsolvers.length === Number(subsolverMatch[1]),
    `CP-SAT parallel portfolio (${mode}) reported an inconsistent subsolver count`,
  );

  return {
    id: 'cp_sat.execution_semantics.uses_parallel_portfolio',
    name: `CP-SAT uses its parallel portfolio (${mode})`,
    solver: 'cp-sat',
    tags: ['execution-semantics', 'parallel', 'subsolver'],
    mode,
    searchWorkers: 4,
    selectedSubsolvers,
    ok: true,
  };
}

export async function runCpSatSubsolverCases(CpSat: CpSatLike, options: RunOptions = {}) {
  const cases = options.cases ?? ['no_lp', 'parallel_portfolio'];
  const results = [];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server'
      ? serverExecutorConfiguration()
      : mode;
    if (mode === 'server') {
      await assertServerExecutorIsRunning();
    }
    const scopedCpSat = withCpSatExecutor(CpSat, executor);
    for (const testCase of cases) {
      results.push(testCase === 'no_lp'
        ? await runNoLpCase(scopedCpSat, mode)
        : await runParallelPortfolioCase(scopedCpSat, mode));
    }
  }
  return results;
}
