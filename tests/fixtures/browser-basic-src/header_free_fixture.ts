import { runCloudExecutorCase } from '../../cases/or-tools-wasm/cloud_executor.ts';
import { runSolverConcurrencyCase } from '../../cases/or-tools-wasm/solver_concurrency.ts';
import { runCpSatSubsolverCases } from '../../cases/or-tools-wasm/cp_sat/subsolver.ts';
import { runCpSatHighLevelContractCases } from '../../cases/or-tools-wasm/cp_sat/high_level_contract.ts';
import { runCpSatWorkerLifecycleCase } from '../../cases/or-tools-wasm/cp_sat/worker_lifecycle.ts';
import { runRcpspEventHandlerCase } from '../../cases/or-tools-wasm/rcpsp/event_handler.ts';
import { runRcpspWorkerLifecycleCase } from '../../cases/or-tools-wasm/rcpsp/worker_lifecycle.ts';
import { runRcpspConcurrencyCase } from '../../cases/or-tools-wasm/rcpsp/concurrency.ts';
import { runSetCoverEventHandlerCase } from '../../cases/or-tools-wasm/set_cover/event_handler.ts';
import { runSetCoverWorkerLifecycleCase } from '../../cases/or-tools-wasm/set_cover/worker_lifecycle.ts';
import { runSetCoverConcurrencyCase } from '../../cases/or-tools-wasm/set_cover/concurrency.ts';
import { runNetworkFlowEventHandlerCase } from '../../cases/or-tools-wasm/network_flow/event_handler.ts';
import { runNetworkFlowWorkerLifecycleCase } from '../../cases/or-tools-wasm/network_flow/worker_lifecycle.ts';
import { runNetworkFlowConcurrencyCase } from '../../cases/or-tools-wasm/network_flow/concurrency.ts';
import { runKnapsackEventHandlerCase } from '../../cases/or-tools-wasm/knapsack/event_handler.ts';
import { runKnapsackWorkerLifecycleCase } from '../../cases/or-tools-wasm/knapsack/worker_lifecycle.ts';
import { runKnapsackConcurrencyCase } from '../../cases/or-tools-wasm/knapsack/concurrency.ts';
import { runMpSolverWorkerLifecycleCase } from '../../cases/or-tools-wasm/mp_solver/worker_lifecycle.ts';
import { runMpSolverConcurrencyCase } from '../../cases/or-tools-wasm/mp_solver/concurrency.ts';
import { runRoutingWorkerLifecycleCase } from '../../cases/or-tools-wasm/routing/worker_lifecycle.ts';
import { runRoutingConcurrencyCase } from '../../cases/or-tools-wasm/routing/concurrency.ts';
import { runCpSatConcurrencyCase } from '../../cases/or-tools-wasm/cp_sat/concurrency.ts';
import { runCpSatStatisticsCases } from '../../cases/or-tools-wasm/cp_sat/statistics.ts';
import { runCpSatModelExportCases } from '../../cases/or-tools-wasm/cp_sat/model_export.ts';
import { runCpSatMutationCases } from '../../cases/or-tools-wasm/cp_sat/mutation.ts';
import { runCpSatExpressionHelperCases } from '../../cases/or-tools-wasm/cp_sat/expression_helpers.ts';
import { runCpSatSolverStructureCases } from '../../cases/or-tools-wasm/cp_sat/solver_structure.ts';
import { runRoutingControlCases } from '../../cases/or-tools-wasm/routing/controls.ts';
import { runMpSolverProtoValidationCases } from '../../cases/or-tools-wasm/mp_solver/proto_validation.ts';
import { runMpSolverModelImportCases } from '../../cases/or-tools-wasm/mp_solver/model_import.ts';
import { runMpSolverModelValidationCases } from '../../cases/or-tools-wasm/mp_solver/model_validation.ts';
import { runMpSolverModelReuseCases } from '../../cases/or-tools-wasm/mp_solver/model_reuse.ts';
import { runRcpspModelCorrectnessCases } from '../../cases/or-tools-wasm/rcpsp/model_correctness.ts';
import { runMathOptIndicatorCases } from '../../cases/or-tools-wasm/mathopt/indicators.ts';
import { runMathOptCallbackCases } from '../../cases/or-tools-wasm/mathopt/callbacks.ts';
import { runMathOptModelImportCases } from '../../cases/or-tools-wasm/mathopt/model_import.ts';
import { runMathOptMpsCases } from '../../cases/or-tools-wasm/mathopt/mps.ts';
import { runMathOptAdmissionCases } from '../../cases/or-tools-wasm/mathopt/admission.ts';
import { runPdlpControlCases } from '../../cases/or-tools-wasm/pdlp/controls.ts';
import type { BrowserFixtureApis } from './browser_fixture_main.ts';
import { cpSatCases } from '../../cases/python-parity/cp_sat/cases.ts';
import { cpSatHighLevelParityCases, cpSatHighLevelApiFromPackage } from '../../cases/python-parity/cp_sat/high_level_runner.ts';
import { withCpSatExecutor } from '../../harness/cpsat_types.ts';
import { routingContractCases } from '../../cases/python-parity/routing/index.ts';
import { setRoutingMode } from '../../cases/python-parity/routing/execution.ts';
import { mpSolverCases, setMPSolverMode } from '../../cases/python-parity/linear_solver/index.ts';
import { knapsackCases } from '../../cases/python-parity/knapsack/index.ts';
import { setKnapsackMode } from '../../cases/python-parity/knapsack/execution.ts';
import { networkFlowCases } from '../../cases/python-parity/network_flow/index.ts';
import { setNetworkFlowMode } from '../../cases/python-parity/network_flow/execution.ts';
import { setCoverCases } from '../../cases/python-parity/set_cover/index.ts';
import { setSetCoverMode } from '../../cases/python-parity/set_cover/execution.ts';
import { rcpspCases } from '../../cases/python-parity/rcpsp/index.ts';
import { pdlpCases, withPdlpExecutor } from '../../cases/python-parity/pdlp/index.ts';
import { mathOptBackendCases, activeSolveResultCases, withMathOptExecutor } from '../../cases/python-parity/mathopt/runner.ts';
import { mathOptExpressionContractCases } from '../../cases/python-parity/mathopt/mathopt_expression_contract.ts';
import { mathOptModelContractCases } from '../../cases/python-parity/mathopt/mathopt_model_contract.ts';
import { solveResultCases } from '../../cases/or-tools-wasm/solve_results.ts';

type Case = { name: string; run(): unknown };
type Result = { name: string; mode: string; outcome: 'passed' | 'unsupported' | 'skipped' | 'failed'; reason?: string };

// These are explicit capability rejections, not permission to ignore solver errors.
const unsupportedCapability = /Worker callbacks require cross-origin isolation\.|Native interruption requires COOP\/COEP headers\./;

export async function runHeaderFreeFixture(apis: BrowserFixtureApis) {
  const status = document.getElementById('status')!;
  if (crossOriginIsolated || typeof SharedArrayBuffer !== 'undefined') throw new Error('Expected a header-free browser');
  const group = new URLSearchParams(location.search).get('group')!;
  const results: Result[] = [];
  for (const mode of (group === 'cp-sat-worker-lifecycle' ? ['worker'] as const : ['direct', 'worker'] as const)) {
    const context = { mode };
    const high = cpSatHighLevelApiFromPackage(apis.CpSatApi as never);
    high.setFixtureExecutor({ type: mode });
    const BaseSolver = high.CpSolver as new () => any;
    class SingleThreadSolver extends BaseSolver {
      constructor() { super(); this.parameters.numWorkers = 1; }
    }
    const highApi = { ...high, CpSolver: SingleThreadSolver };
    setRoutingMode(mode);
    setMPSolverMode(apis.MPSolverApi as never, mode);
    setKnapsackMode(mode);
    setNetworkFlowMode(mode);
    setSetCoverMode(mode);
    const pdlp = withPdlpExecutor(apis.PdlpApi as never, mode);
    const mathopt = withMathOptExecutor(apis.MathOptApi as never, mode);
    const cases: Case[] = group === 'cp-sat-worker-lifecycle'
      ? [{ name: 'runCpSatWorkerLifecycleCase', run: () => runCpSatWorkerLifecycleCase(apis.CpSatApi.CpSat as never) }]
      : group === 'cp-sat' ? [
      ...cpSatCases.map(c => ({ name: c.name, run: () => c.run(withCpSatExecutor(apis.CpSatApi.CpSat as never, mode), { numWorkers: 1 }) })),
      ...cpSatHighLevelParityCases.map(c => ({ name: c.name, run: () => c.run(highApi as never) })),
    ] : group === 'routing' ? routingContractCases.map(c => ({ name: c.name, run: () => c.run(apis.RoutingApiModule as never) }))
      : group === 'mp-solver' ? mpSolverCases(apis.MPSolverApi as never, { singleThread: true }).map(c => ({ name: c.name, run: () => c.run(mode) }))
      : group === 'knapsack' ? knapsackCases.map(c => ({ name: c.name, run: () => c.run(apis.KnapsackApi as never, context) }))
      : group === 'network-flow' ? networkFlowCases.map(c => ({ name: c.name, run: () => c.run(apis.NetworkFlowApi as never, context) }))
      : group === 'set-cover' ? setCoverCases.map(c => ({ name: c.name, run: () => c.run(apis.SetCoverApi as never, context) }))
      : group === 'rcpsp' ? rcpspCases.map(c => ({ name: c.name, run: () => c.run(apis.RcpspApi as never, context) }))
      : group === 'pdlp' ? pdlpCases.map(c => ({ name: c.name, run: () => c.run(pdlp, context) }))
      : group === 'mathopt' ? [
        ...mathOptBackendCases.map(c => ({ name: c.name, run: () => c.run(mathopt, mode, 1) })),
        ...activeSolveResultCases.map(c => ({ name: c.name, run: () => c.run(mathopt) })),
        ...mathOptExpressionContractCases.map(c => ({ name: c.name, run: () => c.run(mathopt) })),
        ...mathOptModelContractCases.map(c => ({ name: c.name, run: () => c.run(mathopt, 1) })),
      ] : [];
    if (!cases.length) throw new Error(`Unknown header-free fixture group: ${group}`);
    const resultApis = { cpSat: apis.CpSatApi, routing: apis.RoutingApiModule, mp: apis.MPSolverApi,
      knapsack: apis.KnapsackApi, flow: apis.NetworkFlowApi, cover: apis.SetCoverApi, mathopt: apis.MathOptApi };
    cases.push(...solveResultCases.filter(c => c.solver === group).map(c => ({
      name: c.id, run: () => c.run(resultApis as never, context),
    })));
    // These suites already cover both executor modes internally, so run once.
    if (mode === 'worker') {
      const supplemental: Record<string, Case[]> = {
        'set-cover': [
          { name: 'runSetCoverEventHandlerCase', run: () => runSetCoverEventHandlerCase(apis.SetCoverApi as never) },
          { name: 'runSetCoverWorkerLifecycleCase', run: () => runSetCoverWorkerLifecycleCase(apis.SetCoverApi as never) },
          { name: 'runSetCoverConcurrencyCase', run: () => runSetCoverConcurrencyCase(apis.SetCoverApi as never) },
        ],
        'network-flow': [
          { name: 'runNetworkFlowEventHandlerCase', run: () => runNetworkFlowEventHandlerCase(apis.NetworkFlowApi as never) },
          { name: 'runNetworkFlowWorkerLifecycleCase', run: () => runNetworkFlowWorkerLifecycleCase(apis.NetworkFlowApi as never) },
          { name: 'runNetworkFlowConcurrencyCase', run: () => runNetworkFlowConcurrencyCase(apis.NetworkFlowApi as never) },
        ],
        'knapsack': [
          { name: 'runKnapsackEventHandlerCase', run: () => runKnapsackEventHandlerCase(apis.KnapsackApi as never) },
          { name: 'runKnapsackWorkerLifecycleCase', run: () => runKnapsackWorkerLifecycleCase(apis.KnapsackApi as never) },
          { name: 'runKnapsackConcurrencyCase', run: () => runKnapsackConcurrencyCase(apis.KnapsackApi as never) },
        ],
        'cp-sat': [
          { name: 'runCpSatHighLevelContractCases', run: () => runCpSatHighLevelContractCases(apis.CpSatApi as never, { nativeInterruption: false }) },
          { name: 'runCpSatSubsolverCases', run: () => runCpSatSubsolverCases(apis.CpSatApi.CpSat as never, { cases: ['no_lp'] }) },
          { name: 'runCloudExecutorCase', run: () => runCloudExecutorCase(apis.CpSatApi as never, { packageName: apis.PackageApi.packageName, version: apis.PackageApi.version }) },
          { name: 'runCpSatConcurrencyCase', run: () => runCpSatConcurrencyCase(apis.CpSatApi as never) },
          { name: 'runCpSatStatisticsCases', run: () => runCpSatStatisticsCases(apis.CpSatApi as never) },
          { name: 'runCpSatModelExportCases', run: () => runCpSatModelExportCases(apis.CpSatApi as never) },
          { name: 'runCpSatMutationCases', run: () => runCpSatMutationCases(apis.CpSatApi as never) },
          { name: 'runCpSatExpressionHelperCases', run: () => runCpSatExpressionHelperCases(apis.CpSatApi as never) },
          { name: 'runCpSatSolverStructureCases', run: () => runCpSatSolverStructureCases(apis.CpSatApi as never) },
        ],
        'routing': [
          { name: 'runRoutingWorkerLifecycleCase', run: () => runRoutingWorkerLifecycleCase(apis.RoutingApiModule as never) },
          { name: 'runRoutingConcurrencyCase', run: () => runRoutingConcurrencyCase(apis.RoutingApiModule as never) },
          { name: 'runRoutingControlCases', run: () => runRoutingControlCases(apis.RoutingApiModule as never) },
        ],
        'mp-solver': [
          { name: 'runMpSolverWorkerLifecycleCase', run: () => runMpSolverWorkerLifecycleCase(apis.MPSolverApi as never) },
          { name: 'runMpSolverConcurrencyCase', run: () => runMpSolverConcurrencyCase(apis.MPSolverApi as never) },
          { name: 'runMpSolverProtoValidationCases', run: () => runMpSolverProtoValidationCases(apis.MPSolverApi as never) },
          { name: 'runMpSolverModelImportCases', run: () => runMpSolverModelImportCases(apis.MPSolverApi as never) },
          { name: 'runMpSolverModelValidationCases', run: () => runMpSolverModelValidationCases(apis.MPSolverApi as never) },
          { name: 'runMpSolverModelReuseCases', run: () => runMpSolverModelReuseCases(apis.MPSolverApi as never) },
        ],
        'rcpsp': [
          { name: 'runRcpspEventHandlerCase', run: () => runRcpspEventHandlerCase(apis.RcpspApi as never) },
          { name: 'runRcpspWorkerLifecycleCase', run: () => runRcpspWorkerLifecycleCase(apis.RcpspApi as never) },
          { name: 'runRcpspConcurrencyCase', run: () => runRcpspConcurrencyCase(apis.RcpspApi as never) },
          { name: 'runRcpspModelCorrectnessCases', run: () => runRcpspModelCorrectnessCases(apis.RcpspApi as never) },
        ],
        'mathopt': [
          { name: 'runSolverConcurrencyCase', run: () => runSolverConcurrencyCase(apis.MathOptApi as never, apis.PdlpApi as never) },
          { name: 'runMathOptIndicatorCases', run: () => runMathOptIndicatorCases(apis.MathOptApi as never) },
          { name: 'runMathOptCallbackCases', run: () => runMathOptCallbackCases(apis.MathOptApi as never) },
          { name: 'runMathOptModelImportCases', run: () => runMathOptModelImportCases(apis.MathOptApi as never) },
          { name: 'runMathOptMpsCases', run: () => runMathOptMpsCases(apis.MathOptApi as never) },
          { name: 'runMathOptAdmissionCases', run: () => runMathOptAdmissionCases(apis.MathOptApi as never) },
        ],
        'pdlp': [
          { name: 'runPdlpControlCases', run: () => runPdlpControlCases(apis.PdlpApi as never) },
        ],
      };
      cases.push(...(supplemental[group] ?? []));
    }
    for (const c of cases) {
      status.textContent = JSON.stringify({ ok: false, group, mode, caseName: c.name });
      // Callback-driven stopSearch needs shared cancellation memory. The
      // isolated suite covers it; header-free workers cannot stop native search.
      if (c.name === 'CpSolverTest.callback_stop_search_returns_feasible_and_reuses_solver') {
        results.push({ name: c.name, mode, outcome: 'skipped', reason: 'Requires asynchronous native interruption' });
        continue;
      }
      if (['mp_solver.lifecycle.cancel_blocked_observer', 'mathopt.lifecycle.cancel_blocked_observer', 'mathopt.adversarial.abort_reasons', 'runRoutingWorkerLifecycleCase', 'runMpSolverWorkerLifecycleCase'].includes(c.name)) {
        results.push({ name: c.name, mode, outcome: 'skipped', reason: 'Requires native interruption while an observer is blocked' });
        continue;
      }
      try {
        const value = await c.run() as { ok?: boolean; skipped?: boolean; reason?: string } | string | undefined;
        if (typeof value === 'string' && value.startsWith('TODO:') || value && typeof value === 'object' && value.ok === false) {
          throw new Error(`Case failed: ${JSON.stringify(value)}`);
        }
        results.push({ name: c.name, mode, outcome: value && typeof value === 'object' && value.skipped ? 'skipped' : 'passed',
          reason: value && typeof value === 'object' ? value.reason : undefined });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const capacityCase = ['Knapsack CP-SAT worker budgets and recovery', 'MathOpt API/solve_options_support_check'].includes(c.name)
          && /requests more (workers|threads) than the WASM runtime capacity/.test(reason);
        results.push({ name: c.name, mode, outcome: unsupportedCapability.test(reason) || capacityCase ? 'unsupported' : 'failed', reason });
      }
    }
  }
  status.textContent = JSON.stringify({ complete: true, ok: !results.some(r => r.outcome === 'failed'), group, isolated: crossOriginIsolated, results });
}
