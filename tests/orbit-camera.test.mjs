import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {boardOrbitControls} from '../engine/spike/orbitCamera.mjs';
const require=createRequire(import.meta.url),pkg=process.env.KICAD_WEB_BUILD_DEPS?path.join(process.env.KICAD_WEB_BUILD_DEPS,'three'):'three';
const {PerspectiveCamera,Vector3}=await import(pathToFileURL(path.resolve(path.dirname(require.resolve(pkg)),'../build/three.module.js')).href);
const {OrbitControls}=await import(pathToFileURL(path.resolve(path.dirname(require.resolve(pkg)),'../examples/jsm/controls/OrbitControls.js')).href);
const Fixed=boardOrbitControls(OrbitControls);
function setup(Type){const camera=new PerspectiveCamera();camera.up.set(0,0,1);camera.position.set(0,-10,5);const doc=new EventTarget(),element=new EventTarget();element.style={};element.getRootNode=()=>doc;return {camera,controls:new Type(camera,element)};}
test('face-framed camera orbits about its current up axis and survives return to board navigation',()=>{
 const f=setup(Fixed),legacy=setup(OrbitControls);
 for(const current of [legacy,f]){current.camera.up.set(0,-1,0);current.camera.position.set(0,0,10);current.controls.update();current.controls._rotateLeft(Math.PI/2);current.controls.update();}
 assert.ok(Math.abs(legacy.camera.position.x)<.001,'reference reproduces stale board-up orbit at the pole');
 assert.ok(Math.abs(f.camera.position.x)>9.99,'horizontal drag moves around the face-framed up axis');
 assert.ok(Math.abs(f.camera.position.y)<1e-8);assert.ok(Math.abs(f.camera.position.length()-10)<1e-8);
 f.camera.up.set(0,0,1);f.camera.position.set(0,-10,5);f.controls.update();f.controls._rotateLeft(Math.PI/4);f.controls.update();
 assert.ok(Math.abs(f.camera.position.x)>7);assert.ok(Math.abs(f.camera.position.length()-Math.sqrt(125))<1e-8);assert.ok(Math.abs(f.camera.up.dot(f.camera.position.clone().normalize()))<1e-8,'orbit preserves a screen-aligned frame');f.controls.dispose();legacy.controls.dispose();
});
test('repeated display/board presets preserve pan, zoom and stable camera updates',()=>{
 const {camera,controls}=setup(Fixed);
 for(const up of [[0,-1,0],[0,1,0],[0,0,1],[0,-1,0],[0,0,1]]){
  camera.up.fromArray(up);controls.target.set(2,3,4);camera.position.copy(controls.target).add(new Vector3(8,-9,10));controls.update();
  const offset=camera.position.clone().sub(controls.target);controls._panOffset.set(1,-2,3);controls.update();assert.ok(controls.target.distanceTo(new Vector3(3,1,7))<1e-8);assert.ok(camera.position.clone().sub(controls.target).distanceTo(offset)<1e-8);
  const distance=camera.position.distanceTo(controls.target);controls._scale=.8;controls.update();assert.ok(Math.abs(camera.position.distanceTo(controls.target)-distance*.8)<1e-8);
  const stable=camera.position.clone();for(let i=0;i<20;i++)controls.update();assert.ok(camera.position.distanceTo(stable)<1e-8);
 }
 controls.dispose();
});

test('orbit crosses both poles continuously without flips, preserves target and has stable embed sensitivity',()=>{
 for(const up of [[0,0,1],[0,-1,0],[1,0,0]]){
  const f=setup(Fixed);f.camera.up.fromArray(up);f.controls.target.set(2,3,4);f.camera.position.set(2,3,14);f.controls.update();
  let previous=f.camera.position.clone();for(let i=0;i<100;i++){f.controls._rotateUp(.1);f.controls.update();const offset=f.camera.position.clone().sub(f.controls.target);assert.ok(Math.abs(offset.length()-10)<1e-7);assert.ok(previous.distanceTo(f.camera.position)<1.01,'no discontinuous pole jump');assert.ok(Math.abs(f.camera.up.dot(offset))<1e-7);previous.copy(f.camera.position);}
  const before=f.camera.position.clone();f.controls._rotateLeft(.2);f.controls.update();f.controls._rotateLeft(-.2);f.controls.update();assert.ok(f.camera.position.distanceTo(before)<1e-7);f.controls.dispose();
 }
 const angles=[];for(const [w,h]of [[320,220],[500,400],[800,600]]){const f=setup(Fixed);f.controls.domElement.clientWidth=w;f.controls.domElement.clientHeight=h;angles.push(f.controls._inputAngle(2*Math.PI*50/h));f.controls.dispose();}
 assert.ok(Math.abs(angles[0]-angles[1])<1e-10,'narrow embeds do not amplify the same pixel drag');assert.ok(angles.every(a=>a<=Math.PI/6+1e-12));
});
test('panning remains screen aligned after pole crossings, roll and face framing',()=>{
 for(const [position,up]of [[[0,0,10],[0,0,1]],[[0,0,-10],[0,0,1]],[[8,-9,10],[1,0,0]]]){
  const f=setup(Fixed);f.camera.fov=45;f.camera.aspect=500/400;f.camera.position.fromArray(position);f.camera.up.fromArray(up);f.controls.domElement.clientWidth=500;f.controls.domElement.clientHeight=400;f.camera.updateProjectionMatrix();f.controls.update();f.camera.updateMatrixWorld();
  for(let i=0;i<40;i++){f.controls._rotateUp(.1);f.controls.update();}f.camera.updateMatrixWorld();
  const point=f.controls.target.clone(),before=point.clone().project(f.camera),offset=f.camera.position.clone().sub(f.controls.target);f.controls._pan(40,20);f.controls.update();f.camera.updateMatrixWorld();const after=point.clone().project(f.camera);
  assert.ok(Math.abs((after.x-before.x)*250-40)<1e-6);assert.ok(Math.abs((after.y-before.y)*-200-20)<1e-6);assert.ok(f.camera.position.clone().sub(f.controls.target).distanceTo(offset)<1e-7);f.controls.dispose();
 }
});

test('named top and bottom views have a perpendicular screen-up axis rather than a singular camera pole',async()=>{const {boardViewPresets}=await import('../engine/spike/viewPresets.mjs');for(const preset of boardViewPresets.filter(p=>['top','bottom'].includes(p.id))){assert.ok(Math.abs(preset.up.reduce((n,v,i)=>n+v*preset.direction[i],0))<1e-8);}});

test('the isometric public camera name is accepted by the renderer preset list',async()=>{const {boardViewPresets,boardViewPreset}=await import('../engine/spike/viewPresets.mjs');assert.ok(boardViewPresets.some(p=>p.id==='isometric'));assert.equal(boardViewPreset('isometric'),boardViewPreset(false));assert.equal(boardViewPreset('iso'),boardViewPreset('isometric'));});

test('Pan mode changes one-finger and mouse input together while retaining two-finger zoom/pan',async()=>{
 const {setBoardPanMode}=await import('../engine/spike/orbitCamera.mjs');const input={MOUSE:{PAN:2,ROTATE:0},TOUCH:{PAN:1,ROTATE:0}},controls={mouseButtons:{LEFT:0},touches:{ONE:0,TWO:2}};
 setBoardPanMode(controls,input,true);assert.equal(controls.mouseButtons.LEFT,2);assert.equal(controls.touches.ONE,1);assert.equal(controls.touches.TWO,2);
 setBoardPanMode(controls,input,false);assert.equal(controls.mouseButtons.LEFT,0);assert.equal(controls.touches.ONE,0);assert.equal(controls.touches.TWO,2);
});
