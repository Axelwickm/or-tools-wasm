import {
  GreedySolutionGenerator,
  initSetCover,
  isWorkerBridgeEnabled,
  SetCoverInvariant,
  SetCoverModel,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm/set-cover';

const solutionOutput = document.getElementById('solution-output');
const statusEl = document.getElementById('status');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Set Cover';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function buildModel() {
  const model = new SetCoverModel();
  model.add_empty_subset(2.0);
  model.add_element_to_last_subset(0);
  model.add_empty_subset(2.0);
  model.add_element_to_last_subset(1);
  model.add_empty_subset(1.0);
  model.add_element_to_last_subset(0);
  model.add_element_to_last_subset(1);
  return model;
}

function renderSolution(inv: SetCoverInvariant) {
  if (!solutionOutput) return;
  const solution = inv.export_solution_as_proto();
  solutionOutput.innerHTML = `
    <strong>Total cost:</strong> ${solution.cost}<br>
    <strong>Chosen subsets:</strong> ${solution.subset.join(', ')}<br>
    <strong>Uncovered elements:</strong> ${inv.num_uncovered_elements()}
  `;
}

async function runSetCover() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus('Initializing Set Cover runtime...');
    await initSetCover();

    const model = buildModel();
    const inv = new SetCoverInvariant(model);
    const greedy = new GreedySolutionGenerator(inv);

    appendStatus(`Solving with worker bridge ${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
    const hasFound = await greedy.next_solution();
    if (!hasFound) {
      appendStatus('No solution found by the greedy heuristic.');
      return;
    }

    renderSolution(inv);
    appendStatus(`Done. Cost ${inv.cost()}.`);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void runSetCover());
void runSetCover();
