import { EfficiencySampler, type WarehouseSnapshot, type EfficiencySample } from './model/efficiency.ts';
import type { SolveTrace } from './model/solve_trace.ts';

export type WorkerRequest =
  | { kind: 'snapshot'; revision: number; snapshot: WarehouseSnapshot }
  | { kind: 'optimize'; revision: number; snapshot: WarehouseSnapshot }
  | { kind: 'visibility'; active: boolean };
export type WorkerReply =
  | { kind: 'sample'; revision: number; sample: EfficiencySample | null }
  | { kind: 'optimized'; revision: number; placement: number[]; status: string; trace: SolveTrace }
  | { kind: 'error'; revision: number; message: string; operation: WorkerRequest['kind'] };
let sampler: EfficiencySampler | null = null;
let revision = 0, active = true;
const reply = (message: WorkerReply) => postMessage(message);
self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.kind === 'visibility') { active = data.active; return; }
    if (data.kind === 'snapshot') {
      revision = data.revision;
      if (sampler) sampler.update(data.snapshot); else sampler = new EfficiencySampler(data.snapshot);
    } else {
      const { optimizePlacement } = await import('./model/optimizer.ts');
      const result = await optimizePlacement(data.snapshot);
      reply({ kind: 'optimized', revision: data.revision, placement: result.placement, status: String(result.status), trace: result.trace });
    }
  } catch (error) {
    reply({ kind: 'error', revision: 'revision' in data ? data.revision : revision, operation: data.kind,
      message: error instanceof Error ? error.message : String(error) });
  }
};
setInterval(() => {
  if (active && sampler) reply({ kind: 'sample', revision, sample: sampler.sample(24) });
}, 250);
