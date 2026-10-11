import { loadSetCoverRuntime } from '../runtime_loader.js';
import { withWasmAllocations, type WasmByteAllocator } from '../wasm_memory.js';
import { withWasmRuntimeLock } from '../wasm_runtime_lock.js';
import {
  createSolverFailureEvent,
  createSolverJobStatusEvent,
  SolverCancellationUnsupportedError,
  SolverExecutorBusyError,
  SolverFailureKind,
  SolverJobState,
  type SolverExecutionOptions,
} from '../solver_executor.js';
import type { OrToolsWasmModule } from '../wasm_module_types.js';
import type {
  SetCoverExecutor,
  SetCoverJob,
  SetCoverOperation,
  SetCoverSearchOperation,
  SetCoverResult,
  GuidedTabuParameters,
} from './protocol.js';

function copyFloat64ToHeap(allocate: WasmByteAllocator, values: number[]) {
  const array = Float64Array.from(values);
  return allocate(new Uint8Array(array.buffer));
}

const algorithmCode: Record<SetCoverSearchOperation['algorithm'], number> = {
  inspect: 8,
  trivial: 0,
  greedy: 1,
  elementDegree: 2,
  lazyElementDegree: 3,
  random: 4,
  steepest: 5,
  guidedLocal: 6,
  guidedTabu: 7,
};

function guidedTabuArguments(parameters: Partial<GuidedTabuParameters> = {}): number[] {
  const size = parameters.tabuListSize;
  if (size !== undefined && (!Number.isInteger(size) || size <= 0 || size > 0x7fffffff)) {
    throw new RangeError('SetCover: tabu list size must be a positive int32.');
  }
  const values = [parameters.lagrangianFactor, parameters.epsilon, parameters.penaltyFactor, size];
  const mask = values.reduce<number>((mask, value, index) => value === undefined ? mask : mask | (1 << index), 0);
  return [mask, ...values.map(value => value ?? 0)];
}

function sessionArguments(handle: bigint = 0n): number[] {
  if (handle < 0n || handle > 0xffffffffffffffffn) throw new RangeError('Invalid Set Cover session handle.');
  return [Number(handle & 0xffffffffn), Number(handle >> 32n)];
}

function nativeResult(result: { ok: boolean; error?: string; sessionHandle?: string;
  cost?: number | string; costLowerBound?: number | string } &
  Omit<Partial<SetCoverResult>, 'sessionHandle' | 'cost' | 'costLowerBound'>): SetCoverResult {
  if (!result.ok) throw new Error(result.error);
  const { cost, costLowerBound, ...fields } = result;
  return { nextSolution: false, numUncoveredElements: 0, selected: [], coverage: [], numFreeElements: [],
    numCoverageLe1Elements: [], isRedundant: [], ...fields, cost: cost === undefined ? 0 : Number(cost),
    ...(costLowerBound === undefined ? {} : { costLowerBound: Number(costLowerBound) }),
    sessionHandle: result.sessionHandle === undefined ? undefined : BigInt(result.sessionHandle) };
}

export class DirectSetCoverExecutor implements SetCoverExecutor {
  readonly solver = 'set-cover';
  private nextRequestId = 1;
  private activeJob: object | null = null;

  constructor(
    private readonly loadModuleImpl: () => Promise<OrToolsWasmModule> = loadSetCoverRuntime,
  ) {}

  async load(): Promise<void> { await this.module(); }
  terminate(_reason?: string): void {}

  execute(operation: SetCoverOperation, options: SolverExecutionOptions<never>): SetCoverJob {
    if (this.activeJob) throw new SolverExecutorBusyError(this.solver);
    const requestId = this.nextRequestId++;
    const state = {};
    this.activeJob = state;
    return {
      requestId,
      result: this.run(requestId, operation, options).finally(() => {
        if (this.activeJob === state) this.activeJob = null;
      }),
      cancel: () => Promise.reject(new SolverCancellationUnsupportedError(this.solver)),
    };
  }

  private module() {
    return this.loadModuleImpl();
  }

  private async run(
    requestId: number,
    operation: SetCoverOperation,
    options: SolverExecutionOptions<never>,
  ): Promise<SetCoverResult> {
    const createdAt = BigInt(Date.now());
    try {
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.STARTING, createdAt,
      ));
      const module = await this.module();
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.RUNNING, createdAt, BigInt(Date.now()),
      ));
      const result = await withWasmRuntimeLock(module, () => {
        options.onDispatch?.(module);
        return this.executeNative(module, operation);
      });
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.SUCCEEDED, createdAt,
      ));
      return result;
    } catch (error) {
      await options.onEvent(createSolverFailureEvent(
        this.solver,
        requestId,
        error instanceof Error ? error.message : String(error),
        SolverFailureKind.INTERNAL,
        error instanceof Error ? error.stack ?? '' : '',
      ));
      await options.onEvent(createSolverJobStatusEvent(
        this.solver, requestId, SolverJobState.FAILED, createdAt,
      ));
      throw error;
    }
  }

  private async executeNative(
    module: OrToolsWasmModule,
    operation: SetCoverOperation,
  ): Promise<SetCoverResult> {
    return withWasmAllocations(module, async allocate => {
      if (operation.type === 'compressTrace') {
        const values = operation.trace.flatMap(item => [item.subset, Number(item.selected)]);
        const pointer = copyFloat64ToHeap(allocate, values);
        return nativeResult(JSON.parse(await module.ccall('set_cover_compress_trace', 'string',
          ['number', 'number', 'number'], [operation.numSubsets, pointer, operation.trace.length], { async: true }) as string));
      }
      if (operation.type === 'guidedTabuParameters') {
        const result = JSON.parse(await module.ccall('set_cover_guided_tabu_parameters', 'string',
          Array(7).fill('number'), [...guidedTabuArguments(operation.parameters), ...sessionArguments(operation.handle)], { async: true }) as string);
        return nativeResult(result);
      }
      if (operation.type === 'sessionDelete' || operation.type === 'sessionInitialize' || operation.type === 'sessionNext') {
        const handle = sessionArguments(operation.handle);
        if (operation.type === 'sessionDelete') return nativeResult(JSON.parse(await module.ccall('set_cover_session_delete', 'string',
          Array(2).fill('number'), handle, { async: true }) as string));
        const values = operation.type === 'sessionNext' ? operation.focus?.map(Number) ?? [] : operation.selected.map(Number);
        const pointer = copyFloat64ToHeap(allocate, values);
        const args = [...handle, pointer, values.length,
        ...(operation.type === 'sessionNext' ? [operation.focus === null ? 0 : 1, operation.maxIterations, operation.timeLimitSeconds ?? Infinity] : []),
        ...guidedTabuArguments(operation.guidedTabuParameters)];
        return nativeResult(JSON.parse(await module.ccall(operation.type === 'sessionNext' ? 'set_cover_session_next' : 'set_cover_session_initialize',
          'string', Array(args.length).fill('number'), args, { async: true }) as string));
      }
      if ((operation.type === 'nextSolution' || operation.type === 'sessionCreate') && operation.guidedTabuParameters && operation.algorithm !== 'guidedTabu') {
        throw new Error('Guided tabu parameters require guided tabu search.');
      }
      const tuning = operation.type !== 'statistics' ? guidedTabuArguments(operation.guidedTabuParameters) : [];
      const costs = copyFloat64ToHeap(allocate, operation.costs);
      const starts = copyFloat64ToHeap(allocate, operation.starts);
      const elements = copyFloat64ToHeap(allocate, operation.elements);
      if (operation.type === 'statistics') {
        const result = JSON.parse(await module.ccall('set_cover_statistics', 'string',
          ['number', 'number', 'number', 'number', 'number', 'number'],
          [costs, starts, elements, operation.costs.length, operation.elements.length, operation.kind],
          { async: true }) as string);
        if (!result.ok) throw new Error(result.error);
        return {
          nextSolution: false, cost: 0, numUncoveredElements: 0, selected: [], coverage: [], numFreeElements: [], numCoverageLe1Elements: [], isRedundant: [],
          statistics: result.statistics ? Object.fromEntries(Object.entries(result.statistics).map(([key, value]) => [key, Number(value)])) as SetCoverResult['statistics'] : undefined,
          deciles: result.deciles?.map(BigInt),
        };
      }
      const selected = copyFloat64ToHeap(allocate, operation.selected.map(Number));
      const focus = operation.algorithm === 'inspect'
        ? operation.focusIndices ? copyFloat64ToHeap(allocate, operation.focusIndices) : 0
        : operation.focus ? copyFloat64ToHeap(allocate, operation.focus.map(Number)) : 0;
      if (operation.type === 'sessionCreate') {
        const args = [costs, starts, elements, operation.costs.length, operation.elements.length, selected, algorithmCode[operation.algorithm], ...tuning];
        return nativeResult(JSON.parse(await module.ccall('set_cover_session_create', 'string', Array(args.length).fill('number'), args, { async: true }) as string));
      }
      return nativeResult(JSON.parse(await module.ccall(
        'set_cover_next_solution_with_limits',
        'string',
        Array(16).fill('number'),
        [costs, starts, elements, operation.costs.length, operation.elements.length, selected, focus,
          algorithmCode[operation.algorithm], operation.maxIterations, operation.timeLimitSeconds ?? Number.POSITIVE_INFINITY, operation.focusIndices?.length ?? -1, ...tuning],
        { async: true },
      ) as string));
    });
  }
}
