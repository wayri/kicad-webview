/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
const helper=()=>import('../engine/spike/copperGeometry.mjs');
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const area=points=>points.slice(1).reduce((sum,b,i)=>sum+points[i][0]*b[1]-b[0]*points[i][1],0)/2;

test('circular tessellation scales to radius and reports its bounded error or explicit limit',async()=>{
 const {circularTessellation}=await helper();let prior=0;
 for(const radius of [.05,.2,1,3,100]){const plan=circularTessellation(radius);assert.ok(plan.segments>=24&&plan.segments<=128);assert.ok(plan.segments>=prior);prior=plan.segments;close(plan.error,radius*(1-Math.cos(Math.PI/plan.segments)));assert.equal(plan.limited,plan.error>.0025);}
 for(const radius of [0,-1,NaN,Infinity])assert.throws(()=>circularTessellation(radius),/Invalid/);
});
test('adaptive pad/drill contours retain exact sizes, local holes and winding',async()=>{
 const {smoothPadOutline,smoothDrillOutline}=await helper(),pad={shape:'circle',width:10,height:10,drill:2,drillShape:'circle',drillOffset:[.2,-.3]},outline=smoothPadOutline(pad);
 assert.ok(outline.outline.length>65);assert.ok(outline.tessellation.error<=.0025);assert.ok(area(outline.outline)>0);assert.ok(area(outline.drill)<0);assert.deepEqual(outline.outline[0],outline.outline.at(-1));
 for(const [x,y]of outline.outline)close(Math.hypot(x,y),5);for(const[x,y]of outline.drill)close(Math.hypot(x-.2,y+.3),1);
 const drill=smoothDrillOutline({drill:2,drillWidth:4,drillHeight:2,drillShape:'oval'});close(Math.max(...drill.map(p=>p[0])),2);close(Math.min(...drill.map(p=>p[1])),-1);
 assert.equal(smoothPadOutline({shape:'custom',width:2,height:2}),null);assert.equal(smoothPadOutline({shape:'circle',width:2,height:2,drill:2,drillShape:'circle'}),null);
});
test('outer copper placements are symmetric and separate the substrate by the disclosed display offset',async()=>{
 const {outerCopperPlacement}=await helper(),front=outerCopperPlacement('F.Cu',1.6,.018),back=outerCopperPlacement('B.Cu',1.6,.018);
 close(front.center,-back.center);close(front.base,.783);close(back.base+back.thickness,-.783);close(front.thickness,.018);assert.equal(front.displayOffset,.001);assert.throws(()=>outerCopperPlacement('In1.Cu',1.6,.035),/Invalid/);
});
test('native arc refinement meets sagitta tolerance without changing saved identity or source arrays',async()=>{
 const {refineCopperTracks}=await helper(),parse=require('../engine/design-diff.js').parse,ast=parse('(kicad_pcb (arc (start 100 0) (mid 0 100) (end -100 0) (width .2) (layer "F.Cu") (uuid "arc-one")))'),original=Array.from({length:24},(_,i)=>({id:'arc-one:'+i,start:[100*Math.cos(i*Math.PI/24),100*Math.sin(i*Math.PI/24)],end:[100*Math.cos((i+1)*Math.PI/24),100*Math.sin((i+1)*Math.PI/24)],width:.2,layer:'F.Cu',net:'GND'})),before=JSON.stringify(original),straight={id:'straight',start:[1,2],end:[3,4],width:.01,layer:'F.Cu'};
 const result=refineCopperTracks([...original,straight],ast),arcs=result.tracks.filter(t=>t.uuid==='arc-one');assert.ok(arcs.length>original.length);assert.deepEqual(result.warnings,[]);assert.equal(JSON.stringify(original),before);assert.equal(result.tracks.at(-1),straight);assert.ok(arcs.every(t=>original.some(o=>o.id===t.id)&&t.net==='GND'));
 assert.deepEqual(arcs[0].start,[100,0]);assert.deepEqual(arcs.at(-1).end,[-100,0]);for(const segment of arcs){const mid=[(segment.start[0]+segment.end[0])/2,(segment.start[1]+segment.end[1])/2];assert.ok(100-Math.hypot(...mid)<=.0025+1e-10);}
 const limited=refineCopperTracks(original,ast,{maxSegments:original.length});assert.ok(limited.warnings.some(w=>/budget/.test(w)));assert.equal(limited.tracks[0],original[0]);
});
test('round stroke batches preserve physical extents and CPU ray picking without a minimum-width floor',async()=>{
 const {copperStrokeBatches}=await helper(),track={id:'trace',uuid:'trace',start:[0,0],end:[10,0],width:.01},result=copperStrokeBatches(THREE,[track],{world:p=>p,z:.8,thickness:.035}),material=new THREE.MeshBasicMaterial(),group=new THREE.Group(),meshes=[];
 assert.equal(result.batches.length,3);assert.equal(result.batches[1].geometry,result.batches[2].geometry);
 for(const batch of result.batches){const mesh=new THREE.InstancedMesh(batch.geometry,material,batch.records.length),object=new THREE.Object3D();batch.records.forEach((record,index)=>{assert.equal(record,track);batch.place(object,record);object.updateMatrix();mesh.setMatrixAt(index,object.matrix);});mesh.userData.records=batch.records;group.add(mesh);meshes.push(mesh);}
 group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group);close(bounds.min.x,-.005,1e-7);close(bounds.max.x,10.005,1e-7);close(bounds.min.y,-.005,1e-7);close(bounds.max.y,.005,1e-7);close(bounds.max.z-bounds.min.z,.035,1e-7);
 const ray=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,10),new THREE.Vector3(0,0,-1)).intersectObjects(meshes,false);
 assert.equal(ray(-.0045,.0045).length,0,'old rectangular cap corner must have no copper');assert.ok(ray(-.0045,0).length>0);assert.equal(ray(-.0045,0)[0].object.userData.records[0].id,'trace');
 const zero=copperStrokeBatches(THREE,[{...track,end:[0,0]}],{world:p=>p,z:0,thickness:.035});assert.equal(zero.batches.length,2,'zero-length segment uses complementary half disks, without a core or coincident full caps');
 const all=new Set([...result.batches,...zero.batches].map(b=>b.geometry));all.forEach(g=>g.dispose());material.dispose();
});
test('saved drill bore walls remain open surfaces and never invent plating volume',async()=>{
 const {smoothDrillOutline,drillWallGeometry}=await helper(),loop=smoothDrillOutline({drill:1,drillShape:'circle'}),geometry=drillWallGeometry(THREE,loop,1.5);geometry.computeBoundingBox();
 close(geometry.boundingBox.min.x,-.5);close(geometry.boundingBox.max.x,.5);close(geometry.boundingBox.min.z,0);close(geometry.boundingBox.max.z,1.5);const normal=geometry.getAttribute('normal');for(let i=0;i<normal.count;i++)close(normal.getZ(i),0);
 assert.equal(geometry.index.count,(loop.length-1)*6);assert.throws(()=>drillWallGeometry(THREE,[[0,0],[1,0],[1,1]],1),/Invalid/);geometry.dispose();
});

test('refinement never pushes a near-edge saved drill through its copper contour',async()=>{
 const {smoothPadOutline}=await helper(),coordinate=4.999999/Math.SQRT2,pad={shape:'circle',width:10,height:10,drill:.000001,drillShape:'circle',drillOffset:[coordinate,coordinate]},result=smoothPadOutline(pad);
 assert.ok(result);assert.equal(result.tessellation.limited,true);assert.match(result.tessellation.reason,/containment/);assert.ok(result.drill.length>3);
});

test('asymmetric saved stack keeps copper inside nominal board depth and substrate between its inner faces',async()=>{
 const {sourceCopperPlan}=await import('../engine/spike/copperStack.mjs'),{outerCopperPlacement,substrateEnvelope}=await helper(),board={layers:['F.Cu','B.Cu'],stackup:[{name:'F.Cu',type:'copper',thickness:.07},{name:'dielectric 1',type:'core',thickness:1.495},{name:'B.Cu',type:'copper',thickness:.035}],vias:[]},plan=sourceCopperPlan(board,['kicad_pcb'],1.6),front=plan.byLayer.get('F.Cu'),back=plan.byLayer.get('B.Cu'),substrate=substrateEnvelope(1.6,plan.byLayer),F=outerCopperPlacement('F.Cu',1.6,front.thickness,front.z),B=outerCopperPlacement('B.Cu',1.6,back.thickness,back.z);
 close(front.z,.765);close(back.z,-.7825);close(substrate.top,.73);close(substrate.bottom,-.765);close(substrate.depth,1.495);assert.notEqual(substrate.top,-substrate.bottom,'asymmetric copper leaves an asymmetric substrate envelope');
 close(F.sourceCenter,front.z);close(B.sourceCenter,back.z);close(F.base+F.thickness,.801);close(B.base,-.801);close(F.base-substrate.top,.001);close(substrate.bottom-(B.base+B.thickness),.001);
 assert.equal(substrate.missingOuterDepths,false);assert.throws(()=>substrateEnvelope(1.6,new Map([['F.Cu',{z:-1,thickness:1}],['B.Cu',{z:1,thickness:1}]])),/valid substrate/);
});

test('blind and buried bores use saved endpoint depths and WebView UUID/tstamp fallback identities',async()=>{
 const {sourceCopperPlan}=await import('../engine/spike/copperStack.mjs');
 const names=['F.Cu','In1.Cu','In2.Cu','B.Cu'];
 const board={layers:names,vias:['old','buried','via-3','invalid'].map(id=>({id})),stackup:[]};
 const via=(type,from,to,...ids)=>['via',...type?[type]:[],['at',0,0],['layers',from,to],...ids];
 const ast=['kicad_pcb',via('blind','F.Cu','In1.Cu',['tstamp','old']),via('buried','In1.Cu','In2.Cu',['uuid','buried']),via(null,'B.Cu','F.Cu'),via('micro','F.Cu','In2.Cu',['uuid','invalid'])];
 const plan=sourceCopperPlan(board,ast,1.6);
 assert.equal(plan.viaSpans.size,3);
 for(const [id,from,to,type] of [['old','F.Cu','In1.Cu','blind'],['buried','In1.Cu','In2.Cu','buried'],['via-3','F.Cu','B.Cu','through']]){
  const span=plan.viaSpans.get(id);assert.equal(span.type,type);
  assert.deepEqual([span.from,span.to],[from,to]);
  close(span.zMax,plan.byLayer.get(from).z);close(span.zMin,plan.byLayer.get(to).z);
 }
 assert.ok(plan.warnings.some(message=>message.includes('Via invalid')));
});
