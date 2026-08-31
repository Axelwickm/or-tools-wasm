type ExecutorMode = 'direct' | 'worker';

type CpSatThreadReuseApi = {
  createModel(model: object): Promise<Uint8Array>;
  solve(
    model: Uint8Array,
    options: {
      executor: ExecutorMode;
      numWorkers: number;
      cpModelPresolve: false;
      maxTimeInSeconds: number;
    },
  ): Promise<{ bytes: Uint8Array }>;
};

export type CpSatThreadReuseResult = {
  id: 'cp_sat.threads.reused';
  name: 'CP-SAT reuses its pthread pool across repeated solves';
  solver: 'cp-sat';
  cycles: number;
  solves: number;
  ok: true;
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

const CYCLES = 25 as const;
const SOLVE_TIMEOUT_MS = 10_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} did not finish within ${SOLVE_TIMEOUT_MS}ms`)),
          SOLVE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function runCpSatThreadReuseCase(
  CpSat: CpSatThreadReuseApi,
): Promise<CpSatThreadReuseResult> {
  const model = await CpSat.createModel(MODEL);

  for (const executor of ['direct', 'worker'] as const) {
    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      for (const numWorkers of [1, 4]) {
        const label = `CP-SAT ${executor} solve ${cycle}/${CYCLES} with ${numWorkers} workers`;
        const result = await withTimeout(CpSat.solve(model, {
          executor,
          numWorkers,
          cpModelPresolve: false,
          maxTimeInSeconds: 5,
        }), label);
        assert(result.bytes.length > 0, `${label} returned an empty response`);
      }
    }
  }

  return {
    id: 'cp_sat.threads.reused',
    name: 'CP-SAT reuses its pthread pool across repeated solves',
    solver: 'cp-sat',
    cycles: CYCLES,
    solves: CYCLES * 2 * 2,
    ok: true,
  };
}
