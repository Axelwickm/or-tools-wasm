import * as protobuf from 'protobufjs';
import { mathOptProtoType as mathOptRpcType } from './result_proto.js';
import type { math_opt_SolveRequest } from '../generated/mathopt_result_types.js';
export { mathOptRpcType };
import { encodeProtobufBigInts, normalizeProtobufInput } from '../protobufjs_helpers.js';

const opaqueTypes = new Map<string, protobuf.Type>();

// Embedded messages and bytes have the same wire representation. Derive a
// bytes view from the native schema so opaque protos keep unknown fields.
// This view is only used at envelopes whose embedded messages are already encoded.
function opaqueType(name: string): protobuf.Type {
  let type = opaqueTypes.get(name);
  if (type) return type;
  const source = mathOptRpcType(name);
  const descriptor = source.toJSON();
  delete descriptor.oneofs;
  // A message-to-bytes substitution must retain an explicitly empty message.
  // Explicit scalar presence also matches the previous envelope writer.
  descriptor.edition = 'proto2';
  for (const field of source.fieldsArray) {
    const definition = descriptor.fields[field.name];
    if (field.resolvedType instanceof protobuf.Type) definition.type = 'bytes';
    else if (field.resolvedType instanceof protobuf.Enum) definition.type = 'int32';
  }
  type = protobuf.Type.fromJSON(source.name, descriptor);
  opaqueTypes.set(name, type);
  return type;
}

export function encodeMathOptRpc(name: string, input: object, opaque = false): Uint8Array {
  const type = opaque ? opaqueType(name) : mathOptRpcType(name);
  const value = encodeProtobufBigInts(normalizeProtobufInput(input, type), type) as Record<string, unknown>;
  const error = type.verify(value);
  if (error) throw new TypeError(`${type.name}: ${error}`);
  return new Uint8Array(type.encode(type.create(value)).finish());
}

// Admission only needs parameters; decoding the model here would duplicate
// large model allocations before native execution.
export function decodeMathOptRequestParameters(bytes: Uint8Array): Pick<math_opt_SolveRequest, 'solverType' | 'parameters'> {
  const request = opaqueType('SolveRequest').decode(bytes) as protobuf.Message & { solverType?: number; parameters?: Uint8Array };
  const type = mathOptRpcType('SolveParametersProto');
  return { solverType: request.solverType,
    parameters: request.parameters?.length ? type.toObject(type.decode(request.parameters), { defaults: false }) : undefined };
}

export function decodeMathOptResponse(bytes: Uint8Array, label: string): { resultBytes?: Uint8Array; messages: string[] } {
  const response = opaqueType('SolveResponse').decode(bytes) as protobuf.Message & {
    result?: Uint8Array; status?: Uint8Array; messages?: string[];
  };
  if (response.status !== undefined && Object.prototype.hasOwnProperty.call(response, 'status')) {
    const type = opaqueType('StatusProto');
    const status = type.toObject(type.decode(response.status)) as { message?: string };
    throw new Error(status.message ?? `${label} failed.`);
  }
  return { resultBytes: Object.prototype.hasOwnProperty.call(response, 'result') ? response.result : undefined, messages: response.messages ?? [] };
}

export function mathOptDuration(seconds: number | undefined): { seconds: bigint; nanos?: number } | undefined {
  if (seconds === undefined) return undefined;
  let wholeSeconds = Math.trunc(seconds);
  let nanos = Math.round((seconds - wholeSeconds) * 1_000_000_000);
  if (Math.abs(nanos) === 1_000_000_000) { wholeSeconds += Math.sign(nanos); nanos = 0; }
  if (!Number.isSafeInteger(wholeSeconds)) throw new RangeError('MathOpt duration seconds must be a safe integer.');
  return { seconds: BigInt(wholeSeconds), nanos: nanos || undefined };
}
