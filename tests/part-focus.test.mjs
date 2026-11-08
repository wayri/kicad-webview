import test from 'node:test';import assert from 'node:assert/strict';
import {partFocusCamera} from '../engine/spike/partFocus.mjs';
test('front/back focus centers translated rendered bounds and exposes their mounting side',()=>{
 for(const layer of ['F.Cu','B.Cu'])for(const aspect of [.35,1,3]){
  const state=partFocusCamera([30,-25,-4],[48,-15,6],layer,45,aspect);
  assert.deepEqual(state.target,[39,-20,1]);assert.deepEqual(state.position.slice(0,2),state.target.slice(0,2));
  assert.equal(Math.sign(state.position[2]-state.target[2]),layer==='B.Cu'?-1:1);
  const d=Math.abs(state.position[2]-1)-5,tan=Math.tan(Math.PI/8);assert.ok(d*tan*.55>=5-1e-10);assert.ok(d*tan*aspect*.55>=9-1e-10);
 }
});
test('tiny parts keep useful context and invalid or unknown placements leave camera alone',()=>{
 const state=partFocusCamera([0,0,0],[.2,.1,.1],'F.Cu',45,1);assert.ok(state.position[2]>15);
 for(const [min,max,layer] of [[[2,0,0],[1,1,1],'F.Cu'],[[NaN,0,0],[1,1,1],'F.Cu'],[[0,0,0],[1,1,1],'In1.Cu']])assert.equal(partFocusCamera(min,max,layer,45,1),null);
 assert.equal(partFocusCamera([0,0,0],[1,1,1],'F.Cu',45,0),null);
});
