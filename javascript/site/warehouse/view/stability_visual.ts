import * as THREE from 'three';
import { arrangeCrates, palletBase, pallets, shelfInstability } from '../model/layout.ts';
import type { WarehouseSimulation } from '../model/simulation.ts';

/** Illustrative sway, not a structural physics model. Pause freezes it; reduced motion disables it. */
export function createStabilityVisual(world: { palletGroups: THREE.Group[]; rackFrames: THREE.Group[]; slotRacks: THREE.Group[] }, simulation: WarehouseSimulation, note: HTMLElement) {
  const { palletGroups: groups, rackFrames, slotRacks } = world;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const edges = new THREE.EdgesGeometry(box); box.dispose();
  const material = new THREE.LineBasicMaterial({ color: '#d48824' });
  const outlines = groups.map((group, i) => {
    const { width, depth, height } = arrangeCrates(pallets[i].crates).size;
    const outline = new THREE.LineSegments(edges, material);
    outline.scale.set(width + .1, height + .1, depth + .1);
    outline.position.y = palletBase.height + height / 2;
    outline.visible = false; group.add(outline); return outline;
  });
  let phase = 0;
  return {
    update(dt: number, reducedMotion: boolean, flying?: ReadonlyMap<number, unknown>) {
      phase += dt;
      let count = 0;
      const risks = new Map<THREE.Group, number>();
      simulation.locations.forEach((location, i) => {
        const risk = shelfInstability(i, simulation.placement[i]);
        if (risk > 0) count++;
        const visible = risk > 0 && location.kind === 'slot' && !flying?.has(i);
        outlines[i].visible = visible;
        if (visible && location.kind === 'slot') {
          const rack = slotRacks[location.slot];
          risks.set(rack, Math.max(risks.get(rack) ?? 0, risk));
        }
      });
      rackFrames.forEach((frame, i) => {
        const risk = risks.get(frame) ?? 0;
        const amplitude = risk > 0 && !reducedMotion ? (.018 + .055 * risk) / 3 : 0;
        // Flex the entire frame above fixed feet; all shelves and stored pallets inherit the sway.
        frame.matrix.makeShear(0, 0, amplitude * Math.sin(phase * 3.6 + i * 1.7), amplitude * .5 * Math.sin(phase * 2.7 + i), 0, 0);
        frame.matrixWorldNeedsUpdate = true;
      });
      const active = count === 1 && !simulation.idle && shelfInstability(simulation.job.pallet, simulation.job.slot) > 0;
      const text = count ? `${count} top-heavy ${count === 1 ? 'load' : 'loads'} · ${active ? 'Active job reserved' : 'Optimize to lower them'}` : 'Heavy loads stored low';
      if (note.textContent !== text) note.textContent = text;
      if (note.dataset.unstable !== String(count)) note.dataset.unstable = String(count);
    },
    dispose() { outlines.forEach((outline) => outline.removeFromParent()); edges.dispose(); material.dispose(); },
  };
}
