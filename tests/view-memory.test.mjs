import test from 'node:test';import assert from 'node:assert/strict';import {ViewMemory} from '../src/view-memory.mjs';
test('camera memory restores only exact source/path/view and bounds retained designs',()=>{const memory=new ViewMemory(),camera={center:{x:1,y:2},zoom:3,flipped:false};let applied;const viewer={source:'one',path:'a',view:'pcb',getCamera:()=>camera,setCamera:c=>applied=c};memory.remember(viewer);camera.center.x=8;assert.equal(memory.restore(viewer),true);assert.equal(applied.center.x,1);viewer.source='changed';assert.equal(memory.restore(viewer),false);viewer.source='one';viewer.path='b';assert.equal(memory.restore(viewer),false);for(let i=0;i<9;i++){viewer.path=String(i);memory.remember(viewer);}assert.equal(memory.entries.length,4);memory.clear();assert.equal(memory.entries.length,0);});
test('3D camera and explode restore without retaining a renderer or source mutation',()=>{const memory=new ViewMemory(),camera={position:[1,2,3],target:[0,0,0],up:[0,0,1]},viewer={source:'pcb',path:'a',view:'3d',renderer:{getExplode:()=>35,setExplode:v=>viewer.explode=v},getCamera3D:()=>camera,setCamera3D:v=>viewer.camera=v};memory.remember(viewer);memory.restore(viewer);assert.equal(viewer.explode,35);assert.deepEqual(viewer.camera,camera);assert.notEqual(viewer.camera,camera);assert.equal(viewer.source,'pcb');assert.equal(Object.hasOwn(memory.entries[0],'renderer'),false);});

test('remembered expansion uses atomic restore before camera instead of scheduling live motion',()=>{
 const memory=new ViewMemory(),order=[],viewer={source:'pcb',path:'a',view:'3d',renderer:{getExplode:()=>100,restoreExpand:v=>order.push(['pose',v]),setExplode:()=>{throw Error('animated restore');}},getCamera3D:()=>({position:[1,2,3]}),setCamera3D:()=>order.push(['camera'])};
 memory.remember(viewer);assert.equal(memory.restore(viewer),true);assert.deepEqual(order,[['pose',100],['camera']]);
});


test('camera entries do not strongly own old design strings and collected history is a safe cache miss',()=>{
 const refs=[];class Ref{constructor(value){this.value=value;refs.push(this);}deref(){return this.value;}}
 const memory=new ViewMemory({WeakRefClass:Ref}),viewer={source:'old',path:'a',view:'pcb',getCamera:()=>({center:{x:1,y:2},zoom:3,flipped:false}),setCamera(){}};
 memory.remember(viewer);assert.equal(Object.hasOwn(memory.entries[0],'source'),false);viewer.source='new';viewer.path='b';assert.equal(memory.restore(viewer),false);refs[0].value=undefined;viewer.source='old';viewer.path='a';assert.equal(memory.restore(viewer),false);
});
test('without WeakRef, source changes evict history safely while same-source view switches restore',()=>{
 const memory=new ViewMemory({WeakRefClass:null}),viewer={source:'old',path:'a',view:'pcb',getCamera:()=>({center:{x:1,y:2},zoom:3,flipped:false}),setCamera(){}};
 memory.remember(viewer);assert.equal(memory.restore(viewer),true);viewer.source='new';memory.restore(viewer);viewer.source='old';assert.equal(memory.restore(viewer),false);
});
test('camera memory separates repeated schematic occurrences',()=>{
 const memory=new ViewMemory(),viewer={source:'same',path:'child.kicad_sch',view:'schematic',textInstancePath:'/root/A',getCamera:()=>({center:{x:1,y:2},zoom:3,flipped:false}),setCamera(){}};
 memory.remember(viewer);viewer.textInstancePath='/root/B';assert.equal(memory.restore(viewer),false);viewer.textInstancePath='/root/A';assert.equal(memory.restore(viewer),true);
});
