/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {ProjectTree,Viewer} from '../src/index.mjs';
const viewer=new Viewer('#preview',{theme:'dark'}),status=document.querySelector('#status'),rootSelect=document.querySelector('#root'),exportButton=document.querySelector('#export');
let source='./demo/project.json',urls=new Set();
const tree=new ProjectTree('#tree',{theme:'dark',onSelect:async node=>{
 status.textContent='Opening '+node.path+'…';
 if(typeof source==='string')await viewer.load(source,{file:node.path});
 else if(source instanceof Uint8Array)await viewer.loadArchive(source,{file:node.path});
 else await viewer.loadFiles(source,{file:node.path});
 status.textContent='Selected '+node.name+' · '+node.path+' · saved sheet instance '+node.id;
}});
tree.addEventListener('error',event=>{status.textContent=event.detail.error.message;});
async function load(input,options={}){
 const ok=await tree.load(input,options);if(!ok)return;source=input;const model=tree.getHierarchy();rootSelect.replaceChildren(...model.files.map(file=>{const option=document.createElement('option');option.value=file.path;option.textContent=file.path;return option;}));rootSelect.value=model.rootPath||'';exportButton.disabled=false;
 status.textContent=model.files.length+' schematic files · '+model.stats.instances+' sheet instances · '+model.rootReason;
 const node=model.roots.find(node=>node.status==='ok');if(node)tree.select(node.id);
}
rootSelect.onchange=()=>load(source,{root:rootSelect.value}).catch(error=>{status.textContent=error.message;});
document.querySelector('#tree-only').onclick=event=>{const active=document.querySelector('#workspace').classList.toggle('tree-only');document.querySelector('#preview-card').hidden=active;event.currentTarget.setAttribute('aria-pressed',String(active));};
document.querySelector('#local').onchange=async event=>{try{const files=Array.from(event.target.files||[]);if(!files.length)return;if(files.length===1&&/\.zip$/i.test(files[0].name)){if(files[0].size>64*1024*1024)throw Error('Choose a ZIP no larger than 64 MiB.');await load(new Uint8Array(await files[0].arrayBuffer()));}else await load(files);}catch(error){status.textContent=error.message;}};
exportButton.onclick=()=>{const url=URL.createObjectURL(new Blob([tree.toSVG()],{type:'image/svg+xml'}));urls.add(url);const link=document.createElement('a');link.href=url;link.download='project-hierarchy.svg';link.click();setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url);},1000);};
window.addEventListener('pagehide',()=>{tree.dispose();viewer.dispose();for(const url of urls)URL.revokeObjectURL(url);urls.clear();},{once:true});
try{await load(source);}catch(error){status.textContent=error.message;}
