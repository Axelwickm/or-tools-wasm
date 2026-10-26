import * as CpSat from 'cp-sat-wasm';
import * as Routing from 'routing-wasm';
import { runCpSatHighLevelParityCasesForPackage } from '../../cases/python-parity/cp_sat/high_level_runner.ts';
import { runCpSatCases } from '../../cases/python-parity/cp_sat/runner.ts';
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { runRoutingCases } from '../../cases/python-parity/routing/runner.ts';
import { runRoutingControlCases } from '../../cases/or-tools-wasm/routing/controls.ts';
import { runRoutingWorkerLifecycleCase } from '../../cases/or-tools-wasm/routing/worker_lifecycle.ts';

function assertCases(results: Array<{ ok: boolean }>) {
  for (const result of results) {
    if (!result.ok) throw new Error(`Case failed: ${JSON.stringify(result)}`);
  }
  return results.length;
}

export async function runCases(solver: string) {
  if (solver !== 'cp-sat' && solver !== 'routing') throw new Error(`Unknown solver: ${solver}`);
  try {
    if (solver === 'cp-sat') {
      await runCpSatWorkerLifecycleCase(CpSat.CpSat as never);
      const highLevel = assertCases(await runCpSatHighLevelParityCasesForPackage(CpSat));
      const profiles = await runCpSatCases(CpSat.CpSat as never);
      const proto = profiles.reduce((count, profile) => count + assertCases(profile.cases), 0);
      return { highLevel, proto };
    }
    await runRoutingWorkerLifecycleCase(Routing as never);
    await runRoutingControlCases(Routing as never);
    return { routing: assertCases(await runRoutingCases(Routing as never)) };
  } finally {
    await CpSat.terminateLoadedRuntimeThreads();
    await Routing.terminateLoadedRuntimeThreads();
  }
}
