import { cpSatCases } from './cpsat_cases.ts';
import type {
  CpSatEvent,
  CpSatLike,
  CpSatSolveOptions,
  SolverResponse,
} from './cpsat_types.ts';
import { SolverJobState } from './cpsat_types.ts';
import {
  assertServerExecutorIsRunning,
  executorFixtureModes,
  passedCase,
  serverExecutorConfiguration,
  type ExecutorFixtureMode,
  type SharedCaseMetadata,
  type SharedCaseResult,
} from './shared_case.ts';

type CpSatPublicApi = CpSatLike & {
  solveRaw(model: Uint8Array, options?: {
    solverParameters?: Uint8Array | null;
    onEvent?: CpSatSolveOptions['onEvent'];
    signal?: AbortSignal;
  }): Promise<Uint8Array>;
  getSchemas(): Promise<unknown>;
  loadModule(): Promise<unknown>;
};

type CpSatPackageApi = {
  CpSat?: Partial<CpSatPublicApi> | null;
};

type SolverStructureMode = 'auto' | ExecutorFixtureMode;

export type CpSatSolverStructureResult = SharedCaseResult<ExecutorFixtureMode> & {
  executor?: SolverStructureMode;
  publicMethods?: string[];
  solverStatus?: unknown;
  statusStates?: number[];
  responseBytesLength?: number;
};

const packageContractCase: SharedCaseMetadata = {
  id: 'cp_sat.solver_structure.package_contract',
  name: 'CP-SAT package exposes shared solver structure',
  solver: 'cp-sat',
  tags: ['contract', 'executor-structure'],
};

function solveCase(mode: SolverStructureMode): SharedCaseMetadata {
  return {
    id: `cp_sat.solver_structure.solve_${mode}`,
    name: `CP-SAT shared solver structure solve (${mode})`,
    solver: 'cp-sat',
    tags: ['contract', 'executor-structure', mode],
  };
}

function assertFunction(value: unknown, name: string): asserts value is (...args: any[]) => unknown {
  if (typeof value !== 'function') {
    throw new Error(`CP-SAT package contract expected ${name} to be a function`);
  }
}

function cpSatFromPackage(api: CpSatPackageApi): CpSatPublicApi {
  const cpSat = api.CpSat;
  if (!cpSat || typeof cpSat !== 'object') {
    throw new Error('CP-SAT package contract expected CpSat export to be an object');
  }

  const methods = [
    'createModel',
    'getSchemas',
    'loadModule',
    'modelStats',
    'setExecutor',
    'solve',
    'solveRaw',
    'validate',
  ] as const;
  for (const method of methods) {
    assertFunction(cpSat[method], `CpSat.${method}`);
  }

  return cpSat as CpSatPublicApi;
}

async function runSolveContract(CpSat: CpSatPublicApi, mode: SolverStructureMode) {
  const events: CpSatEvent[] = [];
  const smokeCase = cpSatCases[0];
  const modelBytes = await CpSat.createModel(smokeCase.model);
  const validation = await CpSat.validate(modelBytes);
  if (!validation.ok) {
    throw new Error(`CP-SAT shared solver structure validation failed: ${validation.message}`);
  }

  if (mode === 'server') {
    await assertServerExecutorIsRunning();
    CpSat.setExecutor(serverExecutorConfiguration());
  } else if (mode !== 'auto') {
    CpSat.setExecutor({ type: mode });
  }
  try {
    const result = await CpSat.solve(modelBytes, {
      solverParameters: { numSearchWorkers: 1 },
      onEvent: (event) => events.push(event),
    });
    assertResponse(result.response, mode);
    if (result.bytes.length === 0) {
      throw new Error(`CP-SAT shared solver structure solve (${mode}) returned empty response bytes`);
    }
    const rawBytes = await CpSat.solveRaw(modelBytes, { solverParameters: null });
    if (rawBytes.length === 0) {
      throw new Error(`CP-SAT shared solver structure solveRaw (${mode}) returned empty response bytes`);
    }
    const statusStates = events
      .filter((event): event is Extract<CpSatEvent, { type: 'status' }> => event.type === 'status')
      .map((event) => event.status.state);
    assertStatusEvents(statusStates, mode);
    return {
      executor: mode,
      solverStatus: result.response?.status,
      statusStates,
      responseBytesLength: result.bytes.length,
    };
  } finally {
    CpSat.setExecutor({ type: 'auto' });
  }
}

function assertResponse(response: SolverResponse | null, mode: SolverStructureMode) {
  if (!response) {
    throw new Error(`CP-SAT shared solver structure solve (${mode}) returned no decoded response`);
  }
  if (response.status !== 'OPTIMAL') {
    throw new Error(`CP-SAT shared solver structure solve (${mode}) expected OPTIMAL, got ${String(response.status)}`);
  }
}

function assertStatusEvents(statusStates: number[], mode: SolverStructureMode) {
  if (!statusStates.includes(SolverJobState.STARTING)) {
    throw new Error(`CP-SAT shared solver structure solve (${mode}) did not emit STARTING status`);
  }
  if (!statusStates.includes(SolverJobState.RUNNING)) {
    throw new Error(`CP-SAT shared solver structure solve (${mode}) did not emit RUNNING status`);
  }
  if (!statusStates.includes(SolverJobState.SUCCEEDED)) {
    throw new Error(`CP-SAT shared solver structure solve (${mode}) did not emit SUCCEEDED status`);
  }
}

export async function runCpSatSolverStructureCases(api: CpSatPackageApi): Promise<CpSatSolverStructureResult[]> {
  const CpSat = cpSatFromPackage(api);
  const results: CpSatSolverStructureResult[] = [
    passedCase(packageContractCase, {}, {
      publicMethods: [
        'createModel',
        'getSchemas',
        'loadModule',
        'modelStats',
        'setExecutor',
        'solve',
        'solveRaw',
        'validate',
      ],
    }),
  ];

  for (const mode of ['auto', ...executorFixtureModes] as const) {
    const result = await runSolveContract(CpSat, mode);
    const context = mode === 'auto' ? { params: { executor: mode } } : { mode };
    results.push(passedCase(solveCase(mode), context, result));
  }

  CpSat.setExecutor({ type: 'auto' });
  return results;
}
