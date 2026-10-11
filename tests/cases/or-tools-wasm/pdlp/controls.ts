import { runPdlpAdversarialCases } from '../adversarial.ts';
import { runPdlpModelImportCases } from './model_import.ts';
import { runPdlpNumericalCases } from './numerical.ts';
import { executorFixtureModes, serverExecutorConfiguration } from '../../../harness/shared_case.ts';
import type * as Api from 'or-tools-wasm/pdlp';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const lp = {
  objectiveOffset: -14, objectiveVector: [5, 2, 1, 1],
  constraintLowerBounds: [12, 7, 1], constraintUpperBounds: [12, Infinity, Infinity],
  variableLowerBounds: [0, 0, 0, 0], variableUpperBounds: [2, 4, 6, 3],
  constraintMatrix: { dense: [[2, 1, 1, 2], [1, 0, 1, 0], [0, 0, 1, -1]] },
};
// Zero tolerances keep this nontrivial QP running until native interruption.
const size = 40;
const qp = {
  objectiveVector: Array.from({ length: size }, (_, i) => -Math.sqrt(i + 2)),
  objectiveMatrixDiagonal: Array.from({ length: size }, (_, i) => Math.sqrt(i + 3)),
  variableLowerBounds: Array(size).fill(0), variableUpperBounds: Array(size).fill(10),
  constraintLowerBounds: Array(size).fill(-Infinity), constraintUpperBounds: Array(size).fill(15),
  constraintMatrix: { dense: Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => Math.sin(row * size + column + 1) + 1.1)) },
};

export async function runPdlpControlCases(api: typeof Api) {
  await runPdlpAdversarialCases(api);
  const results = [...await runPdlpModelImportCases(api), ...await runPdlpNumericalCases(api)];
  for (const mode of executorFixtureModes) {
    const executor = mode === 'server' ? serverExecutorConfiguration() : mode;
    const parameters = { executor, numThreads: 1, terminationCheckFrequency: 1,
      presolveOptions: { useGlop: false } };
    let iterations = 0, logs = 0, lastIteration = -1;
    const observed = await api.Pdlp.solve(lp, { ...parameters, verbosityLevel: 2,
      onEvent: event => {
        if (event.type === 'log') { ++logs; return; }
        if (event.type !== 'iteration') return;
        ++iterations;
        lastIteration = event.info.iterationStats.iterationNumber ?? -1;
        assert(Number.isFinite(event.info.boundNorms.l2NormConstraintBounds), 'Native bound norms missing');
        assert(event.info.terminationCriteria.timeSecLimit === Infinity, 'Native criteria defaults changed');
      },
    });
    assert(observed.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', 'Observation changed PDLP result');
    assert(iterations > 1 && lastIteration > 0 && logs > 0, `Native progress missing (${mode})`);

    let masked = 0;
    await api.Pdlp.solve(lp, { ...parameters, verbosityLevel: 2,
      eventMask: { iteration: false, log: false },
      onEvent: event => { if (event.type === 'iteration' || event.type === 'log') ++masked; },
    });
    assert(masked === 0, `Disabled callback mask ignored (${mode})`);

    const slowParameters = { ...parameters, terminationCriteria: {
      iterationLimit: 10000000, timeSecLimit: 30,
      simpleOptimalityCriteria: { epsOptimalAbsolute: 0, epsOptimalRelative: 0 },
    } };
    for (const callbackFailure of mode === 'direct' ? [] : [false, true]) {
      const controller = new AbortController();
      const failure = new Error('PDLP deliberate callback failure');
      let nativeProgress = false;
      let rejected = false;
      const began = Date.now();
      try {
        await api.Pdlp.solve(qp, { ...slowParameters, signal: controller.signal,
          eventMask: { log: false, iteration: true },
          onEvent: event => {
            if (event.type !== 'iteration' || nativeProgress) return;
            nativeProgress = true;
            if (callbackFailure) throw failure;
            // The caller remains responsive through the worker/server bridge.
            setTimeout(() => controller.abort(), 0);
          },
        });
      } catch (error) {
        rejected = callbackFailure ? error === failure
          : error instanceof Error && error.name === 'AbortError';
        if (!rejected) throw error;
      }
      assert(nativeProgress && rejected, `Native progress cancellation failed (${mode})`);
      assert(Date.now() - began < 10000, `Cancellation failed to stop work promptly (${mode})`);
      const reused = await api.Pdlp.solve(lp, parameters);
      assert(reused.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL',
        `Interruption poisoned subsequent solve (${mode})`);
    }
    if (mode !== 'server') {
      const oversized = await api.Pdlp.solve(lp, { numThreads: 1000000, executor });
      assert(oversized.solveLog.terminationReason === 'TERMINATION_REASON_INVALID_PARAMETER',
        'Excessive threads must fail without exhausting the native pool');
      const reused = await api.Pdlp.solve(lp, parameters);
      assert(reused.solveLog.terminationReason === 'TERMINATION_REASON_OPTIMAL', 'Capacity rejection poisoned runtime');
    }
    results.push({ id: 'pdlp.controls.progress_cancellation_reuse',
      name: 'PDLP native progress, masks, interruption and reuse', solver: 'pdlp',
      source: 'javascript/lib/pdlp/api.ts', tags: ['contract', 'solver-control'], mode, ok: true as const });
  }
  return results;
}
