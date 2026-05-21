import {
  initRcpsp,
  isWorkerBridgeEnabled,
  RcpspModelBuilder,
  type RcpspScheduleTask,
  setWorkerBridgeEnabled,
} from 'or-tools-wasm/rcpsp';

const runButton = document.getElementById('run') as HTMLButtonElement | null;
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const timelineEl = document.getElementById('timeline');
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const workersInput = document.getElementById('workers') as HTMLInputElement | null;

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Schedule';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function buildProject() {
  return new RcpspModelBuilder('house_project')
    .add_resource({ name: 'crew', capacity: 3 })
    .add_activity({ name: 'site', duration: 3, demands: { crew: 2 }, successors: ['frame'] })
    .add_activity({ name: 'permit', duration: 2, demands: { crew: 1 }, successors: ['wire'] })
    .add_activity({ name: 'frame', duration: 4, demands: { crew: 2 }, successors: ['inspect'] })
    .add_activity({ name: 'wire', duration: 2, demands: { crew: 1 }, successors: ['inspect'] })
    .add_activity({ name: 'inspect', duration: 1, demands: { crew: 1 } })
    .build();
}

function renderMetrics(statusName: string, makespan: number | null, workers: number) {
  if (!metricsEl) return;
  metricsEl.innerHTML = `
    <div class="metric"><span>Status</span><strong>${statusName}</strong></div>
    <div class="metric"><span>Makespan</span><strong>${makespan ?? '-'}</strong></div>
    <div class="metric"><span>CP-SAT workers</span><strong>${workers}</strong></div>
  `;
}

function taskClass(task: RcpspScheduleTask) {
  if (task.name === 'inspect') return 'bar final';
  if (task.demands[0] === 2) return 'bar secondary';
  if (task.name === 'permit') return 'bar warning';
  return 'bar';
}

function renderTimeline(tasks: RcpspScheduleTask[], makespan: number) {
  if (!timelineEl) return;
  const visibleTasks = tasks.filter((task) => task.duration > 0);
  const usage = Array.from({ length: makespan }, (_, time) =>
    visibleTasks.reduce((total, task) => total + (time >= task.start && time < task.end ? task.demands[0] : 0), 0)
  );
  timelineEl.style.setProperty('--horizon', String(Math.max(1, makespan)));
  timelineEl.innerHTML = `
    <div class="axis">
      <div></div>
      ${Array.from({ length: makespan }, (_, time) => `<div class="axis-cell">${time}</div>`).join('')}
    </div>
    ${visibleTasks.map((task) => `
      <div class="task-row">
        <div class="task-label">${task.name}</div>
        <div class="${taskClass(task)}" style="grid-column: ${task.start + 2} / ${task.end + 2};">${task.start}-${task.end}</div>
      </div>
    `).join('')}
    <div class="usage-row">
      <div class="usage-label">crew usage</div>
      ${usage.map((value) => `<div class="usage-cell ${value === 3 ? 'full' : ''}">${value}/3</div>`).join('')}
    </div>
  `;
}

async function solve() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    const workers = Math.max(1, Number(workersInput?.value || 1));
    setWorkerBridgeEnabled(workerBridgeToggle?.checked ?? true);
    appendStatus('Initializing RCPSP surface...');
    await initRcpsp();
    appendStatus(`Solving with worker bridge ${isWorkerBridgeEnabled() ? 'enabled' : 'disabled'}...`);
    const result = await buildProject().solve({ numWorkers: workers, maxTimeInSeconds: 5 });
    renderMetrics(result.statusName, result.makespan, workers);
    if (result.makespan !== null) {
      renderTimeline(result.tasks, result.makespan);
    }
    appendStatus(`Done. ${result.statusName} makespan ${result.makespan}.`);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

runButton?.addEventListener('click', () => void solve());
void solve();
