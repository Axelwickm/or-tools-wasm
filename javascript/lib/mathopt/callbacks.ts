import { synchronousCallbackResult } from '../callback_validation.js';
import * as protobuf from 'protobufjs';
import { mathOptCallbackDescriptor } from '../generated/mathopt_callback_schemas.js';
import type { MathOptCallbackDataProto, MathOptCallbackRegistrationProto, MathOptCallbackResultProto } from '../generated/mathopt_callback_types.js';
import { decodeProtobufWithExactLongs, encodeProtobufBigInts, normalizeProtobufInput, omitAbsentProtobufMessages } from '../protobufjs_helpers.js';

export type MathOptCallbackData = MathOptCallbackDataProto;
export type MathOptCallbackRegistration = MathOptCallbackRegistrationProto;
export type MathOptCallbackResult = MathOptCallbackResultProto;
export type MathOptCallback = (data: MathOptCallbackData) => MathOptCallbackResult | Uint8Array | void;
const root = protobuf.Root.fromJSON(mathOptCallbackDescriptor).resolveAll();

function encode(name: string, input: object | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) return new Uint8Array(input);
  const type = root.lookupType(`operations_research.math_opt.${name}`);
  const value = encodeProtobufBigInts(normalizeProtobufInput(input, type), type) as Record<string, unknown>;
  const error = type.verify(value);
  if (error) throw new TypeError(`Invalid MathOpt ${name}: ${error}`);
  return type.encode(type.create(value)).finish();
}
export const encodeMathOptCallbackRegistration = (input: MathOptCallbackRegistration | Uint8Array) => encode('CallbackRegistrationProto', input);
export const decodeMathOptCallbackData = (bytes: Uint8Array): MathOptCallbackData =>
  omitAbsentProtobufMessages(decodeProtobufWithExactLongs<MathOptCallbackData>(root.lookupType('operations_research.math_opt.CallbackDataProto'), bytes, Number));
export const encodeMathOptCallbackResult = (input: MathOptCallbackResult | Uint8Array) => {
  if (input instanceof Uint8Array) root.lookupType('operations_research.math_opt.CallbackResultProto').decode(input);
  return encode('CallbackResultProto', input);
};

export function callbackHandler(callback: MathOptCallback): (payload: Uint8Array) => Uint8Array {
  return payload => {
    const result = synchronousCallbackResult(callback(decodeMathOptCallbackData(payload)), 'MathOpt callbacks must return synchronously.');
    return encodeMathOptCallbackResult(result ?? {});
  };
}
