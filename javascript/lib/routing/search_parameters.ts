import * as protobuf from 'protobufjs';
import { encodeProtobufBigInts, normalizeProtobufInput } from '../protobufjs_helpers.js';
import { routingParametersDescriptor } from '../generated/routing_schemas.js';
import type { RoutingSearchParameters, RoutingModelParameters } from '../generated/routing_parameters.js';

const root = protobuf.Root.fromJSON(routingParametersDescriptor);
const parametersType = root.lookupType('operations_research.RoutingSearchParameters');
const modelParametersType = root.lookupType('operations_research.RoutingModelParameters');
root.resolveAll();

export type EncodedRoutingSearchParameters = { proto: Uint8Array; fields: string[] };

/** Encodes a sparse override and its supplied fields; native code applies it to solver defaults. */
export function encodeRoutingSearchParameters(parameters: RoutingSearchParameters): EncodedRoutingSearchParameters & { numWorkers: number } {
  const captured = normalizeProtobufInput(parameters, parametersType) as RoutingSearchParameters;
  if (captured.satParameters?.numSearchWorkers) throw new TypeError('Routing CP-SAT numSearchWorkers is not supported; use numWorkers.');
  if (captured.satParameters?.numWorkers !== undefined && captured.satParameters.numWorkers < 0) throw new TypeError('Routing CP-SAT numWorkers must be nonnegative.');
  return { ...encodeRoutingParameters(captured, parametersType), numWorkers: captured.satParameters?.numWorkers ?? 1 };
}

export function encodeRoutingModelParameters(parameters: RoutingModelParameters): EncodedRoutingSearchParameters {
  return encodeRoutingParameters(normalizeProtobufInput(parameters, modelParametersType), modelParametersType);
}

function encodeRoutingParameters(normalized: Record<string, unknown>, parametersType: protobuf.Type): EncodedRoutingSearchParameters {
  const fields: string[] = [];
  function collectFields(value: Record<string, unknown>, type: protobuf.Type, prefix: string): void {
    for (const [key, entry] of Object.entries(value)) {
      const field = type.fields[key].resolve();
      // Native descriptors use protobuf JSON names, including camelCase digit segments.
      const name = `${prefix}${field.name.replace(/_([a-zA-Z0-9])/g, (_match, letter: string) => letter.toUpperCase())}`;
      if (!field.repeated && field.resolvedType instanceof protobuf.Type && !field.map) {
        const nested = entry as Record<string, unknown>;
        if (Object.keys(nested).length === 0) fields.push(name);
        else collectFields(nested, field.resolvedType, `${name}.`);
      } else fields.push(name);
    }
  }
  collectFields(normalized, parametersType, '');
  const value = encodeProtobufBigInts(normalized, parametersType) as Record<string, unknown>;
  const error = parametersType.verify(value);
  if (error) throw new TypeError(`Routing search parameters: ${error}`);
  return { proto: new Uint8Array(parametersType.encode(parametersType.create(value)).finish()), fields };
}
