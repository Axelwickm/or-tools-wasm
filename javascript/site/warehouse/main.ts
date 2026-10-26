// Page entry: model/ owns simulation and optimization; view/ owns the Three.js scene and effects.
import { highlightCodeBlocks } from '../code_highlight.js';
import { requiredElement } from '../site_support.js';
import { startWarehouseScene } from './view/scene.ts';
import solverSource from './model/optimizer.ts?raw';
import problemSource from './model/layout.ts?raw';

requiredElement('solver-code', 'code').textContent = solverSource;
requiredElement('problem-code', 'code').textContent = problemSource;
highlightCodeBlocks();

try { startWarehouseScene(); }
catch (error) {
  const errorEl = requiredElement('scene-error', 'p');
  errorEl.hidden = false;
  errorEl.textContent = 'The 3D preview could not start. Try a browser with WebGL 2 and hardware acceleration enabled.';
  console.error('Warehouse preview:', error);
}
