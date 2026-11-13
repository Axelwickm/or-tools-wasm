// Embedded in generated Node glue; keep this function self-contained.
export function createNodePthreadSupport(BaseWorker, args) {
  const execArgv = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input-type') { i++; continue; }
    if (args[i].startsWith('--input-type=')) continue;
    execArgv.push(args[i]);
  }
  const workers = new Set();
  let starting = true;
  let rejectStartup;
  const failure = new Promise((_, reject) => { rejectStartup = reject; });
  // Workers can fail while WASM is still compiling, before the race is awaited.
  failure.catch(() => {});
  const support = {
    fail(error) {
      if (!starting) return false;
      rejectStartup(error);
      return true;
    },
    Worker: class extends BaseWorker {
      constructor(url, options) {
        // Preserve Node's built-in inheritance/filtering when no flag needs removal.
        super(url, execArgv.length === args.length ? options : { ...options, execArgv });
        workers.add(this);
        this.on('error', error => { support.fail(error); });
        this.once('exit', code => {
          workers.delete(this);
          support.fail(new Error(`OR-Tools pthread exited during startup (code ${code}).`));
        });
      }
    },
    async initialize(create) {
      try {
        const module = await Promise.race([Promise.resolve().then(create), failure]);
        starting = false;
        return module;
      } catch (error) {
        await Promise.allSettled([...workers].map(worker => worker.terminate()));
        throw error;
      }
    },
  };
  return support;
}

export function patchNodePthreads(source) {
  const marker = '/* ortools-node-pthreads */';
  const wrapper = `${marker}
export default async function(moduleArg={}) {
  const { Worker } = await import('node:worker_threads');
  const support = (${createNodePthreadSupport.toString()})(Worker, process.execArgv);
  return support.initialize(() => cpSatModule(moduleArg, support));
}`;
  if (source.includes(marker)) {
    const start = source.indexOf(marker);
    const end = source.indexOf('var isPthread=', start);
    if (end < 0) throw new Error('Unsupported patched Emscripten Node pthread footer');
    return source.slice(0, start) + wrapper + source.slice(end);
  }
  const replacements = [
    ['async function cpSatModule(moduleArg={}){', 'async function cpSatModule(moduleArg={},ortoolsPthreads){'],
    ['globalThis.Worker=worker_threads.Worker;', 'var Worker=ortoolsPthreads?.Worker??worker_threads.Worker;'],
    ['worker.onerror=e=>{', 'worker.onerror=e=>{if(ortoolsPthreads?.fail(e))return;'],
    ['export default cpSatModule;', wrapper],
  ];
  for (const [from, to] of replacements) {
    if (source.split(from).length !== 2) throw new Error(`Unsupported Emscripten Node pthread glue: ${from}`);
    source = source.replace(from, to);
  }
  return source;
}
