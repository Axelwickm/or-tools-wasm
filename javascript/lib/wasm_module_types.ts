export type OrToolsWasmModule = {
  HEAPU8: Uint8Array;
  ccall(
    ident: string,
    returnType: string | null | undefined,
    argTypes: string[],
    args: unknown[],
    opts?: { async?: boolean },
  ): any;
  cwrap(ident: string, returnType: string | null | undefined, argTypes: string[]): any;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _free_buffer(ptr: number): void;
  [key: string]: any;
};
