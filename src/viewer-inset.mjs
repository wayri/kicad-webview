/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import {linkSelection} from './linked-viewers.mjs';
const owners = new WeakMap();
const loaded = viewer => viewer && !viewer.disposed && ['pcb','schematic'].includes(viewer.kind) && typeof viewer.source === 'string' && viewer.source.length;

/** Two bounded, explicitly supplied loaded-source previews per parent. No repository discovery. */
export class ViewerInset extends EventTarget {
  constructor(target, {parent, sourceViewer = parent, view, selection} = {}) {
    super();
    if (!loaded(parent) || !loaded(sourceViewer)) throw new TypeError('Insets require active, loaded KiCad viewers.');
    const host = typeof target === 'string' ? parent.host.ownerDocument.querySelector(target) : target;
    if (!host?.ownerDocument || !host.append) throw new TypeError('Choose an inset container.');
    const selectedView = view || sourceViewer.kind;
    if (!['pcb','schematic','3d'].includes(selectedView) || sourceViewer.kind === 'schematic' && selectedView !== 'schematic' || sourceViewer.kind === 'pcb' && selectedView === 'schematic') throw new TypeError('Inset view must match its loaded drawing.');
    const slots = owners.get(parent) || new Set();
    if (slots.size >= 2) throw new Error('Close an inset before opening another (maximum two per parent).');
    this.parent = parent; this.sourceViewer = sourceViewer; this.disposed = false; this.stops = []; this.slots = slots;
    slots.add(this); owners.set(parent, slots);
    const doc = host.ownerDocument, make = (tag,text) => { const n=doc.createElement(tag); if(text!==undefined)n.textContent=text; return n; };
    this.root=make('section'); this.root.className='viewer-context-inset'; this.root.setAttribute('aria-label','Contextual design preview');
    this.root.style.cssText='display:flex;flex-direction:column;min-width:0;height:100%;min-height:0;overflow:hidden;border:1px solid var(--viewer-border,#40566a);border-radius:8px;background:var(--viewer-bar,#182330);color:var(--viewer-ink,#e1eaf3)';
    const header=make('header'); header.style.cssText='display:flex;align-items:center;gap:4px;padding:2px 5px;height:34px;min-height:34px;flex:0 0 auto;font:12px/1 system-ui';
    const title=make('strong',sourceViewer.path.split('/').at(-1)||'Design preview');title.style.cssText='flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const button=(label,path,fn)=>{const b=make('button'),icon=make('span');b.type='button';b.title=label;b.setAttribute('aria-label',label);icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/></svg>';b.append(icon);b.style.cssText='appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;flex:0 0 30px;width:30px;height:30px;margin:0;padding:0;background:transparent;color:inherit;border:1px solid var(--viewer-border,#40566a);border-radius:5px;font:600 12px/1 system-ui;cursor:pointer';b.onclick=fn;return b;};
    this.closeButton=button('Close','M5 5l14 14M19 5 5 19',()=>this.dispose()); this.fitButton=button('Fit selection','M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8z',()=>this.focus()); header.append(title,this.fitButton,this.closeButton);
    this.mount=make('div');this.mount.style.cssText='flex:1;min-height:0;position:relative';this.root.append(header,this.mount);host.append(this.root);
    const snapshots=[...new Set([parent,sourceViewer])].map(v=>({viewer:v,source:v.source,path:v.path}));
    const listen=(v,type,fn)=>{v.addEventListener(type,fn);this.stops.push(()=>v.removeEventListener(type,fn));};
    for(const item of snapshots){listen(item.viewer,'dispose',()=>this.dispose());listen(item.viewer,'ready',()=>{if(item.viewer.source!==item.source||item.viewer.path!==item.path)this.dispose();});}
    this.ready=this.initialize(selectedView, selection).catch(error=>{this.dispose();throw error;});
  }
  async initialize(view, selection) {
    const {KiCadViewer}=await import('./kicad-viewer.mjs');
    if(this.disposed)return false;
    const source=this.sourceViewer;
    this.viewer=new KiCadViewer(this.mount,{theme:this.parent.theme,inspectOnSelect:false,highlightStyle:source.getHighlightStyle().mode,highlightColor:source.getHighlightStyle().color,...source.modelOptions});
    this.viewer.root.setAttribute('data-inset','true');
    const theme = event => { if (!this.disposed) this.viewer.setTheme(event.detail.theme); };
    const highlight = event => { if (!this.disposed) this.viewer.setHighlightStyle(event.detail.mode, {color:event.detail.color}); };
    this.parent.addEventListener('themechange', theme);
    this.parent.addEventListener('highlightstylechange', highlight);
    const parent = this.parent;
    this.stops.push(() => parent.removeEventListener('themechange', theme), () => parent.removeEventListener('highlightstylechange', highlight));
    const sourceBytes=source.source, path=source.path;
    await this.viewer.loadSource(sourceBytes,{path,view,textVariables:source.textVariables,project:source.project,instancePath:source.textInstancePath});
    if(this.disposed)return false;
    if(source.disposed||source.source!==sourceBytes||source.path!==path){this.dispose();return false;}
    const peers=[...new Set([this.parent,source,this.viewer])];let guard=false;
    for(const from of peers){const fn=event=>{
      if(guard||this.disposed||!event.detail||event.detail.path!==undefined&&event.detail.path!==from.path||event.detail.view!==undefined&&event.detail.view!==from.view)return;
      guard=true;
      // Existing linkViewers groups can synchronously re-enter an earlier peer.
      // Keep the whole inset transaction quiet, then restore each peer's policy.
      const inspection=peers.filter(peer=>!peer.disposed).map(peer=>[peer,peer.inspectOnSelect]);
      for(const [peer]of inspection)peer.inspectOnSelect=false;
      try{for(const to of peers)if(to!==from&&!to.disposed)linkSelection(from,to,from.getSelection()||event.detail.item);if(from!==this.viewer)this.focus();}finally{for(const [peer,inspect]of inspection)peer.inspectOnSelect=inspect;guard=false;}
    };from.addEventListener('select',fn);this.stops.push(()=>from.removeEventListener('select',fn));}
    // Initialization is local to the preview: never echo a stale snapshot into peers.
    const initial = selection === undefined ? this.parent.getSelection() : selection;
    guard=true;
    try { linkSelection(this.parent,this.viewer,initial); if(initial)this.focus(); }
    finally { guard=false; }
    return true;
  }
  focus(){if(this.disposed||!this.viewer||!this.viewer.source)return false;const v=this.viewer,s=v.getSelection();if(!s){v.fit();return true;}if(s.kind==='net')return v.selectNet(s.id||s.netName,{locate:true});if(s.kind==='part')return v.selectPart(s.uuid||s.id,{locate:true});return v.selectObject(s.uuid||s.id,{locate:true,pinNumber:s.pinNumber});}
  dispose(){if(this.disposed)return;this.disposed=true;for(const stop of this.stops)stop();this.stops.length=0;this.viewer?.dispose();this.closeButton.onclick=this.fitButton.onclick=null;this.root.remove();this.slots.delete(this);this.parent=this.sourceViewer=null;this.dispatchEvent(new CustomEvent('dispose'));}
}
