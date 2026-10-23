import type { SharedCase, ExecutorFixtureMode } from '../../harness/shared_case.ts';
import { serverExecutorConfiguration } from '../../harness/shared_case.ts';
import type { SolveResultApis } from './solve_results.ts';

function execution(mode: ExecutorFixtureMode = 'direct') {
  return { executor: mode === 'server' ? serverExecutorConfiguration() : mode, threads: 1 };
}

// Keep the observer blocked until cancellation and close have both settled.
// The timeout releases it on failure so fixture workers can still be cleaned up.
async function cancelObserver(run: (options: {
  signal: AbortSignal; onEvent: (event: unknown) => Promise<void>;
}) => Promise<unknown>, close: () => Promise<void>) {
  const controller = new AbortController(), reason = new Error('observer cancellation');
  let entered!: () => void, release!: () => void;
  const observing = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const pending = run({ signal: controller.signal, onEvent: async () => { ++calls; entered(); await blocked; } });
  // Observe the rejection before waiting for the event to avoid timing-dependent
  // unhandled rejections if a native executor fails during dispatch.
  const outcome = pending.then(() => undefined, error => error);
  let timeout!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Cancellation/close waited for a blocked observer')), 5000);
  });
  try {
    await Promise.race([observing, deadline]);
    controller.abort(reason);
    const error = await Promise.race([outcome, deadline]);
    if (error !== reason) throw new Error(`Cancellation lost its reason: ${String(error)}`);
    await Promise.race([close(), deadline]);
    if (calls !== 1) throw new Error('Cancellation scheduled another observer');
  } finally {
    clearTimeout(timeout);
    release();
    await outcome;
    await close();
  }
}

export const observerCancellationCases: SharedCase<SolveResultApis, Record<string, never>, ExecutorFixtureMode>[] = [
  {
    id: 'mathopt.lifecycle.cancel_blocked_observer', name: 'MathOpt cancellation detaches observers and permits close',
    solver: 'mathopt', tags: ['native-contract', 'lifecycle'],
    async run({ mathopt: { MathOpt } }, { mode }) {
      const options = execution(mode), model = MathOpt.Model('observer');
      const x = model.addVariable({ lowerBound: 0, upperBound: 1 }); model.maximize(x);
      const session = new MathOpt.IncrementalSolver(model, 'GLOP', options);
      try {
        await session.solve();
        await cancelObserver(options => session.solve(options), () => session.close());
      } finally { await session.close(); }
      return {};
    },
  },
  {
    id: 'mp_solver.lifecycle.cancel_blocked_observer', name: 'MPSolver cancellation detaches observers and permits close',
    solver: 'mp-solver', tags: ['native-contract', 'lifecycle'],
    async run({ mp: { MPSolver } }, { mode }) {
      const model = new MPSolver('observer', MPSolver.GLOP_LINEAR_PROGRAMMING);
      model.addNumVariable(0, 1, 'x');
      const session = new MPSolver.IncrementalSolver(model, execution(mode));
      try {
        await session.solve();
        await cancelObserver(options => session.solve(options), () => session.close());
      } finally { await session.close(); }
      return {};
    },
  },
  {
    id: 'set_cover.lifecycle.cancel_blocked_observer', name: 'Set Cover cancellation detaches observers and permits close',
    solver: 'set-cover', tags: ['native-contract', 'lifecycle'],
    async run({ cover: { SetCoverModel, SetCoverInvariant, GuidedLocalSearch } }, { mode }) {
      const model = new SetCoverModel(); model.addEmptySubset(1); model.addElementToLastSubset(0);
      const invariant = new SetCoverInvariant(model); invariant.loadSolution([true]);
      const session = new GuidedLocalSearch(invariant); session.setMaxIterations(1);
      try {
        await session.initialize(execution(mode));
        await cancelObserver(options => session.nextSolution(undefined, options), () => session.close());
      } finally { await session.close(); }
      return {};
    },
  },
];
