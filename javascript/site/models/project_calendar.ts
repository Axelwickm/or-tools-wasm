import { CpModel, CpSat, sum, type CpSatSolveOptions } from 'or-tools-wasm/cp-sat';

// Integer hours on a compressed working week: Mon 09:00 = 0, Tue 09:00 = 8.
// Tasks cannot cross days. Lunch and leave are fixed resource intervals.
export const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const hoursPerDay = 8;
export const people = ['Ari · design', 'Bo · engineering', 'Cy · launch'];
export const leave = { person: 1, start: 16, duration: 3, label: 'Bo away' };
export type Task = { title: string; duration: number; people: number[]; after: number[]; preferred: number };
export const tasks: Task[] = [
  { title: 'Project brief', duration: 1, people: [0, 1, 2], after: [], preferred: 0 },
  { title: 'Wireframes', duration: 2, people: [0], after: [0], preferred: 1 },
  { title: 'Technical assessment', duration: 2, people: [1], after: [0], preferred: 1 },
  { title: 'Documentation', duration: 2, people: [2], after: [0], preferred: 1 },
  { title: 'Layout design', duration: 2, people: [0], after: [1], preferred: 8 },
  { title: 'Build prototype', duration: 3, people: [1], after: [1, 2], preferred: 8 },
  { title: 'Design review', duration: 1, people: [0, 1], after: [4, 5], preferred: 12 },
  { title: 'Landing page', duration: 2, people: [2], after: [3, 6], preferred: 16 },
  // Deliberate draft conflict: Bo is away at this preferred time. It is not locked.
  { title: 'Integration', duration: 3, people: [1], after: [6], preferred: 16 },
  { title: 'Graphics', duration: 2, people: [0], after: [4], preferred: 17 },
  { title: 'System testing', duration: 2, people: [1, 2], after: [7, 8], preferred: 24 },
  { title: 'Corrections', duration: 2, people: [0, 1], after: [9, 10], preferred: 28 },
  { title: 'Announcement', duration: 1, people: [2], after: [10], preferred: 30 },
  { title: 'Release', duration: 1, people: [0, 1, 2], after: [11, 12], preferred: 32 },
];
export type Pin = { task: number; start: number };
export type CalendarInput = { pins?: Pin[]; deadline?: number; preferredStarts?: number[] };

export async function solveProjectCalendar(
  { pins = [], deadline = 40, preferredStarts = tasks.map((task) => task.preferred) }: CalendarInput = {},
  options: CpSatSolveOptions = {},
) {
  if (!Number.isInteger(deadline) || deadline < 1 || deadline > 40) throw new RangeError('Deadline must be within the working week.');
  if (preferredStarts.length !== tasks.length || preferredStarts.some((start) => !Number.isInteger(start) || start < 0 || start >= 40)) {
    throw new RangeError('Preferred starts must contain one hour within the week per task.');
  }
  for (const pin of pins) {
    if (!Number.isInteger(pin.task) || !tasks[pin.task] || !Number.isInteger(pin.start)
      || pin.start < 0 || pin.start >= 40) throw new RangeError('Invalid task pin.');
  }
  const model = new CpModel();
  const starts = tasks.map((task, i) => model.newIntVar(0, 40 - task.duration, `start_${i}`));
  const intervals = tasks.map((task, i) => model.newFixedSizeIntervalVar(starts[i], task.duration, task.title));
  for (const [i, task] of tasks.entries()) {
    // An allowed-start table keeps a task wholly inside one working day.
    const allowed = days.flatMap((_, day) => Array.from(
      { length: hoursPerDay - task.duration + 1 }, (_, hour) => [day * hoursPerDay + hour],
    ));
    model.addAllowedAssignments([starts[i]], allowed);
    model.add(starts[i].plus(task.duration).le(deadline));
    for (const predecessor of task.after) {
      model.add(starts[i].ge(starts[predecessor].plus(tasks[predecessor].duration)));
    }
  }
  for (let person = 0; person < people.length; person++) {
    const busy = intervals.filter((_, i) => tasks[i].people.includes(person));
    for (let day = 0; day < days.length; day++) {
      busy.push(model.newFixedSizeIntervalVar(day * hoursPerDay + 3, 1, `lunch_${person}_${day}`));
    }
    if (person === leave.person) busy.push(model.newFixedSizeIntervalVar(leave.start, leave.duration, leave.label));
    model.addNoOverlap(busy);
  }
  // Pins are hard constraints: never silently discard one to make a plan fit.
  for (const pin of pins) model.add(starts[pin.task].eq(pin.start));
  const shifts = tasks.map((task, i) => {
    const shift = model.newIntVar(0, 40, `shift_${i}`);
    model.addAbsEquality(shift, starts[i].minus(preferredStarts[i]));
    return shift;
  });
  model.minimize(sum(shifts));
  const answer = await CpSat.solve(model, { numWorkers: 1, maxTimeInSeconds: 5, ...options });
  return {
    status: answer.status,
    shiftHours: answer.objectiveValue,
    starts: answer.hasSolution ? starts.map((start) => Number(answer.value(start))) : null,
  };
}
