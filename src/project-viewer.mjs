/* Copyright (c) 2026 wayri. SPDX-License-Identifier: MPL-2.0 */
import { KiCadViewer } from './kicad-viewer.mjs';
import { viewerOwners } from './viewer-host.mjs';
import {linkedPart,linkSelection} from './linked-viewers.mjs';
import {captureViewState,restoreViewState as restoreViews,createViewLink,validateViewState} from './view-state.mjs';
export {linkedPart} from './linked-viewers.mjs';
import {ProjectSheetBrowser,isSheetBrowserCommand} from './project-sheet-browser.mjs';
import { isDrawingPath } from './source-types.mjs';

const LIMIT = 100;
const STYLE = `
:host{display:block;height:100%;font:12px/1.45 system-ui;color:#e1eaf3;--project-bar:#182330;--project-bg:#111a24;--project-line:#324254;--project-muted:#99aabd;--project-accent:#77d4df;--project-active:#23434d;--project-ink:#e1eaf3;color-scheme:dark}
:host([data-theme=light]){color:#253445;--project-bar:#fff;--project-bg:#f4f7fa;--project-line:#dbe3eb;--project-muted:#657588;--project-accent:#176b83;--project-active:#e6f3f5;--project-ink:#253445;color-scheme:light}
*{box-sizing:border-box}[hidden]{display:none!important}
select{color-scheme:dark}:host([data-theme=light]) select{color-scheme:light}select option{background:var(--project-bar);color:var(--project-ink)}button,input,select{font:inherit;color:inherit}button,select{border:1px solid var(--project-line);border-radius:6px;background:var(--project-bg);padding:6px 8px}button{cursor:pointer}button:hover{background:var(--project-active)}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--project-accent);outline-offset:2px}
.project-shell{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--project-bg)}.project-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px;border-bottom:1px solid var(--project-line);background:var(--project-bar)}.project-brand{font-weight:750;letter-spacing:.03em;margin-right:auto}.project-toolbar label{display:flex;align-items:center;gap:5px}.project-toolbar button[aria-pressed=true]{background:var(--project-active);color:var(--project-accent)}
.project-body{position:relative;display:flex;flex:1;min-height:0}.project-nav{width:236px;flex:none;border-right:1px solid var(--project-line);background:var(--project-bar);display:flex;flex-direction:column;min-height:0}.project-tabs{display:flex;padding:6px;gap:4px;border-bottom:1px solid var(--project-line)}.project-tabs button{flex:1;padding:6px 4px}.project-tabs button[aria-selected=true]{background:var(--project-active);color:var(--project-accent)}.project-search{width:calc(100% - 16px);margin:8px;padding:8px;border:1px solid var(--project-line);border-radius:6px;background:var(--project-bg)}.project-count,.project-help{font-size:10px;color:var(--project-muted);padding:0 8px;margin:0 0 8px}.project-list{overflow:auto;min-height:0;flex:1;padding:0 7px 9px}.project-list button{display:block;text-align:left;width:100%;margin-bottom:4px;overflow-wrap:anywhere}.project-list small{display:block;font-size:10px;color:var(--project-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-list button[aria-current=true]{border-color:var(--project-accent);background:var(--project-active)}.project-list details{margin:3px 0 3px 5px}.project-list summary{color:var(--project-muted);padding:4px;cursor:pointer;overflow-wrap:anywhere}.project-list details>div{border-left:1px solid var(--project-line);padding-left:6px}
.project-layer{padding:7px;border:1px solid var(--project-line);border-radius:6px;margin-bottom:5px}.project-layer label{display:flex;align-items:center;gap:6px;overflow-wrap:anywhere}.project-layer input{flex:none}.project-layer button{margin:5px 0 0;padding:4px 6px}.project-layer small{margin-top:3px}
.project-panes{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);flex:1;min-width:0;min-height:0;gap:1px;background:var(--project-line)}.project-panes[data-layout=single]{grid-template-columns:minmax(0,1fr)}.project-pane{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--project-bg);border-top:2px solid transparent}.project-pane[data-active=true]{border-top-color:var(--project-accent)}.project-pane-heading{display:flex;align-items:center;gap:6px;padding:5px 7px;background:var(--project-bar);font-size:10px;color:var(--project-muted)}.project-pane-heading button{padding:3px 6px;white-space:nowrap}.project-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-mount{flex:1;min-height:0;min-width:0}.project-empty{padding:20px;color:var(--project-muted)}.project-status{padding:5px 9px;border-top:1px solid var(--project-line);font-size:10px;color:var(--project-muted);overflow-wrap:anywhere}.project-status[data-error=true]{color:#efb3a8}
.project-sheet-browser{position:absolute;z-index:30;top:8px;right:8px;width:min(470px,calc(100% - 16px));height:min(620px,calc(100% - 16px));min-height:180px;display:flex;flex-direction:column;background:var(--project-bar);border:1px solid var(--project-line);border-radius:8px;box-shadow:0 12px 36px #0006;overflow:hidden}.project-sheet-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px;cursor:move;touch-action:none}.project-sheet-heading strong{pointer-events:none}.project-sheet-mount{flex:1;min-height:0}
@container (max-width:850px){.project-panes{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)}.project-panes[data-layout=single]{grid-template-rows:minmax(0,1fr)}.project-nav{width:200px}.project-toolbar{gap:5px}.project-brand{font-size:11px}}
@container (max-width:580px){.project-body{position:relative}.project-nav{position:absolute;inset:0 auto 0 0;width:min(270px,calc(100% - 28px));z-index:20;box-shadow:8px 0 28px #0005}.project-toolbar{padding:6px}.project-brand{flex:1 0 100%}.project-toolbar label{font-size:10px}.project-toolbar button,.project-toolbar select{padding:5px}.project-status{max-height:56px;overflow:auto}}
`;

/** Read-only project navigation around independent instances of the same library. */
export class AdvancedKiCadViewer extends EventTarget {
  constructor(target, { theme = 'dark', layout = 'split', linkedSelection = true, ...viewerOptions } = {}) {
    super();
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host?.ownerDocument || !host.append) throw new TypeError('Choose an advanced viewer container.');
    if (viewerOwners.has(host)) throw new Error('This container already has a viewer.');
    if (!['split', 'single'].includes(layout)) throw new TypeError('Choose split or single layout.');
    if (!['dark', 'light'].includes(theme)) throw new TypeError('Choose light or dark theme.');
    this.host = host; this.doc = host.ownerDocument; this.disposed = false; this.ticket = 0; this.activePane = 0; this.restoreTicket = 0;
    this.layout = layout; this.linkedSelection = Boolean(linkedSelection); this.theme = theme; this.files = []; this.source = null; this.tab = 'files'; this.linkGuard = false; this.listeners = []; this.layerControlStops = [];
    const make = (tag, className, value) => { const node = this.doc.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; };
    this.make = make;
    this.root = make('div'); this.root.style.cssText = 'height:100%;min-height:0;container-type:inline-size'; this.root.setAttribute('data-theme', theme);
    this.surface = this.root.attachShadow ? this.root.attachShadow({ mode: 'open' }) : this.root;
    const style = make('style', '', STYLE), shell = make('div', 'project-shell');
    this.toolbar = make('div', 'project-toolbar'); this.toolbar.setAttribute('role', 'toolbar'); this.toolbar.setAttribute('aria-label', 'Project viewer controls');
    this.navButton = this.button('Project navigator', () => this.setNavigatorOpen(this.nav.hidden));
    const brand = make('span', 'project-brand', 'KiCad WebView · Project');
    this.paneSelect = make('select'); this.paneSelect.setAttribute('aria-label', 'Active project pane');
    for (let i=0;i<2;i++) { const option=make('option','','Pane '+(i+1));option.value=String(i);this.paneSelect.append(option); }
    this.paneSelect.onchange = () => this.setActivePane(Number(this.paneSelect.value));
    this.layoutButton = this.button('Use single pane', () => this.setLayout(this.layout === 'split' ? 'single' : 'split'));
    const linked = make('label'); this.linkToggle = make('input'); this.linkToggle.type='checkbox';this.linkToggle.checked=this.linkedSelection;this.linkToggle.setAttribute('aria-label','Link saved selection');this.linkToggle.onchange=()=>{this.linkedSelection=this.linkToggle.checked;};linked.append(this.linkToggle,make('span','','Link selection'));
    this.themeButton = this.button('Switch project theme', () => this.setTheme(this.theme === 'dark' ? 'light' : 'dark'));
    this.shareButton=this.button('Create view link',async()=>{const url=await this.createViewLink(this.doc.baseURI);if(this.disposed)return;this.viewLinkInput.value=url;this.viewLinkInput.hidden=false;this.viewLinkInput.focus?.();this.viewLinkInput.select?.();this.setStatus('View link ready · copy the selected URL. It restores the same saved project revision.');});
    this.viewLinkInput=make('input');this.viewLinkInput.type='url';this.viewLinkInput.readOnly=true;this.viewLinkInput.hidden=true;this.viewLinkInput.setAttribute('aria-label','Shareable project view link');this.viewLinkInput.style.cssText='flex:1 1 100%;min-width:0;max-width:100%;padding:7px;border:1px solid var(--project-line);border-radius:6px;background:var(--project-bg)';
    this.sheetButton=this.button('Show sheet browser',()=>this.openSheetBrowser());this.sheetButton.setAttribute('aria-expanded','false');
    this.toolbar.append(this.sheetButton,brand,this.navButton,this.paneSelect,this.layoutButton,linked,this.themeButton,this.shareButton,this.viewLinkInput);
    const body=make('div','project-body');this.nav=make('aside','project-nav');this.nav.setAttribute('aria-label','Project navigator');
    const tabs=make('div','project-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Project sections');this.tabButtons={};
    for(const name of ['files','parts','nets','layers']){const node=this.button(name[0].toUpperCase()+name.slice(1),()=>this.setTab(name));node.setAttribute('role','tab');this.tabButtons[name]=node;tabs.append(node);}
    this.search=make('input','project-search');this.search.type='search';this.search.setAttribute('aria-label','Search project files');this.search.placeholder='Search files';this.search.oninput=()=>this.renderList();
    this.count=make('p','project-count');this.count.setAttribute('role','status');this.list=make('div','project-list');
    const help=make('p','project-help','Read only. Part links use saved symbol UUIDs in the two loaded panes. Nets link between identical saved drawings; local names are not linked across sheets.');
    this.nav.append(tabs,this.search,this.count,this.list,help);
    this.panes=make('div','project-panes');this.panes.setAttribute('data-layout',layout);this.paneNodes=[];this.viewers=[];
    try {
      for(let i=0;i<2;i++){
        const pane=make('section','project-pane'),heading=make('div','project-pane-heading'),activate=this.button('Activate pane '+(i+1),()=>this.setActivePane(i)),path=make('span','project-path','No drawing loaded'),mount=make('div','project-mount');
        pane.setAttribute('aria-label','Project pane '+(i+1));heading.append(activate,path);pane.append(heading,mount);this.panes.append(pane);
        const viewer=new KiCadViewer(mount,{...viewerOptions,theme});this.viewers.push(viewer);this.paneNodes.push({pane,path,mount});
        this.listen(pane,'pointerdown',()=>this.setActivePane(i));this.listen(pane,'focusin',()=>this.setActivePane(i));
        this.listen(viewer,'ready',event=>{path.textContent=viewer.path||'Drawing';path.title=path.textContent;this.refresh();this.emit('ready',{pane:i,...event.detail});});
        this.listen(viewer,'select',event=>{this.refresh();this.emit('select',{pane:i,...event.detail});this.crossProbe(i,event.detail.item);});
        this.listen(viewer,'layerschange',()=>{if(i===this.activePane&&this.tab==='layers')this.renderList();});
        this.listen(viewer,'error',event=>{this.setStatus(event.detail?.message||'Drawing failed.',true);this.emit('error',{pane:i,error:event.detail});});
      }
      this.status=make('div','project-status','Load a project manifest, repository link or local bundle.');this.status.setAttribute('role','status');
      body.append(this.nav,this.panes);this.sheetBrowser=new ProjectSheetBrowser(this,body);shell.append(this.toolbar,body,this.status);this.surface.append(style,shell);host.append(this.root);viewerOwners.set(host,this);
      this.setActivePane(0);this.setLayout(layout);this.setTheme(theme);this.setTab('files');
    } catch(error) { this.viewers.forEach(viewer=>viewer.dispose());this.root.remove();throw error; }
  }
  assertActive(){if(this.disposed)throw new Error('Advanced viewer has been disposed.');}
  emit(name,detail){this.dispatchEvent(new CustomEvent(name,{detail}));}
  button(label,action){const node=this.make('button','',label);node.type='button';node.setAttribute('aria-label',label);node.onclick=()=>{try{const value=action();value?.catch?.(error=>{if(!this.disposed)this.setStatus(error.message,true);});}catch(error){this.setStatus(error.message,true);}};return node;}
  listen(target,name,callback){target.addEventListener?.(name,callback);this.listeners.push(()=>target.removeEventListener?.(name,callback));}
  setStatus(text,error=false){if(this.status){this.status.textContent=text;this.status.setAttribute('data-error',String(error));}}
  getActiveViewer(){this.assertActive();return this.viewers[this.activePane];}
  setActivePane(index){this.assertActive();if(!Number.isInteger(index)||index<0||index>1)throw new TypeError('Choose pane 0 or 1.');this.activePane=index;this.paneSelect.value=String(index);for(let i=0;i<2;i++){this.paneNodes[i].pane.setAttribute('data-active',String(i===index));this.paneNodes[i].pane.hidden=this.layout==='single'&&i!==index;}this.refresh();this.emit('panechange',{pane:index});}
  setLayout(layout){this.assertActive();if(!['split','single'].includes(layout))throw new TypeError('Choose split or single layout.');this.layout=layout;this.panes.setAttribute('data-layout',layout);this.layoutButton.textContent=layout==='split'?'Single pane':'Split panes';this.layoutButton.setAttribute('aria-label',layout==='split'?'Use single pane':'Use split panes');this.layoutButton.setAttribute('aria-pressed',String(layout==='split'));this.setActivePane(this.activePane);}
  setTheme(theme){this.assertActive();if(!['dark','light'].includes(theme))throw new TypeError('Choose light or dark theme.');this.theme=theme;this.root.setAttribute('data-theme',theme);this.viewers.forEach(viewer=>viewer.setTheme(theme));this.sheetBrowser?.setTheme(theme);this.themeButton.textContent=theme==='dark'?'Light':'Dark';}
  openSheetBrowser(){this.assertActive();return this.sheetBrowser.open();}
  closeSheetBrowser(){this.assertActive();this.sheetBrowser.close();}
  setNavigatorOpen(open){this.assertActive();this.nav.hidden=!open;this.navButton.setAttribute('aria-expanded',String(Boolean(open)));}
  setTab(tab){this.assertActive();if(!['files','parts','nets','layers'].includes(tab))throw new TypeError('Choose Files, Parts, Nets or Layers.');this.tab=tab;this.search.value='';this.search.placeholder='Search '+tab;this.search.setAttribute('aria-label','Search project '+tab);for(const [name,node]of Object.entries(this.tabButtons))node.setAttribute('aria-selected',String(name===tab));this.renderList();}
  refresh(){if(this.disposed||!this.viewers.length)return;if(this.shareButton)this.shareButton.disabled=!this.projectReady;if(this.sheetButton)this.sheetButton.disabled=!this.projectReady;const project=this.viewers[0].project;const files=project?.files||this.source?.files;this.files=files?[...files]:this.viewers[0].path?[{path:this.viewers[0].path}]:[];this.renderList();}
  renderList(){
    if(!this.list||!this.viewers.length||this.disposed)return;this.clearLayerControls();const viewer=this.viewers[this.activePane],query=(this.search.value||'').trim().toLowerCase().slice(0,200);this.list.replaceChildren();
    if(isSheetBrowserCommand(query)){const command=this.button('Show sheet browser',()=>this.openSheetBrowser());command.disabled=!this.projectReady;this.list.append(command);this.count.textContent='Sheet browser command';return;}
    if(this.tab==='layers'){this.renderLayers(viewer,query);
    }else if(this.tab==='files'){
      const files=this.files.slice(0,256).filter(file=>file.path&&file.path.toLowerCase().includes(query));this.count.textContent=files.length+' files · opens in pane '+(this.activePane+1);
      const sheets=(viewer.getSheets?.()||[]).slice(0,256).filter(sheet=>[sheet.name,sheet.file].join(' ').toLowerCase().includes(query));
      if(sheets.length){const heading=this.make('p','project-help','Child sheets · saved links');this.list.append(heading);for(const sheet of sheets){const node=this.button(sheet.name||sheet.file||'Child sheet',()=>this.openFile(sheet.path));node.append(this.make('small','',sheet.file||'Missing Sheetfile'));node.disabled=!sheet.path||!this.files.some(file=>file.path===sheet.path);node.title=node.disabled?'Referenced drawing is absent from the loaded project.':sheet.path;this.list.append(node);}this.list.append(this.make('p','project-help','All project files'));}
      const folders=new Map([['',this.list]]);
      for(const file of [...files].sort((a,b)=>a.path.localeCompare(b.path))){const bits=file.path.split('/');let parent='',container=this.list;for(const bit of bits.slice(0,-1)){const key=parent?parent+'/'+bit:bit;if(!folders.has(key)){const details=this.make('details'),summary=this.make('summary','',bit),content=this.make('div');details.open=true;details.append(summary,content);container.append(details);folders.set(key,content);}container=folders.get(key);parent=key;}
        const node=this.button(bits.at(-1),()=>this.openFile(file.path));node.title=file.path;node.setAttribute('aria-label','Open '+file.path);node.setAttribute('aria-current',String(viewer.path===file.path));node.disabled=!isDrawingPath(file.path)||/\.zip$/i.test(file.path);container.append(node);
      }
    }else if(this.tab==='parts'){
      const parts=viewer.getParts().filter(part=>[part.reference,part.value,part.footprint].join('\n').toLowerCase().includes(query));this.count.textContent=parts.length+' parts'+(parts.length>LIMIT?' · first 100':'');
      for(const part of parts.slice(0,LIMIT)){const node=this.button(part.reference||part.uuid||'Unreferenced part',()=>viewer.selectPart(part.id,{locate:true}));node.append(this.make('small','',[part.value,part.footprint].filter(Boolean).join(' · ')));this.list.append(node);}
    }else{
      const nets=(viewer.getNets?.()||[]).filter(net=>net.name.toLowerCase().includes(query));this.count.textContent=nets.length+' saved nets'+(nets.length>LIMIT?' · first 100':'');
      for(const net of nets.slice(0,LIMIT)){const node=this.button(net.name,()=>viewer.selectNet(net.id||net.name,{locate:false}));if(net.count!==undefined)node.append(this.make('small','',net.count+' objects'));this.list.append(node);}
    }
  }
  clearLayerControls(){for(const stop of this.layerControlStops)stop();this.layerControlStops=[];}
  renderLayers(viewer,query){
    const state=viewer.getLayerState(),layers=state.layers.filter(layer=>layer.toLowerCase().includes(query)),visible=new Set(state.visible);
    const button=(label,action)=>{const node=this.button(label,action);this.layerControlStops.push(()=>{node.onclick=null;});return node;};
    const open=button('Open layer controls',()=>{const menu=viewer.chrome?.layersMenu;if(menu&&!menu.hidden){menu.open=true;menu.querySelector?.('summary')?.focus?.();}});
    open.disabled=!state.layers.length||!viewer.chrome?.layersMenu||viewer.chrome.layersMenu.hidden;this.list.append(open);
    this.count.textContent=layers.length+' layers · '+visible.size+' visible · pane '+(this.activePane+1);
    if(!state.layers.length){this.list.append(this.make('p','project-help',viewer.view==='schematic'?'Layer controls are available for PCB and manufacturing views.':'Load a PCB or manufacturing drawing to inspect saved layers.'));return;}
    for(const layer of layers){
      const row=this.make('div','project-layer'),label=this.make('label'),input=this.make('input'),status=this.make('small','',visible.has(layer)?'Visible':'Hidden');input.type='checkbox';input.checked=visible.has(layer);input.setAttribute('aria-label','Show '+layer);
      input.onchange=()=>{const current=viewer.getLayerState(),enabled=new Set(current.visible);if(input.checked)enabled.add(layer);else enabled.delete(layer);viewer.setLayers(current.layers.filter(name=>enabled.has(name)));};this.layerControlStops.push(()=>{input.onchange=null;});
      label.append(input,this.make('span','',layer));row.append(label,status);
      if(viewer.view==='pcb'&&state.canFocus){const focus=button('Focus',()=>viewer.focusLayer(layer));focus.setAttribute('aria-label','Focus '+layer);focus.setAttribute('aria-pressed',String(state.focused===layer));if(state.focused===layer)status.textContent+=' · Focused';row.append(focus);}
      this.list.append(row);
    }
  }
  async load(input,options={}){return this.loadWith('load',input,options);}
  async loadFiles(input,options={}){return this.loadWith('loadFiles',input,options);}
  async loadArchive(input,options={}){return this.loadWith('loadArchive',input,options);}
  async loadWith(method,input,options){
    this.assertActive();this.restorePending?.abort();++this.restoreTicket;this.restoring=false;this.restorePending=null;const ticket=++this.ticket;this.loading=true;this.projectReady=false;this.sheetBrowser?.reset();this.pending?.abort();this.panePending?.forEach(c=>c?.abort());this.pending=new AbortController();const controller=this.pending;
    const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();this.setStatus('Loading saved project…');
    try{
      const ok=await this.viewers[0][method](input,{...options,signal:controller.signal});if(!ok||this.disposed||ticket!==this.ticket)return false;
      const first=this.viewers[0];this.source=first.project?{...first.project,files:first.project.files}:null;this.files=first.project?.files||[{path:first.path}];
      const other=this.files.find(file=>first.kind==='pcb'?/\.kicad_sch$/i.test(file.path):/\.kicad_pcb$/i.test(file.path))||this.files.find(file=>file.path!==first.path&&isDrawingPath(file.path));
      if(other){await this.loadPaneFromProject(1,other.path,{signal:controller.signal});}
      else if(first.kind==='manufacturing'&&!first.project){await this.viewers[1][method](input,{...options,signal:controller.signal});}
      else{await this.loadPaneFromProject(1,first.path,{signal:controller.signal});}
      if(this.disposed||ticket!==this.ticket)return false;this.projectReady=true;this.setActivePane(0);this.refresh();this.setStatus('Project loaded · independent cameras · read-only · no comments.');this.emit('projectready',{files:this.getFiles()});return true;
    }catch(error){if(this.disposed||ticket!==this.ticket)return false;this.setStatus(error.message,true);throw error;}
    finally{options.signal?.removeEventListener('abort',abort);if(ticket===this.ticket)this.loading=false;}
  }
  async loadPaneFromProject(index,path,options={}){
    const viewer=this.viewers[index],project=this.source;
    if(project?.memory)return viewer.loadFiles(project.files,{...options,file:path});
    if(project?.files)return viewer.load({files:project.files,entry:path},{...options,credentials:this.viewers[0].credentials});
    if(path===this.viewers[0].path)return viewer.loadSource(this.viewers[0].source,{...options,path});
    throw new Error('Choose a drawing from the loaded project.');
  }
  async openFile(path,{pane=this.activePane,signal}={}){
    this.assertActive();this.restorePending?.abort();++this.restoreTicket;this.restoring=false;this.restorePending=null;if(!Number.isInteger(pane)||pane<0||pane>1)throw new TypeError('Choose pane 0 or 1.');if(!this.files.some(file=>file.path===path)||!isDrawingPath(path)||/\.zip$/i.test(path))throw new Error('Choose a drawing from the loaded project.');
    const ticket=this.ticket;this.panePending||=[];this.panePending[pane]?.abort();const controller=new AbortController();this.panePending[pane]=controller;const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    try{const ok=await this.loadPaneFromProject(pane,path,{signal:controller.signal});if(!ok||this.disposed||ticket!==this.ticket||this.panePending[pane]!==controller)return false;this.setActivePane(pane);this.refresh();this.setStatus('Opened '+path+' in pane '+(pane+1)+'.');return true;}finally{signal?.removeEventListener('abort',abort);}
  }
  getFiles(){this.assertActive();return this.files.map(({path,url})=>({path,...(url?{url}:{})}));}
  crossProbe(index,item){
    if(this.disposed||this.loading||this.restoring||!this.projectReady||this.linkGuard||!this.linkedSelection)return;
    const source=this.viewers[index],target=this.viewers[1-index];if(!source.source||!target.source)return;
    this.linkGuard=true;try{const kind=linkSelection(source,target,item===null?null:source.getSelection?.()||item);if(kind)this.setStatus('Linked saved '+kind+' selection in pane '+(2-index)+' · cameras stay independent.');}finally{this.linkGuard=false;}
  }
  getViewState(){this.assertActive();if(!this.projectReady)throw new Error('Load the project before creating a view link.');return captureViewState(this.viewers,{theme:this.theme,layout:this.layout,activePane:this.activePane,linkedSelection:this.linkedSelection});}
  async createViewLink(baseURL=this.doc.baseURI){const state=await this.getViewState();this.assertActive();return createViewLink(baseURL,state);}
  async restoreViewState(input,{signal}={}){
    this.assertActive();if(!this.projectReady)throw new Error('Load the project before restoring its view link.');
    const state=validateViewState(input);if(state.views.length!==2)throw new Error('A project view link needs two panes.');
    for(const view of state.views)if(!this.files.some(file=>file.path===view.path))throw new Error('View link refers to a drawing outside the loaded project.');
    this.restorePending?.abort();const controller=new AbortController();this.restorePending=controller;const ticket=this.restoreTicket=(this.restoreTicket||0)+1,projectTicket=this.ticket;
    const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    const current=()=>!this.disposed&&ticket===this.restoreTicket&&projectTicket===this.ticket&&this.projectReady;
    this.restoring=true;
    const check=()=>{if(controller.signal.aborted)throw new DOMException('View restoration was aborted.','AbortError');return current();};
    try{const ok=await restoreViews(this.viewers,state,{signal:controller.signal,current,openFile:(pane,path,signal)=>this.loadPaneFromProject(pane,path,{signal})});if(!ok||!check())return false;
      if(state.theme){this.setTheme(state.theme);if(!check())return false;}if(state.layout){this.setLayout(state.layout);if(!check())return false;}if(state.activePane!==undefined){this.setActivePane(state.activePane);if(!check())return false;}if(state.linkedSelection!==undefined){this.linkedSelection=state.linkedSelection;this.linkToggle.checked=this.linkedSelection;}
      this.setStatus('Restored linked project view · saved source hashes verified.');return true;
    }catch(error){if(!current())return false;this.setStatus(error.message,true);throw error;}
    finally{signal?.removeEventListener('abort',abort);if(ticket===this.restoreTicket){this.restoring=false;this.restorePending=null;}}
  }
  dispose(){if(this.disposed)return;this.clearLayerControls();this.disposed=true;++this.ticket;this.restorePending?.abort();this.pending?.abort();this.panePending?.forEach(c=>c?.abort());for(const stop of this.listeners)stop();this.listeners=[];this.sheetBrowser?.dispose();for(const viewer of this.viewers)viewer.dispose();this.search.oninput=this.paneSelect.onchange=this.linkToggle.onchange=null;this.root.remove();viewerOwners.delete(this.host);this.source=null;this.files=[];}
}
export { AdvancedKiCadViewer as ProjectViewer };
