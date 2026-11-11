/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/* Source-bound, read-only BOM and PCB statistics. No copper union or refill. */
((root)=>{
'use strict';
const diff=root.KiCadDesignDiff||(typeof require==='function'?require('./design-diff.js'):null);
const value=x=>x&&typeof x==='object'&&!Array.isArray(x)?x.quoted:x;
const kind=x=>Array.isArray(x)?String(value(x[0])):'';
const children=(x,k)=>Array.isArray(x)?x.filter(n=>kind(n)===k):[];
const child=(x,k)=>children(x,k)[0];
const field=(x,k)=>value(child(x,k)?.[1]);
function bom(objects,path){
 if(!Array.isArray(objects)||objects.length>100000)throw new Error('BOM object limit exceeded.');
 const parts=objects.filter(o=>(!path||o.path===path)&&['symbol','footprint'].includes(o.kind));
 // Multi-unit symbols count once per saved file/reference. Different files retain identity.
 const unique=new Map();for(const o of parts){const key=JSON.stringify([o.path,o.kind==='footprint'?(o.uuid||o.id):(o.reference||o.uuid||o.id)]);if(!unique.has(key))unique.set(key,o);}
 const physical=[...unique.values()],eligible=physical.filter(o=>!o.excludeFromBom),groups=new Map();
 for(const o of eligible){const p=o.properties||{},key=JSON.stringify([p.Value||'',p.Footprint||p['Library ID']||'',o.populated!==false]);if(!groups.has(key))groups.set(key,{value:p.Value||'',footprint:p.Footprint||p['Library ID']||'',populated:o.populated!==false,parts:[]});groups.get(key).parts.push(o);}
 return {parts:physical,groups:[...groups.values()].sort((a,b)=>a.value.localeCompare(b.value)),total:physical.length,fitted:physical.filter(o=>o.populated!==false).length,dnp:physical.filter(o=>o.populated===false).length,excluded:physical.length-eligible.length,eligible:eligible.length};
}
function csv(result){
 const cell=x=>{let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const rows=[['Reference','Value','Footprint','Population','File']];for(const group of result.groups)for(const o of group.parts)rows.push([o.reference||'',group.value,group.footprint,group.populated?'Fitted':'DNP',o.path]);return rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
function polygonArea(points){if(!Array.isArray(points)||points.length<3)return null;let area=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||[a.x,a.y,b.x,b.y].some(v=>Math.abs(v)>100000))return null;area+=a.x*b.y-b.x*a.y;}return Math.abs(area)/2;}
const xy=(node,k)=>{const n=child(node,k);return{x:Number(value(n?.[1])),y:Number(value(n?.[2]))};};
const point=p=>p&&[p.x,p.y].every(v=>Number.isFinite(v)&&Math.abs(v)<=100000);
// Translate to the start before computing the circumcentre to avoid large-origin cancellation.
function arcLength(a,m,b){
 if(![a,m,b].every(point))return null;
 const ux=m.x-a.x,uy=m.y-a.y,vx=b.x-a.x,vy=b.y-a.y,d=2*(ux*vy-uy*vx);
 if(Math.abs(d)<=1e-12*Math.max(1,Math.hypot(ux,uy)*Math.hypot(vx,vy)))return null;
 const u2=ux*ux+uy*uy,v2=vx*vx+vy*vy,cx=(u2*vy-v2*uy)/d,cy=(ux*v2-vx*u2)/d,r=Math.hypot(cx,cy);
 const tau=2*Math.PI,positive=x=>(x%tau+tau)%tau,start=Math.atan2(-cy,-cx),mid=Math.atan2(uy-cy,ux-cx),end=Math.atan2(vy-cy,vx-cx);
 const sweep=positive(end-start),length=r*(positive(mid-start)<=sweep?sweep:tau-sweep);
 return Number.isFinite(length)?length:null;
}
function board(content){
 if(typeof content!=='string'||new TextEncoder().encode(content).length>8*1024*1024)throw new Error('Board analytics source exceeds 8 MiB.');
 const ast=diff.parse(content);if(kind(ast)!=='kicad_pcb')throw new Error('Board analytics requires a saved PCB.');
 const count=k=>children(ast,k).length,footprints=children(ast,'footprint');let pads=0,holes=0,smd=0,thru=0,length=0;
 for(const fp of footprints)for(const pad of children(fp,'pad')){pads++;if(child(pad,'drill'))holes++;const type=String(value(pad[2]));if(type==='smd')smd++;if(type==='thru_hole'||type==='np_thru_hole')thru++;}
 let pointCount=0;const warnings=[],layers=new Map(),zones=[];
 const netNames=new Map(children(ast,'net').map(n=>[String(value(n[1])),String(value(n[2])||'')])),netTracks=new Map(),layerTracks=new Map();let curvedLength=0,omittedTracks=0;
 for(const type of ['segment','arc'])for(const track of children(ast,type)){
  const a=xy(track,'start'),b=xy(track,'end'),n=type==='arc'?arcLength(a,xy(track,'mid'),b):point(a)&&point(b)?Math.hypot(b.x-a.x,b.y-a.y):null;
  if(n===null){omittedTracks++;continue;}if(type==='arc')curvedLength+=n;else length+=n;
  const declaration=child(track,'net'),rawNet=field(track,'net'),named=Number(field(ast,'version'))>=20260206&&typeof rawNet==='string'&&declaration?.length===2,code=named?`name:${rawNet}`:String(rawNet??'0'),layer=String(field(track,'layer')||'Unspecified');
  if(!netTracks.has(code))netTracks.set(code,{code,name:named?(rawNet||'Unassigned'):netNames.get(code)|| (code==='0'?'Unassigned':`Net ${code}`),lengthMm:0,segments:0,arcs:0});
  const net=netTracks.get(code);net.lengthMm+=n;net[type==='arc'?'arcs':'segments']++;
  layerTracks.set(layer,(layerTracks.get(layer)||0)+n);
 }
 if(omittedTracks)warnings.push(`${omittedTracks} malformed or unsupported tracks omitted from lengths.`);
 // Only a supported straight-edge envelope is used. It is not an outline union or inside-board test.
 const edgePoints=[];let unsupportedEdges=false;
 for(const shape of ast.filter(n=>kind(n).startsWith('gr_')&&field(n,'layer')==='Edge.Cuts')){
  let pts=[];if(['gr_line','gr_rect'].includes(kind(shape)))pts=[xy(shape,'start'),xy(shape,'end')];
  else if(kind(shape)==='gr_poly')pts=children(child(shape,'pts'),'xy').map(n=>({x:Number(value(n[1])),y:Number(value(n[2]))}));
  else unsupportedEdges=true;
  if(!pts.length||!pts.every(point))unsupportedEdges=true;else edgePoints.push(...pts);
 }
 let edgeBounds=null;if(edgePoints.length&&!unsupportedEdges){edgeBounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};for(const p of edgePoints){edgeBounds.minX=Math.min(edgeBounds.minX,p.x);edgeBounds.maxX=Math.max(edgeBounds.maxX,p.x);edgeBounds.minY=Math.min(edgeBounds.minY,p.y);edgeBounds.maxY=Math.max(edgeBounds.maxY,p.y);}}
 const placementCandidates=[];
 for(const fp of footprints){const at=xy(fp,'at'),reasons=[];if(!point(at))reasons.push('No valid saved position');else {if(at.x===0&&at.y===0)reasons.push('Footprint origin at (0, 0)');if(edgeBounds&&(at.x<edgeBounds.minX||at.x>edgeBounds.maxX||at.y<edgeBounds.minY||at.y>edgeBounds.maxY))reasons.push('Footprint origin outside Edge.Cuts envelope');}
  if(reasons.length)placementCandidates.push({uuid:field(fp,'uuid')||field(fp,'tstamp')||null,reference:String(value(children(fp,'property').find(n=>value(n[1])==='Reference')?.[2])||value(children(fp,'fp_text').find(n=>value(n[1])==='reference')?.[2])||''),position:point(at)?at:null,reasons});
 }
 if(unsupportedEdges)warnings.push('Edge.Cuts envelope unavailable: curved or unsupported edge geometry.');
 for(const [index,zone] of children(ast,'zone').entries()){
  const record={index,uuid:field(zone,'uuid')||field(zone,'tstamp')||null,name:String(field(zone,'name')||field(zone,'net_name')||`Zone ${index+1}`),layers:[],outlineAreaMm2:0,fillAreaMm2:0,valid:true};
  for(const [type,total] of [['polygon','outlineAreaMm2'],['filled_polygon','fillAreaMm2']])for(const poly of children(zone,type)){
   const pts=children(child(poly,'pts'),'xy').map(p=>({x:Number(value(p[1])),y:Number(value(p[2]))}));pointCount+=pts.length;if(pointCount>200000)throw new Error('Zone analytics exceeds 200,000 polygon points.');
   const area=polygonArea(pts);if(area===null){record.valid=false;warnings.push(`Zone ${index+1}: invalid polygon omitted.`);continue;}record[total]+=area;
   if(type==='filled_polygon'){const layer=String(field(poly,'layer')||field(zone,'layer')||'Unspecified');if(!record.layers.includes(layer))record.layers.push(layer);layers.set(layer,(layers.get(layer)||0)+area);}
  }
  if(!children(zone,'filled_polygon').length)warnings.push(`Zone ${index+1}: no saved filled polygons.`);
  zones.push(record);
 }
 return {footprints:footprints.length,pads,drilledPads:holes,smdPads:smd,throughHolePads:thru,segments:count('segment'),arcs:count('arc'),vias:count('via'),zones,straightTrackLengthMm:length,arcTrackLengthMm:curvedLength,totalTrackLengthMm:length+curvedLength,omittedTracks,netTracks:[...netTracks.values()].sort((a,b)=>b.lengthMm-a.lengthMm),layerTracks:[...layerTracks].map(([layer,lengthMm])=>({layer,lengthMm})),edgeBounds,placementCandidates,boardThicknessMm:Number(field(child(ast,'general'),'thickness'))||null,layerFill:[...layers].map(([layer,areaMm2])=>({layer,areaMm2})),warnings,limits:'Areas are sums of absolute shoelace areas of saved straight-edge polygons; overlaps are counted repeatedly and hole contours are not subtracted. They are not copper union, material mass, clearance checks or a fresh zone fill. Track lengths are saved segment and circular-arc centreline sums, not point-to-point electrical lengths; vias add no length. Placement candidates require review, not confirmed unplaced components; coordinates and envelope do not prove placement intent or containment. BOM counts saved file/reference identities; reused sheet instances are not expanded.'};
}
root.KiCadBomAnalytics={bom,board,polygonArea,arcLength,csv};if(typeof module==='object'&&module.exports)module.exports=root.KiCadBomAnalytics;
})(typeof globalThis!=='undefined'?globalThis:this);
