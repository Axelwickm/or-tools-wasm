import { checked, executor, numberValue, quote, value } from './controls.js';

export function minCostFlowCode(base: string): string {
  return base.replace(/minCostFlow\.setPriceScaling\((?:true|false)\);[^\n]*/,
    `minCostFlow.setPriceScaling(${checked('price-scaling')});`)
    .replace(/executor: 'worker'/g, `executor: ${executor()}`);
}

export function pdlpCode(): string {
  const fromFile = Boolean((document.getElementById('model-file') as HTMLInputElement).files?.length);
  return `import { Pdlp } from 'or-tools-wasm/pdlp';

${fromFile ? `const file = document.querySelector<HTMLInputElement>('#model-file')!.files![0];
const input = new Uint8Array(await file.arrayBuffer());` : `const input = ${quote(value('model-text'))};`}
const qp = await Pdlp.readQuadraticProgram(input, {
  format: '${value('format', 'mps')}', includeNames: true,
  relaxIntegerVariables: ${checked('relax-integers')}, executor: ${executor()},
});
const result = await Pdlp.solve(qp, {
  executor: ${executor()}, numThreads: 1, terminationCriteria: { timeSecLimit: 10 },
});
console.log(result.solveLog.terminationReason, result.primalSolution);`;
}

export function playgroundCode(): string {
  return `import { CpSat, type SatParameters } from 'or-tools-wasm/cp-sat';

const modelJson = JSON.parse(${quote(value('model-input'))});
const params: SatParameters = { ...JSON.parse(${quote(value('params-input') || '{}')}), numWorkers: ${numberValue('workers', 1)} };
const model = await CpSat.createModel(modelJson);
const validation = await CpSat.validate(model, { executor: ${executor()} });
if (!validation.ok) throw new Error(validation.message);
const controller = new AbortController();
const result = await CpSat.solveProto(model, {
  ...params, executor: ${executor()}, signal: controller.signal,
  eventMask: { solution: ${checked('solution-events')}, bestBound: ${checked('bound-events')}, log: ${checked('log-events')} },
  onEvent: event => console.log(event),
});
console.log(result.response);`;
}

export function steelMillCode(): string {
  return `import { CpSat } from 'or-tools-wasm/cp-sat';
// Model construction is shared with this example, including the symmetry constraints.
import { buildProblem, buildModel } from './models/steel_mill_slab.js';

const problem = buildProblem(${numberValue('problem-id', 3)});
const bundle = buildModel('${value('solver-method', 'sat')}', problem, ${checked('break-symmetries')});
const model = await CpSat.createModel(bundle.model as Record<string, unknown>);
const validation = await CpSat.validate(model, { executor: ${executor()} });
if (!validation.ok) throw new Error(validation.message);
const result = await CpSat.solveProto(model, {
  executor: ${executor()}, numWorkers: ${numberValue('workers', 1)},
  logSearchProgress: true, maxTimeInSeconds: 10,
});
console.log(result.response);`;
}

