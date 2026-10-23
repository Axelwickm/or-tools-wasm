import { regions } from '../models/set_cover.js';
import { checked, executor, numberValue, quote, value } from './controls.js';

export function setCoverCode(): string {
  const data = regions.map(({ cost, elements }) => ({ cost, elements }));
  const lines = [`import {
  SetCoverModel, SetCoverInvariant, GreedySolutionGenerator, GuidedTabuSearch,
  LazySteepestSearch, SetCover,
} from 'or-tools-wasm/set-cover';

const regions = ${JSON.stringify(data, null, 2)};
const model = new SetCoverModel();
for (const region of regions) {
  model.addEmptySubset(region.cost);
  for (const element of region.elements) model.addElementToLastSubset(element);
}
const execution = { executor: ${executor()} as const };`];
  const format = value('model-format', 'builder');
  if (format !== 'builder') lines.push(`const text = ${format === 'fimi' ? quote(regions.map(region => region.elements.join(' ')).join('\n')) : `await model.exportText('${format}', execution)`};
const imported = await SetCoverModel.fromText(text, '${format}', execution);`);
  lines.push(`const activeModel = ${format === 'builder' ? 'model' : 'imported'};
const inv = new SetCoverInvariant(activeModel);
await new GreedySolutionGenerator(inv).nextSolution(undefined, execution);`);
  if (value('search-method') === 'guided') lines.push(`const search = new GuidedTabuSearch(inv);
search.setPenaltyFactor(${numberValue('penalty-factor', 0.3)});
search.setEpsilon(${numberValue('epsilon', 0.000001)});
search.setTabuListSize(${numberValue('tabu-size', 17)});
search.setMaxIterations(40);
try {
  await search.initialize(execution);
  for (let pass = 0; pass < 5; pass++) await search.nextSolution();
} finally { await search.close(); }`);
  if (value('search-method') === 'lazy') lines.push(`await new LazySteepestSearch(inv).nextSolution(undefined, execution);`);
  if (value('search-method') === 'restart') lines.push(`const extra = inv.isSelected().findIndex(selected => !selected);
if (extra >= 0) await inv.updateSelection(extra, true, execution);
await inv.clearMostCoveredElements(1, execution);
await new GreedySolutionGenerator(inv).nextSolution(undefined, execution);`);
  lines.push(`await inv.compressTrace(execution);
const state = await inv.inspect(execution);
console.log(state.cost, state.numUncoveredElements);
console.log(await activeModel.computeLagrangianLowerBound(state.cost, execution));`);
  if (checked('cft-comparison')) lines.push(`const initialSelectedSubsets = state.selected.flatMap((selected, index) => selected ? [index] : []);
console.log(await SetCover.solveCft(activeModel, { ...execution, initialSelectedSubsets }));`);
  if (checked('mip-comparison')) lines.push(`console.log(await SetCover.solveMip(activeModel, execution));
console.log(await SetCover.solveLpRelaxation(activeModel, execution));`);
  return lines.join('\n\n');
}
