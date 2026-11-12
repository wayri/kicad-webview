/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createExplodeView,createExplodeOverlayGuard} from '../engine/spike/explodeView.mjs';
import {selectionGesture} from '../engine/spike/selectionGesture.mjs';
import {copperDepthPolicy,copperCapMaterials} from '../engine/spike/copperDepth.mjs';
import {createSelectionAppearance} from '../engine/spike/selectionAppearance.mjs';
import {createTranslucentAppearance} from '../engine/spike/translucentAppearance.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
const plan={layers:['F.Cu','In1.Cu','In2.Cu','In3.Cu','In4.Cu','B.Cu'].map((name,i)=>({name,z:1-i*.4}))};
const point=(button=0,x=10,id=1)=>({pointerId:id,button,clientX:x,clientY:20,preventDefault(){}});

test('right pan preserves selection for early and late native contextmenu events',()=>{
 for(const early of [true,false]){let selected='GND',menus=0;const gesture=selectionGesture({onPick:()=>selected=null,onContextMenu:()=>{menus++;selected=null;}});
  gesture.down(point(2));if(early)gesture.context(point(2));gesture.move(point(2,40));gesture.up(point(2,40));if(!early)gesture.context(point(2,40));assert.equal(selected,'GND');assert.equal(menus,0);
 }
});
test('unmoved right click, left click, cancelled drags, long press and keyboard menus remain distinct',()=>{
 let picks=0,menus=0,held=false;const gesture=selectionGesture({onPick:()=>picks++,onContextMenu:()=>menus++,isHeld:()=>held});
 gesture.down(point(2));gesture.context(point(2));gesture.up(point(2));gesture.context(point(2));assert.equal(menus,1);assert.equal(picks,0);
 gesture.down(point());gesture.up(point());assert.equal(picks,1);gesture.down(point());gesture.cancel(point());gesture.up(point());assert.equal(picks,1);
 held=true;gesture.down(point());gesture.up(point());gesture.context(point());assert.equal(picks,1);assert.equal(menus,1);
 held=false;gesture.context(point());assert.equal(menus,2);gesture.down(point());gesture.up(point(),{select:false});assert.equal(picks,1);
 gesture.down(point(0,10,1));gesture.down(point(0,30,2));gesture.up(point(0,30,2));gesture.up(point(0,10,1));assert.equal(picks,1);
});
test('saved layers and late model groups separate reversibly without changing XY or records',()=>{
 const view=createExplodeView(THREE,plan),before=JSON.stringify(plan),objects=plan.layers.map(layer=>{const object=new THREE.Group();object.position.set(3,4,layer.z);return object;});
 for(const amount of [100,50,100,0]){view.set(amount);objects.forEach((object,index)=>view.layer(object,plan.layers[index].name));assert.deepEqual(objects.map(o=>o.position.x),Array(6).fill(3));assert.deepEqual(objects.map(o=>o.position.y),Array(6).fill(4));assert.deepEqual(objects.map(o=>o.position.z),plan.layers.map((l,i)=>l.z+(2.5-i)*4*amount/100));}
 view.set(100);const late=new THREE.Group();late.position.z=7;view.layer(late,'F.Cu');assert.equal(late.position.z,17);view.set(0);view.layer(late,'F.Cu');assert.equal(late.position.z,7);
 assert.equal(JSON.stringify(plan),before);assert.equal(view.offset('unknown'),0);assert.equal(view.set(200),100);assert.equal(view.set(-1),0);assert.throws(()=>view.set(NaN),/finite/);assert.throws(()=>view.set(Infinity),/finite/);
});
test('through via wall endpoints follow separated outer layers and restore their exact matrices',()=>{
 const view=createExplodeView(THREE,plan),span={zMin:-1.04,zMax:1.04},height=span.zMax-span.zMin,geometry=new THREE.BoxGeometry(1,1,height),material=new THREE.MeshBasicMaterial(),mesh=new THREE.InstancedMesh(geometry,material,1),record={uuid:'via',net:'GND'};
 mesh.userData.records=[record];mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(3,4,span.zMin));const original=Array.from(mesh.instanceMatrix.array),matrix=new THREE.Matrix4();
 for(const amount of [100,25,100,0]){view.set(amount);view.barrels(mesh,span);mesh.getMatrixAt(0,matrix);const low=new THREE.Vector3(0,0,0).applyMatrix4(matrix),high=new THREE.Vector3(0,0,height).applyMatrix4(matrix);assert.ok(Math.abs(low.z-(span.zMin+view.offset('B.Cu')))<1e-5);assert.ok(Math.abs(high.z-(span.zMax+view.offset('F.Cu')))<1e-5);assert.equal(low.x,3);assert.equal(low.y,4);assert.equal(mesh.userData.records[0],record);assert.equal(mesh.geometry,geometry);}
 assert.deepEqual(Array.from(mesh.instanceMatrix.array),original);geometry.dispose();material.dispose();
});
test('registered overlays and probes suspend together and restore visibility without touching ownership or opacity',()=>{
 const guard=createExplodeOverlayGuard(),group=new THREE.Group(),mesh=new THREE.Mesh(),probe=new THREE.Group(),owner=Symbol('result');group.add(mesh,probe);mesh.visible=false;const overlay={group,mesh,owner};
 assert.equal(guard.sync(overlay,50),true);assert.equal(group.visible,false);assert.equal(mesh.visible,false);assert.equal(overlay.owner,owner);guard.sync(overlay,100);guard.sync(overlay,0);assert.equal(group.visible,true);assert.equal(mesh.visible,false);
 const replacement={group:new THREE.Group()};guard.sync(replacement,100);assert.equal(replacement.group.visible,false);guard.sync(replacement,0);assert.equal(replacement.group.visible,true);
 group.visible=false;guard.sync(overlay,100);guard.sync(overlay,0);assert.equal(group.visible,false);assert.equal(guard.sync(null,50),false);
});
test('pad and via caps beat coplanar tracks at grazing slopes and their walls remain unbiased',()=>{
 const track=copperDepthPolicy('track'),pad=copperDepthPolicy('pad','cap'),via=copperDepthPolicy('via','cap');
 for(const slope of [0,1e-8,1e-5,.001,.1,1,100,10000])for(const bits of [16,24,32]){const unit=1/(2**bits-1),depth=p=>slope*p.polygonOffsetFactor+p.polygonOffsetUnits*unit;assert.ok(depth(pad)<depth(track)-unit);assert.ok(depth(via)<depth(pad)-unit);assert.ok(-2*slope-16*unit<depth(via));}
 for(const role of ['pad','via']){const wall=copperDepthPolicy(role,'wall');assert.equal(wall.polygonOffset,false);assert.equal(wall.polygonOffsetFactor,0);assert.equal(wall.polygonOffsetUnits,0);}
 for(const role of ['unknown','toString','constructor'])assert.throws(()=>copperDepthPolicy(role),/Unknown/);assert.throws(()=>copperDepthPolicy('pad','unknown'),/surface kind/);
});
test('extruded cap/wall material arrays survive source-colored selection and translucent round trips',()=>{
 const shape=new THREE.Shape().moveTo(-1,-1).lineTo(1,-1).lineTo(1,1).lineTo(-1,1).lineTo(-1,-1),geometry=new THREE.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:false}),materials=copperCapMaterials(THREE,'pad',{color:0xffffff}),mesh=new THREE.InstancedMesh(geometry,materials,1);
 mesh.userData.records=[{uuid:'pad',net:'GND'}];mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setColorAt(0,new THREE.Color(0x123456));
 assert.deepEqual([...new Set(geometry.groups.map(g=>g.materialIndex))],[0,1]);assert.equal(materials[0].polygonOffset,true);assert.equal(materials[1].polygonOffset,false);
 const selection=createSelectionAppearance(THREE,()=>[mesh]);selection.update(record=>record.net==='GND',true,record=>record.net==='GND',{mode:'bright',color:'source'});assert.ok(Array.isArray(mesh.material));assert.equal(mesh.material[0].polygonOffsetFactor,-1);assert.equal(mesh.material[1].polygonOffset,false);selection.restore();assert.equal(mesh.material,materials);
 const translucent=createTranslucentAppearance();translucent.add(mesh,'component');translucent.setEnabled(true);assert.ok(Array.isArray(mesh.material));translucent.setEnabled(false);assert.equal(mesh.material,materials);assert.equal(materials[1].polygonOffset,false);
 translucent.dispose();selection.dispose();geometry.dispose();materials.forEach(material=>material.dispose());
});
