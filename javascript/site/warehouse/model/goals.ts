import { pallets, slots, staging, receiving, warehouse, frontAisleZ } from './layout.ts';
import { travelRoute } from './navigation.ts';

export type Location = { kind: 'slot'; slot: number } | { kind: 'forklift' } | { kind: 'staging' } | { kind: 'receiving' };
export type ForkliftState = { x: number; z: number; yaw: number; lift: number; load: number | null };
export type WarehouseGoal = { kind: 'dispatch' | 'receive'; pallet: number; slot: number };
export type WarehouseAction =
  | { kind: 'drive'; x: number; z: number; mode: 'travel' | 'approach' | 'reverse' }
  | { kind: 'turn'; yaw: number }
  | { kind: 'lift'; height: number }
  | { kind: 'attach' }
  | { kind: 'detach'; destination: Exclude<Location, { kind: 'forklift' }> }
  | { kind: 'wait'; seconds: number };
export const referenceForklift = (): ForkliftState => ({ x: 1.4, z: frontAisleZ, yaw: -Math.PI / 2, lift: warehouse.carryHeight, load: null });
export const shortestTurn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Driving is 30% faster overall; a 700 kg payload increases travel time by at most 50%. */
export function drivingSpeed(payloadKg: number, mode: 'travel' | 'approach' | 'reverse') {
  return (mode === 'travel' ? 2.2 : .8) * 1.3 / (1 + .5 * Math.min(1, Math.max(0, payloadKg / warehouse.maxPayload)));
}

/** Shared by the animated executor and the event-based background trials. Seconds are simulation time. */
export function actionDuration(action: WarehouseAction, f: ForkliftState) {
  return Math.max(.001, action.kind === 'drive' ? Math.hypot(action.x - f.x, action.z - f.z) / drivingSpeed(f.load === null ? 0 : pallets[f.load].weight, action.mode)
    : action.kind === 'turn' ? Math.abs(shortestTurn(f.yaw, action.yaw)) / warehouse.turnRate
    : action.kind === 'lift' ? Math.abs(action.height - f.lift) / 1.2
    : action.kind === 'wait' ? action.seconds : .35);
}

/** Goals know destinations; only this planner knows the aisles and individual fork movements. */
export function planGoal(goal: WarehouseGoal, start: ForkliftState, blockedPassage: number | null = null): WarehouseAction[] {
  const queue: WarehouseAction[] = [];
  const slot = slots[goal.slot];
  let { x, z, yaw } = start;
  let load = start.load;
  const add = (action: WarehouseAction) => {
    queue.push(action);
    if (action.kind === 'attach') load = goal.pallet;
    else if (action.kind === 'detach') load = null;
  };
  const turn = (target: number) => { if (Math.abs(shortestTurn(yaw, target)) > .001) add({ kind: 'turn', yaw: target }); yaw = target; };
  const drive = (toX: number, toZ: number, mode: 'travel' | 'approach' | 'reverse' = 'travel') => {
    if (Math.hypot(toX - x, toZ - z) < .001) return;
    if (mode !== 'reverse') turn(Math.atan2(x - toX, z - toZ));
    add({ kind: 'drive', x: toX, z: toZ, mode }); x = toX; z = toZ;
  };
  const route = (toX: number, toZ: number, facing: number) => {
    const speed = drivingSpeed(load === null ? 0 : pallets[load].weight, 'travel');
    for (const point of travelRoute({ x, z, yaw }, { x: toX, z: toZ, yaw: facing }, speed, blockedPassage)) drive(point.x, point.z);
  };
  const lift = (height: number) => add({ kind: 'lift', height });
  const aisleZ = slot.z + warehouse.aisleOffset;
  if (goal.kind === 'dispatch') {
    route(slot.x, aisleZ, 0); turn(0); lift(slot.y);
    drive(slot.x, slot.z + warehouse.loadOffset, 'approach');
    add({ kind: 'attach' }); lift(slot.y + .12);
    drive(slot.x, aisleZ, 'reverse'); lift(warehouse.carryHeight);
    route(staging.x, frontAisleZ, Math.PI); turn(Math.PI);
    drive(staging.x, staging.z - warehouse.loadOffset, 'approach');
    lift(staging.y); add({ kind: 'detach', destination: { kind: 'staging' } });
    lift(0); drive(staging.x, frontAisleZ, 'reverse'); lift(warehouse.carryHeight);
  } else {
    route(receiving.x, frontAisleZ, Math.PI); turn(Math.PI); lift(receiving.y);
    drive(receiving.x, receiving.z - warehouse.loadOffset, 'approach');
    add({ kind: 'attach' }); lift(warehouse.carryHeight);
    drive(receiving.x, frontAisleZ, 'reverse');
    route(slot.x, aisleZ, 0); turn(0); lift(slot.y + .12);
    drive(slot.x, slot.z + warehouse.loadOffset, 'approach');
    lift(slot.y); add({ kind: 'detach', destination: { kind: 'slot', slot: slot.id } });
    lift(slot.y - .03); drive(slot.x, aisleZ, 'reverse'); lift(warehouse.carryHeight);
  }
  add({ kind: 'wait', seconds: 1 });
  return queue;
}

/** Skip straight to action boundaries; no animation frames, no mutation of live warehouse state. */
export function goalDuration(goal: WarehouseGoal, start = referenceForklift(), blockedPassage: number | null = null) {
  const state = { ...start };
  let seconds = 0;
  for (const action of planGoal(goal, state, blockedPassage)) {
    seconds += actionDuration(action, state);
    if (action.kind === 'drive') { state.x = action.x; state.z = action.z; }
    else if (action.kind === 'turn') state.yaw = action.yaw;
    else if (action.kind === 'lift') state.lift = action.height;
    else if (action.kind === 'attach') state.load = goal.pallet;
    else if (action.kind === 'detach') state.load = null;
  }
  return seconds;
}
