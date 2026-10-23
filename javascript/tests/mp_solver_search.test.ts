import assert from 'node:assert/strict';
import type { MPSolverCallbackData } from '../lib/mp_solver/callbacks.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';

test('MPSolver callback wire preserves native values, capabilities, bounds and serialization safety', async () => {
  const directory = await mkdtemp(fileURLToPath(new URL('.mp-search-', import.meta.url)));
  try {
    const outfile = `${directory}/codec.mjs`;
    await build({ stdin: { contents: `export * from './mp_solver/callbacks.ts'; export {mpSolverProtocol} from './mp_solver/protocol.ts';
      export {create,toBinary,fromBinary} from '@bufbuild/protobuf'; export {MpSolverCallbackDataSchema,MpSolverCallbackResultSchema} from './generated/bridge/mp_solver_pb.ts';`,
      resolveDir: fileURLToPath(new URL('../lib', import.meta.url)) }, outfile, bundle:true,platform:'node',format:'esm',packages:'external' });
    const api = await import(outfile);
    const bytes = api.toBinary(api.MpSolverCallbackDataSchema,api.create(api.MpSolverCallbackDataSchema,{event:1,canQueryVariableValues:true,variableValues:{0:0,3:1.5},numExploredNodes:9007199254740993n}));
    let captured;
    const reply = api.mpCallbackHandler((data: MPSolverCallbackData) => { captured=data; return { cuts:[{upperBound:2,variableIndices:[3],coefficients:[1]}] }; })(bytes);
    assert.deepEqual(captured,{event:'mipNode',canQueryVariableValues:true,variableValues:{0:0,3:1.5},numExploredNodes:9007199254740993n});
    const result = api.fromBinary(api.MpSolverCallbackResultSchema,reply);
    assert.equal(result.cuts[0].lowerBound,-Infinity); assert.equal(result.cuts[0].upperBound,2);
    for(const row of [{variableIndices:[0.5],coefficients:[1]},{variableIndices:[0],coefficients:[]},{variableIndices:[0],coefficients:[NaN]},{variableIndices:[],coefficients:[],lowerBound:2,upperBound:1}])
      assert.throws(()=>api.mpCallbackHandler(()=>({lazyConstraints:[row]}))(bytes));
    assert.throws(()=>api.mpCallbackHandler(async()=>({}))(bytes),/synchronously/);
    assert.throws(()=>api.callbackRegistration(undefined,{}),/requires a callback/);
    assert.deepEqual(api.callbackRegistration(()=>{}, {variableIndices:[]}),{mightAddCuts:false,mightAddLazyConstraints:false,filterVariables:true,variableIndices:[]});
    const input={type:'solve',request:new Uint8Array([1,2]),numThreads:1,interruptible:false,
      startingBasis:{variableStatuses:[2],constraintStatuses:[4]},callbackRegistration:api.callbackRegistration(()=>{},{mightAddCuts:true})};
    const decoded=api.mpSolverProtocol.decodeRequest(api.mpSolverProtocol.encodeRequest(input));
    assert.deepEqual(decoded.startingBasis.variableStatuses,[2]); assert.deepEqual(decoded.startingBasis.constraintStatuses,[4]);
    assert.equal(decoded.callbackRegistration.mightAddCuts,true); assert.equal(decoded.callbackRegistration.filterVariables,false);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
