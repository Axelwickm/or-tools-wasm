import { CpSat, type CpSatModelInstance, type SatParameters } from 'or-tools-wasm/cp-sat';
import { getMaxWorkerCount } from './worker_limits.js';

type Domain = [number, number] | number[];
type LinearConstraint = {
  name?: string;
  linear: { vars: number[]; coeffs: number[]; domain: number[] };
};
type TableConstraint = {
  name?: string;
  table: { vars: number[]; values: number[]; negate?: boolean };
};
type CpModelInput = {
  name: string;
  variables: Array<{ name: string; domain: Domain }>;
  constraints: Array<LinearConstraint | TableConstraint>;
  objective?: { vars: number[]; coeffs: number[]; offset?: number; scaling_factor?: number };
};

type ScheduleCell = { opponent: number; home: boolean };
type ScheduleGrid = ScheduleCell[][];

type SchedulingBuild = {
  model: CpModelInput;
  fixtures: number[][][];
  numTeams: number;
  numDays: number;
};

const statusEl = document.getElementById('status') as HTMLPreElement | null;
const scheduleMessage = document.getElementById('schedule-message') as HTMLElement | null;
const dayGrid = document.getElementById('day-grid') as HTMLElement | null;
const streakPanel = document.getElementById('streak-panel') as HTMLElement | null;
const streakGrid = document.getElementById('streak-grid') as HTMLElement | null;
const scheduleLegend = document.getElementById('schedule-legend') as HTMLElement | null;
const solutionOutput = document.getElementById('solution-output') as HTMLElement | null;
const teamsInput = document.getElementById('teams') as HTMLInputElement | null;
const workerInput = document.getElementById('workers') as HTMLInputElement | null;
const workerBridgeToggle = document.getElementById('use-worker-bridge') as HTMLInputElement | null;
const runButton = document.getElementById('run') as HTMLButtonElement | null;
const stopButton = document.getElementById('stop') as HTMLButtonElement | null;
const readyIndicator = document.getElementById('ready-indicator') as HTMLElement | null;
let currentSchedule: ScheduleGrid | null = null;
let hoveredTeam: number | null = null;
const maxWorkerCount = getMaxWorkerCount();
if (workerInput) {
  workerInput.max = String(maxWorkerCount);
  workerInput.min = '1';
  workerInput.value = String(maxWorkerCount);
}
if (workerBridgeToggle) {
  applyWorkerBridgePreference(true);
  workerBridgeToggle.addEventListener('change', () => {
    const enabled = workerBridgeToggle.checked;
    applyWorkerBridgePreference(enabled);
  });
}

function applyWorkerBridgePreference(enabled: boolean) {
  if (workerBridgeToggle) {
    workerBridgeToggle.checked = enabled;
  }
  CpSat.setExecutor({ type: enabled ? 'worker' : 'direct' });
}

function append(text: string) {
  if (statusEl) {
    statusEl.textContent += `${text}\n`;
  }
}

function setRunning(running: boolean) {
  if (runButton) {
    runButton.disabled = running;
  }
  if (stopButton) {
    stopButton.disabled = !running;
  }
}

function showScheduleMessage(message: string) {
  if (scheduleMessage) {
    scheduleMessage.textContent = message;
  }
  currentSchedule = null;
  hoveredTeam = null;
  if (dayGrid) {
    dayGrid.innerHTML = '';
    dayGrid.classList.toggle('hidden', true);
  }
  if (streakGrid) {
    streakGrid.innerHTML = '';
  }
  if (streakPanel) {
    streakPanel.classList.toggle('hidden', true);
  }
  if (scheduleLegend) {
    scheduleLegend.classList.toggle('hidden', true);
  }
}

function countBreaks(schedule: ScheduleGrid) {
  let breaks = 0;
  for (const row of schedule) {
    for (let day = 0; day < row.length - 1; ++day) {
      if (row[day].home === row[day + 1].home) {
        breaks += 1;
      }
    }
  }
  return breaks;
}

function renderSolution(statusName: string, objectiveValue: number | null | undefined, breaks: number, numTeams: number, numDays: number) {
  if (!solutionOutput) return;
  solutionOutput.innerHTML = `
    <div class="summary-value">${breaks} breaks</div>
    <div><strong>Status:</strong> ${statusName}</div>
    <div><strong>Teams:</strong> ${numTeams}</div>
    <div><strong>Days:</strong> ${numDays}</div>
    <div><strong>Objective:</strong> ${objectiveValue ?? breaks}</div>
  `;
}

function renderSchedule(schedule: ScheduleGrid, numDays: number) {
  if (!dayGrid || !streakGrid) return;
  currentSchedule = schedule;
  dayGrid.innerHTML = '';
  streakGrid.innerHTML = '';
  dayGrid.classList.remove('hidden');
  streakPanel?.classList.remove('hidden');
  scheduleLegend?.classList.remove('hidden');
  streakGrid.style.setProperty('--days', String(numDays));

  const dayCards: string[] = [];
  for (let day = 0; day < numDays; ++day) {
    const seen = new Set<number>();
    const matches: string[] = [];
    for (let team = 0; team < schedule.length; ++team) {
      const match = schedule[team][day];
      if (!match.home || seen.has(team) || seen.has(match.opponent)) continue;
      seen.add(team);
      seen.add(match.opponent);
      const highlighted = hoveredTeam === team || hoveredTeam === match.opponent;
      const dimmed = hoveredTeam !== null && !highlighted;
      matches.push(`
        <div
          class="match-line${highlighted ? ' highlighted' : ''}${dimmed ? ' dimmed' : ''}"
          data-home="${team}"
          data-away="${match.opponent}"
        >
          Team ${team} vs Team ${match.opponent}
        </div>
      `);
    }
    dayCards.push(`
      <section class="day-card">
        <div class="day-title">Day ${day + 1}</div>
        ${matches.join('')}
      </section>
    `);
  }

  const streakCells: string[] = [
    '<div class="streak-header">Team</div>',
    ...Array.from({ length: numDays }, (_, day) => `<div class="streak-header">${day + 1}</div>`),
  ];
  schedule.forEach((row, team) => {
    const rowDimmed = hoveredTeam !== null && hoveredTeam !== team;
    streakCells.push(`<div class="streak-label${rowDimmed ? ' streak-row-dimmed' : ''}">Team ${team}</div>`);
    row.forEach((match, day) => {
      const location = match.home ? 'home' : 'away';
      const isBreak = day > 0 && row[day - 1].home === match.home;
      const label = match.home ? 'H' : 'A';
      streakCells.push(`
        <div
          class="streak-cell ${location}${isBreak ? ' break' : ''}${rowDimmed ? ' streak-row-dimmed' : ''}"
          data-team="${team}"
          title="${match.home ? 'Home vs' : 'Away at'} Team ${match.opponent}"
        >
          ${label}
        </div>
      `);
    });
  });

  if (scheduleMessage) {
    scheduleMessage.textContent = 'Fixture cards show each day. Rhythm strips show each team’s home/away pattern; gold underline marks a break.';
  }
  dayGrid.innerHTML = dayCards.join('');
  streakGrid.innerHTML = streakCells.join('');
}

function setHoveredTeam(team: number | null) {
  if (hoveredTeam === team) return;
  hoveredTeam = team;
  if (currentSchedule) {
    renderSchedule(currentSchedule, currentSchedule[0]?.length ?? 0);
  }
}

function parseSolution(solution: unknown): number[] | null {
  if (!Array.isArray(solution)) return null;
  return solution.map((value) => {
    if (typeof value === 'number') return value;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function createSchedulingModel(numTeams: number): SchedulingBuild {
  if (numTeams % 2 !== 0) {
    throw new Error('Number of teams must be even.');
  }
  if (numTeams < 2) {
    throw new Error('At least two teams are required.');
  }

  const numDays = 2 * numTeams - 2;
  const matchesPerHalf = numTeams - 1;

  const variables: CpModelInput['variables'] = [];
  const constraints: CpModelInput['constraints'] = [];

  const addVar = (name: string, domain: Domain) => {
    const index = variables.length;
    variables.push({ name, domain });
    return index;
  };

  const addLinear = (name: string, vars: number[], coeffs: number[], domain: number[]) => {
    constraints.push({ name, linear: { vars, coeffs, domain } });
  };

  const fixtures: number[][][] = [];
  for (let day = 0; day < numDays; ++day) {
    fixtures[day] = [];
    for (let home = 0; home < numTeams; ++home) {
      fixtures[day][home] = [];
      for (let away = 0; away < numTeams; ++away) {
        if (home === away) {
          fixtures[day][home][away] = -1;
        } else {
          fixtures[day][home][away] = addVar(
            `fixture_d${day}_h${home}_a${away}`,
            [0, 1],
          );
        }
      }
    }
  }

  const atHome: number[][] = [];
  for (let day = 0; day < numDays; ++day) {
    atHome[day] = [];
    for (let team = 0; team < numTeams; ++team) {
      atHome[day][team] = addVar(`at_home_d${day}_t${team}`, [0, 1]);
    }
  }

  // Each team plays exactly one opponent per day.
  for (let day = 0; day < numDays; ++day) {
    for (let team = 0; team < numTeams; ++team) {
      const vars: number[] = [];
      const coeffs: number[] = [];
      for (let other = 0; other < numTeams; ++other) {
        if (team === other) continue;
        vars.push(fixtures[day][team][other]);
        coeffs.push(1);
        vars.push(fixtures[day][other][team]);
        coeffs.push(1);
      }
      addLinear(`plays_once_d${day}_t${team}`, vars, coeffs, [1, 1]);
    }
  }

  // Each ordered pair plays exactly once per season.
  for (let team = 0; team < numTeams; ++team) {
    for (let other = 0; other < numTeams; ++other) {
      if (team === other) continue;
      const vars: number[] = [];
      const coeffs: number[] = [];
      for (let day = 0; day < numDays; ++day) {
        vars.push(fixtures[day][team][other]);
        coeffs.push(1);
      }
      addLinear(`once_per_season_t${team}_o${other}`, vars, coeffs, [1, 1]);
    }
  }

  // Split season: encounter each opponent once per half.
  for (let team = 0; team < numTeams; ++team) {
    for (let other = 0; other < numTeams; ++other) {
      if (team === other) continue;
      const firstHalfVars: number[] = [];
      const firstHalfCoeffs: number[] = [];
      const secondHalfVars: number[] = [];
      const secondHalfCoeffs: number[] = [];
      for (let day = 0; day < matchesPerHalf; ++day) {
        firstHalfVars.push(fixtures[day][team][other]);
        firstHalfCoeffs.push(1);
        firstHalfVars.push(fixtures[day][other][team]);
        firstHalfCoeffs.push(1);

        const secondDay = day + matchesPerHalf;
        secondHalfVars.push(fixtures[secondDay][team][other]);
        secondHalfCoeffs.push(1);
        secondHalfVars.push(fixtures[secondDay][other][team]);
        secondHalfCoeffs.push(1);
      }
      addLinear(`first_half_${team}_${other}`, firstHalfVars, firstHalfCoeffs, [1, 1]);
      addLinear(`second_half_${team}_${other}`, secondHalfVars, secondHalfCoeffs, [1, 1]);
    }
  }

  // Link at_home variables.
  for (let day = 0; day < numDays; ++day) {
    for (let team = 0; team < numTeams; ++team) {
      const vars: number[] = [];
      const coeffs: number[] = [];
      for (let other = 0; other < numTeams; ++other) {
        if (team === other) continue;
        vars.push(fixtures[day][team][other]);
        coeffs.push(1);
      }
      vars.push(atHome[day][team]);
      coeffs.push(-1);
      addLinear(`link_home_d${day}_t${team}`, vars, coeffs, [0, 0]);
    }
  }

  // No three consecutive homes or aways.
  for (let team = 0; team < numTeams; ++team) {
    for (let start = 0; start < numDays - 2; ++start) {
      const homeVars: number[] = [];
      const coeffs = [1, 1, 1];
      homeVars.push(atHome[start][team], atHome[start + 1][team], atHome[start + 2][team]);
      addLinear(`no_three_home_t${team}_s${start}`, homeVars, coeffs, [0, 2]);
      addLinear(`no_three_away_t${team}_s${start}`, homeVars, coeffs, [1, 3]);
    }
  }

  const breakVars: number[] = [];
  for (let team = 0; team < numTeams; ++team) {
    for (let day = 0; day < numDays - 1; ++day) {
      const breakVar = addVar(`break_t${team}_d${day}`, [0, 1]);
      breakVars.push(breakVar);
      constraints.push({
        name: `break_table_t${team}_d${day}`,
        table: {
          vars: [atHome[day][team], atHome[day + 1][team], breakVar],
          values: [0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1],
        },
      });
    }
  }

  if (breakVars.length) {
    const coeffs = Array(breakVars.length).fill(1);
    const minBreaks = Math.max(0, 2 * numTeams - 4);
    addLinear('min_breaks', breakVars, coeffs, [minBreaks, breakVars.length]);
  }

  const objective =
    breakVars.length > 0
      ? {
        vars: breakVars,
        coeffs: Array(breakVars.length).fill(1),
        offset: 0,
        scaling_factor: 1,
      }
      : undefined;

  return {
    model: {
      name: `sports_scheduling_${numTeams}`,
      variables,
      constraints,
      objective,
    },
    fixtures,
    numTeams,
    numDays,
  };
}

function extractSchedule(
  solution: number[],
  fixtures: number[][][],
  numTeams: number,
  numDays: number,
): ScheduleGrid {
  const schedule: ScheduleGrid = [];
  const readValue = (index: number) => solution[index] ?? 0;

  for (let team = 0; team < numTeams; ++team) {
    const row: ScheduleCell[] = [];
    for (let day = 0; day < numDays; ++day) {
      let opponent = -1;
      let home = false;
      for (let other = 0; other < numTeams; ++other) {
        if (team === other) continue;
        const homeVar = fixtures[day][team][other];
        if (homeVar >= 0 && readValue(homeVar) === 1) {
          opponent = other;
          home = true;
          break;
        }
        const awayVar = fixtures[day][other][team];
        if (awayVar >= 0 && readValue(awayVar) === 1) {
          opponent = other;
          home = false;
          break;
        }
      }
      row.push({ opponent, home });
    }
    schedule.push(row);
  }
  return schedule;
}

async function runSportsScheduling() {
  if (!teamsInput || !workerInput) {
    append('Missing configuration inputs.');
    return;
  }

  const numTeams = Math.max(2, Number.parseInt(teamsInput.value, 10) || 2);
  if (numTeams % 2 !== 0) {
    append('Number of teams must be even.');
    showScheduleMessage('Please enter an even number of teams (≥2).');
    return;
  }

  const requestedWorkers = Number.parseInt(workerInput.value, 10) || 1;
  const workers = Math.min(Math.max(1, requestedWorkers), maxWorkerCount);
  workerInput.value = String(workers);
  append(`Building sports scheduling model (teams=${numTeams})…`);
  showScheduleMessage('Solving…');
  if (solutionOutput) solutionOutput.textContent = 'Solving...';

  setRunning(true);
  try {
    let build: SchedulingBuild;
    try {
      build = createSchedulingModel(numTeams);
    } catch (err) {
      append(`Model creation failed: ${(err as Error).message}`);
      showScheduleMessage('Model creation failed.');
      return;
    }

    let model: CpSatModelInstance;
    try {
      model = await CpSat.createModel(build.model);
    } catch (err) {
      append(`Model build failed: ${(err as Error).message}`);
      showScheduleMessage('Model build failed.');
      return;
    }

    const validation = await CpSat.validate(model);
    if (!validation.ok) {
      append(`Model invalid: ${validation.message}`);
      showScheduleMessage('Model invalid.');
      return;
    }

    const params: SatParameters = {
      logSearchProgress: true,
    };
    if (workers > 0) {
      params.numWorkers = workers;
    }
    console.debug('[SportsScheduling] solve params', {
      numWorkers: params.numWorkers ?? 'default',
    });

    append('Solving…');
    try {
      const result = await CpSat.solve(model, { solverParameters: params });
      const response = result.response;
      if (!response || !statusEl) {
        append('Solver returned no response.');
        showScheduleMessage('Solver returned no response.');
        return;
      }
      statusEl.textContent = [
        `Status: ${response.status}`,
        `Objective: ${response.objectiveValue ?? 'NA'}`,
        `Best bound: ${response.bestObjectiveBound ?? 'NA'}`,
        `Wall time: ${response.wallTime ?? 'NA'}`,
      ].join('\n');
      const values = parseSolution(response.solution);
      if (!values) {
        showScheduleMessage('Unable to parse solver solution.');
        return;
      }
      const schedule = extractSchedule(values, build.fixtures, build.numTeams, build.numDays);
      const breaks = countBreaks(schedule);
      renderSchedule(schedule, build.numDays);
      renderSolution(String(response.status ?? 'UNKNOWN'), response.objectiveValue, breaks, build.numTeams, build.numDays);
    } catch (err) {
      append(`Solve failed: ${(err as Error).message}`);
      showScheduleMessage('Solve failed.');
    }
  } finally {
    setRunning(false);
  }
}

if (runButton) {
  runButton.addEventListener('click', () => {
    void runSportsScheduling();
  });
}

dayGrid?.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const match = target.closest<HTMLElement>('[data-home]');
  if (!match) return;
  setHoveredTeam(Number(match.dataset.home));
});
dayGrid?.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && dayGrid.contains(relatedTarget)) return;
  setHoveredTeam(null);
});
streakGrid?.addEventListener('pointerover', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const cell = target.closest<HTMLElement>('[data-team]');
  if (!cell) return;
  setHoveredTeam(Number(cell.dataset.team));
});
streakGrid?.addEventListener('pointerout', (event) => {
  const relatedTarget = event.relatedTarget;
  if (relatedTarget instanceof Element && streakGrid.contains(relatedTarget)) return;
  setHoveredTeam(null);
});

if (stopButton) {
  stopButton.disabled = true;
  stopButton.addEventListener('click', () => {
    append('Cancellation requested.');
    void CpSat.cancelSolve().catch((err) => {
      append(`Cancellation failed: ${(err as Error).message}`);
    });
  });
}
