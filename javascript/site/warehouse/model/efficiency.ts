import { pallets, slots, productIndex, defaultDemand, fitsSlot } from './layout.ts';
import { goalDuration } from './goals.ts';
import { spillSites } from './disruptions.ts';

export type WarehouseSnapshot = { placement: number[]; demand: number[]; locked: number[]; blockedPassage?: number | null };
export type EfficiencySample = { average: number; dispatch: number; receive: number; jobs: number };
// Payload weight makes the same slot take different amounts of time for different pallets.
// Cache the shared planner's timings once, keeping sampling and model construction cheap.
const timingCache = new Map<number | null, { dispatch: number; receive: number }[][]>();
export function placementTimings(blockedPassage: number | null = null) {
  let times = timingCache.get(blockedPassage);
  if (!times) {
    times = pallets.map((_, pallet) => slots.map((slot) => ({
      dispatch: goalDuration({ kind: 'dispatch', pallet, slot: slot.id }, undefined, blockedPassage),
      receive: goalDuration({ kind: 'receive', pallet, slot: slot.id }, undefined, blockedPassage),
    })));
    timingCache.set(blockedPassage, times);
  }
  return times;
}
export const placementTimes = placementTimings();
export function validateSnapshot(snapshot: WarehouseSnapshot) {
  if (snapshot.placement.length !== pallets.length || new Set(snapshot.placement).size !== pallets.length
    || snapshot.placement.some((slot, i) => !Number.isInteger(slot) || !fitsSlot(i, slot))
    || snapshot.demand.length !== defaultDemand.length || snapshot.demand.some((d) => !Number.isFinite(d) || d < 0 || d > 100)
    || snapshot.locked.some((i) => !Number.isInteger(i) || !pallets[i])
    || (snapshot.blockedPassage != null && (!Number.isInteger(snapshot.blockedPassage) || !spillSites[snapshot.blockedPassage]))) throw new RangeError('Invalid warehouse snapshot.');
}
export function demandWeights(demand: readonly number[]) {
  const counts = defaultDemand.map((_, product) => pallets.filter((_, i) => productIndex(i) === product).length);
  return pallets.map((_, i) => demand[productIndex(i)] / counts[productIndex(i)]);
}
export function expectedSeconds(placement: readonly number[], demand: readonly number[], blockedPassage: number | null = null) {
  const weights = demandWeights(demand), total = weights.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const times = placementTimings(blockedPassage);
  return placement.reduce((sum, slot, i) => sum + weights[i] * (times[i][slot].dispatch + times[i][slot].receive) / 2, 0) / total;
}

/** Random matching keeps every pallet, respects fit, and leaves active transfers alone. */
export function randomPlacement(snapshot: WarehouseSnapshot, random = Math.random) {
  validateSnapshot(snapshot);
  const locked = new Set(snapshot.locked);
  const occupied = new Map(snapshot.locked.map((p) => [snapshot.placement[p], p]));
  const shuffled = slots.map((slot) => slot.id).filter((slot) => !occupied.has(slot));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const assign = (pallet: number, visited: Set<number>): boolean => {
    for (const slot of shuffled) {
      if (visited.has(slot) || !fitsSlot(pallet, slot)) continue;
      visited.add(slot);
      const previous = occupied.get(slot);
      if (previous === undefined || assign(previous, visited)) { occupied.set(slot, pallet); return true; }
    }
    return false;
  };
  pallets.forEach((_, p) => {
    if (!locked.has(p) && !assign(p, new Set())) throw new Error('Could not find a valid random placement.');
  });
  const placement = [...snapshot.placement];
  occupied.forEach((p, slot) => placement[p] = slot);
  return placement;
}

/** Each trial dispatches one current pallet and replenishes its vacated slot, then restores the snapshot.
 * Both goals start at the same reference pose. A 100-trial window contains 200 completed jobs.
 */
export class EfficiencySampler {
  #snapshot: WarehouseSnapshot;
  #weights: number[] = [];
  #total = 0;
  #random = 90210;
  #window: { dispatch: number; receive: number }[] = [];
  #times = placementTimes;
  constructor(snapshot: WarehouseSnapshot) { this.#snapshot = snapshot; this.update(snapshot); }
  update(snapshot: WarehouseSnapshot) {
    validateSnapshot(snapshot);
    this.#snapshot = structuredClone(snapshot);
    this.#times = placementTimings(snapshot.blockedPassage);
    this.#weights = demandWeights(snapshot.demand);
    this.#total = this.#weights.reduce((sum, value) => sum + value, 0);
    if (!this.#total) this.#window = [];
  }
  sample(trials = 8): EfficiencySample | null {
    if (!this.#total) return null;
    for (let trial = 0; trial < trials; trial++) {
      this.#random = (1664525 * this.#random + 1013904223) >>> 0;
      let ticket = this.#random / 2 ** 32 * this.#total;
      const pallet = this.#weights.findIndex((weight) => (ticket -= weight) < 0);
      this.#window.push(this.#times[pallet][this.#snapshot.placement[pallet]]);
      if (this.#window.length > 100) this.#window.shift();
    }
    const dispatch = this.#window.reduce((sum, item) => sum + item.dispatch, 0) / this.#window.length;
    const receive = this.#window.reduce((sum, item) => sum + item.receive, 0) / this.#window.length;
    return { average: (dispatch + receive) / 2, dispatch, receive, jobs: this.#window.length * 2 };
  }
}
