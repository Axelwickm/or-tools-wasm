import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WarehouseSimulation } from './simulation.ts';
import { pallets, slots, staging, receiving, warehouse, aisleZs, crossings, rackSegments } from './layout.ts';
import { goalDuration, actionDuration, drivingSpeed, referenceForklift } from './goals.ts';

const carriedPosition = (sim: WarehouseSimulation) => {
  const f = sim.forklift, reach = warehouse.loadOffset;
  return { x: f.x - Math.sin(f.yaw) * reach, y: f.lift, z: f.z - Math.cos(f.yaw) * reach };
};
const close = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);

test('warehouse: driving is 30% faster with a maximum 1.5x payload penalty', () => {
  const f = referenceForklift();
  const heaviest = pallets.reduce((best, pallet, i) => pallet.weight > pallets[best].weight ? i : best, 0);
  for (const mode of ['travel', 'approach', 'reverse'] as const) {
    close(drivingSpeed(0, mode), (mode === 'travel' ? 2.2 : .8) * 1.3);
    close(drivingSpeed(700, mode), drivingSpeed(0, mode) / 1.5);
    close(drivingSpeed(1400, mode), drivingSpeed(700, mode));
    assert.ok(drivingSpeed(350, mode) > drivingSpeed(700, mode));
    assert.ok(drivingSpeed(350, mode) < drivingSpeed(0, mode));
    const action = { kind: 'drive' as const, mode, x: f.x + 10, z: f.z };
    const empty = actionDuration(action, f);
    f.load = heaviest;
    const heavy = actionDuration(action, f);
    assert.ok(heavy > empty * 1.45 && heavy <= empty * 1.5);
    f.load = null; close(actionDuration(action, f), empty);
  }
  const turn = { kind: 'turn' as const, yaw: 0 }, lift = { kind: 'lift' as const, height: 3 };
  close(actionDuration(turn, f), actionDuration(turn, { ...f, load: heaviest }));
  close(actionDuration(lift, f), actionDuration(lift, { ...f, load: heaviest }));
});

test('warehouse: complete cycles preserve pallets, transfer at forks, and clear racks', () => {
  const sim = new WarehouseSimulation();
  const kinds = new Set<string>();
  let pickups = 0, setdowns = 0, upperPick = false;
  for (let tick = 0; tick < 36_000; tick++) {
    const before = sim.forklift.load;
    const priorLocations = sim.locations.map((location) => ({ ...location }));
    kinds.add(sim.action.kind); sim.advance(.01);
    const f = sim.forklift;
    const carried = sim.locations.flatMap((location, i) => location.kind === 'forklift' ? [i] : []);
    assert.deepEqual(carried, f.load === null ? [] : [f.load]);
    const occupied = sim.locations.flatMap((location) => location.kind === 'slot' ? [location.slot] : []);
    assert.equal(new Set(occupied).size, occupied.length);
    assert.equal(sim.locations.length, pallets.length);
    assert.ok(sim.locations.filter((location) => location.kind === 'staging').length <= 1);
    if (before === null && f.load !== null) {
      pickups++;
      const source = priorLocations[f.load];
      assert.notEqual(source.kind, 'forklift');
      const expected = source.kind === 'slot' ? slots[source.slot] : source.kind === 'receiving' ? receiving : staging;
      const actual = carriedPosition(sim);
      for (const axis of ['x', 'y', 'z'] as const) close(actual[axis], expected[axis], .025);
      if (source.kind === 'slot' && slots[source.slot].level === 2) upperPick = true;
    }
    if (before !== null && f.load === null) {
      setdowns++;
      const destination = sim.locations[before];
      assert.notEqual(destination.kind, 'forklift');
      const expected = destination.kind === 'slot' ? slots[destination.slot] : staging;
      const actual = carriedPosition(sim);
      for (const axis of ['x', 'y', 'z'] as const) close(actual[axis], expected[axis], .025);
    }
    if (sim.action.kind === 'drive' && sim.action.mode === 'travel') {
      close(f.lift, warehouse.carryHeight);
      const aisle = slots.some((slot) => Math.abs(f.z - slot.z - warehouse.aisleOffset) < 1e-7);
      const crossing = crossings.some((xs, i) => f.z >= aisleZs[i] - 1e-7 && f.z <= aisleZs[i + 1] + 1e-7
        && xs.some((x) => Math.abs(f.x - x) < 1e-7));
      assert.ok(aisle || crossing);
    }
    if (sim.action.kind === 'turn' || (sim.action.kind === 'drive' && sim.action.mode === 'travel')) {
      const rectangles = [{ x: .48, z0: .025, z1: 1.375 }];
      if (f.load !== null) rectangles.push({ x: .825, z0: -warehouse.loadOffset - .625, z1: -warehouse.loadOffset + .625 });
      for (const rect of rectangles) for (const x of [-rect.x, rect.x]) for (const z of [rect.z0, rect.z1]) {
        const wx = f.x + Math.cos(f.yaw) * x + Math.sin(f.yaw) * z;
        const wz = f.z - Math.sin(f.yaw) * x + Math.cos(f.yaw) * z;
        assert.ok(Math.abs(wx) < warehouse.width / 2 - .265, `Wall collision at x=${wx}`);
        assert.ok(Math.abs(wz) < warehouse.depth / 2 - .265, `Wall collision at z=${wz}`);
        for (const segment of rackSegments) {
          assert.ok(wx <= segment.minX - .05 || wx >= segment.maxX + .05 || Math.abs(wz - segment.z) >= .92, 'Travel collides with a rack');
          for (const end of [segment.minX - .18, segment.maxX + .18])
            assert.ok(Math.abs(wx - end) >= .06 || Math.abs(wz - segment.z) >= 1.025, 'Travel collides with an end guard');
        }
      }
    }
  }
  assert.deepEqual([...kinds].sort(), ['attach', 'detach', 'drive', 'lift', 'turn', 'wait']);
  assert.ok(sim.deliveries >= 3 && sim.restocks >= 3);
  assert.ok(pickups >= 6 && setdowns >= 6 && upperPick);
});

test('warehouse: timing is independent of render frame size', () => {
  const whole = new WarehouseSimulation(), stepped = new WarehouseSimulation();
  whole.advance(150);
  for (let i = 0; i < 15_000; i++) stepped.advance(.01);
  assert.deepEqual(whole.locations, stepped.locations);
  assert.deepEqual(whole.job, stepped.job);
  assert.equal(whole.action.kind, stepped.action.kind);
  for (const key of ['x', 'z', 'yaw', 'lift'] as const) close(whole.forklift[key], stepped.forklift[key], 1e-6);
  close(whole.distance, stepped.distance, 1e-6);
  assert.throws(() => whole.advance(-1), RangeError);
  assert.throws(() => whole.advance(NaN), RangeError);
});

test('warehouse: event-based goal timing matches the animated executor', () => {
  const sim = new WarehouseSimulation();
  for (let goal = 0; goal < 8; goal++) {
    const expected = goalDuration(sim.job, sim.forklift);
    // Stop exactly on the goal boundary so the next goal shares its real starting pose.
    sim.advance(expected);
    close(sim.lastGoalSeconds, expected, 1e-6);
    assert.equal(sim.completedGoals, goal + 1);
  }
});

test('warehouse: moves and swaps preserve the active job, even while carrying', () => {
  const sim = new WarehouseSimulation();
  while (sim.forklift.load === null) sim.advance(.01);
  const active = sim.job.pallet, reserved = sim.job.slot;
  const editable = pallets.map((_, i) => i).filter((i) => i !== active);
  const [a, b] = editable, from = sim.placement[a], to = sim.placement[b];
  assert.equal(sim.movePallet(active, from), false);
  assert.equal(sim.movePallet(a, reserved), false);
  assert.equal(sim.movePallet(a, to), true);
  assert.equal(sim.placement[b], from);
  const empty = slots.find((slot) => !sim.placement.includes(slot.id))!;
  assert.equal(sim.movePallet(a, empty.id), true);
  const invalid = [...sim.placement]; invalid[a] = invalid[b];
  assert.throws(() => sim.applyPlacement(invalid));
  const placement = [...sim.placement];
  sim.advance(400);
  assert.deepEqual(sim.placement, placement);
  assert.equal(new Set(sim.placement).size, pallets.length);
});

test('warehouse: zero demand finishes current replenishment and then stays idle', () => {
  const sim = new WarehouseSimulation();
  sim.setDemand([0, 0, 0, 0, 0]); sim.advance(200);
  assert.equal(sim.idle, true);
  assert.equal(sim.deliveries, 1); assert.equal(sim.restocks, 1);
  assert.equal(sim.completedGoals, 2);
  sim.setDemand([0, 0, 100, 0, 0]); sim.advance(1);
  assert.equal(sim.idle, false);
  assert.equal(pallets[sim.job.pallet].product.name, 'Care');
});
