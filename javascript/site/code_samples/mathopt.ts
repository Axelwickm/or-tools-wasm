import { checked, executor, numberValue, value } from './controls.js';

export function mathOptCode(): string {
  const solver = value('solver', 'GLOP');
  const constraint = solver === 'GSCIP' ? value('choice-constraint', 'linear') : 'linear';
  const serialized = checked('raw-proto');
  const lazy = solver === 'GSCIP' && constraint === 'linear' && checked('lazy-constraint');
  const continuous = ['GLOP', 'GLPK'].includes(solver);
  const lines = [`import { MathOpt, MathOptModel, MathOptCallbackEventProto, type MathOptSolveOptions } from 'or-tools-wasm/mathopt';

let model = MathOpt.Model('basics', { primaryObjectiveName: 'profit' });
const execution = { executor: ${executor()} as const };`];
  const variable = (name: string) => continuous
    ? `model.addVariable({ lowerBound: 0, upperBound: 1, name: '${name}' })`
    : `model.addBinaryVariable({ name: '${name}' })`;
  lines.push(`let x = ${variable('x')};\nlet y = ${variable('y')};`);
  if (constraint === 'sos2') lines.push(`const z = model.addBinaryVariable({ name: 'z' });`);
  if (constraint === 'linear' && !lazy) lines.push(`model.addLinearConstraint({ upperBound: 1,
  terms: [{ variable: x, coefficient: 1 }, { variable: y, coefficient: 1 }],
});`);
  if (constraint === 'sos1') lines.push(`model.addSos1Constraint([x, y], { name: 'choices' });`);
  if (constraint === 'sos2') lines.push(`model.addSos2Constraint([x, y, z], { weights: [1, 2, 3], name: 'choices' });`);
  lines.push(`model.maximize([{ variable: x, coefficient: 2 }, { variable: y, coefficient: 1 }${constraint === 'sos2' ? ', { variable: z, coefficient: 0.5 }' : ''}]);`);
  if (constraint === 'robust') lines.push(`const uncertainty = MathOpt.Model('capacity uncertainty');
const w = uncertainty.addVariable({ lowerBound: 0, upperBound: 1, name: 'extra demand' });
const rhs = model.addVariable({ lowerBound: 1, upperBound: 1, name: 'capacity' });
${serialized ? `const transformed = await MathOpt.addRobustConstraintProto(model.encodeModelProto(), uncertainty.encodeModelProto(), rhs.id,
  [{ variableId: x.id, coefficient: { ids: [w.id], coefficients: [1], offset: 1 } },
   { variableId: y.id, coefficient: { offset: 1 } }], execution);
model = await MathOptModel.fromModelProto(transformed.bytes, execution);` : `model = await MathOpt.addRobustConstraint(model, uncertainty, rhs,
  [{ variable: x, coefficient: new MathOpt.LinearExpression([{ variable: w, coefficient: 1 }], 1) },
   { variable: y, coefficient: 1 }], execution);`}
x = model.getVariable(x.id)!; y = model.getVariable(y.id)!;`);
  if (constraint === 'indicatorMip') lines.push(`const indicator = model.addIndicatorConstraint({ indicator: x, upperBound: 0,
  terms: [{ variable: y, coefficient: 1 }], name: 'x excludes y' });
${serialized ? `const transformed = await MathOpt.formulateIndicatorConstraintAsMipProto(model.encodeModelProto(), indicator.id, execution);
model = await MathOptModel.fromModelProto(transformed.bytes, execution);` : `model = await MathOpt.formulateIndicatorConstraintAsMip(model, indicator, execution);`}
x = model.getVariable(x.id)!; y = model.getVariable(y.id)!;`);
  if (checked('improve-point')) lines.push(serialized ? `console.log(await MathOpt.moveVariablesToTheirBestFeasibleValueProto(model.encodeModelProto(),
  { ids: [x.id, y.id], values: [0, 0] }, [x.id, y.id], execution));` : `console.log(await MathOpt.moveVariablesToTheirBestFeasibleValue(model, { [x.id]: 0, [y.id]: 0 }, [x, y], execution));`);
  const options = [`  ...execution, solverType: MathOpt.SolverType.${solver},`, `  threads: ${solver === 'GLPK' ? 1 : numberValue('worker-count', 4)}, timeLimitSeconds: 5,`];
  if (checked('live-logs')) options.push('  messageCallback: messages => console.log(messages.join("\\n")),');
  if (!continuous) {
    options.push(`  callbackRegistration: {
    requestRegistration: [MathOptCallbackEventProto.CALLBACK_EVENT_MIP_SOLUTION], addLazyConstraints: ${lazy},
  },
  callback: data => {
    ${lazy ? `if ((data.primalSolutionVector?.values ?? []).reduce((sum, v) => sum + v, 0) > 1 + 1e-6) {
      return { cuts: [{ linearExpression: { ids: [x.id, y.id], values: [1, 1] },
        lowerBound: -Infinity, upperBound: 1, isLazy: true }] };
    }` : 'console.log(data.mipStats?.primalBound);'}
    return { terminate: ${checked('stop-after-solution')} };
  },`);
  }
  if (solver === 'GLOP') options.push('  glop: new MathOpt.GlopParameters({ usePreprocessing: true, useScaling: true }),');
  if (solver === 'GLPK') options.push('  glpk: new MathOpt.GlpkParameters({ computeUnboundRaysIfPossible: false }),');
  if (solver === 'GSCIP') options.push(`  gscip: new MathOpt.GScipParameters({ silenceOutput: ${!checked('live-logs')},
    presolve: MathOpt.GScipMetaParamValue.${lazy ? 'OFF' : 'FAST'} }),`);
  lines.push(`const options: MathOptSolveOptions = {\n${options.join('\n')}\n};`);
  if (checked('raw-incremental')) lines.push(`const session = new MathOpt.ProtoIncrementalSolver(model.encodeModelProto(), MathOpt.SolverType.${solver}, options);
try {
  console.log(await session.solve());
  const applied = await session.update({ variableUpdates: { upperBounds: { ids: [x.id], values: [0] } } });
  if (applied) console.log(await session.solve());
} finally { await session.close(); }`);
  else lines.push(`const result = await MathOpt.${serialized ? 'solveProto(model.encodeModelProto()' : 'solve(model'}, options);
console.log(${serialized ? 'result.response' : 'result.objectiveValue, result.variableValuesById'});`);
  return lines.join('\n\n');
}
