import * as protobuf from 'protobufjs';
import { decodeProtobufWithExactLongs, protobufObjectWithExactLongs, omitAbsentProtobufMessages, encodeProtobufBigInts, normalizeProtobufInput } from '../protobufjs_helpers.js';
import { mathOptResultDescriptor } from '../generated/mathopt_result_schemas.js';
import type { math_opt_SolveResultProto } from '../generated/mathopt_result_types.js';
import type { math_opt_PrimalSolutionProto, math_opt_DualSolutionProto, math_opt_BasisProto,
  math_opt_PrimalRayProto, math_opt_DualRayProto, math_opt_SolutionProto, math_opt_ProblemStatusProto,
  math_opt_ObjectiveBoundsProto, math_opt_SolveStatsProto, math_opt_TerminationProto } from '../generated/mathopt_result_types.js';

export type MathOptSolutionProtoMap = {
  primalSolution: math_opt_PrimalSolutionProto;
  dualSolution: math_opt_DualSolutionProto;
  basis: math_opt_BasisProto;
  primalRay: math_opt_PrimalRayProto;
  dualRay: math_opt_DualRayProto;
  solution: math_opt_SolutionProto;
};
export type MathOptResultMetadataProtoMap = {
  problemStatus: math_opt_ProblemStatusProto;
  objectiveBounds: math_opt_ObjectiveBoundsProto;
  solveStats: math_opt_SolveStatsProto;
  termination: math_opt_TerminationProto;
};
export type MathOptSolutionProtoKind = keyof MathOptSolutionProtoMap;
export type MathOptResultMetadataProtoKind = keyof MathOptResultMetadataProtoMap;
export type MathOptConvertedProto<P> = { bytes: Uint8Array; proto: P };
type ProtoMap = MathOptSolutionProtoMap & MathOptResultMetadataProtoMap;

const protoKinds = {
  primalSolution: [1, 'PrimalSolutionProto'], dualSolution: [2, 'DualSolutionProto'],
  basis: [3, 'BasisProto'], primalRay: [4, 'PrimalRayProto'], dualRay: [5, 'DualRayProto'],
  solution: [6, 'SolutionProto'], problemStatus: [7, 'ProblemStatusProto'],
  objectiveBounds: [8, 'ObjectiveBoundsProto'], solveStats: [9, 'SolveStatsProto'],
  termination: [10, 'TerminationProto'],
} as const;

function protoType(kind: keyof ProtoMap): protobuf.Type {
  if (!Object.prototype.hasOwnProperty.call(protoKinds, kind)) throw new RangeError('Unknown MathOpt result proto kind.');
  return root.lookupType(`operations_research.math_opt.${protoKinds[kind][1]}`);
}
export function mathOptResultProtoKind(kind: keyof ProtoMap): number {
  protoType(kind);
  return protoKinds[kind][0];
}
export function encodeMathOptResultProto<K extends keyof ProtoMap>(kind: K, input: Uint8Array | ProtoMap[K]): Uint8Array {
  const type = protoType(kind);
  if (input instanceof Uint8Array) return new Uint8Array(input);
  const value = encodeProtobufBigInts(normalizeProtobufInput(input, type), type) as Record<string, unknown>;
  const error = type.verify(value);
  if (error) throw new Error(`Invalid MathOpt result proto: ${error}`);
  return type.encode(type.create(value)).finish();
}
export function decodeMathOptResultProto<K extends keyof ProtoMap>(kind: K, bytes: Uint8Array): ProtoMap[K] {
  return omitAbsentProtobufMessages(decodeProtobufWithExactLongs<ProtoMap[K]>(protoType(kind), bytes));
}

export function decodeMathOptPrimalValuesProto(bytes: Uint8Array): import('../generated/mathopt_result_types.js').math_opt_SparseDoubleVectorProto {
  return decodeProtobufWithExactLongs(root.lookupType('operations_research.math_opt.SparseDoubleVectorProto'), bytes);
}

const root = protobuf.Root.fromJSON(mathOptResultDescriptor).resolveAll();

export function mathOptProtoType(name: string): protobuf.Type {
  return root.lookupType(name.includes('.') ? name : `operations_research.math_opt.${name}`);
}
export function decodeMathOptSolveResult(bytes: Uint8Array, defaults = true): math_opt_SolveResultProto {
  const type = root.lookupType('operations_research.math_opt.SolveResultProto');
  const message = type.decode(bytes);
  const result = omitAbsentProtobufMessages(protobufObjectWithExactLongs<math_opt_SolveResultProto>(type, message, String, defaults));
  if (!defaults) {
    // High-level optional solution scalars retain presence, while backend
    // reports retain their established protobuf scalar defaults (e.g. 0n).
    for (const name of ['gscipOutput', 'osqpOutput', 'pdlpOutput'] as const) {
      const output = (message as unknown as Record<string, protobuf.Message | undefined>)[name];
      if (output) result[name] = omitAbsentProtobufMessages(protobufObjectWithExactLongs(
        type.fields[name].resolve().resolvedType as protobuf.Type, output));
    }
  }
  return result;
}

export function encodeGScipParameters(input: object): Uint8Array {
  const type = root.lookupType('operations_research.GScipParameters');
  const value = encodeProtobufBigInts(normalizeProtobufInput(input, type), type) as Record<string, unknown>;
  const error = type.verify(value);
  if (error) throw new TypeError(`${type.name}: ${error}`);
  return type.encode(type.create(value)).finish();
}
