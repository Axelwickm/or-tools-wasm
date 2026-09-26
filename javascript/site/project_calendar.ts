import { days, hoursPerDay, leave, people, tasks, solveProjectCalendar } from './models/project_calendar.js';
import modelSource from './models/project_calendar.ts?raw';
import { highlightCodeBlocks } from './code_highlight.js';
import { configureSolverExecutorSelector } from './solver_executor_selector.js';
import { requiredElement } from './site_support.js';

const calendar = requiredElement('calendar', 'div');
const status = requiredElement('status', 'p');
const score = requiredElement('score', 'span');
const run = requiredElement('run', 'button');
const reset = requiredElement('reset', 'button');
const deadline = requiredElement('deadline', 'select');
const taskSelect = requiredElement('task', 'select');
const daySelect = requiredElement('day', 'select');
const hourSelect = requiredElement('hour', 'select');
const pinButton = requiredElement('pin', 'button');
const executorSelect = requiredElement('solver-executor', 'select');
const executor = configureSolverExecutorSelector(executorSelect);
const pins = new Map<number, number>();
let starts: number[] = tasks.map((task) => task.preferred);
let preferredStarts = [...starts];
let busy = false;
let selected = 0;
const hourHeight = 80;
const axisWidth = 64;
const colors = [{ fill: '#e0eacb', accent: '#62834b' }, { fill: '#dbe8ee', accent: '#557b94' }, { fill: '#f3e4c9', accent: '#a67b48' }];
const clock = (hour: number) => `${String(9 + hour).padStart(2, '0')}:00`;
const dayLeft = (day: number) => `calc(${axisWidth}px + (100% - ${axisWidth}px) * ${day / days.length})`;
const taskLeft = (day: number, person: number) => `calc(${axisWidth}px + (100% - ${axisWidth}px) * ${(day + person / people.length) / days.length} + 3px)`;

const headings = requiredElement('day-headings', 'div');
headings.append(document.createElement('div'));
days.forEach((day, index) => {
  const heading = document.createElement('div'); heading.className = 'day-heading';
  heading.innerHTML = `${day}<small><span>Ari</span><span>Bo</span><span>Cy</span></small>`; headings.append(heading);
  const line = document.createElement('div'); line.className = 'day-line'; line.style.left = dayLeft(index); calendar.append(line);
  const lunch = document.createElement('div'); lunch.className = 'blocked'; lunch.textContent = 'LUNCH';
  lunch.style.left = dayLeft(index); lunch.style.top = `${3 * hourHeight}px`; lunch.style.height = `${hourHeight}px`; lunch.style.width = 'calc((100% - 64px) / 5)'; calendar.append(lunch);
  daySelect.add(new Option(day, String(index)));
});
const holiday = document.createElement('div'); holiday.className = 'blocked'; holiday.textContent = leave.label;
holiday.style.left = taskLeft(Math.floor(leave.start / hoursPerDay), leave.person);
holiday.style.top = `${leave.start % hoursPerDay * hourHeight}px`; holiday.style.height = `${leave.duration * hourHeight}px`; holiday.style.width = 'calc((100% - 64px) / 15 - 6px)'; calendar.append(holiday);
for (let hour = 0; hour < hoursPerDay; hour++) {
  const label = document.createElement('div'); label.className = 'hour'; label.style.top = `${hour * hourHeight + 4}px`; label.textContent = clock(hour); calendar.append(label);
}

const blocks = tasks.map((task, id) => {
  taskSelect.add(new Option(task.title, String(id)));
  const block = document.createElement('button'); block.className = 'task'; block.hidden = true;
  block.dataset.task = String(id);
  block.style.setProperty('--fill', colors[task.people[0]].fill);
  block.style.setProperty('--accent', colors[task.people[0]].accent);
  // A shared task spans its participants' adjacent calendar lanes.
  block.style.width = `calc((100% - 64px) / 15 * ${task.people.length} - 6px)`; block.style.height = `${task.duration * hourHeight - 6}px`;
  block.addEventListener('click', () => selectTask(id));
  let drag: { x: number; y: number; start: number } | null = null;
  block.addEventListener('pointerdown', (event) => {
    if (busy || event.button !== 0) return;
    selectTask(id); drag = { x: event.clientX, y: event.clientY, start: starts[id] };
    block.setPointerCapture(event.pointerId); block.classList.add('dragging');
  });
  block.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dayWidth = (calendar.clientWidth - axisWidth) / days.length;
    const day = Math.max(0, Math.min(4, Math.floor(drag.start / hoursPerDay) + Math.round((event.clientX - drag.x) / dayWidth)));
    const hour = Math.max(0, Math.min(hoursPerDay - task.duration, drag.start % hoursPerDay + Math.round((event.clientY - drag.y) / hourHeight)));
    starts[id] = day * hoursPerDay + hour; render();
  });
  block.addEventListener('pointerup', (event) => {
    if (!drag) return;
    const moved = Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 4;
    drag = null; block.classList.remove('dragging');
    if (moved) {
      preferredStarts[id] = starts[id];
      if (pins.has(id)) pins.set(id, starts[id]);
      markPending();
    }
    selectTask(id);
  });
  block.addEventListener('pointercancel', () => {
    if (drag) starts[id] = drag.start;
    drag = null; block.classList.remove('dragging'); render();
  });
  calendar.append(block); return block;
});

function selectTask(id: number) {
  selected = id; taskSelect.value = String(id);
  hourSelect.replaceChildren();
  for (let hour = 0; hour <= hoursPerDay - tasks[id].duration; hour++) hourSelect.add(new Option(clock(hour), String(hour)));
  const start = starts[id] ?? tasks[id].preferred;
  daySelect.value = String(Math.floor(start / hoursPerDay)); hourSelect.value = String(start % hoursPerDay);
  requiredElement('task-title', 'h2').textContent = tasks[id].title;
  requiredElement('task-detail', 'p').textContent = `${tasks[id].duration} hours. ${tasks[id].people.map((person) => people[person]).join(', ')}. Prerequisites: ${tasks[id].after.map((p) => tasks[p].title).join(', ') || 'none'}.`;
  render();
}

// Explain visible conflicts without claiming to compute an infeasibility core.
function conflictsFor(id: number): string[] {
  const start = starts[id], task = tasks[id], end = start + task.duration;
  const conflicts: string[] = [];
  if (start % hoursPerDay < 4 && start % hoursPerDay + task.duration > 3) conflicts.push('Lunch is protected');
  if (end > Number(deadline.value)) conflicts.push('After the deadline');
  if (task.people.includes(leave.person) && start < leave.start + leave.duration && end > leave.start) conflicts.push(leave.label);
  for (const before of task.after) if (starts[before] + tasks[before].duration > start) conflicts.push(`Wait for ${tasks[before].title}`);
  for (let other = 0; other < tasks.length; other++) {
    if (other !== id && start < starts[other] + tasks[other].duration && starts[other] < end
      && task.people.some((person) => tasks[other].people.includes(person))) conflicts.push(`Person busy: ${tasks[other].title}`);
  }
  return conflicts;
}


function render() {
  if (!starts.length) return;
  tasks.forEach((task, id) => {
    const block = blocks[id], start = starts[id], conflicts = conflictsFor(id);
    block.hidden = false; block.style.left = taskLeft(Math.floor(start / hoursPerDay), task.people[0]); block.style.top = `${start % hoursPerDay * hourHeight + 3}px`;
    block.classList.toggle('selected', id === selected); block.classList.toggle('pinned', pins.has(id)); block.classList.toggle('conflict', conflicts.length > 0);
    block.innerHTML = `<strong>${pins.has(id) ? '🔒 ' : ''}${task.title}</strong><small>${task.people.map((p) => people[p].split(' · ')[0]).join(' + ')}<br>${clock(start % hoursPerDay)}–${clock(start % hoursPerDay + task.duration)}</small>`;
    block.title = conflicts.join('; ') || 'No visible conflicts';
    block.setAttribute('aria-label', `${task.title}${pins.has(id) ? ', locked' : ''}, ${days[Math.floor(start / hoursPerDay)]} ${clock(start % hoursPerDay)}. ${block.title}`);
  });
  pinButton.textContent = pins.has(selected) ? 'Unlock time' : 'Lock time';
  pinButton.setAttribute('aria-pressed', String(pins.has(selected)));
  const conflicts = conflictsFor(selected);
  requiredElement('task-conflicts', 'p').textContent = conflicts.length
    ? `Current conflicts: ${conflicts.join('; ')}. Replan can move unlocked tasks.`
    : 'No conflicts at the displayed time.';
}

function markPending() {
  status.textContent = 'Draft schedule. Click Replan to schedule tasks near your preferred times. Locked times are required.';
  score.textContent = `${pins.size} locked`;
  render();
}

async function solve() {
  if (busy) return;
  busy = true;
  const controls = [run, reset, pinButton, deadline, executorSelect, taskSelect, daySelect, hourSelect];
  controls.forEach((control) => control.disabled = true);
  status.textContent = 'Solving...';
  score.textContent = `${pins.size} locked`;
  try {
    const answer = await solveProjectCalendar({ pins: [...pins].map(([task, start]) => ({ task, start })), deadline: Number(deadline.value), preferredStarts }, { executor: executor() });
    if (answer.starts) {
      starts = answer.starts;
      status.textContent = `${answer.status}: all constraints satisfied.`;
      score.textContent = `${pins.size} locked · ${answer.shiftHours} daytime hours shifted`;
    } else {
      status.textContent = answer.status === 'INFEASIBLE'
        ? 'No feasible schedule. Unlock a task or extend the deadline, then click Replan. Red blocks show conflicts in the displayed draft.'
        : `No schedule returned (${answer.status}). Try again or loosen the plan.`;
    }
    selectTask(selected);
  } catch (error) { status.textContent = `Solve failed: ${error instanceof Error ? error.message : String(error)}`; }
  finally { busy = false; controls.forEach((control) => control.disabled = false); }
}

taskSelect.addEventListener('change', () => selectTask(Number(taskSelect.value)));
requiredElement('pin-form', 'form').addEventListener('submit', (event) => {
  event.preventDefault(); if (busy) return;
  if (pins.has(selected)) pins.delete(selected);
  else pins.set(selected, starts[selected]);
  markPending();
});
function changeTime() {
  starts[selected] = Number(daySelect.value) * hoursPerDay + Number(hourSelect.value);
  preferredStarts[selected] = starts[selected];
  if (pins.has(selected)) pins.set(selected, starts[selected]);
  markPending();
}
daySelect.addEventListener('change', changeTime);
hourSelect.addEventListener('change', changeTime);
reset.addEventListener('click', () => {
  pins.clear();
  starts = tasks.map((task) => task.preferred);
  preferredStarts = [...starts];
  deadline.value = '40';
  markPending(); selectTask(8);
});
run.addEventListener('click', () => void solve());
deadline.addEventListener('change', markPending);
const code = requiredElement('model-code', 'code'); code.textContent = modelSource; delete code.dataset.highlighted; highlightCodeBlocks();
selectTask(8);
markPending();
