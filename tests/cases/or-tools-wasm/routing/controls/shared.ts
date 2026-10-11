import type * as Api from 'or-tools-wasm/routing';
import type { ExecutorFixtureMode } from '../../../../harness/shared_case.ts';

export type RoutingControlContext = {
  api: typeof Api;
  mode: ExecutorFixtureMode;
  executor: Api.ExecutorSelection;
};
export type RoutingControlResult = {
  id: string; name: string; solver: string; source: string; tags: string[];
  mode: ExecutorFixtureMode; ok: true;
};
export function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
