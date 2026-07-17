import type { ExecutorFixtureMode, SharedCase, SharedCaseResult } from './shared_case.ts';
import {
  assertServerExecutorIsRunning,
  fixtureModes,
  passedCase,
  serverExecutorConfiguration,
  solverJobStates,
} from './shared_case.ts';

export type RcpspCaseResult = {
  id: string;
  name: string;
  solver: string;
  source?: string;
  upstream?: string;
  tags?: string[];
  mode?: ExecutorFixtureMode;
  ok: boolean;
  makespan: number | null;
  statusName?: string;
} & SharedCaseResult<ExecutorFixtureMode>;

type RcpspEventLike =
  | { type: 'status'; status: { state: number } }
  | { type: 'failure'; failure: { message: string } }
  | { type: 'solution'; makespan: number; tasks: Array<{ name: string; start: number; end: number }> }
  | { type: 'bestBound'; bound: number }
  | { type: 'log'; message: string };

type RcpspProblemProtoLike = {
  resources?: unknown[];
  tasks?: unknown[];
  horizon?: number;
};

type RcpspParserLike = {
  parse_string(text: string): boolean;
  problem(): RcpspProblemProtoLike;
};

type RcpspProblemLike = {
  export_model_as_proto(): RcpspProblemProtoLike;
  to_cp_sat_model(): { proto(): { constraints?: unknown[] } };
  solve(params?: unknown, options?: {
    onEvent?(event: RcpspEventLike): void | Promise<void>;
    eventMask?: { solution?: boolean; bestBound?: boolean; log?: boolean };
    signal?: AbortSignal;
  }): Promise<{
    makespan: number | null;
    statusName: string;
    tasks: Array<{ name: string; start: number; end: number; demands: number[]; successors: number[] }>;
  }>;
};

type RcpspModelBuilderLike = {
  add_resource(input: { name: string; capacity: number; renewable?: boolean }): RcpspModelBuilderLike;
  add_activity(input: { name: string; duration: number; demands?: Record<string, number>; successors?: string[] }): RcpspModelBuilderLike;
  build(): RcpspProblemLike;
};

export type RcpspApi = {
  initRcpsp(): Promise<void>;
  RcpspParser: { new(): RcpspParserLike };
  RcpspProblem: {
    from_psplib(text: string): RcpspProblemLike;
    from_proto(proto: RcpspProblemProtoLike): RcpspProblemLike;
  };
  RcpspModelBuilder: { new(name?: string): RcpspModelBuilderLike };
  setExecutor(configuration:
    | { type: 'auto' | 'direct' | 'worker' }
    | { type: 'server'; host: string; authToken?: string; statusIntervalMs?: number }
  ): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const J301_1_SM = `************************************************************************
file with basedata            : j30_17.bas
initial value random generator: 28123
************************************************************************
projects                      :  1
jobs (incl. supersource/sink ):  32
horizon                       :  158
RESOURCES
  - renewable                 :  4   R
  - nonrenewable              :  0   N
  - doubly constrained        :  0   D
************************************************************************
PROJECT INFORMATION:
pronr.  #jobs rel.date duedate tardcost  MPM-Time
    1     30      0       38       26       38
************************************************************************
PRECEDENCE RELATIONS:
jobnr.    #modes  #successors   successors
   1        1          3           2   3   4
   2        1          3           6  11  15
   3        1          3           7   8  13
   4        1          3           5   9  10
   5        1          1          20
   6        1          1          30
   7        1          1          27
   8        1          3          12  19  27
   9        1          1          14
  10        1          2          16  25
  11        1          2          20  26
  12        1          1          14
  13        1          2          17  18
  14        1          1          17
  15        1          1          25
  16        1          2          21  22
  17        1          1          22
  18        1          2          20  22
  19        1          2          24  29
  20        1          2          23  25
  21        1          1          28
  22        1          1          23
  23        1          1          24
  24        1          1          30
  25        1          1          30
  26        1          1          31
  27        1          1          28
  28        1          1          31
  29        1          1          32
  30        1          1          32
  31        1          1          32
  32        1          0
************************************************************************
REQUESTS/DURATIONS:
jobnr. mode duration  R 1  R 2  R 3  R 4
------------------------------------------------------------------------
  1      1     0       0    0    0    0
  2      1     8       4    0    0    0
  3      1     4      10    0    0    0
  4      1     6       0    0    0    3
  5      1     3       3    0    0    0
  6      1     8       0    0    0    8
  7      1     5       4    0    0    0
  8      1     9       0    1    0    0
  9      1     2       6    0    0    0
 10      1     7       0    0    0    1
 11      1     9       0    5    0    0
 12      1     2       0    7    0    0
 13      1     6       4    0    0    0
 14      1     3       0    8    0    0
 15      1     9       3    0    0    0
 16      1    10       0    0    0    5
 17      1     6       0    0    0    8
 18      1     5       0    0    0    7
 19      1     3       0    1    0    0
 20      1     7       0   10    0    0
 21      1     2       0    0    0    6
 22      1     7       2    0    0    0
 23      1     2       3    0    0    0
 24      1     3       0    9    0    0
 25      1     3       4    0    0    0
 26      1     7       0    0    4    0
 27      1     8       0    0    0    7
 28      1     3       0    8    0    0
 29      1     7       0    7    0    0
 30      1     2       0    7    0    0
 31      1     2       0    0    2    0
 32      1     0       0    0    0    0
************************************************************************
RESOURCEAVAILABILITIES:
  R 1  R 2  R 3  R 4
   12   13    4   12
************************************************************************`;

async function runParserParity(api: RcpspApi): Promise<{ makespan: null }> {
  // TEMP: parity - mirrors ortools/scheduling/python/rcpsp_test.py
  // RcpspTest.testParseAndAccess assertion-by-assertion, using parse_string()
  // because browser fixtures do not expose Python's filesystem parse_file path.
  const parser = new api.RcpspParser();
  assert(parser.parse_string(J301_1_SM), 'RcpspTest.testParseAndAccess parse_string');
  const problem = parser.problem();
  assert(problem.resources?.length === 4, 'RcpspTest.testParseAndAccess resources length');
  assert(problem.tasks?.length === 32, 'RcpspTest.testParseAndAccess tasks length');
  return { makespan: null };
}

async function runCpSatBackedSchedule(api: RcpspApi, mode: ExecutorFixtureMode): Promise<{ makespan: number | null; statusName: string }> {
  const problem = new api.RcpspModelBuilder('house_project')
    .add_resource({ name: 'crew', capacity: 3 })
    .add_activity({ name: 'site', duration: 3, demands: { crew: 2 }, successors: ['frame'] })
    .add_activity({ name: 'permit', duration: 2, demands: { crew: 1 }, successors: ['wire'] })
    .add_activity({ name: 'frame', duration: 4, demands: { crew: 2 }, successors: ['inspect'] })
    .add_activity({ name: 'wire', duration: 2, demands: { crew: 1 }, successors: ['inspect'] })
    .add_activity({ name: 'inspect', duration: 1, demands: { crew: 1 } })
    .build();
  const proto = problem.export_model_as_proto();
  assert(proto.resources?.length === 1, `RCPSP CP-SAT sample (${mode}) resources length`);
  assert(proto.tasks?.length === 7, `RCPSP CP-SAT sample (${mode}) source/tasks/sink length`);
  assert((problem.to_cp_sat_model().proto().constraints ?? []).length > 0, `RCPSP CP-SAT sample (${mode}) generated constraints`);
  const events: RcpspEventLike[] = [];
  const result = await problem.solve({ numWorkers: 1, maxTimeInSeconds: 5 }, {
    eventMask: { solution: true, bestBound: true },
    onEvent: (event) => {
      events.push(event);
    },
  });
  assert(result.statusName === 'OPTIMAL' || result.statusName === 'FEASIBLE', `RCPSP CP-SAT sample (${mode}) status ${result.statusName}`);
  assert(result.makespan === 8, `RCPSP CP-SAT sample (${mode}) expected makespan 8, got ${result.makespan}`);
  const byName = new Map(result.tasks.map((task) => [task.name, task]));
  assert(byName.get('site')?.start === 0, `RCPSP CP-SAT sample (${mode}) site start`);
  assert(byName.get('frame')?.start === 3, `RCPSP CP-SAT sample (${mode}) frame start`);
  assert(byName.get('inspect')?.end === 8, `RCPSP CP-SAT sample (${mode}) inspect end`);
  const states = events.flatMap((event) => event.type === 'status' ? [event.status.state] : []);
  assert(states.includes(solverJobStates.RUNNING), `RCPSP CP-SAT sample (${mode}) missing RUNNING status`);
  assert(states.includes(solverJobStates.SUCCEEDED), `RCPSP CP-SAT sample (${mode}) missing SUCCEEDED status`);
  const solution = events.find((event) => event.type === 'solution');
  assert(solution?.type === 'solution', `RCPSP CP-SAT sample (${mode}) missing semantic solution event`);
  assert(solution.makespan === 8, `RCPSP CP-SAT sample (${mode}) event makespan`);
  assert(solution.tasks.some((task) => task.name === 'inspect' && task.end === 8), `RCPSP CP-SAT sample (${mode}) event schedule`);
  const controller = new AbortController();
  controller.abort();
  let cancellation: unknown = null;
  try {
    await problem.solve({ numWorkers: 1 }, { signal: controller.signal });
  } catch (error) {
    cancellation = error;
  }
  assert(cancellation instanceof Error && cancellation.name === 'AbortError', `RCPSP CP-SAT sample (${mode}) AbortSignal cancellation`);
  return { makespan: result.makespan, statusName: result.statusName };
}

type RcpspCase = SharedCase<RcpspApi, { makespan: number | null; statusName?: string }, ExecutorFixtureMode>;

export const rcpspCases: RcpspCase[] = [
  {
    id: 'rcpsp.rcpsp_test.test_parse_and_access',
    name: 'RcpspTest.testParseAndAccess',
    solver: 'rcpsp',
    source: 'ortools/scheduling/python/rcpsp_test.py',
    upstream: 'RcpspTest.testParseAndAccess',
    tags: ['python-parity', 'parser'],
    run: (api) => runParserParity(api),
  },
  {
    id: 'rcpsp.sample.house_project_cp_sat',
    name: 'RcpspCpSatSample.house_project',
    solver: 'rcpsp',
    tags: ['contract', 'cp-sat-backed', 'events'],
    run: (api, context) => runCpSatBackedSchedule(api, context.mode ?? 'direct'),
  },
];

export async function runRcpspCases(
  api: RcpspApi,
  options: { modes?: readonly ExecutorFixtureMode[] } = {},
): Promise<RcpspCaseResult[]> {
  await api.initRcpsp();
  const results: RcpspCaseResult[] = [];
  const parserCase = rcpspCases[0];
  results.push(passedCase(parserCase, {}, await parserCase.run(api, {})));
  const modes = options.modes ?? fixtureModes;
  if (modes.includes('server')) await assertServerExecutorIsRunning();
  const solveCase = rcpspCases[1];
  for (const mode of modes) {
    api.setExecutor(mode === 'server' ? serverExecutorConfiguration() : { type: mode });
    try {
      const context = { mode };
      const result = await solveCase.run(api, context);
      results.push(passedCase({ ...solveCase, name: `${solveCase.name} (${mode})` }, context, result));
    } finally {
      api.setExecutor({ type: 'auto' });
    }
  }
  return results;
}
