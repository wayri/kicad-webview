/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {FIELD_COLOR_STOPS,fieldColorRange,fieldNormalized,fieldRGB} from '../engine/spike/fieldColors.mjs';
const require=createRequire(import.meta.url),deps=process.env.KICAD_WEB_BUILD_DEPS,esbuild=deps?require(path.join(deps,'esbuild')):require('esbuild');
const THREE=deps?require(path.join(deps,'three')):require('three');
const build=await esbuild.build({stdin:{contents:"export * from './engine/spike/wayricadResult3d.mjs';export {createResultOverlay} from './engine/spike/result3d.js';",resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'js'},bundle:true,format:'esm',platform:'node',write:false,nodePaths:deps?[deps]:[]});
const {prepareSavedResult3D,createSavedResultContent,mountSavedResult3D,savedResultCameraState,createResultOverlay}=await import('data:text/javascript;base64,'+Buffer.from(build.outputFiles[0].text).toString('base64'));
function surface(extra={}){return {points:[[10,20,7],[12,20,7],[10,22,7],[12,22,7]],triangles:[[0,1,2],[1,3,2]],values:[10,20,30,null],nodal:true,zKnown:true,unit:'V',title:'Saved PI field',...extra};}
function center(content){const p=content.overlay.mesh.geometry.getAttribute('position');return {x:(p.getX(0)+p.getX(1)+p.getX(2))/3,y:(p.getY(0)+p.getY(1)+p.getY(2))/3,z:(p.getZ(0)+p.getZ(1)+p.getZ(2))/3};}
test('saved Z, units and valid geometry are required before creating 3D content',()=>{
  assert.throws(()=>prepareSavedResult3D(surface({zKnown:false})),error=>error.code==='SAVED_Z_REQUIRED'&&error.fallback==='2d');
  assert.throws(()=>prepareSavedResult3D(surface({values:[null,null,null,null]})),error=>error.code==='NO_SAVED_FIELD_VALUES');
  assert.throws(()=>prepareSavedResult3D(surface({points:[[0,0,1],[1,0,1],[2,0,1]],triangles:[[0,1,2]],values:[1,2,3]})),error=>error.code==='NO_SAVED_FIELD_VALUES');
  assert.throws(()=>prepareSavedResult3D(surface({triangles:[[0,1,9]]})),/invalid triangle|do not match/);
  assert.throws(()=>prepareSavedResult3D(surface({points:[[0,0,0],[2e7,0,0],[0,1,0]],triangles:[[0,1,2]],values:[1,2,3]})),error=>error.code==='SAVED_GEOMETRY_RANGE');
  assert.equal(prepareSavedResult3D(surface()).coordinateUnit,'source units');
  assert.equal(prepareSavedResult3D(surface(),{coordinateUnit:'mm'}).coordinateUnit,'mm');
});
test('nodal nulls leave triangles missing and probes interpolate only a retained triangle in original source XYZ',()=>{
  const source=surface(),before=JSON.stringify(source),content=createSavedResultContent(source,{coordinateUnit:'mm'});
  try{
    assert.equal(content.prepared.renderedTriangles,1);assert.equal(content.prepared.omittedTriangles,1);assert.equal(content.overlay.mesh.geometry.getAttribute('position').count,3);
    assert.deepEqual(content.prepared.bounds,{min:[10,20,7],max:[12,22,7]});assert.deepEqual(content.prepared.origin,[11,21,7]);
    const sample=content.overlay.sample({object:content.overlay.mesh,faceIndex:0,point:center(content)});
    assert.ok(Math.abs(sample.value-20)<1e-10);assert.ok(Math.abs(sample.x-(10+2/3))<1e-10);assert.ok(Math.abs(sample.y-(20+2/3))<1e-10);assert.equal(sample.z,7);assert.equal(sample.unit,'V');assert.equal(sample.method,'nodal barycentric interpolation');
    assert.equal(content.overlay.sample({object:content.overlay.mesh,faceIndex:1,point:center(content)}),null);assert.equal(JSON.stringify(source),before);
  }finally{content.dispose();}
});
test('saved cell values stay constant and missing cells are never bridged',()=>{
  const content=createSavedResultContent(surface({nodal:false,values:[42,null],unit:'°C'}));
  try{
    assert.equal(content.overlay.mesh.geometry.getAttribute('position').count,3);
    const colors=content.overlay.mesh.geometry.getAttribute('color').array;assert.deepEqual(Array.from(colors.slice(0,3)),Array.from(colors.slice(3,6)));assert.deepEqual(Array.from(colors.slice(3,6)),Array.from(colors.slice(6,9)));
    const sample=content.overlay.sample({object:content.overlay.mesh,faceIndex:0,point:center(content)});assert.equal(sample.value,42);assert.equal(sample.method,'saved cell value');assert.equal(sample.unit,'°C');
  }finally{content.dispose();}
});
test('large source offsets retain small saved geometry through declared translation without converting values into height',()=>{
  const content=createSavedResultContent(surface({points:[[1e9,2e9,4],[1e9+2,2e9,4],[1e9,2e9+2,4],[1e9+2,2e9+2,4]],values:[1,1e100,1e200,null]}));
  try{
    assert.deepEqual(content.prepared.origin,[1e9+1,2e9+1,4]);const p=content.overlay.mesh.geometry.getAttribute('position');assert.deepEqual(Array.from(p.array),[-1,-1,0,1,-1,0,-1,1,0]);assert.match(content.prepared.coordinateConvention,/\+Z up; no PCB registration/);
    const sample=content.overlay.sample({object:content.overlay.mesh,faceIndex:0,point:center(content)});assert.equal(sample.z,4);assert.ok(Math.abs(sample.x-(1e9+2/3))<1e-6);
  }finally{content.dispose();}
});
test('context requires explicit source XYZ and all owned geometry/materials are released exactly once',()=>{
  const contextPrimitives=[{type:'polygon',points:[[8,18,6],[9,18,6],[8,19,6]]},{type:'line',points:[[8,18,6],[8,18,8]]},{type:'polygon',points:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]}],before=JSON.stringify(contextPrimitives),content=createSavedResultContent(surface(),{contextPrimitives});
  assert.equal(content.prepared.context.length,2);assert.match(content.prepared.diagnostics[0],/no elevation was invented/);assert.equal(content.contextMesh.geometry.getAttribute('position').count,8);assert.deepEqual(content.prepared.bounds,{min:[8,18,6],max:[12,22,8]});
  const owned=[content.overlay.mesh.geometry,content.overlay.mesh.material,content.contextMesh.geometry,content.contextMesh.material],counts=owned.map(()=>0);owned.forEach((resource,i)=>resource.addEventListener('dispose',()=>counts[i]++));
  content.dispose();content.dispose();assert.deepEqual(counts,[1,1,1,1]);assert.equal(content.group.children.length,0);assert.equal(JSON.stringify(contextPrimitives),before);
  assert.throws(()=>prepareSavedResult3D(surface(),{contextPrimitives:Array(10001).fill(null)}),/10,000/);
});
class Element{
  constructor(doc){this.ownerDocument=doc;this.style={};this.children=[];}
  append(...nodes){nodes.forEach(node=>{node.parent=this;this.children.push(node);});}
  setAttribute(){}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}
}
test('unknown Z returns a cancellable safely disposable 2D fallback without requesting any canvas or WebGL resources',()=>{
  let canvasRequests=0;const doc={createElement(tag){if(tag==='canvas')canvasRequests++;return new Element(doc);},createElementNS(){canvasRequests++;throw Error('WebGL must not be allocated.');}},container=new Element(doc),signal=new AbortController();
  const viewer=mountSavedResult3D(container,surface({zKnown:false}),{signal:signal.signal});assert.equal(viewer.unavailable,true);assert.equal(viewer.diagnostic.code,'SAVED_Z_REQUIRED');assert.equal(canvasRequests,0);assert.equal(container.children.length,1);
  assert.throws(()=>viewer.setSurface(surface({zKnown:false})),error=>error.code==='SAVED_Z_REQUIRED');assert.equal(container.children.length,1);signal.abort();assert.equal(container.children.length,0);viewer.dispose();viewer.dispose();assert.equal(canvasRequests,0);
  assert.throws(()=>mountSavedResult3D(container,surface(),{signal:signal.signal}),{name:'AbortError'});assert.equal(container.children.length,0);
});

test('source-unit camera validation retains tiny and large valid views without assuming millimetres',()=>{
  for(const scale of [1e-9,1,1e9]){
    const state={position:[scale,-scale,scale],target:[0,0,0],up:[0,0,1]},copy=savedResultCameraState(state);assert.deepEqual(copy,state);copy.position[0]=0;assert.equal(state.position[0],scale);
  }
  assert.throws(()=>savedResultCameraState({position:[0,0,0],target:[0,0,0],up:[0,0,1]}),/nondegenerate/);
  assert.throws(()=>savedResultCameraState({position:[0,0,1],target:[0,0,0],up:[0,0,1]}),/independent/);
  assert.throws(()=>savedResultCameraState({position:[Infinity,0,1],target:[0,0,0],up:[0,0,1]}),/bounded/);
});

test('shared palette matches the established 2D stops, constant ranges and scalar midpoint mapping',()=>{
  assert.deepEqual(FIELD_COLOR_STOPS,[[26,64,115],[20,136,156],[107,196,151],[255,225,112]]);
  assert.deepEqual(fieldColorRange([42,null,42]),[21,63]);assert.deepEqual(fieldColorRange([0,0]),[-.5,.5]);assert.deepEqual(fieldColorRange([-2,-2]),[-3,-1]);assert.equal(fieldColorRange([null,NaN]),null);
  for(const [value,expected]of [[0,[26,64,115]],[1,[20,136,156]],[2,[107,196,151]],[3,[255,225,112]],[-1,[26,64,115]],[4,[255,225,112]]])assert.deepEqual(fieldRGB(value,[0,3]),expected);
  assert.deepEqual(fieldRGB(1.5,[0,3]),[64,166,154]);assert.equal(fieldNormalized(0,[-1e308,1e308]),.5);assert.deepEqual(fieldRGB(0,[-1e308,1e308]),[64,166,154]);
  assert.ok(fieldColorRange([Number.MAX_VALUE])[1]<=Number.MAX_VALUE);
});
test('WayriCAD interpolates normalized scalars before palette mapping and keeps fallback opacity and resources owned',()=>{
  const content=createSavedResultContent(surface({values:[0,1,3,null]})),appearance=content.scalarAppearance,base=appearance.fallbackMaterial,shaderMaterial=appearance.material;
  let baseDisposed=0,shaderDisposed=0;base.addEventListener('dispose',()=>baseDisposed++);shaderMaterial.addEventListener('dispose',()=>shaderDisposed++);
  assert.deepEqual(content.prepared.range,[0,3]);assert.deepEqual(Array.from(content.overlay.mesh.geometry.getAttribute('resultScalar').array),[0,Math.fround(1/3),1]);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};shaderMaterial.onBeforeCompile(shader,{});
  assert.match(shader.vertexShader,/vSavedResultScalar = resultScalar/);assert.match(shader.fragmentShader,/clamp\(vSavedResultScalar/);assert.match(shader.fragmentShader,/savedFieldPalette\[4\]/);assert.match(shader.fragmentShader,/sRGBTransferEOTF/);assert.equal(shaderMaterial.vertexColors,false);assert.equal(shader.uniforms.savedFieldPalette.value.length,4);
  content.overlay.setOpacity(.3);assert.equal(shaderMaterial.opacity,.3);assert.equal(base.opacity,.3);
  assert.throws(()=>shaderMaterial.onBeforeCompile({uniforms:{},vertexShader:'',fragmentShader:''},{}),/Unsupported/);
  assert.equal(appearance.useFallback(),true);assert.equal(appearance.useFallback(),false);assert.equal(appearance.mode,'vertex-color');assert.equal(content.overlay.mesh.material,base);assert.equal(shaderDisposed,1);assert.equal(baseDisposed,0);
  content.overlay.setOpacity(.6);assert.equal(base.opacity,.6);content.dispose();content.dispose();assert.equal(baseDisposed,1);assert.equal(shaderDisposed,1);
});
test('shared palette/range is optional and legacy overlays keep their original default colors',()=>{
  const s=surface({values:[0,1,3,null]}),legacy=createResultOverlay(s),custom=createResultOverlay(s,p=>p,{palette:FIELD_COLOR_STOPS,range:[0,3]});
  try{
    const read=overlay=>new THREE.Color().fromArray(overlay.mesh.geometry.getAttribute('color').array).getStyle(THREE.SRGBColorSpace);
    assert.equal(read(legacy),'rgb(40,69,187)');assert.equal(read(custom),'rgb(26,64,115)');assert.equal(legacy.mesh.geometry.getAttribute('resultScalar'),undefined);assert.deepEqual(custom.range,[0,3]);
    assert.throws(()=>createResultOverlay(s,p=>p,{range:[1,1]}),/range/);assert.throws(()=>createResultOverlay(s,p=>p,{palette:[[0,0,0]]}),/palette/);
  }finally{legacy.dispose();custom.dispose();}
});
test('successful scalar material cleanup disposes both attached and detached owned materials exactly once',()=>{
  const content=createSavedResultContent(surface()),owned=[content.scalarAppearance.material,content.scalarAppearance.fallbackMaterial],counts=[0,0];owned.forEach((material,i)=>material.addEventListener('dispose',()=>counts[i]++));content.dispose();content.dispose();assert.deepEqual(counts,[1,1]);
});


test('explicit fixed ranges are copied exactly and retained scalar attributes clamp only after interpolation',()=>{
  const range=[0,1],content=createSavedResultContent(surface({values:[-1,1,2,null]}),{range});
  try{
    assert.deepEqual(content.prepared.range,[0,1]);assert.deepEqual(content.overlay.range,[0,1]);assert.deepEqual(Array.from(content.overlay.mesh.geometry.getAttribute('resultScalar').array),[-1,1,2]);assert.equal(content.scalarAppearance.mode,'scalar');
    range[0]=-99;assert.deepEqual(content.prepared.range,[0,1]);assert.deepEqual(prepareSavedResult3D(surface({values:[42,42,42,null]}),{range:[0,100]}).range,[0,100]);
    for(const invalid of [[1,1],[2,1],[0,Infinity],null])assert.throws(()=>prepareSavedResult3D(surface(),{range:invalid}),/range/);
  }finally{content.dispose();}
  const extreme=createSavedResultContent(surface({values:[-1e308,0,1e308,null]}),{range:[-1,1]});assert.equal(extreme.scalarAppearance.mode,'vertex-color');assert.match(extreme.prepared.diagnostics.at(-1),/GPU normalization range/);extreme.dispose();
});
