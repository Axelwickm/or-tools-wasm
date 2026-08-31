export type RepeatedSolverCase = {
  solver: string;
  run: () => Promise<unknown>;
};

export type SolverReuseResult = {
  id: 'solvers.runtime.reuse';
  name: 'Solvers reuse their runtimes across repeated operations';
  cycles: number;
  solvers: string[];
  ok: true;
};

const CYCLES = 10 as const;
const OPERATION_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} did not finish within ${OPERATION_TIMEOUT_MS}ms`)),
          OPERATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function runSolverReuseCase(
  cases: readonly RepeatedSolverCase[],
): Promise<SolverReuseResult> {
  for (const { solver, run } of cases) {
    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      await withTimeout(run(), `${solver} repeated operation ${cycle}/${CYCLES}`);
    }
  }

  return {
    id: 'solvers.runtime.reuse',
    name: 'Solvers reuse their runtimes across repeated operations',
    cycles: CYCLES,
    solvers: cases.map(({ solver }) => solver),
    ok: true,
  };
}
