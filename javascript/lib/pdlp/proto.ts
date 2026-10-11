import * as protobuf from 'protobufjs';
import { encodeProtobufBigInts, decodeProtobufWithExactLongs, normalizeProtobufInput, omitAbsentProtobufMessages } from '../protobufjs_helpers.js';
import { pdlpDescriptor } from '../generated/pdlp_schemas.js';
import type { pdlp_PrimalDualHybridGradientParams, pdlp_SolveLog, glop_GlopParameters } from '../generated/pdlp_types.js';

const root = protobuf.Root.fromJSON(pdlpDescriptor).resolveAll();
const parametersType = root.lookupType('operations_research.pdlp.PrimalDualHybridGradientParams');
const solveLogType = root.lookupType('operations_research.pdlp.SolveLog');

export function encodePdlpParameters(params: pdlp_PrimalDualHybridGradientParams): Uint8Array {
  return encodeParameters(params, parametersType);
}

export function encodeGlopParameters(params: glop_GlopParameters): Uint8Array {
  return encodeParameters(params, root.lookupType('operations_research.glop.GlopParameters'));
}

function encodeParameters(params: object, parametersType: protobuf.Type): Uint8Array {
  const value = encodeProtobufBigInts(normalizeProtobufInput(params, parametersType), parametersType) as Record<string, unknown>;
  const error = parametersType.verify(value);
  if (error) throw new TypeError(`${parametersType.name}: ${error}`);
  return new Uint8Array(parametersType.encode(parametersType.create(value)).finish());
}

export function decodePdlpSolveLog(bytes: Uint8Array): pdlp_SolveLog {
  return decodeNativeProto<pdlp_SolveLog>(solveLogType, bytes);
}

function decodeNativeProto<T>(type: protobuf.Type, bytes: Uint8Array): T {
  const decoded = decodeProtobufWithExactLongs<T>(type, bytes);
  return omitAbsentProtobufMessages(decoded);
}

export function decodePdlpIterationStats(bytes: Uint8Array) {
  return decodeNativeProto<import('../generated/pdlp_types.js').pdlp_IterationStats>(
    root.lookupType('operations_research.pdlp.IterationStats'), bytes);
}
export function decodePdlpTerminationCriteria(bytes: Uint8Array) {
  return decodeNativeProto<import('../generated/pdlp_types.js').pdlp_TerminationCriteria>(
    root.lookupType('operations_research.pdlp.TerminationCriteria'), bytes);
}
