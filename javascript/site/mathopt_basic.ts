import { MathOpt, MathOptCallbackEventProto, type MathOptSolveOptions, type MathOptSolveResult, type MathOptProtoSolveResult } from 'or-tools-wasm/mathopt';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, selectedMathOptExecutor, setRunning, workerCountInput } from './mathopt_sample_helpers.js';

const solverSelect = document.getElementById('solver') as HTMLSelectElement | null;
const stopAfterSolution = document.getElementById('stop-after-solution') as HTMLInputElement;
const lazyConstraintInput = document.getElementById('lazy-constraint') as HTMLInputElement;
const liveLogsInput = document.getElementById('live-logs') as HTMLInputElement;
const rawProtoInput = document.getElementById('raw-proto') as HTMLInputElement;
const rawIncrementalInput = document.getElementById('raw-incremental') as HTMLInputElement;
rawProtoInput.addEventListener('change', () => {
  rawIncrementalInput.disabled = !rawProtoInput.checked;
  if (!rawProtoInput.checked) rawIncrementalInput.checked = false;
});

function selectedSolverType(): keyof typeof MathOpt.SolverType {
  const value = solverSelect?.value;
  if (value === 'CP_SAT') return value;
  if (value === 'GLPK') return value;
  if (value === 'GSCIP') return value;
  return 'GLOP';
}

function addBackendCompatibleBinaryVariable(
  model: ReturnType<typeof MathOpt.Model>,
  solverType: keyof typeof MathOpt.SolverType,
  name: string,
) {
  if (solverType === 'CP_SAT' || solverType === 'GSCIP') {
    return model.addBinaryVariable({ name });
  }
  return model.addVariable({ lowerBound: 0, upperBound: 1, name });
}

function updateThreadControl() {
  stopAfterSolution.disabled = !['CP_SAT', 'GSCIP'].includes(selectedSolverType());
  lazyConstraintInput.disabled = selectedSolverType() !== 'GSCIP';
  if (!workerCountInput) return;
  workerCountInput.disabled = selectedSolverType() === 'GLPK';
  if (workerCountInput.disabled) workerCountInput.value = '1';
}

solverSelect?.addEventListener('change', updateThreadControl);
updateThreadControl();

async function runMathOptExample() {
  setRunning(true);
  clearStatus();
  try {
    const solverType = selectedSolverType();
    const lazyConstraint = solverType === 'GSCIP' && lazyConstraintInput.checked;
    const stopEarly = stopAfterSolution.checked;
    const showLogs = liveLogsInput.checked;
    const serialized = rawProtoInput.checked;
    const incremental = serialized && rawIncrementalInput.checked;
    const threads = solverType === 'GLPK' ? 1 : configureMathOptRun();
    const model = MathOpt.Model('basics', { primaryObjectiveName: 'profit' });
    const x = addBackendCompatibleBinaryVariable(model, solverType, 'x');
    const y = addBackendCompatibleBinaryVariable(model, solverType, 'y');
    if (!lazyConstraint) model.addLinearConstraint({
      upperBound: 1,
      terms: [
        { variable: x, coefficient: 1 },
        { variable: y, coefficient: 1 },
      ],
    });
    model.maximize([
      { variable: x, coefficient: 2 },
      { variable: y, coefficient: 1 },
    ]);

    appendStatus(`Solving with ${solverType}, threads=${threads}...`);
    let incumbents = 0;
    let lazyConstraints = 0;
    let logBatches = 0;
    const callbacks = solverType === 'CP_SAT' || solverType === 'GSCIP';
    const options: MathOptSolveOptions = {
      executor: selectedMathOptExecutor(),
      solverType: MathOpt.SolverType[solverType],
      threads,
      messageCallback: showLogs ? messages => { ++logBatches; appendStatus(messages.join('\n')); } : undefined,
      callbackRegistration: callbacks ? { requestRegistration: [MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION],
        addLazyConstraints: lazyConstraint } : undefined,
      callback: callbacks ? data => {
        if (lazyConstraint && (data.primalSolutionVector?.values ?? []).reduce((sum, value) => sum + value, 0) > 1 + 1e-6) {
          ++lazyConstraints;
          appendStatus('Adding lazy capacity constraint: x + y <= 1');
          return { cuts: [{ linearExpression: { ids: [x.id, y.id], values: [1, 1] },
            lowerBound: -Infinity, upperBound: 1, isLazy: true }] };
        }
        ++incumbents;
        appendStatus(`Incumbent ${incumbents}: objective=${data.mipStats?.primalBound}`);
        return { terminate: stopEarly };
      } : undefined,
      timeLimitSeconds: 5,
      relativeGapTolerance: solverType === 'GLOP' || solverType === 'GLPK' ? undefined : 1e-6,
      glop: solverType === 'GLOP'
        ? new MathOpt.GlopParameters({ usePreprocessing: true, useScaling: true })
        : undefined,
      glpk: solverType === 'GLPK'
        ? new MathOpt.GlpkParameters({ computeUnboundRaysIfPossible: false })
        : undefined,
      gscip: solverType === 'GSCIP'
        ? new MathOpt.GScipParameters({
          silenceOutput: !showLogs,
          presolve: lazyConstraint ? MathOpt.GScipMetaParamValue.OFF : MathOpt.GScipMetaParamValue.FAST,
        })
        : undefined,
      cpSat: solverType === 'CP_SAT'
        ? { maxTimeInSeconds: 5 }
        : undefined,
    };
    let solved: MathOptSolveResult | MathOptProtoSolveResult;
    let nativeUpdateApplied: boolean | undefined;
    if (incremental) {
      const solver = new MathOpt.ProtoIncrementalSolver(model.encodeModelProto(), MathOpt.SolverType[solverType], options);
      try {
        solved = await solver.solve();
        nativeUpdateApplied = await solver.update({ variableUpdates: { upperBounds: { ids: [x.id], values: [0] } } });
        if (nativeUpdateApplied) {
          x.upperBound = 0;
          solved = await solver.solve();
        }
        appendStatus(`Native bound update applied: ${nativeUpdateApplied}`);
      } finally { await solver.close(); }
    } else {
      solved = serialized
        ? await MathOpt.solveProto(model.encodeModelProto(), options)
        : await MathOpt.solve(model, options);
    }
    const result = await MathOpt.parseSolveResult('bytes' in solved ? solved.bytes : solved.toProtoBytes(), model, { executor: selectedMathOptExecutor() });
    const savedPrimal = result.hasSolution ? await MathOpt.convertSolutionProto('primalSolution', {
      variableValues: { ids: [x.id, y.id], values: [result.value(x), result.value(y)] },
      objectiveValue: result.objectiveValue!, feasibilityStatus: 'SOLUTION_STATUS_FEASIBLE',
    }, model, { executor: selectedMathOptExecutor() }) : undefined;
    renderRows([
      ['Input', serialized ? 'Serialized ModelProto' : 'TypeScript model'],
      ...(nativeUpdateApplied === undefined ? [] : [['Native update applied', String(nativeUpdateApplied)] as [string, string]]),
      ['Backend', solverType],
      ['Variable domain', solverType === 'CP_SAT' || solverType === 'GSCIP' ? 'binary' : 'continuous [0, 1]'],
      ['Objective', result.objectiveValue],
      ...(savedPrimal ? [['Saved primal bytes', savedPrimal.bytes.length] as [string, number]] : []),
      ...(callbacks ? [['Incumbent solutions', incumbents] as [string, number]] : []),
      ...(lazyConstraint ? [['Lazy constraints added', lazyConstraints] as [string, number]] : []),
      ...(showLogs ? [['Native log batches', logBatches] as [string, number]] : []),
      ['x', result.value(x)],
      ['y', result.value(y)],
    ]);
    appendStatus(`Termination: ${result.terminationReason}`);
    appendStatus(`Objective: ${result.objectiveValue}`);
    appendStatus(`Values: ${JSON.stringify(result.variableValuesById)}`);
  } catch (error) {
    appendStatus(`Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => {
  void runMathOptExample();
});
