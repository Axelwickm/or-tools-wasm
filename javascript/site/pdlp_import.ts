import { Pdlp, type PdlpModelFormat } from 'or-tools-wasm/pdlp';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { requiredElement } from './site_support.js';
const run = requiredElement('run', 'button');
const source = requiredElement('model-text', 'textarea');
const file = requiredElement('model-file', 'input');
const format = requiredElement('format', 'select');
const relax = requiredElement('relax-integers', 'input');
const status = requiredElement('status', 'pre');
const output = requiredElement('solution-output', 'pre');
const executor = configureSolverExecutorSelector(requiredElement('solver-executor', 'select'));
const samples = {
  mps: source.value,
  textproto: `name: "imported"
maximize: true
objective_offset: 5
variable {
  name: "x"
  lower_bound: 0
  upper_bound: 4
  objective_coefficient: 3
}
constraint {
  name: "capacity"
  upper_bound: 4
  var_index: 0
  coefficient: 1
}
`,
  json: JSON.stringify({
    name: 'imported', maximize: true, objectiveOffset: 5,
    variable: [{ name: 'x', lowerBound: 0, upperBound: 4, objectiveCoefficient: 3 }],
    constraint: [{ name: 'capacity', upperBound: 4, varIndex: [0], coefficient: [1] }],
  }, null, 2),
  proto: '',
};
let running = false;
function updateControls() {
  format.disabled = running;
  file.disabled = running;
  source.disabled = running || format.value === 'proto';
  run.disabled = running || (format.value === 'proto' && !file.files?.length);
  run.textContent = running ? 'Solving…' : 'Import and solve';
}
format.addEventListener('change', () => {
  file.value = '';
  source.value = samples[format.value as PdlpModelFormat];
  source.placeholder = format.value === 'proto' ? 'Choose a binary MPModelProto file above.' : '';
  status.textContent = ''; output.textContent = '';
  updateControls();
});
source.addEventListener('input', () => { file.value = ''; updateControls(); });
file.addEventListener('change', updateControls);
updateControls();
run.addEventListener('click', async () => {
  running = true; updateControls();
  status.textContent = 'Importing model…'; output.textContent = '';
  try {
    const selected = executor();
    const input = file.files?.[0] ? new Uint8Array(await file.files[0].arrayBuffer()) : source.value;
    const qp = await Pdlp.readQuadraticProgram(input, {
      format: format.value as PdlpModelFormat, includeNames: true,
      relaxIntegerVariables: relax.checked, executor: selected,
    });
    status.textContent = 'Solving…';
    const result = await Pdlp.solve(qp, { executor: selected, numThreads: 1, terminationCriteria: { timeSecLimit: 10 } });
    status.textContent = `Termination: ${result.solveLog.terminationReason}\nIterations: ${result.solveLog.iterationCount}`;
    const objective = result.solveLog.solutionStats?.convergenceInformation?.[0]?.primalObjective;
    output.textContent = `${objective === undefined ? '' : `Objective: ${objective}\n`}`
      + result.primalSolution.map((value, index) => `${qp.variableNames[index] || `x${index}`}: ${value}`).join('\n');
  } catch (error) { status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`; }
  finally { running = false; updateControls(); }
});
