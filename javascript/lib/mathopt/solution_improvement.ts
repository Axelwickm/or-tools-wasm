import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { MathOptSolutionImprovementRequestSchema, MathOptSolutionImprovementResponseSchema } from '../generated/bridge/mathopt_solution_improvement_pb.js';
import type { MathOptConversionOptions } from './types.js';
import type { MathOptPrimalValuesProto } from './feasibility.js';
import type { MathOptConvertedProto } from './result_proto.js';
import { decodeMathOptPrimalValuesProto } from './result_proto.js';
import { toInt64, type IntValue } from '../int64.js';

export type MathOptSolutionImprovementOptions = MathOptConversionOptions & { integralityTolerance?: number };
export function encodeImprovementRequest(model: Uint8Array, values: MathOptPrimalValuesProto,
    variables: Iterable<IntValue>, options: MathOptSolutionImprovementOptions): Uint8Array {
  return toBinary(MathOptSolutionImprovementRequestSchema, create(MathOptSolutionImprovementRequestSchema, {
    modelProto: model, variableIds: (values.ids ?? []).map(id => toInt64(id, 'MathOpt variable ID')),
    variableValues: values.values ?? [], selectedVariableIds: [...variables].map(id => toInt64(id, 'MathOpt improvement variable ID')),
    integralityTolerance: options.integralityTolerance,
  }));
}
export function decodeImprovementResponse(input: Uint8Array): MathOptConvertedProto<MathOptPrimalValuesProto> {
  const response = fromBinary(MathOptSolutionImprovementResponseSchema, input);
  if (response.error) throw new Error(response.error);
  const bytes = new Uint8Array(response.variableValuesProto);
  return { bytes, proto: decodeMathOptPrimalValuesProto(bytes) };
}
