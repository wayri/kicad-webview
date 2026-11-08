
import test from 'node:test';import assert from 'node:assert/strict';
import {cameraState3D} from '../engine/spike/cameraState.mjs';
test('3D camera snapshots copy bounded vectors and reject degenerate orientation atomically',()=>{
 const input={position:[20,-30,40],target:[1,2,3],up:[0,0,1]},state=cameraState3D(input);input.position[0]=999;assert.equal(state.position[0],20);
 for(const bad of [{...state,position:[NaN,0,0]},{...state,position:[1e8,0,0]},{...state,position:[1,2,3]},{...state,up:[0,0,0]},{position:[0,0,10],target:[0,0,0],up:[0,0,1]}])assert.throws(()=>cameraState3D(bad));
 assert.deepEqual(state,{position:[20,-30,40],target:[1,2,3],up:[0,0,1]});
});
