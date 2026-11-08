/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {createStandaloneHTML} from './standalone-html.mjs';
const form=document.querySelector('form'),status=document.querySelector('#status');let assetPromise;
const get=async path=>{const response=await fetch(new URL(path,import.meta.url),{credentials:'omit'});if(!response.ok)throw Error('Cannot load distribution asset: '+path);return response.text();};
form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;
 try{const selected=[...document.querySelector('#files').files];if(!selected.length)throw Error('Choose a design.');if(selected.reduce((n,f)=>n+f.size,0)>64*1024*1024)throw Error('Choose files totalling at most 64 MiB.');status.textContent='Preparing the local HTML download…';
  assetPromise||=Promise.all(['kicad-webview.min.js','LICENSE','LICENSING.md','THIRD-PARTY-NOTICES.md','THREE-LICENSE','FZSTD-LICENSE','SPIKE-ENGINE-NOTICE.md','licenses/Pocket-KiView-Source-Available-1.0.txt'].map(get)).catch(error=>{assetPromise=null;throw error;});
  const [viewerScript,...notices]=await assetPromise,files=await Promise.all(selected.map(async file=>({path:file.webkitRelativePath||file.name,bytes:new Uint8Array(await file.arrayBuffer())})));
  const html=createStandaloneHTML({viewerScript,licenseText:notices.join('\n\n'),files,title:document.querySelector('#title').value,view:document.querySelector('#view').value||undefined});
  const url=URL.createObjectURL(new Blob([html],{type:'text/html'})),link=document.createElement('a');link.href=url;link.download='interactive-design.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent='HTML downloaded. Open it locally, review it, then share or embed it.';
 }catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
