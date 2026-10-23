import { MathOptModel, type MathOptIndicatorConstraint } from './model.js';
import type { MathOptVariable } from './variable.js';
import { toInt64, type IntValue } from '../int64.js';
import {
  MathOptSolverType, MathOptLPAlgorithm, MathOptEmphasis, GScipEmphasis, GScipMetaParamValue, GScipParameters,
  GlopParameters, PdlpParameters, PdlpOptimalityNorm, PdlpSchedulerType, PdlpRestartStrategy,
  PdlpLinesearchRule, GlpkParameters, MathOptSolveInterrupter, MathOptModelSolveParameters,
  MathOptObjectiveParameters, MathOptSparseVectorFilter, MathOptSolutionHint, encodeSolveRequest,
} from './parameters.js';
import { MathOptIncrementalSolver, MathOptProtoIncrementalSolver } from './sessions.js';
import {
  MathOptLinearExpression, MathOptQuadraticExpression, MathOptQuadraticTermKey, MathOptBoundedExpression,
  MathOptLowerBoundedExpression, MathOptUpperBoundedExpression, asFlatLinearExpression, readonlyMap,
  linearTerm, quadraticTerm, linearExpression, quadraticExpression, asFlatQuadraticExpression, fastSum,
  multiplyLinearExpressions, evaluateExpression, boundedExpression, lowerBoundedExpression,
  upperBoundedExpression, eq, le, ge, completeUpperBound, completeLowerBound,
} from './expressions.js';
import type {
  MathOptModelOptions, MathOptSolveOptions, MathOptSolveResult,
  MathOptLinearExpressionInput, MathOptConversionOptions, MathOptLinearExpressionBounds,
  MathOptRobustCoefficient, MathOptRobustCoefficientProto, MathOptInfeasibleSubsystemOptions,
  MathOptProtoSolveOptions, MathOptProtoSolveResult, MathOptResultParseOptions,
  MathOptLinearTerm, MathOptQuadraticTerm, MathOptQuadraticExpressionInput,
} from './types.js';
import { captureResultIds, decodeSolveResponse, decodeProtoSolveResponse } from './results.js';
import {
  executeMathOptSolve, createMathOptExecutor, executeInfeasibleSubsystem, assertRawMathOptOptions,
  convertMathOptResultProto,
} from './execution.js';
import { type MathOptModelProto, encodeMathOptModelProto, decodeMathOptModelProto } from './model_proto.js';
import type { math_opt_LinearExpressionProto } from '../generated/mathopt_model_types.js';
import { toBinary, create, fromBinary } from '@bufbuild/protobuf';
import {
  MathOptExpressionBoundsRequestSchema, MathOptExpressionBoundsResponseSchema,
} from '../generated/bridge/mathopt_expression_bounds_pb.js';
import { executeSolverJob } from '../solver_job.js';
import type {
  MathOptConvertedProto, MathOptSolutionProtoKind, MathOptSolutionProtoMap,
  MathOptResultMetadataProtoKind, MathOptResultMetadataProtoMap,
} from './result_proto.js';
import { MathOptRobustConstraintRequestSchema } from '../generated/bridge/mathopt_model_transform_pb.js';
import {
  type MathOptSolutionImprovementOptions, encodeImprovementRequest, decodeImprovementResponse,
} from './solution_improvement.js';
import {
  type MathOptPrimalValuesProto, type MathOptFeasibilityOptions, type MathOptFeasibilityResult,
  type MathOptProtoFeasibilityResult, encodeFeasibilityRequest, decodeFeasibilityResponse,
} from './feasibility.js';
import {
  captureSubsystemHandles, bindModelSubset, type MathOptInfeasibleSubsystemResult, bindInfeasibleSubsystem,
  type MathOptProtoInfeasibleSubsystemResult,
} from './iis.js';
import { encodeMathOptRpc } from './rpc_proto.js';

export type { MathOptSolutionImprovementOptions } from './solution_improvement.js';

export type {
  MathOptFeasibilityOptions, MathOptFeasibilityResult, MathOptProtoFeasibilityResult, MathOptPrimalValuesProto,
} from './feasibility.js';

export type { MathOptModelProto, MathOptModelUpdateProto } from './model_proto.js';

export type { MathOptInfeasibleSubsystemResult, MathOptProtoInfeasibleSubsystemResult,
  MathOptInfeasibleSubsystemResultProto, MathOptModelSubsetProto, MathOptModelSubset, MathOptSubsystemBounds } from './iis.js';

export type { MathOptSolutionProtoKind, MathOptSolutionProtoMap, MathOptResultMetadataProtoKind,
  MathOptResultMetadataProtoMap, MathOptConvertedProto } from './result_proto.js';

export type {
  MathOptEvent, MathOptLinearTerm, MathOptLinearConstraintMatrixEntry, MathOptQuadraticTerm,
  MathOptLinearExpressionBounds, MathOptRobustCoefficient, MathOptRobustCoefficientProto,
  MathOptLinearExpressionInput, MathOptQuadraticExpressionInput, MathOptLinearConstraintOptions,
  MathOptQuadraticConstraintOptions, MathOptSosConstraintOptions, MathOptSosConstraintKind,
  MathOptSecondOrderConeConstraintOptions, MathOptIndicatorConstraintOptions, MathOptVariableOptions,
  MathOptAuxiliaryObjectiveOptions, MathOptModelOptions, MathOptObjectiveParametersOptions,
  MathOptConversionOptions, MathOptResultParseOptions, MathOptMpsExportOptions, MathOptSolveOptions,
  MathOptProtoSolveOptions, MathOptInfeasibleSubsystemOptions, MathOptIncrementalInfeasibleSubsystemOptions,
  MathOptSolveResultProto, MathOptProtoSolveResult, MathOptSparseVectorFilterOptions,
  MathOptSparseVectorFilterInput, MathOptSolutionHintOptions, MathOptModelSolveParametersOptions,
  MathOptSolveInterrupterLike, MathOptSolveStats, MathOptSolveResult, MathOptPrimalSolutionResult,
  MathOptDualSolutionResult, MathOptPrimalRayResult, MathOptDualRayResult, MathOptBasisResult,
  MathOptSolutionResult, GScipParametersOptions, GlopParametersOptions, PdlpParametersOptions,
  GlpkParametersOptions, MathOptIncrementalSolverOptions, MathOptIncrementalSolveOptions,
  MathOptProtoIncrementalSolverOptions, MathOptProtoIncrementalSolveOptions, MathOptProtoUpdateOptions,
} from './types.js';

export { MathOptVariable } from './variable.js';

export {
  MathOptQuadraticTermKey, MathOptLinearExpression, MathOptQuadraticExpression, MathOptBoundedExpression,
  MathOptLowerBoundedExpression, MathOptUpperBoundedExpression, linearTerm, quadraticTerm, linearExpression,
  quadraticExpression, asFlatLinearExpression, asFlatQuadraticExpression, fastSum, multiplyLinearExpressions,
  evaluateExpression, boundedExpression, lowerBoundedExpression, upperBoundedExpression, eq, le, ge,
  completeUpperBound, completeLowerBound,
} from './expressions.js';

export {
  MathOptModel, MathOptUpdateTracker, MathOptLinearConstraint, MathOptQuadraticConstraint,
  MathOptSosConstraint, MathOptSecondOrderConeConstraint, MathOptIndicatorConstraint, MathOptObjective,
  MathOptAuxiliaryObjective,
} from './model.js';

export {
  MathOptSolverType, MathOptLPAlgorithm, MathOptEmphasis, GScipEmphasis, GScipMetaParamValue,
  PdlpOptimalityNorm, PdlpSchedulerType, PdlpRestartStrategy, PdlpLinesearchRule, GScipParameters,
  GlopParameters, PdlpParameters, GlpkParameters, MathOptSolveInterrupter, MathOptSparseVectorFilter,
  MathOptSolutionHint, MathOptObjectiveParameters, MathOptModelSolveParameters,
} from './parameters.js';

export { modelProtoToMps, mpsToModelProto } from './execution.js';

export { MathOptIncrementalSolver, MathOptProtoIncrementalSolver } from './sessions.js';

function capturePrimalValues(model: MathOptModel,
    values: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>) {
  const entries = typeof (values as ReadonlyMap<MathOptVariable, number>).get === 'function'
    ? [...values as ReadonlyMap<MathOptVariable, number>].map(([variable, value]) => {
        model.assertOwnsVariable(variable); return { id: BigInt(variable.id), value };
      })
    : Object.entries(values).map(([id, value]) => ({ id: toInt64(BigInt(id), 'MathOpt variable ID'), value }));
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return entries;
}

export class MathOpt {
  static readonly SolverType = MathOptSolverType;
  static readonly LPAlgorithm = MathOptLPAlgorithm;
  static readonly Emphasis = MathOptEmphasis;
  static readonly GScipEmphasis = GScipEmphasis;
  static readonly GScipMetaParamValue = GScipMetaParamValue;
  static readonly GScipParameters = GScipParameters;
  static readonly GlopParameters = GlopParameters;
  static readonly PdlpParameters = PdlpParameters;
  static readonly PdlpOptimalityNorm = PdlpOptimalityNorm;
  static readonly PdlpSchedulerType = PdlpSchedulerType;
  static readonly PdlpRestartStrategy = PdlpRestartStrategy;
  static readonly PdlpLinesearchRule = PdlpLinesearchRule;
  static readonly GlpkParameters = GlpkParameters;
  static readonly SolveInterrupter = MathOptSolveInterrupter;
  static readonly ModelSolveParameters = MathOptModelSolveParameters;
  static readonly ObjectiveParameters = MathOptObjectiveParameters;
  static readonly SparseVectorFilter = MathOptSparseVectorFilter;
  static readonly SolutionHint = MathOptSolutionHint;
  static readonly IncrementalSolver = MathOptIncrementalSolver;
  static readonly ProtoIncrementalSolver = MathOptProtoIncrementalSolver;
  static readonly LinearExpression = MathOptLinearExpression;
  static readonly QuadraticExpression = MathOptQuadraticExpression;
  static readonly QuadraticTermKey = MathOptQuadraticTermKey;
  static readonly BoundedExpression = MathOptBoundedExpression;
  static readonly LowerBoundedExpression = MathOptLowerBoundedExpression;
  static readonly UpperBoundedExpression = MathOptUpperBoundedExpression;

  static Model(name = '', options: MathOptModelOptions = {}): MathOptModel {
    return new MathOptModel(name, options);
  }

  static async solve(model: MathOptModel, options: MathOptSolveOptions = {}): Promise<MathOptSolveResult> {
    options = { ...options };
    const requestBytes = MathOpt.encodeSolveRequest(model, options);
    const names = captureResultIds(model);
    const responseBytes = await executeMathOptSolve(requestBytes, options);
    const result = decodeSolveResponse(responseBytes, model, names);
    return result;
  }

  /** Native expression bounds from variable domains only; no optimization or constraint propagation. */
  static async linearExpressionBounds(model: MathOptModel, expression: MathOptLinearExpressionInput,
      options: MathOptConversionOptions = {}): Promise<MathOptLinearExpressionBounds> {
    const flat = asFlatLinearExpression(expression);
    const terms = [...flat.terms].map(([variable, coefficient]) => {
      model.assertOwnsVariable(variable); return { id: variable.id, coefficient };
    }).sort((a, b) => a.id - b.id);
    return MathOpt.linearExpressionBoundsProto(model.encodeModelProto(), {
      ids: terms.map(term => term.id), coefficients: terms.map(term => term.coefficient), offset: flat.offset,
    }, options);
  }

  static async linearExpressionBoundsProto(model: Uint8Array | MathOptModelProto, expression: math_opt_LinearExpressionProto,
      options: MathOptConversionOptions = {}): Promise<MathOptLinearExpressionBounds> {
    const request = toBinary(MathOptExpressionBoundsRequestSchema, create(MathOptExpressionBoundsRequestSchema, {
      modelProto: encodeMathOptModelProto(model), variableIds: (expression.ids ?? []).map(id => toInt64(id, 'MathOpt variable ID')),
      coefficients: expression.coefficients ?? [], offset: expression.offset ?? 0,
    }));
    const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'expressionBounds', request }, options);
    if (!('expressionBounds' in result)) throw new Error('MathOpt executor returned the wrong expression bounds response.');
    const bounds = fromBinary(MathOptExpressionBoundsResponseSchema, result.expressionBounds);
    if (bounds.error) throw new Error(bounds.error);
    return { lowerBound: bounds.lowerBound, upperBound: bounds.upperBound };
  }

  /** Returns a new model with a robust constraint formulated by native LP duality. */
  static async addRobustConstraint(model: MathOptModel, uncertaintyModel: MathOptModel, rhs: MathOptVariable,
      uncertainCoefficients: Iterable<MathOptRobustCoefficient>, options: MathOptConversionOptions = {}): Promise<MathOptModel> {
    model.assertOwnsVariable(rhs);
    const coefficients = [...uncertainCoefficients].map(({ variable, coefficient }) => {
      model.assertOwnsVariable(variable);
      const expression = asFlatLinearExpression(coefficient);
      const terms = [...expression.terms].map(([variable, value]) => {
        uncertaintyModel.assertOwnsVariable(variable); return { id: variable.id, value };
      }).sort((a, b) => a.id - b.id);
      return { variableId: variable.id, coefficient: { ids: terms.map(term => term.id),
        coefficients: terms.map(term => term.value), offset: expression.offset } };
    });
    options = { ...options };
    const transformed = await MathOpt.addRobustConstraintProto(model.encodeModelProto(), uncertaintyModel.encodeModelProto(), rhs.id, coefficients, options);
    return MathOptModel.fromModelProto(transformed.bytes, options);
  }

  static async addRobustConstraintProto(model: Uint8Array | MathOptModelProto, uncertaintyModel: Uint8Array | MathOptModelProto,
      rhsId: IntValue, uncertainCoefficients: Iterable<MathOptRobustCoefficientProto>,
      options: MathOptConversionOptions = {}): Promise<MathOptConvertedProto<MathOptModelProto>> {
    const request = toBinary(MathOptRobustConstraintRequestSchema, create(MathOptRobustConstraintRequestSchema, {
      modelProto: encodeMathOptModelProto(model), uncertaintyModelProto: encodeMathOptModelProto(uncertaintyModel),
      rhsId: toInt64(rhsId, 'MathOpt RHS variable ID'), uncertainCoefficients: [...uncertainCoefficients].map(input => ({
        variableId: toInt64(input.variableId, 'MathOpt variable ID'),
        uncertaintyVariableIds: (input.coefficient.ids ?? []).map(id => toInt64(id, 'MathOpt uncertainty variable ID')),
        coefficients: input.coefficient.coefficients ?? [], offset: input.coefficient.offset ?? 0,
      })),
    }));
    const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'addRobustConstraint', request }, options);
    if ('validationError' in result) throw new Error(result.validationError);
    if (!('model' in result)) throw new Error('MathOpt executor returned the wrong model transformation response.');
    const bytes = new Uint8Array(result.model);
    return { bytes, proto: decodeMathOptModelProto(bytes) };
  }

  static async formulateIndicatorConstraintAsMip(model: MathOptModel, constraint: MathOptIndicatorConstraint,
      options: MathOptConversionOptions = {}): Promise<MathOptModel> {
    if (constraint.model !== model) throw new Error('Indicator constraint does not belong to this MathOpt model.');
    constraint.assertLive();
    options = { ...options };
    const transformed = await MathOpt.formulateIndicatorConstraintAsMipProto(model.encodeModelProto(), constraint.id, options);
    return MathOptModel.fromModelProto(transformed.bytes, options);
  }

  static async formulateIndicatorConstraintAsMipProto(model: Uint8Array | MathOptModelProto, indicatorConstraintId: IntValue,
      options: MathOptConversionOptions = {}): Promise<MathOptConvertedProto<MathOptModelProto>> {
    const result = await executeSolverJob(createMathOptExecutor(options.executor), {
      type: 'formulateIndicatorConstraintAsMip', model: encodeMathOptModelProto(model),
      indicatorConstraintId: toInt64(indicatorConstraintId, 'MathOpt indicator constraint ID'),
    }, options);
    if ('validationError' in result) throw new Error(result.validationError);
    if (!('model' in result)) throw new Error('MathOpt executor returned the wrong model transformation response.');
    const bytes = new Uint8Array(result.model);
    return { bytes, proto: decodeMathOptModelProto(bytes) };
  }

  static async moveVariablesToTheirBestFeasibleValue(model: MathOptModel,
      values: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>, variables: Iterable<MathOptVariable>,
      options: MathOptSolutionImprovementOptions = {}): Promise<ReadonlyMap<MathOptVariable, number>> {
    const entries = capturePrimalValues(model, values);
    const selected = [...variables].map(variable => { model.assertOwnsVariable(variable); return variable.id; });
    const handles = new Map(model.variables().map(variable => [variable.id, variable]));
    const result = await MathOpt.moveVariablesToTheirBestFeasibleValueProto(model.encodeModelProto(),
      { ids: entries.map(entry => entry.id), values: entries.map(entry => entry.value) }, selected, options);
    return readonlyMap(new Map((result.proto.ids ?? []).map((id, index) =>
      [handles.get(Number(id))!, result.proto.values![index]])));
  }

  static async moveVariablesToTheirBestFeasibleValueProto(model: Uint8Array | MathOptModelProto,
      values: MathOptPrimalValuesProto, variables: Iterable<IntValue>, options: MathOptSolutionImprovementOptions = {}):
      Promise<MathOptConvertedProto<MathOptPrimalValuesProto>> {
    const request = encodeImprovementRequest(encodeMathOptModelProto(model), values, variables, options);
    const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'improveSolution', request }, options);
    if (!('improvedValues' in result)) throw new Error('MathOpt executor returned the wrong solution improvement response.');
    return decodeImprovementResponse(result.improvedValues);
  }

  static async checkPrimalSolutionFeasibility(model: MathOptModel,
      values: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>,
      options: MathOptFeasibilityOptions = {}): Promise<MathOptFeasibilityResult> {
    const entries = capturePrimalValues(model, values);
    const handles = captureSubsystemHandles(model);
    const result = await MathOpt.checkPrimalSolutionFeasibilityProto(model.encodeModelProto(),
      { ids: entries.map(entry => entry.id), values: entries.map(entry => entry.value) }, options);
    return { feasible: result.feasible, violations: bindModelSubset(result.violations, handles), descriptions: result.descriptions };
  }

  static async checkPrimalSolutionFeasibilityProto(model: Uint8Array | MathOptModelProto,
      values: MathOptPrimalValuesProto, options: MathOptFeasibilityOptions = {}): Promise<MathOptProtoFeasibilityResult> {
    const request = encodeFeasibilityRequest(encodeMathOptModelProto(model), values, options);
    const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'checkPrimalFeasibility', request }, options);
    if (!('primalFeasibility' in result)) throw new Error('MathOpt executor returned the wrong feasibility response.');
    return decodeFeasibilityResponse(result.primalFeasibility);
  }

  static async computeInfeasibleSubsystem(model: MathOptModel, options: MathOptInfeasibleSubsystemOptions = {}): Promise<MathOptInfeasibleSubsystemResult> {
    const handles = captureSubsystemHandles(model);
    const result = await executeInfeasibleSubsystem(model, options);
    return bindInfeasibleSubsystem(result.response, handles, result.messages);
  }

  static async computeInfeasibleSubsystemProto(model: Uint8Array | MathOptModelProto,
      options: MathOptInfeasibleSubsystemOptions = {}): Promise<MathOptProtoInfeasibleSubsystemResult> {
    return executeInfeasibleSubsystem(encodeMathOptModelProto(model), options);
  }

  static async solveProto(model: Uint8Array | MathOptModelProto, options: MathOptProtoSolveOptions = {}): Promise<MathOptProtoSolveResult> {
    assertRawMathOptOptions(options);
    const requestBytes = encodeSolveRequest(encodeMathOptModelProto(model), options);
    return decodeProtoSolveResponse(await executeMathOptSolve(requestBytes, options));
  }

  // Parse native SolveResultProto bytes, as returned by a persisted/native solve.
  static async parseSolveResult(resultProto: Uint8Array, model: MathOptModel, options: MathOptResultParseOptions = {}): Promise<MathOptSolveResult> {
    const source = new Uint8Array(resultProto);
    const request = encodeSolveRequest(model, { modelParameters: options.modelParameters });
    const names = captureResultIds(model);
    const result = await executeSolverJob(createMathOptExecutor(options.executor), { type: 'validateResult', request, result: source }, options);
    if ('validationError' in result) throw new Error(result.validationError);
    if (!('validatedResult' in result)) throw new Error('MathOpt executor returned the wrong result validation response.');
    return decodeSolveResponse(encodeMathOptRpc('SolveResponse', { result: result.validatedResult }, true), model, names);
  }

  static async convertSolutionProto<K extends MathOptSolutionProtoKind>(kind: K,
    input: Uint8Array | MathOptSolutionProtoMap[K], model: MathOptModel | Uint8Array | MathOptModelProto,
    options: MathOptConversionOptions = {}): Promise<MathOptConvertedProto<MathOptSolutionProtoMap[K]>> {
    return convertMathOptResultProto(kind, input,
      model instanceof MathOptModel ? model.encodeModelProto() : encodeMathOptModelProto(model), options);
  }

  static async convertResultProto<K extends MathOptResultMetadataProtoKind>(kind: K,
    input: Uint8Array | MathOptResultMetadataProtoMap[K], options: MathOptConversionOptions = {}):
    Promise<MathOptConvertedProto<MathOptResultMetadataProtoMap[K]>> {
    return convertMathOptResultProto(kind, input, new Uint8Array(), options);
  }

  static encodeSolveRequest(model: MathOptModel, options: MathOptSolveOptions = {}): Uint8Array {
    return encodeSolveRequest(model, options);
  }

  static linearTerm(variable: MathOptVariable, coefficient = 1): MathOptLinearTerm {
    return linearTerm(variable, coefficient);
  }

  static quadraticTerm(firstVariable: MathOptVariable, secondVariable: MathOptVariable, coefficient = 1): MathOptQuadraticTerm {
    return quadraticTerm(firstVariable, secondVariable, coefficient);
  }

  static linearExpression(terms: Iterable<MathOptLinearTerm> = [], offset = 0): MathOptLinearExpression {
    return linearExpression(terms, offset);
  }

  static quadraticExpression(
    linearTerms: Iterable<MathOptLinearTerm> = [],
    quadraticTerms: Iterable<MathOptQuadraticTerm> = [],
    offset = 0,
  ): MathOptQuadraticExpression {
    return quadraticExpression(linearTerms, quadraticTerms, offset);
  }

  static asFlatLinearExpression(input: MathOptLinearExpressionInput): MathOptLinearExpression {
    return asFlatLinearExpression(input);
  }

  static asFlatQuadraticExpression(input: MathOptQuadraticExpressionInput): MathOptQuadraticExpression {
    return asFlatQuadraticExpression(input);
  }

  static fastSum(inputs: Iterable<MathOptQuadraticExpressionInput>): MathOptLinearExpression | MathOptQuadraticExpression {
    return fastSum(inputs);
  }

  static multiplyLinearExpressions(
    lhs: MathOptLinearExpressionInput,
    rhs: MathOptLinearExpressionInput,
  ): MathOptQuadraticExpression {
    return multiplyLinearExpressions(lhs, rhs);
  }

  static evaluateExpression(
    expression: MathOptQuadraticExpressionInput,
    variableValues: ReadonlyMap<MathOptVariable, number> | Record<number | string, number>,
  ): number {
    return evaluateExpression(expression, variableValues);
  }

  static boundedExpression<TExpression>(
    lowerBound: number,
    expression: TExpression,
    upperBound: number,
  ): MathOptBoundedExpression<TExpression> {
    return boundedExpression(lowerBound, expression, upperBound);
  }

  static lowerBoundedExpression<TExpression>(
    lowerBound: number,
    expression: TExpression,
  ): MathOptLowerBoundedExpression<TExpression> {
    return lowerBoundedExpression(lowerBound, expression);
  }

  static upperBoundedExpression<TExpression>(
    expression: TExpression,
    upperBound: number,
  ): MathOptUpperBoundedExpression<TExpression> {
    return upperBoundedExpression(expression, upperBound);
  }

  static eq(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return eq(lhs, rhs);
  }

  static le(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptUpperBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
    | MathOptLowerBoundedExpression<MathOptQuadraticExpression>
    | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return le(lhs, rhs);
  }

  static ge(
    lhs: MathOptQuadraticExpressionInput,
    rhs: MathOptQuadraticExpressionInput,
  ): MathOptLowerBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression>
    | MathOptUpperBoundedExpression<MathOptQuadraticExpression>
    | MathOptBoundedExpression<MathOptLinearExpression | MathOptQuadraticExpression> {
    return ge(lhs, rhs);
  }

  static completeUpperBound<TExpression>(
    lowerBounded: MathOptLowerBoundedExpression<TExpression>,
    upperBound: number,
  ): MathOptBoundedExpression<TExpression> {
    return completeUpperBound(lowerBounded, upperBound);
  }

  static completeLowerBound<TExpression>(
    lowerBound: number,
    upperBounded: MathOptUpperBoundedExpression<TExpression>,
  ): MathOptBoundedExpression<TExpression> {
    return completeLowerBound(lowerBound, upperBounded);
  }
}
