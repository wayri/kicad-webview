/* Saved spatial samples only; no solver execution or invented board identity. */
((root)=>{
 'use strict';
 const MAX_TRIANGLES=200000,MAX_POINTS=400000,MAX_CONTEXT=10000;
 const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const xy=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(v=>number(v)!==null)?{x:p[0],y:p[1]}:null;
 const data=()=>root.KiCadAnalysisData||(typeof require==='function'?require('./analysis-data.js'):null);
 function toSurface(plot){
  if(!plot)return null;
  const base={unit:plot.unit||'',title:plot.title||'',layer:plot.layerName,zBasis:plot.zBasis,points:[],triangles:[],values:[],nodal:false,zKnown:false};
  if(plot.type==='mesh-field'){
   if(!Array.isArray(plot.points)||!plot.points.length||plot.points.length>MAX_POINTS||!Array.isArray(plot.triangles)||plot.triangles.length>MAX_TRIANGLES||!Array.isArray(plot.values)||plot.values.length!==(plot.nodal?plot.points.length:plot.triangles.length))return null;
   if(!plot.points.every(p=>xy(p)&&(!(p.length>2)||number(p[2])!==null))||!plot.triangles.every(t=>Array.isArray(t)&&t.length===3&&t.every(i=>Number.isSafeInteger(i)&&i>=0&&i<plot.points.length)))return null;
   base.points=plot.points.map(p=>[p[0],p[1],p.length>2?p[2]:number(plot.layerZmm)??0]);
   base.triangles=plot.triangles.map(t=>t.slice());base.values=plot.values.map(number);base.nodal=!!plot.nodal;base.zKnown=plot.points.every(p=>p.length>2)||number(plot.layerZmm)!==null;return base;
  }
  if(plot.type!=='heatmap'||!Array.isArray(plot.x)||!Array.isArray(plot.y)||!plot.x.length||!plot.y.length||plot.x.length*plot.y.length>1000000||!plot.x.every(v=>number(v)!==null)||!plot.y.every(v=>number(v)!==null)||!Array.isArray(plot.values)||plot.values.length!==plot.y.length||!plot.values.every(row=>Array.isArray(row)&&row.length===plot.x.length))return null;
  const bounds=data()?.cellBounds;if(!bounds)return null;
  const z=number(plot.layerZmm)??0;base.zKnown=number(plot.layerZmm)!==null;
  for(let y=0;y<plot.y.length;y++)for(let x=0;x<plot.x.length;x++){
   const value=number(plot.values[y][x]);if(value===null)continue;
   if(base.triangles.length+2>MAX_TRIANGLES)return null;
   const [a,b]=bounds(plot.x,x),[c,d]=bounds(plot.y,y),i=base.points.length;
   base.points.push([a,c,z],[b,c,z],[b,d,z],[a,d,z]);base.triangles.push([i,i+1,i+2],[i,i+2,i+3]);base.values.push(value,value);
  }
  return base;
 }
 function contextGeometry(value){
  const primitives=[];let vertices=0,visited=0;const seen=new WeakSet();
  const loop=(ring,color)=>{
   if(primitives.length>=MAX_CONTEXT||!Array.isArray(ring)||ring.length<3||ring.length>50000||vertices+ring.length>200000)return;
   const points=ring.map(xy);if(points.some(p=>!p))return;vertices+=points.length;primitives.push({type:'polygon',kind:'saved-context',points,color,width:.12,stroke:true});
  };
  const list=(value,max)=>Array.isArray(value)?value.slice(0,max):[];
  const polygon=(record,color)=>{if(Array.isArray(record)){loop(record,color);return;}if(!record||typeof record!=='object')return;loop(record.outer||record.outer_mm,color);for(const hole of list(record.holes||record.holes_mm,1000))loop(hole,color);};
  const geometry=g=>{
   for(const ring of (Array.isArray(g.outline)?g.outline:[]).slice(0,1000))polygon(ring,'#a5b6bc');
   for(const layer of list(g.layers,64))for(const p of list(layer?.polygons||layer?.polygons_mm,MAX_CONTEXT))polygon(p,'#5f8079');
   for(const p of (Array.isArray(g.polygons)?g.polygons:[]).slice(0,MAX_CONTEXT))polygon(p,'#5f8079');
   for(const t of list(g.tracks,MAX_CONTEXT)){const a=xy(t?.start_mm||t?.start),b=xy(t?.end_mm||t?.end);if(a&&b&&primitives.length<MAX_CONTEXT)primitives.push({type:'line',kind:'saved-context',points:[a,b],width:Math.min(10,Math.max(.12,number(t.width_mm)??.12)),color:'#5f8079'});}
   for(const c of list(g.components,1000)){const b=c?.bbox_mm||c?.source_bbox_mm;if(Array.isArray(b)&&b.length===4&&b.every(v=>number(v)!==null))loop([[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]],'#8296ac');}
  };
  const walk=(o,depth)=>{if(!o||typeof o!=='object'||depth>12||++visited>4000||seen.has(o)||Array.isArray(o))return;seen.add(o);geometry(o);for(const key of ['geometry','thermal_geometry','board_thermal_view','thermal_network','top','bottom','view','coupled','baseline','result'])walk(o[key],depth+1);};walk(value,0);return primitives;
 }
 function sourceBindings(value){
  const bindings=[],seen=new Set();let visited=0;
  const add=(path,hash)=>{if(typeof path!=='string'||path.length>4096||/[\x00-\x1f]/.test(path)||!/\.kicad_pcb$/i.test(path)||typeof hash!=='string'||!/^\w{64}$/.test(hash)||!/^[a-f0-9]{64}$/i.test(hash))return;const sha256=hash.toLowerCase(),key=path+'\n'+sha256;if(!seen.has(key)&&bindings.length<32){seen.add(key);bindings.push({path,sha256});}};
  const walk=(o,depth)=>{
   if(!o||typeof o!=='object'||Array.isArray(o)||depth>12||++visited>4000)return;
   // These pairs are the producers' saved-input contracts, not model/study hashes.
   add(o.source_path,o.source_sha256);add(o.board_path,o.source_sha256);add(o.request?.board_path,o.source_sha256);
   for(const key of ['geometry','thermal_geometry','baseline','coupled','result','report','thermal_network','electrical','thermal'])walk(o[key],depth+1);
  };walk(value,0);return bindings;
 }
 function pointHistory(plot,x,y){
  if(plot?.type!=='heatmap'||!Array.isArray(plot.frames)||!plot.frames.length||plot.frames.length>200000||!Array.isArray(plot.cells)||!Array.isArray(plot.x)||!Array.isArray(plot.y)||!Number.isSafeInteger(plot.layerIndex)||plot.layerIndex<0)return null;
  const reader=data();const hit=reader?.probe(plot,x,y);if(!hit)return null;
  const xi=plot.x.indexOf(hit.x),yi=plot.y.indexOf(hit.y),index=plot.cells.findIndex(c=>c[0]===xi&&c[1]===yi);if(index<0)return null;
  const points=plot.frames.filter(frame=>number(frame?.time_s)!==null).map(frame=>({x:frame.time_s,y:number(frame.temperatures_c?.[plot.layerIndex*plot.cells.length+index])??NaN}));if(!points.length)return null;
  return {title:plot.title+' · probe ('+hit.x+', '+hit.y+' mm)',xLabel:'Time (s)',series:[{name:(plot.title||'Saved temperature')+' ('+(plot.unit||'°C')+')',points}]};
 }
 const API={toSurface,contextGeometry,sourceBindings,pointHistory,MAX_TRIANGLES};root.KiCadAnalysisSpatial=API;if(typeof module==='object'&&module.exports)module.exports=API;
})(globalThis);
