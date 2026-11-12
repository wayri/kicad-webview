/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {ProjectTree} from './project-tree.mjs';
const commands=new Set(['sheet tree','sheet browser','sheet navigator','show sheet tree','open sheet tree','minimap','mini map','sheet map']);
export const isSheetBrowserCommand=query=>commands.has(String(query||'').trim().toLowerCase().replace(/[-_]+/g,' ').replace(/\s+/g,' '));
/** Read-only floating hierarchy. Fetches only the current project's listed files. */
export class ProjectSheetBrowser {
 constructor(project,body){
  this.project=project;this.doc=project.doc;this.ticket=0;this.loadedSource=null;this.opened=false;
  const m=(tag,text)=>{const n=this.doc.createElement(tag);if(text)n.textContent=text;return n;};
  this.root=m('section');this.root.className='project-sheet-browser';this.root.hidden=true;this.root.setAttribute('role','region');this.root.setAttribute('aria-label','Schematic sheet browser');
  this.header=m('div');this.header.className='project-sheet-heading';this.header.append(m('strong','Schematic sheets'));
  this.closeButton=m('button','Close');this.closeButton.type='button';this.closeButton.setAttribute('aria-label','Close sheet browser');this.closeButton.onclick=()=>this.close();this.header.append(this.closeButton);
  this.mount=m('div');this.mount.className='project-sheet-mount';this.root.append(this.header,this.mount);body.append(this.root);
  this.tree=new ProjectTree(this.mount,{theme:project.theme,onSelect:node=>project.openFile(node.path,{pane:this.pane()})});
  this.drag=null;this.down=e=>{if(e.target!==this.header||e.button!==0)return;const box=this.root.getBoundingClientRect(),area=body.getBoundingClientRect();this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:box.left-area.left,top:box.top-area.top};this.header.setPointerCapture?.(e.pointerId);e.preventDefault();};
  this.move=e=>{if(!this.drag||this.drag.id!==e.pointerId)return;const b=body.getBoundingClientRect(),r=this.root.getBoundingClientRect();this.root.style.left=Math.max(0,Math.min(Math.max(0,b.width-r.width),this.drag.left+e.clientX-this.drag.x))+'px';this.root.style.top=Math.max(0,Math.min(Math.max(0,b.height-44),this.drag.top+e.clientY-this.drag.y))+'px';this.root.style.right='auto';};
  this.up=e=>{if(this.drag?.id!==e.pointerId)return;this.header.releasePointerCapture?.(e.pointerId);this.drag=null;};
  if(globalThis.ResizeObserver){this.resize=new ResizeObserver(()=>{this.root.style.left='';this.root.style.right='8px';this.root.style.top='8px';});this.resize.observe(body);}
  this.header.addEventListener('pointerdown',this.down);this.header.addEventListener('pointermove',this.move);this.header.addEventListener('pointerup',this.up);this.header.addEventListener('pointercancel',this.up);
 }
 pane(){const index=this.project.viewers.findIndex(v=>v.kind==='schematic');return index<0?this.project.activePane:index;}
 async open(){
  if(this.project.disposed)return false;if(!this.project.projectReady)throw new Error('Load a project before opening its sheets.');
  const files=this.project.files.filter(f=>/\.kicad_sch$/i.test(f.path));if(!files.length)throw new Error('This project has no listed schematic files.');
  this.opened=true;this.root.hidden=false;this.project.sheetButton?.setAttribute('aria-expanded','true');
  const source=this.project.source||this.project.viewers[0].source;
  if(this.loadedSource===source)return true;
  this.pending?.abort();const pending=new AbortController(),ticket=++this.ticket;this.pending=pending;
  try{
   const input=this.project.source?.memory?this.project.source.files:this.project.source?.files?{files:this.project.source.files,entry:files[0].path}:[{path:this.project.viewers[0].path,source:this.project.viewers[0].source}];
   await this.tree.load(input,{signal:pending.signal,credentials:this.project.viewers[0].credentials||'omit'});
   if(this.project.disposed||ticket!==this.ticket||pending.signal.aborted)return false;
   this.loadedSource=source;return true;
  }catch(error){if(pending.signal.aborted)return false;throw error;}finally{if(this.pending===pending)this.pending=null;}
 }
 close(){this.opened=false;this.root.hidden=true;this.pending?.abort();++this.ticket;this.project.sheetButton?.setAttribute('aria-expanded','false');}
 reset(){this.close();this.loadedSource=null;this.tree.clear();}
 setTheme(theme){this.tree.setTheme(theme);}
 dispose(){this.close();this.resize?.disconnect();this.tree.dispose();for(const [name,fn]of [['pointerdown',this.down],['pointermove',this.move],['pointerup',this.up],['pointercancel',this.up]])this.header.removeEventListener(name,fn);this.closeButton.onclick=null;this.root.remove();this.project=null;}
}
