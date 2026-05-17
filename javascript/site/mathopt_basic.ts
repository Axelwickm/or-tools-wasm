import { initMathOpt, MathOpt } from 'or-tools-wasm';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, setRunning } from './mathopt_sample_helpers.js';

async function runMathOptExample() {
  setRunning(true);
  clearStatus();
  try {
    const threads = configureMathOptRun();
    appendStatus('Initializing MathOpt runtime...');
    await initMathOpt();

    const model = MathOpt.Model('Basic MathOpt example');
    const x = model.addVariable({ lowerBound: 0, upperBound: 1, name: 'x' });
    const y = model.addVariable({ lowerBound: 0, upperBound: 2.5, name: 'y' });
    model.addLinearConstraint({
      upperBound: 1.5,
      terms: [
        { variable: x, coefficient: 1 },
        { variable: y, coefficient: 1 },
      ],
    });
    model.maximize([
      { variable: x, coefficient: 2 },
      { variable: y, coefficient: 1 },
    ]);

    appendStatus(`Solving with GLOP, threads=${threads}...`);
    const result = await MathOpt.solve(model, {
      solverType: MathOpt.SolverType.GLOP,
      threads,
    });
    renderRows([
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
