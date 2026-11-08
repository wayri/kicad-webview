/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {analysisColor,analysisCellAt,formatAnalysisValue} from './analysis-results.mjs';

/** An independent read-only heatmap synchronized to the saved PCB camera. */
export function createAnalysisLayer(viewer,data) {
  const doc=viewer.host.ownerDocument,ns='http://www.w3.org/2000/svg';
  const make=(tag,value)=>{const e=doc.createElement(tag);if(value)e.textContent=value;return e;};
  const svg=doc.createElementNS(ns,'svg'),group=doc.createElementNS(ns,'g');svg.append(group);
  svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
  const panel=make('section');panel.setAttribute('aria-label','Imported analysis results');
  panel.style.cssText='position:absolute;left:10px;bottom:10px;z-index:4;max-width:min(340px,calc(100% - 20px));max-height:55%;overflow:auto;padding:10px;border:1px solid var(--viewer-border);border-radius:10px;background:var(--viewer-bar);color:var(--viewer-ink);box-shadow:var(--viewer-shadow);font:12px/1.5 system-ui';
  const badge=make('strong',data.provenance.kind==='illustrative'?'ILLUSTRATIVE · NOT SOLVER RESULTS':'IMPORTED '+data.provenance.kind.toUpperCase()+' RESULTS');badge.style.cssText='display:block;color:var(--viewer-accent);font-size:10px;letter-spacing:.06em';
  const select=make('select');select.setAttribute('aria-label','Analysis field');select.style.cssText='display:block;width:100%;margin:6px 0;padding:6px;background:var(--viewer-bg);color:var(--viewer-ink);border:1px solid var(--viewer-border);border-radius:5px';
  for(const f of data.fields){const option=make('option',f.name+' ['+f.unit+']');option.value=f.id;select.append(option);}
  const bar=make('div');bar.style.cssText='height:8px;border-radius:4px;background:linear-gradient(90deg,'+[0,1/3,2/3,1].map(t=>analysisColor(t,[0,1])).join(',')+')';
  const scale=make('div');scale.style.cssText='display:flex;justify-content:space-between;font-variant-numeric:tabular-nums';
  const low=make('span'),high=make('span');scale.append(low,high);
  const reading=make('div','Move over the board to probe a cell.');reading.setAttribute('role','status');
  const visibility=make('label'),enabled=make('input');enabled.type='checkbox';enabled.checked=true;enabled.setAttribute('aria-label','Show analysis overlay');visibility.append(enabled,make('span',' Show overlay'));
  const alpha=make('input');alpha.type='range';alpha.min='0';alpha.max='100';alpha.value='65';alpha.setAttribute('aria-label','Analysis opacity');alpha.style.width='100%';
  const details=make('details'),summary=make('summary','Run details & assumptions');
  const provenance=make('div',data.provenance.tool+' · '+data.provenance.runId+(data.provenance.generatedAt?' · '+data.provenance.generatedAt:''));provenance.style.overflowWrap='anywhere';
  const notes=make('ul');for(const assumption of data.provenance.assumptions)notes.append(make('li',assumption));
  details.append(summary,provenance,notes,make('p','Fixed color scale; values outside the scale clamp to endpoint colors. Overlapping cells use the last supplied cell. This viewer does not calculate or validate engineering results.'));
  panel.append(badge,select,bar,scale,reading,visibility,alpha,details);
  let field=data.fields[0],renderer=null,frame=null,point=null,disposed=false,paused=false;
  function setField(id){
    const next=data.fields.find(f=>f.id===id);if(!next)throw new TypeError('Choose an imported analysis field.');field=next;select.value=id;
    group.replaceChildren();
    for(const s of field.samples){const rect=doc.createElementNS(ns,'rect');for(const key of ['x','y','width','height'])rect.setAttribute(key,String(s[key]));rect.setAttribute('fill',analysisColor(s.value,field.range));group.append(rect);}
    low.textContent=formatAnalysisValue(field.range[0])+' '+field.unit;high.textContent=formatAnalysisValue(field.range[1])+' '+field.unit;reading.textContent='Move over the board to probe a cell.';sync();
  }
  function available(){return viewer.view==='pcb'&&viewer.renderer?.viewport?.camera;}
  function sync(){
    if(disposed)return;
    const camera=available();
    const layerVisible=!field.layer||viewer.renderer?.visibleLayers?.has(field.layer);
    svg.hidden=!camera||!enabled.checked||!layerVisible;svg.style.display=svg.hidden?'none':'';group.setAttribute('opacity',String(Number(alpha.value)/100));
    if(!camera){paused=true;reading.textContent='Overlay paused · switch to PCB layout.';return;}
    if(!layerVisible){paused=true;reading.textContent='Overlay paused · '+field.layer+' is hidden.';return;}
    if(!enabled.checked){paused=true;reading.textContent='Overlay hidden.';return;}
    if(paused){paused=false;reading.textContent='Move over the board to probe a cell.';}
    const origin=camera.world_to_screen({x:0,y:0});
    svg.setAttribute('viewBox','0 0 '+camera.width+' '+camera.height);
    group.setAttribute('transform',`translate(${origin.x} ${origin.y}) scale(${camera.flipped?-camera.zoom:camera.zoom} ${camera.zoom})`);
  }
  const move=event=>{
    if(!available()||event.target!==viewer.renderer.canvas||svg.hidden)return;
    const rect=viewer.renderer.canvas.getBoundingClientRect();point={x:event.clientX-rect.left,y:event.clientY-rect.top};
    if(frame!==null)return;
    frame=requestAnimationFrame(()=>{frame=null;if(disposed||!available()||svg.hidden||!point)return;const at=viewer.renderer.viewport.camera.screen_to_world(point),cell=analysisCellAt(field,at);reading.textContent=cell?formatAnalysisValue(cell.value)+' '+field.unit+' · '+at.x.toFixed(2)+', '+at.y.toFixed(2)+' mm':'No supplied result at this position.';});
  };
  viewer.stage.addEventListener('pointermove',move);
  function attach(){
    renderer?.removeEventListener?.('kicad:viewframe',sync);renderer=viewer.renderer;renderer?.addEventListener?.('kicad:viewframe',sync);
    viewer.stage.append(svg,panel);sync();
  }
  select.onchange=()=>setField(select.value);enabled.onchange=sync;alpha.oninput=sync;
  setField(field.id);attach();
  return {data,attach,sync,setField,dispose(){disposed=true;renderer?.removeEventListener?.('kicad:viewframe',sync);viewer.stage.removeEventListener('pointermove',move);if(frame!==null)cancelAnimationFrame(frame);select.onchange=enabled.onchange=alpha.oninput=null;svg.remove();panel.remove();}};
}
