
import test from 'node:test';import assert from 'node:assert/strict';
import {trackStrokePlan,arcStepPlan,throughVia,copperSurfaceMaterial} from '../engine/spike/copperSurface.mjs';
test('rounded track body stops at saved endpoints and circular caps preserve width at every angle',()=>{
 for(const angle of [0,Math.PI/4,Math.PI/2,-Math.PI*.75]){
  const start=[10,20],end=[10+12*Math.cos(angle),20+12*Math.sin(angle)],p=trackStrokePlan(start,end,.02);
  assert.ok(Math.abs(p.length-12)<1e-12);assert.equal(p.width,.02);assert.equal(p.radius,.01);
  const at=t=>[p.center[0]+t*Math.cos(p.angle),p.center[1]+t*Math.sin(p.angle)];
  assert.ok(Math.hypot(...at(-p.length/2).map((v,i)=>v-start[i]))<1e-12);assert.ok(Math.hypot(...at(p.length/2).map((v,i)=>v-end[i]))<1e-12);
  // A 32-sided disc bounds endcap radial deviation without stretching with length.
  assert.ok(p.radius*(1-Math.cos(Math.PI/32))<.00005);
 }
 const zero=trackStrokePlan([0,0],[0,0],2);assert.equal(zero.length,0);assert.equal(zero.radius,1);
 assert.equal(trackStrokePlan([0,0],[1,0],0),null);assert.equal(trackStrokePlan([NaN,0],[1,0],1),null);
});
test('arc chord error is bounded in millimetres rather than by a fixed coarse angle',()=>{
 for(const radius of [.1,1,10,100,250])for(const sweep of [Math.PI/12,Math.PI,Math.PI*2]){
  const p=arcStepPlan(radius,sweep);assert.equal(p.limited,false);assert.ok(radius*(1-Math.cos(sweep/p.steps/2))<=.005000001);assert.ok(p.steps<=512);
 }
 const huge=arcStepPlan(1e9,Math.PI*2);assert.equal(huge.steps,512);assert.equal(huge.limited,true);
});
test('saved filled copper is an opaque depth-writing surface; unsupported via spans are distinguished',()=>{
 assert.equal(copperSurfaceMaterial.transparent,false);assert.equal(copperSurfaceMaterial.depthWrite,true);assert.equal(copperSurfaceMaterial.opacity,1);
 assert.equal(throughVia({layers:['F.Cu','B.Cu']}),true);assert.equal(throughVia({layers:['B.Cu','F.Cu']}),true);
 assert.equal(throughVia({layers:['F.Cu','In1.Cu']}),false);assert.equal(throughVia({layers:['In1.Cu','In2.Cu']}),false);
});
