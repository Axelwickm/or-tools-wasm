import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pallets, slots, defaultDemand } from './layout.ts';
import { EfficiencySampler, expectedSeconds, randomPlacement, placementTimes, placementTimings, type WarehouseSnapshot } from './efficiency.ts';
import { fitsSlot } from './layout.ts';

const snapshot = (): WarehouseSnapshot => ({ placement: pallets.map((p) => p.slot), demand: [...defaultDemand], locked: [] });
test('warehouse: current-layout costs distinguish heavy and light pallets in the same slot', () => {
  const light = 0, heavy = 20; // Same product and demand; different payload weights.
  assert.equal(pallets[light].product, pallets[heavy].product);
  assert.ok(pallets[heavy].weight > pallets[light].weight);
  assert.ok(placementTimes[heavy][0].dispatch > placementTimes[light][0].dispatch);
  assert.ok(placementTimes[heavy][0].receive > placementTimes[light][0].receive);
  const state = snapshot();
  state.placement[light] = 0; state.placement[heavy] = slots.length - 1;
  const before = expectedSeconds(state.placement, state.demand)!;
  [state.placement[light], state.placement[heavy]] = [state.placement[heavy], state.placement[light]];
  assert.notEqual(expectedSeconds(state.placement, state.demand), before);
});
test('warehouse: randomized placement preserves the active job and fits all stock', () => {
  const state = snapshot(); state.locked = [6];
  const original = structuredClone(state);
  const placement = randomPlacement(state, () => .37);
  assert.notDeepEqual(placement, state.placement);
  assert.equal(placement[6], state.placement[6]);
  assert.equal(new Set(placement).size, pallets.length);
  placement.forEach((slot, p) => assert.ok(fitsSlot(p, slot)));
  assert.deepEqual(state, original);
});
test('warehouse: trials converge on current-state cost without modifying inventory', () => {
  const state = snapshot(), original = structuredClone(state), sampler = new EfficiencySampler(state);
  let total = 0;
  for (let i = 0; i < 2_000; i++) total += sampler.sample(8)!.average;
  assert.ok(Math.abs(total / 2_000 - expectedSeconds(state.placement, state.demand)!) < .3);
  assert.deepEqual(state, original);
  assert.equal(sampler.sample()!.jobs, 200);
});

test('warehouse: demand and layout edits change the rolling estimate; zero demand generates no jobs', () => {
  const state = snapshot(), sampler = new EfficiencySampler(state);
  const old = sampler.sample(100)!;
  state.demand = [100, 0, 0, 0, 0];
  state.placement.reverse(); sampler.update(state);
  let total = 0;
  for (let i = 0; i < 1_000; i++) total += sampler.sample(8)!.average;
  const expected = expectedSeconds(state.placement, state.demand)!;
  assert.ok(Math.abs(total / 1_000 - expected) < .3);
  assert.ok(Math.abs(old.average - expected) > .1);
  state.demand.fill(0); sampler.update(state); assert.equal(sampler.sample(), null);
  assert.equal(expectedSeconds(state.placement, state.demand), null);
  state.placement[0] = state.placement[1]; assert.throws(() => sampler.update(state));
});

test('warehouse: the rolling estimate follows blocked routes and reuses cached timings', () => {
  const state = snapshot(), sampler = new EfficiencySampler(state);
  sampler.sample(100);
  state.blockedPassage = 1;
  const expected = expectedSeconds(state.placement, state.demand, state.blockedPassage)!;
  assert.ok(expected > expectedSeconds(state.placement, state.demand)!);
  sampler.update(state);
  let total = 0;
  for (let i = 0; i < 1000; i++) total += sampler.sample(24)!.average;
  assert.ok(Math.abs(total / 1000 - expected) < .3);
  assert.equal(placementTimings(1), placementTimings(1));
  assert.equal(placementTimings(null), placementTimes);
  assert.throws(() => sampler.update({ ...state, blockedPassage: 100 }), /snapshot/);
});
