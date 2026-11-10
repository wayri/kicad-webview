/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
// Parser source: KiCad Online extension analysis-data.js SHA-256
// 527fa763938e256a8a419b0bb4be2f9df36df4c0dbfd8473963fe28a4db6e997;
// analysis-spatial.js SHA-256 e54ae11f5dd7b56063b2ac3dd21ded6e6b91eaeca430f84fd6cc4c56669f6c3.
import '../engine/wayricad/analysis-data.js';
import '../engine/wayricad/analysis-spatial.js';
const data=globalThis.KiCadAnalysisData, spatial=globalThis.KiCadAnalysisSpatial;
const MAX_BYTES=64*1024*1024, MAX_DEPTH=64, MAX_NODES=4000000;
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);

// Check duplicate keys and depth before JSON.parse can discard evidence.
function strictJSON(text) {
  let i=0,nodes=0; const tokenPattern=/(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/y; const bad=()=>{throw new TypeError('Invalid, duplicate-key or over-limit JSON result.');};
  const ws=()=>{while(i<text.length&&/[\x20\t\r\n]/.test(text[i]))i++;};
  const string=()=>{const start=i++;while(i<text.length){const c=text[i++];if(c==='"'){try{return JSON.parse(text.slice(start,i));}catch{return bad();}}if(c==='\\'){if(i>=text.length)return bad();const e=text[i++];if(e==='u'){if(!/^[0-9a-fA-F]{4}$/.test(text.slice(i,i+4)))return bad();i+=4;}else if(!'"\\/bfnrt'.includes(e))return bad();}else if(c.charCodeAt(0)<32)return bad();}return bad();};
  function value(depth){if(depth>MAX_DEPTH||++nodes>MAX_NODES)return bad();ws();const c=text[i];
    if(c==='"'){string();return;}if(c==='{'){i++;ws();const keys=new Set();if(text[i]==='}'){i++;return;}while(true){ws();if(text[i]!=='"')return bad();const key=string();if(keys.has(key))return bad();keys.add(key);ws();if(text[i++]!==':')return bad();value(depth+1);ws();const next=text[i++];if(next==='}')return;if(next!==',')return bad();}}
    if(c==='['){i++;ws();if(text[i]===']'){i++;return;}while(true){value(depth+1);ws();const next=text[i++];if(next===']')return;if(next!==',')return bad();}}
    tokenPattern.lastIndex=i;const token=tokenPattern.exec(text)?.[0];if(!token)return bad();if(token!=='true'&&token!=='false'&&token!=='null'&&!Number.isFinite(Number(token)))return bad();i+=token.length;
  }
  value(0);ws();if(i!==text.length)return bad();return JSON.parse(text);
}
function cloneInput(input){
  if(typeof input==='string'){if(new TextEncoder().encode(input).length>MAX_BYTES)throw new RangeError('Result exceeds 64 MiB.');return strictJSON(input.replace(/^\uFEFF/,''));}
  const seen=new WeakSet();let nodes=0;
  function walk(value,depth){if(depth>MAX_DEPTH||++nodes>MAX_NODES)throw new RangeError('Result exceeds depth or work limit.');
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'&&Number.isFinite(value))return;
    if(!value||typeof value!=='object'||seen.has(value))throw new TypeError('Result must be acyclic JSON data.');
    if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new TypeError('Result must use plain JSON objects.');
    seen.add(value);const descriptors=Object.getOwnPropertyDescriptors(value);
    for(const [key,desc] of Object.entries(descriptors)){if(Array.isArray(value)&&key==='length')continue;if(!desc.enumerable||!('value' in desc))throw new TypeError('Result must contain only JSON data properties.');walk(desc.value,depth+1);}if(Object.getOwnPropertySymbols(value).length)throw new TypeError('Result must not contain symbol keys.');
    if(Array.isArray(value)&&Object.keys(value).length!==value.length)throw new TypeError('Sparse arrays are not JSON results.');seen.delete(value);
  }
  walk(input,0);const text=JSON.stringify(input);if(new TextEncoder().encode(text).length>MAX_BYTES)throw new RangeError('Result exceeds 64 MiB.');return JSON.parse(text);
}
function freeze(value,seen=new WeakSet()){if(!value||typeof value!=='object'||seen.has(value))return value;seen.add(value);for(const child of Object.values(value))freeze(child,seen);return Object.freeze(value);}
function recognized(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  if(typeof raw.schema==='string'&&/setup/i.test(raw.schema))return false;
  const portable=raw.pocket_kivi_export, library=raw.wayricad_saved_result;
  if(portable&&portable.schema!=='wayricad.pocket-kivi-export/v1')throw new TypeError('Unsupported portable result metadata.');
  if(library&&(library.schema!=='wayricad.project-result/v1'||!['quick-pi','quick-si','quick-therm','quick-emerge'].includes(library.plugin)))throw new TypeError('Unsupported project result metadata.');
  return Boolean((raw.mesh&&raw.result)||(raw.schema==='wayricad.quick-si/v1'&&(raw.path||raw.eye))||(raw.quick_therm&&(raw.board_thermal_view||raw.thermal_network))||(library&&raw.result));
}
export function parseWayriCADResults(input,{path='wayricad-results.json'}={}){
  if(typeof path!=='string'||path.length>4096||!path.toLowerCase().endsWith('.json'))throw new TypeError('Choose a JSON result path.');
  const raw=cloneInput(input);if(!recognized(raw))throw new TypeError('Unsupported WayriCAD result or setup file.');
  // Normalize the already validated copy directly; do not stringify/parse a second full result.
  const report=data.parseJSONValue(raw,path);
  const sourceBindings=spatial.sourceBindings(raw);
  const metadata={portable:raw.pocket_kivi_export??null,library:raw.wayricad_saved_result??null,libraryIntegrity:'unverified'};
  return freeze({raw,report,sourceBindings,path,metadata});
}
export function classifyWayriCADSource(model,pcbSha256){
  if(!sha(pcbSha256)||!model?.sourceBindings?.length||model.metadata?.library||
    (model.metadata?.portable&&model.metadata.portable.source_state!=='saved'))return 'unverified';
  const hashes=new Set(model.sourceBindings.map(binding=>binding.sha256));if(hashes.size!==1)return 'unverified';
  return hashes.has(pcbSha256.toLowerCase())?'matching':'stale';
}
export const wayriCADFrame=(plot,index)=>data.frameValues(plot,index);
export const probeWayriCADPlot=(plot,x,y,seriesName)=>data.probe(plot,x,y,seriesName);
export const wayriCADPointHistory=(plot,x,y)=>spatial.pointHistory(plot,x,y);
const completeAxis=axis=>Array.isArray(axis)&&axis.length>=2&&axis.every((v,i)=>typeof v==='number'&&Number.isFinite(v)&&(!i||(axis[1]>axis[0]?v>axis[i-1]:v<axis[i-1])));
export const wayriCADSurface=plot=>plot?.type==='heatmap'&&(!completeAxis(plot.x)||!completeAxis(plot.y))?null:spatial.toSurface(plot);
