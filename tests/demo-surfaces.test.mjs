import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import path from 'node:path';
import {createDemoSurfaces,planarFacePatch} from '../engine/spike/demoSurfaces.mjs';
const require=createRequire(import.meta.url),THREE=process.env.KICAD_WEB_BUILD_DEPS?require(path.join(process.env.KICAD_WEB_BUILD_DEPS,'three')):require('three');
class Canvas{constructor(){this.width=0;this.height=0;this.context={clearRect(){},fillRect(){},fillText(){},getImageData(){return {data:new Uint8ClampedArray(4)};},drawImage(source){this.copiedFrom=source;this.copyCount=(this.copyCount||0)+1;}};}getContext(){return this.context;}}
const doc={createElement(tag){assert.equal(tag,'canvas');return new Canvas();}};
function fixture(geometry=new THREE.BoxGeometry(2,4,1),record={type:'Component',id:'part-1',ref:'D1'}){
 const scene=new THREE.Scene(),object=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());object.userData.record=record;scene.add(object);scene.updateMatrixWorld(true);const objects=[object],errors=[];
 const surfaces=createDemoSurfaces(THREE,{scene,objects:()=>objects,document:doc,invalidate(){},onError:error=>errors.push(error)});
 const ray=(origin=[0,0,5],direction=[0,0,-1],list=objects)=>{scene.updateMatrixWorld(true);return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction)).intersectObjects(list,false)[0];};
 return {scene,object,objects,surfaces,ray,errors};
}
const triangleArea=geometry=>{const p=geometry.getAttribute('position');let sum=0;for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);sum+=b.sub(a).cross(c.sub(a)).length()/2;}return sum;};
test('selected actual box face has copied source identity, dimensions, position and contour UVs',()=>{
 const f=fixture(),face=f.surfaces.selectFace(f.ray());assert.equal(face.uuid,'part-1');assert.equal(face.reference,'D1');assert.equal(face.triangles,2);assert.equal(face.width,2);assert.equal(face.height,4);assert.deepEqual(face.normal,[0,0,1]);assert.deepEqual(face.center,[0,0,.5]);
 const handle=f.surfaces.createSurface('oled',{kind:'display',face,width:128,height:64,mode:'oled'}),mesh=f.surfaces.getPickables()[0];assert.equal(handle.canvas.width,128);assert.equal(handle.canvas.height,64);assert.equal(triangleArea(mesh.geometry),8);assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.polygonOffset,true);
 for(const value of mesh.geometry.getAttribute('uv').array)assert.ok(value>=0&&value<=1);
 const before=mesh.material.map.version;handle.update();assert.ok(mesh.material.map.version>before);face.center[0]=999;assert.equal(handle.face.center[0],0);handle.dispose();f.surfaces.dispose();
});
test('concave selected faces retain their actual triangles instead of filling the bounding rectangle',()=>{
 const shape=new THREE.Shape();shape.moveTo(0,0);for(const [x,y]of [[2,0],[2,1],[1,1],[1,2],[0,2]])shape.lineTo(x,y);shape.closePath();
 const f=fixture(new THREE.ShapeGeometry(shape)),face=f.surfaces.selectFace(f.ray([.5,.5,5]));f.surfaces.createSurface('lcd',{kind:'display',face,width:32,height:32});const meshes=f.surfaces.getPickables();assert.ok(Math.abs(triangleArea(meshes[0].geometry)-3)<1e-8);assert.equal(f.ray([1.5,1.5,5],[0,0,-1],meshes),undefined);assert.ok(f.ray([.5,.5,5],[0,0,-1],meshes));f.surfaces.dispose();
});
test('face traversal uses shared edges and material groups, never disconnected or point-touching islands',()=>{
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,1,1,0,0,0,0,1,1,0,0,1,0,1,1,0,2,1,0,2,2,0,1,1,0,2,2,0,1,2,0],3));
 assert.equal(planarFacePatch(THREE,g,0).triangles,2);g.addGroup(0,3,0);g.addGroup(3,3,1);assert.equal(planarFacePatch(THREE,g,0).triangles,1);
 const tooLarge=new THREE.BufferGeometry();tooLarge.setAttribute('position',new THREE.BufferAttribute(new Float32Array(50001*9),3));assert.throws(()=>planarFacePatch(THREE,tooLarge,0),/50,000/);
});
test('instanced component surfaces follow actual transforms and hide with population/visibility',()=>{
 const f=fixture();f.scene.remove(f.object);const object=new THREE.InstancedMesh(new THREE.BoxGeometry(2,4,1),new THREE.MeshBasicMaterial(),1);object.userData.records=[{type:'Component',id:'fp',ref:'U1'}];object.setMatrixAt(0,new THREE.Matrix4().compose(new THREE.Vector3(10,20,3),new THREE.Quaternion(),new THREE.Vector3(2,3,1)));f.scene.add(object);f.objects.splice(0,1,object);f.scene.updateMatrixWorld(true);
 const face=f.surfaces.selectFace(f.ray([10,20,10])),handle=f.surfaces.createSurface('matrix',{kind:'display',face,width:8,height:8,mode:'matrix'});assert.equal(face.width,4);assert.equal(face.height,12);assert.deepEqual(handle.face.center,[10,20,3.5]);
 const mesh=f.surfaces.getPickables()[0];assert.ok(mesh.matrix.elements[14]>3);object.visible=false;f.surfaces.sync();assert.equal(mesh.visible,false);object.visible=true;object.setMatrixAt(0,new THREE.Matrix4().makeScale(0,0,0));f.surfaces.sync();assert.equal(mesh.visible,false);assert.equal(handle.isAvailable(),false);assert.throws(()=>f.surfaces.createSurface('late',{kind:'display',face}),/no longer available/);f.surfaces.dispose();
});
test('unique named anchors choose real planar faces and reject ambiguous/stale anchors',()=>{
 const f=fixture();const handle=f.surfaces.createSurface('screen',{kind:'display',anchor:{reference:'D1',face:'top'},width:16,height:8});assert.equal(handle.face.reference,'D1');assert.deepEqual(handle.face.normal,[0,0,1]);
 const other=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());other.userData.record={type:'Component',id:'another',ref:'D1'};other.position.x=10;f.scene.add(other);f.objects.push(other);assert.throws(()=>f.surfaces.createSurface('bad',{kind:'display',anchor:{reference:'D1',face:'top'}}),/ambiguous/);
 const separate=fixture();assert.throws(()=>separate.surfaces.createSurface('wrong',{kind:'display',face:handle.face}),/another or closed/);separate.surfaces.dispose();f.surfaces.dispose();
});
test('buttons release outside the face, knobs clamp/quantize, and callback errors cannot leak resources',()=>{
 const f=fixture(),face=f.surfaces.selectFace(f.ray()),button=f.surfaces.createSurface('button',{kind:'button',face,label:'RUN'}),events=[];f.surfaces.setInputHandler(event=>events.push(event));const hit=f.ray([0,0,5],[0,0,-1],f.surfaces.getPickables());
 assert.equal(f.surfaces.pointer(hit,'press',{pointerId:1,clientY:10}),true);assert.equal(f.surfaces.hasActivePointer,true);assert.equal(f.surfaces.pointer(null,'release',{pointerId:1}),true);assert.deepEqual(events.map(e=>e.type),['press','release']);button.dispose();
 const knob=f.surfaces.createSurface('knob',{kind:'knob',face,min:0,max:10,step:2,value:2});const knobHit=f.ray([0,0,5],[0,0,-1],f.surfaces.getPickables());f.surfaces.pointer(knobHit,'press',{pointerId:2,clientY:20});f.surfaces.pointer(null,'move',{pointerId:2,clientY:18});assert.equal(events.at(-1).value,6);f.surfaces.pointer(null,'move',{pointerId:2,clientY:-100});assert.equal(events.at(-1).value,10);f.surfaces.pointer(null,'cancel',{pointerId:2});assert.equal(f.surfaces.hasActivePointer,false);
 f.surfaces.setInputHandler(()=>{throw Error('host failed');});f.surfaces.pointer(knobHit,'press',{pointerId:3,clientY:0});assert.equal(f.errors.length,1);knob.dispose();f.surfaces.dispose();f.surfaces.setInputHandler(null);knob.dispose();
});
test('whole-component LED coloring handles curved geometry reversibly without changing source material',()=>{
 const f=fixture(new THREE.SphereGeometry(1,16,8));let sourceDisposed=0;f.object.geometry.addEventListener('dispose',()=>sourceDisposed++);const original=f.object.material,originalColor=original.color.clone();
 const led=f.surfaces.createSurface('led',{kind:'led',anchor:{reference:'D1'},color:'#ff0000',on:true,brightness:.5});assert.equal(led.face.shape,'component');assert.equal(led.face.normal,null);const mesh=f.surfaces.getPickables()[0];assert.equal(mesh.geometry,f.object.geometry);assert.notEqual(mesh.material,original);assert.ok(mesh.material.color.r>.49&&mesh.material.color.r<.51);assert.deepEqual(original.color,originalColor);
 led.setLED({on:false});assert.ok(mesh.material.color.r<.03);led.dispose();assert.equal(sourceDisposed,0);assert.equal(f.object.material,original);f.surfaces.dispose();led.dispose();
});
test('canvas budgets, face occupancy and disposal are bounded and original materials survive',()=>{
 const f=fixture(),face=f.surfaces.selectFace(f.ray());assert.throws(()=>f.surfaces.createSurface('bad',{kind:'display',face,width:2048,height:1}),/1 to 1024/);const h=f.surfaces.createSurface('a',{kind:'display',face,width:1024,height:1024}),mesh=f.surfaces.getPickables()[0];assert.throws(()=>f.surfaces.createSurface('b',{kind:'display',face}),/already has/);
 let geometries=0,materials=0,textures=0;mesh.geometry.addEventListener('dispose',()=>geometries++);mesh.material.addEventListener('dispose',()=>materials++);mesh.material.map.addEventListener('dispose',()=>textures++);h.dispose();h.dispose();assert.deepEqual([geometries,materials,textures],[1,1,1]);f.surfaces.dispose();assert.throws(()=>f.surfaces.createSurface('late',{kind:'display',face}),/disposed/);
});

test('scripted button values update pressed appearance and cancellation is explicit',()=>{
 const f=fixture(),face=f.surfaces.selectFace(f.ray()),button=f.surfaces.createSurface('run',{kind:'button',face}),events=[];button.setValue(1);assert.equal(button.canvas.context.fillStyle,'#10202c');button.setValue(0);assert.equal(button.canvas.context.fillStyle,'#e1eaf3');
 f.surfaces.setInputHandler(event=>events.push(event));const hit=f.ray([0,0,5],[0,0,-1],f.surfaces.getPickables());f.surfaces.pointer(hit,'press',{pointerId:1});f.surfaces.pointer(null,'cancel',{pointerId:1});assert.equal(events.at(-1).cancelled,true);
 f.surfaces.pointer(hit,'press',{pointerId:2});f.surfaces.setInputHandler(null);assert.equal(f.surfaces.hasActivePointer,false);assert.equal(events.at(-1).cancelled,true);f.surfaces.dispose();
});
test('automatic face lookup has an aggregate scan budget and bounded unambiguous groups',()=>{
 const positions=[];for(let i=0;i<600;i++)positions.push(i*2,0,0,i*2+1,0,0,i*2,1,0);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const f=fixture(g);
 assert.throws(()=>f.surfaces.createSurface('screen',{kind:'display',anchor:{reference:'D1',face:'top'}}),/triangle-work budget/);const selected=f.surfaces.selectFace(f.ray([.2,.2,5]));assert.equal(selected.triangles,1);f.surfaces.dispose();
 const grouped=new THREE.BoxGeometry();grouped.clearGroups();for(let i=0;i<257;i++)grouped.addGroup(0,0,0);assert.throws(()=>planarFacePatch(THREE,grouped,0),/256 material-group/);grouped.clearGroups();grouped.addGroup(0,3,0);grouped.addGroup(0,3,1);assert.throws(()=>planarFacePatch(THREE,grouped,0),/Overlapping/);
});

test('display graphics use a private upload canvas and reject tainted input before replacing its last image',()=>{
 const f=fixture(),face=f.surfaces.selectFace(f.ray()),display=f.surfaces.createSurface('screen',{kind:'display',face,width:32,height:16}),mesh=f.surfaces.getPickables()[0],texture=mesh.material.map,upload=texture.image;
 assert.notEqual(upload,display.canvas);display.update();assert.equal(upload.context.copiedFrom,display.canvas);const version=texture.version,copies=upload.context.copyCount;
 display.canvas.context.getImageData=()=>{const error=new Error('tainted');error.name='SecurityError';throw error;};assert.throws(()=>display.update(),/CORS-enabled and origin-clean/);assert.equal(texture.version,version);assert.equal(upload.context.copyCount,copies);f.surfaces.dispose();
});

test('release callbacks may replace a surface without outer cleanup deleting or double-disposing the replacement',()=>{
 const f=fixture(),face=f.surfaces.selectFace(f.ray()),original=f.surfaces.createSurface('run',{kind:'button',face}),oldMesh=f.surfaces.getPickables()[0];let oldDisposed=0,replacement;oldMesh.geometry.addEventListener('dispose',()=>oldDisposed++);
 f.surfaces.setInputHandler(event=>{if(event.type==='release')replacement=f.surfaces.createSurface('run',{kind:'button',face});});
 const hit=f.ray([0,0,5],[0,0,-1],f.surfaces.getPickables());f.surfaces.pointer(hit,'press',{pointerId:1});original.dispose();assert.equal(oldDisposed,1);assert.equal(f.surfaces.getPickables().length,1);assert.ok(replacement);replacement.setValue(1);assert.equal(replacement.isAvailable(),true);f.surfaces.dispose();
});

test('real rounded proxies expose the entire flat cap with geometry-aligned up/right after rotation and scaling',async()=>{
 const packagePath=process.env.KICAD_WEB_BUILD_DEPS?path.join(process.env.KICAD_WEB_BUILD_DEPS,'three'):'three';
 const {pathToFileURL}=await import('node:url'),{RoundedBoxGeometry}=await import(pathToFileURL(path.resolve(path.dirname(require.resolve(packagePath)),'../examples/jsm/geometries/RoundedBoxGeometry.js')).href);
 const f=fixture(new RoundedBoxGeometry(1,1,1,2,.06));f.object.position.set(10,20,3);f.object.rotation.z=Math.PI;f.object.scale.set(16,5,2.1);f.scene.updateMatrixWorld(true);
 const display=f.surfaces.createSurface('oled',{kind:'display',anchor:{reference:'D1',face:'top'},width:128,height:64}),face=display.face,mesh=f.surfaces.getPickables()[0];
 assert.equal(face.triangles,2);assert.ok(Math.abs(triangleArea(mesh.geometry)-.7744)<1e-7);assert.ok(Math.abs(face.width-14.08)<1e-6);assert.ok(Math.abs(face.height-4.4)<1e-6);
 assert.ok(Math.hypot(face.center[0]-10,face.center[1]-20,face.center[2]-4.05)<1e-6);assert.ok(Math.hypot(face.normal[0],face.normal[1],face.normal[2]-1)<1e-10);
 assert.ok(Math.hypot(face.up[0],face.up[1]+1,face.up[2])<1e-10);assert.ok(Math.hypot(face.right[0]+1,face.right[1],face.right[2])<1e-10);
 face.up[0]=999;assert.ok(Math.abs(display.getFace().up[0])<1e-10);f.surfaces.dispose();
});
