import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrangeCrates, layout, palletBase, pallets, slots, rackBays, rackSegments, rackWidth, passage, passageX, type Crate } from './layout.ts';

test('warehouse: crate stacks fit the pallets and shelf clearance without intersections', () => {
  const ids = new Set<string>();
  const sizes = new Set<string>();
  for (const pallet of pallets) {
    const { boxes, size } = arrangeCrates(pallet.crates);
    assert.ok(size.width <= palletBase.width && size.depth <= palletBase.depth);
    assert.ok(palletBase.height + size.height + .12 < layout.levelHeight - .1);
    const bounds = boxes.map(({ crate, position: [x, y, z] }) => {
      assert.ok(!ids.has(crate.id)); ids.add(crate.id); sizes.add(JSON.stringify(crate.size));
      const half = [crate.size.width / 2, crate.size.height / 2, crate.size.depth / 2];
      const center = [x, y, z];
      return { min: center.map((v, i) => v - half[i]), max: center.map((v, i) => v + half[i]) };
    });
    for (let i = 0; i < bounds.length; i++) for (let j = i + 1; j < bounds.length; j++) {
      assert.ok([0, 1, 2].some((axis) => bounds[i].max[axis] <= bounds[j].min[axis] + 1e-8 || bounds[j].max[axis] <= bounds[i].min[axis] + 1e-8));
    }
  }
  assert.equal(ids.size, pallets.length * 8);
  assert.equal(sizes.size, 5);
});

test('warehouse: individual crate dimensions change the stack geometry', () => {
  const crates: Crate[] = Array.from({ length: 5 }, (_, i) => ({ id: `C${i}`, size: { width: .4, depth: .3, height: .2 } }));
  crates[4].size = { width: .6, depth: .4, height: .5 };
  const { boxes, size } = arrangeCrates(crates);
  assert.ok(Math.abs(size.width - 1.02) < 1e-8);
  assert.ok(Math.abs(size.depth - .72) < 1e-8);
  assert.ok(Math.abs(size.height - .7) < 1e-8);
  // The larger upper crate sits directly on its supporting crate.
  assert.equal(boxes[4].position[1] - .25, palletBase.height + .2);
  assert.throws(() => arrangeCrates([{ id: 'invalid', size: { width: 0, height: .2, depth: .3 } }]), RangeError);
});

test('warehouse: row ends align and only the middle row has an offset passage', () => {
  assert.equal(slots.length, 36);
  assert.notEqual(passageX, 0);
  for (let rack = 0; rack < layout.racks; rack++) {
    const segments = rackSegments.filter((segment) => segment.rack === rack);
    assert.ok(Math.abs(Math.min(...segments.map((segment) => segment.minX)) + rackWidth / 2) < 1e-7);
    assert.ok(Math.abs(Math.max(...segments.map((segment) => segment.maxX)) - rackWidth / 2) < 1e-7);
  }
  assert.deepEqual(rackBays.map((bays) => bays.length), [4, 4, 4]);
  assert.equal(rackSegments.filter((segment) => segment.rack === 1).length, 2);
  assert.ok(slots.every((slot) => rackBays[slot.rack].includes(slot.bay)));
  assert.ok(!slots.some((slot) => slot.rack === 1 && Math.abs(slot.x - passageX) < passage.width / 2));
  assert.equal(slots.find((slot) => slot.rack === 0 && slot.bay === 0)!.x, slots.find((slot) => slot.rack === 2 && slot.bay === 0)!.x);
});
