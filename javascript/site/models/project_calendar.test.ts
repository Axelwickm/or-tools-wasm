import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { terminateLoadedRuntimeThreads } from 'or-tools-wasm/cp-sat';
import { solveProjectCalendar, tasks, people, days, hoursPerDay, leave } from './project_calendar.ts';

after(() => terminateLoadedRuntimeThreads());

function checkSchedule(starts: number[], deadline = 40) {
  assert.equal(starts.length, tasks.length);
  tasks.forEach((task, i) => {
    const start = starts[i], end = start + task.duration;
    assert.ok(Number.isInteger(start) && start >= 0 && end <= deadline);
    assert.ok(start % hoursPerDay + task.duration <= hoursPerDay, `${task.title} crosses days`);
    for (const before of task.after) assert.ok(starts[before] + tasks[before].duration <= start, `${task.title} violates dependency`);
    for (let day = 0; day < days.length; day++) {
      const lunch = day * hoursPerDay + 3;
      assert.ok(end <= lunch || start >= lunch + 1, `${task.title} overlaps lunch`);
    }
    if (task.people.includes(leave.person)) assert.ok(end <= leave.start || start >= leave.start + leave.duration, `${task.title} overlaps leave`);
  });
  for (let person = 0; person < people.length; person++) {
    const assigned = tasks.map((task, i) => ({ task, start: starts[i] })).filter(({ task }) => task.people.includes(person)).sort((a, b) => a.start - b.start);
    for (let i = 1; i < assigned.length; i++) assert.ok(assigned[i - 1].start + assigned[i - 1].task.duration <= assigned[i].start, `${people[person]} double booked`);
  }
}

test('project calendar: every task, dependency, person, lunch and leave fits', async () => {
  const answer = await solveProjectCalendar({}, { executor: 'direct' });
  assert.equal(answer.status, 'OPTIMAL'); assert.ok(answer.starts);
  assert.equal(answer.shiftHours, 3);
  checkSchedule(answer.starts);
  assert.equal(answer.shiftHours, answer.starts.reduce((sum, start, i) => sum + Math.abs(start - tasks[i].preferred), 0));
});

test('project calendar: moving the brief shifts dependent tasks without breaking a pin', async () => {
  const answer = await solveProjectCalendar({ pins: [{ task: 0, start: 8 }] }, { executor: 'direct' });
  assert.ok(answer.starts); checkSchedule(answer.starts); assert.equal(answer.starts[0], 8);
});

test('project calendar: an earlier deadline is honored', async () => {
  const answer = await solveProjectCalendar({ deadline: 32 }, { executor: 'direct' });
  assert.ok(answer.starts); checkSchedule(answer.starts, 32);
});

test('project calendar: impossible pins and deadlines are not silently relaxed', async () => {
  for (const input of [
    { pins: [{ task: 0, start: 3 }] }, // Lunch.
    { pins: [{ task: 8, start: 16 }] }, // Bo is away.
    { pins: [{ task: 1, start: 7 }] }, // Crosses days.
    { pins: [{ task: 6, start: 12 }, { task: 9, start: 12 }] }, // Ari needed twice.
    { pins: [{ task: 0, start: 8 }, { task: 1, start: 1 }] }, // Wrong dependency order.
    { deadline: 8 },
  ]) {
    const answer = await solveProjectCalendar(input, { executor: 'direct' });
    assert.equal(answer.status, 'INFEASIBLE'); assert.equal(answer.starts, null);
  }
});

test('project calendar: invalid input fails before solving', async () => {
  await assert.rejects(solveProjectCalendar({ deadline: NaN }), RangeError);
  await assert.rejects(solveProjectCalendar({ pins: [{ task: 99, start: 0 }] }), RangeError);
  await assert.rejects(solveProjectCalendar({ pins: [{ task: 0, start: 0.5 }] }), RangeError);
  await assert.rejects(solveProjectCalendar({ preferredStarts: [] }), RangeError);
});

test('project calendar: the initial draft has one availability conflict that replanning resolves', async () => {
  const draft = tasks.map((task) => task.preferred);
  assert.equal(draft[8], leave.start);
  assert.ok(tasks[8].people.includes(leave.person));
  // Moving just this task restores an otherwise valid draft.
  draft[8] = 13;
  checkSchedule(draft);
  const answer = await solveProjectCalendar({}, { executor: 'direct' });
  assert.ok(answer.starts);
  checkSchedule(answer.starts);
  assert.notEqual(answer.starts[8], leave.start);
});

test('project calendar: conflicting preferred times remain solvable until locked', async () => {
  const preferredStarts = tasks.map((task) => task.preferred);
  preferredStarts[0] = 3; // Preference overlaps lunch, but is not mandatory.
  preferredStarts[8] = 16; // Preference overlaps leave.
  const answer = await solveProjectCalendar({ preferredStarts }, { executor: 'direct' });
  assert.ok(answer.starts);
  checkSchedule(answer.starts);
  assert.notEqual(answer.starts[0], 3);
  assert.notEqual(answer.starts[8], 16);
  const locked = await solveProjectCalendar({ preferredStarts, pins: [{ task: 0, start: 3 }] }, { executor: 'direct' });
  assert.equal(locked.status, 'INFEASIBLE');
});
