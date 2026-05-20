import { initMathOpt, MathOpt } from 'or-tools-wasm';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, setRunning } from './mathopt_sample_helpers.js';

async function runGScipExample() {
  setRunning(true);
  clearStatus();
  try {
    appendStatus('Initializing MathOpt runtime...');
    await initMathOpt();
    const threads = configureMathOptRun();

    const model = MathOpt.Model('gscip_simple_mip');
    const x = model.addIntegerVariable({ lowerBound: 0, upperBound: 10, name: 'x' });
    const y = model.addIntegerVariable({ lowerBound: 0, upperBound: 10, name: 'y' });
    model.addLinearConstraint({
      upperBound: 4,
      terms: [
        { variable: x, coefficient: 1 },
        { variable: y, coefficient: 1 },
      ],
      name: 'budget',
    });
    model.addLinearConstraint({
      upperBound: 2,
      terms: [{ variable: x, coefficient: 1 }],
      name: 'x_cap',
    });
    model.maximize([
      { variable: x, coefficient: 1 },
      { variable: y, coefficient: 2 },
    ]);

    appendStatus(`Solving with GSCIP, threads=${threads}...`);
    const result = await MathOpt.solve(model, {
      solverType: MathOpt.SolverType.GSCIP,
      threads,
    });
    renderRows([
      ['Termination', result.terminationReason],
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
  void runGScipExample();
});
