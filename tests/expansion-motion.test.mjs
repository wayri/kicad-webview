import test from 'node:test';import assert from 'node:assert/strict';
import{expansionPhases,createExpansionMotion}from'../engine/spike/expansionMotion.mjs';
import{KiCadViewer}from'../src/kicad-viewer.mjs';
test('Expand API validates the range and keeps the previous explode methods compatible',()=>{
 const calls=[],viewer={assertActive(){},view:'3d',renderer:{setExpand(value){calls.push(value);return value;},getExpand(){return 35;}}};
 assert.equal(KiCadViewer.prototype.setExpand.call(viewer,100),100);assert.equal(KiCadViewer.prototype.setExplode.call(viewer,0),0);assert.equal(KiCadViewer.prototype.getExplode.call(viewer),35);assert.deepEqual(calls,[100,0]);
 for(const value of [-1,101,NaN,Infinity])assert.throws(()=>KiCadViewer.prototype.setExpand.call(viewer,value),/0 to 100/);
 viewer.view='pcb';assert.equal(KiCadViewer.prototype.getExpand.call(viewer),0);assert.throws(()=>KiCadViewer.prototype.setExpand.call(viewer,10),/3D/);
});
test('component lift completes before copper layers begin separating',()=>{
 assert.deepEqual(expansionPhases(0),{amount:0,components:0,layers:0});
 assert.deepEqual(expansionPhases(35),{amount:35,components:1,layers:0});
 assert.deepEqual(expansionPhases(100),{amount:100,components:1,layers:1});
 let previous=expansionPhases(0);for(let n=1;n<=100;n++){const next=expansionPhases(n);assert.ok(next.components>=previous.components&&next.layers>=previous.layers);previous=next;}
 assert.throws(()=>expansionPhases(Infinity),/finite/);
});
function harness(reduced=false){let time=0,seq=0,allowed=true;const frames=new Map(),values=[],settled=[];
 const motion=createExpansionMotion({request:fn=>{frames.set(++seq,fn);return seq;},cancel:id=>frames.delete(id),now:()=>time,update:v=>values.push(v),settle:v=>settled.push(v),canRun:()=>allowed,reducedMotion:()=>reduced});
 return{motion,frames,values,settled,allow:v=>allowed=v,step(){time+=16;const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(time));}};
}
test('retargeting reverses from the displayed pose and stops completely at rest',()=>{
 const h=harness();h.motion.set(100);for(let n=0;n<10;n++)h.step();const turning=h.motion.get();assert.ok(turning>0&&turning<100);
 h.motion.set(0);h.step();assert.ok(h.motion.get()<turning);assert.ok(h.motion.get()>0);
 for(let n=0;n<100;n++)h.step();assert.equal(h.motion.get(),0);assert.equal(h.frames.size,0);assert.deepEqual(h.settled,[0]);
 h.motion.set(100);h.motion.dispose();assert.equal(h.frames.size,0);h.motion.set(50);assert.equal(h.frames.size,0);
});
test('hidden motion pauses without a polling loop, resumes, and honors reduced motion',()=>{
 const h=harness();h.motion.set(100);h.step();h.allow(false);h.step();const stopped=h.motion.get();assert.equal(h.frames.size,0);h.step();assert.equal(h.motion.get(),stopped);h.allow(true);h.motion.resume();for(let n=0;n<100;n++)h.step();assert.equal(h.motion.get(),100);
 const r=harness(true);r.motion.set(80);assert.equal(r.motion.get(),80);assert.equal(r.frames.size,0);assert.deepEqual(r.settled,[80]);
});

test('disposal from an update callback cannot schedule another frame',()=>{
 const frames=new Map();let seq=0,motion;
 motion=createExpansionMotion({request:fn=>{frames.set(++seq,fn);return seq;},cancel:id=>frames.delete(id),now:()=>0,update:()=>motion.dispose()});motion.set(100);
 const callback=frames.values().next().value;frames.clear();callback(16);assert.equal(frames.size,0);assert.equal(motion.running(),false);
});

test('atomic expansion restore cancels pending motion and settles exactly without an intermediate frame',()=>{
 let queued=null,cancelled=0;const updates=[],settled=[];
 const motion=createExpansionMotion({request:fn=>{queued=fn;return 1;},cancel:()=>{queued=null;cancelled++;},update:v=>updates.push(v),settle:v=>settled.push(v)});
 motion.set(70);assert.equal(motion.running(),true);motion.set(100,{immediate:true});assert.equal(motion.get(),100);assert.equal(motion.target(),100);assert.equal(motion.running(),false);assert.equal(queued,null);assert.equal(cancelled,1);assert.deepEqual(updates,[100]);assert.deepEqual(settled,[100]);motion.dispose();
});
