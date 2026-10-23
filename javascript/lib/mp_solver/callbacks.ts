import { synchronousCallbackResult } from '../callback_validation.js';
import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { MpSolverCallbackDataSchema, MpSolverCallbackResultSchema } from '../generated/bridge/mp_solver_pb.js';

export type MPSolverCallbackRegistration = {
  mightAddCuts?: boolean;
  mightAddLazyConstraints?: boolean;
  /** Omit to receive every variable; an empty array requests no values. */
  variableIndices?: readonly number[];
};
export type MPSolverCallbackData = {
  event: 'mipSolution' | 'mipNode';
  canQueryVariableValues: boolean;
  variableValues: Record<number, number>;
  numExploredNodes: bigint;
};
export type MPSolverCallbackConstraint = {
  lowerBound?: number;
  upperBound?: number;
  variableIndices: readonly number[];
  coefficients: readonly number[];
};
export type MPSolverCallbackResult = {
  cuts?: readonly MPSolverCallbackConstraint[];
  lazyConstraints?: readonly MPSolverCallbackConstraint[];
};
export type MPSolverCallback = (data: MPSolverCallbackData) => MPSolverCallbackResult | void;

export function callbackRegistration(callback: MPSolverCallback | undefined, registration?: MPSolverCallbackRegistration) {
  if (!callback) {
    if (registration !== undefined) throw new TypeError('MPSolver callback registration requires a callback.');
    return undefined;
  }
  if (typeof callback !== 'function') throw new TypeError('MPSolver callback must be a function.');
  for (const value of [registration?.mightAddCuts, registration?.mightAddLazyConstraints])
    if (value !== undefined && typeof value !== 'boolean') throw new TypeError('MPSolver callback capability flags must be Boolean.');
  const indices = registration?.variableIndices?.map(value => {
    if (!Number.isInteger(value) || value < 0 || value > 2147483647) throw new RangeError('MPSolver callback variable indices must be nonnegative int32.');
    return value;
  });
  return { mightAddCuts: registration?.mightAddCuts ?? false,
    mightAddLazyConstraints: registration?.mightAddLazyConstraints ?? false,
    filterVariables: indices !== undefined, variableIndices: indices ?? [] };
}

export function mpCallbackHandler(callback: MPSolverCallback): (payload: Uint8Array) => Uint8Array {
  return bytes => {
    const data = fromBinary(MpSolverCallbackDataSchema, bytes);
    if (data.event !== 0 && data.event !== 1) throw new Error('Unknown native MPSolver callback event.');
    const result = synchronousCallbackResult(callback({ event: data.event === 0 ? 'mipSolution' : 'mipNode',
      canQueryVariableValues: data.canQueryVariableValues, variableValues: { ...data.variableValues }, numExploredNodes: data.numExploredNodes }), 'MPSolver callbacks must return synchronously.');
    const constraints = (rows: readonly MPSolverCallbackConstraint[] | undefined) => rows?.map(row => {
      const lowerBound = row.lowerBound ?? -Infinity, upperBound = row.upperBound ?? Infinity;
      if (typeof lowerBound !== 'number' || typeof upperBound !== 'number' || Number.isNaN(lowerBound) || Number.isNaN(upperBound) || lowerBound > upperBound
        || row.variableIndices.length !== row.coefficients.length) throw new RangeError('Invalid MPSolver callback constraint bounds or dimensions.');
      const variableIndices = row.variableIndices.map(index => {
        if (!Number.isInteger(index) || index < 0 || index > 2147483647) throw new RangeError('MPSolver callback variable indices must be nonnegative int32.');
        return index;
      });
      const coefficients = row.coefficients.map(value => {
        if (!Number.isFinite(value)) throw new RangeError('MPSolver callback coefficients must be finite.');
        return value;
      });
      return { lowerBound, upperBound, variableIndices, coefficients };
    }) ?? [];
    return toBinary(MpSolverCallbackResultSchema, create(MpSolverCallbackResultSchema, {
      cuts: constraints(result?.cuts), lazyConstraints: constraints(result?.lazyConstraints),
    }));
  };
}
