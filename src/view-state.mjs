/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {cameraState3D} from '../engine/spike/cameraState.mjs';
/** Portable, source-bound view descriptions. Links contain no drawing source or credentials. */
const SCHEMA='kicad-webview.views/v1',MAX_FRAGMENT=16384,MAX_VIEWS=8;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function object(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError('Invalid '+label+'.');
 if(Object.keys(value).some(key=>!keys.includes(key)))throw new TypeError('Unsupported field in '+label+'.');
 return value;
}
function text(value,max,label,empty=false){if(typeof value!=='string'||value.length>max||!empty&&!value.length||/[\x00-\x1f\x7f]/.test(value))throw new TypeError('Invalid '+label+'.');return value;}
function number(value,min,max,label){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new TypeError('Invalid '+label+'.');return value;}
function path(value){text(value,1024,'drawing path',true);if(value&&(value.startsWith('/')||value.includes('%')||/[\?#:]/.test(value)||value.split('/').some(part=>!part||part==='.'||part==='..')))throw new TypeError('Choose a project-relative drawing path.');return value;}
function camera2D(value){object(value,['center','zoom','flipped'],'2D camera');object(value.center,['x','y'],'2D camera center');if(typeof value.flipped!=='boolean')throw new TypeError('Invalid flipped camera state.');return {center:{x:number(value.center.x,-1e6,1e6,'camera x'),y:number(value.center.y,-1e6,1e6,'camera y')},zoom:number(value.zoom,.001,10000,'camera zoom'),flipped:value.flipped};}
function camera3D(value){object(value,['position','target','up'],'3D camera');return cameraState3D(value);}

function selection(value){
 if(value===null)return null;
 object(value,['kind','uuid','ownerUuid','id','netName','pinNumber'],'selection');const result={kind:text(value.kind,64,'selection kind')};
 for(const key of ['uuid','ownerUuid','id','netName'])if(own(value,key))result[key]=text(value[key],key==='id'?2048:1024,'selection '+key);
 if(own(value,'pinNumber'))result.pinNumber=typeof value.pinNumber==='number'?number(value.pinNumber,-1e6,1e6,'pin number'):text(value.pinNumber,64,'pin number');
 if(result.kind==='net'?!result.id&&!result.netName:!result.uuid&&!result.id&&!result.ownerUuid)throw new TypeError('Selection needs a saved identity.');return result;
}
/** Validate and copy the bounded public schema; unknown fields are rejected. */
export function validateViewState(input){
 object(input,['schema','views','theme','layout','activePane','linkedSelection'],'view state');if(input.schema!==SCHEMA)throw new TypeError('Unsupported view-state schema.');
 if(!Array.isArray(input.views)||input.views.length<1||input.views.length>MAX_VIEWS)throw new TypeError('Choose 1 to 8 linked views.');
 const result={schema:SCHEMA,views:input.views.map(view=>{
  object(view,['path','sha256','view','camera','camera3D','layers','selection'],'saved view');
  if(!['pcb','schematic','3d'].includes(view.view))throw new TypeError('View links support native KiCad views only.');
  if(typeof view.sha256!=='string'||!/^[a-f0-9]{64}$/.test(view.sha256))throw new TypeError('Invalid source SHA-256.');
  const out={path:path(view.path),sha256:view.sha256,view:view.view};
  if(own(view,'camera')){if(view.view==='3d')throw new TypeError('Use a 3D camera for the 3D view.');out.camera=camera2D(view.camera);}
  if(own(view,'camera3D')){if(view.view!=='3d')throw new TypeError('A 3D camera requires the 3D view.');out.camera3D=camera3D(view.camera3D);}
  if(own(view,'layers')){if(view.view!=='pcb'||!Array.isArray(view.layers)||view.layers.length>128)throw new TypeError('Layer state requires a bounded PCB layer list.');out.layers=view.layers.map(layer=>text(layer,128,'saved layer'));if(new Set(out.layers).size!==out.layers.length)throw new TypeError('Duplicate saved layers.');}
  if(own(view,'selection'))out.selection=selection(view.selection);return out;
 })};
 if(own(input,'theme')){if(!['light','dark'].includes(input.theme))throw new TypeError('Invalid view theme.');result.theme=input.theme;}
 if(own(input,'layout')){if(!['single','split'].includes(input.layout))throw new TypeError('Invalid view layout.');result.layout=input.layout;}
 if(own(input,'activePane')){if(!Number.isInteger(input.activePane)||input.activePane<0||input.activePane>=result.views.length)throw new TypeError('Invalid active view.');result.activePane=input.activePane;}
 if(own(input,'linkedSelection')){if(typeof input.linkedSelection!=='boolean')throw new TypeError('Invalid selection linkage.');result.linkedSelection=input.linkedSelection;}
 // Bounds apply to direct API objects as well as parsed URL fragments.
 if(encodeURIComponent(JSON.stringify(result)).length+11>MAX_FRAGMENT)throw new TypeError('View state is too large for a link.');return result;
}
async function hash(source){if(!globalThis.crypto?.subtle)throw new Error('View links require Web Crypto on HTTPS or localhost.');return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function viewersList(viewers){if(!Array.isArray(viewers)||!viewers.length||viewers.length>MAX_VIEWS||new Set(viewers).size!==viewers.length)throw new TypeError('Supply 1 to 8 distinct viewers.');for(const viewer of viewers){viewer.assertActive?.();if(typeof viewer.source!=='string'||!['pcb','schematic'].includes(viewer.kind)||!['pcb','schematic','3d'].includes(viewer.view))throw new TypeError('Load native KiCad drawings before using view links.');}return viewers;}
function copiedSelection(value){if(!value)return null;const out={kind:value.kind};for(const key of ['uuid','ownerUuid','id','netName','pinNumber'])if(value[key]!==undefined&&value[key]!=='')out[key]=value[key];return out;}
/** Capture independent view/camera/selection state bound to exact saved source text. */
export async function captureViewState(viewers,options={}){
 viewersList(viewers);const sources=viewers.map(v=>({source:v.source,path:v.path||'',view:v.view,renderer:v.renderer,generation:v.generation}));
 const views=viewers.map((viewer,index)=>{
  const view={path:sources[index].path,view:viewer.view,selection:copiedSelection(viewer.getSelection?.())};
  const camera=viewer.view==='3d'?viewer.getCamera3D?.():viewer.getCamera?.();if(camera)view[viewer.view==='3d'?'camera3D':'camera']=JSON.parse(JSON.stringify(camera));
  if(viewer.view==='pcb'&&viewer.renderer?.visibleLayers instanceof Set)view.layers=[...viewer.renderer.visibleLayers].filter(layer=>viewer.getLayers().includes(layer));return view;
 });
 const hashes=await Promise.all(sources.map(value=>hash(value.source)));
 if(viewers.some((viewer,index)=>viewer.disposed||viewer.source!==sources[index].source||(viewer.path||'')!==sources[index].path||viewer.view!==sources[index].view||viewer.renderer!==sources[index].renderer||viewer.generation!==sources[index].generation))throw new Error('A drawing changed while creating its view link. Try again.');
 const state={schema:SCHEMA,views:views.map((view,i)=>({...view,sha256:hashes[i]}))};for(const key of ['theme','layout','activePane','linkedSelection'])if(options[key]!==undefined)state[key]=options[key];return validateViewState(state);
}
function aborted(){return new DOMException('View restoration was aborted.','AbortError');}
/** Restore only loaded/explicitly resolved project files; no URL is fetched from state. */
export async function restoreViewState(viewers,input,{signal,openFile,current}={}){
 const state=validateViewState(input);viewersList(viewers);if(state.views.length!==viewers.length)throw new TypeError('View link count does not match the supplied viewers.');
 const check=()=>{if(signal?.aborted)throw aborted();return !viewers.some(v=>v.disposed)&&(!current||current());};
 const wait=promise=>new Promise((resolve,reject)=>{const abort=()=>reject(aborted());Promise.resolve(promise).then(resolve,reject).finally(()=>signal?.removeEventListener('abort',abort));if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});});
 if(!check())return false;
 const snapshot=viewer=>({source:viewer.source,path:viewer.path||'',renderer:viewer.renderer,generation:viewer.generation});
 // Guard peers from the first asynchronous file resolution, including same-source reloads.
 const saved=viewers.map(snapshot);
 const sameSource=(viewer,i)=>viewer.source===saved[i].source&&(viewer.path||'')===saved[i].path;
 const sameMount=(viewer,i)=>sameSource(viewer,i)&&viewer.renderer===saved[i].renderer&&viewer.generation===saved[i].generation;
 const unchanged=()=>viewers.every(sameMount);
 for(let i=0;i<viewers.length;i++){
  if(!check()||!unchanged())return false;
  if((viewers[i].path||'')!==state.views[i].path){
   if(typeof openFile!=='function')throw new Error('Load the linked drawing first: '+state.views[i].path);
   const previousGeneration=viewers[i].generation,ok=await wait(openFile(i,state.views[i].path,signal));
   if(!check()||ok===false||!viewers.every((viewer,j)=>j===i||sameMount(viewer,j)))return false;
   if(Number.isInteger(previousGeneration)&&viewers[i].generation!==previousGeneration+1)return false;
   if((viewers[i].path||'')!==state.views[i].path)throw new Error('The host did not open the linked drawing: '+state.views[i].path);
   saved[i]=snapshot(viewers[i]);
  }
 }
 const hashes=await wait(Promise.all(saved.map(value=>hash(value.source))));if(!check())return false;

 if(!unchanged())return false;
 for(let i=0;i<viewers.length;i++){
  const viewer=viewers[i],view=state.views[i];if(view.path!==saved[i].path||view.sha256!==hashes[i])throw new Error('View link source SHA-256 does not match '+view.path+'.');
  if(!['pcb','schematic'].includes(viewer.kind))throw new TypeError('View links require native KiCad drawings.');
  if(viewer.kind==='schematic'?view.view!=='schematic':!['pcb','3d'].includes(view.view))throw new TypeError('Linked view does not match the drawing kind.');
  if(view.layers?.some(layer=>!viewer.getLayers().includes(layer)))throw new TypeError('View link refers to an absent saved layer.');
 }
 for(let i=0;i<viewers.length;i++){
  const viewer=viewers[i],view=state.views[i];if(!check()||!unchanged())return false;
  if(viewer.view!==view.view){
   const previousGeneration=viewer.generation,pending=viewer.setView(view.view,{signal});
   const expectedGeneration=Number.isInteger(previousGeneration)?previousGeneration+1:viewer.generation;
   const ok=await wait(pending);
   if(!check()||ok===false||viewer.generation!==expectedGeneration||!viewers.every((candidate,j)=>j===i?sameSource(candidate,j):sameMount(candidate,j)))return false;
   saved[i].renderer=viewer.renderer;saved[i].generation=viewer.generation;
  }
 }
 if(viewers.some((viewer,i)=>viewer.view!==state.views[i].view))return false;
 // Hashes and drawing kinds of every pane are checked before camera/selection application.
 for(let i=0;i<viewers.length;i++){
  if(!check()||!unchanged()||viewers.some((viewer,j)=>viewer.view!==state.views[j].view))return false;const viewer=viewers[i],view=state.views[i];
  if(state.theme){viewer.setTheme(state.theme);if(!check()||!unchanged())return false;}
  if(view.camera){viewer.setCamera(view.camera);if(!check()||!unchanged())return false;}
  if(view.camera3D){viewer.setCamera3D(view.camera3D);if(!check()||!unchanged())return false;}
  if(view.layers){viewer.setLayers(view.layers);if(!check()||!unchanged())return false;}
  viewer.clearSelection();if(!check()||!unchanged())return false;const selected=view.selection;if(!selected)continue;
  const ok=selected.kind==='net'?viewer.selectNet(selected.id||selected.netName,{locate:false}):viewer.selectObject(selected.kind==='pin'&&selected.ownerUuid?selected.ownerUuid:selected.uuid||selected.id||selected.ownerUuid,{locate:false,...(selected.pinNumber!==undefined?{pinNumber:selected.pinNumber}:{})});
  if(!check()||!unchanged()||viewers.some((viewer,j)=>viewer.view!==state.views[j].view))return false;
  if(!ok)throw new Error('The linked selection is absent or ambiguous in '+view.path+'.');
 }
 if(!check()||!unchanged()||viewers.some((viewer,j)=>viewer.view!==state.views[j].view))return false;
 return true;
}
function url(value){const result=new URL(value);if(!['http:','https:'].includes(result.protocol)||result.username||result.password)throw new TypeError('Choose an HTTP(S) view URL without credentials.');if(result.href.length>32768)throw new TypeError('View URL is too large.');return result;}
/** Replaces only the fragment; query parameters and the host page remain caller-owned. */
export function createViewLink(baseURL,state){const result=url(baseURL);result.hash='kicad-view='+encodeURIComponent(JSON.stringify(validateViewState(state)));if(result.hash.length>MAX_FRAGMENT)throw new TypeError('View link fragment is too large.');return result.href;}
/** Returns null when this URL has no view-state fragment. Never loads a project. */
export function parseViewLink(input){const result=url(input);if(!result.hash.startsWith('#kicad-view='))return null;if(result.hash.length>MAX_FRAGMENT)throw new TypeError('View link fragment is too large.');let value;try{value=JSON.parse(decodeURIComponent(result.hash.slice(12)));}catch{throw new TypeError('Malformed view-state link.');}return validateViewState(value);}
