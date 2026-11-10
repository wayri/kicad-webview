/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),deps=process.env.KICAD_WEB_BUILD_DEPS,esbuild=deps?require(path.join(deps,'esbuild')):require('esbuild');
const THREE=deps?require(path.join(deps,'three')):require('three');
const build=await esbuild.build({entryPoints:[fileURLToPath(new URL('../engine/spike/registeredResult3d.mjs',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false,nodePaths:deps?[deps]:[]});
const {prepareRegisteredResult3D,createRegisteredResultOverlay,createAnalysisOverlayController}=await import('data:text/javascript;base64,'+Buffer.from(build.outputFiles[0].text).toString('base64'));
const board={bounds:{minX:10,minY:20,maxX:14,maxY:24},thickness:1.6,layers:['F.Cu','In1.Cu','B.Cu']};
const surface=(extra={})=>({points:[[10,20,.0175],[14,20,.0175],[10,24,.0175]],triangles:[[0,1,2]],values:[0,1,3],zKnown:true,zBasis:'front-depth',layer:'F.Cu',unit:'V',...extra});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);

test('saved front depth and board-center elevations register source XY without a Z sign reversal',()=>{
  const prepared=prepareRegisteredResult3D(surface(),board);
  assert.deepEqual(prepared.transform([10,20,.0175]).slice(0,2),[-2,2]);close(prepared.transform([10,20,.0175])[2],.8-.0175);
  assert.deepEqual(prepared.transform([14,24,.0175]).slice(0,2),[2,-2]);
  assert.deepEqual(prepareRegisteredResult3D(surface({zBasis:'board-center'}),board).transform([12,22,-.2]),[0,0,-.2]);
  assert.equal(prepareRegisteredResult3D(surface({zKnown:false,layer:'F.Cu'}),board).transform([12,22,123])[2],.8);
  assert.equal(prepareRegisteredResult3D(surface({zKnown:false,layer:'B.Cu'}),board).transform([12,22,123])[2],-.8);
  assert.throws(()=>prepareRegisteredResult3D(surface({zKnown:false,layer:'In1.Cu'}),board),/without saved Z/);
  assert.throws(()=>prepareRegisteredResult3D(surface({zBasis:'inferred'}),board),/unsupported/);
  assert.throws(()=>prepareRegisteredResult3D(surface({layer:'In2.Cu'}),board),/not present/);
  assert.throws(()=>prepareRegisteredResult3D(surface(),board,{layer:'B.Cu'}),/does not match/);
  assert.throws(()=>prepareRegisteredResult3D(surface({layer:undefined,zKnown:false}),board,{layer:'F.Cu'}),/without saved Z/);
});

test('WayriCAD uses fixed scalar ranges before palette mapping and samples original coordinates',()=>{
  const input=surface({values:[-1,1,2]}),before=JSON.stringify(input),range=[0,1],content=createRegisteredResultOverlay(input,board,{palette:'wayricad',range,throughBoard:true});
  try{
    range[1]=9;assert.deepEqual(content.state().range,[0,1]);assert.equal(content.overlay.mesh.material.depthTest,false);
    assert.deepEqual(Array.from(content.overlay.mesh.geometry.getAttribute('resultScalar').array),[-1,1,2]);
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};content.overlay.mesh.material.onBeforeCompile(shader,{});
    assert.match(shader.fragmentShader,/clamp\(vSavedResultScalar/);assert.equal(shader.uniforms.savedFieldPalette.value.length,4);
    const positions=content.overlay.mesh.geometry.getAttribute('position'),point=new THREE.Vector3();for(let i=0;i<3;i++)point.add(new THREE.Vector3().fromBufferAttribute(positions,i).multiplyScalar(1/3));
    const sample=content.overlay.sample({object:content.overlay.mesh,faceIndex:0,point});close(sample.x,34/3);close(sample.y,64/3);close(sample.z,.0175);close(sample.value,2/3);assert.equal(sample.unit,'V');
    const state=content.state();assert.equal(state.triangles,1);assert.equal(state.basis,'front-depth');assert.equal(state.layer,'F.Cu');state.range[0]=100;state.diagnostics.push('changed');assert.deepEqual(content.state().range,[0,1]);assert.deepEqual(content.state().diagnostics,[]);
    assert.equal(JSON.stringify(input),before);
  }finally{content.dispose();}
});

test('legacy palette and opaque-depth choice remain available and scalar materials have one owner',()=>{
  const legacy=createRegisteredResultOverlay(surface(),board,{throughBoard:false});
  try{assert.equal(legacy.overlay.mesh.material.depthTest,true);assert.equal(legacy.overlay.mesh.geometry.getAttribute('resultScalar'),undefined);assert.equal(new THREE.Color().fromArray(legacy.overlay.mesh.geometry.getAttribute('color').array).getStyle(THREE.SRGBColorSpace),'rgb(40,69,187)');}finally{legacy.dispose();}
  const next=createRegisteredResultOverlay(surface(),board,{palette:'wayricad'}),counts=[0,0];[next.scalarAppearance.material,next.scalarAppearance.fallbackMaterial].forEach((material,i)=>material.addEventListener('dispose',()=>counts[i]++));
  next.overlay.setOpacity(.25);assert.equal(next.overlay.mesh.material.opacity,.25);assert.equal(next.useColorFallback(),true);assert.equal(next.useColorFallback(),false);assert.equal(next.state().diagnostics.length,1);next.dispose();next.dispose();assert.deepEqual(counts,[1,1]);
});

test('owners cannot clear or change another overlay and rejected replacements retain the current geometry',()=>{
  const scene=new THREE.Scene(),owner=Symbol('results'),other=Symbol('other'),controller=createAnalysisOverlayController(board,{scene});
  controller.setAnalysisOverlay(surface(),{owner,palette:'wayricad',range:[0,10]});const overlay=controller.overlay;
  assert.equal(controller.setAnalysisOverlay(null,{owner:other}).placed,false);assert.equal(controller.overlay,overlay);
  assert.equal(controller.setAnalysisOpacity(.1,{owner:other}),false);assert.equal(overlay.mesh.material.opacity,.85);
  assert.equal(controller.setAnalysisProbes([{x:10,y:20,z:.0175}],{owner:other}),false);assert.equal(overlay.group.children[1].children.length,0);
  assert.equal(controller.setAnalysisOpacity(.4,{owner}),true);assert.equal(overlay.mesh.material.opacity,.4);
  assert.equal(controller.setAnalysisProbes([{x:10,y:20,z:.0175}],{owner}),true);assert.equal(overlay.group.children[1].children.length,1);
  assert.equal(controller.setAnalysisOverlay(surface({zBasis:'unknown'}),{owner}).placed,false);assert.equal(controller.overlay,overlay);assert.equal(controller.getAnalysisOverlayState().placed,true);
  const state=controller.getAnalysisOverlayState();state.range[0]=99;assert.deepEqual(controller.getAnalysisOverlayState().range,[0,10]);
  controller.setAnalysisOverlay(surface({values:[50,60,70]}),{owner,palette:'wayricad',range:[0,10]});assert.deepEqual(controller.getAnalysisOverlayState().range,[0,10]);assert.equal(scene.children.length,1);
  controller.setAnalysisOverlay(null,{owner});assert.equal(controller.getAnalysisOverlayState().placed,false);assert.equal(scene.children.length,0);controller.dispose();
});

test('field clicks preserve native PCB selection and emit their exact probe after native selection',async()=>{
  const source=await readFile(new URL('../engine/spike/board3d.js',import.meta.url),'utf8'),start=source.indexOf('  function pick(event) {'),end=source.indexOf("  let selectionMode = 'all';",start),pickSource=source.slice(start,end);
  for(const nativeHit of [true,false])for(const fieldHit of [true,false]){
    const events=[],mesh={visible:true},native={userData:{record:{id:'pad'}}},sample={value:2.75};
    const context={pendingDemoFace:null,renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})}},pointer:{set(){}},raycaster:{setFromCamera(){},intersectObject:()=>[],intersectObjects:()=>nativeHit?[{object:native,point:{}}]:[]},camera:{},measuring:false,analysisController:{overlay:{mesh,sample:()=>fieldHit?sample:null}},options:{onAnalysisProbe:value=>events.push(['probe',value])},inspectionTarget:()=>true,substrate:{},appearance:'realistic',pickables:[native],selectionAppearance:{isVisible:()=>true},selectionMode:'all',selectableRecord:value=>value,clearSelection:()=>events.push(['clear']),select:()=>events.push(['select'])};
    const names=Object.keys(context),pick=Function(...names,pickSource+';return pick;')(...Object.values(context));pick({clientX:50,clientY:50});
    assert.deepEqual(events,[...(nativeHit?[['select']]:fieldHit?[]:[['clear']]),...(fieldHit?[['probe',sample]]:[])]);
  }
});
