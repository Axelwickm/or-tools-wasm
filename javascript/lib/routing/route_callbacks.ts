import { toIndex, toInt64, type IntValue } from '../int64.js';
import { synchronousCallbackResult } from '../callback_validation.js';
export type RoutingRouteEvaluator = (route: readonly number[]) => IntValue | null;
export function routingRouteCallback(callbacks: readonly RoutingRouteEvaluator[]): (payload: Uint8Array) => Uint8Array {
  return payload => {
    if (payload.length < 4 || (payload.length - 4) % 8) throw new Error('Invalid Routing route callback payload.');
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const callback = callbacks[view.getUint32(0, true)];
    if (!callback) throw new Error('Unknown Routing route evaluator.');
    const route: number[] = [];
    for (let offset = 4; offset < payload.length; offset += 8) route.push(toIndex(view.getBigInt64(offset, true), 'Routing route index'));
    const result = synchronousCallbackResult(callback(route), 'Routing route callbacks must return synchronously.');
    if (result === null) return new Uint8Array([0]);
    const reply = new Uint8Array(9); reply[0] = 1;
    new DataView(reply.buffer).setBigInt64(1, toInt64(result, 'Routing route cost'), true);
    return reply;
  };
}
