import {
  CpSat,
  type CpSatEvent,
  type CpSatEventMask,
  type SatParameters,
} from 'or-tools-wasm/cp-sat';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { getMaxWorkerCount } from './worker_limits.js';

const sampleModel = {
  name: 'exactly_one_bool',
  variables: [
    { name: 'x', domain: [0, 1] },
    { name: 'y', domain: [0, 1] },
  ],
  constraints: [
    {
      name: 'exactly_one',
      linear: {
        vars: [0, 1],
        coeffs: [1, 1],
        domain: [1, 1],
      },
    },
  ],
  objective: {
    vars: [0, 1],
    coeffs: [1, 2],
  },
};

const sampleParams: SatParameters = {
  logSearchProgress: true,
  maxTimeInSeconds: 5,
  numWorkers: 1,
};

const modelInput = document.getElementById('model-input') as HTMLTextAreaElement | null;
const paramsInput = document.getElementById('params-input') as HTMLTextAreaElement | null;
const resultOutput = document.getElementById('result-output') as HTMLPreElement | null;
const eventOutput = document.getElementById('event-output') as HTMLPreElement | null;
const statusEl = document.getElementById('status') as HTMLElement | null;
const loadSampleButton = document.getElementById('load-sample') as HTMLButtonElement | null;
const validateButton = document.getElementById('validate') as HTMLButtonElement | null;
const solveButton = document.getElementById('solve') as HTMLButtonElement | null;
const cancelButton = document.getElementById('cancel') as HTMLButtonElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const executorSelector = document.getElementById('cp-sat-executor') as HTMLSelectElement | null;
const solutionEventsInput = document.getElementById('solution-events') as HTMLInputElement | null;
const boundEventsInput = document.getElementById('bound-events') as HTMLInputElement | null;
const logEventsInput = document.getElementById('log-events') as HTMLInputElement | null;
const clearEventsButton = document.getElementById('clear-events') as HTMLButtonElement | null;
const maxWorkerCount = getMaxWorkerCount();
let solveController: AbortController | null = null;
let solveStartedAt = 0;

if (workerInput) {
  workerInput.max = String(maxWorkerCount);
  workerInput.min = '1';
  workerInput.value = String(maxWorkerCount);
}

function setStatus(message: string) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function setResult(value: unknown) {
  if (resultOutput) {
    resultOutput.textContent =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }
}

function setRunning(running: boolean, cancellable = false) {
  if (validateButton) validateButton.disabled = running;
  if (solveButton) solveButton.disabled = running;
  if (loadSampleButton) loadSampleButton.disabled = running;
  if (executorSelector) executorSelector.disabled = running;
  if (cancelButton) cancelButton.disabled = !running || !cancellable;
}

function clearEvents() {
  if (eventOutput) eventOutput.textContent = '';
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Uint8Array) return `<${item.byteLength} bytes>`;
    return item;
  });
}

function appendEvent(event: CpSatEvent) {
  if (!eventOutput) return;
  const elapsed = ((performance.now() - solveStartedAt) / 1000).toFixed(3);
  const display = event.type === 'solution'
    ? { type: event.type, response: event.response, bytes: `<${event.bytes.byteLength} bytes>` }
    : event;
  eventOutput.textContent += `${elapsed}s ${stringify(display)}\n`;
  eventOutput.scrollTop = eventOutput.scrollHeight;
}

function selectedEventMask(): CpSatEventMask {
  return {
    solution: solutionEventsInput?.checked ?? false,
    bestBound: boundEventsInput?.checked ?? false,
    log: logEventsInput?.checked ?? false,
  };
}

function loadSample() {
  if (modelInput) {
    modelInput.value = JSON.stringify(sampleModel, null, 2);
  }
  if (paramsInput) {
    paramsInput.value = JSON.stringify(sampleParams, null, 2);
  }
  setStatus('Sample loaded.');
  setResult('');
}

function parseJsonObject(input: HTMLTextAreaElement | null, label: string) {
  if (!input) {
    throw new Error(`${label} input is missing.`);
  }
  const text = input.value.trim();
  if (!text) {
    throw new Error(`${label} is empty.`);
  }
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseParams() {
  if (!paramsInput || !paramsInput.value.trim()) {
    return { numWorkers: getSelectedWorkerCount() } satisfies SatParameters;
  }
  const params = parseJsonObject(paramsInput, 'SAT parameters') as SatParameters;
  params.numWorkers = getSelectedWorkerCount();
  delete params.numSearchWorkers;
  return params;
}

function getSelectedWorkerCount() {
  const requested = Number.parseInt(workerInput?.value ?? '1', 10) || 1;
  const workers = Math.min(Math.max(1, requested), maxWorkerCount);
  if (workerInput) {
    workerInput.value = String(workers);
  }
  return workers;
}

async function buildModelBytes() {
  const model = parseJsonObject(modelInput, 'Model');
  return CpSat.createModel(model);
}

async function validateModel() {
  setRunning(true);
  setStatus('Building model...');
  try {
    const modelBytes = await buildModelBytes();
    setStatus('Validating model...');
    const validation = await CpSat.validate(modelBytes);
    setResult(validation);
    setStatus(validation.ok ? 'Model is valid.' : 'Model is invalid.');
  } catch (error) {
    setStatus('Validation failed.');
    setResult((error as Error).message);
  } finally {
    setRunning(false);
  }
}

async function solveModel() {
  const controller = new AbortController();
  solveController = controller;
  solveStartedAt = performance.now();
  clearEvents();
  setRunning(true, true);
  setStatus('Building model...');
  try {
    const modelBytes = await buildModelBytes();
    const params = parseParams();
    setStatus('Solving...');
    const result = await CpSat.solve(modelBytes, {
      solverParameters: params,
      eventMask: selectedEventMask(),
      onEvent: appendEvent,
      signal: controller.signal,
    });
    setResult(result.response ?? { bytes: Array.from(result.bytes) });
    setStatus('Solve finished.');
  } catch (error) {
    setStatus(controller.signal.aborted ? 'Solve cancelled.' : 'Solve failed.');
    setResult((error as Error).message);
  } finally {
    if (solveController === controller) solveController = null;
    setRunning(false);
  }
}

configureSolverExecutorSelector(CpSat, executorSelector);

loadSampleButton?.addEventListener('click', loadSample);
validateButton?.addEventListener('click', () => {
  void validateModel();
});
solveButton?.addEventListener('click', () => {
  void solveModel();
});
cancelButton?.addEventListener('click', () => {
  solveController?.abort();
  setStatus('Cancel requested.');
});
clearEventsButton?.addEventListener('click', clearEvents);

loadSample();
