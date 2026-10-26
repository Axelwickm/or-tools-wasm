import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aisleZs } from './layout.ts';
import { spillSites, segmentHitsSpill } from './disruptions.ts';
import { travelRoute } from './navigation.ts';
import { WarehouseSimulation } from './simulation.ts';

test('warehouse: every spill leaves a clear detour in both directions', () => {
  spillSites.forEach((site, blocked) => {
    for (const direction of [1, -1]) {
      const from = { x: site.x, z: aisleZs[site.boundary + (direction < 0 ? 1 : 0)], yaw: direction > 0 ? Math.PI : 0 };
      const to = { x: site.x, z: aisleZs[site.boundary + (direction > 0 ? 1 : 0)], yaw: from.yaw };
      const route = travelRoute(from, to, 2.86, blocked);
      assert.ok(route.length >= 3);
      let previous = from;
      for (const point of route) {
        assert.ok(!segmentHitsSpill(previous, point, blocked));
        previous = { ...point, yaw: 0 };
      }
      assert.deepEqual(route[route.length - 1], { x: to.x, z: to.z });
      assert.equal(travelRoute(from, to, 2.86).length, 1, 'Clearing the spill restores the shortcut');
    }
  });
});

test('warehouse: spills start once per real minute, last 20 seconds, and preserve committed jobs', () => {
  const sim = new WarehouseSimulation();
  assert.equal(sim.advanceConditions(59), null);
  const forklift = { ...sim.forklift }, job = { ...sim.job };
  assert.match(sim.advanceConditions(1)!, /Oil spill/);
  assert.notEqual(sim.blockedPassage, null);
  assert.equal(sim.spillRemaining, 20);
  assert.deepEqual(sim.forklift, forklift);
  assert.deepEqual(sim.job, job);
  const revision = sim.revision;
  assert.equal(sim.advanceConditions(19), null);
  assert.equal(sim.spillRemaining, 1);
  assert.equal(sim.advanceConditions(1), 'Oil spill cleared');
  assert.equal(sim.blockedPassage, null);
  assert.equal(sim.revision, revision + 1);
  assert.equal(sim.advanceConditions(39), null);
  assert.match(sim.advanceConditions(1)!, /Oil spill/);
});

test('warehouse: continuous picking never crosses an active spill', () => {
  const sim = new WarehouseSimulation();
  const sites = new Set<number>();
  for (let tick = 0; tick < 2400; tick++) {
    sim.advanceConditions(.1);
    const previous = { ...sim.forklift }, blocked = sim.blockedPassage;
    sim.advance(.4); // Playback is 4×, conditions are real-time.
    if (blocked !== null) {
      sites.add(blocked);
      assert.ok(!segmentHitsSpill(previous, sim.forklift, blocked), `Forklift entered spill ${blocked}`);
    }
  }
  assert.ok(sites.size >= 2);
  assert.ok(sim.deliveries > 10 && sim.restocks > 10);
});
