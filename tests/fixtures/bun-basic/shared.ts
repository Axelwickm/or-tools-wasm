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
  let exitCode = 0;
  try {
    await run();
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    try {
      await cleanup?.();
    } catch (error) {
      exitCode = 1;
      console.error(error);
    }
  }
  process.exit(exitCode);
}
