import {
  CpSat,
  type CpSatEvent,
  type CpSatEventMask,
  type SatParameters,
} from 'or-tools-wasm/cp-sat';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { ActiveSolve, formatJson, requiredElement } from './site_support.js';
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

const modelInput = requiredElement('model-input', 'textarea');
const paramsInput = requiredElement('params-input', 'textarea');
const resultOutput = requiredElement('result-output', 'pre');
const eventOutput = requiredElement('event-output', 'pre');
const statusEl = requiredElement('status', 'div');
const loadSampleButton = requiredElement('load-sample', 'button');
const validateButton = requiredElement('validate', 'button');
const solveButton = requiredElement('solve', 'button');
const cancelButton = requiredElement('cancel', 'button');
const workerInput = requiredElement('workers', 'input');
const executorSelector = requiredElement('cp-sat-executor', 'select');
const solutionEventsInput = requiredElement('solution-events', 'input');
const boundEventsInput = requiredElement('bound-events', 'input');
const logEventsInput = requiredElement('log-events', 'input');
const clearEventsButton = requiredElement('clear-events', 'button');
const maxWorkerCount = getMaxWorkerCount();
const activeSolve = new ActiveSolve('Playground solve');
let solveStartedAt = 0;

workerInput.max = String(maxWorkerCount);
workerInput.min = '1';
workerInput.value = String(maxWorkerCount);

function setStatus(message: string) {
  statusEl.textContent = message;
}

function setResult(value: unknown) {
  resultOutput.textContent =
    typeof value === 'string' ? value : formatJson(value);
}

function setRunning(running: boolean, cancellable = false) {
  validateButton.disabled = running;
  solveButton.disabled = running;
  loadSampleButton.disabled = running;
  executorSelector.disabled = running;
  cancelButton.disabled = !running || !cancellable;
}

function clearEvents() {
  eventOutput.textContent = '';
}

function appendEvent(event: CpSatEvent) {
  const elapsed = ((performance.now() - solveStartedAt) / 1000).toFixed(3);
  const display = event.type === 'solution'
    ? { type: event.type, response: event.response, bytes: `<${event.bytes.byteLength} bytes>` }
    : event;
  eventOutput.textContent += `${elapsed}s ${formatJson(display)}\n`;
  eventOutput.scrollTop = eventOutput.scrollHeight;
}

function selectedEventMask(): CpSatEventMask {
  return {
    solution: solutionEventsInput.checked,
    bestBound: boundEventsInput.checked,
    log: logEventsInput.checked,
  };
}

function loadSample() {
  modelInput.value = JSON.stringify(sampleModel, null, 2);
  paramsInput.value = JSON.stringify(sampleParams, null, 2);
  setStatus('Sample loaded.');
  setResult('');
}

function parseJsonObject(input: HTMLTextAreaElement, label: string) {
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
  if (!paramsInput.value.trim()) {
    return { numWorkers: getSelectedWorkerCount() } satisfies SatParameters;
  }
  const params = parseJsonObject(paramsInput, 'SAT parameters') as SatParameters;
  params.numWorkers = getSelectedWorkerCount();
  return params;
}

function getSelectedWorkerCount() {
  const requested = Number.parseInt(workerInput.value, 10) || 1;
  const workers = Math.min(Math.max(1, requested), maxWorkerCount);
  workerInput.value = String(workers);
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
    const validation = await CpSat.validate(modelBytes, { executor: selectedExecutor() });
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
  const signal = activeSolve.start();
  solveStartedAt = performance.now();
  clearEvents();
  setRunning(true, true);
  setStatus('Building model...');
  try {
    const modelBytes = await buildModelBytes();
    const params = parseParams();
    setStatus('Solving...');
    const result = await CpSat.solve(modelBytes, {
      ...params,
      executor: selectedExecutor(),
      eventMask: selectedEventMask(),
      onEvent: appendEvent,
      signal,
    });
    setResult(result.response ?? { bytes: Array.from(result.bytes) });
    setStatus('Solve finished.');
  } catch (error) {
    setStatus(signal.aborted ? 'Solve cancelled.' : 'Solve failed.');
    setResult((error as Error).message);
  } finally {
    activeSolve.finish(signal);
    setRunning(false);
  }
}

const selectedExecutor = configureSolverExecutorSelector(executorSelector);

loadSampleButton.addEventListener('click', loadSample);
validateButton.addEventListener('click', () => {
  void validateModel();
});
solveButton.addEventListener('click', () => {
  void solveModel();
});
cancelButton.addEventListener('click', () => {
  activeSolve.cancel();
  setStatus('Cancel requested.');
});
clearEventsButton.addEventListener('click', clearEvents);

loadSample();
