import type { MathOptModel } from './model.js';

export type VariableData = {
  id: number;
  lowerBound: number;
  upperBound: number;
  integer: boolean;
  name: string;
  deleted: boolean;
};

const variableRecords = new WeakMap<MathOptVariable, VariableData>();

export function modelHandleFactory<TData extends object, THandle>(create: (model: MathOptModel, data: TData) => THandle) {
  const handles = new WeakMap<TData, THandle>();
  return (model: MathOptModel, data: TData): THandle => {
    let handle = handles.get(data);
    if (handle === undefined) { handle = create(model, data); handles.set(data, handle); }
    return handle;
  };
}

export let createMathOptVariable: (model: MathOptModel, data: VariableData) => MathOptVariable;

export class MathOptVariable {
  private constructor(readonly model: MathOptModel, private readonly data: VariableData) { variableRecords.set(this, data); }
  static { createMathOptVariable = modelHandleFactory((model, data: VariableData) => new MathOptVariable(model, data)); }

  get id(): number {
    return this.data.id;
  }

  get name(): string {
    this.assertLive();
    return this.data.name;
  }

  get lowerBound(): number {
    this.assertLive();
    return this.data.lowerBound;
  }

  set lowerBound(value: number) {
    this.assertLive();
    this.data.lowerBound = value;
  }

  get upperBound(): number {
    this.assertLive();
    return this.data.upperBound;
  }

  set upperBound(value: number) {
    this.assertLive();
    this.data.upperBound = value;
  }

  get integer(): boolean {
    this.assertLive();
    return this.data.integer;
  }

  set integer(value: boolean) {
    this.assertLive();
    this.data.integer = value;
  }

  equals(other: MathOptVariable): boolean {
    return this.model === other.model && this.id === other.id;
  }

  toString(): string {
    this.assertLive();
    return this.name || `variable_${this.id}`;
  }

  assertLive(): void {
    if (this.data.deleted) {
      throw new Error(`Variable ${this.id} has been deleted.`);
    }
  }
}

export function variableRecord(variable: MathOptVariable): VariableData | undefined { return variableRecords.get(variable); }

// Algebra only uses the record as an opaque identity key.
export function variableIdentity(variable: MathOptVariable): object | undefined { return variableRecords.get(variable); }
