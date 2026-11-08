/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
/** Portable imported scalar fields. This module performs no engineering solve. */
const text = (value, name, max=240) => {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new TypeError('Invalid analysis '+name+'.');
  return value;
};
const finite = (value, name, limit=1e9) => {
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>limit)throw new TypeError('Invalid analysis '+name+'.');
  return value;
};
export function parseAnalysis(input) {
  if(typeof input==='string'){
    if(input.length>8*1024*1024||new TextEncoder().encode(input).length>8*1024*1024)throw new RangeError('Analysis JSON exceeds 8 MiB.');
    input=JSON.parse(input);
  }
  if(!input||input.schema!=='kicad-webview.analysis/v1'||input.coordinateSystem!=='kicad-mm')throw new TypeError('Expected analysis/v1 in saved KiCad millimetre coordinates.');
  if(!/^[a-f0-9]{64}$/.test(input.board?.sha256||''))throw new TypeError('Analysis requires the exact saved PCB SHA-256.');
  const board={sha256:input.board.sha256};
  if(input.board.path!==undefined)board.path=text(input.board.path,'board path',1000);
  const p=input.provenance;
  if(!p||!['computed','measured','illustrative'].includes(p.kind))throw new TypeError('Choose computed, measured or illustrative provenance.');
  if(!Array.isArray(p.assumptions)||p.assumptions.length>24)throw new TypeError('Supply bounded analysis assumptions (an empty array is allowed).');
  const provenance={kind:p.kind,tool:text(p.tool,'tool'),runId:text(p.runId,'run ID'),assumptions:p.assumptions.map(s=>text(s,'assumption',500))};
  if(p.generatedAt!==undefined){if(typeof p.generatedAt!=='string'||p.generatedAt.length>40||!Number.isFinite(Date.parse(p.generatedAt)))throw new TypeError('Invalid analysis timestamp.');provenance.generatedAt=p.generatedAt;}
  if(!Array.isArray(input.fields)||!input.fields.length||input.fields.length>8)throw new RangeError('Supply 1–8 analysis fields.');
  const ids=new Set();let count=0;
  const fields=input.fields.map(f=>{
    const id=text(f?.id,'field ID',80);if(ids.has(id))throw new TypeError('Duplicate analysis field ID.');ids.add(id);
    if(!Array.isArray(f.range)||f.range.length!==2)throw new TypeError('Supply a fixed scalar range.');
    const range=f.range.map(v=>finite(v,'range'));if(range[1]<=range[0])throw new RangeError('Analysis range must increase.');
    if(!Array.isArray(f.samples)||!f.samples.length||(count+=f.samples.length)>10000)throw new RangeError('Analysis is limited to 10,000 cells in total.');
    const field={id,name:text(f.name,'field name'),unit:text(f.unit,'unit',40),range,samples:f.samples.map(s=>{
      const cell={x:finite(s?.x,'x',1e6),y:finite(s?.y,'y',1e6),width:finite(s?.width,'width',1e6),height:finite(s?.height,'height',1e6),value:finite(s?.value,'value')};
      if(cell.width<=0||cell.height<=0)throw new RangeError('Analysis cells must have positive dimensions.');
      return cell;
    })};
    if(f.layer!==undefined)field.layer=text(f.layer,'layer',80);
    return field;
  });
  // Copy and freeze the accepted contract: later caller mutations cannot bypass validation.
  const result={schema:input.schema,coordinateSystem:input.coordinateSystem,board,provenance,fields};
  const freeze=o=>{if(o&&typeof o==='object'){for(const value of Object.values(o))freeze(value);Object.freeze(o);}return o;};
  return freeze(result);
}
export async function analysisSourceHash(source) {
  if(typeof source!=='string')throw new TypeError('Load a saved PCB source first.');
  if(!globalThis.crypto?.subtle)throw new Error('Analysis binding requires a secure context (HTTPS or localhost).');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source)))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function analysisColor(value,range) {
  const t=Math.max(0,Math.min(1,(value-range[0])/(range[1]-range[0])));
  // Sequential blue-to-yellow scale, shared by cells and legend. Outliers clamp visibly.
  const stops=[[26,64,115],[20,136,156],[107,196,151],[255,225,112]],u=t*3,i=Math.min(2,Math.floor(u)),f=u-i;
  return 'rgb('+stops[i].map((n,k)=>Math.round(n+(stops[i+1][k]-n)*f)).join(',')+')';
}
export function analysisCellAt(field,point) {
  for(let i=field.samples.length-1;i>=0;i--){const s=field.samples[i];if(point.x>=s.x&&point.x<=s.x+s.width&&point.y>=s.y&&point.y<=s.y+s.height)return s;}
  return null;
}
export function formatAnalysisValue(value) { return String(Number(value.toPrecision(6))); }
