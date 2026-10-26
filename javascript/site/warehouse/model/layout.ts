export type CrateSize = { width: number; depth: number; height: number }; // Metres, matching scene units.
export type Crate = { id: string; size: CrateSize };
export const palletBase = { width: 1.65, depth: 1.25, height: .2 };
export const products = [
  { name: 'Pantry', color: '#e68d73', crateSize: { width: .62, depth: .48, height: .3 } },
  { name: 'Home', color: '#e3b65f', crateSize: { width: .72, depth: .54, height: .42 } },
  { name: 'Care', color: '#76b7a5', crateSize: { width: .56, depth: .42, height: .36 } },
  { name: 'Equipment', color: '#83a8cf', crateSize: { width: .78, depth: .58, height: .5 } },
  { name: 'Textiles', color: '#ab9ac8', crateSize: { width: .68, depth: .52, height: .44 } },
];

/** Stack crates in four columns; dimensions determine spacing and each stack's height. */
export function arrangeCrates(crates: readonly Crate[]) {
  const gap = .02;
  const widths = [0, 0], depths = [0, 0], heights = [0, 0, 0, 0];
  crates.forEach(({ size }, i) => {
    if (Object.values(size).some((value) => !Number.isFinite(value) || value <= 0)) throw new RangeError('Crate dimensions must be positive.');
    widths[i % 2] = Math.max(widths[i % 2], size.width);
    depths[Math.floor(i / 2) % 2] = Math.max(depths[Math.floor(i / 2) % 2], size.depth);
  });
  const width = widths[0] + widths[1] + (widths[1] ? gap : 0);
  const depth = depths[0] + depths[1] + (depths[1] ? gap : 0);
  const boxes = crates.map((crate, i) => {
    const col = i % 2, row = Math.floor(i / 2) % 2, stack = i % 4;
    const position: [number, number, number] = [
      -width / 2 + (col ? widths[0] + gap : 0) + widths[col] / 2,
      palletBase.height + heights[stack] + crate.size.height / 2,
      -depth / 2 + (row ? depths[0] + gap : 0) + depths[row] / 2,
    ];
    heights[stack] += crate.size.height;
    return { crate, position };
  });
  return { boxes, size: { width, depth, height: Math.max(...heights) } };
}
export const layout = { racks: 3, bays: 4, levels: 3, bayWidth: 2.2, rackSpacing: 5.6, levelHeight: 1.55 };
// Demo limits, bottom to top. Manual layouts may exceed these; the optimizer corrects them.
export const shelfWeightLimits = [700, 550, 400] as const;
export function shelfInstability(pallet: number, slot: number) {
  const limit = shelfWeightLimits[slots[slot].level];
  return Math.max(0, (pallets[pallet].weight - limit) / Math.max(1, shelfWeightLimits[0] - limit));
}
export const rackName = (rack: number) => String.fromCharCode(65 + rack);
export const rackZ = (rack: number) => (rack - (layout.racks - 1) / 2) * layout.rackSpacing;
export const passage = { rack: 1, afterBay: 0, width: 2.6 };
export const rackWidth = layout.bays * layout.bayWidth + passage.width;
export const bayWidth = (rack: number) => rack === passage.rack ? layout.bayWidth : rackWidth / layout.bays;
export const bayX = (bay: number, rack = 0) => -rackWidth / 2 + (bay + .5) * bayWidth(rack)
  + (rack === passage.rack && bay > passage.afterBay ? passage.width : 0);
export const passageX = -rackWidth / 2 + (passage.afterBay + 1) * layout.bayWidth + passage.width / 2;
// All row ends align. The middle row has one bay left of the passage and three right of it.
export const rackBays = Array.from({ length: layout.racks }, () => [0, 1, 2, 3]);
export const rackSegments = rackBays.flatMap((bays, rack) => {
  const runs: number[][] = [];
  for (const bay of bays) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(bayX(bay, rack) - bayX(last[last.length - 1], rack) - bayWidth(rack)) < 1e-6) last.push(bay); else runs.push([bay]);
  }
  return runs.map((run) => ({ rack, bays: run, z: rackZ(rack),
    minX: bayX(run[0], rack) - bayWidth(rack) / 2,
    maxX: bayX(run[run.length - 1], rack) + bayWidth(rack) / 2,
  }));
});
export const slots = rackBays.flatMap((bays, rack) => Array.from({ length: layout.levels }, (_, level) =>
  bays.map((bay) => ({ rack, level, bay, width: bayWidth(rack), x: bayX(bay, rack), y: .4 + level * layout.levelHeight, z: rackZ(rack) })),
).flat()).map((slot, id) => ({ ...slot, id }));
export const slotCount = slots.length;
// Leave roughly one quarter of the available slots free for rearrangement.
const occupied = slots.filter(({ id }) => id % 4 !== 3);
export const pallets = occupied.map((slot, i) => {
  const id = `P${String(i + 1).padStart(2, '0')}`, product = products[i % products.length];
  return {
    id, product, slot: slot.id, rack: slot.rack, level: slot.level, bay: slot.bay,
    crates: Array.from({ length: 8 }, (_, index): Crate => ({ id: `${id}-C${index + 1}`, size: { ...product.crateSize } })),
    weight: 180 + (i * 73) % 500, picks: 2 + (i * 7) % 23,
  };
});

const rackExtent = Math.max(...rackSegments.flatMap(({ minX, maxX }) => [Math.abs(minX), Math.abs(maxX)]));
// Clearances include the full turning envelope of the forklift plus pallet.
export const warehouse = {
  width: rackExtent * 2 + 9,
  depth: layout.racks * layout.rackSpacing + 4.4,
  crossAisleX: rackExtent + 2.2,
  aisleOffset: layout.rackSpacing / 2,
  approachOffset: 2,
  loadOffset: 1.05,
  carryHeight: .15,
  maxPayload: 700,
  turnRate: 2.4,
};
export const aisleZs = rackBays.map((_, rack) => rackZ(rack) + warehouse.aisleOffset);
export const frontAisleZ = aisleZs[aisleZs.length - 1];
// Cross the narrow middle passage at its center; go around rack ends with turning clearance.
export const crossings = rackBays.slice(1).map((_, index) => {
  const segments = rackSegments.filter((segment) => segment.rack === index + 1);
  const candidates = [-warehouse.crossAisleX, warehouse.crossAisleX,
    ...segments.flatMap(({ minX, maxX }) => [minX - 2.2, maxX + 2.2]),
    ...segments.slice(1).map((segment, i) => (segments[i].maxX + segment.minX) / 2)];
  return [...new Set(candidates)].filter((x) => Math.abs(x) <= warehouse.crossAisleX + 1e-6
    && segments.every(({ minX, maxX }) => x <= minX - 1.2 || x >= maxX + 1.2));
});
export const staging = { x: -6.2, y: .02, z: warehouse.depth / 2 + 1.6 };
export const receiving = { x: 6.2, y: .02, z: staging.z };

export const defaultDemand = [80, 45, 30, 15, 55];
export const productIndex = (pallet: number) => products.indexOf(pallets[pallet].product);
export function fitsSlot(pallet: number, slot: number) {
  if (!pallets[pallet] || !slots[slot]) return false;
  const load = arrangeCrates(pallets[pallet].crates).size;
  return Math.max(palletBase.width, load.width) <= slots[slot].width - .15
    && Math.max(palletBase.depth, load.depth) <= 1.78
    && palletBase.height + load.height + .12 <= layout.levelHeight - .075
    && pallets[pallet].weight <= warehouse.maxPayload;
}
