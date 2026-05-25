import { runBrowserFixture } from '../../browser-basic-src/browser_fixture_main.ts';
import * as CpSatApi from 'or-tools-wasm/cp-sat';
import * as RoutingApiModule from 'or-tools-wasm/routing';
import * as MPSolverApi from 'or-tools-wasm/mp-solver';
import * as KnapsackApi from 'or-tools-wasm/knapsack';
import * as NetworkFlowApi from 'or-tools-wasm/network-flow';
import * as SetCoverApi from 'or-tools-wasm/set-cover';
import * as RcpspApi from 'or-tools-wasm/rcpsp';
import * as MathOptApi from 'or-tools-wasm/mathopt';
import * as PdlpApi from 'or-tools-wasm/pdlp';

void runBrowserFixture({
  CpSatApi,
  RoutingApiModule,
  MPSolverApi,
  KnapsackApi,
  NetworkFlowApi,
  SetCoverApi,
  RcpspApi,
  MathOptApi,
  PdlpApi,
});
