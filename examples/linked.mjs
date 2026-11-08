/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {Viewer,linkViewers,captureViewState,restoreViewState,createViewLink,parseViewLink} from '../src/index.mjs';
const viewers=['schematic','layout','assembly'].map(id=>new Viewer('#'+id,{theme:'dark'})),status=document.querySelector('#status'),url=document.querySelector('#url');
let links;
try{
 await Promise.all(viewers.map((viewer,i)=>viewer.load('./demo/project.json',i===0?{file:'HBD21094.kicad_sch'}:i===2?{view:'3d'}:{})));
 links=linkViewers(viewers);links.addEventListener('link',e=>status.textContent='Linked '+e.detail.kind+' selection · 3D parts flip into focus.');
 links.addEventListener('linkerror',e=>status.textContent=e.detail.error.message);
 const restore=async()=>{const state=parseViewLink(location.href);if(!state)return;links.setEnabled(false);try{await restoreViewState(viewers,state,{openFile:(i,path,signal)=>viewers[i].openFile(path,{signal})});status.textContent='Restored linked views · exact saved source hashes verified.';}finally{links.setEnabled(true);}};
 await restore();if(!parseViewLink(location.href))status.textContent='Ready · select a part, highlight a board net, or create a view link.';
 document.querySelector('#part').onclick=()=>{const part=viewers[0].getParts().find(p=>p.reference==='U2');if(part)viewers[0].selectPart(part.id);};
 document.querySelector('#net').onclick=()=>{viewers[1].selectNet('/Pa');status.textContent='Phase A links layout and 3D; local net names are not guessed across schematic sheets.';};
 document.querySelector('#clear').onclick=()=>viewers[0].clearSelection();
 document.querySelector('#share').onclick=async()=>{try{url.value=createViewLink(location.href,await captureViewState(viewers,{theme:'dark'}));url.hidden=false;url.focus();url.select();status.textContent='Copy the selected URL to restore these three views.';}catch(error){status.textContent=error.message;}};
 window.addEventListener('hashchange',()=>restore().catch(error=>status.textContent=error.message));
}catch(error){status.textContent=error.message;}
window.addEventListener('pagehide',()=>{links?.dispose();viewers.forEach(viewer=>viewer.dispose());},{once:true});
