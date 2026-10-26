import { pallets, defaultDemand, productIndex, fitsSlot } from './layout.ts';
import { spillSites, spillInterval, spillDuration, segmentHitsSpill } from './disruptions.ts';
import { planGoal, actionDuration, shortestTurn, referenceForklift, type Location, type ForkliftState, type WarehouseAction, type WarehouseGoal } from './goals.ts';
export type { ForkliftState, WarehouseAction } from './goals.ts';
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/** One forklift, sequential actions, and explicit pallet ownership. No rendering dependencies. */
export class WarehouseSimulation {
  readonly forklift = referenceForklift();
  readonly placement = pallets.map((pallet) => pallet.slot);
  demand = [...defaultDemand];
  revision = 0;
  completedGoals = 0;
  idle = false;
  elapsed = 0;
  lastGoalSeconds = 0;
  #goalStarted = 0;
  readonly locations: Location[] = pallets.map((pallet) => ({ kind: 'slot', slot: pallet.slot }));
  deliveries = 0;
  restocks = 0;
  distance = 0;
  job!: WarehouseGoal;
  #queue: WarehouseAction[] = [];
  #start: ForkliftState | null = null;
  #elapsed = 0;
  #duration = 0;
  #random = 41;
  blockedPassage: number | null = null;
  #conditionTime = 0;
  #nextSpill = spillInterval;
  #spillEnds = 0;
  #spillSequence = 0;
  get spillRemaining() { return this.blockedPassage === null ? 0 : Math.max(0, this.#spillEnds - this.#conditionTime); }
  get action(): WarehouseAction { return this.#queue[0]; }

  constructor() { this.#planNextJob(); }

  /** Schedule spills in real playback time. Reserve the committed job's path so no spill appears under it. */
  advanceConditions(seconds: number): string | null {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Condition time must be finite and nonnegative.');
    this.#conditionTime += seconds;
    if (this.blockedPassage !== null) {
      if (this.#conditionTime < this.#spillEnds) return null;
      this.blockedPassage = null; this.revision++; return 'Oil spill cleared';
    }
    if (this.#conditionTime < this.#nextSpill) return null;
    const candidates = spillSites.map((_, i) => (i + this.#spillSequence) % spillSites.length);
    const site = candidates.find((candidate) => {
      let from = { x: this.forklift.x, z: this.forklift.z };
      if (segmentHitsSpill(from, from, candidate)) return false;
      for (const action of this.#queue) if (action.kind === 'drive') {
        if (segmentHitsSpill(from, action, candidate)) return false;
        from = action;
      }
      return true;
    });
    if (site === undefined) return null;
    this.blockedPassage = site; this.#spillSequence = (site + 1) % spillSites.length;
    this.#spillEnds = this.#conditionTime + spillDuration; this.#nextSpill = this.#conditionTime + spillInterval;
    this.revision++;
    return `Oil spill · ${spillSites[site].label}`;
  }

  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Simulation time must be finite and nonnegative.');
    while (seconds > 0) {
      const action = this.action;
      if (!this.#start) {
        this.#start = { ...this.forklift }; this.#elapsed = 0;
        this.#duration = actionDuration(action, this.forklift);
      }
      const dt = Math.min(seconds, this.#duration - this.#elapsed);
      this.#elapsed += dt; seconds -= dt; this.elapsed += dt;
      // Summed action times can land a few floating-point ulps short of the boundary.
      const t = this.#duration - this.#elapsed < 1e-10 ? 1 : this.#elapsed / this.#duration;
      const smooth = t * t * (3 - 2 * t);
      const f = this.forklift, from = this.#start;
      if (action.kind === 'drive') {
        const x = lerp(from.x, action.x, smooth), z = lerp(from.z, action.z, smooth);
        this.distance += Math.hypot(x - f.x, z - f.z); f.x = x; f.z = z;
      } else if (action.kind === 'turn') f.yaw = from.yaw + shortestTurn(from.yaw, action.yaw) * smooth;
      else if (action.kind === 'lift') f.lift = lerp(from.lift, action.height, smooth);
      if (t < 1) break;
      if (action.kind === 'attach') {
        if (f.load !== null) throw new Error('Forklift is already carrying a pallet.');
        f.load = this.job.pallet; this.locations[this.job.pallet] = { kind: 'forklift' };
      } else if (action.kind === 'detach') {
        if (f.load !== this.job.pallet) throw new Error('The requested pallet is not on the forks.');
        const destination = action.destination;
        if (destination.kind === 'slot' && this.locations.some((location) => location.kind === 'slot' && location.slot === destination.slot))
          throw new Error('Cannot place a pallet in an occupied slot.');
        this.locations[this.job.pallet] = destination; f.load = null;
        if (destination.kind === 'staging') this.deliveries++; else this.restocks++;
      }
      this.#queue.shift(); this.#start = null;
      if (!this.#queue.length) {
        if (!this.idle) { this.completedGoals++; this.lastGoalSeconds = this.elapsed - this.#goalStarted; }
        this.#planNextJob();
      }
    }
  }

  setDemand(demand: readonly number[]) {
    if (demand.length !== defaultDemand.length || demand.some((value) => !Number.isFinite(value) || value < 0 || value > 100))
      throw new RangeError('Demand must contain one value from 0 to 100 per product.');
    this.demand = [...demand]; this.revision++;
  }

  canMove(pallet: number, target: number) {
    if (!Number.isInteger(pallet) || !Number.isInteger(target) || !fitsSlot(pallet, target)) return false;
    const source = this.locations[pallet];
    if (source?.kind !== 'slot' || source.slot === target || (!this.idle && (pallet === this.job.pallet || target === this.job.slot))) return false;
    const occupant = this.placement.indexOf(target);
    return occupant < 0 || ((this.idle || occupant !== this.job.pallet) && this.locations[occupant].kind === 'slot' && fitsSlot(occupant, source.slot));
  }

  movePallet(pallet: number, target: number) {
    if (!this.canMove(pallet, target)) return false;
    const placement = [...this.placement], occupant = placement.indexOf(target);
    if (occupant >= 0) placement[occupant] = placement[pallet];
    placement[pallet] = target;
    this.applyPlacement(placement);
    return true;
  }

  applyPlacement(placement: readonly number[]) {
    if (placement.length !== pallets.length || new Set(placement).size !== placement.length
      || placement.some((slot, i) => !Number.isInteger(slot) || !fitsSlot(i, slot))
      || (!this.idle && placement[this.job.pallet] !== this.job.slot))
      throw new Error('Placement must fit every pallet and preserve the active job.');
    placement.forEach((slot, i) => {
      this.placement[i] = slot;
      if (this.locations[i].kind === 'slot') this.locations[i] = { kind: 'slot', slot };
    });
    this.revision++;
  }

  #planNextJob() {
    this.#goalStarted = this.elapsed; this.idle = false;
    const waiting = this.locations.findIndex((location) => location.kind === 'staging');
    if (waiting >= 0) {
      // Outgoing stock leaves; an identical replenishment arrives on the receiving pad.
      // Its reserved home keeps the user's layout stable across demand-driven work.
      this.locations[waiting] = { kind: 'receiving' };
      this.job = { kind: 'receive', pallet: waiting, slot: this.placement[waiting] };
    } else {
      const available = pallets.map((_, i) => i).filter((i) => this.locations[i].kind === 'slot');
      const counts = defaultDemand.map((_, product) => available.filter((i) => productIndex(i) === product).length);
      const weights = available.map((i) => this.demand[productIndex(i)] / counts[productIndex(i)]);
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      if (!total) {
        // No demand: stay idle and check again without inventing orders.
        this.job ??= { kind: 'dispatch', pallet: 0, slot: this.placement[0] };
        this.idle = true; this.#queue = [{ kind: 'wait', seconds: 1 }];
        return;
      }
      this.#random = (1664525 * this.#random + 1013904223) >>> 0;
      let ticket = this.#random / 2 ** 32 * total;
      let choice = weights.findIndex((weight) => (ticket -= weight) < 0);
      if (choice < 0) choice = available.length - 1;
      const pallet = available[choice];
      this.job = { kind: 'dispatch', pallet, slot: this.placement[pallet] };
    }
    this.#queue = planGoal(this.job, this.forklift, this.blockedPassage);
  }
}
