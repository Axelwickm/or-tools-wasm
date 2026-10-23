import { dispatchCode } from './code_samples/dispatch.js';
import { highlightCodeBlocks } from './code_highlight.js';
import { mathOptCode } from './code_samples/mathopt.js';
import { mpSolverCode } from './code_samples/mp_solver.js';
import { routingCode } from './code_samples/routing.js';
import { setCoverCode } from './code_samples/set_cover.js';
import { minCostFlowCode, pdlpCode, playgroundCode, steelMillCode } from './code_samples/other.js';

const code = document.querySelector<HTMLElement>('.code-samples code[data-highlight="ts"]')!;
const original = code.textContent ?? '';
const renderers: Record<string, () => string> = {
  mathopt_basic: mathOptCode,
  mp_simple_lp: mpSolverCode,
  routing_simple: routingCode,
  set_cover_simple: setCoverCode,
  network_flow_min_cost_flow: () => minCostFlowCode(original),
  pdlp_import: pdlpCode,
  model_playground: playgroundCode,
  steel_mill_slab: steelMillCode,
};
function followControls(render: () => string) {
  function updateCode() {
    const source = render();
    if (source === code.textContent) return;
    code.textContent = source;
    delete code.dataset.highlighted;
    highlightCodeBlocks(code.parentElement!);
  }
  document.addEventListener('change', updateCode);
  document.addEventListener('input', updateCode);
  // Buttons can also load a preset or replace the model text.
  document.addEventListener('click', () => queueMicrotask(updateCode));
  updateCode();
}
const example = location.pathname.split('/').pop()!.replace('.html', '');
if (example === 'routing_dispatch') {
  // Import this page only on Dispatch: its live inputs are also the code sample's inputs.
  void import('./routing_dispatch.js').then(({ getDispatchScenario }) => {
    followControls(() => dispatchCode(getDispatchScenario()));
  });
} else followControls(renderers[example]);

const construction = document.querySelector<HTMLDetailsElement>('#model-construction');
construction?.addEventListener('toggle', async () => {
  const source = await import('./models/steel_mill_slab.ts?raw');
  construction.querySelector('code')!.textContent = source.default;
  highlightCodeBlocks(construction);
}, { once: true });
