import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const repository = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(repository, 'javascript/package.json'));
const protobuf = require('protobufjs');

export function generateProtoTypes({ protoFiles, rootMessages, typeName, integerAlias,
  typesFile, typesBanner, descriptorFile, descriptorName, descriptorBanner }) {
  const root = new protobuf.Root();
  root.resolvePath = (_, target) => path.join(repository, target);
  root.loadSync(protoFiles).resolveAll();
  const reachable = new Map();
  function visit(object) {
    if (reachable.has(object.fullName)) return;
    reachable.set(object.fullName, object);
    if (object instanceof protobuf.Type) for (const field of object.fieldsArray) if (field.resolvedType) visit(field.resolvedType);
  }
  for (const name of rootMessages) visit(root.lookupType(name));

  const output = [typesBanner, `export type ${integerAlias} = number | bigint;`, ''];
  const primitives = { double: 'number', float: 'number', int32: 'number', uint32: 'number', sint32: 'number', fixed32: 'number', sfixed32: 'number', int64: integerAlias, uint64: integerAlias, sint64: integerAlias, fixed64: integerAlias, sfixed64: integerAlias, bool: 'boolean', string: 'string', bytes: 'Uint8Array' };
  for (const object of reachable.values()) {
    const name = typeName(object);
    if (object instanceof protobuf.Enum) {
      output.push(`export enum ${name} {`);
      for (const [key, value] of Object.entries(object.values)) output.push(`  ${key} = ${value},`);
      output.push('}', `export type ${name}_Name = ${Object.keys(object.values).map(key => JSON.stringify(key)).join(' | ')};`, '');
    } else if (object instanceof protobuf.Type) {
      output.push(`export type ${name} = {`);
      for (const field of object.fieldsArray) {
        let type = primitives[field.type];
        if (field.resolvedType) {
          type = typeName(field.resolvedType);
          if (field.resolvedType instanceof protobuf.Enum) type = `number | ${type}_Name`;
        }
        if (!type) throw new Error(`Unresolved field ${field.fullName}: ${field.type}`);
        if (field.map) type = `Record<string, ${type}>`;
        else if (field.repeated) type = `Array<${type}>`;
        output.push(`  ${field.name}?: ${type};`);
      }
      output.push('};', '');
    }
  }
  fs.writeFileSync(path.resolve(repository, typesFile), output.join('\n'));
  const descriptor = JSON.stringify(root.toJSON(), (_key, value) => {
    if (value === Infinity) return '__ortools_positive_infinity__';
    if (value === -Infinity) return '__ortools_negative_infinity__';
    if (typeof value === 'number' && Number.isNaN(value)) return '__ortools_nan__';
    return value;
  }).replaceAll('"__ortools_positive_infinity__"', 'Infinity')
    .replaceAll('"__ortools_negative_infinity__"', '-Infinity')
    .replaceAll('"__ortools_nan__"', 'NaN');
  fs.writeFileSync(path.resolve(repository, descriptorFile), `${descriptorBanner}\nexport const ${descriptorName} = ${descriptor};\n`);
  return reachable.size;
}
