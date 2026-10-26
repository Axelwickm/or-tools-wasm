import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aisleZs, warehouse, passageX } from './layout.ts';
import { travelRoute } from './navigation.ts';

test('warehouse: the middle passage is a real shortcut in both directions', () => {
  for (const [first, last, yaw] of [[0, 1, Math.PI], [1, 0, 0]]) {
    const from = { x: passageX, z: aisleZs[first], yaw }, to = { x: passageX, z: aisleZs[last], yaw };
    const path = travelRoute(from, to, 2.86);
    assert.equal(path.length, 1);
    assert.ok(Math.abs(path[0].x - passageX) < 1e-7);
    assert.equal(path[0].z, to.z);
    const shortcut = Math.abs(to.z - from.z);
    const outerDetour = shortcut + warehouse.crossAisleX * 2;
    assert.ok(shortcut < outerDetour / 2);
  }
});

test('warehouse: the full front row requires a detour instead of crossing through shelves', () => {
  const from = { x: 0, z: aisleZs[1], yaw: Math.PI }, to = { x: 0, z: aisleZs[2], yaw: Math.PI };
  const path = travelRoute(from, to, 2.86);
  assert.ok(path.length >= 3);
  assert.ok(path.some((point) => Math.abs(point.x) > 5));
  assert.deepEqual(path[path.length - 1], { x: to.x, z: to.z });
});
