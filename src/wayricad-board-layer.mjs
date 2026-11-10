/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** A display-only saved-field canvas, registered only by the owning result viewer. */
export function createWayriCADBoardLayer(viewer,{raster,allowed,layer,opacity=()=>.65}){
 const canvas=viewer.host.ownerDocument.createElement('canvas');canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
 let renderer,frame=null,disposed=false;
 function draw(){frame=null;if(disposed)return;const camera=viewer.view==='pcb'&&viewer.renderer?.viewport?.camera,visible=allowed()&&camera&&(!layer()||viewer.renderer.visibleLayers?.has(layer()));canvas.hidden=!visible;if(!visible)return;
  const image=raster();if(!image){canvas.hidden=true;return;}const dpr=Math.min(2,globalThis.devicePixelRatio||1),w=Math.max(1,Math.round(camera.width*dpr)),h=Math.max(1,Math.round(camera.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);const a=camera.world_to_screen({x:image.bounds.x0,y:image.bounds.y0}),b=camera.world_to_screen({x:image.bounds.x1,y:image.bounds.y1});ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=opacity();ctx.translate(a.x,a.y);ctx.scale((b.x-a.x)/image.width,(b.y-a.y)/image.height);ctx.drawImage(image.canvas,0,0);
 }
 function sync(){if(disposed)return;if(renderer!==viewer.renderer){renderer?.removeEventListener?.('kicad:viewframe',sync);renderer=viewer.renderer;renderer?.addEventListener?.('kicad:viewframe',sync);}if(canvas.parentNode!==viewer.stage)viewer.stage.append(canvas);if(frame===null)frame=requestAnimationFrame(draw);}
 const events=['ready','viewchange','camerachange','layerschange'];for(const name of events)viewer.addEventListener(name,sync);sync();
 return{sync,dispose(){if(disposed)return;disposed=true;if(frame!==null)cancelAnimationFrame(frame);renderer?.removeEventListener?.('kicad:viewframe',sync);for(const name of events)viewer.removeEventListener(name,sync);canvas.remove();canvas.width=canvas.height=1;}};
}
