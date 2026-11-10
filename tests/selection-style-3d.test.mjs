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
