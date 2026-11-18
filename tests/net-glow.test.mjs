import test from 'node:test';import assert from 'node:assert/strict';import{createRequire}from'node:module';import path from'node:path';
import{createNetGlow}from'../engine/spike/netGlow.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
test('selected copper shines through without copying models or changing source matrices or materials',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),original=new THREE.MeshStandardMaterial(),source=new THREE.InstancedMesh(geometry,original,2);source.userData.identity='spike:copper-track:F.Cu:tracks';source.userData.records=[{net:'GND'},{net:'VCC'}];source.setMatrixAt(0,new THREE.Matrix4().makeTranslation(1,2,3));source.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,5,6));scene.add(source);
 const model=new THREE.Mesh(geometry,original);model.userData.identity='spike:copper-track:%ZZ:untrusted-model-extra';model.userData.record={type:'Component',net:'GND'};scene.add(model);
 const before=source.instanceMatrix.array.slice(),glow=createNetGlow(THREE,{scene,objects:()=>[source,model]});let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
 glow.update(new Set(['GND']));assert.equal(glow.stats().instances,1);const overlay=scene.getObjectByName('Selected net shine-through').children[0];assert.equal(overlay.geometry,geometry);assert.equal(overlay.count,1);assert.equal(overlay.material.depthTest,false);assert.equal(overlay.material.depthWrite,false);assert.equal(overlay.material.toneMapped,false);assert.equal(source.material,original);assert.deepEqual(source.instanceMatrix.array,before);
 source.position.z=20;source.setMatrixAt(0,new THREE.Matrix4().makeTranslation(1,2,10));glow.update(new Set(['GND']));assert.equal(overlay.matrix.elements[14],20);const matrix=new THREE.Matrix4();overlay.getMatrixAt(0,matrix);assert.equal(matrix.elements[14],10);
 glow.update(new Set());assert.equal(glow.stats().instances,0);assert.equal(disposed,0);glow.dispose();geometry.dispose();original.dispose();
});
test('hidden layers stay hidden, copper fills remain faint, source colors and limits are respected',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.PlaneGeometry(),material=new THREE.MeshBasicMaterial(),zone=new THREE.Mesh(geometry,material);zone.userData.record={type:'Zone',layer:'In1.Cu',net:'GND'};scene.add(zone);let shown=false;
 const glow=createNetGlow(THREE,{scene,objects:()=>[zone],visible:()=>shown,colorForLayer:()=>0xff0000,maxInstances:1});glow.update(new Set(['GND']));assert.equal(glow.stats().instances,0);shown=true;glow.update(new Set(['GND']),{color:'source'});const overlay=scene.getObjectByName('Selected net shine-through').children[0];assert.ok(overlay.material.opacity<.2);assert.equal(overlay.material.color.getHex(),0xff0000);assert.equal(glow.stats().instances,1);shown=false;glow.update(new Set(['GND']),{color:'source'});assert.equal(glow.stats().instances,0);assert.equal(overlay.visible,false);glow.dispose();geometry.dispose();material.dispose();
});

test('net shine-through uses layer colors while via barrels remain gold in either style',()=>{
 const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();
 const track=new THREE.Mesh(geometry,material);track.userData={identity:'spike:copper-track:F.Cu:t',record:{type:'Track',net:'GND'}};
 const via=new THREE.Mesh(geometry,material);via.userData={identity:'spike:via-barrel:through:v',record:{type:'Via',net:'GND'}};
 const glow=createNetGlow(THREE,{scene,objects:()=>[track,via],colorForLayer:()=>0xff0000});
 for(const color of ['source','accent']){glow.update(new Set(['GND']),{color});const children=scene.getObjectByName('Selected net shine-through').children;
 assert.equal(children[0].material.color.getHex(),color==='source'?0xff0000:0x72f5ff);
 assert.equal(children[1].material.color.getHex(),0xc5aa6c);}
 glow.dispose();geometry.dispose();material.dispose();
});


test('saved endpoint annuli and blind via spans keep gold when copper palettes change',()=>{
 for(const layer of ['F.Cu','In1.Cu','F.Cu-In1.Cu']){
  const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial(),source=new THREE.InstancedMesh(geometry,material,1);
  source.userData={identity:'spike:via-barrel:'+layer+':saved',records:[{id:'via',net:'GND'}]};source.setMatrixAt(0,new THREE.Matrix4());scene.add(source);
  const glow=createNetGlow(THREE,{scene,objects:()=>[source],colorForLayer:()=>0xff0000});
  for(const color of ['source','accent','source']){glow.update(new Set(['GND']),{color});assert.equal(glow.stats().instances,1);assert.equal(scene.getObjectByName('Selected net shine-through').children[0].material.color.getHex(),0xc5aa6c);}
  glow.dispose();geometry.dispose();material.dispose();
 }
});
