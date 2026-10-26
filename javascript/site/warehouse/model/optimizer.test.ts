import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { terminateLoadedRuntimeThreads } from 'or-tools-wasm/cp-sat';
import { pallets, slots, defaultDemand, fitsSlot, shelfInstability } from './layout.ts';
import { expectedSeconds } from './efficiency.ts';
import { optimizePlacement } from './optimizer.ts';
after(() => terminateLoadedRuntimeThreads());

test('warehouse: CP-SAT improves handling time while preserving stock and the active job', async () => {
  const state = { placement: pallets.map((p) => p.slot), demand: [...defaultDemand], locked: [5] };
  const original = structuredClone(state);
  const emitted: number[][] = [];
  const result = await optimizePlacement(state, { onEvent(event) {
    if (event.type === 'solution') emitted.push(pallets.map((_, p) => slots.findIndex((slot) => Number(event.response.solution?.[p * slots.length + slot.id]) === 1)));
  } });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(new Set(result.placement).size, pallets.length);
  assert.equal(result.placement[5], state.placement[5]);
  result.placement.forEach((slot, p) => assert.ok(fitsSlot(p, slot)));
  result.placement.forEach((slot, p) => { if (!state.locked.includes(p)) assert.equal(shelfInstability(p, slot), 0); });
  assert.ok(result.after < result.before - 1, `Expected a measurable improvement: ${result.before} → ${result.after}`);
  assert.equal(result.after, expectedSeconds(result.placement, state.demand));
  assert.deepEqual(state, original);
  assert.ok(result.trace.solutions > 0 && result.trace.candidates.length <= 12);
  assert.equal(result.trace.solutions, emitted.length);
  assert.ok(result.trace.seconds > 0 && result.trace.branches >= 0);
  for (const candidate of result.trace.candidates) {
    assert.ok(emitted.some((placement) => placement.every((slot, p) => slot === candidate.placement[p])));
    assert.equal(new Set(candidate.placement).size, pallets.length);
    assert.equal(candidate.placement[5], state.placement[5]);
    candidate.placement.forEach((slot, p) => assert.ok(fitsSlot(p, slot)));
    candidate.placement.forEach((slot, p) => { if (!state.locked.includes(p)) assert.equal(shelfInstability(p, slot), 0); });
    assert.equal(candidate.average, expectedSeconds(candidate.placement, state.demand));
    assert.ok(candidate.seconds <= result.trace.seconds);
  }
});

test('warehouse: concentrated demand reaches optimality and optimizing twice keeps the layout', async () => {
  const state = { placement: pallets.map((p) => p.slot), demand: [100, 0, 0, 0, 0], locked: [6] };
  const first = await optimizePlacement(state);
  assert.equal(first.status, 'OPTIMAL');
  const second = await optimizePlacement({ ...state, placement: first.placement });
  assert.equal(second.status, 'OPTIMAL');
  assert.deepEqual(second.placement, first.placement);
  assert.equal(second.after, first.after);
});

test('warehouse: optimizer rejects zero demand and conflicting placements', async () => {
  const state = { placement: pallets.map((p) => p.slot), demand: [0, 0, 0, 0, 0], locked: [] };
  await assert.rejects(optimizePlacement(state), /demand/);
  state.placement[0] = state.placement[1];
  await assert.rejects(optimizePlacement(state), /snapshot/);
});

test('warehouse: an active top-heavy load stays reserved while other overloads are corrected', async () => {
  const placement = pallets.map((p) => p.slot);
  const locked = placement.findIndex((slot, p) => shelfInstability(p, slot) > 0);
  assert.ok(locked >= 0);
  const result = await optimizePlacement({ placement, demand: [...defaultDemand], locked: [locked] });
  assert.equal(result.placement[locked], placement[locked]);
  result.placement.forEach((slot, p) => { if (p !== locked) assert.equal(shelfInstability(p, slot), 0); });
  const unlocked = await optimizePlacement({ placement: result.placement, demand: [...defaultDemand], locked: [] });
  unlocked.placement.forEach((slot, p) => assert.equal(shelfInstability(p, slot), 0));
});

test('warehouse: correcting shelf overloads takes precedence over a faster invalid layout', async () => {
  const demand = [...defaultDemand];
  const baseline = await optimizePlacement({ placement: pallets.map((p) => p.slot), demand, locked: [] });
  let invalid: number[] | undefined;
  for (let p = 0; p < pallets.length && !invalid; p++) for (let q = p + 1; q < pallets.length; q++) {
    const placement = [...baseline.placement];
    [placement[p], placement[q]] = [placement[q], placement[p]];
    if (placement.some((slot, i) => shelfInstability(i, slot) > 0) && expectedSeconds(placement, demand)! < baseline.after - .01) {
      invalid = placement; break;
    }
  }
  assert.ok(invalid, 'Fixture must contain a faster arrangement that exceeds shelf limits');
  const corrected = await optimizePlacement({ placement: invalid, demand, locked: [] });
  corrected.placement.forEach((slot, p) => assert.equal(shelfInstability(p, slot), 0));
  assert.ok(corrected.after > corrected.before);
  assert.equal(corrected.after, expectedSeconds(corrected.placement, demand));
});

test('warehouse: optimizing during a spill uses detour costs and keeps shelf limits', async () => {
  const state = { placement: pallets.map((p) => p.slot), demand: [...defaultDemand], locked: [] };
  const clear = await optimizePlacement(state);
  const blockedPassage = 2;
  const result = await optimizePlacement({ ...state, placement: clear.placement, blockedPassage });
  assert.equal(result.status, 'OPTIMAL');
  assert.equal(result.before, expectedSeconds(clear.placement, state.demand, blockedPassage));
  assert.equal(result.after, expectedSeconds(result.placement, state.demand, blockedPassage));
  assert.ok(result.after < result.before, 'Placement should adapt to the detour');
  result.placement.forEach((slot, p) => assert.equal(shelfInstability(p, slot), 0));
  result.trace.candidates.forEach((candidate) => assert.equal(candidate.average, expectedSeconds(candidate.placement, state.demand, blockedPassage)));
});
