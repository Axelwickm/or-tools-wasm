import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { MathOptFeasibilityRequestSchema, MathOptFeasibilityResponseSchema } from '../generated/bridge/mathopt_feasibility_pb.js';
import type { math_opt_SparseDoubleVectorProto } from '../generated/mathopt_result_types.js';
import type { MathOptConversionOptions } from './types.js';
import { decodeModelSubset, type MathOptModelSubset, type MathOptModelSubsetProto } from './iis.js';
import { toInt64 } from '../int64.js';

export type MathOptPrimalValuesProto = math_opt_SparseDoubleVectorProto;
export type MathOptFeasibilityOptions = MathOptConversionOptions & {
  absoluteConstraintTolerance?: number;
  integralityTolerance?: number;
  nonzeroTolerance?: number;
};
export type MathOptFeasibilityResult = {
  feasible: boolean;
  violations: MathOptModelSubset;
  descriptions: string[];
};
export type MathOptProtoFeasibilityResult = {
  feasible: boolean;
  violations: MathOptModelSubsetProto;
  /** Serialized native ModelSubsetProto containing the violations. */
  bytes: Uint8Array;
  descriptions: string[];
};
export function encodeFeasibilityRequest(model: Uint8Array, values: MathOptPrimalValuesProto,
    options: MathOptFeasibilityOptions): Uint8Array {
  return toBinary(MathOptFeasibilityRequestSchema, create(MathOptFeasibilityRequestSchema, {
    modelProto: model, variableIds: (values.ids ?? []).map(id => toInt64(id, 'MathOpt variable ID')),
    variableValues: values.values ?? [], absoluteConstraintTolerance: options.absoluteConstraintTolerance,
    integralityTolerance: options.integralityTolerance, nonzeroTolerance: options.nonzeroTolerance,
  }));
}
export function decodeFeasibilityResponse(bytes: Uint8Array): MathOptProtoFeasibilityResult {
  const response = fromBinary(MathOptFeasibilityResponseSchema, bytes);
  if (response.error) throw new Error(response.error);
  const subset = new Uint8Array(response.violatedConstraintsProto);
  return { feasible: response.feasible, violations: decodeModelSubset(subset), bytes: subset, descriptions: [...response.descriptions] };
}
