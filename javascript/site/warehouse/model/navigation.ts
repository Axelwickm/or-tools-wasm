import { aisleZs, crossings, warehouse } from './layout.ts';
import { spillSites } from './disruptions.ts';

type Point = { x: number; z: number };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** Aisles are clear end-to-end. Enumerate their few crossing combinations, including
 * the central passage and the offset rack ends, and minimize driving + turning time.
 */
export function travelRoute(from: Point & { yaw: number }, to: Point & { yaw: number }, speed: number, blockedPassage: number | null = null): Point[] {
  const first = aisleZs.findIndex((z) => near(z, from.z)), last = aisleZs.findIndex((z) => near(z, to.z));
  if (first < 0 || last < 0) throw new Error('Travel routes must start and end in an aisle.');
  let best: Point[] = [], bestCost = Infinity;
  const direction = Math.sign(last - first);
  function evaluate(points: Point[]) {
    const path: Point[] = [{ x: from.x, z: from.z }];
    for (const point of [...points, to]) {
      const previous = path[path.length - 1];
      if (near(previous.x, point.x) && near(previous.z, point.z)) continue;
      if (path.length >= 2) {
        const before = path[path.length - 2];
        if ((near(before.x, previous.x) && near(previous.x, point.x))
          || (near(before.z, previous.z) && near(previous.z, point.z))) path.pop();
      }
      path.push({ x: point.x, z: point.z });
    }
    let yaw = from.yaw, cost = 0;
    const turnCost = (target: number) => {
      cost += Math.abs(Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw))) / warehouse.turnRate;
      yaw = target;
    };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      turnCost(Math.atan2(a.x - b.x, a.z - b.z));
      cost += Math.hypot(b.x - a.x, b.z - a.z) / speed;
    }
    turnCost(to.yaw);
    if (cost < bestCost) { bestCost = cost; best = path.slice(1); }
  }
  function visit(aisle: number, path: Point[]) {
    if (aisle === last) { evaluate(path); return; }
    const next = aisle + direction;
    for (const x of crossings[Math.min(aisle, next)]) {
      const blocked = blockedPassage === null ? null : spillSites[blockedPassage];
      if (blocked?.boundary === Math.min(aisle, next) && near(x, blocked.x)) continue;
      visit(next, [...path, { x, z: aisleZs[aisle] }, { x, z: aisleZs[next] }]);
    }
  }
  visit(first, []);
  return best;
}
