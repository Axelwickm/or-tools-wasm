import { initMathOpt, MathOpt } from 'or-tools-wasm';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, setRunning } from './mathopt_sample_helpers.js';

async function runMathOptExample() {
  setRunning(true);
  clearStatus();
  try {
    const threads = configureMathOptRun();
    appendStatus('Initializing MathOpt runtime...');
    await initMathOpt();

    const model = MathOpt.Model('Integer programming example');
    const x = model.addIntegerVariable({ lowerBound: 0, name: 'x' });
    const y = model.addIntegerVariable({ lowerBound: 0, name: 'y' });
    model.addLinearConstraint({
      upperBound: 17.5,
      terms: [
        { variable: x, coefficient: 1 },
        { variable: y, coefficient: 7 },
      ],
    });
    model.addLinearConstraint({ upperBound: 3.5, terms: [{ variable: x, coefficient: 1 }] });
    model.maximize([
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 10 },
    ]);

    appendStatus(`Solving with CP-SAT, threads=${threads}...`);
    const result = await MathOpt.solve(model, {
      solverType: MathOpt.SolverType.CP_SAT,
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
