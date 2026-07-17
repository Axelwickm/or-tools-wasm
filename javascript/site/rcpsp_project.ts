import {
  initRcpsp,
  RcpspModelBuilder,
  type RcpspScheduleTask,
  setExecutor,
} from 'or-tools-wasm/rcpsp';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';

type ActivitySpec = {
  name: string;
  duration: number;
  crew: number;
  successors: string[];
  color: string;
};

const activities: ActivitySpec[] = [
  { name: 'site', duration: 3, crew: 2, successors: ['frame'], color: '#0969da' },
  { name: 'permit', duration: 2, crew: 1, successors: ['wire'], color: '#bf8700' },
  { name: 'frame', duration: 4, crew: 2, successors: ['inspect'], color: '#1a7f37' },
  { name: 'wire', duration: 2, crew: 1, successors: ['inspect'], color: '#8250df' },
  { name: 'inspect', duration: 1, crew: 1, successors: [], color: '#cf222e' },
];

const runButton = document.getElementById('run') as HTMLButtonElement | null;
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const timelineEl = document.getElementById('timeline');
const activitiesEl = document.getElementById('activities');
const executorSelector = document.getElementById('solver-executor') as HTMLSelectElement | null;
const workersInput = document.getElementById('workers') as HTMLInputElement | null;

let scheduleTasks: RcpspScheduleTask[] = [];
let makespan: number | null = null;
let hoveredActivity: string | null = null;

function setRunning(running: boolean) {
  if (!runButton) return;
  runButton.disabled = running;
  runButton.textContent = running ? 'Solving...' : 'Solve Schedule';
}

function appendStatus(message: string) {
  if (!statusEl) return;
  statusEl.textContent = statusEl.textContent ? `${statusEl.textContent}\n${message}` : message;
}

function predecessorsFor(name: string) {
  return activities
    .filter((activity) => activity.successors.includes(name))
    .map((activity) => activity.name);
}

function activityByName(name: string) {
  return activities.find((activity) => activity.name === name);
}

function relatedActivities(name: string | null) {
  if (name === null) return new Set<string>();
  const activity = activityByName(name);
  return new Set([name, ...(activity?.successors ?? []), ...predecessorsFor(name)]);
}

function scheduleByName() {
  return new Map(scheduleTasks.map((task) => [task.name, task]));
}

function readPositiveInteger(input: HTMLInputElement, fallback: number) {
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;
}

function syncActivitiesFromInputs() {
  if (!activitiesEl) return;
  for (const input of activitiesEl.querySelectorAll<HTMLInputElement>('input[data-field]')) {
    const activity = activityByName(input.dataset.activity ?? '');
    if (!activity) continue;
    if (input.dataset.field === 'duration') {
      activity.duration = readPositiveInteger(input, activity.duration);
    } else if (input.dataset.field === 'crew') {
      activity.crew = Math.min(3, readPositiveInteger(input, activity.crew));
    }
  }
}

function buildProject() {
  const builder = new RcpspModelBuilder('house_project')
    .add_resource({ name: 'crew', capacity: 3 });
  for (const activity of activities) {
    builder.add_activity({
      name: activity.name,
      duration: activity.duration,
      demands: { crew: activity.crew },
      successors: activity.successors,
    });
  }
  return builder.build();
}

function renderActivities() {
  if (!activitiesEl) return;
  const related = relatedActivities(hoveredActivity);
  const byName = scheduleByName();
  activitiesEl.innerHTML = activities.map((activity) => {
    const schedule = byName.get(activity.name);
    const relationClass = hoveredActivity === null ? '' : related.has(activity.name) ? ' related' : ' dimmed';
    const predecessors = predecessorsFor(activity.name);
    return `
      <article
        class="activity-card${relationClass}"
        data-activity="${activity.name}"
        style="--activity-color: ${activity.color};"
      >
        <div class="activity-card-title">${activity.name}</div>
        <label class="activity-card-line">
          duration
          <input data-activity="${activity.name}" data-field="duration" type="number" min="1" step="1" value="${activity.duration}">
        </label>
        <label class="activity-card-line">
          crew
          <input data-activity="${activity.name}" data-field="crew" type="number" min="1" max="3" step="1" value="${activity.crew}">
          /3
        </label>
        <div class="activity-card-line">after ${predecessors.join(', ') || '-'}</div>
        <div class="activity-card-line">before ${activity.successors.join(', ') || '-'}</div>
        <div class="activity-card-line">scheduled ${schedule ? `${schedule.start}-${schedule.end}` : '-'}</div>
      </article>
    `;
  }).join('');
}

function renderMetrics(statusName: string, workers: number) {
  if (!metricsEl) return;
  metricsEl.innerHTML = `
    <div class="summary-value">Makespan ${makespan ?? '-'}</div>
    <div><strong>Status:</strong> ${statusName}</div>
    <div><strong>CP-SAT workers:</strong> ${workers}</div>
  `;
}

function renderTimeline() {
  if (!timelineEl) return;
  if (makespan === null) {
    timelineEl.textContent = 'Run the solver to view the schedule.';
    return;
  }
  const visibleTasks = scheduleTasks.filter((task) => task.duration > 0);
  const related = relatedActivities(hoveredActivity);
  const usage = Array.from({ length: makespan }, (_, time) =>
    visibleTasks.reduce((total, task) => total + (time >= task.start && time < task.end ? task.demands[0] : 0), 0)
  );
  timelineEl.style.setProperty('--horizon', String(Math.max(1, makespan)));
  timelineEl.innerHTML = `
    <div class="axis">
      <div></div>
      ${Array.from({ length: makespan }, (_, time) => `<div class="axis-cell">${time}</div>`).join('')}
    </div>
    ${visibleTasks.map((task) => {
      const activity = activityByName(task.name);
      const relationClass = hoveredActivity === null ? '' : related.has(task.name) ? ' related' : ' dimmed';
      return `
        <div class="task-row">
          <div class="task-label">${task.name}</div>
          <div
            class="bar${relationClass}"
            data-activity="${task.name}"
            style="--activity-color: ${activity?.color ?? '#1f883d'}; grid-column: ${task.start + 2} / ${task.end + 2};"
          >
            ${task.name} ${task.start}-${task.end}
          </div>
        </div>
      `;
    }).join('')}
    <div class="usage-row">
      <div class="usage-label">crew usage</div>
      ${usage.map((value) => `<div class="usage-cell ${value === 3 ? 'full' : ''}">${value}/3</div>`).join('')}
    </div>
  `;
}

function setHoveredActivity(name: string | null) {
  if (hoveredActivity === name) return;
  hoveredActivity = name;
  renderActivities();
  renderTimeline();
}

async function solve() {
  setRunning(true);
  if (statusEl) statusEl.textContent = '';
  try {
    syncActivitiesFromInputs();
    scheduleTasks = [];
    makespan = null;
    renderActivities();
    renderTimeline();

    const workers = Math.max(1, Number(workersInput?.value || 1));
    appendStatus('Initializing RCPSP surface...');
    await initRcpsp();
    appendStatus(`Solving with the ${executorSelector?.value ?? 'auto'} executor...`);
    const result = await buildProject().solve({ numWorkers: workers, maxTimeInSeconds: 5 });
    scheduleTasks = result.tasks;
    makespan = result.makespan;
    renderActivities();
    renderMetrics(result.statusName, workers);
    renderTimeline();
    appendStatus(`Done. ${result.statusName} makespan ${result.makespan}.`);
  } catch (error) {
    appendStatus(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    setRunning(false);
  }
}

configureSolverExecutorSelector({ setExecutor }, executorSelector);

activitiesEl?.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const card = target.closest<HTMLElement>('[data-activity]');
  setHoveredActivity(card?.dataset.activity ?? null);
});
activitiesEl?.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && activitiesEl.contains(relatedTarget)) return;
  setHoveredActivity(null);
});
activitiesEl?.addEventListener('input', () => {
  syncActivitiesFromInputs();
  scheduleTasks = [];
  makespan = null;
  if (metricsEl) metricsEl.textContent = 'Run the solver to view the solution.';
  renderTimeline();
});
timelineEl?.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const bar = target.closest<HTMLElement>('[data-activity]');
  setHoveredActivity(bar?.dataset.activity ?? null);
});
timelineEl?.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && timelineEl.contains(relatedTarget)) return;
  setHoveredActivity(null);
});
runButton?.addEventListener('click', () => void solve());

renderActivities();
renderTimeline();
