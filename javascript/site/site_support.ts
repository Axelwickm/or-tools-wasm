export function requiredElement<K extends keyof HTMLElementTagNameMap>(
  id: string,
  tagName: K,
): HTMLElementTagNameMap[K];
export function requiredElement<K extends keyof SVGElementTagNameMap>(
  id: string,
  tagName: K,
): SVGElementTagNameMap[K];
export function requiredElement(id: string, tagName: string): Element {
  const element = document.getElementById(id);
  if (element?.localName !== tagName) {
    throw new Error(`Expected <${tagName} id="${id}"> in the example page.`);
  }
  return element;
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    if (item instanceof Uint8Array) return `<${item.byteLength} bytes>`;
    return item;
  }, 2) ?? String(value);
}

export class ActiveSolve {
  readonly #name: string;
  #controller: AbortController | null = null;

  constructor(name: string) {
    this.#name = name;
  }

  get running(): boolean {
    return this.#controller !== null;
  }

  start(): AbortSignal {
    if (this.#controller !== null) {
      throw new Error(`${this.#name} is already running.`);
    }
    this.#controller = new AbortController();
    return this.#controller.signal;
  }

  finish(signal: AbortSignal): void {
    if (this.#controller?.signal === signal) {
      this.#controller = null;
    }
  }

  cancel(reason?: unknown): void {
    this.#controller?.abort(reason);
  }
}
