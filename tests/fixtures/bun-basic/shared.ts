export type NamedCaseResult = {
  id?: string;
  name?: string;
  ok?: boolean;
};

export function caseLabel(result: NamedCaseResult) {
  return result.id ?? result.name ?? '<unnamed case>';
}

export function assertAllCases(runtime: string, results: NamedCaseResult[]) {
  const failed = results.find((result) => result.ok !== true);
  if (failed) {
    throw new Error(`${runtime} case failed: ${caseLabel(failed)} ${JSON.stringify(failed)}`);
  }
}

export async function runBunFixture(run: () => Promise<void>, cleanup?: () => Promise<void> | void) {
  let runError: unknown;
  try {
    await run();
  } catch (error) {
    runError = error;
  }

  try {
    await cleanup?.();
  } catch (cleanupError) {
    if (runError !== undefined) console.error(runError);
    throw cleanupError;
  }

  if (runError !== undefined) throw runError;
}
