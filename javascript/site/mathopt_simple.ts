import { initMathOpt, MathOpt } from 'or-tools-wasm';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, setRunning } from './mathopt_sample_helpers.js';

async function runMathOptExample() {
  setRunning(true);
  clearStatus();
  try {
    const threads = configureMathOptRun();
    appendStatus('Initializing MathOpt runtime...');
    await initMathOpt();

    const model = MathOpt.Model('Linear programming example');
    const x0 = model.addVariable({ lowerBound: 0, name: 'x0' });
    const x1 = model.addVariable({ lowerBound: 0, name: 'x1' });
    const x2 = model.addVariable({ lowerBound: 0, name: 'x2' });
    model.addLinearConstraint({
      upperBound: 600,
      terms: [
        { variable: x0, coefficient: 10 },
        { variable: x1, coefficient: 4 },
        { variable: x2, coefficient: 5 },
      ],
    });
    model.addLinearConstraint({
      upperBound: 300,
      terms: [
        { variable: x0, coefficient: 2 },
        { variable: x1, coefficient: 2 },
        { variable: x2, coefficient: 6 },
      ],
    });
    model.addLinearConstraint({ upperBound: 100, terms: [x0, x1, x2].map((variable) => ({ variable, coefficient: 1 })) });
    model.maximize([
      { variable: x0, coefficient: 10 },
      { variable: x1, coefficient: 6 },
      { variable: x2, coefficient: 4 },
    ]);

    appendStatus(`Solving with GLOP, threads=${threads}...`);
    const result = await MathOpt.solve(model, {
      solverType: MathOpt.SolverType.GLOP,
      threads,
    });
    renderRows([
      ['Objective', result.objectiveValue],
      ['x0', result.variableValues.x0],
      ['x1', result.variableValues.x1],
      ['x2', result.variableValues.x2],
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
