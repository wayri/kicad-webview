/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createResultOverlay,validateResultSurface} from './result3d.js';
import {createRenderActivity,observeRenderActivity} from './renderActivity.mjs';
import {viewportPixelRatio} from './renderQuality.mjs';
import {sphereFitDistance} from './fitPolicy.mjs';
import {tapGesture} from './selectionState.mjs';
import {FIELD_COLOR_STOPS,fieldColorRange} from './fieldColors.mjs';

const MAX_CONTEXT=10000,MAX_CONTEXT_POINTS=200000;
const coordinateConvention='Source XYZ translated by the saved bounds center; +Z up; no PCB registration';
const point=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Number.isFinite(Math.fround(n)));
function fallback(message,code){return Object.assign(new Error(message),{code,fallback:'2d'});}
function abortError(){return new DOMException('Saved result view was aborted.','AbortError');}
function include(bounds,p){for(let i=0;i<3;i++){bounds.min[i]=Math.min(bounds.min[i],p[i]);bounds.max[i]=Math.max(bounds.max[i],p[i]);}}
function nondegenerate(points){
  const [a,b,c]=points,u=b.map((n,i)=>n-a[i]),v=c.map((n,i)=>n-a[i]);
  return Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>0;
}
export function prepareSavedResult3D(surface,{contextPrimitives=[],coordinateUnit='source units',range}={}){
  const data=validateResultSurface(surface);
  if(range!==undefined&&(!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[1]<=range[0]))throw new TypeError('Choose an increasing finite saved-field range.');
  if(data.zKnown!==true)throw fallback('No saved Z coordinates or layer elevation. Use the 2D field view.','SAVED_Z_REQUIRED');
  if(typeof coordinateUnit!=='string'||coordinateUnit.length>80||/[\x00-\x1f]/.test(coordinateUnit))throw new TypeError('Choose a bounded source coordinate unit label.');
  if(!Array.isArray(contextPrimitives)||contextPrimitives.length>MAX_CONTEXT)throw new TypeError('Saved context exceeds 10,000 primitives.');
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},context=[],diagnostics=[];
  let renderedTriangles=0,omittedTriangles=0,contextPoints=0,omittedContext=0;
  data.triangles.forEach((triangle,index)=>{
    if((data.nodal?triangle.map(i=>data.values[i]):[data.values[index]]).some(value=>value===null)||!nondegenerate(triangle.map(i=>data.points[i]))){omittedTriangles++;return;}
    renderedTriangles++;for(const i of triangle)include(bounds,data.points[i]);
  });
  if(!renderedTriangles)throw fallback('No valid saved triangles with known field values. Missing samples remain holes in the 2D field view.','NO_SAVED_FIELD_VALUES');
  for(const primitive of contextPrimitives){
    const points=primitive?.points;
    if(!['line','polygon'].includes(primitive?.type)||!Array.isArray(points)||points.length<(primitive.type==='polygon'?3:2)||!points.every(point)){omittedContext++;continue;}
    contextPoints+=points.length;if(contextPoints>MAX_CONTEXT_POINTS)throw new TypeError('Saved context exceeds 200,000 explicit XYZ points.');
    const copy=points.map(p=>[...p]);context.push({type:primitive.type,points:copy});copy.forEach(p=>include(bounds,p));
  }
  if(omittedContext)diagnostics.push(omittedContext+' context primitives without supported explicit XYZ geometry were omitted; no elevation was invented.');
  if(omittedTriangles)diagnostics.push(omittedTriangles+' triangles with missing values or degenerate geometry remain unrendered.');
  const origin=bounds.min.map((n,i)=>n/2+bounds.max[i]/2);
  if(bounds.max.some((n,i)=>n-bounds.min[i]>1e7))throw fallback('Saved geometry exceeds the bounded 3D coordinate span. Use the 2D field view.','SAVED_GEOMETRY_RANGE');
  return {surface:data,context,bounds,origin,range:range?[...range]:fieldColorRange(data.values),coordinateUnit:coordinateUnit||'source units',coordinateConvention,renderedTriangles,omittedTriangles,diagnostics};
}
export function createSavedScalarAppearance(overlay){
  const fallbackMaterial=overlay.mesh.material,material=fallbackMaterial.clone(),originalCompile=fallbackMaterial.onBeforeCompile,originalKey=fallbackMaterial.customProgramCacheKey();
  let disposed=false,shaderMaterial=material;
  material.vertexColors=false;
  material.onBeforeCompile=(shader,renderer)=>{
    originalCompile.call(material,shader,renderer);
    if(!shader.vertexShader.includes('#include <begin_vertex>')||!shader.fragmentShader.includes('#include <color_fragment>'))throw new Error('Unsupported saved-field color shader.');
    shader.uniforms.savedFieldPalette={value:FIELD_COLOR_STOPS.map(rgb=>new THREE.Vector3(...rgb.map(n=>n/255)))};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float resultScalar;\nvarying float vSavedResultScalar;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSavedResultScalar = resultScalar;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vSavedResultScalar;\nuniform vec3 savedFieldPalette[4];').replace('#include <color_fragment>',`#include <color_fragment>
float fieldBand = clamp(vSavedResultScalar, 0.0, 1.0) * 3.0;
vec3 fieldRGB = fieldBand < 1.0 ? mix(savedFieldPalette[0], savedFieldPalette[1], fieldBand) : fieldBand < 2.0 ? mix(savedFieldPalette[1], savedFieldPalette[2], fieldBand - 1.0) : mix(savedFieldPalette[2], savedFieldPalette[3], fieldBand - 2.0);
fieldRGB = floor(fieldRGB * 255.0 + 0.5) / 255.0;
diffuseColor.rgb = sRGBTransferEOTF(vec4(fieldRGB, 1.0)).rgb;`);
  };
  material.customProgramCacheKey=()=>originalKey+':wayricad-scalar-palette-v1';overlay.mesh.material=material;
  const setOpacity=overlay.setOpacity;overlay.setOpacity=value=>{setOpacity(value);if(shaderMaterial)shaderMaterial.opacity=fallbackMaterial.opacity;};
  const appearance={material,fallbackMaterial,get mode(){return shaderMaterial?'scalar':'vertex-color';},
    useFallback(){if(disposed||!shaderMaterial)return false;overlay.mesh.material=fallbackMaterial;shaderMaterial.dispose();shaderMaterial=null;return true;},
    dispose(){if(disposed)return;disposed=true;if(shaderMaterial)fallbackMaterial.dispose();}
  };
  if(!overlay.mesh.geometry.getAttribute('resultScalar').array.every(Number.isFinite))appearance.useFallback();return appearance;
}
export function createSavedResultContent(surface,options={}){
  const prepared=prepareSavedResult3D(surface,options),transform=p=>p.map((n,i)=>n-prepared.origin[i]);
  const overlay=createResultOverlay(prepared.surface,transform,{palette:FIELD_COLOR_STOPS,range:prepared.range}),scalarAppearance=createSavedScalarAppearance(overlay),group=new THREE.Group(),positions=[];
  if(scalarAppearance.mode==='vertex-color')prepared.diagnostics.push('Scalar values exceed the GPU normalization range; vertex-color interpolation is active. Probe values remain exact.');
  let contextMesh=null,closed=false;
  try{
    for(const primitive of prepared.context){
      const points=primitive.points;
      for(let i=1;i<points.length;i++)positions.push(...transform(points[i-1]),...transform(points[i]));
      if(primitive.type==='polygon')positions.push(...transform(points.at(-1)),...transform(points[0]));
    }
    if(positions.length){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      contextMesh=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x879aa7,transparent:true,opacity:.65}));group.add(contextMesh);
    }
    group.add(overlay.group);
  }catch(error){scalarAppearance.dispose();overlay.dispose();contextMesh?.geometry.dispose();contextMesh?.material.dispose();throw error;}
  return {group,overlay,prepared,contextMesh,scalarAppearance,
    dispose(){if(closed)return;closed=true;scalarAppearance.dispose();overlay.dispose();contextMesh?.geometry.dispose();contextMesh?.material.dispose();group.clear();group.removeFromParent();}
  };
}
export function savedResultCameraState(input){
  const vector=name=>{const value=input?.[name];if(!point(value)||value.some(n=>Math.abs(n)>1e12))throw new TypeError('Choose finite bounded source-view camera vectors.');return [...value];};
  const position=vector('position'),target=vector('target'),up=vector('up'),d=position.map((n,i)=>n-target[i]),distance=Math.hypot(...d),upLength=Math.hypot(...up);
  if(!(distance>0)||!(upLength>0))throw new TypeError('Choose a nondegenerate source-view camera.');
  const direction=d.map(n=>n/distance),u=up.map(n=>n/upLength);
  if(Math.hypot(direction[1]*u[2]-direction[2]*u[1],direction[2]*u[0]-direction[0]*u[2],direction[0]*u[1]-direction[1]*u[0])<1e-6)throw new TypeError('Choose a camera up vector independent of its direction.');
  return {position,target,up};
}
export function mountSavedResult3D(container,surface,options={}){
  if(options.signal?.aborted)throw abortError();
  const doc=container?.ownerDocument;
  if(!doc||typeof container.append!=='function')throw new TypeError('Choose a saved result viewer container.');
  let initial,error;
  try{initial=prepareSavedResult3D(surface,options);}catch(caught){if(caught.fallback!=='2d')throw caught;error=caught;}
  if(initial&&options.range!==undefined)options={...options,range:[...initial.range]};
  const host=doc.createElement('div'),stage=doc.createElement('div'),notice=doc.createElement('div'),valueText=doc.createElement('div');
  host.style.cssText='height:100%;min-height:240px;display:flex;flex-direction:column;position:relative;font:12px/1.5 system-ui';
  stage.style.cssText='position:relative;flex:1;min-height:180px;overflow:hidden';notice.style.cssText=valueText.style.cssText='padding:6px 8px;overflow-wrap:anywhere';
  notice.setAttribute('role','status');valueText.setAttribute('aria-live','polite');host.append(stage,notice,valueText);container.append(host);
  const theme=dark=>{host.style.background=dark?'#101d28':'#f3f7f5';host.style.color=dark?'#e7f3ef':'#172e36';};
  theme(options.dark!==false);
  const unavailable=diagnostic=>{
    let disposed=false;notice.textContent=diagnostic.message;stage.hidden=true;
    const dispose=()=>{if(disposed)return;disposed=true;options.signal?.removeEventListener('abort',dispose);host.remove();};
    options.signal?.addEventListener('abort',dispose,{once:true});
    const api={host,unavailable:true,diagnostic:{code:diagnostic.code||'WEBGL_UNAVAILABLE',message:diagnostic.message,fallback:'2d'},setSurface(next){prepareSavedResult3D(next,options);return false;},setTheme:theme,setOpacity(){},fit(){return false;},getCameraState(){return null;},setCameraState(){return false;},getRenderStats(){return {unavailable:true,renderCount:0,coordinateConvention,coordinateUnit:options.coordinateUnit||'source units'};},dispose};
    try{options.onDiagnostics?.([diagnostic.message]);}catch(caught){dispose();throw caught;}return api;
  };
  if(error)return unavailable(error);
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}
  catch{return unavailable(new Error('3D graphics are unavailable on this device. Use the 2D field view.'));}
  let active=true,content=null,opacity=.85,renderCount=0,scalarColorFallbacks=0,shaderFailure=false,observer=null,intersectionObserver=null,activity=null,controls=null;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.001,1000);camera.up.set(0,0,1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.style.cssText='display:block;width:100%;height:100%;touch-action:none';
  renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','3D saved field in source XYZ coordinates');stage.append(renderer.domElement);
  const callbacks=[],pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster(),gesture=tapGesture();
  const listen=(target,name,callback)=>{target.addEventListener(name,callback);callbacks.push(()=>target.removeEventListener(name,callback));};
  const hasSize=()=>stage.clientWidth>0&&stage.clientHeight>0;
  const invalidate=()=>{if(!active)return;activity.setState({documentVisible:!doc.hidden,hasSize:hasSize()});activity.invalidate();};
  renderer.debug.onShaderError=()=>{shaderFailure=true;};
  function draw(){
    if(!active)return;controls.update();shaderFailure=false;
    try{renderer.render(scene,camera);if(shaderFailure)throw new Error('Saved scalar color shader failed.');renderCount++;}
    catch(error){
      if(content?.scalarAppearance.useFallback()){scalarColorFallbacks++;const diagnostic='Scalar color mapping is unavailable; vertex-color interpolation is active. Probe values remain exact.';content.prepared.diagnostics.push(diagnostic);describe(content.prepared);options.onDiagnostics?.([...content.prepared.diagnostics]);shaderFailure=false;try{renderer.render(scene,camera);if(shaderFailure)throw error;renderCount++;}catch{notice.textContent='3D graphics could not draw this field. Use the 2D field view.';}}
      else notice.textContent='3D graphics could not draw this field. Use the 2D field view.';
    }
  }
  function updateClipping(){
    if(!content)return;const radius=Math.max(content.sphere.radius,1e-12),distance=camera.position.distanceTo(content.sphere.center);camera.near=Math.max(radius*1e-7,(distance-radius)*.5,1e-15);camera.far=Math.max(distance+radius*4,camera.near*2);camera.updateProjectionMatrix();
  }
  function fit(top=false){
    if(!active||!content)return false;
    const bounds=new THREE.Box3().setFromObject(content.group);if(bounds.isEmpty())return false;
    const sphere=content.sphere,radius=Math.max(sphere.radius,1e-12),distance=sphereFitDistance(radius,camera.fov,camera.aspect,1.2);
    controls.target.copy(sphere.center);camera.position.copy(sphere.center).add(new THREE.Vector3(...(top?[0,-.000001,1]:[1,-1,1])).normalize().multiplyScalar(distance));
    updateClipping();controls.minDistance=radius*.0001;controls.maxDistance=radius*100;controls.update();invalidate();return true;
  }
  function describe(prepared){
    notice.textContent='Independent saved field · '+prepared.coordinateUnit+' · source XYZ, +Z up · saved Z'+(prepared.surface.zBasis?' ('+String(prepared.surface.zBasis).slice(0,160)+')':'')+' · no PCB registration'+(prepared.context.length?' · retained source context':'')+' · '+prepared.renderedTriangles+' colored triangles'+' · '+prepared.range.map(value=>Number(value.toPrecision(6))).join(' – ')+(prepared.surface.unit?' '+String(prepared.surface.unit).slice(0,80):'')+(content?.scalarAppearance.mode==='vertex-color'?' · vertex-color interpolation fallback':'');
    valueText.textContent='Drag to orbit · right-drag or two fingers to pan · pinch or wheel to zoom · tap a colored triangle to probe.';
  }
  function setSurface(next){
    if(!active)return false;
    const replacement=createSavedResultContent(next,options);replacement.overlay.setOpacity(opacity);scene.add(replacement.group);
    replacement.sphere=new THREE.Box3().setFromObject(replacement.group).getBoundingSphere(new THREE.Sphere());const previous=content;content=replacement;previous?.dispose();describe(content.prepared);fit();options.onDiagnostics?.([...content.prepared.diagnostics]);invalidate();return true;
  }
  function resize(){
    if(!active)return;const sized=hasSize();activity.setState({hasSize:sized});if(!sized){invalidate();return;}
    const w=stage.clientWidth,h=stage.clientHeight,ratio=viewportPixelRatio(w,h,globalThis.devicePixelRatio,renderer.capabilities.maxTextureSize);
    if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();
  }
  function pick(event){
    if(!content?.overlay.mesh.visible)return null;
    const rect=renderer.domElement.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    return content.overlay.sample(raycaster.intersectObject(content.overlay.mesh,false)[0]);
  }
  function dispose(){
    if(!active)return;active=false;activity?.dispose();observer?.disconnect();intersectionObserver?.disconnect();for(const stop of callbacks)stop();callbacks.length=0;
    options.signal?.removeEventListener('abort',dispose);controls?.dispose();content?.dispose();content=null;scene.clear();renderer.dispose();renderer.domElement.width=renderer.domElement.height=1;host.remove();
  }
  try{
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
    activity=createRenderActivity({request:callback=>requestAnimationFrame(callback),cancel:id=>cancelAnimationFrame(id),render:draw,canRender:()=>active&&!doc.hidden&&hasSize(),state:{documentVisible:!doc.hidden,hasSize:hasSize()}});
    listen(controls,'change',()=>{updateClipping();invalidate();});
    listen(doc,'visibilitychange',()=>{activity.setState({documentVisible:!doc.hidden});if(!doc.hidden)invalidate();});
    listen(renderer.domElement,'pointerdown',event=>gesture.down(event));
    listen(renderer.domElement,'pointermove',event=>{gesture.move(event);if(options.onHover)options.onHover(pick(event));});
    listen(renderer.domElement,'pointerup',event=>{if(!gesture.up(event)||event.button!==0&&event.pointerType!=='touch')return;const sample=pick(event);if(sample){valueText.textContent=sample.value.toPrecision(6)+' '+sample.unit+' at source XYZ ('+[sample.x,sample.y,sample.z].map(n=>Number(n.toPrecision(7))).join(', ')+') '+content.prepared.coordinateUnit+' · '+sample.method;options.onProbe?.(sample);}});
    listen(renderer.domElement,'pointercancel',event=>gesture.cancel(event));listen(renderer.domElement,'pointerleave',()=>options.onHover?.(null));
    listen(renderer.domElement,'webglcontextlost',event=>{event.preventDefault();activity.setState({contextAvailable:false});notice.textContent='3D graphics context interrupted. Saved field geometry is retained.';});
    listen(renderer.domElement,'webglcontextrestored',()=>{activity.setState({contextAvailable:true});if(content)describe(content.prepared);invalidate();});
    if(typeof ResizeObserver==='function'){observer=new ResizeObserver(resize);observer.observe(stage);}else if(doc.defaultView)listen(doc.defaultView,'resize',resize);
    intersectionObserver=observeRenderActivity(activity,stage);options.signal?.addEventListener('abort',dispose,{once:true});
    scene.background=new THREE.Color(options.dark!==false?0x101d28:0xf3f7f5);resize();setSurface(initial.surface);
    if(options.signal?.aborted){dispose();throw abortError();}
  }catch(caught){dispose();throw caught;}
  return {host,unavailable:false,setSurface,
    setProbes(probes){content?.overlay.setProbes(probes);invalidate();},
    setTheme(dark){if(!active)return;theme(Boolean(dark));scene.background.setHex(dark?0x101d28:0xf3f7f5);invalidate();},
    setOpacity(value){if(!active)return;if(!Number.isFinite(value)||value<0||value>1)throw new TypeError('Choose result opacity between 0 and 1.');opacity=value;content.overlay.setOpacity(value);invalidate();},
    fit,getCameraState(){return {position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()};},
    setCameraState(value){if(!active)return false;const next=savedResultCameraState(value);camera.position.fromArray(next.position);controls.target.fromArray(next.target);camera.up.fromArray(next.up);const distance=camera.position.distanceTo(controls.target);controls.minDistance=Math.min(controls.minDistance,distance);controls.maxDistance=Math.max(controls.maxDistance,distance);controls.update();invalidate();return true;},
    getRenderStats(){const prepared=content?.prepared;return {unavailable:false,renderCount,renderActivity:{...activity.stats(),observesIntersection:Boolean(intersectionObserver)},drawCalls:renderer.info.render.calls,gpuTextures:renderer.info.memory.textures,renderedTriangles:prepared?.renderedTriangles||0,omittedTriangles:prepared?.omittedTriangles||0,contextPrimitives:prepared?.context.length||0,range:prepared?[...prepared.range]:null,colorInterpolation:content?.scalarAppearance.mode||null,scalarColorFallbacks,coordinateUnit:prepared?.coordinateUnit||options.coordinateUnit||'source units',coordinateConvention,sourceOrigin:prepared?[...prepared.origin]:null,sourceBounds:prepared?{min:[...prepared.bounds.min],max:[...prepared.bounds.max]}:null};},
    dispose
  };
}
