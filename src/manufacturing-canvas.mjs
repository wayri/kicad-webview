/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* CAM image renderer. Clear operations erase only their own layer. World units: mm, Y up. */
export function fitCamera(bounds, width, height) {
  const b = bounds || { x: 0, y: 0, w: 100, h: 100 };
  return { x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: Math.max(.001, Math.min(width / Math.max(.01,b.w), height / Math.max(.01,b.h)) * .88) };
}
export function screenToWorld(camera, width, height, x, y) {
  return { x: camera.x + (x-width/2)/camera.zoom, y: camera.y - (y-height/2)/camera.zoom };
}
export function zoomCamera(camera, width, height, x, y, multiplier) {
  const before = screenToWorld(camera,width,height,x,y);
  const zoom = Math.max(.001,Math.min(100000,camera.zoom*multiplier));
  return { x: before.x-(x-width/2)/zoom, y: before.y+(y-height/2)/zoom, zoom };
}
const palette = ['#f56d78','#62a5ff','#e1b85c','#73d5ae','#c49af1','#73cfdd','#e995bf','#c5d673'];
const lightPalette = ['#a9233b','#185797','#795000','#176747','#724097','#126477','#90315f','#4d6510'];

export function mountManufacturing(host, { dark = false } = {}) {
  const doc=host.ownerDocument, canvas=doc.createElement('canvas'), buffer=doc.createElement('canvas'), info=doc.createElement('div');
  canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;outline:none';
  canvas.tabIndex=0; canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','Interactive manufacturing layers; drag to pan, wheel to zoom, click to inspect; use toolbar to measure');
  info.setAttribute('role','status');info.style.cssText='position:absolute;left:12px;right:12px;bottom:12px;width:fit-content;max-width:calc(100% - 24px);padding:8px 12px;border-radius:8px;font:12px/1.5 system-ui;overflow-wrap:anywhere;pointer-events:none';info.hidden=true;
  host.append(canvas,info);
  const ctx=canvas.getContext('2d'), layerCtx=buffer.getContext('2d');
  if(!ctx||!layerCtx)throw new Error('Canvas2D is required for manufacturing viewing.');
  const events=new EventTarget();
  let model, camera, width=1,height=1,ratio=1,disposed=false,drag=null,moved=false,measureStart=null,measureEnd=null,measureComplete=false,selected=null;
  const paths=new Map(), listeners=[];
  const on=(name,fn,options)=>{canvas.addEventListener(name,fn,options);listeners.push([name,fn,options]);};
  const api=Object.assign(events,{dark,visibleLayers:new Set(),measuring:false,
    setDocument(value){ model=value;paths.clear();selected=null;measureStart=measureEnd=null;
      for(const layer of model.camLayers)for(const operation of layer.operations)paths.set(operation,new Path2D(operation.path));
      api.visibleLayers=new Set(model.layers);resize();api.zoom_to_board();api.draw(); },
    zoom_to_board(){camera=fitCamera(model?.bounds,width,height);},
    clearSelection(){selected=null;info.textContent='';draw();},
    setMeasuring(enabled){api.measuring=Boolean(enabled);measureStart=measureEnd=null;measureComplete=false;api.draw();},
    draw,
    dispose(){disposed=true;observer?.disconnect();for(const [name,fn,options]of listeners)canvas.removeEventListener(name,fn,options);paths.clear();canvas.remove();info.remove();canvas.width=canvas.height=buffer.width=buffer.height=1;}
  });
  function resize(){ if(disposed)return; const rect=host.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
    ratio=Math.min(globalThis.devicePixelRatio||1,3,Math.sqrt(8e6/width/height),8192/width,8192/height);
    canvas.width=buffer.width=Math.max(1,Math.floor(width*ratio));canvas.height=buffer.height=Math.max(1,Math.floor(height*ratio));
    camera ||= fitCamera(model?.bounds,width,height);draw(); }
  function transform(context){context.setTransform(ratio*camera.zoom,0,0,-ratio*camera.zoom,ratio*(width/2-camera.x*camera.zoom),ratio*(height/2+camera.y*camera.zoom));}
  function paint(context,operation){const path=paths.get(operation);if(operation.fill===false){context.lineWidth=operation.width;context.lineCap='round';context.lineJoin='round';context.stroke(path);}else context.fill(path,'evenodd');}
  function draw(){if(disposed||!camera)return;
    const metadata=selected?.operation.metadata;
    info.hidden=!selected||api.measuring;info.style.background=api.dark?'#182330ed':'#ffffffed';info.style.color=api.dark?'#e1eaf3':'#253445';
    if(selected){const text=selected.layer+' · '+selected.operation.kind+' · '+JSON.stringify(metadata||{}).slice(0,400);if(info.textContent!==text)info.textContent=text;}
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=api.dark?'#111923':'#f1f4f8';ctx.fillRect(0,0,canvas.width,canvas.height);
    model?.camLayers.forEach((layer,index)=>{if(!api.visibleLayers.has(layer.id))return;
      layerCtx.setTransform(1,0,0,1,0,0);layerCtx.globalCompositeOperation='source-over';layerCtx.clearRect(0,0,buffer.width,buffer.height);transform(layerCtx);
      layerCtx.fillStyle=layerCtx.strokeStyle=layer.color||(api.dark?palette:lightPalette)[index%palette.length];
      for(const operation of layer.operations){layerCtx.globalCompositeOperation=operation.polarity==='clear'?'destination-out':'source-over';paint(layerCtx,operation);}
      ctx.globalAlpha=.82;ctx.drawImage(buffer,0,0);ctx.globalAlpha=1;
    });
    if(selected&&api.visibleLayers.has(selected.layer)){transform(ctx);ctx.globalCompositeOperation='source-over';ctx.strokeStyle=api.dark?'#ffffff':'#172d47';ctx.lineWidth=2/camera.zoom;ctx.stroke(paths.get(selected.operation));}
    if(measureStart&&measureEnd){transform(ctx);ctx.strokeStyle=api.dark?'#f7e182':'#715800';ctx.lineWidth=1.5/camera.zoom;ctx.beginPath();ctx.moveTo(measureStart.x,measureStart.y);ctx.lineTo(measureEnd.x,measureEnd.y);ctx.stroke();
      const distance=Math.hypot(measureEnd.x-measureStart.x,measureEnd.y-measureStart.y);
      ctx.setTransform(ratio,0,0,ratio,0,0);ctx.font='600 12px system-ui';const label=distance.toFixed(3)+' mm';ctx.fillStyle=api.dark?'#172330':'#ffffff';ctx.fillRect(12,height-40,ctx.measureText(label).width+24,28);ctx.fillStyle=api.dark?'#f7e182':'#384353';ctx.fillText(label,24,height-21);
    }
  }
  const at=event=>{const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};};
  const world=event=>{const p=at(event);return screenToWorld(camera,width,height,p.x,p.y);};
  function pick(point){layerCtx.save();layerCtx.setTransform(1,0,0,1,0,0);
    try{for(const layer of [...model.camLayers].reverse()){if(!api.visibleLayers.has(layer.id))continue;
      for(const operation of [...layer.operations].reverse()){const b=operation.bounds;if(b&&(point.x<b.x||point.x>b.x+b.w||point.y<b.y||point.y>b.y+b.h))continue;
        const path=paths.get(operation);layerCtx.lineWidth=operation.width||.001;
        if(operation.fill===false?layerCtx.isPointInStroke(path,point.x,point.y):layerCtx.isPointInPath(path,point.x,point.y,'evenodd')){
          if(operation.polarity==='clear')break;
          return {layer:layer.id,operation};
        }
      }
    }return null;}finally{layerCtx.restore();}}
  on('pointerdown',event=>{if(event.button!==0&&event.button!==2)return;canvas.focus();canvas.setPointerCapture(event.pointerId);drag={point:at(event),camera:{...camera},button:event.button};moved=false;});
  on('pointermove',event=>{const p=at(event);if(drag){const dx=p.x-drag.point.x,dy=p.y-drag.point.y;if(Math.hypot(dx,dy)>3)moved=true;if(moved){camera={...drag.camera,x:drag.camera.x-dx/camera.zoom,y:drag.camera.y+dy/camera.zoom};draw();}}else if(api.measuring&&measureStart&&!measureComplete){measureEnd=world(event);draw();}});
  on('pointerup',event=>{if(!drag)return;const left=drag.button===0;drag=null;if(moved||!left)return;const point=world(event);
    if(api.measuring){if(!measureStart||measureComplete){measureStart=point;measureEnd=null;measureComplete=false;}else{measureEnd=point;measureComplete=true;api.dispatchEvent(new CustomEvent('measure',{detail:{start:measureStart,end:measureEnd,distance:Math.hypot(point.x-measureStart.x,point.y-measureStart.y),unit:'mm'}}));}}else{selected=pick(point);api.dispatchEvent(new CustomEvent('kicad:select',{detail:{item:selected?{...selected.operation.metadata,id:selected.operation.id,layer:selected.layer,kind:model.format}:null}}));}draw();});
  on('pointercancel',()=>{drag=null;});on('contextmenu',event=>event.preventDefault());
  on('wheel',event=>{event.preventDefault();const p=at(event);camera=zoomCamera(camera,width,height,p.x,p.y,Math.exp(-Math.max(-200,Math.min(200,event.deltaY))*.005));draw();},{passive:false});
  on('keydown',event=>{if(event.key==='Escape'){selected=null;measureStart=measureEnd=null;draw();}else if(event.key.toLowerCase()==='f'){api.zoom_to_board();draw();}});
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(host);resize();
  return api;
}
