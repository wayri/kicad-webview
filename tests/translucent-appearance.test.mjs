/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import path from 'node:path';
import {appearanceName,createTranslucentAppearance,inspectionTarget} from '../engine/spike/translucentAppearance.mjs';
import {copperLayerPlan} from '../engine/spike/copperLayers.mjs';import {createSelectionAppearance} from '../engine/spike/selectionAppearance.mjs';import {hasSavedSelection} from '../engine/spike/selectionState.mjs';import {sourceZoneGeometry} from '../engine/spike/sourceGeometry.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
test('translucent materials preserve source assets, shared material reuse, transforms, identities and visibility',()=>{
 const source=new THREE.MeshStandardMaterial({color:0x123456}),glass=new THREE.MeshPhysicalMaterial({opacity:.15,transparent:true}),geometry=new THREE.BoxGeometry(2,3,4),a=new THREE.Mesh(geometry,source),b=new THREE.Mesh(geometry,source),c=new THREE.Mesh(geometry,[source,glass]);
 a.userData.record={id:'U1'};a.visible=false;a.position.set(7,8,9);const style=createTranslucentAppearance();style.add(a,'component');style.add(b,'component');style.add(c,'substrate');style.setEnabled(true);
 assert.equal(a.material,b.material);assert.notEqual(a.material,source);assert.equal(a.material.opacity,.22);assert.equal(c.material[0].opacity,.12);assert.equal(c.material[1].opacity,.15*.12);assert.equal(a.material.depthWrite,false);assert.equal(a.material.transparent,true);assert.equal(a.material.forceSinglePass,true);
 assert.equal(source.opacity,1);assert.equal(source.transparent,false);assert.equal(glass.opacity,.15);assert.equal(a.geometry,geometry);assert.deepEqual(a.userData.record,{id:'U1'});assert.deepEqual(a.position.toArray(),[7,8,9]);assert.equal(a.visible,false);
 const later=new THREE.Mesh(geometry,source);style.add(later,'component');assert.equal(later.material,a.material);assert.equal(style.stats().materials,3);style.setEnabled(false);assert.equal(a.material,source);assert.deepEqual(c.material,[source,glass]);assert.equal(later.material,source);style.dispose();source.dispose();glass.dispose();geometry.dispose();
});
test('mode changes and selection clear retain translucency until explicitly restored, and release only owned clones',()=>{
 const source=new THREE.MeshStandardMaterial({color:0x008800}),geometry=new THREE.BoxGeometry(),a=new THREE.Mesh(geometry,source),b=new THREE.Mesh(geometry,source);a.userData.record={ref:'U1'};b.userData.record={ref:'U2'};
 const style=createTranslucentAppearance();style.add(a,'component');style.add(b,'component');style.setEnabled(true);const base=a.material;let cloneDisposed=0,sourceDisposed=0;base.addEventListener('dispose',()=>cloneDisposed++);source.addEventListener('dispose',()=>sourceDisposed++);
 const selection=createSelectionAppearance(THREE,()=>[a,b]);selection.update(record=>record?.ref==='U1',true);assert.equal(a.material.opacity,.22);assert.equal(b.material.opacity,.22);selection.restore();assert.equal(a.material,base);assert.equal(b.material,base);
 style.setEnabled(false);assert.equal(a.material,source);assert.equal(cloneDisposed,1);assert.equal(sourceDisposed,0);style.setEnabled(true);assert.notEqual(a.material,base);style.dispose();style.dispose();assert.equal(a.material,source);assert.equal(style.setEnabled(true),false);assert.equal(style.stats().objects,0);selection.dispose();geometry.dispose();source.dispose();
});
test('saved four-layer stackup places internal copper at actual saved elevations without moving outer inspection surfaces',()=>{
 const board={layers:['F.Cu','In1.Cu','In2.Cu','B.Cu'],stackup:[{name:'F.Cu',thickness:.035},{name:'dielectric1',thickness:.3},{name:'In1.Cu',thickness:.035},{name:'dielectric2',thickness:.86},{name:'In2.Cu',thickness:.035},{name:'dielectric3',thickness:.3},{name:'B.Cu',thickness:.035}]};
 const plan=copperLayerPlan(board,1.6);assert.deepEqual(plan.map(layer=>layer.name),board.layers);assert.equal(plan[0].z,.8250000000000001);assert.equal(plan[3].z,-.8250000000000001);assert.ok(Math.abs(plan[1].z-.4475)<1e-10);assert.ok(Math.abs(plan[2].z+.4475)<1e-10);assert.equal(plan[1].basis,'saved-stackup');assert.equal(plan[2].internal,true);
 const fallback=copperLayerPlan({...board,stackup:board.stackup.filter(layer=>layer.name!=='dielectric2')},1.6);assert.equal(fallback[1].basis,'illustrative');assert.ok(Math.abs(fallback[1].z-.8/3)<1e-10);assert.equal(copperLayerPlan({layers:['F.Cu','B.Cu']},1.6).length,2);assert.throws(()=>copperLayerPlan(board,0),/thickness/);
});
test('duplicate or incomplete stackup never masquerades as saved internal elevations',()=>{
 for(const stackup of [[{name:'F.Cu',thickness:.1},{name:'In1.Cu',thickness:.1},{name:'In1.Cu',thickness:.1},{name:'B.Cu',thickness:1.3}],[{name:'F.Cu',thickness:.1},{name:'dielectric1'},{name:'In1.Cu',thickness:.1},{name:'B.Cu',thickness:.1}]])assert.equal(copperLayerPlan({layers:['F.Cu','In1.Cu','B.Cu'],stackup},1.6)[1].basis,'illustrative');
});
test('internal zone parsing is explicit, bounded and distinguishes saved fill from unfilled outlines',()=>{
 const pts=['pts',['xy',0,0],['xy',10,0],['xy',10,10]],ast=['kicad_pcb',['net',1,'GND'],['zone',['layer','In1.Cu'],['net',1],['polygon',pts]],['zone',['layer','In2.Cu'],['filled_polygon',['layer','In2.Cu'],pts]]];
 assert.equal(sourceZoneGeometry(ast).records.length,0);const zones=sourceZoneGeometry(ast,100,1000,['In1.Cu','In2.Cu']);assert.deepEqual(zones.records.map(z=>[z.layer,z.filled]),[['In1.Cu',false],['In2.Cu',true]]);assert.equal(zones.records[0].net,'GND');const bounded=sourceZoneGeometry(ast,1,1000,['In1.Cu','In2.Cu']);assert.equal(bounded.records.length,1);assert.equal(bounded.truncated,true);
});
test('empty selection fast path respects saved identities and ignores unconnected net zero',()=>{
 for(const value of [{},{references:[]},{uuids:['']},{netCodes:[0,'0',null]},{netNames:[null]}])assert.equal(hasSavedSelection(value),false);
 for(const value of [{references:['U1']},{uuids:['saved-id']},{netNames:['GND']},{netCodes:[3]},{netCodes:['GND']}])assert.equal(hasSavedSelection(value),true);
 for(const name of ['realistic','layers','translucent'])assert.equal(appearanceName(name),name);assert.throws(()=>appearanceName('xray'),/Choose/);
});

test('translucent picking reaches internal geometry while hidden layers remain inaccessible',()=>{const substrate={visible:true},layer={visible:true},trace={visible:true,parent:layer};assert.equal(inspectionTarget(substrate,substrate,'realistic'),true);assert.equal(inspectionTarget(substrate,substrate,'translucent'),false);assert.equal(inspectionTarget(trace,substrate,'translucent'),true);layer.visible=false;assert.equal(inspectionTarget(trace,substrate,'translucent'),false);});

test('aggregate copper selectors are not physical internal layers',()=>{assert.deepEqual(copperLayerPlan({layers:['F.Cu','In1.Cu','B.Cu','F&B.Cu','*.Cu','User.Cu']},1.6).map(layer=>layer.name),['F.Cu','In1.Cu','B.Cu']);});
