import { initMathOpt, MathOpt } from 'or-tools-wasm';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, setRunning } from './mathopt_sample_helpers.js';

const solverSelect = document.getElementById('solver') as HTMLSelectElement | null;

function selectedSolverType(): keyof typeof MathOpt.SolverType {
  const value = solverSelect?.value;
  if (value === 'CP_SAT') return value;
  return 'GLOP';
}

function addBackendCompatibleBinaryVariable(
  model: ReturnType<typeof MathOpt.Model>,
  solverType: keyof typeof MathOpt.SolverType,
  name: string,
) {
  if (solverType === 'CP_SAT') {
    return model.addBinaryVariable({ name });
  }
  return model.addVariable({ lowerBound: 0, upperBound: 1, name });
}

async function runMathOptExample() {
  setRunning(true);
  clearStatus();
  try {
    const threads = configureMathOptRun();
    const solverType = selectedSolverType();
    appendStatus('Initializing MathOpt runtime...');
    await initMathOpt();

    const model = MathOpt.Model('basics');
    const x = addBackendCompatibleBinaryVariable(model, solverType, 'x');
    const y = addBackendCompatibleBinaryVariable(model, solverType, 'y');
    model.addLinearConstraint({
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
    const result = await MathOpt.solve(model, {
      solverType: MathOpt.SolverType[solverType],
      threads,
    });
    renderRows([
      ['Backend', solverType],
      ['Variable domain', solverType === 'CP_SAT' ? 'binary' : 'continuous [0, 1]'],
      ['Objective', result.objectiveValue],
      ['x', result.variableValues.x],
      ['y', result.variableValues.y],
    ]);
    appendStatus(`Termination: ${result.terminationReason}`);
    appendStatus(`Objective: ${result.objectiveValue}`);
    appendStatus(`Values: ${JSON.stringify(result.variableValues)}`);
  } catch (error) {
    appendStatus(`Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => {
  void runMathOptExample();
});
