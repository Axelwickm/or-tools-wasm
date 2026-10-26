import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { pallets, rackSegments, slots, shelfInstability } from '../model/layout.ts';
import { WarehouseSimulation } from '../model/simulation.ts';
import { createStabilityVisual } from './stability_visual.ts';

test('warehouse: a top-heavy rack sways as one structure, with fixed feet and attached pallets', () => {
  const simulation = new WarehouseSimulation();
  const scene = new THREE.Scene();
  const rackFrames = rackSegments.map(() => { const frame = new THREE.Group(); frame.matrixAutoUpdate = false; scene.add(frame); return frame; });
  const slotRacks = slots.map((slot) => rackFrames[rackSegments.findIndex((segment) => segment.rack === slot.rack && segment.bays.includes(slot.bay))]);
  const palletGroups = pallets.map((pallet) => {
    const group = new THREE.Group(), slot = slots[pallet.slot];
    group.position.set(slot.x, slot.y, slot.z); slotRacks[slot.id].add(group); return group;
  });
  const note = { textContent: '', dataset: {} } as HTMLElement;
  const visual = createStabilityVisual({ palletGroups, rackFrames, slotRacks }, simulation, note);
  visual.update(.25, false);
  const heavy = pallets.findIndex((p, i) => shelfInstability(i, p.slot) > 0);
  const frame = slotRacks[pallets[heavy].slot];
  const matrix = frame.matrix.clone();
  assert.ok(!matrix.equals(new THREE.Matrix4()));
  // Any point at floor height stays fixed, while the rack top and its load move together.
  const foot = new THREE.Vector3(2, 0, 3);
  assert.ok(frame.localToWorld(foot.clone()).distanceTo(foot) < 1e-9);
  const load = palletGroups[heavy];
  assert.ok(load.getWorldPosition(new THREE.Vector3()).distanceTo(load.position) > .01);
  assert.ok(load.getWorldPosition(new THREE.Vector3()).distanceTo(frame.localToWorld(load.position.clone())) < 1e-9);
  assert.ok(load.quaternion.equals(new THREE.Quaternion()), 'Pallets inherit rack motion instead of wobbling individually');
  visual.update(0, false);
  assert.ok(frame.matrix.equals(matrix), 'Paused motion stays frozen');
  visual.update(1, true);
  assert.ok(rackFrames.every((rack) => rack.matrix.equals(new THREE.Matrix4())));
  assert.ok(Number(note.dataset.unstable) > 0, 'Reduced motion keeps the warning visible');
  visual.dispose();
});
