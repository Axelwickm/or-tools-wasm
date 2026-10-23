import { type SolverWorkerLike, SolverWorkerExecutor } from '../worker_helpers.js';
import { DirectMathOptExecutor } from './direct_executor.js';
import { mathOptProtocol, type MathOptExecutor, type MathOptOperation } from './protocol.js';
import {
  type ExecutorSelection, resolveExecutorConfiguration, type ResolvedExecutorConfiguration,
} from '../executor_configuration.js';
import { SolverServerExecutor } from '../solver_server_executor.js';
import { CloudExecutor } from '../cloud_executor.js';
import type {
  MathOptConversionOptions, MathOptSolveOptions, MathOptProtoSolveOptions,
  MathOptInfeasibleSubsystemOptions,
} from './types.js';
import {
  type MathOptSolutionProtoKind, type MathOptResultMetadataProtoKind, type MathOptSolutionProtoMap,
  type MathOptResultMetadataProtoMap, type MathOptConvertedProto, encodeMathOptResultProto,
  mathOptResultProtoKind, decodeMathOptResultProto,
} from './result_proto.js';
import { executeSolverJob } from '../solver_job.js';
import { type MathOptModelProto, encodeMathOptModelProto, decodeMathOptModelProto } from './model_proto.js';
import {
  MathOptSolverType, encodeSolveRequest, solveInterrupterState, solveCallbackRegistration,
} from './parameters.js';
import { decodeMathOptRequestParameters } from './rpc_proto.js';
import type { SolverResourceRequest } from '../solver_executor.js';
import { synchronousCallbackResult } from '../callback_validation.js';
import { callbackHandler } from './callbacks.js';
import type { MathOptModel } from './model.js';
import { decodeInfeasibleSubsystemResponse } from './results.js';
import type { MathOptProtoInfeasibleSubsystemResult } from './iis.js';

async function createMathOptWorker(): Promise<SolverWorkerLike> {
  return new Worker(
    new URL('./worker.js', import.meta.url),
    { type: 'module', name: 'ortools-executor-mathopt' },
  );
}

const directMathOptExecutor = new DirectMathOptExecutor();

const workerMathOptExecutor = new SolverWorkerExecutor(
  mathOptProtocol,
  createMathOptWorker,
  operation => (operation.type === 'solve' || operation.type === 'incrementalSolve' || operation.type === 'computeInfeasibleSubsystem') && operation.useInterrupter,
);

export function createMathOptExecutor(selection: ExecutorSelection = 'auto'): MathOptExecutor {
  return createResolvedMathOptExecutor(resolveExecutorConfiguration(selection));
}

function createResolvedMathOptExecutor(
  configuration: ResolvedExecutorConfiguration,
): MathOptExecutor {
  switch (configuration.type) {
    case 'direct': return directMathOptExecutor;
    case 'worker': return workerMathOptExecutor;
    case 'server': return new SolverServerExecutor(mathOptProtocol, configuration);
    case 'cloud': return new CloudExecutor('mathopt', { test: configuration.test });
  }
}

export async function convertMathOptResultProto<K extends MathOptSolutionProtoKind | MathOptResultMetadataProtoKind>(
  kind: K, input: Uint8Array | (MathOptSolutionProtoMap & MathOptResultMetadataProtoMap)[K],
  model: Uint8Array, options: MathOptConversionOptions,
): Promise<MathOptConvertedProto<(MathOptSolutionProtoMap & MathOptResultMetadataProtoMap)[K]>> {
  const bytes = encodeMathOptResultProto(kind, input);
  const result = await executeSolverJob(createMathOptExecutor(options.executor),
    { type: 'convertResult', kind: mathOptResultProtoKind(kind), model, input: bytes }, options);
  if ('validationError' in result) throw new Error(result.validationError);
  if (!('validatedResult' in result)) throw new Error('MathOpt executor returned the wrong result conversion response.');
  return { bytes: new Uint8Array(result.validatedResult), proto: decodeMathOptResultProto(kind, result.validatedResult) };
}

export async function modelProtoToMps(model: Uint8Array | MathOptModelProto, options: MathOptConversionOptions = {}): Promise<string> {
  const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'modelProtoToMps', model: encodeMathOptModelProto(model) }, options);
  if (!('mps' in result)) throw new Error('MathOpt executor returned the wrong MPS export response.');
  return result.mps;
}

export async function mpsToModelProto(mps: string, options: MathOptConversionOptions = {}): Promise<MathOptModelProto> {
  if (typeof mps !== 'string') throw new TypeError('MPS input must be a string.');
  const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'mpsToModelProto', mps }, options);
  if (!('model' in result)) throw new Error('MathOpt executor returned the wrong MPS import response.');
  return decodeMathOptModelProto(result.model);
}

function mathOptRequestedThreads(request: Uint8Array): number {
  const solve = decodeMathOptRequestParameters(request);
  const parameters = solve.parameters ?? {};
  const common = parameters.threads ?? 1;
  switch (solve.solverType ?? MathOptSolverType.GLOP) {
    case MathOptSolverType.CP_SAT: {
      const modern = parameters.cpSat?.numWorkers ?? (parameters.threads === undefined ? 0 : common);
      return modern !== 0 ? modern : parameters.cpSat?.numSearchWorkers || common;
    }
    case MathOptSolverType.PDLP: return parameters.pdlp?.numThreads ?? common;
    case MathOptSolverType.GLOP: return parameters.glop?.numOmpThreads ?? common;
    case MathOptSolverType.GSCIP: return parameters.gscip?.intParams?.['parallel/maxnthreads'] ?? common;
    default: return common;
  }
}

export async function executeMathOptRequest(
  executor: MathOptExecutor,
  operation: MathOptOperation,
  options: Pick<MathOptSolveOptions, 'threads' | 'onEvent' | 'signal' | 'interrupter' | 'callback' | 'messageCallback'>,
  onSuccess?: (response: Uint8Array) => void | Promise<void>,
  onDispatch?: (runtime: object) => void,
  onAbandonedResponse?: (response: Uint8Array) => void | Promise<void>,
): Promise<Uint8Array> {
  const resources: SolverResourceRequest = {
    threads: operation.type === 'solve' || operation.type === 'incrementalSolve' || operation.type === 'computeInfeasibleSubsystem'
      ? mathOptRequestedThreads(operation.request)
      : 1,
  };
  const response = await executeSolverJob(executor, operation, {
    showCloudNotice: !(executor instanceof SolverServerExecutor)
      && (operation.type === 'solve' || operation.type === 'incrementalSolve' || operation.type === 'computeInfeasibleSubsystem'),
    resources,
    onDispatch,
    onEvent: options.onEvent,
    onEventSync: event => {
      if (event.type !== 'log' || !options.messageCallback) return;
      synchronousCallbackResult(options.messageCallback(event.messages), 'MathOpt message callbacks must return synchronously; use onEvent for asynchronous observers.');
    },
    onCallback: options.callback ? callbackHandler(options.callback) : undefined,
    onSuccess: (response) => {
      if (!('response' in response)) throw new Error('MathOpt executor returned a conversion result for a solve operation.');
      return onSuccess?.(response.response);
    },
    signal: options.signal,
    onAbandonedResult: onAbandonedResponse ? payload => {
      const result = mathOptProtocol.decodeResult(payload);
      if (!('response' in result)) throw new Error('MathOpt executor returned the wrong creation response.');
      return onAbandonedResponse(result.response);
    } : undefined,
    interruptSignal: options.interrupter?.signal,
  });
  if (!('response' in response)) throw new Error('MathOpt executor returned the wrong solve response.');
  return response.response;
}

export function assertRawMathOptOptions(options: MathOptProtoSolveOptions): void {
  if ((options as MathOptSolveOptions).removeNames) throw new TypeError('Raw MathOpt solving sends the supplied model unchanged; remove names from the input proto instead.');
}

export async function executeInfeasibleSubsystem(model: MathOptModel | Uint8Array,
    options: MathOptInfeasibleSubsystemOptions): Promise<MathOptProtoInfeasibleSubsystemResult> {
  options = { ...options, solverType: options.solverType ?? MathOptSolverType.GSCIP };
  const request = encodeSolveRequest(model, options);
  const state = solveInterrupterState(options);
  const bytes = await executeMathOptRequest(createMathOptExecutor(options.executor), {
    type: 'computeInfeasibleSubsystem', request, useInterrupter: state.useInterrupter,
    interruptAtStart: state.interrupted, streamMessages: Boolean(options.messageCallback || options.onEvent),
  }, options);
  return decodeInfeasibleSubsystemResponse(bytes);
}

export async function executeMathOptSolve(request: Uint8Array, options: MathOptSolveOptions): Promise<Uint8Array> {
  const interrupterState = solveInterrupterState(options);
  return executeMathOptRequest(createMathOptExecutor(options.executor), {
    type: 'solve', request,
    useInterrupter: interrupterState.useInterrupter,
    interruptAtStart: interrupterState.interrupted,
    callbackRegistration: solveCallbackRegistration(options),
    streamMessages: Boolean(options.messageCallback || options.onEvent),
  }, options);
}

export async function validateModelProto(bytes: Uint8Array, options: MathOptConversionOptions): Promise<void> {
  const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'validateModel', model: bytes }, options);
  if (!('validationError' in result)) throw new Error('MathOpt executor returned the wrong validation response.');
  if (result.validationError) throw new Error(result.validationError);
}
