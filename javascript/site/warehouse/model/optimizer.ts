import { CpModel, CpSat, sum, type CpSatSolveOptions, type CpSolverResponse } from 'or-tools-wasm/cp-sat';
import type { SolveCandidate, SolveTrace } from './solve_trace.ts';
import { pallets, slots, fitsSlot, shelfInstability } from './layout.ts';
import { demandWeights, expectedSeconds, placementTimings, validateSnapshot, type WarehouseSnapshot } from './efficiency.ts';

export async function optimizePlacement(snapshot: WarehouseSnapshot, options: CpSatSolveOptions = {}) {
  validateSnapshot(snapshot);
  const weights = demandWeights(snapshot.demand);
  const times = placementTimings(snapshot.blockedPassage);
  const before = expectedSeconds(snapshot.placement, snapshot.demand, snapshot.blockedPassage);
  if (before === null) throw new Error('Increase at least one product’s demand before optimizing.');
  const model = new CpModel();
  const choices = pallets.map((_, p) => slots.map((slot) => model.newBoolVar(`p${p}_s${slot.id}`)));
  const locked = new Set(snapshot.locked);
  choices.forEach((row, p) => {
    model.addExactlyOne(row);
    row.forEach((choice, slot) => {
      if (!fitsSlot(p, slot)) model.add(choice.eq(0));
      // Keep an active transfer intact; every movable load must respect the shelf weight limit.
      if (!locked.has(p) && shelfInstability(p, slot) > 0) model.add(choice.eq(0));
      model.addHint(choice, snapshot.placement[p] === slot);
    });
  });
  slots.forEach((slot) => model.addAtMostOne(choices.map((row) => row[slot.id])));
  snapshot.locked.forEach((p) => model.add(choices[p][snapshot.placement[p]].eq(1)));
  // Integer time costs; keeping existing placements breaks ties without overriding a time improvement.
  model.minimize(sum(choices.flatMap((row, p) => row.map((choice, slot) => choice.times(
    Math.round(weights[p] * (times[p][slot].dispatch + times[p][slot].receive) * 10_000) * (pallets.length + 1)
      + (snapshot.placement[p] === slot ? 0 : 1),
  )))));
  // This is a bipartite assignment: include all Boolean constraints in the LP relaxation.
  // The default relaxation leaves CP-SAT searching equivalent pallet permutations for seconds.
  const candidates: SolveCandidate[] = [];
  let solutions = 0;
  const capture = (response: CpSolverResponse) => {
    if (!response.solution?.length) return;
    const placement = choices.map((row) => row.findIndex((choice) => Number(response.solution![choice.index]) === 1));
    if (placement.some((slot) => slot < 0)) return;
    solutions++;
    candidates.push({ placement, seconds: response.wallTime ?? 0, average: expectedSeconds(placement, snapshot.demand, snapshot.blockedPassage)! });
    // Keep the first solution and the most recent improvements; never invent intermediate states.
    if (candidates.length > 12) candidates.splice(1, 1);
  };
  const answer = await CpSat.solve(model, {
    executor: 'direct', numWorkers: 1, linearizationLevel: 2, maxTimeInSeconds: 4, ...options,
    eventMask: { bestBound: false, log: false, ...options.eventMask, solution: true },
    onEvent(event) {
      if (event.type === 'solution') capture(event.response);
      return options.onEvent?.(event);
    },
  });
  if (!answer.hasSolution) throw new Error(`No placement found (${answer.status}). Try again.`);
  const placement = choices.map((row) => row.findIndex((choice) => Number(answer.value(choice)) === 1));
  validateSnapshot({ ...snapshot, placement });
  if (snapshot.locked.some((p) => placement[p] !== snapshot.placement[p])) throw new Error('The active job must stay in place.');
  const after = expectedSeconds(placement, snapshot.demand, snapshot.blockedPassage)!;
  if (!candidates.length && answer.response) capture(answer.response);
  const trace: SolveTrace = { candidates, solutions, branches: Number(answer.response?.numBranches ?? 0),
    conflicts: Number(answer.response?.numConflicts ?? 0), seconds: answer.response?.wallTime ?? 0, status: String(answer.status) };
  // Correcting a top-heavy layout can cost time: never restore an overloaded input layout.
  return { placement, status: answer.status, before, after, trace };
}
