import * as protobuf from 'protobufjs';
import { mathOptResultDescriptor } from '../generated/mathopt_result_schemas.js';
import type { math_opt_ComputeInfeasibleSubsystemResultProto, math_opt_ModelSubsetProto } from '../generated/mathopt_result_types.js';
import { decodeProtobufWithExactLongs, omitAbsentProtobufMessages } from '../protobufjs_helpers.js';
import type { MathOptModel, MathOptLinearConstraint, MathOptQuadraticConstraint,
  MathOptSosConstraint, MathOptIndicatorConstraint, MathOptSecondOrderConeConstraint } from './model.js';
import type { MathOptVariable } from './variable.js';

export type MathOptModelSubsetProto = math_opt_ModelSubsetProto;
export type MathOptInfeasibleSubsystemResultProto = math_opt_ComputeInfeasibleSubsystemResultProto;
export type MathOptSubsystemBounds = { lower: boolean; upper: boolean };
export type MathOptModelSubset = {
  variableBounds: ReadonlyMap<MathOptVariable, MathOptSubsystemBounds>;
  variableIntegrality: ReadonlySet<MathOptVariable>;
  linearConstraints: ReadonlyMap<MathOptLinearConstraint, MathOptSubsystemBounds>;
  quadraticConstraints: ReadonlyMap<MathOptQuadraticConstraint, MathOptSubsystemBounds>;
  sos1Constraints: ReadonlySet<MathOptSosConstraint>;
  sos2Constraints: ReadonlySet<MathOptSosConstraint>;
  indicatorConstraints: ReadonlySet<MathOptIndicatorConstraint>;
  secondOrderConeConstraints: ReadonlySet<MathOptSecondOrderConeConstraint>;
};
export type MathOptInfeasibleSubsystemResult = {
  feasibility: 'feasible' | 'infeasible' | 'undetermined';
  infeasibleSubsystem: MathOptModelSubset;
  isMinimal: boolean;
  messages: string[];
};
export type MathOptProtoInfeasibleSubsystemResult = {
  bytes: Uint8Array; response: MathOptInfeasibleSubsystemResultProto; messages: string[];
};
const type = protobuf.Root.fromJSON(mathOptResultDescriptor).resolveAll()
  .lookupType('operations_research.math_opt.ComputeInfeasibleSubsystemResultProto');
const subsetType = type.root.lookupType('operations_research.math_opt.ModelSubsetProto');
export function decodeModelSubset(bytes: Uint8Array): MathOptModelSubsetProto {
  return omitAbsentProtobufMessages(decodeProtobufWithExactLongs<MathOptModelSubsetProto>(subsetType, bytes));
}
export function decodeInfeasibleSubsystem(bytes: Uint8Array): MathOptInfeasibleSubsystemResultProto {
  return omitAbsentProtobufMessages(decodeProtobufWithExactLongs<MathOptInfeasibleSubsystemResultProto>(type, bytes));
}
export function captureSubsystemHandles(model: MathOptModel) {
  const keyed = <T extends { id: number }>(values: T[]) => new Map(values.map(value => [String(value.id), value]));
  return { variables: keyed(model.variables()), linear: keyed(model.linearConstraints()), quadratic: keyed(model.quadraticConstraints()),
    sos1: keyed(model.sos1Constraints()), sos2: keyed(model.sos2Constraints()), indicator: keyed(model.indicatorConstraints()),
    cones: keyed(model.secondOrderConeConstraints()) };
}
export function bindModelSubset(subset: MathOptModelSubsetProto | undefined,
    handles: ReturnType<typeof captureSubsystemHandles>): MathOptModelSubset {
  const lookup = <T>(map: ReadonlyMap<string, T>, id: string | number | bigint): T => {
    const value = map.get(String(id));
    if (!value) throw new Error(`MathOpt model subset contains an unknown model ID ${id}.`);
    return value;
  };
  const bounds = <T>(values: Record<string, { lower?: boolean; upper?: boolean }> | undefined, map: ReadonlyMap<string, T>) =>
    new Map(Object.entries(values ?? {}).map(([id, value]) => [lookup(map, id), { lower: value.lower ?? false, upper: value.upper ?? false }]));
  const included = <T>(ids: Array<number | bigint> | undefined, map: ReadonlyMap<string, T>) => new Set((ids ?? []).map(id => lookup(map, id)));
  return {
    variableBounds: bounds(subset?.variableBounds, handles.variables), variableIntegrality: included(subset?.variableIntegrality, handles.variables),
    linearConstraints: bounds(subset?.linearConstraints, handles.linear), quadraticConstraints: bounds(subset?.quadraticConstraints, handles.quadratic),
    sos1Constraints: included(subset?.sos1Constraints, handles.sos1), sos2Constraints: included(subset?.sos2Constraints, handles.sos2),
    indicatorConstraints: included(subset?.indicatorConstraints, handles.indicator),
    secondOrderConeConstraints: included(subset?.secondOrderConeConstraints, handles.cones),
  };
}

export function bindInfeasibleSubsystem(proto: MathOptInfeasibleSubsystemResultProto,
    handles: ReturnType<typeof captureSubsystemHandles>, messages: string[]): MathOptInfeasibleSubsystemResult {
  const status = proto.feasibility;
  const feasibility = status === 2 || status === 'FEASIBILITY_STATUS_FEASIBLE' ? 'feasible'
    : status === 3 || status === 'FEASIBILITY_STATUS_INFEASIBLE' ? 'infeasible'
    : status === 1 || status === 'FEASIBILITY_STATUS_UNDETERMINED' ? 'undetermined' : undefined;
  if (!feasibility) throw new Error('Native MathOpt IIS returned an unspecified feasibility status.');
  return { feasibility, isMinimal: proto.isMinimal ?? false, messages: [...messages],
    infeasibleSubsystem: bindModelSubset(proto.infeasibleSubsystem, handles) };
}
