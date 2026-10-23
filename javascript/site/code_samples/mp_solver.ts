import { checked, executor, numberValue, quote, value } from './controls.js';

export function mpSolverCode(): string {
  const backend = value('solver', 'GLOP');
  const integer = !['GLOP', 'CLP', 'GLPK_LP'].includes(backend);
  const lines = [`import { MPSolver, MPSolverParameters, IntegerParam, PresolveValues } from 'or-tools-wasm/mp-solver';

const solver = MPSolver.createSolver('${backend}');
if (!solver) throw new Error('Solver unavailable.');
solver.setNumThreads(${['GLPK', 'GLPK_LP'].includes(backend) ? 1 : numberValue('workers', 4)});
const options: Parameters<typeof solver.solve>[0] = { executor: ${executor()} };`];
  if (value('solver-parameters')) lines.push(`if (!await solver.setSolverSpecificParametersAsString(${quote(value('solver-parameters'))}, options)) {
  throw new Error('Solver rejected the parameters.');
}`);
  if (checked('clamp-sample')) lines.push(`const sampleSolver = MPSolver.createSolver('${backend}')!;
const sample = sampleSolver.addVariable(0, 1, ${integer}, 'sample');
console.log(await MPSolver.clampSolutionWithinBounds(sampleSolver,
  { status: MPSolver.FEASIBLE, variableValue: [2] }, options));`);
  lines.push(`const x = solver.${integer ? 'addIntVariable' : 'addNumVariable'}(0, 1, 'x');
const y = solver.${integer ? 'addIntVariable' : 'addNumVariable'}(0, 1, 'y');
const capacity = solver.addConstraint(-solver.infinity(), 1, 'c0');
capacity.setCoefficient(x, 1); capacity.setCoefficient(y, 1);
const objective = solver.objective();
objective.setCoefficient(x, 2); objective.setCoefficient(y, 1);
objective.setMaximization();`);
  if (checked('warm-start')) lines.push(`const parameters = new MPSolverParameters();
parameters.setIntegerParam(IntegerParam.PRESOLVE, PresolveValues.PRESOLVE_OFF);
options.parameters = parameters;
if (await solver.solve(options) !== MPSolver.OPTIMAL) throw new Error('Initial solve failed.');
options.startingBasis = {
  variableStatuses: [x.basisStatus(), y.basisStatus()], constraintStatuses: [capacity.basisStatus()],
};`);
  if (checked('lazy-limit')) lines.push(`options.callbackRegistration = { mightAddLazyConstraints: true, variableIndices: [x.index()] };
options.callback = data => {
  if (data.canQueryVariableValues && data.variableValues[x.index()] > 0) {
    return { lazyConstraints: [{ upperBound: 0, variableIndices: [x.index()], coefficients: [1] }] };
  }
};`);
  if (checked('incremental')) lines.push(`const session = new MPSolver.IncrementalSolver(solver, options);
try {
  console.log(await session.solve());
  x.setUpperBound(0);
  console.log(await session.solve());
} finally { await session.close(); }`);
  else lines.push(`console.log(await solver.${backend === 'SAT' ? 'solveWithProto' : 'solve'}(options));`);
  lines.push('console.log(solver.objective().value(), x.solutionValue(), y.solutionValue());');
  return lines.join('\n\n');
}
