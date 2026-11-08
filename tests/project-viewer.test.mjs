import test from 'node:test';
import assert from 'node:assert/strict';
import {AdvancedKiCadViewer,ProjectViewer,linkedPart} from '../src/project-viewer.mjs';
const board='(kicad_pcb (version 20240108) (generator pcbnew) (general (thickness 1.6)) (paper "A4") (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user)) (gr_rect (start 0 0) (end 40 40) (stroke (width 0.1) (type default)) (fill none) (layer "Edge.Cuts") (uuid "outline")))';
const schematic='(kicad_sch (version 20250114) (generator eeschema) (uuid "sheet") (paper "A4") (lib_symbols) (wire (pts (xy 10 10) (xy 20 10)) (stroke (width 0) (type default)) (uuid "wire")))';
const files=[{path:'power.kicad_pcb',source:board},{path:'sheets/power.kicad_sch',source:schematic}];
class Element extends EventTarget{
 constructor(doc,tag){super();this.ownerDocument=doc;this.tag=tag;this.children=[];this.style={};this.attributes={};this.textContent='';}
 append(...nodes){for(const node of nodes){node.remove?.();node.parent=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children.forEach(node=>node.parent=null);this.children=[];this.append(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=null;}
 setAttribute(key,value){this.attributes[key]=String(value);}getAttribute(key){return this.attributes[key]??null;}
}
function fixture(){const doc={baseURI:'https://example.test/',createElement(tag){return new Element(doc,tag);}};const host=new Element(doc,'div');return {host,project:new AdvancedKiCadViewer(host)};}
const mount=globalThis.KiCadOwnedCanvas.mount;
globalThis.KiCadOwnedCanvas.mount=(host,options)=>Object.assign(new EventTarget(),{options,setDocument(design,path){this.design=design;this.path=path;this.visibleLayers=new Set(design.layers||[]);},setNetHighlight(){},setNetNames(){},draw(){},zoom_to_board(){},dispose(){this.disposed=true;}});
test.after(()=>{globalThis.KiCadOwnedCanvas.mount=mount;});

test('project workspace loads complementary saved drawings into independent panes, navigates and disposes',async()=>{
 assert.equal(ProjectViewer,AdvancedKiCadViewer);const {project,host}=fixture();const events=[];project.addEventListener('projectready',e=>events.push(e.detail));
 assert.equal(await project.loadFiles(files),true);assert.equal(project.viewers[0].kind,'pcb');assert.equal(project.viewers[1].kind,'schematic');assert.deepEqual(project.getFiles().map(f=>f.path),files.map(f=>f.path));assert.equal(events.length,1);
 assert.notEqual(project.viewers[0].renderer,project.viewers[1].renderer);
 const first=project.viewers[0].renderer;project.setLayout('single');project.setActivePane(1);assert.equal(project.paneNodes[0].pane.hidden,true);assert.equal(project.paneNodes[1].pane.hidden,false);assert.equal(project.viewers[0].renderer,first);
 await project.openFile('power.kicad_pcb',{pane:1});assert.equal(project.getActiveViewer().kind,'pcb');assert.equal(project.viewers[0].renderer,first);
 await assert.rejects(project.openFile('missing.kicad_sch'),/loaded project/);assert.throws(()=>project.setActivePane(2),/pane/);
 project.setNavigatorOpen(false);assert.equal(project.nav.hidden,true);project.setNavigatorOpen(true);assert.equal(project.nav.hidden,false);
 project.setTheme('light');assert.ok(project.viewers.every(viewer=>viewer.theme==='light'));
 const renderers=project.viewers.map(v=>v.renderer);project.dispose();project.dispose();assert.ok(renderers.every(r=>r.disposed));assert.equal(host.children.length,0);assert.throws(()=>project.getActiveViewer(),/disposed/);new AdvancedKiCadViewer(host).dispose();
});

test('hosted project preserves listed files, supports single drawings and prevents stale/disposed load commits',async()=>{
 const original=globalThis.fetch;const {project}=fixture();
 try{
  globalThis.fetch=async url=>new Response(String(url).endsWith('.kicad_sch')?schematic:board);
  await project.load({files:files.map(file=>({path:file.path,url:'https://example.test/'+file.path}))});assert.equal(project.viewers[1].kind,'schematic');
  let finish;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});const old=project.load('old.kicad_pcb');await project.loadFiles(files);finish(new Response(board));assert.equal(await old,false);assert.equal(project.viewers[0].path,'power.kicad_pcb');
  const pending=project.load('late.kicad_pcb');project.dispose();finish(new Response(board));assert.equal(await pending,false);
 }finally{globalThis.fetch=original;project.dispose();}
});

test('file search and saved child-sheet navigation retain missing links without inventing paths',async()=>{
 const {project}=fixture();await project.loadFiles(files);project.setActivePane(1);project.getActiveViewer().getSheets=()=>[{name:'Power stage',file:'power.kicad_sch',path:'sheets/power.kicad_sch'},{name:'Unavailable',file:'absent.kicad_sch',path:null}];project.setTab('files');
 assert.ok(project.list.children.some(node=>node.textContent==='Unavailable'&&node.disabled));
 project.search.value='power';project.search.oninput();assert.equal(project.list.children.some(node=>node.textContent==='Unavailable'),false);assert.match(project.count.textContent,/2 files/);
 project.setTab('nets');assert.match(project.search.getAttribute('aria-label'),/nets/);project.dispose();
});

test('part cross-probing requires an unambiguous saved relationship and never uses reference alone',()=>{
 const source={kind:'pcb',path:'board.kicad_pcb',getParts:()=>[{id:'p',uuid:'footprint-a',reference:'U1',schematicUuid:'symbol-a'}]},target={kind:'schematic',path:'sheet.kicad_sch',getParts:()=>[{id:'s',uuid:'symbol-a',reference:'U1'}]};
 assert.equal(linkedPart(source,target,{uuid:'pad-a',ownerUuid:'footprint-a'}).id,'s');
 target.getParts=()=>[{id:'s',uuid:'different',reference:'U1'}];assert.equal(linkedPart(source,target,{uuid:'footprint-a'}),null);
 target.getParts=()=>[{id:'s',uuid:'symbol-a'},{id:'s2',uuid:'symbol-a'}];assert.equal(linkedPart(source,target,{uuid:'footprint-a'}),null);
 const a={source:'same source',kind:'pcb',path:'same.kicad_pcb',getParts:()=>[{id:'a',uuid:'fp'}]},b={source:'same source',kind:'pcb',path:'different.kicad_pcb',getParts:()=>[{id:'b',uuid:'fp'}]};assert.equal(linkedPart(a,b,{uuid:'fp'}),null);b.path=a.path;assert.equal(linkedPart(a,b,{uuid:'fp'}).id,'b');
});

test('workspace links loaded components once without recursive selection or reference fallback',async()=>{
 const {project}=fixture();await project.loadFiles(files);let selections=0;
 project.viewers[0].getParts=()=>[{id:'board-part',uuid:'fp',schematicUuid:'symbol'}];project.viewers[1].getParts=()=>[{id:'sheet-part',uuid:'symbol'}];
 project.viewers[1].selectPart=(id,options)=>{selections++;assert.equal(id,'sheet-part');assert.equal(options.locate,false);project.viewers[1].emit('select',{item:{uuid:'symbol'}});return true;};
 project.viewers[0].emit('select',{item:{uuid:'fp'}});assert.equal(selections,1);
 project.linkedSelection=false;project.viewers[0].emit('select',{item:{uuid:'fp'}});assert.equal(selections,1);project.dispose();
});
test('failed project replacement cannot link an old secondary pane to a new partial project',async()=>{
 const {project}=fixture();await project.loadFiles(files);let linked=0;project.viewers[1].selectPart=()=>{linked++;};
 const load=project.viewers[1].loadFiles;project.viewers[1].loadFiles=async()=>{throw Error('secondary failed');};
 await assert.rejects(project.loadFiles(files),/secondary failed/);assert.equal(project.projectReady,false);
 project.viewers[0].getParts=()=>[{id:'a',uuid:'fp',schematicUuid:'sym'}];project.viewers[1].getParts=()=>[{id:'b',uuid:'sym'}];project.viewers[0].emit('select',{item:{uuid:'fp'}});assert.equal(linked,0);
 project.viewers[1].loadFiles=load;project.dispose();
});

test('project view links restore listed drawings and workspace settings against exact saved sources',async()=>{
 const {project}=fixture();await project.loadFiles(files);project.setTheme('light');project.setLayout('single');project.setActivePane(1);project.linkedSelection=false;
 const state=await project.getViewState(),url=await project.createViewLink('https://example.test/advanced.html?project=inverter');assert.match(url,/#kicad-view=/);assert.equal(state.views.length,2);
 await project.openFile('power.kicad_pcb',{pane:1});project.setTheme('dark');project.setLayout('split');project.setActivePane(0);project.linkedSelection=true;
 assert.equal(await project.restoreViewState(state),true);assert.equal(project.viewers[1].path,'sheets/power.kicad_sch');assert.equal(project.viewers[1].view,'schematic');assert.equal(project.theme,'light');assert.equal(project.layout,'single');assert.equal(project.activePane,1);assert.equal(project.linkedSelection,false);assert.equal(project.linkToggle.checked,false);
 const before=project.viewers.map(v=>v.renderer);const outside=structuredClone(state);outside.views[0].path='unlisted.kicad_pcb';await assert.rejects(project.restoreViewState(outside),/outside the loaded project/);assert.deepEqual(project.viewers.map(v=>v.renderer),before);
 const mismatch=structuredClone(state);mismatch.views[0].sha256='0'.repeat(64);await assert.rejects(project.restoreViewState(mismatch),/SHA-256/);assert.equal(project.restoring,false);
 const c=new AbortController();c.abort();await assert.rejects(project.restoreViewState(state,{signal:c.signal}),{name:'AbortError'});assert.equal(project.restoring,false);project.dispose();
});

test('ordinary file navigation cancels pending restoration and keeps cross-selection enabled',async()=>{
 const {project}=fixture();await project.loadFiles(files);const state=await project.getViewState();await project.openFile('power.kicad_pcb',{pane:1});
 const original=project.loadPaneFromProject;let entered=false;
 project.loadPaneFromProject=function(pane,path,options={}){if(path==='sheets/power.kicad_sch'){entered=true;return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true});});}return original.call(this,pane,path,options);};
 const restoring=project.restoreViewState(state);assert.equal(entered,true);assert.equal(project.restoring,true);
 await project.openFile('power.kicad_pcb',{pane:0});assert.equal(await restoring,false);assert.equal(project.restoring,false);assert.equal(project.restorePending,null);
 let linked=0;project.viewers[0].getParts=()=>[{id:'p0',uuid:'fp'}];project.viewers[1].getParts=()=>[{id:'p1',uuid:'fp'}];project.viewers[1].selectPart=()=>{linked++;return true;};
 project.viewers[0].emit('select',{item:{uuid:'fp'}});assert.equal(linked,1);project.loadPaneFromProject=original;project.dispose();
});

test('cancelling from a workspace setting callback stops later active-pane and linkage changes',async()=>{
 const {project}=fixture();await project.loadFiles(files);const state=await project.getViewState();state.layout='single';state.activePane=1;state.linkedSelection=false;
 const controller=new AbortController();project.addEventListener('panechange',()=>controller.abort(),{once:true});
 await assert.rejects(project.restoreViewState(state,{signal:controller.signal}),{name:'AbortError'});
 assert.equal(project.activePane,0);assert.equal(project.linkedSelection,true);assert.equal(project.restoring,false);project.dispose();
});
