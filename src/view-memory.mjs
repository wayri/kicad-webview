/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Best-effort display memory: never pins old design text just to save a camera. */
export class ViewMemory {
 constructor({WeakRefClass=globalThis.WeakRef}={}){this.entries=[];this.current=new WeakMap();this.WeakRefClass=WeakRefClass;}
 identity(viewer){let identity=this.current.get(viewer);if(!identity||identity.source!==viewer.source){identity={source:viewer.source,key:{}};this.current.set(viewer,identity);}return identity;}
 remember(viewer){
  const camera=viewer.view==='3d'?viewer.getCamera3D():viewer.getCamera();if(!camera||!viewer.source)return;
  const identity=this.identity(viewer),instancePath=viewer.textInstancePath??null;
  this.entries=this.entries.filter(e=>e.path!==viewer.path||e.view!==viewer.view||e.instancePath!==instancePath);
  this.entries.push({key:identity.key,sourceRef:typeof this.WeakRefClass==='function'?new this.WeakRefClass(identity):null,path:viewer.path,view:viewer.view,instancePath,camera:structuredClone(camera),explode:viewer.view==='3d'?viewer.renderer?.getExplode?.()||0:0});
  if(this.entries.length>4)this.entries.shift();
 }
 restore(viewer){
  const identity=this.identity(viewer),entry=this.entries.find(e=>e.path===viewer.path&&e.view===viewer.view&&e.instancePath===(viewer.textInstancePath??null)&&(e.key===identity.key||e.sourceRef?.deref()?.source===viewer.source));
  if(!entry)return false;if(entry.view==='3d'){(viewer.renderer.restoreExpand||viewer.renderer.setExplode)?.call(viewer.renderer,entry.explode);viewer.setCamera3D(structuredClone(entry.camera));}else viewer.setCamera(structuredClone(entry.camera));return true;
 }
 clear(){this.entries=[];this.current=new WeakMap();}
}
