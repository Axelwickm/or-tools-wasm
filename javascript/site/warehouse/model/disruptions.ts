import { aisleZs, crossings, passageX } from './layout.ts';

// One crossing can close without disconnecting the warehouse. Keep the first spill at the offset passage when clear.
export const spillSites = crossings.flatMap((xs, boundary) => xs.map((x) => ({
  boundary, x, z: (aisleZs[boundary] + aisleZs[boundary + 1]) / 2,
  label: Math.abs(x - passageX) < 1e-6 ? 'Middle passage' : `${x < 0 ? 'Left' : 'Right'} crossing ${boundary + 1}`,
}))).sort((a, b) => Number(Math.abs(b.x - passageX) < 1e-6) - Number(Math.abs(a.x - passageX) < 1e-6));
export const spillInterval = 60, spillDuration = 20; // Real, unpaused seconds.
export function segmentHitsSpill(from: { x: number; z: number }, to: { x: number; z: number }, site: number) {
  const spill = spillSites[site], clearance = 1.15;
  return spill.x >= Math.min(from.x, to.x) - clearance && spill.x <= Math.max(from.x, to.x) + clearance
    && spill.z >= Math.min(from.z, to.z) - clearance && spill.z <= Math.max(from.z, to.z) + clearance;
}
