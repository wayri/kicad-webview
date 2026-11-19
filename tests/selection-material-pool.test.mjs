/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createSelectionAppearance} from '../engine/spike/selectionAppearance.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');

test('2048 repeated component occurrences share dim materials and release each clone exactly once',()=>{
 const geometry=new THREE.BoxGeometry(),sources=[new THREE.MeshStandardMaterial({color:0x428751}),new THREE.MeshStandardMaterial({color:0xc5aa6c})];
 const meshes=Array.from({length:2048},(_,i)=>{const mesh=new THREE.Mesh(geometry,sources);mesh.userData.record={type:'Component',ref:'U'+i};return mesh;}),selection=createSelectionAppearance(THREE,()=>meshes);
 let sourceDisposals=0;for(const material of sources)material.addEventListener('dispose',()=>sourceDisposals++);
 try{
  for(const expanded of [false,true]){
   selection.update(()=>true,true,()=>false,{mode:'dim',color:'source',netContext:true,expanded});
   const unique=new Set(meshes.flatMap(mesh=>mesh.material));assert.equal(unique.size,2);
   const disposed=new Map();for(const material of unique){disposed.set(material,0);material.addEventListener('dispose',()=>disposed.set(material,disposed.get(material)+1));assert.equal(material.opacity,.24);assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);}
   selection.update(()=>false,true,null,{mode:'dim',color:'source',netContext:true,expanded});
   assert.deepEqual(new Set(meshes.flatMap(mesh=>mesh.material)),unique,'changing nets reuses the same context pool');
   selection.restore();selection.restore();
   for(const mesh of meshes)assert.equal(mesh.material,sources);
   assert.deepEqual([...disposed.values()],[1,1]);assert.equal(sourceDisposals,0);
  }
 }finally{selection.dispose();geometry.dispose();sources.forEach(material=>material.dispose());}
});

test('shared model dim materials remain separate from instanced color and shadow variants',()=>{
 const geometry=new THREE.BoxGeometry(),source=new THREE.MeshStandardMaterial({color:0x428751}),body=new THREE.Mesh(geometry,source),instances=new THREE.InstancedMesh(geometry,source,2);
 body.userData.record={type:'Component'};instances.userData.records=[{net:'GND'},{net:'OTHER'}];
 const selection=createSelectionAppearance(THREE,()=>[body,instances]);
 try{
  selection.update(record=>record?.net==='GND',true,null,{mode:'dim',color:'source',netContext:true});
  assert.notEqual(body.material,instances.material);assert.equal(body.material.opacity,.24);assert.equal(instances.material.opacity,1);
  assert.deepEqual(Array.from(instances.instanceColor.array),[1,1,1,-2,-2,-2]);
  selection.update(record=>record?.net==='GND',true,null,{mode:'isolate',color:'source'});
  assert.equal(selection.isVisible(instances,0),true);assert.equal(selection.isVisible(instances,1),false);assert.ok(instances.customDepthMaterial);
  selection.restore();assert.equal(body.material,source);assert.equal(instances.material,source);assert.equal(instances.instanceColor,null);assert.equal(instances.customDepthMaterial,undefined);
 }finally{selection.dispose();instances.dispose();geometry.dispose();source.dispose();}
});
