import type { RcpspProblemProto, RcpspRecipeProto, RcpspTaskProto } from './api.js';

function requireFormat(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`RCPSP PSPLIB parser: ${message}`);
}

function integer(token: string, label: string): number {
  requireFormat(/^-?\d+$/.test(token), `${label} must be an integer`);
  const value = Number(token);
  requireFormat(Number.isSafeInteger(value), `${label} must be a safe integer`);
  return value;
}

function numbers(line: string, label: string): number[] {
  return line.split(/\s+/).map(token => integer(token, label));
}

function dataLines(lines: string[], start: number, end: number, header: RegExp): string[] {
  return lines.slice(start + 1, end).filter(line => line && !/^[*-]+$/.test(line) && !header.test(line));
}

/** Standard PSPLIB single/multimode files; renewable and nonrenewable resources. */
export function parsePsplib(text: string): RcpspProblemProto {
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const precedenceStart = lines.findIndex(line => /^PRECEDENCE\s+RELATIONS\s*:?$/i.test(line));
  const requestsStart = lines.findIndex(line => /^REQUESTS\/DURATIONS\s*:?$/i.test(line));
  const availabilityStart = lines.findIndex(line => /^RESOURCE\s*AVAILABILITIES\s*:?$/i.test(line));
  requireFormat(precedenceStart >= 0 && requestsStart > precedenceStart && availabilityStart > requestsStart,
    'unsupported text format or missing sections');

  const header = lines.slice(0, precedenceStart);
  function count(pattern: RegExp, label: string, fallback?: number): number {
    const matching = header.filter(line => pattern.test(line));
    requireFormat(matching.length <= 1, `duplicate ${label}`);
    if (!matching.length) {
      requireFormat(fallback !== undefined, `missing ${label}`);
      return fallback;
    }
    const match = /:\s*(\S+)/.exec(matching[0]);
    requireFormat(match, `missing ${label} value`);
    const value = integer(match[1], label);
    requireFormat(value >= 0, `${label} must be non-negative`);
    return value;
  }
  const jobs = count(/^jobs\s*\(incl\.\s*supersource\/sink\s*\)\s*:/i, 'jobs count');
  requireFormat(jobs >= 2, 'jobs count must include source and sink');
  requireFormat(count(/^projects\s*:/i, 'projects count', 1) === 1, 'multiple projects are unsupported');
  const renewable = count(/^-\s*renewable\s*:/i, 'renewable resource count');
  const nonrenewable = count(/^-\s*nonrenewable\s*:/i, 'nonrenewable resource count', 0);
  requireFormat(count(/^-\s*doubly\s+constrained\s*:/i, 'doubly constrained resource count', 0) === 0,
    'doubly constrained resources are unsupported');
  const numResources = renewable + nonrenewable;
  requireFormat(Number.isSafeInteger(numResources), 'resource count must be a safe integer');
  const resourceNames = Array.from({ length: renewable }, (_, index) => `R${index + 1}`)
    .concat(Array.from({ length: nonrenewable }, (_, index) => `N${index + 1}`));
  for (const line of [
    ...lines.slice(requestsStart + 1, availabilityStart).filter(line => /^jobnr\.?\s/i.test(line)),
    ...lines.slice(availabilityStart + 1).filter(line => /^[RN]\s*\d/i.test(line)),
  ]) {
    const columns = [...line.matchAll(/([RN])\s*(\d+)/gi)].map(match => `${match[1].toUpperCase()}${integer(match[2], 'resource column')}`);
    requireFormat(columns.length === resourceNames.length && columns.every((column, index) => column === resourceNames[index]),
      'resource columns must match declared renewable/nonrenewable order');
  }
  const horizon = header.some(line => /^horizon\s*:/i.test(line)) ? count(/^horizon\s*:/i, 'horizon') : undefined;
  const seed = count(/^initial value random generator\s*:/i, 'random seed', 0);
  const basedata = header.find(line => /^file with basedata\s*:/i.test(line))?.split(':').slice(1).join(':').trim() ?? '';

  const tasks: RcpspTaskProto[] = Array.from({ length: jobs }, (_, index) => ({
    name: `job_${index + 1}`, successors: [], recipes: [],
  }));
  const modeCounts = new Map<number, number>();
  for (const line of dataLines(lines, precedenceStart, requestsStart, /^jobnr\.?\s/i)) {
    const [job, modes, successorCount, ...successors] = numbers(line, 'precedence row');
    requireFormat(job >= 1 && job <= jobs, 'precedence job is out of range');
    requireFormat(!modeCounts.has(job), `duplicate precedence job ${job}`);
    requireFormat(modes > 0 && Number.isSafeInteger(modes), `job ${job} must declare at least one mode`);
    requireFormat(successorCount >= 0 && successors.length === successorCount, `job ${job} successor count does not match row`);
    requireFormat(successors.every(successor => successor >= 1 && successor <= jobs && successor !== job),
      `job ${job} successor is out of range or refers to itself`);
    requireFormat(new Set(successors).size === successors.length, `job ${job} has duplicate successors`);
    modeCounts.set(job, modes);
    tasks[job - 1].successors = successors.map(successor => successor - 1);
  }
  requireFormat(modeCounts.size === jobs, 'precedence rows must cover every declared job');

  let currentJob: number | undefined;
  for (const line of dataLines(lines, requestsStart, availabilityStart, /^jobnr\.?\s/i)) {
    const values = numbers(line, 'request row');
    let mode: number, duration: number, demands: number[];
    if (values.length === 3 + numResources) {
      [currentJob, mode, duration, ...demands] = values;
    } else {
      requireFormat(values.length === 2 + numResources && currentJob !== undefined,
        'request row must contain a job/mode/duration and every resource demand, or a continuation mode');
      [mode, duration, ...demands] = values;
    }
    requireFormat(currentJob !== undefined && modeCounts.has(currentJob), 'request job is out of range');
    requireFormat(mode >= 1 && mode <= modeCounts.get(currentJob)!, `job ${currentJob} mode is out of range`);
    requireFormat(duration >= 0 && demands.every(demand => demand >= 0), 'durations and resource demands must be non-negative');
    const recipes = tasks[currentJob - 1].recipes as RcpspRecipeProto[];
    requireFormat(recipes[mode - 1] === undefined, `duplicate job ${currentJob} mode ${mode}`);
    recipes[mode - 1] = { duration, demands, resources: demands.map((_, index) => index) };
  }
  for (const [job, modes] of modeCounts) {
    const recipes = tasks[job - 1].recipes!;
    requireFormat(recipes.length === modes && Array.from({ length: modes }, (_, index) => recipes[index]).every(Boolean),
      `job ${job} request rows must cover every declared mode`);
  }

  const capacityLines = dataLines(lines, availabilityStart, lines.length, /^(?:[RN]\s*\d+\s*)+$/i);
  requireFormat(numResources === 0 ? capacityLines.length === 0 : capacityLines.length === 1,
    'expected exactly one resource-capacity row');
  const capacities = capacityLines.length ? numbers(capacityLines[0], 'resource capacity') : [];
  requireFormat(capacities.length === numResources && capacities.every(capacity => capacity >= 0),
    'resource capacities must match all declared resources and be non-negative');
  return {
    name: basedata || 'psplib', basedata, seed, horizon,
    resources: capacities.map((capacity, index) => ({
      name: index < renewable ? `R${index + 1}` : `N${index - renewable + 1}`,
      maxCapacity: capacity, renewable: index < renewable,
    })),
    tasks,
  };
}
