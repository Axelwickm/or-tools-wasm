import { initMathOpt, MathOpt, type MathOptVariable } from 'or-tools-wasm';
import { appendStatus, clearStatus, configureMathOptRun, renderRows, runButton, setRunning } from './mathopt_sample_helpers.js';

type Job = {
  name: string;
  processingTime: number;
  releaseTime: number;
};

const jobs: Job[] = [
  { name: 'job 0', processingTime: 10, releaseTime: 0 },
  { name: 'job 1', processingTime: 1, releaseTime: 1 },
  { name: 'job 2', processingTime: 5, releaseTime: 0 },
];

async function runMathOptExample() {
  setRunning(true);
  clearStatus();
  try {
    const threads = configureMathOptRun();
    appendStatus('Initializing MathOpt runtime...');
    await initMathOpt();

    const horizon = Math.max(...jobs.map((job) => job.releaseTime)) + jobs.reduce((sum, job) => sum + job.processingTime, 0);
    const model = MathOpt.Model('Time-indexed scheduling');
    const starts: MathOptVariable[][] = [];
    const objectiveTerms: Array<{ variable: MathOptVariable; coefficient: number }> = [];

    for (const [jobIndex, job] of jobs.entries()) {
      const jobStarts: MathOptVariable[] = [];
      for (let time = 0; time < horizon; time += 1) {
        const variable = model.addBinaryVariable({ name: `x_${jobIndex}_${time}` });
        jobStarts.push(variable);
        objectiveTerms.push({ variable, coefficient: time + job.processingTime });
        if (time < job.releaseTime) {
          model.addLinearConstraint({ upperBound: 0, terms: [{ variable, coefficient: 1 }] });
        }
      }
      starts.push(jobStarts);
      model.addLinearConstraint({
        lowerBound: 1,
        upperBound: 1,
        terms: jobStarts.map((variable) => ({ variable, coefficient: 1 })),
      });
    }

    for (let time = 0; time < horizon; time += 1) {
      const activeTerms: Array<{ variable: MathOptVariable; coefficient: number }> = [];
      for (const [jobIndex, job] of jobs.entries()) {
        for (let start = Math.max(0, time - job.processingTime + 1); start <= time; start += 1) {
          activeTerms.push({ variable: starts[jobIndex][start], coefficient: 1 });
        }
      }
      model.addLinearConstraint({ upperBound: 1, terms: activeTerms });
    }

    model.minimize(objectiveTerms);

    appendStatus(`Solving with CP-SAT, threads=${threads}...`);
    const result = await MathOpt.solve(model, {
      solverType: MathOpt.SolverType.CP_SAT,
      threads,
    });
    const scheduleRows: Array<[string, string | number]> = [['Objective', result.objectiveValue]];
    for (const [jobIndex, job] of jobs.entries()) {
      const startTime = starts[jobIndex].findIndex((variable) => (result.variableValues[variable.name] ?? 0) > 0.5);
      scheduleRows.push([job.name, `start ${startTime}, finish ${startTime + job.processingTime}`]);
    }
    renderRows(scheduleRows);
    appendStatus(`Termination: ${result.terminationReason}`);
    appendStatus(`Objective: ${result.objectiveValue}`);
    appendStatus(`Schedule: ${JSON.stringify(Object.fromEntries(scheduleRows.slice(1)))}`);
  } catch (error) {
    appendStatus(`Solve failed: ${(error as Error).message}`);
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => {
  void runMathOptExample();
});
