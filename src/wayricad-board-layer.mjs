/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Source-bound 2D/3D presentation of one selected saved field. No solver or identity inference. */
export function createWayriCADBoardLayer(viewer,{raster,surface,range,allowed,layer,probe=()=>null,onProbe=()=>{},onState=()=>{},opacity=()=>.65}){
 const canvas=viewer.host.ownerDocument.createElement('canvas');canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
 const owner=Symbol('WayriCAD saved field');let renderer,frame=null,disposed=false,placedSurface=null,placedRange=null,state={placed:false,reason:'No registered field.'},down=null;
 const report=next=>{state=next;onState({...state});};
 const clear=r=>{r?.setAnalysisOverlay?.(null,{owner});placedSurface=placedRange=null;};
 const pins=()=>{const p=probe(),s=surface();if(!p||!s||!Number.isFinite(p.x)||!Number.isFinite(p.y))return[];const z=Number.isFinite(p.z)?p.z:s.points?.[0]?.[2];return Number.isFinite(z)?[{x:p.x,y:p.y,z,label:''}]:[];};
 function draw(){frame=null;if(disposed)return;const current=viewer.renderer;if(renderer!==current){renderer?.removeEventListener?.('kicad:viewframe',sync);clear(renderer);renderer=current;renderer?.addEventListener?.('kicad:viewframe',sync);}
  const saved=surface(),name=layer(),known=viewer.getLayers?.();const visible=allowed()&&saved&&(!name||!known||known.includes(name))&&(!name||(viewer.view==='3d'?viewer.getLayerState?.().visible?.includes(name)!==false:viewer.renderer?.visibleLayers?.has(name)!==false));
  canvas.hidden=true;
  if(viewer.view==='3d'){
   if(!visible||!renderer?.setAnalysisOverlay){clear(renderer);report({placed:false,reason:!visible?'Field disabled, hidden layer or unmatched source.':'This renderer cannot register saved fields.'});return;}
   try{const scale=range();if(placedSurface!==saved||placedRange!==scale){const placed=renderer.setAnalysisOverlay(saved,{owner,range:scale,palette:'wayricad',throughBoard:true,layer:name});if(!placed.placed){clear(renderer);report(placed);return;}placedSurface=saved;placedRange=scale;report({...placed,layer:name,view:'3d',throughBoard:true});}renderer.setAnalysisOpacity?.(opacity(),{owner});renderer.setAnalysisProbes?.(pins(),{owner});}
   catch(error){clear(renderer);report({placed:false,reason:error.message});}return;
  }
  clear(renderer);const camera=viewer.view==='pcb'&&renderer?.viewport?.camera;if(!visible||!camera){report({placed:false,reason:'Field disabled, hidden layer or unmatched source.'});return;}
  const image=raster();if(!image){report({placed:false,reason:'No finite saved field coverage.'});return;}
  canvas.hidden=false;const dpr=Math.min(2,globalThis.devicePixelRatio||1),w=Math.max(1,Math.round(camera.width*dpr)),h=Math.max(1,Math.round(camera.height*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);const a=camera.world_to_screen({x:image.bounds.x0,y:image.bounds.y0}),b=camera.world_to_screen({x:image.bounds.x1,y:image.bounds.y1});ctx.setTransform(dpr,0,0,dpr,0,0);ctx.save();ctx.globalAlpha=opacity();ctx.translate(a.x,a.y);ctx.scale((b.x-a.x)/image.width,(b.y-a.y)/image.height);ctx.drawImage(image.canvas,0,0);ctx.restore();const p=probe();if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){const xy=camera.world_to_screen(p);ctx.beginPath();ctx.arc(xy.x,xy.y,7,0,2*Math.PI);ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle='#073e49';ctx.lineWidth=1;ctx.stroke();}report({placed:true,layer:name,view:'pcb',throughBoard:false});
 }
 function sync(){if(disposed)return;if(canvas.parentNode!==viewer.stage)viewer.stage.append(canvas);if(frame===null)frame=requestAnimationFrame(draw);}
 function start(event){down=event.button===0?{x:event.clientX,y:event.clientY,id:event.pointerId}:null;}
 function end(event){const p=down;down=null;if(!p||p.id!==event.pointerId||event.button!==0||Math.hypot(p.x-event.clientX,p.y-event.clientY)>5||viewer.view!=='pcb'||!allowed())return;const camera=viewer.renderer?.viewport?.camera;if(!camera)return;const box=viewer.stage.getBoundingClientRect(),a=camera.world_to_screen({x:0,y:0}),b=camera.world_to_screen({x:1,y:1});if(b.x===a.x||b.y===a.y)return;onProbe((event.clientX-box.left-a.x)/(b.x-a.x),(event.clientY-box.top-a.y)/(b.y-a.y));}
 const events=['ready','viewchange','camerachange','layerschange'];for(const name of events)viewer.addEventListener(name,sync);viewer.stage.addEventListener('pointerdown',start);viewer.stage.addEventListener('pointerup',end);sync();
 return{sync,ownsProbe(p){return !disposed&&allowed()&&viewer.view==='3d'&&renderer===viewer.renderer&&placedSurface===surface()&&p?.overlayOwner===owner;},getState(){return{...state};},dispose(){if(disposed)return;disposed=true;if(frame!==null)cancelAnimationFrame(frame);clear(renderer);renderer?.removeEventListener?.('kicad:viewframe',sync);for(const name of events)viewer.removeEventListener(name,sync);viewer.stage.removeEventListener('pointerdown',start);viewer.stage.removeEventListener('pointerup',end);canvas.remove();canvas.width=canvas.height=1;}};
}
