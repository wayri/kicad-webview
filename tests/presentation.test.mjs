import test from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';import path from 'node:path';
import {qualityName,qualityViewport,boardOcclusion} from '../engine/spike/renderQuality.mjs';
import {createPresentationStudio} from '../engine/spike/presentationStudio.mjs';
import {KiCadViewer} from '../src/kicad-viewer.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
test('presentation supersampling is bounded on standard, premium and constrained devices',()=>{
 assert.equal(qualityName('presentation'),'presentation');assert.equal(qualityName('invalid'),'balanced');
 for(const profile of [{constrained:true,premium:false},{constrained:false,premium:false},{constrained:false,premium:true}])for(const [w,h,dpr]of [[800,600,1],[3840,2160,3],[200,160,2],[0,0,NaN]]){
 const a=qualityViewport(w,h,dpr,8192,'presentation',profile);assert.ok(Number.isFinite(a.ratio)&&a.ratio>0);assert.ok(a.pixels<=a.maxPixels);assert.ok(a.width<=8192&&a.height<=8192);assert.ok(a.estimatedBytes<410*1024*1024);}
 assert.ok(qualityViewport(800,600,1,8192,'presentation').ratio>qualityViewport(800,600,1,8192,'balanced').ratio);
 assert.equal(boardOcclusion(1.6,'presentation').samples,24);assert.equal(boardOcclusion().samples,12);
});
test('presentation stage leaves source bounds and picking identity untouched and releases resized shadows',()=>{
 const scene=new THREE.Scene(),board=new THREE.Group(),geometry=new THREE.BoxGeometry(100,80,1.6),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);board.add(mesh);scene.add(board);
 const light=new THREE.DirectionalLight();light.castShadow=true;light.shadow.mapSize.set(1024,1024);scene.add(light);let released=0;light.shadow.map={dispose(){released++;}};
 const renderer={shadowMap:{needsUpdate:false},toneMappingExposure:1},bounds=new THREE.Box3().setFromObject(board).clone(),studio=createPresentationStudio(THREE,{scene,renderer,extent:100,bottom:-.8});
 studio.addCaster(mesh);studio.apply(true);assert.equal(mesh.castShadow,true);assert.equal(studio.enabled,true);assert.equal(light.shadow.mapSize.x,2048);assert.equal(released,1);assert.equal(scene.environmentIntensity,1);assert.ok(new THREE.Box3().setFromObject(board).equals(bounds));
 const floor=scene.getObjectByName('Presentation stage');assert.equal(floor.material.side,THREE.FrontSide);assert.deepEqual(floor.userData,{});assert.equal(floor.parent,scene);
 light.shadow.map={dispose(){released++;}};studio.apply(false);assert.equal(mesh.castShadow,false);assert.equal(studio.enabled,false);assert.equal(released,2);assert.equal(light.shadow.mapSize.x,1024);assert.equal(scene.environmentIntensity,.65);assert.equal(renderer.toneMappingExposure,1);
 let disposed=0;floor.geometry.addEventListener('dispose',()=>disposed++);floor.material.addEventListener('dispose',()=>disposed++);studio.dispose();assert.equal(disposed,2);assert.equal(floor.parent,null);geometry.dispose();material.dispose();light.dispose();
});
test('public quality control validates view and returns actual renderer fallback without changing camera or selection',()=>{
 const selected={net:'/Pa'},camera={position:[1,2,3]},calls=[],viewer={assertActive(){},view:'3d',selection:selected,camera,renderer:{setQuality(value){calls.push(value);return 'balanced';}}};
 assert.equal(KiCadViewer.prototype.setRenderQuality.call(viewer,'presentation'),'balanced');assert.deepEqual(calls,['presentation']);assert.equal(viewer.selection,selected);assert.equal(viewer.camera,camera);
 assert.throws(()=>KiCadViewer.prototype.setRenderQuality.call(viewer,'unknown'),/Choose/);viewer.view='pcb';assert.throws(()=>KiCadViewer.prototype.setRenderQuality.call(viewer,'high'),/3D/);assert.equal(calls.length,1);
});
