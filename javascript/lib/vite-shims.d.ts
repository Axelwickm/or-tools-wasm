declare module '*.wasm?url' {
  const src: string;
  export default src;
}

declare module '*.wasm?url&no-inline' {
  const src: string;
  export default src;
}

declare module '*.d.ts?url' {
  const src: string;
  export default src;
}

declare module '*.js?url&no-inline' {
  const src: string;
  export default src;
}

declare module '*.js?worker&url' {
  const src: string;
  export default src;
}

declare module '*.ts?worker' {
  type WorkerClass = new () => Worker;
  const WorkerCtor: WorkerClass;
  export default WorkerCtor;
}
