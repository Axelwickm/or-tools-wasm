import * as CpSatApi from 'or-tools-wasm/cp-sat';
import { terminateLoadedRuntimeThreads as terminateCpSatRuntimeThreads } from 'or-tools-wasm/cp-sat';
import { KnapsackSolver, KnapsackSolverType, terminateLoadedRuntimeThreads as terminateKnapsackRuntimeThreads } from 'or-tools-wasm/knapsack';
import { MathOpt, terminateLoadedRuntimeThreads as terminateMathOptRuntimeThreads } from 'or-tools-wasm/mathopt';
import * as MPSolverApi from 'or-tools-wasm/mp-solver';
import { terminateLoadedRuntimeThreads as terminateMPSolverRuntimeThreads } from 'or-tools-wasm/mp-solver';
import { SimpleMaxFlow, terminateLoadedRuntimeThreads as terminateNetworkFlowRuntimeThreads } from 'or-tools-wasm/network-flow';
import * as PdlpApi from 'or-tools-wasm/pdlp';
import { terminateLoadedRuntimeThreads as terminatePdlpRuntimeThreads } from 'or-tools-wasm/pdlp';
import * as RcpspApi from 'or-tools-wasm/rcpsp';
import { terminateLoadedRuntimeThreads as terminateRcpspRuntimeThreads } from 'or-tools-wasm/rcpsp';
import { RoutingIndexManager, RoutingModel, terminateLoadedRuntimeThreads as terminateRoutingRuntimeThreads } from 'or-tools-wasm/routing';
import { GreedySolutionGenerator, SetCoverInvariant, SetCoverModel, terminateLoadedRuntimeThreads as terminateSetCoverRuntimeThreads } from 'or-tools-wasm/set-cover';
import { runCpSatConcurrencyCase } from '../../cases/or-tools-wasm/cp_sat/concurrency.ts';
import { runKnapsackConcurrencyCase } from '../../cases/or-tools-wasm/knapsack/concurrency.ts';
import { runMpSolverConcurrencyCase } from '../../cases/or-tools-wasm/mp_solver/concurrency.ts';
import { runNetworkFlowConcurrencyCase } from '../../cases/or-tools-wasm/network_flow/concurrency.ts';
import { runRcpspConcurrencyCase } from '../../cases/or-tools-wasm/rcpsp/concurrency.ts';
import { runRoutingConcurrencyCase } from '../../cases/or-tools-wasm/routing/concurrency.ts';
import { runSetCoverConcurrencyCase } from '../../cases/or-tools-wasm/set_cover/concurrency.ts';
import { runSolverConcurrencyCase } from '../../cases/or-tools-wasm/solver_concurrency.ts';
import { runSolverReuseCase } from '../../cases/or-tools-wasm/solver_reuse.ts';
import { runBunFixture } from './shared.ts';

await runBunFixture(async () => {
  await runSolverReuseCase([
    { solver: 'cp-sat', run: () => runCpSatConcurrencyCase(CpSatApi as never) },
    { solver: 'mathopt-pdlp', run: () => runSolverConcurrencyCase({ MathOpt } as never, PdlpApi as never) },
    { solver: 'mp-solver', run: () => runMpSolverConcurrencyCase(MPSolverApi as never) },
    { solver: 'routing', run: () => runRoutingConcurrencyCase({ RoutingIndexManager, RoutingModel } as never) },
    { solver: 'knapsack', run: () => runKnapsackConcurrencyCase({ KnapsackSolver, KnapsackSolverType }) },
    { solver: 'network-flow', run: () => runNetworkFlowConcurrencyCase({ SimpleMaxFlow }) },
    { solver: 'set-cover', run: () => runSetCoverConcurrencyCase({ SetCoverModel, SetCoverInvariant, GreedySolutionGenerator }) },
    { solver: 'rcpsp', run: () => runRcpspConcurrencyCase(RcpspApi) },
  ]);
}, async () => {
  await Promise.all([
    terminateCpSatRuntimeThreads(),
    terminateKnapsackRuntimeThreads(),
    terminateMathOptRuntimeThreads(),
    terminateMPSolverRuntimeThreads(),
    terminateNetworkFlowRuntimeThreads(),
    terminatePdlpRuntimeThreads(),
    terminateRcpspRuntimeThreads(),
    terminateRoutingRuntimeThreads(),
    terminateSetCoverRuntimeThreads(),
  ]);
});
