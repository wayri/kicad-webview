/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Bounded display-only camera memory, always bound to exact saved bytes and path. */
export class ViewMemory {
 constructor(){this.entries=[];}
 remember(viewer){const camera=viewer.view==='3d'?viewer.getCamera3D():viewer.getCamera();if(!camera||!viewer.source)return;this.entries=this.entries.filter(e=>e.path!==viewer.path||e.view!==viewer.view);this.entries.push({source:viewer.source,path:viewer.path,view:viewer.view,camera:structuredClone(camera),explode:viewer.view==='3d'?viewer.renderer?.getExplode?.()||0:0});if(this.entries.length>4)this.entries.shift();}
 restore(viewer){const entry=this.entries.find(e=>e.source===viewer.source&&e.path===viewer.path&&e.view===viewer.view);if(!entry)return false;if(entry.view==='3d'){viewer.renderer.setExplode?.(entry.explode);viewer.setCamera3D(structuredClone(entry.camera));}else viewer.setCamera(structuredClone(entry.camera));return true;}
 clear(){this.entries=[];}
}
