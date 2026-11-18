/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createSelectionAppearance,selectionStyle} from '../engine/spike/selectionAppearance.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
const matches=record=>record?.net==='GND';
function fixture(){
  const geometry=new THREE.BoxGeometry(1,2,3),materials=[new THREE.MeshStandardMaterial({color:0x824000}),new THREE.MeshStandardMaterial({color:0x208040})];
  const mesh=new THREE.InstancedMesh(geometry,materials,3);
  mesh.userData.records=[{net:'GND'},{net:'OTHER'},{net:'GND'}];
  for(let i=0;i<3;i++){mesh.setMatrixAt(i,new THREE.Matrix4().makeTranslation(i*3,2,1));mesh.setColorAt(i,new THREE.Color().setRGB(.2+i*.1,.4,.6));}
  const originalColors=mesh.instanceColor,matrices=Array.from(mesh.instanceMatrix.array),colors=Array.from(originalColors.array);
  const selection=createSelectionAppearance(THREE,()=>[mesh]);
  return {mesh,geometry,materials,originalColors,matrices,colors,selection,dispose(){selection.dispose();geometry.dispose();materials.forEach(material=>material.dispose());}};
}
function shader(material,kind='standard'){
  const source=THREE.ShaderLib[kind],value={vertexShader:source.vertexShader,fragmentShader:source.fragmentShader};
  material.onBeforeCompile(value,{});return value;
}
test('selection styles validate before changing active display state',()=>{
  assert.deepEqual(selectionStyle(),{mode:'dim',color:'accent'});
  const f=fixture();f.selection.update(matches,true,matches,{mode:'isolate',color:'source'});
  const material=f.mesh.material,colors=f.mesh.instanceColor;
  for(const invalid of [null,[],{mode:'missing'},{color:'pink'}])assert.throws(()=>f.selection.update(matches,true,matches,invalid),TypeError);
  assert.equal(f.mesh.material,material);assert.equal(f.mesh.instanceColor,colors);f.dispose();
});
test('bright preserves nonmatching source instances and every material color',()=>{
  const f=fixture();f.selection.update(matches,true,matches,{mode:'bright',color:'accent'});
  assert.deepEqual(Array.from(f.mesh.instanceColor.array).slice(3,6),f.colors.slice(3,6));
  f.mesh.material.forEach((material,i)=>assert.deepEqual(material.color,f.materials[i].color));
  assert.ok(f.mesh.instanceColor.array[0]<-1e15);assert.equal(f.selection.isVisible(f.mesh,0),true);
  const program=shader(f.mesh.material[0]);assert.match(program.fragmentShader,/diffuseColor.rgb = vec3/);assert.match(program.vertexShader,/selectionDecodedColor/);
  f.selection.restore();assert.equal(f.mesh.instanceColor,f.originalColors);assert.equal(f.mesh.material,f.materials);f.dispose();
});
test('source mode retains exact selected instance colors and decodes dimmed colors without changing source buffers',()=>{
  const f=fixture();f.selection.update(matches,true,matches,{mode:'dim',color:'source'});
  assert.deepEqual(Array.from(f.mesh.instanceColor.array).slice(0,3),f.colors.slice(0,3));
  for(let i=3;i<6;i++)assert.ok(Math.abs(-f.mesh.instanceColor.array[i]-1-f.colors[i])<1e-6);
  assert.deepEqual(Array.from(f.originalColors.array),f.colors);assert.match(shader(f.mesh.material[0]).fragmentShader,/dot\(outgoingLight/);
  f.selection.update(matches,true,matches,{mode:'bright',color:'source'});
  assert.deepEqual(Array.from(f.mesh.instanceColor.array),f.colors);f.dispose();
});
test('isolate discards individual unmatched instances in color and shadow passes and restores all owned resources',()=>{
  const f=fixture(),depth=new THREE.MeshDepthMaterial(),distance=new THREE.MeshDistanceMaterial();f.mesh.customDepthMaterial=depth;f.mesh.customDistanceMaterial=distance;f.mesh.visible=false;
  let geometryDisposed=0,sourceDisposed=0,ownedDisposed=0;
  f.geometry.addEventListener('dispose',()=>geometryDisposed++);f.materials.forEach(material=>material.addEventListener('dispose',()=>sourceDisposed++));
  f.selection.update(matches,true,matches,{mode:'isolate',color:'source'});
  assert.equal(f.selection.isVisible(f.mesh,0),true);assert.equal(f.selection.isVisible(f.mesh,1),false);assert.equal(f.selection.isVisible(f.mesh,2),true);
  assert.equal(f.mesh.geometry,f.geometry);assert.deepEqual(Array.from(f.mesh.instanceMatrix.array),f.matrices);assert.equal(f.mesh.visible,false);
  for(const [material,kind]of [...f.mesh.material.map(material=>[material,'standard']),[f.mesh.customDepthMaterial,'depth'],[f.mesh.customDistanceMaterial,'distanceRGBA']]){
    material.addEventListener('dispose',()=>ownedDisposed++);const program=shader(material,kind);assert.match(program.vertexShader,/vSelectionStyle = 3.0/);assert.match(program.fragmentShader,/if \(vSelectionStyle > 2.5\) discard/);
  }
  f.selection.dispose();assert.equal(f.mesh.material,f.materials);assert.equal(f.mesh.instanceColor,f.originalColors);assert.equal(f.mesh.customDepthMaterial,depth);assert.equal(f.mesh.customDistanceMaterial,distance);assert.equal(ownedDisposed,4);assert.equal(sourceDisposed,0);assert.equal(geometryDisposed,0);assert.equal(f.mesh.visible,false);
  f.dispose();depth.dispose();distance.dispose();
});
test('isolate preserves substrate/context and existing layer visibility while hiding only unmatched content',()=>{
  const base=new THREE.MeshStandardMaterial({color:0x306020,transparent:true,opacity:.22}),geometry=new THREE.BoxGeometry();
  const objects=[{type:'Board'},{net:'GND'},{net:'OTHER'},null].map(record=>{const mesh=new THREE.Mesh(geometry,base);mesh.userData.record=record;return mesh;});
  const layer=new THREE.Group();layer.visible=false;layer.add(objects[1]);objects[2].visible=false;
  const selection=createSelectionAppearance(THREE,()=>objects);selection.update(matches,true,matches,{mode:'isolate',color:'source'});
  assert.equal(objects[0].material,base);assert.equal(objects[1].material,base);assert.equal(objects[3].material,base);assert.equal(objects[2].material.visible,false);assert.equal(layer.visible,false);assert.equal(objects[2].visible,false);
  selection.update(matches,true,matches,{mode:'bright',color:'accent'});assert.equal(objects[2].material,base);assert.equal(objects[1].material.opacity,.22);
  selection.update(matches,false);objects.forEach(mesh=>assert.equal(mesh.material,base));assert.equal(layer.visible,false);geometry.dispose();base.dispose();
});

test('via plating retains gold in dim, bright and isolate styles without accent recoloring',()=>{
 const geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial({color:0xc5aa6c});
 const via=new THREE.InstancedMesh(geometry,material,2);via.userData={identity:'spike:via-barrel:through:test',records:[{net:'GND'},{net:'OTHER'}]};
 const selection=createSelectionAppearance(THREE,()=>[via]);
 for(const mode of ['dim','bright','isolate'])for(const color of ['source','accent']){selection.update(matches,true,matches,{mode,color});assert.equal(via.material.color.getHex(),0xc5aa6c);if(via.instanceColor)assert.ok(via.instanceColor.array[0]>=0);assert.equal(selection.isVisible(via,0),true);if(mode==='isolate')assert.equal(selection.isVisible(via,1),false);}
 selection.dispose();assert.equal(via.material,material);geometry.dispose();material.dispose();
});

test('expanded net context fades unrelated via caps and barrels and restores their exact source state',()=>{
 for(const color of ['source','accent']){
  const geometry=new THREE.BoxGeometry(1,1,2),materials=[new THREE.MeshStandardMaterial({color:0xc5aa6c}),new THREE.MeshStandardMaterial({color:0xc5aa6c})];
  const meshes=['F.Cu','through','B.Cu'].map(layer=>{const mesh=new THREE.InstancedMesh(geometry,materials,2);mesh.userData={identity:'spike:via-barrel:'+layer+':saved',records:[{id:'selected-via',net:'GND'},{id:'context-via',net:'OTHER'}]};mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,0,0));return mesh;});
  const originalMatrices=meshes.map(mesh=>Array.from(mesh.instanceMatrix.array)),selection=createSelectionAppearance(THREE,()=>meshes);
  try{
   selection.update(matches,true,matches,{mode:'dim',color,expanded:true});
   for(const [i,mesh]of meshes.entries()){
    assert.equal(mesh.material[0].color.getHex(),0xc5aa6c,'selected via keeps its source gold');
    assert.deepEqual(Array.from(mesh.instanceColor.array).slice(0,3),[1,1,1]);
    assert.deepEqual(Array.from(mesh.instanceColor.array).slice(3),[-2,-2,-2],'only the unrelated via receives context flags');
    for(const material of mesh.material){assert.equal(material.transparent,true);assert.equal(material.depthWrite,false);const program=shader(material);assert.match(program.fragmentShader,/outgoingLight = vec3\(dot/);assert.match(program.fragmentShader,/diffuseColor.a \*= 0.24/);}
    assert.deepEqual(Array.from(mesh.instanceMatrix.array),originalMatrices[i]);
   }
   selection.update(r=>r?.net==='OTHER',true,null,{mode:'dim',color,expanded:true});
   assert.deepEqual(Array.from(meshes[0].instanceColor.array),[-2,-2,-2,1,1,1],'changing nets exchanges emphasis');
   selection.update(matches,true,matches,{mode:'dim',color,expanded:false});
   meshes.forEach(mesh=>{assert.equal(mesh.material,materials);assert.equal(mesh.instanceColor,null);});
   selection.update(matches,true,matches,{mode:'dim',color,expanded:true});selection.update(matches,false);
   meshes.forEach((mesh,i)=>{assert.equal(mesh.material,materials);assert.equal(mesh.instanceColor,null);assert.deepEqual(Array.from(mesh.instanceMatrix.array),originalMatrices[i]);});
  }finally{selection.dispose();meshes.forEach(mesh=>mesh.dispose());geometry.dispose();materials.forEach(material=>material.dispose());}
 }
});


test('net focus fades every unrelated instance and component body in assembled and expanded views',()=>{
 for(const expanded of [false,true])for(const color of ['source','accent']){
  const geometry=new THREE.BoxGeometry(),gold=new THREE.MeshStandardMaterial({color:0xc5aa6c}),bodyMaterial=new THREE.MeshStandardMaterial({color:0x428751});
  const via=new THREE.InstancedMesh(geometry,gold,2);via.userData={identity:'spike:via-barrel:through:test',records:[{net:'GND'},{net:'OTHER'}]};
  const parts=new THREE.InstancedMesh(geometry,bodyMaterial,2);parts.userData.records=[{type:'Component',ref:'U1'},{type:'Component',ref:'U2'}];
  const body=new THREE.Mesh(geometry,bodyMaterial);body.userData.record={type:'Component',ref:'U1'};
  const board=new THREE.Mesh(geometry,bodyMaterial);board.userData.record={type:'Board'};
  const sourceMatrices=Array.from(via.instanceMatrix.array),selection=createSelectionAppearance(THREE,()=>[via,parts,body,board]);
  try{
   // Connected part bodies are context even though the identity matcher includes them.
   const predicate=r=>matches(r)||r?.ref==='U1';
   selection.update(predicate,true,matches,{mode:'dim',color,expanded,netContext:true});
   assert.equal(via.material.color.getHex(),0xc5aa6c);
   assert.deepEqual(Array.from(via.instanceColor.array),[1,1,1,-2,-2,-2]);
   assert.deepEqual(Array.from(parts.instanceColor.array),[-2,-2,-2,-2,-2,-2]);
   for(const mesh of [via,parts]){assert.equal(mesh.material.transparent,true);assert.equal(mesh.material.depthWrite,false);assert.match(shader(mesh.material).fragmentShader,/diffuseColor.a \*= 0.24/);}
   for(const mesh of [body,board]){assert.equal(mesh.material.opacity,.24);assert.equal(mesh.material.transparent,true);assert.match(shader(mesh.material).fragmentShader,/outgoingLight = vec3\(dot/);}
   selection.update(r=>r?.net==='OTHER',true,null,{mode:'dim',color,expanded,netContext:true});
   assert.deepEqual(Array.from(via.instanceColor.array),[-2,-2,-2,1,1,1]);
   selection.update(matches,false);
   assert.equal(via.material,gold);assert.equal(via.instanceColor,null);assert.equal(parts.material,bodyMaterial);assert.equal(parts.instanceColor,null);assert.equal(body.material,bodyMaterial);assert.equal(board.material,bodyMaterial);assert.deepEqual(Array.from(via.instanceMatrix.array),sourceMatrices);
  }finally{selection.dispose();via.dispose();parts.dispose();geometry.dispose();gold.dispose();bodyMaterial.dispose();}
 }
});
