/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
const MAX_BYTES=64*1024*1024;
const escapeHTML=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const scriptJSON=value=>JSON.stringify(value).replaceAll('<','\\u003c');
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
/** Build an offline HTML document locally. No design bytes are uploaded. */
export function createStandaloneHTML({viewerScript,licenseText,files,title='Interactive design',view,theme='dark'}={}){
 if(typeof viewerScript!=='string'||!viewerScript.trim()||viewerScript.length>8*1024*1024)throw new TypeError('Supply the full classic viewer script (up to 8 MiB).');
 if(typeof licenseText!=='string'||!licenseText.trim()||licenseText.length>1024*1024)throw new TypeError('Include the viewer license and dependency notices.');
 if(!Array.isArray(files)||!files.length||files.length>256)throw new TypeError('Choose 1 to 256 files, or one project ZIP.');
 if(!['dark','light'].includes(theme)||view!==undefined&&!['pcb','schematic','3d','manufacturing'].includes(view))throw new TypeError('Choose a supported theme and view.');
 const seen=new Set();let total=0;
 const payload=files.map(file=>{const path=file?.path;if(typeof path!=='string'||path.length>1024||!path||path.includes('\\')||path.startsWith('/')||/^[a-z]+:/i.test(path)||path.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(path))throw new TypeError('Choose unique relative project file paths.');seen.add(path);
  if(!(file.bytes instanceof Uint8Array)||!file.bytes.length)throw new TypeError('Each file needs nonempty Uint8Array bytes.');total+=file.bytes.length;if(total>MAX_BYTES)throw new RangeError('HTML export is limited to 64 MiB of input files.');return{path,base64:base64(file.bytes)};});
 const archive=payload.some(file=>/\.zip$/i.test(file.path));if(archive&&payload.length!==1)throw new TypeError('Export a ZIP alone, or choose individual project files.');
 const options={theme,inspectOnSelect:false},loadOptions={...(view?{view}:{})};
 const safeScript=viewerScript.replace(/<\/script/gi,'<\\/script');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; worker-src blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escapeHTML(title)}</title><style>*{box-sizing:border-box}html,body{margin:0;height:100%;font:14px system-ui;background:#111a24;color:#e1eaf3}body{display:flex;flex-direction:column}header{padding:8px 12px;border-bottom:1px solid #324254;display:flex;align-items:center;gap:8px;flex-wrap:wrap}h1{margin:0;flex:1;font-size:15px}button{font:inherit;min-height:44px;background:#182330;color:#e1eaf3;border:1px solid #52748a;border-radius:6px;padding:5px 10px}#viewer{flex:1;min-height:240px}#status{margin:0;padding:4px 12px;font-size:11px}dialog{max-width:min(700px,95vw);max-height:80dvh;background:#182330;color:#e1eaf3;border:1px solid #52748a;overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 monospace}</style></head><body><header><h1>${escapeHTML(title)}</h1><button id="notices">License &amp; source</button></header><div id="viewer" aria-label="Interactive design viewer"></div><p id="status" role="status">Opening bundled design…</p><dialog id="license"><button id="close">Close</button><p>Design files are bundled in this document. No external network access is enabled. Models must be included in the project; unresolved models use labelled proxies.</p><pre>${escapeHTML(licenseText)}</pre></dialog><script>${safeScript}</script><script>
const data=${scriptJSON(payload)};const files=data.map(file=>({path:file.path,bytes:Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0))}));
const viewer=new KiCadWebView.Viewer('#viewer',${scriptJSON(options)});const status=document.querySelector('#status');
document.querySelector('#notices').onclick=()=>document.querySelector('#license').showModal();document.querySelector('#close').onclick=()=>document.querySelector('#license').close();
viewer.addEventListener('error',event=>status.textContent=event.detail?.message||'Unable to load design.');
${archive?'viewer.loadArchive(files[0].bytes,':'viewer.loadFiles(files,'}${scriptJSON(loadOptions)}).then(()=>status.textContent='Read-only · bundled design · no external network access').catch(error=>status.textContent=error.message);
window.addEventListener('pagehide',()=>viewer.dispose(),{once:true});
</script></body></html>`;
}
