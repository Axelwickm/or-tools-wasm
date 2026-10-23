import { setControlAvailable } from './example_controls.js';
import { MathOpt, MathOptModel, MathOptCallbackEventProto, type MathOptSolveOptions, type MathOptSolveResult, type MathOptProtoSolveResult } from 'or-tools-wasm/mathopt';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, selectedMathOptExecutor, setRunning, workerCountInput } from './mathopt_sample_helpers.js';

const solverSelect = document.getElementById('solver') as HTMLSelectElement | null;
const stopAfterSolution = document.getElementById('stop-after-solution') as HTMLInputElement;
const improvePointInput = document.getElementById('improve-point') as HTMLInputElement;
const lazyConstraintInput = document.getElementById('lazy-constraint') as HTMLInputElement;
const choiceConstraintInput = document.getElementById('choice-constraint') as HTMLSelectElement;
const liveLogsInput = document.getElementById('live-logs') as HTMLInputElement;
const rawProtoInput = document.getElementById('raw-proto') as HTMLInputElement;
const rawIncrementalInput = document.getElementById('raw-incremental') as HTMLInputElement;
rawProtoInput.addEventListener('change', () => {
  if (!rawProtoInput.checked) rawIncrementalInput.checked = false;
  updateThreadControl();
});

function selectedSolverType(): keyof typeof MathOpt.SolverType {
  const value = solverSelect?.value;
  if (value === 'CP_SAT') return value;
  if (value === 'GLPK') return value;
  if (value === 'GSCIP') return value;
  return 'GLOP';
}

function updateThreadControl() {
  const scip = selectedSolverType() === 'GSCIP';
  stopAfterSolution.disabled = !['CP_SAT', 'GSCIP'].includes(selectedSolverType());
  lazyConstraintInput.disabled = !scip || choiceConstraintInput.value !== 'linear';
  choiceConstraintInput.disabled = !scip;
  improvePointInput.disabled = (scip && choiceConstraintInput.value !== 'linear');
  rawIncrementalInput.disabled = !rawProtoInput.checked;
  for (const control of [stopAfterSolution, lazyConstraintInput, choiceConstraintInput, improvePointInput, rawIncrementalInput])
    setControlAvailable(control, !control.disabled);
  if (!workerCountInput) return;
  workerCountInput.disabled = selectedSolverType() === 'GLPK';
  if (workerCountInput.disabled) workerCountInput.value = '1';
  setControlAvailable(workerCountInput, !workerCountInput.disabled);
}

solverSelect?.addEventListener('change', updateThreadControl);
choiceConstraintInput.addEventListener('change', updateThreadControl);
updateThreadControl();

async function runMathOptExample() {
  setRunning(true);
  clearStatus();
  try {
    const solverType = selectedSolverType();
    const choiceConstraint = solverType === 'GSCIP' ? choiceConstraintInput.value : 'linear';
    const lazyConstraint = solverType === 'GSCIP' && lazyConstraintInput.checked && choiceConstraint === 'linear';
    const stopEarly = stopAfterSolution.checked;
    const showLogs = liveLogsInput.checked;
    const serialized = rawProtoInput.checked;
    const incremental = serialized && rawIncrementalInput.checked;
    const threads = solverType === 'GLPK' ? 1 : configureMathOptRun();
    let model = MathOpt.Model('basics', { primaryObjectiveName: 'profit' });
    const continuous = solverType === 'GLOP' || solverType === 'GLPK';
    const variable = (name: string) => continuous ? model.addVariable({ lowerBound: 0, upperBound: 1, name })
      : model.addBinaryVariable({ name });
    let x = variable('x');
    let y = variable('y');
    const z = choiceConstraint === 'sos2' ? model.addBinaryVariable({ name: 'z' }) : undefined;
    if (choiceConstraint === 'sos1') model.addSos1Constraint([x, y], { name: 'choices' });
    if (choiceConstraint === 'sos2') model.addSos2Constraint([x, y, z!], { weights: [1, 2, 3], name: 'choices' });
    if (!lazyConstraint && choiceConstraint === 'linear') model.addLinearConstraint({
      upperBound: 1,
      terms: [
        { variable: x, coefficient: 1 },
        { variable: y, coefficient: 1 },
      ],
    });
    model.maximize([
      { variable: x, coefficient: 2 },
      { variable: y, coefficient: 1 },
      ...(z ? [{ variable: z, coefficient: 0.5 }] : []),
    ]);

    if (choiceConstraint === 'robust') {
      const uncertainty = MathOpt.Model('capacity uncertainty');
      const w = uncertainty.addVariable({ lowerBound: 0, upperBound: 1, name: 'extra demand' });
      const rhs = model.addVariable({ lowerBound: 1, upperBound: 1, name: 'capacity' });
      const execution = { executor: selectedMathOptExecutor() };
      model = serialized
        ? await MathOptModel.fromModelProto((await MathOpt.addRobustConstraintProto(model.encodeModelProto(), uncertainty.encodeModelProto(), rhs.id,
            [{ variableId: x.id, coefficient: { ids: [w.id], coefficients: [1], offset: 1 } },
             { variableId: y.id, coefficient: { offset: 1 } }], execution)).bytes, execution)
        : await MathOpt.addRobustConstraint(model, uncertainty, rhs,
            [{ variable: x, coefficient: new MathOpt.LinearExpression([{ variable: w, coefficient: 1 }], 1) },
             { variable: y, coefficient: 1 }], execution);
      x = model.getVariable(x.id)!; y = model.getVariable(y.id)!;
      appendStatus('Native robust constraint: (1 + w)x + y ≤ 1 for every w in [0, 1].');
    }

    if (choiceConstraint === 'indicatorMip') {
      const indicator = model.addIndicatorConstraint({ indicator: x, upperBound: 0,
        terms: [{ variable: y, coefficient: 1 }], name: 'x excludes y' });
      const execution = { executor: selectedMathOptExecutor() };
      model = serialized
        ? await MathOptModel.fromModelProto((await MathOpt.formulateIndicatorConstraintAsMipProto(model.encodeModelProto(), indicator.id, execution)).bytes, execution)
        : await MathOpt.formulateIndicatorConstraintAsMip(model, indicator, execution);
      x = model.getVariable(x.id)!; y = model.getVariable(y.id)!;
      appendStatus(`Native indicator-to-MIP conversion: ${model.indicatorConstraints().length} indicators, ${model.linearConstraints().length} linear rows.`);
    }

    const domainBounds = serialized
      ? await MathOpt.linearExpressionBoundsProto(model.encodeModelProto(), { ids: [x.id, y.id], coefficients: [1, 1] }, { executor: selectedMathOptExecutor() })
      : await MathOpt.linearExpressionBounds(model, new MathOpt.LinearExpression([{ variable: x, coefficient: 1 }, { variable: y, coefficient: 1 }]), { executor: selectedMathOptExecutor() });
    appendStatus(`Variable-domain bounds for x + y: [${domainBounds.lowerBound}, ${domainBounds.upperBound}] (ignoring other constraints).`);

    if (improvePointInput.checked && !improvePointInput.disabled) {
      const execution = { executor: selectedMathOptExecutor() };
      const values = { [x.id]: 0, [y.id]: 0 };
      let improvedX: number, improvedY: number;
      if (serialized) {
        const improved = await MathOpt.moveVariablesToTheirBestFeasibleValueProto(model.encodeModelProto(),
          { ids: [x.id, y.id], values: [0, 0] }, [x.id, y.id], execution);
        const point = new Map(improved.proto.ids!.map((id, index) => [Number(id), improved.proto.values![index]]));
        improvedX = point.get(x.id)!; improvedY = point.get(y.id)!;
      } else {
        const improved = await MathOpt.moveVariablesToTheirBestFeasibleValue(model, values, [x, y], execution);
        improvedX = improved.get(x)!; improvedY = improved.get(y)!;
      }
      appendStatus(`Native starting-point improvement: x=${improvedX}, y=${improvedY}`);
    }

    appendStatus(`Solving with ${solverType}, threads=${threads}...`);
    let incumbents = 0;
    let lazyConstraints = 0;
    let logBatches = 0;
    const callbacks = !continuous && (solverType === 'CP_SAT' || solverType === 'GSCIP');
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
      variableValues: { ids: [x.id, y.id, ...(z ? [z.id] : [])], values: [result.value(x), result.value(y), ...(z ? [result.value(z)] : [])] },
      objectiveValue: result.objectiveValue!, feasibilityStatus: 'SOLUTION_STATUS_FEASIBLE',
    }, model, { executor: selectedMathOptExecutor() }) : undefined;
    const feasibility = result.hasSolution ? await MathOpt.checkPrimalSolutionFeasibility(
      model, result.variableValuesById, { executor: selectedMathOptExecutor() }) : undefined;
    renderRows([
      ['Input', serialized ? 'Serialized ModelProto' : 'TypeScript model'],
      ...(nativeUpdateApplied === undefined ? [] : [['Native update applied', String(nativeUpdateApplied)] as [string, string]]),
      ['Backend', solverType],
      ['Choice constraint', choiceConstraint],
      ['Variable domain', continuous ? 'continuous [0, 1]' : 'binary'],
      ['Objective', result.objectiveValue],
      ...(feasibility ? [['Native feasibility', feasibility.feasible ? 'feasible' : feasibility.descriptions.join('; ')]] as [string, string][] : []),
      ...(savedPrimal ? [['Saved primal bytes', savedPrimal.bytes.length] as [string, number]] : []),
      ...(callbacks ? [['Incumbent solutions', incumbents] as [string, number]] : []),
      ...(lazyConstraint ? [['Lazy constraints added', lazyConstraints] as [string, number]] : []),
      ...(showLogs ? [['Native log batches', logBatches] as [string, number]] : []),
      ['x', result.value(x)],
      ['y', result.value(y)],
      ...(z ? [['z', result.value(z)] as [string, number]] : []),
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
